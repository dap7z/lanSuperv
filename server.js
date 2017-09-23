/*************************************************************************************
lanSuperv : 
- affiche les pc connectés et deconnectés du reseau local du serveur.
- permet d'envoyer des packets WakeOnLan
prochaines versions :
- server.js installable sur toutes les machines permettant :
poweroff / messanger / filetransfert / netsharing / remotecontrole / ...


logiciel similaire:
https://github.com/AllGloryToTheHypnotoad/nodescan //jeter un oeil si blocacage
*************************************************************************************/


//CONFIG:
Config = require('./web/config.js');
console.log('current database: '+ Config.val('FILE_SHARED_DB'));


//LIBRARY:
const Os = require("os");
const NodeMachineId = require('node-machine-id');

const Fs = require('fs');
const Path = require('path');
const Gun = require('gun');
const GunPath = require('gun/lib/path.js');

const Express = require('express'); //nodejs framework
const BodyParser = require("body-parser"); //to get POST data
const Crypto = require('crypto');
const Network = require('network');
const Netmask = require('netmask').Netmask;
const ExtIP = require("ext-ip")();

const Wol = require('wol');	//TODO:SUPPR

const Ping = require('ping');
const Nmap = require('node-nmap');
//Nmap.nmapLocation = 'nmap'; //default 
//Nmap.nmapLocation = 'C:\Program Files (x86)\Nmap\nmap.exe';  //NOTOK
//Nmap.nmapLocation = 'C:/Program Files (x86)/Nmap/nmap.exe';  //OK

const { fork } = require('child_process');


const F = require('./functions');


//GLOBALS:
var APP_SERVER_ID = '';
var NMAP_IS_WORKING = false;




