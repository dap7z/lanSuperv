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

const Request = require('request-promise');  //'request' deprecated
const Ping = require('ping-bluebird');  //ping with better promise
const Nmap = require('node-nmap');



class Server {

    constructor(configFile) {
        this.configFile = configFile;
    }

    start(){
        //---------------------------------------------------------------------------------------------------------------------------------------------------------------


        //--INNER-CLASS-GLOBALS--
        let CONFIG_FILE = this.configFile;
        let CONFIG = require(this.configFile);
        let NMAP_IS_WORKING = false;
        let THIS_PC = {
            hostnameLocal: Os.hostname(),
            machineID: null,
            lanInterface: null,
            wanInterface: null
        };
        let F = require(__dirname + '/functions'); //FONCTIONS
        //----------


        //----- APPLY CONFIGURATION -----
        Nmap.nmapLocation = CONFIG.val('NMAP_LOCATION');


        //----- LAUNCH HTTP SERVER -----
        let app = Express();
        let server = null;
        app.set('port', CONFIG.val('SERVER_PORT') );
        app.use(Express.static(Path.join(__dirname, 'web')));
        //__dirname is native Node variable which contains the file path of the current folder
        app.use(BodyParser.urlencoded({extended: false}));   //to get POST data
        //extended: false means you are parsing strings only (not parsing images/videos..etc)
        app.use(BodyParser.json());

        // route middleware that will happen on every request
        let appRouter = Express.Router();
        appRouter.use(function(req, res, next) {
            console.log("[HTTP] " + req.method, req.url);
            // continue doing what we were doing and go to the route
            next();
        });

        //errorHandler has to be last defined:
        app.use(function(err, req, res, next) {
            console.error(err.stack);
            res.status(500).send('ERROR! Something broke on htpp server!');
            //20171013 port busy (EADDRINUSE) not catched here => use of IsPortAvailable
            //(Debian "pm2 start server.js" + "~/.nvm/versions/node/v8.5.0/bin/node server.js")
        });

        //Serve config.js as if it was in web directory
        app.get('/config.js', function (req, res) {
            res.sendFile(CONFIG_FILE);
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



        getDefaultInterface().then(function(defaultInterface){

            //we start here with network informations
            //console.log(defaultInterface);


            //nmap accept 192.168.1.1-254 and 192.168.1.1/24 but not 192.168.1.1/255.255.255.0
            //so we translate :
            THIS_PC.lanInterface = (function () {
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
            let scanNetwork = THIS_PC.lanInterface.network + '/' + THIS_PC.lanInterface.bitmask;


            //define machineID with node-machine-id + lan mac address
            NodeMachineId.machineId({original: true}).then(function (id) {
                function hash(guid) {
                    //return Crypto.createHash('sha1').update(guid).digest('hex'); //=>40
                    return Crypto.createHash('sha256').update(guid).digest('hex'); //=>64
                }
                THIS_PC.machineID = hash(id + THIS_PC.lanInterface.mac_address); //global scope
            });


            IsPortAvailable(app.get('port')).then(function (status) {
                if (!status) {
                    console.log('ERROR! Port ' + app.get('port') + ' is not available!');
                    console.log('Reason : ' + IsPortAvailable.lastError);
                }
                else {
                    server = app.listen(app.get('port'), function () {
                        //get listening port
                        let port = server.address().port;
                        let url = 'http://localhost:'+port;
                        let serverUpNotification = 'Web server available on '+ url +' (lanIP: '+ THIS_PC.lanInterface.ip_address +', ';
                        //get public ip
                        ExtIP((err, ip) => {
                            if (err) {
                                serverUpNotification += 'unknow wanIP)';
                            } else {
                                serverUpNotification += 'wanIP: ' + ip + ')';
                            }
                            THIS_PC.wanInterface = {ip: ip};
                            console.log('OK! '+ serverUpNotification);


                            //----- DECENTRALIZED DB (GUN.JS) -----
                            let gunOptions = {};
                            let tableName = CONFIG.val('TABLE_COMPUTERS');


                            if(CONFIG.val('LOCAL_DATABASE')){
                                //local gun url (json file storage) + remote gun url :
                                gunOptions = {
                                    file: CONFIG.val('FILE_SHARED_DB'),
                                    peers: CONFIG.val('GUN_PEERS'),
                                    web: server,
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

                            }else{
                                //only remote gun url :
                                gunOptions = CONFIG.val('SOCKET_URL_DATABASE');
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
                            if(gunOptionsDump.web){
                                gunOptionsDump.web = '[exclude from dump]';
                            }
                            console.log("[GUN.JS] LOCAL_DATABASE='"+ CONFIG.val('LOCAL_DATABASE') +"', OPTIONS:");
                            console.log(gunOptionsDump);


                            let gun = Gun(gunOptions);
                            let dbComputers = gun.get(tableName);
                            //dbComputers is decentralized db and can be updated by multiples servers and so represents multiples lans
                            //we need a way to determine if one computer is in the lan of the server (to declare him offline).

                            //Reload visibleComputers map on server restart
                            let visibleComputersFile = __dirname+'/visibleComputers.json';
                            let visibleComputers = new Map();
                            Fs.readFile(visibleComputersFile, 'utf8', function (err, data) {
                                if (err){
                                    console.log("WARNING! cant read file: "+ visibleComputersFile);
                                    //console.log(err) //example: file doesnt exist after a fresh install
                                }else{
                                    visibleComputers = F.jsonToStrMap(data);
                                    //console.log(visibleComputers);
                                }
                            });
                            ///!\ here visibleComputers is not yet loaded /!\
                            //but no need await function (only used at the end of lan scan to mark pc as offline)




                            let pluginsInfos = [];
                            let plugins = F.getPlugins('all', 'dirPath', 'array');
                            plugins.map(function (dirPath) {

                                let eventName = Path.basename(dirPath);	//pluginDirName
                                let execPath = '';
                                let exec = Fs.readdirSync(dirPath).filter(function (elm) {
                                    return elm.match(/execute\.*/g);
                                });

                                if (exec.length === 1) {
                                    execPath = dirPath + Path.sep + exec;
                                    pluginsInfos[eventName] = {
                                        dirPath: dirPath,
                                        execPath: execPath
                                    };
                                }

                                let diagPluginDetection = true;
                                if (diagPluginDetection) {
                                    let logMsg = '[PLUGIN ' + eventName + '] file: ';
                                    if (execPath !== '') {
                                        logMsg += execPath;
                                    }
                                    else {
                                        logMsg += dirPath + Path.sep + 'execute.* ERROR_NOT_FOUND';
                                    }
                                    console.log(logMsg);
                                }
                            });
                            //console.log('pluginsInfos array:');
                            //console.log(pluginsInfos);


                            //[launchLanScan]START METHOD
                            function launchLanScan() {
                                if (NMAP_IS_WORKING) {
                                    console.log('FIXED! launchLanScan canceled (NMAP_IS_WORKING)');
                                }
                                else {
                                    NMAP_IS_WORKING = true;

                                    let scan = new Nmap.NmapScan(scanNetwork, '-sP -T4');
                                    scan.on('error', function (error) {
                                        console.log(error);
                                    });
                                    scan.on('complete', function (data) {
                                        console.log('OK! nmap scan completed in ' + scan.scanTime / 1000 + ' sec');
                                        //console.log(data);
                                        let scannedComputers = new Map();
                                        let scanTimeStamp = new Date().toISOString();
                                        let remotePlugins = F.getPlugins('remote', 'dirName');
                                        for (let i = 0; i < data.length; i++) {
                                            let d = data[i];
                                            let params = {
                                                lastCheck: scanTimeStamp,
                                                hostname: d.hostname,
                                                lanIP: d.ip,
                                                lanMAC: d.mac
                                                //machineID: nmap scan cant return that :(
                                            };


                                            let pc = F.pcObject(params, THIS_PC, "SCAN");
                                            //Gun.js do not support array, pc must be an object
                                            //pc simple key value object for simpler gun.js database
                                            let plugins = remotePlugins;
                                            if (pc.lanIP === THIS_PC.lanInterface.ip_address) {
                                                //self scan specific
                                                let wasEmpty = pc.lanMAC;
                                                pc.lanMAC = THIS_PC.lanInterface.mac_address;
                                                console.log("FIXED! correct lanMAC field for server (was: '" + wasEmpty + "')");
                                                pc.machineID = THIS_PC.machineID;
                                                console.log("FIXED! add machineID field for server");
                                                plugins = F.getPlugins('all', 'dirName');
                                                console.log("FIXED! add local-responses plugins for server");
                                            }


                                            let idPC = F.getPcIdentifier(pc);
                                            //for compare that scan to the others:
                                            visibleComputers.set(idPC, pc);
                                            scannedComputers.set(idPC, scanTimeStamp);
                                            //each plugins as a key of pc object:
                                            for (let key in plugins) {
                                                pc[key] = plugins[key];
                                            }
                                            dbComputers.get(idPC).put(pc);
                                        }


                                        console.log("[INFO] Save visibleComputers: "+ visibleComputersFile);
                                        //console.log(visibleComputers);

                                        //save visibleComputers map in json file for reloading after restart
                                        Fs.writeFile(visibleComputersFile, F.strMapToJson(visibleComputers), 'binary', function (err) {
                                            if (err) console.log(err);
                                        });


                                        visibleComputers.forEach(function (value, key) {
                                            let idPC = key;
                                            if (scannedComputers.has(idPC) === false) {
                                                console.log('idPC:' + idPC + ' => online false');
                                                dbComputers.get(idPC).get('online').put(false);
                                                dbComputers.get(idPC).get('respondsTo-ping').put(false);
                                            }
                                        });


                                        //[launchLanScan] FREE LOCK AND PROGRAM NEXT CALL
                                        NMAP_IS_WORKING = false;
                                        let nbSecsBeforeNextScan = 60 * 60;
                                        setTimeout(function () {
                                            launchLanScan();
                                        }, 1000 * nbSecsBeforeNextScan);

                                    });
                                }
                            }

                            //[launchLanScan] END METHOD AND FIRST CALL
                            launchLanScan();


                            //----- ON HTTP(S) HOMEPAGE REQUEST -----
                            app.get('/', function (homePageRequest, homePageResponse) {
                                homePageResponse.sendFile(Path.join(__dirname + '/web/view.html'));
                                console.log("~~~~ SEND HTML PAGE AND START QUICK SCAN (ping/http/socket) ~~~~");

                                //console.log("visibleComputers");
                                //console.log(visibleComputers);
                                //TODO: periodicaly remove old visibleComputers entry by lastCheckTimeStamp

                                if (visibleComputers.size > 0) {
                                    //QuickScan: only previously visibles computers
                                    //LanScan: map ping on whole lan primary interface
                                    function pingCheck(pc, idPC) {
                                        let ip = pc.lanIP;
                                        let hostAddress = ip;
                                        if (hostAddress === THIS_PC.lanInterface.ip_address) {
                                            hostAddress = '127.0.0.1';   //self scan specific
                                            //20171018 Ping('localhost') doesnt work with the ping-bluebird nodejs package on windows10
                                        }
                                        return new Promise(function (resolve) {
                                            Ping(hostAddress, {timeout: 4})
                                                .catch(function (res) {
                                                    //required to resolve(finalResult) after ping fail
                                                }).then(function (res) {
                                                let finalResult = {
                                                    idPC: idPC,
                                                    lanIP: ip,
                                                    'respondsTo-ping': res.alive
                                                };
                                                //res.time non supporte par npm package ping-bluebird
                                                finalResult.online = finalResult["respondsTo-ping"];	//TO_REMOVE
                                                if (finalResult["respondsTo-ping"]) {
                                                    finalResult.lastResponse = new Date().toISOString();
                                                }
                                                resolve(finalResult);
                                            });
                                        });
                                    }

                                    function httpCheck(pc, idPC) {
                                        let ip = pc.lanIP;
                                        return new Promise(function (resolve) {

                                            let hostAddress = ip;
                                            if (hostAddress === THIS_PC.lanInterface.ip_address) {
                                                hostAddress = '127.0.0.1';  //self scan specific
                                            }
                                            let url = 'http://' + hostAddress + ':' + CONFIG.val('SERVER_PORT') + CONFIG.val('PATH_HTTP_EVENTS') + '/check';

                                            let errorMsg = "";
                                            Request(url).catch(function (err) {
                                                errorMsg = err;
                                                //example: "Error: connect ECONNREFUSED 127.0.0.1:842"
                                            }).then(function (jsonString) {
                                                let finalResult = {};
                                                if (errorMsg === '') {
                                                    try {
                                                        finalResult = JSON.parse(jsonString);
                                                    } catch (e) {
                                                        console.log("WARNING! JSON.parse error catched");
                                                        console.log(jsonString);
                                                        console.log(e);
                                                    }
                                                }
                                                else {
                                                    finalResult['respondsTo-http'] = false;
                                                }
                                                finalResult.idPC = idPC;
                                                finalResult.lanIP = ip;

                                                resolve(finalResult);
                                            });

                                        });
                                    }


                                    /*
                                    function socketCheck(pc, idPC) {
                                        let lanMAC = pc.lanMAC;
                                        let machineID = pc.machineID;

                                        return new Promise(function (resolve) {

                                            if(lanMAC && machineID){

                                                //[...]
                                            }

                                            let finalResult = {
                                                idPC: idPC,
                                                'respondsTo-socket': false
                                            };
                                            //stay false until gun-js db update

                                            resolve(finalResult);
                                        });
                                    }*/


                                    function socketCheckNoNeedPromise(pc, idPC) {
                                        //like sendRequest function in client.js :
                                        let reqData = {
                                            eventName: 'check',
                                            eventResult: '',
                                            eventSendedAt: new Date().toISOString(),
                                            eventReceivedAt: null,
                                            pcTargetLanMAC: pc.lanMAC,

                                            who: "socketCheck"
                                        };
                                        if(pc.machineID){
                                            reqData['pcTargetMachineID'] = pc.machineID;
                                        }

                                        //20181014: attention PC-LAN-AVEC-LANSUPERV-INSTALLE n'a pas de machineID ici...
                                        //(alors qu'il en renvoi bien un lors appel http://localhost:842/cmd/check)
                                        //console.log("exec socketCheckWithoutPromise(), lanMAC:"+pc.lanMAC);
                                        //console.log("machineID:"+pc.machineID);

                                        let dbMsg = gun.get(CONFIG.val('TABLE_MESSAGES'));
                                        dbMsg.set(reqData);
                                        //we cant wait for a response as with http event
                                        //respondTo-socket update is done in gun.js database directly

                                        console.log("[INFO] socketCheckNoNeedPromise dbMsg.set:");
                                        console.log(reqData);
                                    }


                                    async function launchQuickScan(visibleComputers) {
                                        let arrayReturn = [];

                                        for (let [key, pcObject] of visibleComputers) {


                                            //TO FIX
                                            //problem pcObject of visibleComputers haven't machineID !



                                            //RESET (PLUGINS AND RESPONDSTO)
                                            for (let [idPC, pcObject] of visibleComputers) {
                                                //dbComputers.get(idPC).put(null);  //NOK :(
                                                dbComputers.get(idPC).once(function (pcToUpdate, id) {
                                                    for (let key in pcToUpdate) {
                                                        let value = pcToUpdate[key];
                                                        if(key.startsWith("plugin") || key.startsWith("respondsTo-")){
                                                            value = null;
                                                        }
                                                        pcToUpdate[key] = value;
                                                    }
                                                    dbComputers.get(idPC).put(pcToUpdate);
                                                });
                                            }

                                            //PING CHECK PROMISES
                                            let pingPromise = pingCheck(pcObject, key).then(function (finalResult) {
                                                //Update pc infos :
                                                F.logCheckWarning("ping", dbComputers, finalResult);
                                                //  ORG dbComputers.get(result.idPC).get('online').put(result.online);
                                                //  ORG dbComputers.get(result.idPC).get('respondsTo-ping').put(result.online);
                                                dbComputers.get(finalResult.idPC).once(function (pcToUpdate, id) {
                                                    for (let key in finalResult) {
                                                        pcToUpdate[key] = finalResult[key];
                                                    }
                                                    dbComputers.get(finalResult.idPC).put(pcToUpdate);
                                                    F.logCheckResult("ping", pcToUpdate);
                                                });

                                            }, function (reason) {
                                                console.log("##Promise## [pingCheck] Promise rejected");
                                            });
                                            arrayReturn.push(pingPromise);

                                            //HTTP CHECK PROMISES
                                            let httpPromise = httpCheck(pcObject, key).then(function (finalResult) {
                                                //Update pc infos :
                                                F.logCheckWarning("http", dbComputers, finalResult);
                                                dbComputers.get(finalResult.idPC).once(function (pcToUpdate, id) {
                                                    for (let key in finalResult) {
                                                        pcToUpdate[key] = finalResult[key];
                                                    }
                                                    dbComputers.get(finalResult.idPC).put(pcToUpdate);
                                                    F.logCheckResult("http", pcToUpdate);
                                                });
                                            }, function (reason) {
                                                console.log("##Promise## [httpCheck] Promise rejected");
                                            });
                                            arrayReturn.push(httpPromise);

                                            /*
                                            //SOCKET (GUN.JS) PROMISES
                                            let socketPromise = socketCheck(pcObject, key).then(function (finalResult) {
                                                F.logCheckWarning("socket", dbComputers, finalResult);
                                            }, function (reason) {
                                                console.log("##Promise## [socketCheck] Promise rejected");
                                            });
                                            arrayReturn.push(socketPromise);
                                            */
                                            socketCheckNoNeedPromise(pcObject, key);


                                        }

                                        console.log("OK! QuickScan launched (work in promises, not finished yet)");
                                        return arrayReturn;
                                    }


                                    //OK
                                    // Par contre lance LanScan avant fin QuickScan
                                    // ... aussi bien sinon obliger d'attendre fin timeout ???
                                    // ... seulement si QuickScan est limite a quelque address IP
                                    launchQuickScan(visibleComputers)
                                        .then(function (v) {
                                            console.log('°°°°°°°°°°°°° PROMISES (PENDINGS)  °°°°°°°°°°°°°°');
                                            console.log(v);
                                            launchLanScan();
                                        })
                                        .catch(function (err) {
                                            console.error(err);
                                        });


                                    /* //NOK erreur undefined pingPromises au bout dun moment
                                    //https://stackoverflow.com/questions/31424561/wait-until-all-es6-promises-complete-even-rejected-promises
                                    let pingPromises = launchQuickScan(visibleComputers);
                                    Promise.all(pingPromises.map(p => p.catch(e => e)))
                                        .then(results => console.log(results)) // 1,Error: 2,3
                                        .catch(e => console.log(e));
                                    */

                                }

                            });


                            //same process (and parameters) on socket or http :
                            async function eventDispatcher(p, f) {
                                let eventResult = null;

                                //used globals: pluginsInfos THIS_PC.lanInterface dbComputers
                                //fonctions args: p(eventParameters), f(eventFrom)
                                console.log("LOG! eventDispatcher receive " + p.eventName + " event from " + f + ", pcTarget:" + p.pcTarget.lanMAC);
                                //console.log(p.pcTarget);

                                //add some event parameters :
                                p.lanInterface = THIS_PC.lanInterface;
                                p.eventFrom = f;
                                p.dirPath = "";
                                p.execPath = "";
                                if (pluginsInfos[p.eventName]) {
                                    p.dirPath = pluginsInfos[p.eventName].dirPath;
                                    p.execPath = pluginsInfos[p.eventName].execPath;
                                }

                                let processEvent = true;
                                if (p.dirPath.indexOf('local-responses') >= 0) //if local-response
                                {
                                    if (F.eventTargetIsThisPC(p, THIS_PC)) {
                                        p.pcTarget = 'self';
                                    }
                                    else if (p.pcTarget !== 'self') {
                                        if(f !== 'socket'){
                                            F.eventRedirection(p, dbComputers);
                                        }
                                        //event transmited, nothing more to do.
                                        //(and not even need eventRedirection if it comes from gun.js db)
                                        processEvent = false;
                                    }
                                }
                                if (processEvent)
                                {
                                    if(p.pcTarget === 'self'){
                                        p.pcTarget = THIS_PC;
                                        //(required for self check event)
                                    }
                                    //exec plugin in child process
                                    eventResult = await F.eventExecution(p);
                                    //console.log(eventResult);  //OK
                                }

                                return eventResult;  //stay null in case of event redirection
                            }


                            //++++++++++ HTTP EVENT ++++++++++ (support only self target)
                            app.all(CONFIG.val('PATH_HTTP_EVENTS') + '/:eventName', async function (request, response) {
                                //app.all() GET, POST, PUT, DELETE, or any other HTTP request method
                                //request.query comes from query parameters in the URL
                                //request.body properties come from a form post where the form data
                                //request.params comes from path segments of the URL that match a parameter in the route definition such a /song/:songid
                                let p = {
                                    eventName: request.params.eventName,
                                    pcTarget: 'self'
                                };
                                //example:
                                //http://localhost:842/cmd/check
                                //http://localhost:842/cmd/power-off
                                let responseData = await eventDispatcher(p, 'http');
                                response.json(responseData); //json response
                            });
                            console.log("OK! setup http events listeners");


                            //++++++++++ SOCKET EVENT (GUN.JS) ++++++++++
                            let dbMessages = gun.get(CONFIG.val('TABLE_MESSAGES'));
                            dbMessages.map().on(function (eventData, id) {

                                if (eventData && eventData.eventReceivedAt == null) {

                                    //calculate idPC of target
                                    let pcTarget = {
                                        lanMAC: eventData.pcTargetLanMAC,
                                        machineID: eventData.pcTargetMachineID
                                    };
                                    pcTarget.idPC = F.getPcIdentifier(pcTarget);
                                    //(idPC: lanMAC sans les deux points ou machineID, pour l'instant uniquement lanMAC')


                                    let readMessage = false;
                                    if(pcTarget.lanMAC === THIS_PC.lanInterface) readMessage = true;
                                    if(pcTarget.machineID === THIS_PC.machineID) readMessage = true;

                                    //If eventData.type == remote-request && eventData.target in visibleComputers -> read and process event
                                    let remoteRequestPlugins = F.getPlugins('remote', 'dirName', 'array');
                                    if(remoteRequestPlugins.indexOf(eventData.eventName) > -1){

                                        //Reminder: visibleComputers is empty before 1st scan and then contains only powered on pc
                                        //May be not the thing to use here ... (for wol)
                                        //But still acceptable since we save it in a file :)

                                        readMessage = visibleComputers.has(pcTarget.idPC);
                                    }


                                    if(readMessage)
                                    {
                                        eventData.eventResult = '';
                                        eventData.eventReceivedAt = new Date().toISOString();
                                        //we have to update database first if event is going to stop the server (power-off/sleep-mode/...)
                                        gun.get(CONFIG.val('TABLE_MESSAGES')).get(id).put(eventData, function () {
                                            //then we can process event:

                                            if(eventData.eventName === 'check')
                                            {
                                                if(F.eventTargetIsThisPC(eventData, THIS_PC))
                                                {
                                                    //check events (specific, socketCheck update database directly) :
                                                    let finalResult = F.checkData(THIS_PC, 'socket');
                                                    finalResult['idPC'] = pcTarget.idPC;

                                                    dbComputers.get(finalResult.idPC).once(function (pcToUpdate, id) {
                                                        for (let key in finalResult) {
                                                            pcToUpdate[key] = finalResult[key];
                                                        }
                                                        dbComputers.get(finalResult.idPC).put(pcToUpdate);
                                                        F.logCheckResult("socket", pcToUpdate);
                                                        //console.log("[INFO] event check (socket) : sended that PC response over gun.js database");
                                                        //console.log(pcToUpdate);
                                                    });
                                                }
                                            }
                                            else
                                            {
                                                //standard events :
                                                let p = {
                                                    eventName: eventData.eventName,
                                                    pcTarget: pcTarget,
                                                };
                                                let responseData = eventDispatcher(p, 'socket');

                                                let evtResult = {};
                                                if (responseData) {
                                                    evtResult = responseData;
                                                    //contain evtResult.msg
                                                }
                                                else {
                                                    evtResult.msg = eventData.eventName + ' event received (no response)';
                                                }
                                                //send response message by updating eventResult database field:
                                                eventData.eventResult = JSON.stringify(evtResult);

                                                gun.get(CONFIG.val('TABLE_MESSAGES')).get(id).put(eventData);

                                            }

                                        });

                                    }
                                }
                            });
                            console.log("OK! setup gun.js socket events listeners");

                            //=======================================================================================================

                        });
                    });
                }
            });


            //TODO? localhost config web interface
            /*
            app.get('/config', function(req, res) {
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
            app.use('/', appRouter);


        }).catch(function(err){
            //ERROR CATCHED IN MAIN
            console.log("main got error => restart ?");
            console.log(err);

            process.exit();
        });
		//---------------------------------------------------------------------------------------------------------------------------------------------------------------
    }


};


module.exports = Server;
