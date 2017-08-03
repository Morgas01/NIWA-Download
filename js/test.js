(function(µ,SMOD,GMOD,HMOD,SC){

	var DownloadTable=GMOD("NIWA-Download.downloadTable");
	var actionize=GMOD("gui.actionize");
	SC=SC({
		rq:"request",
		Download:"NIWA-Download.Download",
		checkErrors:"NIWA-Download.checkDbErrors"
	});

	var downloadTable;
	requestAnimationFrame(function() // wait for dependencies of "used" scripts
	{
		downloadTable=new DownloadTable(null,{eventName:"testDownloads"});
		document.body.appendChild(downloadTable.element);
	})

	var actionResponse=function(promise)
	{
		promise.then(function()
		{
			µ.logger.info(arguments);
		},
		function(error)
		{
			µ.logger.error(error);
			alert("error!");
		});
	}

	var downloadCounter=0;
	actionize({
		checkErrors:function()
		{
			SC.checkErrors(undefined,true).then(()=>alert("ok"),()=>alert("abort"));
		},
		autoTriggerOn:function()
		{
			actionResponse(downloadTable.autoTrigger(true));
		},
        autoTriggerOff:function()
        {
			actionResponse(downloadTable.autoTrigger(false));
        },
        trigger:function()
        {
			//TODO
        },
        add:function()
        {
			var nr=downloadCounter++;
        	actionResponse(downloadTable.add([
        		new SC.Download({
					name:"download "+nr,
					filename:"download_"+nr+".test",
					filepath:"test/downloads",
					filesize:1000**(nr%7)*1.5
				})
			]));
        },
        addWithPackage:function()
        {
			var nr=downloadCounter++;
			var nr2=downloadCounter++;
        	actionResponse(downloadTable.addWithPackage("testPackage",undefined,[
        		new SC.Download({
					name:"download "+nr,
					filename:"download_"+nr+".test",
					filepath:"test/downloads",
					filesize:1000**(nr%7)*1.5
				}),
        		new SC.Download({
					name:"download "+nr2,
					filename:"download_"+nr2+".test",
					filepath:"test/downloads",
					filesize:1000**(nr2%7)*1.5
				})
			]));
        },
        package:function()
        {

        },
        remove:function()
        {

        },
        disable:function()
        {

        },
        reset:function()
        {

        },
        enable:function()
        {

        },
        move:function()
        {

        },
        sort:function()
        {

        },
        abort:function()
        {

        },
	},document.getElementById("actions"));

})(Morgas,Morgas.setModule,Morgas.getModule,Morgas.hasModule,Morgas.shortcut);