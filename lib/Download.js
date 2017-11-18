(function(µ,SMOD,GMOD,HMOD,SC){

	var DBObj=GMOD("DBObj"),
		FIELD=GMOD("DBField");

	SC=SC({
		rel:"DBRel"
	});

	var DOWNLOAD=µ.Class(DBObj,{
		objectType:"Download",
		constructor:function(param)
		{
			param=param||{};

			this.mega(param);

			this.appOrigin=param.appOrigin||null;

			this.addField("name",		FIELD.TYPES.STRING	,param.name);
			this.addField("filename",	FIELD.TYPES.STRING	,param.filename);
			this.addField("filepath",	FIELD.TYPES.STRING	,param.filepath);
			this.addField("filesize",	FIELD.TYPES.INT		,DOWNLOAD.parseFilesize(param.filesize));
			this.addField("state",		FIELD.TYPES.STRING	,param.state||DOWNLOAD.states.PENDING);
			this.addField("messages",	FIELD.TYPES.JSON	,param.messages||[]); //{String[]}
			this.addField("dataSource",	FIELD.TYPES.JSON	,param.dataSource); // information to start download String = {url:"string"}
			this.addField("orderIndex",	FIELD.TYPES.INT		,param.orderIndex);

			// for the download progress
			this.startTime=param.startTime||null;
			this.startSize=param.startSize||0;
			this.time=param.time||null;
			this.size=param.size||0;
			this.lastTime=param.lastTime||null;
			this.lastSize=param.lastSize||0;

			// for download from other apps
			this.addField("context",	FIELD.TYPES.STRING	,param.context);
			this.addField("remoteID",	FIELD.TYPES.INT		,param.remoteID);

			this.addRelation("package",	DOWNLOAD.Package	,SC.rel.TYPES.PARENT,"children","packageID");

			Object.defineProperty(this,"formattedFilesize",{
				configurable:false,
				enumerable:true,
				get:()=>DOWNLOAD.formatFilesize(this.filesize)
			});

		},
		addMessage:function(text,time)
		{
			if(!time)time=Date.now();
			this.messages.push({text:text,time:time});
		},
		clearMessages:function()
		{
			this.messages.length=0;
		},
		setSize:function(size)
		{
			let time=Date.now();

			this.lastSize=this.size;
			this.size=size;

			if(!this.startTime) download.startTime=time;
			this.lastTime=this.time;
			this.time=time;
		},
		toUpdateJSON:function()
		{
			var jsonObject=this.toJSON();

			jsonObject.startTime=this.startTime;
			jsonObject.startSize=this.startSize;
			jsonObject.time=this.time;
			jsonObject.size=this.size;
			jsonObject.lastTime=this.lastTime;
			jsonObject.lastSize=this.lastSize;

			return jsonObject;
		},
		fromJSON:function(jsonObject)
		{
			DBObj.prototype.fromJSON.call(this,jsonObject);

			this.startTime=jsonObject.startTime||null;
			this.startSize=jsonObject.startSize||0;
			this.time=jsonObject.time||null;
			if(this.state==DOWNLOAD.states.DONE) this.size=this.filesize;
			else this.size=jsonObject.size||0;

			this.lastTime=jsonObject.lastTime||null;
			this.lastSize=jsonObject.lastSize||0;

			return this;
		},
		getSpeed:function()
		{
			if(!this.startTime) return 0;
			return (this.size - this.startSize)/((this.time - this.startTime)/1000);
		},
		getCurrentSpeed:function()
		{
			if(!this.lastTime) return 0;
			return (this.size - this.lastSize)/((this.time - this.lastTime)/1000);
		},
		updateFromDelegate:function(delegate)
		{
			this.filename=delegate.filename;
			this.filepath=delegate.filepath;
			this.filesize=delegate.filesize;
			this.state=delegate.state;
			this.messages=delegate.messages;

			this.startTime=delegate.startTime||null;
			this.startSize=delegate.startSize||0;
			this.time=delegate.time||null;
			this.size=delegate.size||0;
			this.lastTime=delegate.lastTime||null;
			this.lastSize=delegate.lastSize||0;
		},
		//compatibility
		getItems:function()
		{
			return [];
		}
	});
	DOWNLOAD.states={
		DISABLED:"disabled",
		PENDING:"pending",
		RUNNING:"running",
		DONE:"done",
		FAILED:"failed"
	};
	DOWNLOAD.parseFilesize=function(filesize)
	{
		if(typeof filesize=="string")
		{
			var match=/(\d+(?:\.\d+)?)([kmgtp])b?/i.exec(filesize);
			if(match)
			{
				filesize=parseFloat(match[1]);
				switch (match[2])
				{
					case "P":
					case "p":
						filesize*=1E3;
					case "T":
					case "t":
						filesize*=1E3;
					case "G":
					case "g":
						filesize*=1E3;
					case "M":
					case "m":
					default:
						filesize*=1E3;
					case "K":
					case "k":
						filesize*=1E3;
				}
			}
			else filesize=0;
		}
		return filesize;
	};
	DOWNLOAD.formatFilesize=function(filesize)
	{
		if(filesize>1e15) return (filesize/1e15).toFixed(1)+"P";
		else if(filesize>1e12) return (filesize/1e12).toFixed(1)+"T";
		else if(filesize>1e9) return (filesize/1e9).toFixed(1)+"G";
		else if(filesize>1e6) return (filesize/1e6).toFixed(1)+"M";
		else if(filesize>1e3) return (filesize/1e3).toFixed(1)+"K";
		else if (!filesize) return "0";
		else return filesize.toFixed(3)+"B";
	};
	DOWNLOAD.sortByOrderIndex=function sortByOrderIndex(item1,item2) // ASC null last
	{
		var a=item1.orderIndex,b=item2.orderIndex;
		if(a==null)
		{
			if(b==null) return 0;
			else return 1;
		}
		else if (b==null) return -1;
		else return a-b;
	};

	DOWNLOAD.Package=µ.Class(DBObj,{
		objectType:"Package",
		constructor:function(param)
		{
			param=param||{};

			this.mega(param);

			this.addField("name",		FIELD.TYPES.STRING	,param.name);
			this.addField("orderIndex",	FIELD.TYPES.INT		,param.orderIndex);

			this.addRelation("children",	DOWNLOAD.Package.downloadClass,	SC.rel.TYPES.CHILD,	"package");

			this.addRelation("package",		DOWNLOAD.Package,				SC.rel.TYPES.PARENT,"subPackages","packageID");
			this.addRelation("subPackages",	DOWNLOAD.Package,				SC.rel.TYPES.CHILD,	"package");

			Object.defineProperty(this,"filesize",{
				configurable:false,
				enumerable:true,
				get:()=>this.getItems().reduce((a,b)=>a+b.filesize,0)
			});
			Object.defineProperty(this,"formattedFilesize",{
				configurable:false,
				enumerable:true,
				get:()=>DOWNLOAD.formatFilesize(this.filesize)
			});

			Object.defineProperty(this,"size",{
				configurable:false,
				enumerable:true,
				get:function()
				{
					return this.getItems().reduce(function(a,b)
					{
						if(b instanceof DOWNLOAD)
						{
							switch(b.state)
							{
								case DOWNLOAD.states.RUNNING:
									return a+b.size;
								case DOWNLOAD.states.DONE:
									return a+b.filesize;
								default:
								 	return a;
							}
						}
						return a+b.size;
					},0);
				}
			});
		},
		getItems:function()
		{
			return this.getChildren("subPackages").concat(this.getChildren("children")).sort(DOWNLOAD.sortByOrderIndex);
		},
		getSpeed:function()
		{
			return this.getItems().reduce((a,b)=>b.state==DOWNLOAD.states.RUNNING ? a+b.getSpeed() : a ,0);
		},
		getRemainingSize:function()
		{
			let total=0,current=0,todo=[this];
			for(let item of todo)
			{
				if(item instanceof DOWNLOAD.Package)
				{
					todo.push(...item.getItems());
				}
				else if(item.state==DOWNLOAD.states.RUNNING||item.state==DOWNLOAD.states.PENDING)
				{
					switch(item.state)
					{
						case DOWNLOAD.states.RUNNING:
							current+=item.size;
						case DOWNLOAD.states.PENDING:
							total+=item.filesize;
					}
				}
			}
			return total-current;
		}
	});
	DOWNLOAD.Package.downloadClass=DOWNLOAD;

	SMOD("NIWA-Download.Download",DOWNLOAD);
	if(typeof module!=="undefined")module.exports=DOWNLOAD;

})(Morgas,Morgas.setModule,Morgas.getModule,Morgas.hasModule,Morgas.shortcut);
