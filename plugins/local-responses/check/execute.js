const PluginName = 'check';

let F = require("../../../functions.js");

//import {checkData} from '../../../functions.js';
//=> NODEJS9.11 SyntaxError: Unexpected token import


process.on('message', (eventParams) => {
	process.send('start');
    try {
        let THIS_PC = eventParams.pcTarget;
        let respondsTo = eventParams.eventFrom;

        let eventResult = F.checkData(THIS_PC, respondsTo);
        process.send(eventResult);
		
		process.send('end');
        process.exit();

    } catch (e) {
        console.warn('Catched error on '+PluginName, e);
        process.send('fail');
    }
});