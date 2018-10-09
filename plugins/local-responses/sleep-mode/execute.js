const PluginName = 'sleepmode';
const SleepMode = require('sleep-mode');

process.on('message', (pcTarget) => {
    process.send('start');
    try {

        SleepMode(function (err, stderr, stdout) {
            if (!err && !stderr) {

                console.log(PluginName +' result: '+ stdout);
                process.send('done');
            }
        });

    } catch (e) {
        console.warn('Catched error on '+PluginName, macAddr, e);
        process.send('fail');
    }
});