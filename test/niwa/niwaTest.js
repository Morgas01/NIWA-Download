let NIWA=require("niwa");

new NIWA({
	yard:__dirname,
	door:8765,
	welcomeSign:"guiTest",
	logLevel:"TRACE"
}).open().catch(e=>console.log("FATAL:",e));