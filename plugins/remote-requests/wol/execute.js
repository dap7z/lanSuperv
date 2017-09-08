const PluginName = 'wol';
const Wol = require('wol');

process.on('message', (pcTarget) => {
	process.send('start');
	try {
		//send magic packet
		var macAddr = pcTarget.lanMAC;
		Wol.wake(macAddr, function(err, res){
			console.log(PluginName +' result: '+ res);
			process.send('done');
		});
	} catch (e) {
		console.warn('Catched error on '+ PluginName, macAddr, e);
		process.send('fail');
	}
	
});