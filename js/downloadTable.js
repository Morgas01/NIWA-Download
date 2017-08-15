(function(µ,SMOD,GMOD,HMOD,SC){

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
		dlg:"gui.dialog",
		stree:"gui.selectionTree",
		TableConfig:"gui.TableConfig.Select",
		Table:"gui.Table"
	});

	var orderByIndex=(a,b)=>
	{
		var ai=a.orderIndex;
		var bi=b.orderIndex;
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
	var DownloadTable=µ.Class({
		init:function(columns,options)
		{
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
			this.organizer.filter("roots",obj=>obj.packageID==null,g=>g.sort("orderIndex",orderByIndex))
			.group("class","objectType",sub=>sub.map("ID","ID"));

			this.connect();
		},
		connect:function()
		{
			this.eventSource=new EventSource("event/"+this.options.eventName);
			window.addEventListener("beforeunload",()=>this.eventSource.close());

			for(var [name,fn] of Object.entries(this.eventHandles))
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

				µ.logger.info("downloadEvent init:",event);
				var data=JSON.parse(event.data);
				var items=SC.prepareItems.fromDictionary(data,this.options.DBClasses);
				SC.DBObj.connectObjects(items);
				this.organizer.add(items);

				this.organizer.getFilter("roots").getSort("orderIndex")
				.forEach(entry=>this.treeTable.add(entry));
			},
			"add":function(event)
			{
				µ.logger.info("downloadEvent add:",event);
				var data=JSON.parse(event.data);
				var items=SC.prepareItems.fromDictionary(data,this.options.DBClasses);
				this.organizer.add(items);
				items.forEach(item=>
				{
					if(item.packageID!=null)
					{
						var parent=this.findByClassID(item.relations["package"].relatedClass.prototype.objectType,item.packageID);
						parent.connectObjects([item]);
					}
					this.treeTable.add(item,item.getParent("package"));
				});
			},
			"delete":function(event)
			{
				µ.logger.info("downloadEvent delete:",event);
				var data=JSON.parse(event.data);
				var items=[];
				for(var type in data) for(let ID of data[type]) items.push(this.findByClassID(type,ID));
				this.organizer.remove(items);
				items.forEach(i=>this.treeTable.remove(i));
			},
			"update":function(event)
			{
				µ.logger.info("downloadEvent update:",event);
				var data=JSON.parse(event.data);
				var items=[];
				for(var type in data)
				{
					for(var entry of data[type])
					{
						var item=this.findByClassID(type,entry.ID);
						item.fromJSON(entry);
						items.push(item);
					}
				}
				var parents=new Set(items);
				for(var child of parents)
				{
					var parent=child.getParent("package")
					if(parent) parents.add(parent);
					this.treeTable.update(child);
				}
				this.organizer.update(parents);
			},
			"move":function(event)
			{
				µ.logger.info("downloadEvent move:",event);
				var data=JSON.parse(event.data);
				var items=data.items.map(d=>this.findByClassID(d.objectType,d.ID));
				var parent=null;
				var parentRow=null;
				if(data.parent)
				{
					parent=this.findByClassID(data.parent.objectType,data.parent.ID);
					parentRow=this.treeTable.change(parent);
				}

				var rows=items.map(item=>
				{
					var row=this.treeTable.change(item);
					row.remove();
					var oldParent=item.getParent("package");
					var oldParentRow=this.treeTable.change(oldParent);
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
				µ.logger.info("downloadEvent sort:",event);
				var data=JSON.parse(event.data);
				var items=data.map(d=>this.findByClassID(d.objectType,d.ID));
				var parent=items[0].getParent("package");

				for(let i=0;i<items.length;i++) items[i].orderIndex=i;
				this.organizer.update(items);

				if(parent)
				{
					var parentRow=this.treeTable.change(parent);
					var wasExpanded=parentRow.isExpanded();
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
						var row=this.treeTable.change(item);
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
		createPackage:function()
		{
			//TODO
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
			var selected=this.getSelected();
			if(selected.length==0) return Promise.resolve();
			return this.trigger(selected);
		},
		remove:function(items)
		{
			return this.apiCall("delete",SC.prepareItems.toDictionary(items),"DELETE");
		},
		removeSelected:function()
		{
			var selected=this.getSelected();
			if(selected.length==0) return Promise.resolve();
			return this.remove(selected);
		},
		disable:function(items)
		{
			return this.apiCall("disable",SC.prepareItems.toDictionary(items),"PUT");
		},
		disableSelected:function()
		{
			var selected=this.getSelected();
			if(selected.length==0) return Promise.resolve();
			return this.disable(selected);
		},
        reset:function(items)
        {
        	return this.apiCall("reset",SC.prepareItems.toDictionary(items),"PUT");
        },
        resetSelected:function()
        {
        	var selected=this.getSelected();
			if(selected.length==0) return Promise.resolve();
			return this.reset(selected);
        },
        enable:function(items)
        {
        	return this.apiCall("enable",SC.prepareItems.toDictionary(items),"PUT");
        },
        enableSelected:function()
        {
        	var selected=this.getSelected();
			if(selected.length==0) return Promise.resolve();
			return this.enable(selected);
        },
        abort:function(items)
        {
        	return this.apiCall("abort",SC.prepareItems.toDictionary(items),"PUT");
        },
        abortSelected:function()
        {
        	var selected=this.getSelected();
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
        	var selected=this.getSelected();
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

	var dateHelper=new Date();
	var getTimeString=function(time)
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
			if(data.filepath)
			{
				var sep=(data.filepath.match(/[\\\/]/)||"/")[0];
				cell.textContent=data.filepath+sep+data.filename;
			}
			else cell.textContent=data.filename||"";
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
			var percentage=data.size/data.filesize*100;
			cell.firstElementChild.firstElementChild.style.width=percentage+"%";
			cell.dataset.title=percentage.toFixed(2)+"%";

		},
		"speed":function speed(cell,data)
		{
			if (cell.dataset.size&&cell.dataset.time&&data instanceof SC.Download)
			{
				cell.dataset.title=SC.Download.formatFilesize(data.getCurrentSpeed(cell.dataset.size,cell.dataset.time))+"/s";
			}
			if(data.size)cell.textContent=SC.Download.formatFilesize(data.getSpeed())+"/s";

			cell.dataset.size=data.size;
			cell.dataset.time=data.time;
		},
		"time":function time(cell,data)
		{
			if(data instanceof SC.Download)
			{
				if (cell.dataset.size&&cell.dataset.time)
				{
					var remaining=data.filesize-data.size;
					var title=getTimeString(remaining/data.getCurrentSpeed(cell.dataset.size,cell.dataset.time)*1000)+"\n";
					title+=getTimeString(remaining/data.getSpeed()*1000);

					cell.dataset.title=title;
				}
				if(data.time)
				{
					cell.textContent=getTimeString(data.time-data.startTime);
				}

				cell.dataset.size=data.size;
				cell.dataset.time=data.time;
			}
			else if(data.getSpeed()>0)
			{
				var remaining=data.filesize-data.size
				cell.textContent=getTimeString(remaining/data.getSpeed()*1000);
			}
		}
	};
	DownloadTable.moveDialog=function(items,roots)
	{
		if(items.length==0) return Promise.resolve();
		roots=roots.filter(r=>r instanceof SC.Download.Package);
		var root={
			name:"root",
			getChildren:()=>roots
		};
		var tree=SC.stree(root,function(element,package)
		{
			element.textContent=package.name;
			//TODO disable selected packages and its children
		},{
			childrenGetter:c=>c.getChildren("subPackages"),
			radioName:"moveTarget"
		});
		tree.expand(true,true);
		return new Promise(function(resolve,reject)
		{
			SC.dlg(function(container)
			{
				container.appendChild(tree);
				var okBtn=document.createElement("button");
				okBtn.textContent=okBtn.dataset.action="OK";
				container.appendChild(okBtn);
				var closeBtn=document.createElement("button");
				closeBtn.textContent=closeBtn.dataset.action="cancel";
				container.appendChild(closeBtn);
			},{
				modal:true,
				actions:{
					OK:function()
					{
						var target=tree.getSelected()[0];
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
			SC.dlg(function(container)
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
				var nameHeader=sortTable.tableHeader.querySelector('.name');
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
	}
	SMOD("NIWA-Download.DownloadTable",DownloadTable);

})(Morgas,Morgas.setModule,Morgas.getModule,Morgas.hasModule,Morgas.shortcut);