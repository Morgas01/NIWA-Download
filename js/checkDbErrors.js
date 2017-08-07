(function(µ,SMOD,GMOD,HMOD,SC){

	SC=SC({
		rq:"request",
		dlg:"gui.dialog",
		TableConfig:"gui.TableConfig",
		Promise:"Promise"
	});
	var tableConfig=new SC.TableConfig([
		{
			name:"error",
			fn:function(element,error)
			{

				element.textContent=JSON.stringify(error,null,"\t").replace(/(?:[^\\])\\n/g,"\n");
			}
		},
		"file"
	]);
	var cache=null;

	SMOD("NIWA-Download.checkDbErrors",function checkDbErrors(apiPath="rest/downloads",noCache=false)
	{
		if(cache==null||noCache)
		{
			cache=SC.rq.json(apiPath+"/errors")
			.then(function(errors)
			{
				if(errors.length>0) return Promise.reject(errors);
			},
			function(networkError)
			{
				return Promise.reject([{error:networkError}]);
			});
		}

		return cache.catch(SC.Promise.pledge(function(signal,errors)
		{
			SC.dlg(function(element)
			{
				element.innerHTML=String.raw
`
<header>the database had some errors:</header>
<div class="actions">
	<button data-action="continue">continue</button>
	<button data-action="abort">abort</button>
</div>
`
				;
				element.appendChild(tableConfig.getTable(errors));

			},
			{
				modal:true,
				actions:{
					continue:function()
					{
						this.close();
						signal.resolve();
						dbErrors=Promise.resolve();
					},
					abort:function()
					{
						this.close();
						signal.reject();
					}
				}
			}).classList.add("dbError");
		}));
	});

})(Morgas,Morgas.setModule,Morgas.getModule,Morgas.hasModule,Morgas.shortcut);