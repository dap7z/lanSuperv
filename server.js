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

//const IsPortAvailable = require('is-port-available'); //COMPATIBILITY ISSUE WITH COMMAND LINE ARGUMENT
const IsPortAvailable = require('./node_modules_custom/is-port-available/index.js');



//--GLOBALS--
let G = {
    CONFIG_FILE: null,
    CONFIG: null,
    SCAN_IN_PROGRESS: false,
    THIS_PC: {
        hostnameLocal: Os.hostname(),
        machineID: null,
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
        G.WEB_SERVER.use(Express.static(Path.join(__dirname, 'web')));
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
            res.sendFile(G.CONFIG_FILE);
        });

        // Ajouter Gun.serve comme middleware Express
        // Cela permet à Gun.js de gérer automatiquement les requêtes WebSocket sur /gun
        G.WEB_SERVER.use(Gun.serve);

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
                G.THIS_PC.machineID = hash(id + G.THIS_PC.lanInterface.mac_address); //global scope
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
                                this.onWebServerReady();  //function of Server class
                            })
                            .catch(err => {
                                clearTimeout(timeoutId);
                                serverUpNotification += 'unknow wanIP)';
                                G.THIS_PC.wanInterface = {ip: null};
                                console.log('OK! '+ serverUpNotification);
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
        lanScanner.startFullScan();

        //----- HANDLE HOMEPAGE REQUEST (HTTP/HTTPS) -----
        G.WEB_SERVER.get('/', function (homePageRequest, homePageResponse) {
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
        let eventHandler = new ServerEventHandler(G);
        eventHandler.setupHttpEventsLiteners();
        eventHandler.setupSocketEventsListeners();

    }


}


module.exports = Server;
