(function(µ,SMOD,GMOD,HMOD,SC){

	//SC=SC({})

	let prepareItems={
		toClassID:function(item)
		{
			if(item==null) return null;
			return {
				objectType:item.objectType,
				ID:item.ID
			};
		},
		toClassIDs:function(items)
		{
			let rtn=[]
			for(let item of items)rtn.push(prepareItems.toClassID(item));
			return rtn;
		},
		toDictionary:function (items,useId=true)
		{
			let rtn={};
			for(let item of items)
			{
				if(!rtn[item.objectType])rtn[item.objectType]=[];
				rtn[item.objectType].push(useId?item.ID:item);
			}
			return rtn;
		},
		/**
		 * @Param {Object<String,Object[]>} dictionary
		 * @Param {Object<String,Function>} DBClasses
		 * @returns {Array<NIWA-Download.Download|NIWA-Download.Package>}
		 */
		fromDictionary:function(dictionary,DBClasses)
		{
			let rtn=[];
			for(let type in dictionary)
			{
				if(!(type in DBClasses))
				{
					//TODO
					µ.logger.error("no class for objectType "+type);
					continue;
				}
				for(let entry of dictionary[type])
				{
					let DBClass=DBClasses[type];
					rtn.push(new DBClass().fromJSON(entry));
				}
			}
			return rtn;
		}
	}

	SMOD("NIWA-Download.prepareItems",prepareItems);
	if(typeof module!=="undefined")module.exports=prepareItems;

})(Morgas,Morgas.setModule,Morgas.getModule,Morgas.hasModule,Morgas.shortcut);