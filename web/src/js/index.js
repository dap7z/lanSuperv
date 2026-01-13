/**********************************************************
To compile in /dist folder, open cmd and run :
    cd lanSuperv
    npm run build
(or: "npm run dev", both commands writed in package.json)
***********************************************************/

import Client from './client';
import Chat from './chat';


import { createApp, getCurrentInstance } from 'vue';
import VueGun from 'vue-gun';
const Gun = require('gun');
localStorage.clear(); //remove old database saved into browser
let gunPeers = Config.val('GUN_PEERS');

// Initialiser Gun.js

const gunInstance = Gun({
    peers: gunPeers
});
console.log("[INDEX.JS] Gun.js instance created:", gunInstance);

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

        //update sharedObject :
        sharedObject.gun = gunInstance;
        sharedObject.dbComputers = gunInstance.get(Config.val('TABLE_COMPUTERS'));
        sharedObject.dbMessages = gunInstance.get(Config.val('TABLE_MESSAGES'));
        console.log("[INDEX.JS] Gun.js objects initialized - dbComputers:", sharedObject.dbComputers, "dbMessages:", sharedObject.dbMessages);

        //execute client.js and chat.js :
        let clientJS = new Client(this.gunSendMessage);
        clientJS.init();
        let chatJS = new Chat(this.gunSendMessage);
        chatJS.init();

        //listen on dbComputers database updates :
        sharedObject.dbComputers.map().on((pc, id) => {
            console.log("[INDEX.JS] Gun.js dbComputers event triggered - id:", id, "pc:", pc);
            if(pc !== null){ //null si exec dbComputersClearData()

                clientJS.gunOnChangeDbComputers(pc, id);
                this.dbComputersModel[id] = pc;
            } else {
                console.log("[INDEX.JS] Ignoring null pc for id:", id);
            }
        });

        sharedObject.dbMessages.map().on((message, id) => {
            clientJS.gunOnChangeDbMessages(message, id);
            chatJS.gunOnChangeDbMessages(message, id);
            this.dbMessagesModel[id] = message; //OK?
        });
    },
    methods: {
        gunSendMessage: function(message){
            //console.log("execute function gunSendMessage() with msg:");
            //console.log(message);
            sharedObject.dbMessages.set(message);
        },
    },
});

// Configurer vue-gun pour Vue 3
// vue-gun utilise Vue.prototype.$gun, mais Vue 3 utilise app.config.globalProperties
app.config.globalProperties.$gun = gunInstance;

// Monter l'application
console.log("[INDEX.JS] Mounting Vue app to #app");
try {
    app.mount('#app');
    console.log("[INDEX.JS] Vue app mounted successfully");
} catch (error) {
    console.error("[INDEX.JS] ERROR mounting Vue app:", error);
}
