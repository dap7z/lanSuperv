const PluginName = 'wol';
const Wol = require('wol');

process.on('message', (eventParams) => {
	process.send('start');
	try {

		let macAddress = eventParams.pcTargetLanMAC;
		process.send('try wake up '+ macAddress);
		if(macAddress)
		{
            //send magic packet
            Wol.wake(macAddress, function(err, res) {
            if (err) {
                    console.warn(PluginName + ' error message: ' + err.message);
                    console.warn(PluginName + ' error stack: ' + err.stack);
                    process.send('fail: ' + err.message);
                } else {
                    console.log(PluginName + ' result: ' + res);
                    process.send('done');
                }
            });
        }
        else
        {
            throw new Error('undefined macAddress');
        }

    } catch (e) {
        console.warn('Catched error on '+ PluginName, eventParams.pcTargetLanMAC, e);
        process.send('fail');
    }

});