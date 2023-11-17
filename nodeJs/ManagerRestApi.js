(function(µ,SMOD,GMOD,HMOD,SC){

	//SC=SC({}); prevent build warning

	SC=SC({
		Manager:"NIWA-Download.Manager",
		DBObj: "DBObj",
		ServiceResult:"ServiceResult"
	});

	let ManagerRestApi=function(manager)
	{
		if (!manager) throw new RangeError("no manager!");
		else if (!(manager instanceof SC.Manager)) throw new RangeError("manager is not a NIWA-Download.Manager!")

		let api= {
			pause({method,data}) //set auto triggering of downloads
			{
				if(method==="GET")
				{
					return !manager.autoTrigger;
				}
				else
				{
					let pauseState=(data===false||data==="false");
					manager.setAutoTrigger(pauseState);
				}
			},
			async add(param)
			{
				if(!param.data||param.method!=="POST")
				{
					return new SC.ServiceResult({status:400,data:'post: [downloads]'});
				}
				let downloads=SC.DBObj.fromJSON(JSON.parse(param.data));
				await manager.add(downloads);
			}
			//TODO
			//delete
			//reset
			//disable
			//sort
			//move
		};

		return api;
	};

	SMOD("NIWA-Download.ManagerRestApi",ManagerRestApi);

})(Morgas,Morgas.setModule,Morgas.getModule,Morgas.hasModule,Morgas.shortcut);