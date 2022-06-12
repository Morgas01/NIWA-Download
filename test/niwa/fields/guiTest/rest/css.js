(function(µ,SMOD,GMOD,HMOD,SC){

	let niwaDownload=require("../../../../../index");

	SC=SC({
		less:require.bind(null,"less"),
		gui:require.bind(null,"morgas.gui"),
		ServiceResult:"ServiceResult"
	});


	module.exports=async function()
	{
		let style= await (SC.less.render(`
@import "theme/default";
@import "structure/TableConfig/Select";
@import "style/TableConfig/Select";
@import "NIWA-Download.downloadTable";`
			,
			{
				paths:[niwaDownload.lessDir,SC.gui.lessFolder]
			}
		).then(
			data=>data.css,
		));
		return new SC.ServiceResult({
			data:style,
			headers:{
				"Content-Type":"text/css"
			}
		})
	};

})(Morgas,Morgas.setModule,Morgas.getModule,Morgas.hasModule,Morgas.shortcut);