/*************************************************************************************
 lanSuperv :
 - affiche les pc connectés et deconnectés du reseau local du serveur.
 - permet d'envoyer des packets WakeOnLan
 prochaines versions :
 - server.js installable sur toutes les machines permettant :
 poweroff / messanger / filetransfert / netsharing / remotecontrole / ...
 *************************************************************************************/


//LIBRARIES:
const Os = require('os');
const NodeMachineId = require('node-machine-id');

const Path = require('path');

const Express = require('express'); //nodejs framework
const BodyParser = require('body-parser'); //to get POST data
const Gun = require('gun'); //Gun.js database

const Crypto = require('crypto');  //hash machineID


const LanDiscovery = require('lan-discovery');

const IsPortAvailable = require('is-port-available');

let F = require('./functions.js'); //FONCTIONS


//--GLOBALS--
let G = {
    CONFIG_FILE: null,
    CONFIG: null,
    SCAN_IN_PROGRESS: false,
    THIS_PC: {
        hostnameLocal: Os.hostname(),
        machineID: null,
        idPC: null,
        lanInterface: null,
        wanInterface: null
    },
    VISIBLE_COMPUTERS_FILE: null,
    VISIBLE_COMPUTERS: null,
    SCANNED_COMPUTERS: null, //(reset before each scan)
    SCAN_NETWORK: null,
    PLUGINS_INFOS: [],
    WEB_SERVER: null,
    WEB_SERVER_INSTANCE: null,
    GUN: null,
    GUN_DB_MESSAGES: null,
    GUN_DB_COMPUTERS: null,
    LAN_DISCOVERY: null,
};



class Server {

    constructor(configFileAbsolutePath) {
        if(! configFileAbsolutePath){
            const path = require('path');
            configFileAbsolutePath = path.join(process.cwd(), 'config.js');
            console.log('no config file path specified, assume :', configFileAbsolutePath);
        }
        G.CONFIG_FILE = configFileAbsolutePath;
        G.CONFIG = require(configFileAbsolutePath);
    }

    start(){
        //---------------------------------------------------------------------------------------------------------------------------------------------------------------

        //----- LAUNCH HTTP SERVER -----
        G.WEB_SERVER = Express();
        G.WEB_SERVER.set('port', G.CONFIG.val('SERVER_PORT') );
        
        // Ajouter Gun.serve AVANT les autres middlewares pour gérer correctement les WebSockets
        // Les WebSockets nécessitent un traitement spécial et doivent être gérés avant les routes statiques
        G.WEB_SERVER.use(Gun.serve);
        
        // Serve static files with cache-control headers to force reload on every page load
        G.WEB_SERVER.use(Express.static(Path.join(__dirname, 'web'), {
            setHeaders: function(res, path) {
                // Disable caching for all static files
                res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
                res.setHeader('Pragma', 'no-cache');
                res.setHeader('Expires', '0');
                res.setHeader('Surrogate-Control', 'no-store');
                // Remove ETag to prevent conditional requests
                res.removeHeader('ETag');
            }
        }));
        //__dirname is native Node variable which contains the file path of the current folder
        G.WEB_SERVER.use(BodyParser.urlencoded({extended: false}));   //to get POST data
        //extended: false means you are parsing strings only (not parsing images/videos..etc)
        G.WEB_SERVER.use(BodyParser.json());

        // route middleware that will happen on every request
        let appRouter = Express.Router();
        appRouter.use(function(req, res, next) {
            console.log("[HTTP] " + req.method, req.url);
            // continue doing what we were doing and go to the route
            next();
        });

        //errorHandler has to be last defined:
        G.WEB_SERVER.use(function(err, req, res, next) {
            console.error(err.stack);
            res.status(500).send('ERROR! Something broke on htpp server!');
            //20171013 port busy (EADDRINUSE) not catched here => use of IsPortAvailable
            //(Debian "pm2 start server.js" + "~/.nvm/versions/node/v8.5.0/bin/node server.js")
        });

        //Serve config.js as if it was in web directory
        G.WEB_SERVER.get('/config.js', function (req, res) {
            // Set cache-control headers for config.js
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
            res.sendFile(G.CONFIG_FILE);
        });

        G.LAN_DISCOVERY = new LanDiscovery({ verbose: false, timeout: 60 });
        G.LAN_DISCOVERY.getDefaultInterface().then( (defaultInterface) => {
            //we start here with network informations
            console.log(defaultInterface);
            G.THIS_PC.lanInterface = defaultInterface;

            //define machineID with node-machine-id + lan mac address
            NodeMachineId.machineId({original: true}).then(function (id) {
                function hash(guid) {
                    //return Crypto.createHash('sha1').update(guid).digest('hex'); //=>40
                    return Crypto.createHash('sha256').update(guid).digest('hex'); //=>64
                }
                let macAddress = G.THIS_PC.lanInterface.mac_address;
                G.THIS_PC.machineID = hash(id + macAddress); //global scope
                G.THIS_PC.idPC = F.getPcIdentifier({lanMAC: macAddress});
                console.log("[PcIdentifier] OK! Got mac address from lan interface, now we can calculate G.THIS_PC.idPC:", G.THIS_PC.idPC);
            });

            IsPortAvailable(G.WEB_SERVER.get('port')).then( (status) => {
                if (!status) {
                    console.log('ERROR! Port ' + G.WEB_SERVER.get('port') + ' is not available!');
                    console.log('Reason : ' + IsPortAvailable.lastError);
                }
                else {
                    // Écouter sur toutes les interfaces (0.0.0.0) pour accepter les connexions depuis le réseau
                    G.WEB_SERVER_INSTANCE = G.WEB_SERVER.listen(G.WEB_SERVER.get('port'), '0.0.0.0', () => {
                        //get listening port
                        let port = G.WEB_SERVER_INSTANCE.address().port;
                        let url = 'http://localhost:'+port;
                        let serverUpNotification = 'Web server available on '+ url +' (lanIP: '+ G.THIS_PC.lanInterface.ip_address +', ';
                        //get public ip using fetch native (replaces ext-ip)
                        const controller = new AbortController();
                        const timeoutId = setTimeout(() => controller.abort(), 5000);
                        
                        fetch('https://api.ipify.org?format=json', { signal: controller.signal })
                            .then(response => {
                                clearTimeout(timeoutId);
                                return response.json();
                            })
                            .then(data => {
                                const ip = data.ip;
                                serverUpNotification += 'wanIP: ' + ip + ')';
                                G.THIS_PC.wanInterface = {ip: ip};
                                console.log('OK! '+ serverUpNotification);
                            })
                            .catch(err => {
                                clearTimeout(timeoutId);
                                serverUpNotification += 'unknow wanIP)';
                                G.THIS_PC.wanInterface = {ip: null};
                                console.log('OK! '+ serverUpNotification);
                            })
                            .finally(() => {
                                this.onWebServerReady();  //function of Server class
                            });
                    });
                }
            });

            // apply the routes to our application
            G.WEB_SERVER.use('/', appRouter);

        }).catch(function(err){
            //ERROR CATCHED IN MAIN
            console.log("main got error => restart ?");
            console.log(err);

            process.exit();
        });
		//---------------------------------------------------------------------------------------------------------------------------------------------------------------
    }


