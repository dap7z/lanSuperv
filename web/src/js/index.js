/**********************************************************
To compile in /dist folder, open cmd and run :
    cd lanSuperv
    npm run build
(or: "npm run dev", both commands writed in package.json)
***********************************************************/

import Client from './client';
import Chat from './chat';


import Vue from 'vue';
import VueGun from 'vue-gun';
localStorage.clear(); //remove old database saved into browser
let gunPeers = Config.val('GUN_PEERS');
console.log("gunPeers: ", gunPeers);
Vue.use(VueGun, {
    peers: gunPeers
});


new Vue({
    el: '#app',
    data: {
        //we do not put gun js instance here ( complex object), only array for data binding :
        dbComputersModel: [],
        dbMessagesModel: [],
    },
    mounted: function() {
        //update sharedObject :
        sharedObject.gun = this.$gun;
        sharedObject.dbComputers = this.$gun.get(Config.val('TABLE_COMPUTERS'));
        sharedObject.dbMessages = this.$gun.get(Config.val('TABLE_MESSAGES'));

        //execute client.js and chat.js :
        let clientJS = new Client(this.gunSendMessage);
        clientJS.init();
        let chatJS = new Chat(this.gunSendMessage);
        chatJS.init();

        //add results straight to the Vue component state and get updates when nodes are updated by GUN :
        sharedObject.dbComputers.map().on((pc, id) => {
            clientJS.gunOnChangeDbComputers(pc, id);
            this.dbComputersModel[id] = pc;  //OK?
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
        gunClearDatabase: function(){
            //https://github.com/amark/gun/wiki/Delete
            //sharedObject.dbComputers.put(null);
            //NOK: Data saved to the root level of the graph must be a node (an object), not a object of "null"!

            let emptyObject = {};
            sharedObject.dbComputers.put(emptyObject);
            sharedObject.dbComputers.once(function(result){
                console.log(result);
            });

            sharedObject.dbMessages.put(emptyObject);

            //Other way, more complicated :
            // - localStorage.clear() in every browser
            // - stop the server
            // - rm data.json on server

            //The only way that actually works :
            // - stop server, close browsers
            // - change DATABASE_NAME in config.js
            // - remove visibleComputers.json
            // - restart server and browser
        },
    },
});