(function(){
	var path=require("path");

	var niwaDownloads=module.exports={
		dir:__dirname,
		moduleRegister:require("./ModuleRegister"),
		moduleDependencies:require("./ModuleDependencies"),

		//util
		register:function(prefix="NIWA-Downloads.")
		{
			µ.addModuleRegister(niwaDownloads.moduleRegister,niwaDownloads.dir,prefix);
		},
		addToDependencyParser:function(parser)
		{
			return parser.addModuleRegister(niwaDownloads.moduleRegister,niwaDownloads.dir)
			.addModuleDependencies(niwaDownloads.moduleDependencies,niwaDownloads.dir);
		}
	};

})()
