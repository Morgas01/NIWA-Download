(function(µ,SMOD,GMOD,HMOD,SC){

	SC=SC({
		ObjectConnector:"ObjectConnector",
		Download:"NIWA-Download.Download",
		eq:"equals",
		flatten:"flatten",
		es:"errorSerializer",
	});

	let Manager=module.exports=µ.Class({
		/**
		 * @param {Object} param
		 * @param {Function} param.downloadMethod - async callback to actually download a download-source
		 * @param {{info:Function,warn:Function,error:Function}} [logger=morgas.logger]
		 * @param {Morgas.DB.Connector} [param.connector=ObjectConnector]
		 * @param {Morgas.DB.Object[]} [param.DBClassDictionary=[]] - download subclasses
		 * @param {Function} [param.downloadFilter] - async callback to actually determine if a download is ready
		 * @param {Number} [param.maxDownloads=-1] - number of concurrent downloads; -1 = unlimited
		 * @param {Boolean} [param.autoTrigger=true]
		 * @param {String} [param.eventSourceName]
		 * @param {Boolean} [param.acceptDelegates=false]
		 *
		 */
		constructor:function({
			downloadMethod,
			logger=µ.logger,
			connector=new SC.ObjectConnector(),
			DBClassDictionary=[],
			downloadFilter=µ.constantFunctions.t,
		 	maxDownloads=-1,
			autoTrigger=true,
			eventSourceName,
			acceptDelegates=false
		})
		{
			if(!downloadMethod) throw new TypeError("downloadMethod is required");

			this.downloadMethod=downloadMethod;
			this.logger=logger;
			/** @type {Morgas.DB.Connector} */
			this.connector=connector;
			/** @type {Map.<String,Class>} */
			this.classDirectory=new Map([].concat(DBClassDictionary,SC.Download,SC.Download.Package).map(t=>[t.prototype.objectType,t]));
			this.downloadFilter=downloadFilter;
			this.maxDownloads=maxDownloads;
			this.autoTrigger=autoTrigger;

			if(eventSourceName)
			{
				this.eventTrigger=worker.eventSource(eventSourceName,this.getManagedData.bind(this));
			}
			else
			{
				this.eventTrigger=µ.constantFunctions.ndef;
			}

			this.runningDownloads=new Map();
			this._triggeringNext=false;
			if(acceptDelegates)
			{
				//TODO worker.method=method
			}
		},
		setAutoTrigger(state)
		{
			this.autoTrigger=!!state;
			if(this.autoTrigger)
			{
				this.triggerNextDownload();
			}
		},
		/**
		 * @param {Array.<Download,Download.Package>} downloads
		 * @returns {Promise<void>}
		 */
		async add(downloads)
		{
			//TODO setSortIndex?
			await this.update(downloads);
			if(this.autoTrigger)
			{
				await this.triggerNextDownload();
			}
		},
		/**
		 * @param {Array.<Download,Download.Package>} downloads
		 */
		update(downloads)
		{
			downloads=[].concat(downloads);

			//TODO don't update running downloads ?

			let add=[],change=[]
			for(let entry of downloads)
			{
				if(entry.ID==null) add.push(entry)
				else change.push(entry);
			}
			this.connector.save(downloads);
			if(add.length>0) this.eventTrigger("add",add);
			if(change.length>0) this.eventTrigger("change",change);
		},
		eventUpdate(download)
		{
			this.eventTrigger("change",[download.toUpdateJSON()])
		},
		isDownloadsMaxed()
		{
			return this.maxDownloads>=0&&this.runningDownloads.size>=this.maxDownloads;
		},
		getRunningDownloads()
		{
			return Array.from(this.runningDownloads.keys());
		},
		getRunningDownload(download)
		{
			for(let running of this.getRunningDownloads())
			{
				if(download.ID!=null&&download.ID===running.ID||download.ID==null&&SC.eq(running.dataSource,download.dataSource))
				{
					return running;
				}
			}
			return null;
		},
		async triggerNextDownload()
		{
			if(this._triggeringNext) return -1; //already triggering
			if(this.isDownloadsMaxed())
			{
				return -2; // reached maxDownloads;
			}
			this._triggeringNext=true;

			try
			{
				let triggered=0;
				let dbClasses = Array.from(this.classDirectory.values());
				/** @type {Array.<Download,Download.Package>} */
				let data = SC.flatten(await Promise.all(dbClasses.map(dbClass => this.connector.load(dbClass, {packageID: SC.eq.unset()}))));
				data.sort(SC.Download.sortByOrderIndex);

				for (let item = data.shift(); item!=null && !this.isDownloadsMaxed(); item = data.shift())
				{
					if (item instanceof SC.Download)
					{
						if (item.state === SC.Download.states.PENDING&&!this.getRunningDownload(item))
						{
							try
							{
								if(await this.startDownload(item))
								{
									triggered++;
								}
							}
							catch (e)
							{
								this.logger.error({error:SC.es(e)},"could not start download");
							}
						}
					}
					else // instance of SC.Download.Package
					{
						await Promise.all([
							this.connector.loadChildren(item, "children"),
							this.connector.loadChildren(item, "subPackages")
						]);
						data.unshift(...item.getItems()); //insert sub items as next items
					}
				}
				this._triggeringNext=false;
				return triggered;
			}
			catch (e)
			{
				this._triggeringNext=false;
				throw e;
			}
		},
		async startDownload(download)
		{
			if(this.isDownloadsMaxed()||this.getRunningDownload(download)||!(await this.downloadFilter(download)))
			{
				return false;
			}

			download.state=SC.Download.states.RUNNING;
			await this.update(download);
			let downloadPromise=Promise.resolve(this.downloadMethod(download,this.eventUpdate.bind(this)))
			.then(()=>
			{
				if(download.state===SC.Download.states.RUNNING)
				{
					this.logger.warn({
						download:{
							ID:download.ID,
							name:download.name,
							remoteID:download.remoteID,
							packageID:download.packageID,
							dataSource:download.dataSource
						}
					},"download was still in running state when finished");
					download.state=SC.Download.states.DISABLED;
				}
			},
			e=>
			{
				let error=SC.es(e);
				this.logger.error({error:e,download:download},"download failed")
				download.addMessage("Error:\n"+JSON.stringify(error,null,"\t"));
				download.state=SC.Download.states.FAILED;

			});
			this.runningDownloads.set(download,downloadPromise);
			downloadPromise.then(async ()=>
			{
				this.runningDownloads.delete(download);
				if(download.ID!==null)
				{
					await this.update(download);
				}
				if(this.autoTrigger)
				{
					await this.triggerNextDownload();
				}
			});
			return true;
		},
		async getManagedData()
		{
			let dbClasses = Array.from(this.classDirectory.values());
			let data = SC.flatten(await Promise.all(dbClasses.map(dbClass => this.connector.load(dbClass))));
			for(let i=0;i<data.length;i++)
			{
				let entry=data[i];
				if(entry instanceof SC.Download)
				{
					let running=this.getRunningDownload(entry);
					if(running) data[i]=running;
				}
			}
			return data;
		}
	});

	SMOD("NIWA-Download.Manager",Manager);

})(Morgas,Morgas.setModule,Morgas.getModule,Morgas.hasModule,Morgas.shortcut);