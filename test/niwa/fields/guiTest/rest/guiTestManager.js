(function(µ,SMOD,GMOD,HMOD,SC){

	SC=SC({
		Manager:"NIWA-Download.Manager",
		ManagerRestApi:"NIWA-Download.ManagerRestApi",
		Download:"NIWA-Download.Download"
	});

	let mananger=new SC.Manager({
		logger:worker.logger,
		eventSourceName:"downloads",
		autoTriggger:false,
		maxDownloads:2,
		downloadMethod(download,triggerUpdate)
		{
			return new Promise((rs,rj)=>
			{
				setTimeout(function progress()
				{
					let nextSize=Math.min(download.filesize,(download.size||0)+download.filesize*(Math.random()*10/100));
					download.setSize(nextSize);
					if(download.size===download.filesize)
					{
						if(download.name==="BIG")
						{
							download.startTime=null;
							download.setSize(0);
							download.lastTime=null;
						}
						else
						{
							download.state=SC.Download.states.DONE;
							rs();
							return;
						}
					}

					triggerUpdate(download);
					setTimeout(progress,1000+Math.random()*2000);
				},250);
			});
		}
	});

	let restApi=new SC.ManagerRestApi(mananger);

	module.exports=restApi;

	mananger.add(new SC.Download({name:"initial",filesize:100,messages:[{text:"hello download",time:Date.now()}]}));

	if(!worker.config.name.includes("child"))
	{
		mananger.add(new SC.Download({name:"BIG",filesize:3E8,messages:[{text:"BIG START",time:Date.now()}]}));
	}

})(Morgas,Morgas.setModule,Morgas.getModule,Morgas.hasModule,Morgas.shortcut);