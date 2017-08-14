(function(µ,SMOD,GMOD,HMOD,SC){

	var File=GMOD("File");
	var moduleRegister=require("../ModuleRegister");
	var moduleDependencies=require("../ModuleDependencies");
	//SC=SC({});

	var dir=new File(__dirname).changePath("..").getAbsolutePath();

	var restService=µ.getModule("dependencyManager")(["js/test.js"],"js");
	restService.addResource(moduleRegister,moduleDependencies,dir,"NIWA-Download");

	module.exports=restService;

})(Morgas,Morgas.setModule,Morgas.getModule,Morgas.hasModule,Morgas.shortcut);