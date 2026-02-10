const PluginName = 'screen-joke';
const path = require('path');
const EF = require('./electron-functions');
//Cant use child_process on windows to launch electron:
//Error: Cannot find module 'C:\_DEV_\lanSuperv\electron C:\_DEV_\lanSuperv\plugins\local-responses\screen-joke\app.js


process.on('message', (eventParams) => {
    process.send('start');
    try {
        // Use Electron executable path from environment variable if available
        // In compiled Electron app, we have two problems :
        //   - 'electron' command is not available in PATH
        //   - LANSUPERV_ELECTRON_EXE is lanSuperv.exe (electron-entrypoint.js) which launch the server if not in plugin mode (LANSUPERV_PLUGIN_EXECUTE)
        let electronPath = process.env.LANSUPERV_ELECTRON_EXE || 'electron';
        // Resolve to absolute path to ensure it works in both dev and compiled modes
        const appPath = path.resolve(__dirname, 'app.js');
        
        // Récupérer les options de l'événement depuis eventParams
        const eventOptions = eventParams.eventOptions || {};
        console.log(`[${PluginName}] Event options:`, eventOptions);
        
        // Fichier de verrouillage pour eviter multiple instances electron
        const lockFile = path.join(__dirname, '.screen-joke-lock.json');
        
        // Vérifier d'abord si une instance existe déjà
        let instanceCheck = EF.checkExistingInstance(lockFile, PluginName);
        
        // Si une instance est en train de se lancer, mettre à jour les options (ne pas lancer une nouvelle instance)
        if (instanceCheck === 'launching') {
            const success = EF.updateOptionsIfLaunching(lockFile, eventOptions, PluginName, () => {
                process.send('done');
                // Envoyer un objet avec un message de succès pour la notification
                process.send({ msg: 'screen-joke completed (options updated)' });
                process.send('end');
            });
            if (success) {
                return; // Ne pas lancer une nouvelle instance
            }
        }
        
        // Créer le fichier de verrouillage au plus tot
        const lockFileCreated = EF.createOrUpdateLockFile(lockFile, eventOptions, PluginName, true);
        if (!lockFileCreated) {
            instanceCheck = EF.checkExistingInstance(lockFile, PluginName);
            if (instanceCheck === 'launching') {
                // Une autre instance est en train de se lancer
                // TODO : verifier si on passe reelement ici parfois sinon suppr updateOptionsIfLaunching() 
                const success = EF.updateOptionsIfLaunching(lockFile, eventOptions, PluginName, () => {
                    process.send('done');
                    process.send({ msg: 'screen-joke options updated' });
                    process.send('end');
                });
                if (success) {
                    return; // si une instance est en train de se lancer, on s'arrete ici.
                }
            }
            console.warn(`[${PluginName}] Erreur lors de la création/mise à jour du fichier de verrouillage`);
            process.send('fail');
            process.send('end');
            return;
        }
        
        function launchAppJS() {
            EF.launchAppJS({
                pluginName: PluginName,
                lockFile: lockFile,
                appPath: appPath,
                electronPath: electronPath,
                eventOptions: eventOptions,
                pluginDir: __dirname,
                onExit: (code, pluginName) => {
                    if (code === 0) {
                        process.send('done');
                        // Envoyer un objet avec un message de succès pour la notification
                        process.send({ msg: 'screen-joke completed' });
                    } else {
                        console.warn(`[${pluginName}] Electron s'est terminé avec le code:`, code);
                        process.send('fail');
                        // Envoyer un objet avec un message d'erreur
                        process.send({ msg: 'screen-joke failed (exit code: ' + code + ')' });
                    }
                    process.send('end');
                },
                onError: (error, pluginName) => {
                    console.error(`[${pluginName}] Erreur lors du lancement d'Electron:`, error);
                    process.send('fail');
                }
            });
        }
        
        if (EF.processInstanceCheck(instanceCheck, lockFile, PluginName, launchAppJS)) {
            return;  // si une instance est en train de se lancer, on s'arrete ici.
        }
        
        // Lancer l'application app.js via electron :
        launchAppJS();

    } catch (e) {
        console.warn('Catched error on '+PluginName, eventParams.pcTargetLanMAC, e);
        process.send('fail');
    }
});