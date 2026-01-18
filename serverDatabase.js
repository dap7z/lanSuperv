let F = require('./functions.js'); //FONCTIONS
let G = null; //GLOBALS

//LIBRARIES:
const Fs = require('fs');
const Gun = require('gun');
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
        // Protection contre la double initialisation
        if (G.GUN) {
            console.log("[GUN.JS] WARNING! Gun.js already initialized, skipping initConnection()");
            return;
        }
		
        const dbPath = Path.join(__dirname, G.CONFIG.val('FILE_SHARED_DB'));  //ex: T:\GITLAB\lanSuperv\db1-shared.json
        console.log("[GUN.JS] Database path (file or directory depending gun.js option radisk) : " + dbPath);

        //DECENTRALIZED DB (GUN.JS)
        let gunOptions = {};
        if (G.CONFIG.val('LOCAL_DATABASE')) {
            //local gun url (json file storage) + remote gun url :
            // Utiliser le même serveur Express pour HTTP et WebSocket
            gunOptions = {
                file: dbPath,
                peers: G.CONFIG.val('GUN_PEERS'),
                web: G.WEB_SERVER_INSTANCE,
                //radisk: false  // Désactiver radisk comme dans gunjs-notes-app, sans oublier de renseigner file... mais ne fonctionne pas ici
                radisk: true     // Avec cette option, le debug database gun.js 10sec apres lancement serveur fonctione.

            };
            
            // On s'assure que le serveur est bien défini
            if (!gunOptions.web) {
                console.error("[GUN.JS] ERROR! WEB_SERVER_INSTANCE is not defined");
                return;
            }
            

        } else {
            //only remote gun url :
            gunOptions = {peers: G.CONFIG.val('GUN_PEERS')};
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

        try {
            // Initialiser Gun.js
            // Note: Gun.js va automatiquement ajouter un listener 'upgrade' sur le serveur HTTP
            // pour gérer les WebSockets sur le chemin /gun
            G.GUN = Gun(gunOptions);
            G.GUN_DB_COMPUTERS = G.GUN.get(G.CONFIG.val('TABLE_COMPUTERS'));
            G.GUN_DB_MESSAGES = G.GUN.get(G.CONFIG.val('TABLE_MESSAGES'));
            console.log("[GUN.JS] Gun.js initialized successfully");
            
            // Vérification post-initialisation
            if (gunOptions.web && gunOptions.web.on) {
                const upgradeListeners = gunOptions.web.listeners('upgrade');
                console.log("[GUN.JS] Server now has " + upgradeListeners.length + " upgrade listener(s)");
            }
        } catch (err) {
            console.error("[GUN.JS] ERROR! Failed to initialize Gun.js:", err);
            console.error("[GUN.JS] Error stack:", err.stack);
            throw err;
        }
    }

    dbComputersSaveData(idPC, value, logId){
        if (typeof G.GUN_DB_COMPUTERS === 'undefined') {
            console.log("WARNING! dbComputersSaveData() gun.js dbComputers required !");
            return;
        }

        if (idPC) {
            // Gun.js nécessite des Strings pour les clés, donc on s'assure que idPC est toujours une String.
            idPC = String(idPC);
        }else{
            console.log("WARNING! dbComputersSaveData() idPC required !");
            return;
        }
        
        // Vérifier si value est un objet vide
        if (value && typeof value === 'object' && Object.keys(value).length === 0) {
            // Objet vide : réinitialiser les données
            G.GUN_DB_COMPUTERS.get(idPC).put({});
            return;
        }
        
        // Récupérer le noeud Gun.js
        const gunNode = G.GUN_DB_COMPUTERS.get(idPC);
        
        // Sauvegarde dans la bdd Gun.js :
        // Si possible utiliser put() avec l'objet complet pour limiter les synchronisations
        // (dans le cas où l'objet serait partiel il faudrait sauvegarder chaque propriété séparément pour ne pas ecraser les données existantes)
        try {
            gunNode.put(value);
            console.log(`[DATABASE] Save PC - idPC: ${idPC}, keys: ${Object.keys(value).length}, hostname: ${value.hostname || 'N/A'}`);
        } catch (error) {
            console.error(`[DATABASE] ERROR saving PC - idPC: ${idPC}, error:`, error);
        }

        if(logId){
            F.logCheckResult(logId, value);
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

    // Nettoyer les messages de plus d'une heure (uniquement en mode local)
    dbMessagesCleanup(){
        if (!G.GUN_DB_MESSAGES) {
            console.log("[DATABASE] WARNING! G.GUN_DB_MESSAGES not initialized, skipping cleanup");
            return;
        }

        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        let deletedCount = 0;

        console.log(`[DATABASE] Starting cleanup of messages older than 1 hour (before ${oneHourAgo})`);

        G.GUN_DB_MESSAGES.map().once((message, id) => {
            if (!message || !id) return;

            // Vérifier si le message a plus d'une heure
            let messageDate = null;
            if (message.eventSendedAt) {
                messageDate = new Date(message.eventSendedAt);
            } else if (message.eventReceivedAt) {
                messageDate = new Date(message.eventReceivedAt);
            }

            if (messageDate && messageDate < new Date(oneHourAgo)) {
                // Supprimer le message
                G.GUN_DB_MESSAGES.get(id).put(null);
                deletedCount++;
            }
        });

        // Attendre un peu pour que tous les messages soient traités
        setTimeout(() => {
            if (deletedCount > 0) {
                console.log(`[DATABASE] Cleanup completed: ${deletedCount} message(s) deleted`);
            } else {
                console.log(`[DATABASE] Cleanup completed: no messages to delete`);
            }
        }, 1000);
    }

    // Démarrer le nettoyage périodique de la table messages si l'application est en mode local (maitre).
    startMessagesCleanupInterval(){
        if (G.CONFIG.val('LOCAL_DATABASE')) {
            setInterval(() => {
                console.log("[DATABASE] ==== Periodic cleanup of old messages (every hour) ====");
                this.dbMessagesCleanup(); // Nettoyer toutes les heures
            }, 60 * 60 * 1000); // 1 heure en millisecondes
        }
    }

    // Ping manuel pour maintenir la connexion WebSocket Gun.js ouverte
    // Écrit périodiquement dans un noeud spécial pour forcer la synchronisation et maintenir la connexion active
    pingGunConnection(){
        if (!G.GUN || !G.GUN_DB_MESSAGES) {
            console.log("[GUN-PING] WARNING! Gun.js not initialized, skipping ping");
            return;
        }

        // Créer un noeud spécial pour le ping (ne sera jamais utilisé pour des événements réels)
        const pingNode = G.GUN_DB_MESSAGES.get('_ping_keepalive');
        const pingData = {
            timestamp: new Date().toISOString(),
            idPC: G.THIS_PC.idPC || 'unknown',
            hostname: G.THIS_PC.hostnameLocal || 'unknown'
        };

        // Mettre à jour le noeud ping pour forcer une synchronisation avec les peers
        pingNode.put(pingData, (ack) => {
            // Callback optionnel pour confirmer l'écriture
            if (ack && ack.err) {
                console.log("[GUN-PING] Ping sent but got error:", ack.err);
            } else {
                // Ping réussi - la connexion est maintenue
                // Ne pas logger à chaque ping pour éviter le spam, seulement en cas d'erreur
            }
        });
    }

    // Démarrer le ping périodique pour maintenir la connexion WebSocket active
    // Surtout utile en mode remote-only (quand LOCAL_DATABASE = false)
    startGunPingInterval(){
        if (!G.GUN) {
            console.log("[GUN-PING] WARNING! Gun.js not initialized, cannot start ping interval");
            return;
        }

        // Ping toutes les 30 secondes pour maintenir la connexion active
        // (les timeouts WebSocket sont généralement de 60-120 secondes)
        const pingInterval = 30 * 1000; // 30 secondes

        // Ping la database gun.js à interval regulier pour maintenir la connexion active
        setInterval(() => {
            console.log("[GUN-PING] Periodic ping to keep WebSocket connection alive (every " + (pingInterval/1000) + " seconds)");
            this.pingGunConnection();
        }, pingInterval);
        // ... ok la connexion est maintenue mais on recoi tjrs pas les evt en temps reel en provenance du rasp
        // ni en rechargeant l'application dailleurs....
    }


}


module.exports = ServerDatabase;