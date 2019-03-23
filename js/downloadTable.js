(function(µ,SMOD,GMOD,HMOD,SC){

	let StateEvent=GMOD("StateEvent");

	SC=SC({
		TreeTable:"gui.TreeTable",
		Config:"gui.TreeTableConfig.Select",
		Download:"NIWA-Download.Download",
		rs:"rescope",
		DBObj:"DBObj",
		Org:"Organizer",
		prepareItems:"NIWA-Download.prepareItems",
		arrayRemove:"array.remove",
		rq:"request",
		adopt:"adopt",
		dlg:"gui.Dialog",
		stree:"gui.Tree.Select",
		TableConfig:"gui.TableConfig.Select",
		Table:"gui.Table",
		ReporterPatch:"EventReporterPatch"
	});

	let orderByIndex=(a,b)=>
	{
		let ai=a.orderIndex;
		let bi=b.orderIndex;
		if(ai==null)
		{
			if(bi==null) return 0;
			return 1;
		}
		if(bi==null) return -1;
		return ai-bi;
	};

	/**
	 * base column name sets the data-state attribute of the row.
	 * If you omit this column you have to set it manually.
	 */
	let DownloadTable=µ.Class({
		constructor:function(columns,options)
		{
			new SC.ReporterPatch(this,[DownloadTable.SpeedStateEvent,DownloadTable.SizeStateEvent,DownloadTable.TotalSizeStateEvent]);

			columns=(columns||Object.keys(DownloadTable.baseColumns)).map(c=>(c in DownloadTable.baseColumns)?DownloadTable.baseColumns[c]:c) //map strings to baseColumn function

			this.options=SC.adopt({
				apiPath:"rest/downloads",
				eventName:"downloads",
				DBClasses:[] // download && package
			},options);

			this.options.DBClasses.unshift(SC.Download,SC.Download.Package);
			this.options.DBClasses=this.options.DBClasses.reduce((d,c)=>(d[c.prototype.objectType]=c,d),{}); //translate array into dictionary

			this.treeTable=new SC.TreeTable(new SC.Config(columns,{childrenGetter:i=>i.getItems(),control:true}));
			this.element=this.treeTable.getTable();
			this.element.classList.add("downloadTable");

			this.organizer=new SC.Org();
			this.organizer.filter("roots",obj=>obj.packageID==null,f=>f.sort("orderIndex",orderByIndex))
			.group("class","objectType",sub=>sub.map("ID","ID"))
			.filter("statistics",obj=>obj instanceof SC.Download,f=>f.group("state","state"));

			this.reportEvent(new DownloadTable.SpeedStateEvent({current:0,average:0}));

			this.connect();
		},
		connect:function()
		{
			this.eventSource=new EventSource("event/"+this.options.eventName);
			window.addEventListener("beforeunload",()=>this.eventSource.close());

			for(let [name,fn] of Object.entries(this.eventHandles))
			{
				this.eventSource.addEventListener(name,SC.rs(fn,this));
			}

			this.eventSource.addEventListener("ping",µ.logger.debug);
		},
		eventHandles:{
			"error":function(error)
			{
				if(this.eventSource.readyState==EventSource.CLOSED) alert("connection lost");
				µ.logger.error(error);
			},
			"init":function(event)
			{
				this.treeTable.clear();
				this.organizer.clear();

				µ.logger.debug("downloadEvent init:",event);
				let data=JSON.parse(event.data);
				let items=SC.prepareItems.fromDictionary(data,this.options.DBClasses);
				SC.DBObj.connectObjects(items);
				this.organizer.addAll(items);

				this.organizer.getFilter("roots").getSort("orderIndex")
				.forEach(entry=>this.treeTable.add(entry));

				this._updateSize();
			},
			"add":function(event)
			{
				µ.logger.debug("downloadEvent add:",event);
				let data=JSON.parse(event.data);
				let items=SC.prepareItems.fromDictionary(data,this.options.DBClasses);
				this.organizer.add(items);
				items.forEach(item=>
				{
					if(item.packageID!=null)
					{
						let parent=this.findByClassID(item.relations["package"].relatedClass.prototype.objectType,item.packageID);
						parent.connectObjects([item]);
					}
					this.treeTable.add(item,item.getParent("package"));
				});

				this._updateSize();
			},
			"delete":function(event)
			{
				µ.logger.debug("downloadEvent delete:",event);
				let data=JSON.parse(event.data);
				let items=[];
				for(let type in data) for(let ID of data[type]) items.push(this.findByClassID(type,ID));
				this.organizer.remove(items);
				items.forEach(i=>this.treeTable.remove(i));
			},
			"update":function(event)
			{
				µ.logger.debug("downloadEvent update:",event);
				let data=JSON.parse(event.data);
				let items=[];
				for(let type in data)
				{
					for(let entry of data[type])
					{
						let item=this.findByClassID(type,entry.ID);
						if(!item)
						{
							µ.logger.error(`could not find item ${type} with id ${entry.ID}`);
							continue;
						}
						item.fromJSON(entry);
						items.push(item);
					}
				}
				let parents=new Set(items);
				for(let child of parents)
				{
					let parent=child.getParent("package")
					if(parent) parents.add(parent);
					this.treeTable.update(child);
				}
				this.organizer.update(parents);

				// update stateListener
				let running=this.organizer.getFilter("statistics").getGroupPart("state",SC.Download.states.RUNNING);
				if(running)
				{
					let state=running.getValues().reduce((obj,download)=>
					{
						obj.current+=download.getCurrentSpeed();
						obj.average+=download.getSpeed();
						return obj;
					},
					{current:0,average:0}
					);
					this.reportEvent(new DownloadTable.SpeedStateEvent(state));
				}
				this._updateSize();
			},
			"move":function(event)
			{
				µ.logger.debug("downloadEvent move:",event);
				let data=JSON.parse(event.data);
				let items=data.items.map(d=>this.findByClassID(d.objectType,d.ID));
				let parent=null;
				let parentRow=null;
				if(data.parent)
				{
					parent=this.findByClassID(data.parent.objectType,data.parent.ID);
					parentRow=this.treeTable.change(parent);
				}

				let rows=items.map(item=>
				{
					let row=this.treeTable.change(item);
					row.remove();
					let oldParent=item.getParent("package");
					let oldParentRow=this.treeTable.change(oldParent);
					if(oldParent)
					{
						oldParent.removeChild("children",item);
						SC.arrayRemove(oldParentRow.treeChildren,row);
					}
					if(parent)
					{
						parent.addChild("children",item);
						parentRow.treeChildren.push(row);
					}
					else
					{
						item.setParent("package",null);
						this.treeTable.tableBody.appendChild(row);
					}

					//TODO change indent
					return row;
				});

				this.organizer.update(items);
				if(parent)
				{
					if(parentRow.isExpanded())
					{
						parentRow.expand(false);
						parentRow.expand(true);
					}
				}
				else
				{
					rows.forEach(row=>
					{
						if(row.isExpanded())
						{
							row.expand(false);
							row.expand(true);
						}
					});
				}
			},
			"sort":function(event)
			{
				µ.logger.debug("downloadEvent sort:",event);
				let data=JSON.parse(event.data);
				let items=data.map(d=>this.findByClassID(d.objectType,d.ID));
				let parent=items[0].getParent("package");

				for(let i=0;i<items.length;i++) items[i].orderIndex=i;
				this.organizer.update(items);

				if(parent)
				{
					let parentRow=this.treeTable.change(parent);
					let wasExpanded=parentRow.isExpanded();
					parentRow.expand(false);
					parentRow.treeChildren=items.map(i=>this.treeTable.change(i));
					if(wasExpanded)
					{
						parentRow.expand(true);
					}
				}
				else
				{
					items.forEach(item=>
					{
						let row=this.treeTable.change(item);
						this.treeTable.tableBody.appendChild(row);
						if(row.isExpanded())
						{
							row.expand(false);
							row.expand(true);
						}
					});
				}
			}
		},
		_updateSize:function()
		{
			let states=this.organizer.getFilter("statistics").getGroupValues("state");

			let sizeEvent={
				total:0,
				states:{}
			};
			let totalSizeEvent={
				total:0,
				states:{}
			};
			for(let state of Object.values(SC.Download.states))
			{
				let size=0;
				let totalSize=0;
				if(state in states)
				{
					size=states[state].reduce((a,b)=>a+b.size,0);
					totalSize=states[state].reduce((a,b)=>a+b.filesize,0);
				}
				sizeEvent.total+=size;
				totalSizeEvent.total+=totalSize;
				sizeEvent.states[state]=size;
				totalSizeEvent.states[state]=totalSize;
			}
			this.reportEvent(new DownloadTable.SizeStateEvent(sizeEvent));
			this.reportEvent(new DownloadTable.TotalSizeStateEvent(totalSizeEvent));
		},
		findByClassID:function(objectType,ID)
		{
			if(objectType==null||ID==null) return null;
			return this.organizer.getGroupPart("class",objectType).getMap("ID")[ID];
		},
		apiCall:function(apiMethod,data,httpMethod="POST")
		{
			return SC.rq({
				url:this.options.apiPath+"/"+apiMethod,
				data:JSON.stringify(data),
				method:httpMethod
			});
		},
		add:function(downloads)
		{
			return this.apiCall("add",SC.prepareItems.toDictionary(downloads,false));
		},
		addWithPackage:function(packageName,packageClass="Package",downloads)
		{
			return this.apiCall("addWithPackage",{
				packageName:packageName,
				packageClass:packageClass,
				downloads:SC.prepareItems.toDictionary(downloads,false)
			});
		},
		createPackage:function(name,items=[],packageClass=Package)
		{
			return this.apiCall("createPackage",{
				name:name,
				items:SC.prepareItems.toDictionary(items,false),
				packageClass:packageClass,
			});
		},
		getSelected:function()
		{
			return this.treeTable.getSelected();
		},
		autoTrigger:function(nextState)
		{
			return this.apiCall("autoTrigger",!!nextState);
		},
		trigger:function(items)
		{
			if(!Array.isArray(items)) items=[items];
			this.apiCall("trigger",SC.prepareItems.toDictionary(items));
		},
		triggerSelected:function()
		{
			let selected=this.getSelected();
			if(selected.length==0) return Promise.resolve();
			return this.trigger(selected);
		},
		remove:function(items)
		{
			return this.apiCall("delete",SC.prepareItems.toDictionary(items),"DELETE");
		},
		removeSelected:function()
		{
			let selected=this.getSelected();
			if(selected.length==0) return Promise.resolve();
			return this.remove(selected);
		},
		disable:function(items)
		{
			return this.apiCall("disable",SC.prepareItems.toDictionary(items),"PUT");
		},
		disableSelected:function()
		{
			let selected=this.getSelected();
			if(selected.length==0) return Promise.resolve();
			return this.disable(selected);
		},
        reset:function(items)
        {
        	return this.apiCall("reset",SC.prepareItems.toDictionary(items),"PUT");
        },
        resetSelected:function()
        {
        	let selected=this.getSelected();
			if(selected.length==0) return Promise.resolve();
			return this.reset(selected);
        },
        enable:function(items)
        {
        	return this.apiCall("enable",SC.prepareItems.toDictionary(items),"PUT");
        },
        enableSelected:function()
        {
        	let selected=this.getSelected();
			if(selected.length==0) return Promise.resolve();
			return this.enable(selected);
        },
        abort:function(items)
        {
        	return this.apiCall("abort",SC.prepareItems.toDictionary(items),"PUT");
        },
        abortSelected:function()
        {
        	let selected=this.getSelected();
			if(selected.length==0) return Promise.resolve();
			return this.abort(selected);
        },
        moveTo:function(items,target)
        {
        	return this.apiCall("moveTo",{
				target:SC.prepareItems.toClassID(target),
				items:SC.prepareItems.toDictionary(items)
			},"PUT");
        },
        move:function(items)
        {
        	return DownloadTable.moveDialog(items,this.organizer.getFilter("roots").getSort("orderIndex"))
        	.then(target=>this.moveTo(items,target));
        },
        moveSelected:function()
        {
        	let selected=this.getSelected();
			if(selected.length==0) return Promise.resolve();
			return this.move(selected);
        },
        sort:function(package,items)
        {
        	return this.apiCall("sort",SC.prepareItems.toClassIDs(items),"PUT");
        },
        sortPackage:function(package)
        {
        	let items;
        	if(package) items=package.getItems();
        	else items=this.organizer.getFilter("roots").getSort("orderIndex");

        	return DownloadTable.sortDialog(items)
        	.then(items=>this.sort(package,items));
        },
        sortSelected:function()
        {
        	let selected=this.getSelected().find(i=> i instanceof SC.Download.Package);
        	return this.sortPackage(selected);
        }
	});

	let dateHelper=new Date();
	let getTimeString=function(time)
	{
		dateHelper.setTime(time||0)
		return ("0"+dateHelper.getUTCHours()).slice(-2)+":"+("0"+dateHelper.getUTCMinutes()).slice(-2)+":"+("0"+dateHelper.getUTCSeconds()).slice(-2);
	};
	DownloadTable.baseColumns={
		"icon":function(cell,data)
		{
			cell.classList.add(data instanceof SC.Download?"download":"package");
		},
		"name":function(cell,data)
		{
			cell.textContent=data.name;
			cell.parentNode.dataset.state=data.state;
		},
		"filepath":function filepath(cell,data)
		{
			let div=cell.children[0];
			if(!div)
			{
				div=document.createElement("DIV");
				cell.appendChild(div);
			}
			if(data.filepath)
			{
				let sep=(data.filepath.match(/[\\\/]/)||"/")[0];
				div.textContent=data.filepath+sep+data.filename;
			}
			else div.textContent=data.filename||"";
		},
		"messages":function messages(cell,data)
		{
			if(!data.messages) return;
			if(data.messages.length==0) cell.textContent="";
			else if(data.messages.length>0) cell.textContent=data.messages[data.messages.length-1].text;
			cell.dataset.title=data.messages.map(msg=>
			{
				dateHelper.setTime(msg.time);
				return dateHelper.toLocaleTimeString()+" "+ msg.text;
			}).join("\n");
		},
		"filesize":function filesize(cell,data)
		{
			cell.textContent=data.formattedFilesize
		},
		"progress":function progress(cell,data)
		{
			if(cell.children.length==0)
			{
				cell.innerHTML=String.raw
`<div class="progress-wrapper">
<div class="progress"></div>
</div>`
				;
			}
			let percentage=data.size/data.filesize*100;
			cell.firstElementChild.firstElementChild.style.width=percentage+"%";
			cell.dataset.title=percentage.toFixed(2)+"%";

		},
		"speed":function speed(cell,data)
		{
			if (data instanceof SC.Download)
			{
				cell.dataset.title=SC.Download.formatFilesize(data.getCurrentSpeed())+"/s";
			}
			if(data.size)cell.textContent=SC.Download.formatFilesize(data.getSpeed())+"/s";
		},
		"time":function time(cell,data)
		{
			if(data instanceof SC.Download)
			{
				if(data.time)
				{
					let remaining=data.filesize-data.size;
					let title=getTimeString(data.time-data.startTime)+"\n"+getTimeString(remaining/data.getCurrentSpeed()*1000);
					cell.dataset.title=title;
					cell.textContent=getTimeString(remaining/data.getSpeed()*1000);
				}
			}
			else if(data.getSpeed()>0)
			{
				let remaining=data.filesize-data.size
				cell.dataset.title=getTimeString(remaining/data.getSpeed()*1000);
				cell.textContent=getTimeString(data.getRemainingSize()/data.getSpeed()*1000);
			}
		}
	};
	DownloadTable.moveDialog=function(items,roots)
	{
		if(items.length==0) return Promise.resolve();
		roots=roots.filter(r=>r instanceof SC.Download.Package);
		let root={
			name:"root",
			getChildren:()=>roots
		};
		let tree=new SC.stree(root,function(element,package)
		{
			element.textContent=package.name;
			//TODO disable selected packages and its children
		},{
			childrenGetter:c=>c.getChildren("subPackages"),
			radioName:"moveTarget"
		});
		tree.expandRoots(true);
		return new Promise(function(resolve,reject)
		{
			new SC.dlg(function(container)
			{
				container.appendChild(tree.element);
				let okBtn=document.createElement("button");
				okBtn.textContent=okBtn.dataset.action="OK";
				container.appendChild(okBtn);
				let closeBtn=document.createElement("button");
				closeBtn.textContent=closeBtn.dataset.action="cancel";
				container.appendChild(closeBtn);
			},{
				modal:true,
				actions:{
					OK:function()
					{
						let target=tree.getSelected()[0];
						if(target===root) target=null;
						resolve(target);
						this.close();
					},
					cancel:function()
					{
						this.close();
						reject("cancel");
					}
				}
			});
		});
	};
	DownloadTable.sortDialog=function(items)
	{

		let sortTable=new SC.Table(new SC.TableConfig(["name"],{noInput:true,control:true}));
		sortTable.add(items);
		return new Promise(function(resolve,reject)
		{
			new SC.dlg(function(container)
			{
				container.classList.add("sortDialog");
				container.innerHTML=String.raw
`
<div class="sortWrapper">
<div class="sortActions">
	<button data-action="first">⤒</button>
	<button data-action="up">↑</button>
	<button data-action="down">↓</button>
	<button data-action="last">⤓</button>
</div>
<div class="sortTableScroll"></div>
</div>
<div class="dialogActions">
<button data-action="ok">OK</button>
<button data-action="cancel">Cancel</button>
</div>
`
				;
				container.firstElementChild.lastElementChild.appendChild(sortTable.getTable());
				let nameHeader=sortTable.tableHeader.querySelector('.name');
				nameHeader.dataset.action="sortName";
			},{
				modal:true,
				actions:{
					first:function()
					{
						let selectedRows=Array.from(sortTable.tableBody.children).filter(row=>row.firstElementChild.checked);
						let firstChild=sortTable.tableBody.firstElementChild;
						selectedRows.forEach(r=>sortTable.tableBody.insertBefore(r,firstChild));
					},
					up:function()
					{
						let selectedRows=Array.from(sortTable.tableBody.children).filter(row=>row.firstElementChild.checked);
						if(selectedRows.length>0)
						{
							let prevChild=selectedRows[0].previousElementSibling;
							selectedRows.forEach(r=>sortTable.tableBody.insertBefore(r,prevChild));
						}
					},
					down:function()
					{
						let selectedRows=Array.from(sortTable.tableBody.children).filter(row=>row.firstElementChild.checked);
						if(selectedRows.length>0)
						{
							let nextChild=selectedRows[selectedRows.length-1].nextElementSibling;
							if(nextChild) nextChild=nextChild.nextElementSibling;
							selectedRows.forEach(r=>sortTable.tableBody.insertBefore(r,nextChild));
						}
					},
					last:function()
					{
						let selectedRows=Array.from(sortTable.tableBody.children).filter(row=>row.firstElementChild.checked);
						selectedRows.forEach(r=>sortTable.tableBody.appendChild(r));
					},
					sortName:function()
					{
						Array.from(sortTable.tableBody.children)
						.sort((a,b)=>a.children[1].textContent>b.children[1].textContent)
						.forEach(r=>sortTable.tableBody.appendChild(r));
					},
					ok:function()
					{
						this.close();
						resolve(Array.from(sortTable.tableBody.children).map(r=>sortTable.change(r)));
					},
					cancel:function()
					{
						this.close();
						reject("cancel");
					}
				}
			});
		});
	};

	DownloadTable.SpeedStateEvent=StateEvent.implement("downloadSpeed");
	DownloadTable.SizeStateEvent=StateEvent.implement("downloadSize");
	DownloadTable.TotalSizeStateEvent=StateEvent.implement("downloadTotalSize");
	SMOD("NIWA-Download.DownloadTable",DownloadTable);

})(Morgas,Morgas.setModule,Morgas.getModule,Morgas.hasModule,Morgas.shortcut);