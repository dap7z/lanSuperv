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
/*
import Vue from 'vue';
import VueGun from 'vue-gun';
Vue.use(VueGun, {
    peers: Config.val('GUN_PEERS')
});

let vm = new Vue({
    el: '#app',
    data: {
        message: 'Hello Vue!',
        dbComputers: {},
    },
    mounted: function() {
        console.log("VUE JS MOUNTED");

        //localStorage.clear();
        //let gunPeers = Config.val('GUN_PEERS');
        //console.log("gunPeers: ", gunPeers);
        //sharedObject.gun = new Gun(gunPeers);
        //let tableName = Config.val('TABLE_COMPUTERS');
        //let dbComputers = sharedObject.gun.get(tableName);
        //(same in client.js for ui v1 : jquery)

        this.$gun.get(Config.val('TABLE_COMPUTERS')).map().on((node, key) => {

            // add results straight to the Vue component state
            // and get updates when nodes are updated by GUN
            this.dbComputers[key] = node;
        });
    },
});
*/
//-----------------------------------------------------------------------------------


function sendGunMessage(message){
    console.log("execute function sendGunMessage() with msg:");
    console.log(message);
    sharedObject.dbMessages.set(message);
}

import clientJS from './client';
clientJS(sendGunMessage);

import chatJS from './chat';
chatJS(sendGunMessage);



