(function(µ,SMOD,GMOD,HMOD,SC){

	var Manager=require("../nodeJs/Manager");//GMOD("NIWA-Download.Manager")
	var Download=require("../lib/Download");//GMOD("NIWA-Download.Download")


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
			download.addMessage("start");
			var step=()=>
			{
				download.size+=download.filesize*(Math.random()/20-0.01);
				if(Math.random()>0.99)
				{
					download.state=Download.states.FAILED;
					signal.reject("random error");
				}
				else if(download.size<download.filesize)
				{
					setTimeout(step,(Math.random()+0.5)*500);
					if(Math.random()>0.9) download.addMessage("random message");
					this.updateDownload(download);
				}
				else
				{
					download.size=download.filesize;
					download.state=Download.states.DONE;
					signal.resolve();
				}
			};
			step();
		},
		maxDownloads:3,
	});

	testManager.dbErrors.push({message:"test Error",file:"test file"});

	module.exports=testManager.serviceMethods;

})(Morgas,Morgas.setModule,Morgas.getModule,Morgas.hasModule,Morgas.shortcut);