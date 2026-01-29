const PluginName = 'check';

let F = require("../../../functions.js");

process.on('message', (eventParams) => {
	process.send('start');
    try {
        let respondsTo = eventParams.eventFrom;
        
        // donnes du pc local transmises specifiquement lors de l'execution du plugin check
        let THIS_PC = eventParams.thisPC;
        /*
            hostnameLocal: x,
            lanInterface : {
                ip_address: x,
                mac_address: x
            },
            machineID: x,
            ...
        */
        
        let eventResult = F.checkData(THIS_PC, respondsTo);
        process.send(eventResult);
		
		process.send('end');
        process.exit();

    } catch (e) {
        console.warn('Catched error on '+PluginName, eventParams.pcTargetLanMAC, e);
        process.send('fail');
    }
});