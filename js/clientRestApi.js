(function(µ,SMOD,GMOD,HMOD,SC){

	SC=SC({});

	let sanitizeUrl=function(url)
	{
		return url.endsWith("/")?url.slice(0,-1):url;
	};

	let ClientRestApi=µ.Class({
		constructor:function({baseUrl="rest/downloads"}={})
		{
			this.baseUrl=sanitizeUrl(baseUrl);
		},
		/**
		 * @param {Download|Download[]}downloads
		 * @returns {Promise<Response>}
		 */
		async add(downloads=[])
		{
			if(!Array.isArray(downloads))
			{
				if(!downloads) return;
				downloads=[downloads];
			}

			if(downloads.length>0)
			{
				return fetch(this.baseUrl+"/add",{
					method:"POST",
					body:JSON.stringify(downloads),
					headers:{
						'Accept': 'application/json',
						'Content-Type': 'application/json'
					}
				})
				.then(response=>
				{
					if(response.ok)
					{
						return response.json();
					}
					throw response;
				});
			}
		}
	})

	SMOD("NIWA-Download.ClientRestApi",ClientRestApi);

})(Morgas,Morgas.setModule,Morgas.getModule,Morgas.hasModule,Morgas.shortcut);