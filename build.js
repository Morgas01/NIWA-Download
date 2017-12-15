require("morgas");
require("morgas.gui");

let SC=µ.shortcut({
	File:"File",
	util:"File.util",
	Promise:"Promise",
	itAs:"iterateAsync",
	moduleRegister:"Morgas.ModuleRegister",
	moduleRegisterGui:"Morgas.gui.ModuleRegister"
});

let root = new SC.File(__dirname);

/*** dependencies ***/

(new (require("morgas/lib/dependencyParser")))
.addSource(root.clone().changePath("js"))
.addSource(root.clone().changePath("lib"))
.addSource(root.clone().changePath("nodeJs"))
.addProvidedModules(Object.keys(SC.moduleRegister))
.addProvidedModules(Object.keys(SC.moduleRegisterGui))
.addProvidedModules(["File","File.util","DB/jsonConnector","errorSerializer"]) //morgas nodejs
.addProvidedModules(["ServiceResult","niwaWorkDir"]) //NIWA
.parse(root)
.then(function(result)
{
	root.clone().changePath("ModuleRegister.json").write(JSON.stringify(result.moduleRegister,null,"\t")).then(null,function(err)
	{
		µ.logger.error("could not save ModuleRegister",err);
	});
	root.clone().changePath("ModuleDependencies.json").write(JSON.stringify(result.moduleDependencies,null,"\t")).then(null,function(err)
	{
		µ.logger.error("could not save ModuleDependencies",err);
	});
})
.catch(µ.logger.error);