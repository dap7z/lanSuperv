const PluginName = 'poweroff';
const PowerOff = require('power-off');

process.on('message', (eventParams) => {
	process.send('start');
    try {
        PowerOff( function (err, stderr, stdout) {
            //tested on [W7,W10]
            if(!err && !stderr) {
                console.log(PluginName +' result: '+ stdout);
                process.send('done');
            }
        });

    } catch (e) {
        console.warn('Catched error on '+PluginName, eventParams.pcTargetLanMAC, e);
        process.send('fail');
    }
});