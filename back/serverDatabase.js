let F = require('./functions.js'); //FONCTIONS
let G = null; //GLOBALS

//LIBRARIES:
const Fs = require('fs');
const Path = require('path');

/**
 * This class handle the data persistance layer
 * (make it easy to switch from an librairie to another)
 */
class ServerDatabase {

    constructor(G_ref) {
        G = G_ref;
        const F = require('./functions');
        G.VISIBLE_COMPUTERS_FILE = Path.join(F.getAppDirectory(), 'visibleComputers.json');
        G.VISIBLE_COMPUTERS = new Map();
    }

    initConnection(){
        // WebRTC replaces Gun.js for data synchronization
        // WebRTC initialization is done in server.js via ServerWebRTCManager
        console.log("[DATABASE] Database initialized (using WebRTC for synchronization)");
    }

    dbComputersSaveData(idPC, value, logId){
        if (idPC) {
            idPC = String(idPC);
        }else{
            console.log("WARNING! dbComputersSaveData() idPC required !");
            return;
        }
        
        // Check if value is an empty object
        if (value && typeof value === 'object' && Object.keys(value).length === 0) {
            // Empty object: reset data
            if (G.webrtcManager) {
                G.webrtcManager.deleteData('computers', idPC);
            }
            return;
        }
        
        // Save via WebRTC (P2P synchronization)
        if (G.webrtcManager) {
            G.webrtcManager.saveData('computers', idPC, value);
        }

        if(logId){
            F.logCheckResult(logId, value);
        }
    }

    dbComputersClearData(){
        // Delete via WebRTC
        if (G.webrtcManager) {
            const allComputers = G.webrtcManager.getAllData('computers');
            allComputers.forEach((pc, id) => {
                G.webrtcManager.deleteData('computers', id);
            });
        }
    }

    /**
     * Saves a message to the database (WebRTC)
     */
    dbMessagesSaveData(messageId, messageData) {
        // Save via WebRTC (P2P synchronization)
        if (G.webrtcManager) {
            G.webrtcManager.saveData('messages', messageId, messageData);
        }
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