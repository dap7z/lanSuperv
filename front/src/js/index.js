/**********************************************************
To compile in /dist folder, open cmd and run :
    cd lanSuperv
    npm run build
(or: "npm run dev", both commands writed in package.json)
***********************************************************/

import Client from './client';
import Chat from './chat';
import WebRTCClient from './webrtcClient';

import { createApp, getCurrentInstance } from 'vue';


function clearLocalStorage() {
    return new Promise((resolve) => {
        try {
            console.log("[INDEX.JS] localStorage cleanning...");
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
    const webrtcClient = new WebRTCClient(Config);
    await webrtcClient.init();
    console.log("[INDEX.JS] WebRTC client initialized");

    // Créer l'application Vue 3
    const app = createApp({
        data() {
            return {
                // here only array for data binding, no complex objects :
                dbComputersModel: [],
                dbMessagesModel: [],
            };
        },
        mounted: function() {

            //update sharedObject avec WebRTC (compatible API Gun.js) :
            sharedObject.gun = webrtcClient; // Pour compatibilité
            sharedObject.dbComputers = webrtcClient.get(Config.val('TABLE_COMPUTERS'));
            sharedObject.dbMessages = webrtcClient.get(Config.val('TABLE_MESSAGES'));
            console.log("[INDEX.JS] WebRTC objects initialized - dbComputers:", sharedObject.dbComputers, "dbMessages:", sharedObject.dbMessages);

            //execute client.js and chat.js :
            let clientJS = new Client(this.gunSendMessage);
            clientJS.init();
            let chatJS = new Chat(this.gunSendMessage);
            chatJS.init();

            //listen on dbComputers database updates
            //.on() automatically loads existing data like .once() AND listens for future changes
            sharedObject.dbComputers.map().on((pc, id) => {
                console.log("[INDEX.JS] WebRTC dbComputers event triggered - id:", id, "pc:", pc);
                if(pc !== null){ //null si exec dbComputersClearData()

                    clientJS.gunOnChangeDbComputers(pc, id);
                    this.dbComputersModel[id] = pc;
                } else {
                    console.log("[INDEX.JS] Ignoring null/invalid pc for id:", id);
                }
            });

            sharedObject.dbMessages.map().on((message, id) => {
                clientJS.gunOnChangeDbMessages(message, id);
                chatJS.gunOnChangeDbMessages(message, id);
                this.dbMessagesModel[id] = message; //OK?
            });
            
            // Setup button to show Gun.js database content
            const gunDbShowBtn = document.getElementById('gunDbShowBtn');
            const btnRefreshGunDb = document.getElementById('btnRefreshGunDb');
            if (gunDbShowBtn) {
                gunDbShowBtn.addEventListener('click', () => {
                    this.showGunDbContent();
                });
            }
            if (btnRefreshGunDb) {
                btnRefreshGunDb.addEventListener('click', () => {
                    this.showGunDbContent();
                });
            }

            // Setup button to delete all messages
            const btnDeleteGunMessages = document.getElementById('btnDeleteGunMessages');
            if (btnDeleteGunMessages) {
                btnDeleteGunMessages.addEventListener('click', () => {
                    const clearAllBtn = document.getElementById('clearAllMessages');
                    if (clearAllBtn) {
                        clearAllBtn.click();
                        // Refresh after a short delay to allow the clear action to propagate
                        setTimeout(() => {
                            this.showGunDbContent();
                        }, 1000);
                    }
                });
            }
        },
        methods: {
            gunSendMessage: function(message){
                try {
                    // Générer un ID unique pour le message
                    const messageId = message.eventSendedAt + '_' + Math.random().toString(36).substr(2, 9);
                    // Utiliser .get(id).put() au lieu de .set() pour sauvegarder correctement toutes les propriétés
                    sharedObject.dbMessages.get(messageId).put(message);
                    //console.log("[CLIENT] Message sent to Gun.js:", message);
                } catch (error) {
                    console.error("[CLIENT] ERROR sending message to Gun.js:", error);
                }
            },
            showGunDbContent: function() {
                const dbContent = {
                    computers: {},
                    messages: {}
                };
                let computersLoaded = 0;
                let messagesLoaded = 0;
                const rootTableComputers = Config.val('TABLE_COMPUTERS');
                const rootTableMessages = Config.val('TABLE_MESSAGES');
                
                // Afficher un message de chargement
                document.getElementById('gunDbJson').textContent = 'Chargement des données...';
                document.getElementById('gunDbStatus').textContent = 'Chargement en cours...';
                
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
                        document.getElementById('gunDbJson').textContent = jsonContent;
                        const totalCount = Object.keys(dbContent.computers).length + Object.keys(dbContent.messages).length;
                        document.getElementById('gunDbStatus').textContent = 
                            `${Object.keys(dbContent.computers).length} PC(s), ${Object.keys(dbContent.messages).length} message(s) - Total: ${totalCount}`;
                    } catch (error) {
                        console.error("[INDEX.JS] Error displaying Gun.js content:", error);
                        document.getElementById('gunDbJson').textContent = 'Erreur lors de la sérialisation des données: ' + error.message;
                        document.getElementById('gunDbStatus').textContent = 'Erreur';
                    }
                }, 2000); // Attendre 2 secondes pour que toutes les données soient chargées
            }
        }
    });

    // Configurer pour Vue 3 (compatibilité)
    app.config.globalProperties.$gun = webrtcClient;

    // Monter l'application
    console.log("[INDEX.JS] Mounting Vue app to #app");
    try {
        app.mount('#app');
        console.log("[INDEX.JS] Vue app mounted successfully");
    } catch (error) {
        console.error("[INDEX.JS] ERROR mounting Vue app:", error);
    }
});
