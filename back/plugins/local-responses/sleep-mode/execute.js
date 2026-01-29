const PluginName = 'sleepmode';
const SleepMode = require('sleep-mode');

process.on('message', (eventParams) => {
    process.send('start');
    try {

        SleepMode(function (err, stderr, stdout) {
            if (!err && !stderr) {

                console.log(PluginName +' result: '+ stdout);
                process.send('done');
            }
        });

    } catch (e) {
        console.warn('Catched error on '+PluginName, eventParams.pcTargetLanMAC, e);
        process.send('fail');
    }
});