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
		downloadMethod(download)
		{
			return new Promise((rs,rj)=>
			{
				setTimeout(function progress()
				{
					let nextSize=Math.max(download.filesize,(download.size||0)+download.filesize/(15+Math.random()*10));
					download.setSize(nextSize);
					if(download.size===download.filesize)
					{
						download.state=SC.Download.states.DONE;
						rs();
					}
					else
					{
						setTimeout(progress,100+Math.random()*100);
					}
				},250);
			});
		}
	});

	let restApi=new SC.ManagerRestApi(mananger);

	module.exports=restApi.getApi();

	mananger.add(new SC.Download({name:"initial",filesize:200,messages:["hello download"]}));

})(Morgas,Morgas.setModule,Morgas.getModule,Morgas.hasModule,Morgas.shortcut);