//----- GET NETWORK INFORMATION -----
Network.get_active_interface(function(err, activeInterface) {
	
	//compatibility fix linux (ubuntu server 16.4)
    if(!activeInterface.netmask){
		var goodNetmask = require('my-local-netmask')();
        console.log("compatibility fix netmask '"+ activeInterface.netmask +"' => '"+ goodNetmask +"'");
		//compatibility fix netmask 'undefined' => '255.255.255.0'
        activeInterface.netmask = goodNetmask;
    }
    
    var wanInterface = {};
	
    //nmap accepte 192.168.1.1-254 et 192.168.1.1/24 mais pas 192.168.1.1/255.255.255.0
    //donc on traduit :
    var lanInterface = (function(){
        var obj = activeInterface;
        var block = new Netmask(obj.gateway_ip +'/'+ obj.netmask);
        obj.fullmask = obj.netmask;
        delete obj.netmask; //unset
        obj.bitmask = block.bitmask;
        obj.network = block.base;
        obj.mac_address = obj.mac_address.toUpperCase();
        return obj;
    })();   //fonction anonyme pour eviter garder vars en memoire
    var scanNetwork = lanInterface.network +'/'+ lanInterface.bitmask;
    
    //define APP_SERVER_ID with node-machine-id + lan mac adress
    NodeMachineId.machineId({original: true}).then((id) => {
        function hash(guid){
            //return Crypto.createHash('sha1').update(guid).digest('hex'); //=>40
            return Crypto.createHash('sha256').update(guid).digest('hex'); //=>64
        }
        APP_SERVER_ID = hash(id+lanInterface.mac_address); //global scope
        //console.log('OriginalMachineId: '+ id +' \nHashedMachineId: '+ APP_SERVER_ID);
    })

    
    
    //----- LAUNCH HTTP SERVER -----
    var app = Express();
    app.set('port', Config.val('SERVER_PORT') );
    app.use(Express.static(Path.join(__dirname, 'web')));
    //__dirname is native Node variable which contains the file path of the current folder
    app.use(BodyParser.urlencoded({extended: false}));   //to get POST data
    //extended: false means you are parsing strings only (not parsing images/videos..etc)
    app.use(BodyParser.json());
    
    var server = app.listen(app.get('port'), function() {
        //get listening port
        var port = server.address().port;
        //get public ip
        ExtIP((err, ip) => {
            if(err){
                throw err;
            }
            wanInterface.ip = ip;
            console.log('lanSuperv web server available on http://localhost:'+ port +' (wanIP: '+ wanInterface.ip +')' );
        });
    });
    
    
    app.get('/check', function(req, res) {
        var params = {
            hostname: Os.hostname(),
            lastCheck: new Date().getTime(),
            lanIP: lanInterface.ip_address,
            lanMAC: lanInterface.mac_address,
            machineID: APP_SERVER_ID
        };
        var pc = F.pcObject(params, lanInterface, wanInterface, 'CHECK');
        //each plugins as a key of pc object:
        var plugins = F.getPlugins('all','dirName');
        for (var key in plugins) {
            pc[key] = plugins[key];
        }
        res.json(pc); //json response
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
    
    
    
    //----- DECENTRALIZED DB -----
    var gun = Gun({ file: Config.val('FILE_SHARED_DB'), web: server});
    var dbComputers = gun.get( Config.val('TABLE_COMPUTERS') ); 
    //dbComputers is decentralized db and can be updated by multiples servers and so represents multiples lans
    //we need a way to determine if one computer is in the lan of the server (to declare him offline).
    
    ////----- LOCAL DB -----
    //var gunLocal = Gun({ file: Config.val('FILE_LOCAL_DB') });
    //var dbPreviousScan = gun.get( Config.val('TABLE_COMPUTERS_LAN') );
    //OR ONLY  :
    var visibleComputers = new Map();
    var installedComputers = new Map();
    //visibleComputers map is empty before first scan on server restart
    
    
    var pluginsInfos = new Array();
    var plugins = F.getPlugins('all','dirPath','array');
    plugins.map(function(dirPath) {

        var eventName = Path.basename(dirPath);	//pluginDirName
        var execPath = '';
        var exec = Fs.readdirSync(dirPath).filter( function(elm){return elm.match(/execute\.*/g);} );

        if(exec.length == 1)
        {
            pluginsInfos[eventName] = {
                dirPath: dirPath,
                execPath: dirPath + Path.sep + exec
            };
        }
        
        var diagPluginDetection = false;
        if(diagPluginDetection)
        {
            var logMsg = '[PLUGIN '+ eventName +'] file: ';
            if(execPath != ''){
                logMsg += execPath;
            }
            else{
                logMsg += dirPath + Path.sep +'execute.* ERROR_NOT_FOUND';
            }
            console.log(logMsg);
        }
    });
    //console.log('Result: array pluginsInfos');
    //console.log(pluginsInfos);
    
    
   //[launchLanScan]START METHOD
   function launchLanScan(){
       if(NMAP_IS_WORKING)
       {
           console.log('launchLanScan canceled (NMAP_IS_WORKING)');
       }
       else
       {
           NMAP_IS_WORKING = true;

           var scan = new Nmap.NmapScan(scanNetwork, '-sP -T4');
            scan.on('error', function(error){
                console.log(error);
            });
            scan.on('complete', function(data){

                console.log('[NMAP SCAN COMPLETE IN '+ scan.scanTime +' MS]');
                //console.log(data);

                //var scannedComputers = [];
                var scannedComputers = new Map();

                var scanTimeStamp = new Date().getTime();
                var remotePlugins = F.getPlugins('remote','dirName');

                for(var i=0 ; i<data.length ; i++)
                {
                    var d = data[i];
                    //console.log(d);
                    var params = {
                        hostname: d.hostname,
                        lastCheck: scanTimeStamp,
                        lanIP: d.ip, //<> lanInterface.ip_address
                        lanMAC: d.mac,
                    };
                    var pc = F.pcObject(params, lanInterface, wanInterface, "SCAN");

                    //Gun.js do not support array, pc must be an object
                    //pc simple key value object for simlper gun.js database

                    var plugins = remotePlugins;
                    if(pc.lanIP == lanInterface.ip_address)
                    {
                        //self scan specific
                        pc.lanMAC = lanInterface.mac_address;
                        console.log('fixed null mac address returned for server');
                        pc.machineID = APP_SERVER_ID;
                        console.log('fixed machineID returned for server');
                        plugins = F.getPlugins('all','dirName');
                        console.log('fixed not only remote plugins for server');
                    }
                    else
                    {
                        var check = fork('./checkrequest.js', [], {silent: true});
                        //{silent: true} no stderr/stdout but on message still working
                        check.send('http://'+ pc.lanIP +':'+ Config.val('SERVER_PORT') +'/check');
                        check.on('message', (msg) => {
                            var resultPc = JSON.parse(msg);
                            if(resultPc)
                            {
                                //if get json response from http://ip:port/check
                                var idCheckedPC = F.getPcIdentifier(resultPc);

                                //hostname can differ, exemple: dapo.fr.cr(dns)/webserver(local name)
                                for (var key in resultPc) {
                                    if(key != 'hostname'){   //desactivated for no overwrite dns
                                        dbComputers.get(idCheckedPC).get(key).put(resultPc[key]);
                                    }
                                }

                                //and save machineID as database index ?
                                //installedComputers[idCheckedPC] = new Date().getTime();
                                //installedComputers[resultPc.machineID] = new Date().getTime();
                                installedComputers[resultPc.machineID] = resultPc.lanIP; // PAS SUPER...
                                //TODO trouver moyen checher dans bdd gun.js
                            }
                        });

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

                 visibleComputers.forEach(function(value, key){
                     var idPC = key;
                     if(scannedComputers.has(idPC) == false){
                        dbComputers.get(idPC).get('online').put(false);
                        console.log('idPC:'+ idPC +' => online false');
                    }
                });

                //[launchLanScan] FREE LOCK AND PROGRAM NEXT CALL
                NMAP_IS_WORKING = false;
                var nbSecsBeforeNextScan = 60*60;
                setTimeout(function(){
                    launchLanScan();
                }, 1000*nbSecsBeforeNextScan);
                
            });
       }
   }
   //[launchLanScan] END METHOD
    //[launchLanScan] FIRST CALL
    launchLanScan();
    
    
    
   //----- LISTEN SOCKET -----
   const Io = require('socket.io')({path: Config.val('PATH_SOCKET_EVENTS')});
   Io.listen(server);
   Io.sockets.on('connection', function(connectedSocket){
       //console.log('[!] SOCKET CONNECTION ESTABLISHED [!]');
       
       
       
        ////[DEBUT PROMISES REFERENCE TEST]
        //       //https://blog.risingstack.com/mastering-async-await-in-nodejs/
        //            function asyncThing (value) {
        //              return new Promise((resolve, reject) => {
        //                setTimeout(() => resolve(value), 100)
        //              })
        //            }
        //
        //            async function main () {
        //              return [1,2,3,4].map(async (value) => {
        //                const v = await asyncThing(value)
        //                return v * 2
        //              })
        //            }
        //
        //            main()
        //              .then(v => console.log(v))
        //              .catch(err => console.error(err))
        //       //...
        //       //   [ Promise { <pending> },
        //       //   Promise { <pending> },
        //       //   Promise { <pending> },
        //       //   Promise { <pending> } ]
        ////[FIN PROMISES REFERENCE TEST] 
       
       
       
       //TODO: periodicaly remove old visibleComputers entry by lastCheckTimeStamp
       
       
        if(visibleComputers.size > 0)
        {
            //QuickScan: only previously visibles computers
            //LanScan: map ping on whole lan primary interface

            function pingRequest(pc, idPC){
                var ip = pc.lanIP;
                return new Promise(function(resolve, reject){
                    Ping.promise.probe(ip)
                        .then(function(res) {
                            var finalResult = {
                                idPC: idPC,
                                ip:ip,
                                online:res.alive,
                                pingTime:res.time
                            };
                            resolve(finalResult);
                    });
                });
            }

            async function launchQuickScan(visibleComputers){
                var arrayReturn = new Array();
                visibleComputers.forEach(async function(value, key){
                    var result = await pingRequest(value, key);
                    //console.log('await pingRequest() result :');
                    //console.log(result);

                    //Update online status :
                    if(typeof dbComputers == 'undefined'){
                        console.log("[pingRequest] gun.js dbComputers required !");
                    }else{
                        console.log("[pingRequest] dbComputers.get("+ result.idPC +").get('online').put("+ result.online +");");
                        dbComputers.get(result.idPC).get('online').put(result.online);
                    }

                    arrayReturn.push(result);
                });
                return arrayReturn;
            }

            launchQuickScan(visibleComputers)
                //.then(v => console.log(v))
                .then(function(v){
                    console.log('°°°°°°°°°°°°° PROMISES  °°°°°°°°°°°°°°');
                    console.log(v);

                    launchLanScan();
                })
                .catch(err => console.error(err));
        }
       
       
       
        //++++++++ SOCKER IO EVENT ++++++++++
        connectedSocket.on('pluginRequest', function(p){
            eventDispatcher(p, 'SOCKET');
        });
       

    });
    
    
    
    
    //same process (and parameters) on socket or http :
    function eventDispatcher(p, execFrom){
        //used globals: pluginsInfos lanInterface dbComputers

        //add parameters :
        p.dirPath = pluginsInfos[p.eventName].dirPath;
        p.execPath = pluginsInfos[p.eventName].execPath;
        p.lanInterface = lanInterface;

        console.log("°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°");
        console.log("eventDispatcher "+ execFrom +" event received: "+ p.eventName +", parameters:");
        console.log(p);
        console.log("°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°");

        processEvent = true;
        if(p.dirPath.indexOf('local-responses') >= 0) //if local-response 
        {
            if((typeof p.pcTarget == 'undefined') || (p.pcTarget.lanMAC == p.lanInterface.mac_address))
            {
                p.pcTarget = 'self';
            }
            else if(p.pcTarget != 'self')
            {
                F.eventRedirection(p.pcTarget, p.eventName, dbComputers);
                //event transmited, nothing more to do.
                processEvent = false;
            }
        }

        //exec plugin in child process
        if(processEvent)
        {
            F.eventExecution(p.pcTarget, p.eventName, p.execPath);
        }
    }
    
    
    
    
    //++++++++ HTTP EVENT ++++++++++
    app.all(Config.val('PATH_HTTP_EVENTS')+'/:eventName', function(request, response) {
        //app.all() GET, POST, PUT, DELETE, or any other HTTP request method
        //request.query comes from query parameters in the URL
        //request.body properties come from a form post where the form data
        //request.params comes from path segments of the URL that match a parameter in the route definition such a /song/:songid
        var p = {
            eventName: request.params.eventName,
            pcTarget: 'self'
        };
        
        if((typeof request.body!='undefined') && (request.body.length>0))
        {
            console.log('request.body');
            console.log(request.body);
            //... NOK
            //reqParameters = JSON.parse(request.body);
            //reqParameters = reqParameters.jsonString;   
            //p.pcTarget = reqParameters.pcTarget;
        }

        eventDispatcher(p, 'HTTP');
    });
    
    
    
    
    
});


