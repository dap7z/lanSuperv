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

const Fs = require('fs');
const Path = require('path');
const Gun = require('gun');

const Express = require('express'); //nodejs framework
const BodyParser = require('body-parser'); //to get POST data

const Crypto = require('crypto');  //hash machineID

const Netmask = require('netmask').Netmask;

//const IsPortAvailable = require('is-port-available'); //COMPATIBILITY ISSUE WITH COMMAND LINE ARGUMENT
const IsPortAvailable = require('./node_modules_custom/is-port-available/index.js');
const ExtIP = require('ext-ip')();



//--GLOBALS--
let G = {
    CONFIG_FILE: null,
    CONFIG: null,
    NMAP_IS_WORKING: false,
    THIS_PC: {
        hostnameLocal: Os.hostname(),
        machineID: null,
        lanInterface: null,
        wanInterface: null
    },
    VISIBLE_COMPUTERS_FILE: __dirname+'/visibleComputers.json',
    VISIBLE_COMPUTERS: new Map(),
    SCANNED_COMPUTERS: null, //(reset before each scan)
    SCAN_NETWORK: null,
    PLUGINS_INFOS: [],
    WEB_SERVER: null,
    WEB_SERVER_INSTANCE: null,
    GUN: null,
    GUN_DB_MESSAGES: null,
    GUN_DB_COMPUTERS: null
};
//--FONCTIONS--
let F = require(__dirname + '/functions');
//-------------


class Server {

    constructor(configFile) {
        //this.configFile = configFile;
        G.CONFIG_FILE = configFile;
        G.CONFIG = require(configFile);
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
        })


        //Promise to get network information
        //(we no more use 'network' npm package because dectected active network interface can be virtualbox one...)
        async function getDefaultInterface() {
            return new Promise(function(resolve,reject) {
                //let Os = require('os');
                let Routes = require('default-network');

                Routes.collect(function (error, data) {
                    let names = Object.keys(data);
                    let defaultInterfaceName = names[0];
                    let defaultInterfaceData = Os.networkInterfaces()[defaultInterfaceName];
                    let lanIPv4 = defaultInterfaceData[0];
                    //let lanIPv6 = defaultInterfaceData[1];

                    let defaultGatewayData = data[defaultInterfaceName];
                    let gatewayIPv4 = defaultGatewayData[0];
                    //let gatewayIPv6 = defaultGatewayData[1];

                    let result = {
                        gateway_ip: gatewayIPv4.address,
                        ip_address: lanIPv4.address,
                        mac_address: lanIPv4.mac,
                        netmask: lanIPv4.netmask,
                        family: lanIPv4.family,
                        internal: lanIPv4.internal,
                        cidr: lanIPv4.cidr
                    };

                    resolve(result);
                });
            });
        }



        getDefaultInterface().then( (defaultInterface) => {

            //we start here with network informations
            //console.log(defaultInterface);

            //nmap accept 192.168.1.1-254 and 192.168.1.1/24 but not 192.168.1.1/255.255.255.0
            //so we translate :
            G.THIS_PC.lanInterface = (function () {
                //anonymous function to avoid keeping vars in memory
                let obj = defaultInterface;
                let block = new Netmask(obj.gateway_ip + '/' + obj.netmask);
                obj.fullmask = obj.netmask;
                delete obj.netmask; //unset
                obj.bitmask = block.bitmask;
                obj.network = block.base;
                obj.mac_address = obj.mac_address.toUpperCase();
                return obj;
            })();
            G.SCAN_NETWORK = G.THIS_PC.lanInterface.network + '/' + G.THIS_PC.lanInterface.bitmask;


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
                    G.WEB_SERVER_INSTANCE = G.WEB_SERVER.listen(G.WEB_SERVER.get('port'), () => {
                        //get listening port
                        let port = G.WEB_SERVER_INSTANCE.address().port;
                        let url = 'http://localhost:'+port;
                        let serverUpNotification = 'Web server available on '+ url +' (lanIP: '+ G.THIS_PC.lanInterface.ip_address +', ';
                        //get public ip
                        ExtIP((err, ip) => {
                            if (err) {
                                serverUpNotification += 'unknow wanIP)';
                            } else {
                                serverUpNotification += 'wanIP: ' + ip + ')';
                            }
                            G.THIS_PC.wanInterface = {ip: ip};
                            console.log('OK! '+ serverUpNotification);

                            this.onWebServerReady();  //function of Server class
                        });
                    });
                }
            });


            //TODO? localhost config web interface
            /*
            G.WEB_SERVER.get('/config', function(req, res) {
                let hostmachine = req.headers.host.split(':')[0];
                if(hostmachine!=='localhost' && hostmachine!=='127.0.0.1')
                {
                    res.send(401);
                    //on utilise un token pour etre sur que l'ordre de config vient du PC où est installé l'app
                    //sinon: laucnh another server listening localhost only:
                    //let localhostSrv = http.createServer().listen(80, '127.0.0.1');
                }
                else
                {
                    //localhost only
                    res.send('/config');

                    //app might be installed on headless machines so config have to remain easy in cmd line :
                    //- settings file
                    //- plugins available/enabled directories
                }
            });
            */


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
        
        //----- DECENTRALIZED DB (GUN.JS) -----
        
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
        
        //G.GUN_DB_COMPUTERS is decentralized db and can be updated by multiples servers and so represents multiples lans
        //we need a way to determine if one computer is in the lan of the server (to declare him offline).

        //Reload G.VISIBLE_COMPUTERS map on server restart
        Fs.readFile(G.VISIBLE_COMPUTERS_FILE, 'utf8', function (err, data) {
            if (err) {
                console.log("WARNING! cant read file: " + G.VISIBLE_COMPUTERS_FILE);
                //console.log(err) //example: file doesnt exist after a fresh install
            } else {
                G.VISIBLE_COMPUTERS = F.jsonToStrMap(data);
                //console.log(G.VISIBLE_COMPUTERS);
            }
        });
        ///!\ here G.VISIBLE_COMPUTERS is not yet loaded /!\
        //but no need await function (only used at the end of lan scan to mark pc as offline)


        //----- GET PLUGINS INFORMATIONS -----
        const ServerPluginsInfos = require('./serverPluginsInfos');
        G.PLUGINS_INFOS = ServerPluginsInfos.build();

        //TMP DIAG
        //console.log('G.PLUGINS_INFOS array:');
        //console.log(G.PLUGINS_INFOS);
        //TMP TEST
        /*
        oldAllPluginsDirName:
        { plugin1: 'web',
          plugin2: 'wol',
          plugin3: 'check',
          plugin4: 'power-off',
          plugin5: 'sleep-mode' }
        let allPluginsList = F.simplePluginsList('all', G.PLUGINS_INFOS); //NOK...TOFIX
        //let allPluginsList = F.simplePluginsList('all');  //NOK
        console.log("REFACTORED pluginsList:");
        console.log(allPluginsList);
        */





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


};


module.exports = Server;
