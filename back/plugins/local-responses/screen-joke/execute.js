const PluginName = 'screen-joke';
const path = require('path');
const Spawn = require('cross-spawn'); //or shellJS
//Cant use child_process on windows to launch electron:
//Error: Cannot find module 'C:\_DEV_\lanSuperv\electron C:\_DEV_\lanSuperv\plugins\local-responses\screen-joke\app.js


process.on('message', (eventParams) => {
    process.send('start');
    try {
        const electronPath = 'electron';
        const appPath = path.join(__dirname, 'app.js');
        
        const child = Spawn(electronPath, [appPath], {
            stdio: 'inherit',
            cwd: __dirname
        });
        
        child.on('error', (error) => {
            console.error('Erreur lors du lancement d\'Electron:', error);
            process.send('fail');
        });
        
        child.on('exit', (code) => {
            if (code === 0) {
                process.send('done');
            } else {
                console.warn('Electron s\'est terminé avec le code:', code);
                process.send('fail');
            }
            process.send('end');
        });

    } catch (e) {
        console.warn('Catched error on '+PluginName, eventParams.pcTargetLanMAC, e);
        process.send('fail');
    }
});