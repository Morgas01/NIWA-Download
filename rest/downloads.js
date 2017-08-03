(function(µ,SMOD,GMOD,HMOD,SC){

	var Manager=require("../nodeJs/Manager");

	var testManager=new Manager({
		eventName:"testDownloads",
		// TODO DBClassDictionary:[],
		storagePath:false,
		filter:function(running,download)
		{
			//TODO
			return true;
		},
		download:function(signal,download)
		{

			var step=function()
			{
				download.size+=download.filesize*(Math.random()/10-0.01);
				if(download.size<download.filesize)
				{
					setTimeout(step,Math.random()+0.5);
					this.updateDownload(download);
				}
				else if(Math.random()>0.95)
				{
					download.state=SC.Download.states.FAILED;
					signal.reject();
				}
				else
				{
					download.size=download.filesize;
					download.state=SC.Download.states.DONE;
					signal.resolve();
				}
			};
			step();
		},
		maxDownloads:3,
	})

})(Morgas,Morgas.setModule,Morgas.getModule,Morgas.hasModule,Morgas.shortcut);