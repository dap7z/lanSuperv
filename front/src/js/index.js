/**********************************************************
To compile in /dist folder, open cmd and run :
    cd lanSuperv
    npm run build
(or: "npm run dev", both commands writed in package.json)
***********************************************************/

import Client from './client';
import Chat from './chat';
import WebRTCClient from './webrtcClient';
import { StateManager } from './utils/stateManager.js';

function clearLocalStorage() {
    return new Promise((resolve) => {
        try {
            //console.log("[INDEX.JS] localStorage cleanning...");
            localStorage.clear(); //remove old database saved into browser
            // Use setTimeout to ensure clear is fully processed
            setTimeout(() => {
                console.log("[INDEX.JS] localStorage cleared, initializing app...");
                resolve();
            }, 0);
        } catch (error) {
            console.error("[INDEX.JS] Error clearing localStorage:", error);
            // Continue even if clear fails
            resolve();
        }
    });
}

// Clear localStorage and wait for it to complete before app initialization
clearLocalStorage().then(async () => {
    // Initialiser WebRTC Client
    const webRtcClient = new WebRTCClient(Config);
    await webRtcClient.init();
    console.log("[INDEX.JS] WebRTC client initialized");

    // Créer le StateManager pour remplacer Vue.js
    const stateManager = new StateManager();
    window.stateManager = stateManager; // Pour debug

    // Initialiser l'application
    function initApp() {
        sharedObject.webRtcClient = webRtcClient;
        sharedObject.dbComputers = webRtcClient.get(Config.val('TABLE_COMPUTERS'));
        sharedObject.dbMessages = webRtcClient.get(Config.val('TABLE_MESSAGES'));
        console.log("[INDEX.JS] WebRTC objects initialized - dbComputers:", sharedObject.dbComputers, "dbMessages:", sharedObject.dbMessages);

        // Fonction pour envoyer des messages
        function dbSendMessage(message) {
            try {
                if(!message.eventSendedAt){
                    message.eventSendedAt = new Date().toISOString();
                }
                // Générer un ID unique pour le message
                const messageId = message.eventSendedAt + '_' + Math.random().toString(36).substr(2, 9);
                // Utiliser .get(id).put() au lieu de .set() pour sauvegarder correctement toutes les propriétés
                sharedObject.dbMessages.get(messageId).put(message);
            } catch (error) {
                console.error("[INDEX.JS] ERROR sending message to database:", error, message);
            }
        }

        //execute client.js and chat.js :
        let clientJS = new Client(dbSendMessage);
        clientJS.init();
        let chatJS = new Chat(dbSendMessage);
        chatJS.init();

        //listen on dbComputers database updates
        //.on() automatically loads existing data like .once() AND listens for future changes
        sharedObject.dbComputers.map().on((pc, id) => {
            //console.log("[INDEX.JS] WebRTC dbComputers event triggered - id:", id, "pc:", pc);
            if(pc !== null){ //null si exec dbComputersClearData()
                clientJS.dbOnChangeComputers(pc, id);
                stateManager.updateComputer(id, pc);
            } else {
                console.log("[INDEX.JS] Ignoring null/invalid pc for id:", id);
            }
        });

        sharedObject.dbMessages.map().on((message, id) => {
            clientJS.dbOnChangeMessages(message, id);
            chatJS.dbOnChangeMessages(message, id);
            stateManager.updateMessage(id, message);
        });
        
        // Setup button to show database content
        const dbShowBtn = document.getElementById('dbShowBtn');
        const btnRefreshDb = document.getElementById('btnRefreshDb');
        if (dbShowBtn) {
            dbShowBtn.addEventListener('click', () => {
                showDbContent();
            });
        }
        if (btnRefreshDb) {
            btnRefreshDb.addEventListener('click', () => {
                showDbContent();
            });
        }

        // Setup button to delete all messages
        const btnDeleteDbMessages = document.getElementById('btnDeleteDbMessages');
        if (btnDeleteDbMessages) {
            btnDeleteDbMessages.addEventListener('click', () => {
                const clearAllBtn = document.getElementById('clearAllMessages');
                if (clearAllBtn) {
                    clearAllBtn.click();
                    // Refresh after a short delay to allow the clear action to propagate
                    setTimeout(() => {
                        showDbContent();
                    }, 1000);
                }
            });
        }

        function showDbContent() {
            const dbContent = {
                computers: {},
                messages: {}
            };
            let computersLoaded = 0;
            let messagesLoaded = 0;
            const rootTableComputers = Config.val('TABLE_COMPUTERS');
            const rootTableMessages = Config.val('TABLE_MESSAGES');
            
            // Afficher un message de chargement
            const dbJson = document.getElementById('dbJson');
            const dbStatus = document.getElementById('dbStatus');
            if (dbJson) {
                dbJson.textContent = 'Chargement des données...';
            }
            if (dbStatus) {
                dbStatus.textContent = 'Chargement en cours...';
            }
            
            // Récupérer tous les PCs de dbComputers
            if (sharedObject.dbComputers) {
                sharedObject.dbComputers.map().once((pc, id) => {
                    if (pc !== null && id !== '' && id !== rootTableComputers) {
                        // Cloner l'objet pour éviter les références
                        dbContent.computers[id] = JSON.parse(JSON.stringify(pc));
                        computersLoaded++;
                    }
                });
            }
            
            // Récupérer tous les messages de dbMessages
            if (sharedObject.dbMessages) {
                sharedObject.dbMessages.map().once((message, id) => {
                    if (message !== undefined && message !== null && id !== '' && id !== rootTableMessages) {
                        // Cloner l'objet pour éviter les références
                        //console.log("Processing message:", id, message);
                        try {
                            dbContent.messages[id] = JSON.parse(JSON.stringify(message));
                            messagesLoaded++;
                        } catch (e) {
                            console.warn("Could not parse message for id:", id, message);
                        }
                    }
                });
            }
            
            // Attendre un peu pour que les données soient chargées, puis afficher
            setTimeout(() => {
                try {
                    const jsonContent = JSON.stringify(dbContent, null, 2);
                    if (dbJson) {
                        dbJson.textContent = jsonContent;
                    }
                    const totalCount = Object.keys(dbContent.computers).length + Object.keys(dbContent.messages).length;
                    if (dbStatus) {
                        dbStatus.textContent = 
                            `${Object.keys(dbContent.computers).length} PC(s), ${Object.keys(dbContent.messages).length} message(s) - Total: ${totalCount}`;
                    }
                } catch (error) {
                    console.error("[INDEX.JS] Error displaying database content:", error);
                    if (dbJson) {
                        dbJson.textContent = 'Erreur lors de la sérialisation des données: ' + error.message;
                    }
                    if (dbStatus) {
                        dbStatus.textContent = 'Erreur';
                    }
                }
            }, 2000); // Attendre 2 secondes pour que toutes les données soient chargées
        }
    }

    // Initialize the vanilla js application
    try {
        initApp();
    } catch (error) {
        console.error("[INDEX.JS] ERROR initializing app:", error);
    }
});
