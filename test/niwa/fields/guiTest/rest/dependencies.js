(function(µ,SMOD,GMOD,HMOD,SC){

	SC=SC({
		DependencyManager:"DependencyManager",
		DependenciesRestApi:"DependenciesRestApi"
	});

	let manager=new SC.DependencyManager({basePath:"../../../../"});
	manager.addSources(["js","lib","test/niwa/fields/guiTest/js"]);

	let gui=require("morgas.gui");
	manager.addPackage({
		name:"morgas.gui",
		basePath:gui.dirname,
		moduleDependencies:µ.getModule("Morgas.gui.ModuleDependencies"),
		moduleRegister:µ.getModule("Morgas.gui.ModuleRegister")
	});

	module.exports = SC.DependenciesRestApi(manager);

})(Morgas,Morgas.setModule,Morgas.getModule,Morgas.hasModule,Morgas.shortcut)
