/* To compile in /dist folder, open cmd and run :
  cd lanSuperv
  npm run build
  
(or: "npm run dev", both commands writed in package.json)
*/



//IF OK, TODO: all libs here:
/*
gun.js
jury.timeago
livestemp
momet
moment-with-locales
theter
toaster
...
*/



//------------------------------------TEST-AJOUT-VUE---------------------------------
import Vue from 'vue';
import VueGun from 'vue-gun';
/*
Vue.use(VueGun, {
    peers: Config.val('GUN_PEERS')
});
*/


let vm = new Vue({
    el: '#app',
    data: {
        message: 'Hello Vue!',
        dbComputers: {},
    },
    methods: {
        sendRequest: function (btn) {
            alert("appel method sendRequest de vue.js !");
            console.log("appel method sendRequest de vue.js !");
        },
    },
    mounted: function() {
        console.log("VUE JS MOUNTED");

        /*
        this.$gun.get(Config.val('TABLE_COMPUTERS')).map().on((node, key) => {
            // add results straight to the Vue component state
            // and get updates when nodes are updated by GUN
            this.dbComputers[key] = node;
        });
        */

    },
});

//-----------------------------------------------------------------------------------


//==================== globals functions ======================
function sendGunMessage(message){
    console.log("execute function sendGunMessage() with msg:");
    console.log(message);
    sharedObject.dbMessages.set(message);
}
function sendRequest(btn){
    let $pc =  $(btn).closest(".pcElem");
    let reqData = {
        eventName: $pc.find('.btn-plugin-value').text(),
        eventResult: '',
        eventSendedAt: new Date().toISOString(),
        eventReceivedAt: null,
        pcTargetLanMAC: $pc.find(".lanMAC").html(),
        pcTargetMachineID: $pc.find(".machineID").html(),
        //-- chat.js --
        type: 'event', //(not text)
        who: localStorage.getItem('userName'), //uname
        when: new Date().toISOString(), //only for display time from now
        //-------------
    };
    //gun.js cant handle JS multiple dimensions objects, only key:value.

    sendGunMessage(reqData);
}
function clearGunDatabase(){
    //https://github.com/amark/gun/wiki/Delete
    //sharedObject.gun.get(Config.val('TABLE_COMPUTERS')).put(null);
    //NOK: Data saved to the root level of the graph must be a node (an object), not a object of "null"!

    let emptyObject = {};
    sharedObject.gun.get(Config.val('TABLE_COMPUTERS')).put(emptyObject);
    sharedObject.gun.get(Config.val('TABLE_COMPUTERS')).once(function(result){
        console.log(result);
    });

    sharedObject.gun.get(Config.val('TABLE_MESSAGES')).put(emptyObject);

    //Other way, more complicated :
    // - localStorage.clear() in every browser
    // - stop the server
    // - rm data.json on server

    //The only way that actually works :
    // - stop server, close browsers
    // - change DATABASE_NAME in config.js
    // - remove visibleComputers.json
    // - restart server and browser
}
//=================================================================================


import clientJS from './client';
clientJS(sendRequest);

import chatJS from './chat';
chatJS(sendGunMessage);



