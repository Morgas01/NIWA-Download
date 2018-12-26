(function(µ,SMOD,GMOD,HMOD,SC){


	SC=SC({
		adopt:"adopt",
    	File:"File",
    	FileUtils:"File/util",
    	JsonConnector:"DB/jsonConnector",
    	ObjectConnector:"ObjectConnector",
    	es:"errorSerializer",
    	Promise:"Promise",
    	NodePatch:"NodePatch",
    	eq:"equals",
    	flatten:"flatten",
    	rescope:"rescope",
    	flatten:"flatten",
    	ServiceResult:"ServiceResult",
    	niwaWorkDir:"niwaWorkDir"
    });
    
    µ.shortcut({
		Download:require.bind(null,"../lib/Download"),
    	prepareItems:require.bind(null,"../lib/prepareItems")
    },SC);

    let delegateID=0;
    let delegateMap=new Map();

    let delegateDownload=function(context,download,onUpdate,manager)
    {
    	let delegateInfo={
    		context:context,
    		ID:delegateID++,
    		onUpdate:onUpdate,
    		manager:manager
    	};
    	delegateMap.set(delegateInfo.ID,delegateInfo);
    	let p=worker.ask(context,"receiveDownload",{
    		ID:delegateInfo.ID,
    		download:download,
    		objectType:download.objectType
		});
    	p.catch(()=>delegateMap.delete(delegateInfo.ID));
    	return p;
    }
    worker.updateDelegatedDownload=function(update,context)
	{
		let delegateInfo=delegateMap.get(update.remoteID);

		if(!delegateInfo) µ.logger.error("no delegate info");
		else if(delegateInfo.context!=context) µ.logger.error("wrong delegate app");
		else
		{
			update.ID=update.remoteID;
			delete update.remoteID;
			delete update.context;
			delete update.packageID;
			delegateInfo.onUpdate.call(delegateInfo.manager,update);
			if(update.state!==SC.Download.states.RUNNING) delegateMap.delete(update.ID);
		}
	}

	let rotateErrorMapper=function(rotateError)
	{
		return {error:SC.es(rotateError.error),file:rotateError.file.getAbsolutePath()}
	};

	/**
	 * This class provides some basic methods to handle downloads.
	 * It provites a Rest api unter .serviceMethods {@link SERVICEMETHODS} which the downloadTable.js accesses.
	 */
	let MANAGER=module.exports=µ.Class({
		constructor:function(options)
		{
			SC.rescope.all(this,["isDownloadNotRunning","receiveDownload","_trigger","fetchSubPackages"]);
			options=SC.adopt({
				eventName:"downloads",
				DBClassDictionary:[],// standard Download and Package is always added
				storagePath:"downloads.json", // set to false to disable persistance
				jsonConnectorParam:null,
				accept:null, // function(download,context) to accept downloads from other apps; returns true or a Promise resolving to true to accept
				filter:null, // function(running[],download) to determinate if download is ready to download NOW; returns true or a Promise resolving to true to start download
				download:null, // function(signal,download) to actually download the file; resolve or reject the signal to conclude the download
				maxDownloads:0, // n<=0 no restriction
				autoTriggger:false // trigger downloads automatic
			},options);

			options.jsonConnectorParam=SC.adopt({
				fileRotation:10
			},options.jsonConnectorParam);

			this.eventName=options.eventName;
			this.DBClassDictionary=[SC.Download,SC.Download.Package].concat(options.DBClassDictionary)
			// array to map
			.reduce((d,c)=>(d[c.prototype.objectType]=c,d),{});

			this.runningDownloadMap=new Map();
			this.serviceMethods={};
			for (let key in SERVICEMETHODS)
			{
				this.serviceMethods[key]=SC.rescope(SERVICEMETHODS[key],this);
			}
			this.dbErrors=[];

			if(options.dbConnector)
			{
				if (SC.Promise.isThenable(options.dbConnector)) this.dbConnector=options.dbConnector
				else this.dbConnector=Promise.resolve(options.dbConnector);
			}
			if(!options.storagePath) this.dbConnector=Promise.resolve(new SC.ObjectConnector());
			else
			{
				let storageFile=new SC.File(SC.niwaWorkDir).changePath("work/"+worker.context).changePath(options.storagePath);
				this.dbConnector=SC.FileUtils.enshureDir(storageFile.clone().changePath("..")).then(()=>
				{
					let dbErrors=this.dbErrors;
					return new SC.JsonConnector(storageFile,options.jsonConnectorParam).open
					.then(function(result)
					{
						if(result.others.length>0)
						{
							dbErrors=result.others.map(rotateErrorMapper);
							dbErrors.push({file:result.file.getAbsolutePath(),error:"loaded"});
							µ.logger.warn({errors:dbErrors},"errors loading file "+result.file.getAbsolutePath());
						}
						return this;//connector
					},
					function(errors)
					{
						if(errors.length==0)
						{// no files
							//errors.push({file:storageFile,error:"file not found"});
							return this;
						}
						Array.prototype.push.apply(dbErrors,errors.map(rotateErrorMapper));
						dbErrors.push({file:null,error:"could not load any DB file"});
						µ.logger.warn({errors:dbErrors},"could not load any DB file");

						return this;//connector
					});
				});
				this.dbConnector.catch((error)=>
				{
					this.dbErrors.push(SC.es(error));
					µ.logger.error({error:error},"error opening downloads DB");
				});
			}

			this.notify=worker.eventSource(this.eventName,()=>
				this.dbConnector.then(dbc=>
				{
					let dict=dbc.db.getGroupValues("objectType");
					for (let type in dict)
					{
						dict[type]=dict[type].map(o=>o.fields);
					}
					return dict;
				})
			);

			if(options.download) this.download=options.download;
			if(options.filter) this.isDownloadReady=options.filter;

			if(options.accept)
			{
				this.accept=options.accept;
				worker.receiveDownload=this.receiveDownload;
			}

			this.setMaxDownloads(options.maxDownloads);
			this.setAutoTrigger(options.autoTriggger);
		},
		setAutoTrigger:function(trigger)
		{
			this.autoTriggger=!!trigger;
			this._trigger();
		},
		getAutoTrigger:function(){return this.autoTriggger},
		setMaxDownloads:function(maxDownloads)
		{
			this.maxDownloads=maxDownloads>0?maxDownloads:0;
			this._trigger();
		},
		getMaxDownloads:function(){return this.maxDownloads},
		notify:null, //eventSource in init
		loadDictionary:function(dict)
		{
			return this.dbConnector.then(dbc=>
				Promise.all(
					Object.entries(dict).map(([type,ids])=>
						dbc.load(this.DBClassDictionary[type],{ID:ids})
					)
				)
			)
			.then(SC.flatten);
		},
		loadClassIDs:function(classIDs)
		{
			return this.dbConnector.then(dbc=>
				Promise.all(
					classIDs.map(classID=>
						dbc.load(this.DBClassDictionary[classID.objectType],{ID:classID.ID})
					)
				)
			)
			.then(SC.flatten);
		},
    	add:function(downloads)
    	{
    		if(!Array.isArray(downloads)) downloads=[downloads];
    		//TODO  set orderIndex
    		return this.dbConnector.then(function(dbc)
			{
				return dbc.save(downloads);
			}).then(()=>
			{
				this.dbErrors.length=0;
				this.notify("add",SC.prepareItems.toDictionary(downloads,false));
				this._trigger();
				return true;
			})
			.catch(error=>
			{
				error={error:SC.es(error),file:this.file.getAbsolutePath()};
				µ.logger.error(error,"failed to add downloads");
				this.dbErrors.push(error);
				return Promise.reject(error);
			});
    	},
    	addWithPackage:function(packageClass,packageName,downloads)
    	{
    		return this.createPackage(packageClass,packageName,downloads);
    	},
    	createPackage:function(packageClass,packageName,items,parent)
    	{
    		let package=new packageClass();
    		package.name=packageName;

    		if(parent) parent.addChild("subPackages",package);

    		return this.dbConnector.then(dbc=>
    		{
    			let p=dbc.save(package)
				.then(()=>
				{
					this.notify("add",SC.prepareItems.toDictionary([package],false));
				});
				if(items&&items.length>0)
				{
					p=p.then(()=>
					{
						let wasPersisted=new Map()
						items.forEach((d,i)=>
						{
							d.orderIndex=i;
							d.setParent("package",package);
							wasPersisted.set(d,d.ID!=null);
						});
						return dbc.save(items).then(()=>
						{
							let hasNewItems=false;
							items.forEach(d=>
							{
								if(wasPersisted.get(d)) this.notify("move",{
									parent:SC.prepareItems.toClassID(package),
									items:SC.prepareItems.toClassIDs([d]),
								});
								else
								{
									this.notify("add",SC.prepareItems.toDictionary([d],false));
									hasNewItems=true;
								}
							});
							if(hasNewItems) this._trigger();
						});
					});
				}
				return p;
			});
    	},
    	moveTo:function(package,items,keepOrder)
    	{
    		return this.fetchParentPackages(package) //get parents until "root"
    		.then(()=> //generate parentUIDs
    		{
    			let parentUIDs=[];
    			let parent=package;
    			while(parent!=null)
    			{
    				parentUIDs.push(parent.objectType+","+parent.ID);
    				parent=parent.getParent("package");
    			}
    			return parentUIDs;
    		})
    		.then(parentUIDs=>items.filter(i=>parentUIDs.indexOf(i.objectType+","+i.ID)==-1)) // filter items that are parents of package
    		.then(items=>
    		{
				for(let item of items)
				{
					item.setParent("package",package||null);
					if(!keepOrder) item.orderIndex=null;
				}
				//TODO if(!keepOrder) sort
				return this.dbConnector.then(dbc=>dbc.save(items))
				.then(()=>
				{
					this.notify("move",{
						parent:SC.prepareItems.toClassID(package),
						items:SC.prepareItems.toClassIDs(items),
					});
					this._trigger();
				});
			});
    	},
    	sort:function(items)
    	{
    		if(!items||!(items.length>0)) return Promise.reject("no items");

    		let sameParent=items.slice(1).find(i=>!(i.packageID==items[0].packageID))===undefined;
    		if(!sameParent) return Promise.reject("not same parent");

    		items.forEach((item,index)=>
    		{
    			item.orderIndex=index;
    		});

    		return this.dbConnector.then(dbc=>dbc.save(items))
    		.then(()=>
    		{
    			this.notify("sort",SC.prepareItems.toClassIDs(items));
    			return true;
    		})
    	},
    	changeState:function(idDictionary,expectedState,newState)
    	{
    		let isPending=(newState===SC.Download.states.PENDING)
    		return this.dbConnector.then(dbc=>
    			Promise.all(Object.keys(idDictionary)
    				.map(type=>dbc.load(this.DBClassDictionary[type],{ID:idDictionary[type],state:expectedState}))
    			)
				.then(SC.flatten)
				.then(downloads=>
				{
					for(let download of downloads)
				 	{
				 		download.state=newState;
				 		if(isPending)download.clearMessages();
				 	}
					return dbc.save(downloads).then(()=>
					{
						this.notify("update",SC.prepareItems.toDictionary(downloads,false));
						if(isPending) this._trigger();
					});
				})
    		);
    	},
    	delete:function(patternDictionary)
    	{
    		return this.dbConnector.then(dbc=>
    		{
				let filteredItems=Object.keys(patternDictionary)
				.map(type=>
				{
					// load items
					let dbClass=this.DBClassDictionary[type];
					let loading=dbc.load(dbClass,patternDictionary[type]);

					if(dbClass.prototype instanceof SC.Download||dbClass==SC.Download) //filter downloads
						loading=loading.then(downloads=>downloads.filter(this.isDownloadNotRunning));

					else if(dbClass.prototype instanceof SC.Download.Package||dbClass==SC.Download.Package) // filter & flatten packages
						loading=loading.then(packages=>this.fetchSubPackages(packages)
						.then(()=>packages.map(p=>
						{
							let toDelete=new Set();
							SC.NodePatch.traverse(p,package=>
							{
								let isRunning=false;
								for(let download of package.getChildren("children"))
								{
									if(!this.isDownloadNotRunning(download)) isRunning=true;
									else toDelete.add(download);
								}
								if(!isRunning) toDelete.add(package);
								else
								{
									let parent=package;
									while(parent=parent.getParent("package")) toDelete.delete(parent);
								}
							},parent=>parent.getChildren("subPackages"));
							return Array.from(toDelete);
						}))
						.then(SC.flatten)
					);
					return loading;
				});
				return Promise.all(filteredItems)
				.then(deletion=>Array.prototype.concat.apply(Array.prototype,deletion))//flatten
				.then(items=>SC.prepareItems.toDictionary(items,true))
				.then(dict=>
				{
					let deletions=Object.keys(dict)
					.map(type=>dbc.delete(this.DBClassDictionary[type],dict[type])
						.then(result=>[type,result])
					);
					return Promise.all(deletions);
				})
				.then(results=>
				{
					let rtn={};
					for(let result of results)
					{
						rtn[result[0]]=result[1];
					}
					this.notify("delete",rtn);
					return rtn;
				});
			});
    	},
    	fetchSubPackages:function(packages)
    	{
    		if(!packages.length) return Promise.resolve();
    		return this.dbConnector.then(dbc=>
    			Promise.all(packages.map(p=>
    				Promise.all([
    					dbc.loadChildren(p,"children"),
    					dbc.loadChildren(p,"subPackages").then(this.fetchSubPackages)
					])
				))
			)
    	},
    	fetchParentPackages:function(package)
    	{
    		if(!package) return Promise.resolve();
    		return this.dbConnector.then(dbc=>dbc.loadParent(package,"package").then(p=>this.fetchParentPackages(p)));
    	},
    	updateDownload:function(download)
    	{
    		if(!download.startTime) download.startTime=Date.now();
    		download.time=Date.now();
    		let data=download.toUpdateJSON();
    		this.notify("update",{[download.objectType]:[data]});
    		if (download.context)
    		{
    			worker.ask(download.context,"updateDelegatedDownload",data)
    			.catch(e=>µ.logger.error({error:e},"updateDelegatedDownload failed"));
    		}
    	},
    	isDownloadReady:µ.constantFunctions.t,
    	isDownloadNotRunning:function(download)
    	{
    		for(let running of this.runningDownloadMap.keys())
    		{
    			if(running.objectType===download.objectType &&
    				running.ID===download.ID &&
					running.remoteID===download.remoteID
					) return false;
    		}
    		return true;
    	},
    	startDownload:function(download)
    	{
    		let args=Array.from(arguments);
    		µ.logger.debug("startDownload",download.name);
    		if(!this.isDownloadNotRunning(download)) return Promise.reject("download already running");

    		return trueOrReject(this.isDownloadReady(Array.from(this.runningDownloadMap.keys()),...args))
    		.then(()=>{
    			if(download.ID==null)
    			{
					return this.dbConnector.then(function(dbc)
					{
						return dbc.save(download);
					});
				}
    		})
    		.then(()=>
    		{
				download.state=SC.Download.states.RUNNING;
				this.updateDownload(download);
				let runningInfo={promise:null};
				this.runningDownloadMap.set(download,runningInfo);
				runningInfo.promise=new SC.Promise(this.download,{args:args,scope:this});
				runningInfo.promise.then(function()
				{
					if(download.state==SC.Download.states.RUNNING)
					{
						µ.logger.warn({download:download},"download was still in running state when finished");
						download.state=SC.Download.states.DISABLED;
					}
				},
				function(error)
				{
					µ.logger.error({error:error},"download failed");
					error=SC.es(error);
					download.addMessage("Error:\n"+JSON.stringify(error,null,"\t"));
					download.state=SC.Download.states.FAILED;
				})
				.then(()=>
				{
					this.runningDownloadMap.delete(download);
					this.dbConnector.then(dbc=>
					{
						let p;
						if(download.context)
						{
							p=dbc.delete(this.DBClassDictionary[download.objectType],[download]).catch(e=>µ.logger.error({error:e},"failed to delete completed delegate download"));
							this.notify("delete",SC.prepareItems.toDictionary([download]));
						}
						else p=dbc.save(download).catch(e=>µ.logger.error({error:e},"failed to save completed download"));
						this.updateDownload(download);
						p.then(this._trigger);
					});
				});
				return true;
    		});
    	},
    	receiveDownload:function(data,context)
    	{
			data.context=context;
			data.download.remoteID=data.ID;
			data.download.context=context;
			delete data.download.ID;
			delete data.download.packageID;
			let downloadClass=this.DBClassDictionary[data.objectType];
			if(!downloadClass) return Promise.reject("unknown class: "+data.download.objectType);
			let download=new downloadClass();
			download.fromJSON(data.download);

			return trueOrReject(this.accept(download,context))
			.then(()=>this.add([download]))
			.then(()=>this.startDownload(download));
    	},
    	delegateDownload:function(context,download,onUpdate)
    	{
    		return delegateDownload(context,download,onUpdate,this);
    	},
    	_trigger:function()
    	{
    		µ.logger.debug("_trigger");
    		if(!this.autoTriggger) return Promise.resolve();
    		if(this.maxDownloads!=0&&this.runningDownloadMap.size>=this.maxDownloads) return Promise.resolve();
    		//TODO queue?
    		let dbClasses=Object.keys(this.DBClassDictionary).map(key=>this.DBClassDictionary[key])
    		return this.dbConnector.then(async dbc=>
    		{
    			//load all dbClasses on root
    			let data=SC.flatten(await Promise.all(dbClasses.map(dbClass=>dbc.load(dbClass,{packageID:SC.eq.unset()}))));
				let sortedData=data.sort(SC.Download.sortByOrderIndex);
				try
				{
					let results = await SC.Promise.chain(sortedData,(item,index)=>
					{
						if(item instanceof SC.Download)
						{
							if(item.state!==SC.Download.states.PENDING) return "download not pending";
							if(!this.isDownloadNotRunning(item)) return "download is running";

							return SC.Promise.reverse(this.startDownload(item),item);

						}
						else
						{
							return Promise.all([
								dbc.loadChildren(item,"children"),
								dbc.loadChildren(item,"subPackages")
							]).then(function()
							{
								sortedData.splice(index+1,0,...item.getItems()); //insert sub items as next items
								return "loaded sub items";
							},
							function(error)
							{
								µ.logger.error({error:error},"error loading sub items");
								return error;
							});
						}
					});
					µ.logger.debug({results:results},"could not trigger download");
				}
				catch(e)
				{
					if(e instanceof SC.Download)
					{
						µ.logger.info("triggered download "+e.name);
						this._trigger();
					}
					else return Promise.reject(e);
				}
    		});
    	}
	});

    let checkRequest=function(param,expectedMethod)
    {
    	if(param.method!==expectedMethod)
    	{
    		return Promise.reject(new SC.ServiceResult({data:`only "${expectedMethod}" allowed`,status:405}));
    	}
    	if (!param.data)
    	{
    		return Promise.reject(new SC.ServiceResult({data:"no data was send",status:400}));
    	}
    	return Promise.resolve(param.data);
    };
	let trueOrReject=function(value)
	{
		if (SC.Promise.isThenable(value))
		{
			return value.then(function(value)
			{
				if(value===true) return true;
				return Promise.reject(value);
			});
		}
		else if(value===true) return Promise.resolve(true);
		return Promise.reject(value);
	}

    // [this] is a Manager instance
	let SERVICEMETHODS={
		errors:function()
		{
			return this.dbErrors;
		},
		add:function(param)
		{
			return checkRequest(param,"POST")
			.then(data=>
			{
				let downloads=SC.prepareItems.fromDictionary(data,this.DBClassDictionary);
				return this.add(downloads);
			});
		},
		addWithPackage:function(param)
		{
			return checkRequest(param,"POST")
			.then(data=>
			{
				let packageClass=this.DBClassDictionary[data.packageClass||"Package"];
				if(!packageClass) throw "unknown package class: "+data.packageClass;
				let downloads=SC.prepareItems.fromDictionary(data.downloads,this.DBClassDictionary);

				return this.addWithPackage(packageClass,data.packageName,downloads);
			});
		},
		delete:function(param)
		{
			return checkRequest(param,"DELETE")
			.then(data=>
			{
				let patterns={};
				for(let type in data) patterns[type]={ID:data[type]};
				return this.delete(patterns);
			});
		},
		disable:function(param)
		{
			return checkRequest(param,"PUT")
			.then(data=>
			{
				return this.changeState(data,SC.Download.states.PENDING,SC.Download.states.DISABLED);
			});
		},
		enable:function(param)
		{
			return checkRequest(param,"PUT")
			.then(data=>
			{
				return this.changeState(data,SC.Download.states.DISABLED,SC.Download.states.PENDING);
			});
		},
		reset:function(param)
		{
			return checkRequest(param,"PUT")
			.then(data=>
			{
				return this.changeState(data,[SC.Download.states.DONE,SC.Download.states.FAILED],SC.Download.states.PENDING);
			});
		},
		createPackage:function(param)
		{
			return checkRequest(param,"POST")
			.then(data=>
			{
				let packageClass=this.DBClassDictionary[data.packageClass||"Package"];
				if(!packageClass) throw "unknown package class: "+data.packageClass;

				return this.loadDictionary(data.items)
				.then(items=>
				{
					let p;
					if(items.length==0) p=Promise.resolve();
					else p=this.dbConnector.then(dbc=>dbc.loadParent(items[0],"package"));
					return p.then(package=>this.createPackage(packageClass,data.name,items,package));
				});
			});
		},
		moveTo:function(param)
		{
			return checkRequest(param,"PUT")
			.then(data=>
			{
				if(!data.items||Object.keys(data.items).length==0) return Promise.reject("no items selected");
				return new SC.Promise([
					!data.target?null:this.loadClassIDs([data.target]).then(t=>t[0],function(e)
					{
						µ.logger.error(e);
						return null;
					}),
					this.loadDictionary(data.items)
				])
				.then((package,items)=>this.moveTo(package,items));
			});
		},
		sort:function(param)
		{
			return checkRequest(param,"PUT")
			.then(data=>
			{
				if(!data||Object.keys(data).length==0) return Promise.reject("no items selected");
				return this.loadClassIDs(data).then(items=>this.sort(items));
				/*
				let dbClasses=Object.keys(this.DBClassDictionary).map(key=>this.DBClassDictionary[key]);
				let loadPattern={packageID:data.packageID!=null?data.packageID:SC.eq.unset()};

				return this.dbConnector.then(dbc=>Promise.all(dbClasses.map(c=>dbc.load(c,loadPattern))))
				.then(downloads=>Array.prototype.concat.apply(Array.prototype,downloads))//flatten
				.then(function(items)
				{
					items.sort(SC.Download.sortByOrderIndex);
					let sortingItems=items.slice();
					let index=0;
					for (let sortItem of data.items)
					{
						for(let i=0;i<sortingItems.length;i++)
						{
							if(sortingItems[i].ID==sortItem.ID&&sortingItems[i].objectType===sortItem.objectType)
							{
								sortingItems[i].orderIndex=index++;
								sortingItems.splice(i,1);
								break;
							}
						}
					}
					for(let unsortedItem of sortingItems)
					{
						unsortedItem.orderIndex=index++;
					}
					return items;
				})
				.then(sortedItem=>
				{
					return this.dbConnector.then(dbc=>dbc.save(sortedItem))
					.then(()=>this.notify("sort",SC.prepareItems.toClassIDs(sortedItem)));
				});*/
			});
		},
		autoTrigger:function(param)
		{
			if(param.method==="GET") return this.autoTriggger;
			else if (param.method==="POST")
			{
				this.setAutoTrigger(param.data);
				return Promise.resolve();
			}
			else
			{
				return Promise.reject(new SC.ServiceResult({data:"only POST or GET method is allowed",status:405}));
			}
		}
	};

	SMOD("NIWA-Download.Manager",MANAGER);

})(Morgas,Morgas.setModule,Morgas.getModule,Morgas.hasModule,Morgas.shortcut);