const PluginName = 'poweroff';
const PowerOff = require('power-off');

process.on('message', (pcTarget) => {
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
        console.warn('Catched error on '+PluginName, macAddr, e);
        process.send('fail');
    }
});