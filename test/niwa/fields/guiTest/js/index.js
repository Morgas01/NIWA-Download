(function(µ,SMOD,GMOD,HMOD,SC){

	µ.logger.setLevel(µ.logger.LEVEL.trace);

	SC=SC({
		dTable1:"NIWA-Download.DownloadTable",
		LiveDataSource:"LiveDataSource",
		Download:"NIWA-Download.Download",
		Client:"NIWA-Download.ClientRestApi",
		uDate:"date/format",
		action:"gui.actionize"
	});

	//SMOD("index") prevent building warning


	let table=new SC.dTable1();
	document.body.appendChild(table.element);
	let statistics=document.createElement("fieldset");
	statistics.innerHTML=`<legend>statistics</legend>`;

	document.body.appendChild(statistics);


	let lastEvents={speed:null,size:null};
	let formatFilesize=SC.Download.formatFilesize;
	let updateStatistics=function(event)
	{
		if(event.name==="downloadSpeed") lastEvents.speed=event.state;
		else lastEvents.size=event.state;

		statistics.innerHTML=`<legend>statistics</legend>
<table>
	<tr><th colspan="2">speed</th></tr>
	<tr><td>current</td><td>${lastEvents.speed!=null?formatFilesize(lastEvents.speed.current)+"/s":"-"}</td></tr>
	<tr><td>average</td><td>${lastEvents.speed!=null?formatFilesize(lastEvents.speed.average)+"/s":"-"}</td></tr>
	<tr><td>average remaining</td><td>${lastEvents.speed==null||lastEvents.size==null||lastEvents.speed.average==0?"-":
		SC.uDate(new Date(
			((lastEvents.size.states.running.filesize-lastEvents.size.states.running.size)/lastEvents.speed.average)*1000
		),SC.uDate.exactTime)}</td></tr>
</table>
<table>
	<tr><th colspan="3">size</th></tr>
	<tr><th>state</th><th>current size</th><th>filesize</th></tr>
	${lastEvents.size==null?"":Object.keys(lastEvents.size.states).map(state=>
			
	`<tr><td>${state}</td><td>${formatFilesize(lastEvents.size.states[state].size)}</td><td>${formatFilesize(lastEvents.size.states[state].filesize)}</td>`
			
	).join("")}
	${lastEvents.size==null?"":
	  
	`<tr><td>[total]</td><td>${formatFilesize(lastEvents.size.size)}</td><td>${formatFilesize(lastEvents.size.filesize)}</td>`
			
	}
</table>`
	}

	table.addEventListener("downloadSpeed",updateStatistics);
	table.addEventListener("downloadSize",updateStatistics);

	let client=new SC.Client({baseUrl:"rest/guiTestManager"});
	let actions={
		async add()
		{
			let download = new SC.Download({name:"added",filesize:5**(Math.ceil(Math.random()*10)),messages:[{text:"added",time:Date.now()}]});
			await client.add([download]);
		},
		async addWithPackage()
		{
			let package = new SC.Download.Package({name:"added package"});
			let download = new SC.Download({name:"added",filesize:5*10**(Math.ceil(Math.random()*10)),messages:[{text:"added",time:Date.now()}]});
			let subpackage = new SC.Download.Package({name:"sub package"});
			let subDownload = new SC.Download({name:"added sub",filesize:5*10**(Math.ceil(Math.random()*10)),messages:[{text:"added sub",time:Date.now()}]});

			package.addChild("subPackages",subpackage);
			package.addChild("children",download);
			subpackage.addChild("children",subDownload);
			await client.add([package]);
		},
		delete()
		{

		},
		reset()
		{

		},
		disable()
		{

		},
		pause()
		{

		},
		sort()
		{

		},
		move()
		{

		},
	};
	let actionsElement=document.createElement("DIV");
	actionsElement.innerHTML=Object.keys(actions).map(a=>`<button data-action="${a}">${a}</button>`).join("");
	document.body.insertBefore(actionsElement,table.element);
	SC.action(actions,actionsElement);

})(Morgas,Morgas.setModule,Morgas.getModule,Morgas.hasModule,Morgas.shortcut);
