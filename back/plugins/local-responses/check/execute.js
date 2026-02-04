const PluginName = 'check';

let F = require("../../../functions.js");
const ServerPluginsInfos = require("../../../serverPluginsInfos.js");

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
        
        // Récupérer les infos des plugins pour passer à checkData
        let PLUGINS_INFOS = ServerPluginsInfos.build();
        
        let eventResult = F.checkData(THIS_PC, respondsTo, PLUGINS_INFOS);
        
        // Détecter les vidéos disponibles du plugin screen-joke
        if (PLUGINS_INFOS['screen-joke'] && PLUGINS_INFOS['screen-joke'].isEnabled) {
            const screenJokeDir = PLUGINS_INFOS['screen-joke'].dirPath;
            const availableVideos = F.listAvailableVideos(screenJokeDir);
            
            // Construire la liste des options : webcam-mirror par défaut + vidéos disponibles
            let optionsList = ['webcam-mirror']; // Option par défaut toujours disponible
            
            if (availableVideos.length > 0) {
                // Ajouter les options de vidéos disponibles
                const videoOptions = availableVideos.map(v => v.option);
                optionsList = optionsList.concat(videoOptions);
            }
            
            // Format JSON pour les options : structure avec champs définis
            // Format: screen-joke-videos = JSON avec structure {type: {type: 'radio', options: [...]}, ...}
            const optionsConfig = {
                type: {
                    type: 'radio',
                    options: optionsList
                },
                loop: {
                    type: 'radio',
                    options: ['yes', 'no'],
                    defaultValue: 'no'
                }
            };
            
            // Options disponibles pour screen-joke
            eventResult['screen-joke-videos'] = JSON.stringify(optionsConfig);
        }
        
        process.send(eventResult);
		
		process.send('end');
        process.exit();

    } catch (e) {
        console.warn('Catched error on '+PluginName, eventParams.pcTargetLanMAC, e);
        process.send('fail');
    }
});