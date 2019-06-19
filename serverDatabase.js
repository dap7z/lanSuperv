let F = require('./functions.js'); //FONCTIONS
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
        G.VISIBLE_COMPUTERS_FILE = __dirname+'/visibleComputers.json';
        G.VISIBLE_COMPUTERS = new Map();
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

    dbComputersSaveData(idPC, value, logId){
        if (typeof G.GUN_DB_COMPUTERS === 'undefined') {
            console.log("WARNING! dbComputersSaveData("+ key +") gun.js dbComputers required !");
        }
        if(value === {}){
            G.GUN_DB_COMPUTERS.get(key).put(value);
        }
        else if(idPC)
        {
            G.GUN_DB_COMPUTERS.get(idPC).once(function (pcToUpdate, id) {
                if(typeof pcToUpdate === 'undefined' || pcToUpdate === null){
                    pcToUpdate = {};
                }
                for (let key in value) {
                    pcToUpdate[key] = value[key];
                }
                G.GUN_DB_COMPUTERS.get(idPC).put(pcToUpdate);
                if(logId){
                    F.logCheckResult(logId, pcToUpdate);
                }
            });
        }else{
            console.log('ERROR! dbComputersSaveData() undefined idPC');
        }
    }

    dbComputersClearData(){
        G.GUN_DB_COMPUTERS.map().once((pc, id) => {
            G.GUN_DB_COMPUTERS.get(id).put(null);
        });
    }

    //--------------------------- START LOCAL DATABASE ----------------------------
    dbVisibleComputersLoad(){
        Fs.readFile(G.VISIBLE_COMPUTERS_FILE, 'utf8', function (err, data) {
            if (err) {
                console.log("WARNING! cant read file: " + G.VISIBLE_COMPUTERS_FILE);
                //console.log(err) //example: file doesnt exist after a fresh install
            } else {
                G.VISIBLE_COMPUTERS = F.jsonToStrMap(data);
                //console.log(G.VISIBLE_COMPUTERS);
            }
        });
    }

    dbVisibleComputersSave(){
        //save G.VISIBLE_COMPUTERS map in json file for reloading after restart
        Fs.writeFile(G.VISIBLE_COMPUTERS_FILE, F.strMapToJson(G.VISIBLE_COMPUTERS), 'binary', function (err) {
            if (err) console.log(err);
        });
        //console.log("[INFO] Save G.VISIBLE_COMPUTERS: " + G.VISIBLE_COMPUTERS_FILE);
        //console.log(G.VISIBLE_COMPUTERS);
    }
    //---------------------------- END LOCAL DATABASE -----------------------------


}


module.exports = ServerDatabase;