    onWebServerReady() {

        //----- CONNECT DATABASE -----
        const ServerDatabase = require('./serverDatabase');
        G.database = new ServerDatabase(G);
        G.database.initConnection();
        
        // Attendre un peu que Gun.js soit complètement initialisé, puis configurer les listeners d'événements
        setTimeout(() => {
            if (!G.GUN_DB_MESSAGES) {
                console.error("[SERVER] ERROR! G.GUN_DB_MESSAGES is not defined after initConnection()!");
                console.error("[SERVER] G.GUN:", G.GUN);
                console.error("[SERVER] G.CONFIG.val('TABLE_MESSAGES'):", G.CONFIG.val('TABLE_MESSAGES'));
            } else {
                console.log("[SERVER] G.GUN_DB_MESSAGES is defined, setting up socket events listeners...");
                if (G.eventHandler) {
                    G.eventHandler.setupSocketEventsListeners();
                } else {
                    console.error("[SERVER] ERROR! G.eventHandler is not defined!");
                }
            }
        }, 500); // Attendre 500ms pour que Gun.js soit complètement initialisé
        //G.GUN_DB_COMPUTERS is decentralized db and can be updated by multiples servers and so represents multiples lans
        //we need a way to determine if one computer is in the lan of the server (to declare him offline).
        //-> Reload G.VISIBLE_COMPUTERS map on server restart
        G.database.dbVisibleComputersLoad();
        ///!\ here G.VISIBLE_COMPUTERS is not yet loaded /!\
        //but no need await function (only used at the end of lan scan to mark pc as offline)

        //----- GET PLUGINS INFORMATIONS -----
        const ServerPluginsInfos = require('./serverPluginsInfos');
        G.PLUGINS_INFOS = ServerPluginsInfos.build();

        //----- LAUNCH FIRST SCAN -----
        const ServerLanScanner = require('./serverLanScanner');
        let lanScanner = new ServerLanScanner(G);
        // Store lanScanner reference for event emit in ServerLanScanner class
        G.lanScanner = lanScanner;
        // Setup listener one time only, just after instanciation
        lanScanner.setupScanListeners();
        lanScanner.startFullScan();

        //----- HANDLE HOMEPAGE REQUEST (HTTP/HTTPS) -----
        G.WEB_SERVER.get('/', function (homePageRequest, homePageResponse) {
            // Set cache-control headers for HTML page to force reload
            homePageResponse.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
            homePageResponse.setHeader('Pragma', 'no-cache');
            homePageResponse.setHeader('Expires', '0');
            homePageResponse.sendFile(Path.join(__dirname + '/web/view.html'));
            console.log("~~~~ SEND HTML PAGE AND START QUICK SCAN (ping/http/socket) ~~~~");

            //console.log("G.VISIBLE_COMPUTERS");
            //console.log(G.VISIBLE_COMPUTERS);
            //TODO: periodicaly remove old G.VISIBLE_COMPUTERS entry by lastCheckTimeStamp

            if (G.VISIBLE_COMPUTERS.size > 0) {
                //OK
                // Par contre lance LanScan avant fin QuickScan
                // ... aussi bien sinon obliger d'attendre fin timeout ???
                // ... seulement si QuickScan est limite a quelque address IP
                lanScanner.startQuickScan()
                    .then(function (v) {
                        console.log('°°°°°°°°°°°°° PROMISES (PENDINGS)  °°°°°°°°°°°°°°');
                        console.log(v);
                        lanScanner.startFullScan();
                    })
                    .catch(function (err) {
                        console.error(err);
                    });

                /* //NOK erreur undefined pingPromises au bout dun moment
                //https://stackoverflow.com/questions/31424561/wait-until-all-es6-promises-complete-even-rejected-promises
                let pingPromises = lanScanner.startQuickScan();
                Promise.all(pingPromises.map(p => p.catch(e => e)))
                    .then(results => console.log(results)) // 1,Error: 2,3
                    .catch(e => console.log(e));
                */
            }
        });


        //----- HANDLE EVENTS (HTTP/SCOKET) -----
        const ServerEventHandler = require('./serverEventHandler');
        G.eventHandler = new ServerEventHandler(G);  // Stocker dans G pour y accéder dans onWebServerReady()
        G.eventHandler.setupHttpEventsLiteners();
        // NOTE: setupSocketEventsListeners() sera appelé dans onWebServerReady() après initConnection()


        //----- FOR DIAGNOSTIC ONLY, DUMP GUN.JS DATABASE CONTENT AFTER 10 SECONDS -----
        let dumpDatabaseDiagLvl = 0;  // no diag
        dumpDatabaseDiagLvl = 1;      // basic diag
        //dumpDatabaseDiagLvl = 2;    // full dump
        if (dumpDatabaseDiagLvl && G.CONFIG.val('SERVER_ADDRESS').indexOf("localhost") === -1) {
            console.log("[GUN-DB-DUMP] The Gun.js database is not populated here, it is populated on : " + G.CONFIG.val('SERVER_ADDRESS'));
        } else if(dumpDatabaseDiagLvl){
            setTimeout(() => {
                console.log("\n========== GUN.JS DATABASE DUMP (PCs only) ==========");
                if (typeof G.GUN_DB_COMPUTERS === 'undefined') {
                    console.log("[GUN-DB-DUMP] ERROR! G.GUN_DB_COMPUTERS is not defined");
                } else {
                    const rootTableComputers = G.CONFIG.val('TABLE_COMPUTERS');
                    console.log(`[GUN-DB-DUMP] Reading from root table: ${rootTableComputers}`);
                    
                    const dbContent = {};
                    let computersCount = 0;
                    const collectTimeout = 2000; // Collect data for 2 seconds
                    
                    const dataCollector = (pc, id) => {
                        if (pc !== null && id !== '' && id !== rootTableComputers) {
                            // Clone the object to avoid references
                            try {
                                const clonedPc = JSON.parse(JSON.stringify(pc));
                                // Only count if it has meaningful data
                                if (clonedPc.hostname || clonedPc.lanIP) {
                                    dbContent[id] = clonedPc;
                                    computersCount++;
                                    console.log(`[GUN-DB-DUMP] idPC: ${id}, hostname: ${clonedPc.hostname || 'N/A'}, lanIP: ${clonedPc.lanIP || 'N/A'}`);
                                }
                            } catch (err) {
                                console.log(`[GUN-DB-DUMP] ERROR cloning PC data for id: ${id}`, err);
                            }
                        }
                    };
                    
                    // Use .on() to collect all data
                    //G.GUN_DB_COMPUTERS.map().on(dataCollector);
                    G.GUN_DB_COMPUTERS.map().once(dataCollector);
                    
                    // Also display what's in G.VISIBLE_COMPUTERS (in-memory Map)
                    if (G.VISIBLE_COMPUTERS && G.VISIBLE_COMPUTERS.size > 0) {
                        console.log(`[GUN-DB-DUMP] G.VISIBLE_COMPUTERS contains ${G.VISIBLE_COMPUTERS.size} PCs in memory:`);
                        if(dumpDatabaseDiagLvl==2){
                            const visibleComputersData = {};
                            for (let [idPC, pcObject] of G.VISIBLE_COMPUTERS) {
                                visibleComputersData[idPC] = pcObject;
                            }
                            console.log(JSON.stringify(visibleComputersData, null, 2));
                        }
                    }
                    
                    // Wait a bit for all data to be loaded, then display
                    setTimeout(() => {
                        if (computersCount > 0) {
                            console.log(`[GUN-DB-DUMP] Total PCs found in gun.js database: ${computersCount}`);
                            if(dumpDatabaseDiagLvl==2){
                                console.log(JSON.stringify(dbContent, null, 2));
                            }
                        } else {
                            console.log("[GUN-DB-DUMP] No PCs found in database");
                        }
                        console.log("==================================================\n");
                    }, collectTimeout); // Wait some seconds for all data to be collected
                }
            }, 10000); // Wait 10 seconds after server start
        }
        //------------------------------------------------------------------------------


    }


}


module.exports = Server;
