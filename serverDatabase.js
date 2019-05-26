let F = require(__dirname + '/functions'); //FONCTIONS
let G = null; //GLOBALS

//LIBRARIES:
const Fs = require('fs');
const Gun = require('gun');

/**
 * This class handle the data persistance layer
 * (make it easy to switch from an librairie to another)
 */
class ServerDatabase {

    constructor(G_ref) {
        G = G_ref;
    }

    initConnection(){
        //DECENTRALIZED DB (GUN.JS)
        let gunOptions = {};
        if (G.CONFIG.val('LOCAL_DATABASE')) {
            //local gun url (json file storage) + remote gun url :
            gunOptions = {
                file: G.CONFIG.val('FILE_SHARED_DB'),
                peers: G.CONFIG.val('GUN_PEERS'),
                web: G.WEB_SERVER_INSTANCE,
            };
            //NOK WINDOWS, RESULTATS TEST 20180915:
            //{ file: 'D:\\SRV_APACHE\\lanSuperv\\db1-shared.json',
            //	peers: [ 'http://main-server.fr.cr:842/gun' ],
            //	web: '[exclude from dump]' }
            //(node:14688) UnhandledPromiseRejectionWarning: TypeError: this.ee.on is not a function
            //at Ultron.on (D:\SRV_APACHE\lanSuperv\node_modules\ultron\index.js:42:11)
            //at new WebSocketServer (D:\SRV_APACHE\lanSuperv\node_modules\gun\node_modules\ws\lib\websocket-server.js:85:20)

            //VOIR:
            //https://github.com/amark/gun/issues/422
            //https://github.com/mochiapp/gun/commit/fd0866ed872f6acb8537541e1c3b06f18648420a
            //... pourtant merged ...

        } else {
            //only remote gun url :
            gunOptions = G.CONFIG.val('SOCKET_URL_DATABASE');
            //PASSE ICI DANS LE CAS LANSUPERV LANCER SUR PC-XX-LAN AVEC :
            //	PARAMS['SERVER_ADDRESS'] = 'http://main-server.fr.cr';
            //	PARAMS['GUN_ADDITIONAL_PEERS'] = [];
            //=> http://main-server.fr.cr:842/gun
            //
            //OK RESULTATS TEST 20180915:
            // - l'arret PC-XX-LAN peut bien être declenché depuis l'exterieur en https derriere reverse proxy
            // - l'arret PC-XX-LAN peut bien être declenché depuis localhost en http port 842
        }

        //----- DUMP GUN.JS OPTIONS -----
        let gunOptionsDump = Object.assign({}, gunOptions); //clone to not modify gunOptions
        if (gunOptionsDump.web) {
            gunOptionsDump.web = '[exclude from dump]';
        }
        console.log("[GUN.JS] LOCAL_DATABASE='" + G.CONFIG.val('LOCAL_DATABASE') + "', OPTIONS:");
        console.log(gunOptionsDump);

        G.GUN = Gun(gunOptions);
        G.GUN_DB_COMPUTERS = G.GUN.get(G.CONFIG.val('TABLE_COMPUTERS'));
        G.GUN_DB_MESSAGES = G.GUN.get(G.CONFIG.val('TABLE_MESSAGES'));
    }

    //---------------------------------------- TODO ------------------------------------------
    /*
    loadData(tableName) {
        return new Promise(function (resolve) {

            // Ping(hostAddress, {timeout: 4})
            //     .catch(function (res) {
            //         //required to resolve(finalResult) after ping fail
            //     }).then(function (res) {
            //     let finalResult = {
            //         idPC: idPC,
            //         lanIP: ip,
            //         'respondsTo-ping': res.alive
            //     };
            //     //res.time non supporte par npm package ping-bluebird
            //     if (finalResult["respondsTo-ping"]) {
            //         //add lastResponse (already in F.checkData() for httpCheck and socketCheck)
            //         finalResult.lastResponse = new Date().toISOString();
            //     }
            //     resolve(finalResult);
            // });

        });
    }

    saveData(tableName, data) {
        return new Promise(function (resolve) {
            //...
        });
    }
    */


}


module.exports = ServerDatabase;