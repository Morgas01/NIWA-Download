(function(µ,SMOD,GMOD,HMOD,SC){

	µ.logger.setLevel(µ.logger.LEVEL.trace);

	SC=SC({
		dTable1:"NIWA-Download.DownloadTable",
		LiveDataSource:"LiveDataSource",
	});

	//*
	let table=new SC.dTable1();
	document.body.appendChild(table.element);
	/*/
	let dataSource=new SC.LiveDataSource({url:"event/downloads"});
	dataSource.addEventListener("liveDataEvent",console.log);
	//*/
})(Morgas,Morgas.setModule,Morgas.getModule,Morgas.hasModule,Morgas.shortcut);
