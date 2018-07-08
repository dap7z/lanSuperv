/*************************************************************************************
 lanSuperv :
 - affiche les pc connectés et deconnectés du reseau local du serveur.
 - permet d'envoyer des packets WakeOnLan
 prochaines versions :
 - server.js installable sur toutes les machines permettant :
 poweroff / messanger / filetransfert / netsharing / remotecontrole / ...
 *************************************************************************************/


//CONFIG:
Config = require('./web/config.js');


//LIBRARY:
const Os = require("os");
const NodeMachineId = require('node-machine-id');

const Fs = require('fs');
const Path = require('path');
const Gun = require('gun');
//require( 'gun-unset' );

const Express = require('express'); //nodejs framework
const BodyParser = require("body-parser"); //to get POST data

const Crypto = require('crypto');  //hash PCID

const Netmask = require('netmask').Netmask;

const IsPortAvailable = require('is-port-available');
const ExtIP = require("ext-ip")();

const Ping = require('ping-bluebird');  //ping with better promise
const Nmap = require('node-nmap');
Nmap.nmapLocation = Config.val('NMAP_LOCATION');

const Request = require('request-promise');    //'request' deprecated

//const Extend = require('util')._extend;   //var newObject = Extend({}, oldObject);

const F = require('./functions');


//GLOBALS:
var NMAP_IS_WORKING = false;
var THIS_PC = {
    hostnameLocal: Os.hostname(),
    machineID: null,
    lanInterface: null,
    wanInterface: null
};



