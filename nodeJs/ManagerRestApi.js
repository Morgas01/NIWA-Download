(function(µ,SMOD,GMOD,HMOD,SC){

	//SC=SC({}); prevent build warning

	SC=SC({
		Manager:require.bind(null,"./Manager"),
		prepareItems:require.bind(null,"../lib/prepareItems")
	});

	let ManagerRestApi=new µ.Class({
		constructor:function(manager)
		{
			if (!manager) throw new RangeError("no manager!");
			else if (!(manager instanceof SC.Manager)) throw new RangeError("manager is not a NIWA-Download.Manager!")

			this.manager=manager;
		},
		getApi()
		{
			return {
				add:this.restAddDownloads.bind(this),
				//TODO
				//delete
				//sort
				//move
				//disable
				//reset
				//pause //set auto triggering of downloads
			}
		},
		async restAddDownloads(param)
		{
			let dictionary=JSON.parse(param.data);
			let downloads=SC.prepareItems.fromDictionary(dictionary,this.manager.classDirectory);
			await this.manager.add(downloads);
		},
	});

	SMOD("NIWA-Download.ManagerRestApi",ManagerRestApi);

})(Morgas,Morgas.setModule,Morgas.getModule,Morgas.hasModule,Morgas.shortcut);