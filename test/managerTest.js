require("morgas");
let Manager = require("../nodeJs/Manager2");
let Download= require("../lib/Download");

//dummy worker
worker={
	eventSource(name,getter)
	{
		return function(eventName,data)
		{

		};
	}
};

let test=µ.getModule("queue")(async function (name,fn)
{
	if(name) console.log("start: "+name);
	try
	{
		await fn();
	}
	catch (e)
	{
		console.error("!\n",e,e.stack);
	}
	if(name) console.log("end: "+name);
},{limit:1});

let asserts={
	counts:{errors:0},
	log(message)
	{
		console.info("\t"+message);
	},
	error(message)
	{
		console.error("!\t"+message+"\t!");
		asserts.counts.errors++
	},
	ok(boolean,message)
	{
		let method=boolean?asserts.log:asserts.error;
		method(message);
	}
};

process.on('beforeExit', ()=>
{
	console.log("\n\n\n",asserts.counts.errors, "Errors");
});

µ.logger.setLevel(µ.logger.LEVEL.trace);

test(()=>{
	try {
		new Manager({});
		asserts.error("should throw");
	}
	catch(e)
	{
		asserts.ok(e instanceof TypeError,"TypeError");
		asserts.ok(e.message==="downloadMethod is required","message");
	}
},"require downloadMethod");

test("no autoTrigger",async()=>{

	let triggered=false;
	let testDownload=new Download({name:"foobar"});
	let manager=new Manager({
		autoTrigger:false,
		downloadMethod:()=>
		{
			triggered=true;
		}
	});
	await manager.add(testDownload);
	asserts.ok(!triggered,"not triggered");
});

test("maxDownloads:0",async()=>{

	let triggered=false;
	let testDownload=new Download({name:"foobar"});
	let manager=new Manager({
		maxDownloads:0,
		downloadMethod:()=>
		{
			triggered=true;
		}
	});
	await manager.add(testDownload);
	asserts.ok(!triggered,"not triggered");
});

test("maxDownloads:1",()=>
{
	return new Promise((rs,rj)=>
	{
		let firstTrigger = null;
		let manager = new Manager({
			maxDownloads: 1,
			downloadMethod: (download) =>
			{
				download.state = Download.states.DONE;
				if (firstTrigger == null)
				{
					firstTrigger = Date.now();
					return new Promise(rs => setTimeout(rs, 500));
				}
				else
				{
					let secondTrigger = Date.now();
					let duration = secondTrigger - firstTrigger;
					asserts.ok(duration < 520&&duration > 480, `wait for running downloads (${duration})`);
					rs();
				}
			}
		});
		manager.add([new Download({name: "foo"}), new Download({name: "bar"})]);
		setTimeout(()=>rj("timeout (2s)"),2000);
	});

});

test("download states",async()=>{

	let triggered=null;
	let resolve;
	let testDownload=new Download({name:"foobar"});
	let manager=new Manager({
		downloadMethod:(download)=>
		{
			triggered=download;
			asserts.ok(download.name==="foobar","same name");
			asserts.ok(download.ID!==null,"has ID");
			asserts.ok(download!==testDownload,"not same instance");
			asserts.ok(download.state===Download.states.RUNNING,"is running");
			return new Promise(rs=>{resolve=rs});
		}
	});
	await manager.add(testDownload);
	asserts.ok(triggered,"triggered");

	let runningDownloads = await manager.getRunningDownloads();
	asserts.ok(runningDownloads.length===1,"is running");

	asserts.ok(triggered===(await manager.getManagedData())[0],"same instance");

	let [[download,promise]]=Array.from(manager.runningDownloads.entries());
	if(resolve)
	{
		resolve();
		await promise;
		asserts.ok((await manager.getRunningDownloads()).length===0,"finished");
		let downloads=await manager.getManagedData();
		asserts.ok(downloads[0].state===Download.states.DISABLED,downloads[0].state+" after finishing is running state");
	}
});


test("download order",()=>
{
	return new Promise(async (rs,rj)=>
	{
		let triggers = 0;
		let manager = new Manager({
			maxDownloads: 1,
			downloadMethod: (download) =>
			{
				download.state = Download.states.DONE;
				switch (++triggers)
				{
					case 1:
						asserts.ok(download.name==="first",download.name);
						manager.add([new Download({name: "last"}),new Download({name: "second",orderIndex:1})]);
						break;
					case 2:
						asserts.ok(download.name==="second",download.name);
						break;
					case 3:
						asserts.ok(download.name==="third",download.name);
						break;
					case 4:
						asserts.ok(download.name==="fourth",download.name);
						break;
					case 5:
						asserts.ok(download.name==="last",download.name);
						break;
				}
				if(triggers<5) return new Promise(rs => setTimeout(rs, 50));
				rs();
			}
		});
		let pack=new Download.Package({
			name:"package",
			orderIndex:2
		});
		pack.addChild("children",new Download({name: "third",orderIndex:2}));
		pack.addChild("children",new Download({name: "fourth"}));
		pack.addChild("children",new Download({name: "first",orderIndex:1}));
		manager.add([pack,...pack.getItems()]);

		setTimeout(()=>rj("timeout (300ms)"),300);
	});

});

test("download filter",async()=>{

	let triggered=[];
	let manager=new Manager({
		downloadMethod:(download)=>
		{
			triggered.push(download.name);
		},
		downloadFilter(download)
		{
			return download.name==="bar";
		}
	});
	await manager.add([new Download({name:"foo"}),new Download({name:"bar"})]);
	asserts.ok(triggered.length===1,"only 1 triggered");
	asserts.ok(triggered[0]==="bar",triggered[0]+" triggered");
});