const PluginName = 'wol';
const Wol = require('wol');

process.on('message', (eventParams) => {
	process.send('start');
	try {

		let macAddress = eventParams.pcTarget.lanMAC;
        process.send('try wake up '+ macAddress);
		if(macAddress)
		{
            //send magic packet
            Wol.wake(macAddress, function(err, res){
                console.log(PluginName +' result: '+ res);
                process.send('done');
            });
		}
        else
		{
            throw new Error('undefined macAddress');
		}

	} catch (e) {
		console.warn('Catched error on '+ PluginName, macAddress, e);
		process.send('fail');
	}
	
});