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
        G.VISIBLE_COMPUTERS_FILE = __dirname+'/visibleComputers.json';
        G.VISIBLE_COMPUTERS = new Map();
    }

    initConnection(){
        // WebRTC remplace Gun.js pour la synchronisation de données
        // L'initialisation de WebRTC se fait dans server.js via ServerWebRTCManager
        console.log("[DATABASE] Database initialized (using WebRTC for synchronization)");
    }

    dbComputersSaveData(idPC, value, logId){
        if (idPC) {
            idPC = String(idPC);
        }else{
            console.log("WARNING! dbComputersSaveData() idPC required !");
            return;
        }
        
        // Vérifier si value est un objet vide
        if (value && typeof value === 'object' && Object.keys(value).length === 0) {
            // Objet vide : réinitialiser les données
            if (G.webrtcManager) {
                G.webrtcManager.deleteData('computers', idPC);
            }
            return;
        }
        
        // Sauvegarder via WebRTC (synchronisation P2P)
        if (G.webrtcManager) {
            G.webrtcManager.saveData('computers', idPC, value);
        }

        if(logId){
            F.logCheckResult(logId, value);
        }
    }

    dbComputersClearData(){
        // Supprimer via WebRTC
        if (G.webrtcManager) {
            const allComputers = G.webrtcManager.getAllData('computers');
            allComputers.forEach((pc, id) => {
                G.webrtcManager.deleteData('computers', id);
            });
        }
    }

    /**
     * Sauvegarde un message dans la base de données (WebRTC)
     */
    dbMessagesSaveData(messageId, messageData) {
        // Sauvegarder via WebRTC (synchronisation P2P)
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