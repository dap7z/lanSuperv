const PluginName = 'check';

var F = require("../../../functions.js");

//import {checkData} from '../../../functions.js';
//=> NODEJS9.11 SyntaxError: Unexpected token import


process.on('message', (eventParams) => {
	process.send('start');
    try {
        var THIS_PC = eventParams.pcTarget;
        var respondsTo = eventParams.eventFrom;

        var eventResult = F.checkData(THIS_PC, respondsTo);
        process.send(eventResult);
		
		process.send('end');

    } catch (e) {
        console.warn('Catched error on '+PluginName, e);
        process.send('fail');
    }
});