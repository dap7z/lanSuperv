const PluginName = 'scrennjoke';
const ChildProcess = require('child_process');

const Spawn = require('cross-spawn'); //or shellJS
//Cant use child_process on windows to launch electron:
//Error: Cannot find module 'C:\_DEV_\lanSuperv\electron C:\_DEV_\lanSuperv\plugins\local-responses\screen-joke\app.js


process.on('message', (eventParams) => {
    process.send('start');
    try {

        Spawn('electron '+ __dirname +'/app.js');

    } catch (e) {
        console.warn('Catched error on '+PluginName, macAddr, e);
        process.send('fail');
    }
});