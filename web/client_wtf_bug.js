

var global = {
    socket:null,
    gun:null
};




function clientJS(){
 	
	console.log("Hey I am the bug");
	var tableName = Config.val('TABLE_COMPUTERS');
	var gun = Gun( Config.val('SOCKET_URL_DATABASE') );
	var dbTest = gun.get(tableName);
	dbTest.map().on(function(pc, id) {
		console.log("TEST GLOBAL IMPACT ONLY");
	});
	//=> NO CONSOLE LOG ...
	
	
	//[TO REPRODUCE 20180331]
	// - close all browsers window
	// - replace client.js by this file
	// - open web application in a new chrome anonym browser window
	
	
	//[TO FIX]
	// Comment :
	/*
		var global = {
			socket:null,
			gun:null
		};
	*/
	// Or rename the variable (dont use "global") !
	// "globalNameRandom5523" is OK...
	
}