module.exports.start = function(){

//----- LAUNCH HTTP SERVER -----
var app = Express();
var server = null;
app.set('port', Config.val('SERVER_PORT') );
app.use(Express.static(Path.join(__dirname, 'web')));
//__dirname is native Node variable which contains the file path of the current folder
app.use(BodyParser.urlencoded({extended: false}));   //to get POST data
//extended: false means you are parsing strings only (not parsing images/videos..etc)
app.use(BodyParser.json());

// route middleware that will happen on every request
var appRouter = Express.Router();
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



//Promise to get network information
//(we no more use 'network' npm package because dectected active network interface can be virtualbox one...)
async function getDefaultInterface() {
    return new Promise(function(resolve,reject) {
        //var Os = require('os');
        var Routes = require('default-network');

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
        var obj = defaultInterface;
        var block = new Netmask(obj.gateway_ip + '/' + obj.netmask);
        obj.fullmask = obj.netmask;
        delete obj.netmask; //unset
        obj.bitmask = block.bitmask;
        obj.network = block.base;
        obj.mac_address = obj.mac_address.toUpperCase();
        return obj;
    })();
    var scanNetwork = THIS_PC.lanInterface.network + '/' + THIS_PC.lanInterface.bitmask;


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
                var port = server.address().port;
                var url = 'http://localhost:'+port;
                var serverUpNotification = 'Web server available on '+ url +' (lanIP: '+ THIS_PC.lanInterface.ip_address +', ';
                //get public ip
                ExtIP((err, ip) => {
                    if (err) {
                        serverUpNotification += 'unknow wanIP)';
                    } else {
                        serverUpNotification += 'wanIP: ' + ip + ')';
                    }
                    THIS_PC.wanInterface = {ip: ip};
                    console.log('OK! '+ serverUpNotification);
                    //== notify app is ready to master process
                    process.send({
                        type: 'ready',
                        url: url,
                        serverUpNotification: serverUpNotification
                    });
                    //==


                    //----- DECENTRALIZED DB (GUN.JS) -----
                    var gunOptions = {};
                    var tableName = Config.val('TABLE_COMPUTERS');
                    if(Config.val('LOCAL_DATABASE')){
                        //local gun url (json file storage) + remote gun url :
                        gunOptions = {
                            file: Config.val('FILE_SHARED_DB'),
                            web: server,
                            peers: Config.val('GUN_PEERS')
                        };
                    }else{
                        //only remote gun url :
                        gunOptions = Config.val('SOCKET_URL_DATABASE');
                    }
                    console.log("[GUN.JS] LOCAL_DATABASE:"+ Config.val('LOCAL_DATABASE'));


                    //object clone to limit dump :
                    gunOptionsDump = {};
                    if(gunOptions.file) gunOptionsDump.file = gunOptions.file;
                    if(gunOptions.web) gunOptionsDump.web = ['...'];
                    if(gunOptions.peers) gunOptionsDump.peers = gunOptions.peers;
                    console.log(gunOptionsDump);



                    //var gun = Gun(gunOptions);  //NOK??
                    var gun = Gun({file: Config.val('FILE_SHARED_DB'), web: server});  //OK?

                    var dbComputers = gun.get(tableName);
                    //dbComputers is decentralized db and can be updated by multiples servers and so represents multiples lans
                    //we need a way to determine if one computer is in the lan of the server (to declare him offline).




                    ////----- LOCAL DB -----
                    //NO MORE USED: Config.val('FILE_LOCAL_DB')

                    var installedComputers = new Map();
                    //Reload visibleComputers map on server restart
                    var visibleComputers = new Map();
                    Fs.readFile(__dirname+'/visibleComputers.json', 'utf8', function (err, data) {
                        if (err){
                            console.log("WARNING! cant read file visibleComputers.json");
                            //console.log(err) //example: file doesnt exist after a fresh install
                        }else{
                            visibleComputers = F.jsonToStrMap(data);
                            //no need await function (only used at the end of lan scan to mark pc as offline)
                        }
                    });


                    var pluginsInfos = [];
                    var plugins = F.getPlugins('all', 'dirPath', 'array');
                    plugins.map(function (dirPath) {

                        var eventName = Path.basename(dirPath);	//pluginDirName
                        var execPath = '';
                        var exec = Fs.readdirSync(dirPath).filter(function (elm) {
                            return elm.match(/execute\.*/g);
                        });

                        if (exec.length === 1) {
                            pluginsInfos[eventName] = {
                                dirPath: dirPath,
                                execPath: dirPath + Path.sep + exec
                            };
                        }

                        var diagPluginDetection = true;
                        if (diagPluginDetection) {
                            var logMsg = '[PLUGIN ' + eventName + '] file: ';
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

                            var scan = new Nmap.NmapScan(scanNetwork, '-sP -T4');
                            scan.on('error', function (error) {
                                console.log(error);
                            });
                            scan.on('complete', function (data) {
                                console.log('OK! nmap scan completed in ' + scan.scanTime / 1000 + ' sec');
                                //console.log(data);
                                var scannedComputers = new Map();
                                var scanTimeStamp = new Date().toISOString();
                                var remotePlugins = F.getPlugins('remote', 'dirName');
                                for (var i = 0; i < data.length; i++) {
                                    var d = data[i];
                                    var params = {
                                        hostname: d.hostname,
                                        lastCheck: scanTimeStamp,
                                        lanIP: d.ip, //(<> THIS_PC.lanInterface.ip_address)
                                        lanMAC: d.mac
                                    };

                                    var pc = F.pcObject(params, THIS_PC, "SCAN");
                                    //Gun.js do not support array, pc must be an object
                                    //pc simple key value object for simpler gun.js database
                                    var plugins = remotePlugins;
                                    if (pc.lanIP === THIS_PC.lanInterface.ip_address) {
                                        //self scan specific
                                        var wasEmpty = pc.lanMAC;
                                        pc.lanMAC = THIS_PC.lanInterface.mac_address;
                                        console.log("FIXED! correct lanMAC field for server (was: '" + wasEmpty + "')");
                                        pc.machineID = THIS_PC.machineID;
                                        console.log("FIXED! add machineID field for server");
                                        plugins = F.getPlugins('all', 'dirName');
                                        console.log("FIXED! add local-responses plugins for server");
                                    }

                                    var idPC = F.getPcIdentifier(pc);
                                    //for compare that scan to the others:
                                    visibleComputers.set(idPC, pc);
                                    scannedComputers.set(idPC, scanTimeStamp);
                                    //each plugins as a key of pc object:
                                    for (var key in plugins) {
                                        pc[key] = plugins[key];
                                    }
                                    dbComputers.get(idPC).put(pc);
                                }
                                //save visibleComputers map in json file for reloading after restart
                                Fs.writeFile('visibleComputers.json', F.strMapToJson(visibleComputers), 'binary', function (err) {
                                    if (err) console.log(err);
                                });

                                visibleComputers.forEach(function (value, key) {
                                    var idPC = key;
                                    if (scannedComputers.has(idPC) === false) {
                                        console.log('idPC:' + idPC + ' => online false');
                                        dbComputers.get(idPC).get('online').put(false);
                                        dbComputers.get(idPC).get('respondsTo-ping').put(false);
                                    }
                                });
                                //[launchLanScan] FREE LOCK AND PROGRAM NEXT CALL
                                NMAP_IS_WORKING = false;
                                var nbSecsBeforeNextScan = 60 * 60;
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
                                var ip = pc.lanIP;
                                var hostAddress = ip;
                                if (hostAddress === THIS_PC.lanInterface.ip_address) {
                                    hostAddress = '127.0.0.1';   //self scan specific
                                    //20171018 Ping('localhost') doesnt work with the ping-bluebird nodejs package on windows10
                                }
                                return new Promise(function (resolve) {
                                    Ping(hostAddress, {timeout: 4})
                                        .catch(function (res) {
                                            //required to resolve(finalResult) after ping fail
                                        }).then(function (res) {
                                        var finalResult = {
                                            idPC: idPC,
                                            lanIP: ip,
                                            'respondsTo-ping': res.alive
                                        };
                                        //res.time non supporte par npm package ping-bluebird
                                        finalResult.online = finalResult["respondsTo-ping"];
                                        if (finalResult.online) {
                                            finalResult.lastResponse = new Date().toISOString();
                                        }
                                        resolve(finalResult);
                                    });
                                });
                            }

                            function httpCheck(pc, idPC) {
                                var ip = pc.lanIP;
                                return new Promise(function (resolve) {

                                    var hostAddress = ip;
                                    if (hostAddress === THIS_PC.lanInterface.ip_address) {
                                        hostAddress = '127.0.0.1';  //self scan specific
                                    }
                                    var url = 'http://' + hostAddress + ':' + Config.val('SERVER_PORT') + Config.val('PATH_HTTP_EVENTS') + '/check';

                                    var errorMsg = "";
                                    Request(url).catch(function (err) {
                                        errorMsg = err;
                                        //example: "Error: connect ECONNREFUSED 127.0.0.1:842"
                                    }).then(function (jsonString) {
                                        var finalResult = {};
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
                                            //finalResult.online = false;
                                            //TODO: only if doesnt responds to ping+http+socket then offline
                                            //CURRENTLY: online status based on ping only
                                            finalResult['respondsTo-http'] = false;
                                        }
                                        finalResult.idPC = idPC;
                                        finalResult.lanIP = ip;

                                        resolve(finalResult);
                                    });

                                });
                            }


                            function socketCheck(pc, idPC) {
                                var lanMAC = pc.lanMAC;
                                var machineID = pc.machineID;

                                return new Promise(function (resolve) {

                                    if(lanMAC && machineID){
                                        console.log("#Check socket for machineID: \n" + machineID +"\n");

                                        //like sendRequest function in client.js :
                                        var reqData = {
                                            eventName: 'check',
                                            eventResult: '',
                                            eventSendedAt: new Date().toISOString(),
                                            eventReceivedAt: null,
                                            pcTargetLanMAC: lanMAC,
                                            pcTargetMachineID: machineID,
                                        };
                                        var dbMsg = global.gun.get(Config.val('TABLE_MESSAGES'));
                                        dbMsg.get('singleton').put(reqData);
                                        //we cant wait for a response as with http event
                                        //respondTo-socket update is done in gun.js database directly
                                    }

                                    var finalResult = {
                                        idPC: idPC,
                                        'respondsTo-socket': false
                                    };
                                    //stay false until gun-js db update

                                    resolve(finalResult);
                                });
                            }


                            async function launchQuickScan(visibleComputers) {
                                var arrayReturn = [];

                                //PING CHECK PROMISES
                                for (let [key, pcObject] of visibleComputers) {
                                    var result = pingCheck(pcObject, key).then(function (finalResult) {
                                        //Update pc infos :
                                        F.logCheckWarning("ping", dbComputers, finalResult);
                                        //  ORG dbComputers.get(result.idPC).get('online').put(result.online);
                                        //  ORG dbComputers.get(result.idPC).get('respondsTo-ping').put(result.online);
                                        dbComputers.get(finalResult.idPC).val(function (pcToUpdate, id) {
                                            for (var key in finalResult) {
                                                pcToUpdate[key] = finalResult[key];
                                            }
                                            dbComputers.get(finalResult.idPC).put(pcToUpdate);      //=> un seul event declenché coté client ? [A VERIFIER]
                                            F.logCheckResult("ping", pcToUpdate);
                                        });

                                    }, function (reason) {
                                        console.log("##Promise## [pingCheck] Promise rejected");
                                    });
                                    arrayReturn.push(result);
                                }

                                //HTTP CHECK PROMISES
                                for (let [key, pcObject] of visibleComputers) {
                                    var result = httpCheck(pcObject, key).then(function (finalResult) {
                                        //Update pc infos :
                                        F.logCheckWarning("http", dbComputers, finalResult);
                                        dbComputers.get(finalResult.idPC).val(function (pcToUpdate, id) {
                                            for (var key in finalResult) {
                                                pcToUpdate[key] = finalResult[key];
                                            }
                                            dbComputers.get(finalResult.idPC).put(pcToUpdate);
                                            F.logCheckResult("http", pcToUpdate);
                                        });
                                    }, function (reason) {
                                        console.log("##Promise## [httpCheck] Promise rejected");
                                    });
                                    arrayReturn.push(result);
                                }

                                //SOCKET (GUN.JS) PROMISES
                                for (let [key, pcObject] of visibleComputers) {
                                    var result = socketCheck(pcObject, key).then(function (finalResult) {
                                        F.logCheckWarning("socket", dbComputers, finalResult);
                                    }, function (reason) {
                                        console.log("##Promise## [socketCheck] Promise rejected");
                                    });
                                    arrayReturn.push(result);
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
                            var pingPromises = launchQuickScan(visibleComputers);
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
                            if ((typeof p.pcTarget === 'undefined') || (p.pcTarget.lanMAC === p.lanInterface.mac_address)) {
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
                    app.all(Config.val('PATH_HTTP_EVENTS') + '/:eventName', async function (request, response) {
                        //app.all() GET, POST, PUT, DELETE, or any other HTTP request method
                        //request.query comes from query parameters in the URL
                        //request.body properties come from a form post where the form data
                        //request.params comes from path segments of the URL that match a parameter in the route definition such a /song/:songid
                        var p = {
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
                    var dbMessages = gun.get(Config.val('TABLE_MESSAGES'));
                    dbMessages.map().on(function (eventData, id) {

                        if (eventData && eventData.eventReceivedAt == null) {
                            //if event recipient has not installed application (detected by machineID)
                            //then, if lanMAC is know in visibleComputers, we redirect the event on local network.
                            var pcTarget = {
                                lanMAC: eventData.pcTargetLanMAC,
                                machineID: eventData.pcTargetMachineID
                            };
                            var idPC = F.getPcIdentifier(pcTarget);

                            if(pcTarget.lanMAC === THIS_PC.lanInterface || pcTarget.machineID === THIS_PC.machineID)
                            {
                                if(eventData.eventName === 'check')
                                {
                                    //specific for check event over gun.js database :
                                    console.log("==== SOCKET CHECK UPDATE DATABASE DIRECTLY ! ====");
                                    var finalResult = {
                                        idPC: idPC,
                                        lanMAC: pcTarget.lanMAC,
                                        machineID: pcTarget.machineID,
                                        'respondsTo-socket': true,
                                        online: true,
                                        lastResponse: new Date().toISOString(),
                                    };
                                    dbComputers.get(finalResult.idPC).val(function (pcToUpdate, id) {
                                        for (var key in finalResult) {
                                            pcToUpdate[key] = finalResult[key];
                                        }
                                        dbComputers.get(finalResult.idPC).put(pcToUpdate);      //=> un seul event declenché coté client ? [A VERIFIER]
                                        F.logCheckResult("socket", pcToUpdate);
                                    });
                                }
                                else
                                {

                                    eventData.eventResult = '';
                                    eventData.eventReceivedAt = new Date().toISOString();
                                    //we have to update database first if event is going to stop the server (power-off/sleep-mode/...)
                                    gun.get(Config.val('TABLE_MESSAGES')).get(id).put(eventData, function () {

                                        //then we can process event:
                                        var p = {
                                            eventName: eventData.eventName,
                                            pcTarget: pcTarget,
                                        };
                                        let responseData = eventDispatcher(p, 'socket');

                                        evtResult = {};
                                        if (responseData) {
                                            evtResult = responseData;
                                            //contain evtResult.msg
                                        }
                                        else{
                                            evtResult.msg = eventData.eventName + ' event received (no response)';
                                        }
                                        //send response message by updating eventResult database field:
                                        eventData.eventResult = JSON.stringify(evtResult);

                                        gun.get(Config.val('TABLE_MESSAGES')).get(id).put(eventData);
                                    });

                                }

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
        var hostmachine = req.headers.host.split(':')[0];
        if(hostmachine!=='localhost' && hostmachine!=='127.0.0.1')
        {
            res.send(401);
            //on utilise un token pour etre sur que l'ordre de config vient du PC où est installé l'app
            //sinon: laucnh another server listening localhost only:
            //var localhostSrv = http.createServer().listen(80, '127.0.0.1');
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


};    //end-module-export