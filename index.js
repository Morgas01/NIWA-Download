(function(){
	let path=require("path");

	let niwaDownloads=module.exports={
		dir:__dirname,
		moduleRegister:require("./ModuleRegister"),
		moduleDependencies:require("./ModuleDependencies"),
		lessDir:path.resolve(__dirname,"less"),

		//util
		register:function()
		{
			µ.addModuleRegister(niwaDownloads.moduleRegister,niwaDownloads.dir);
			return niwaDownloads;
		}
	};

})()
