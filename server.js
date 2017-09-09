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
var appServerId = '';

const Fs = require('fs');
const Gun = require('gun');
const GunPath = require('gun/lib/path.js');

const Crypto = require('crypto');
const Path = require('path');
const Express = require('express');
const Network = require('network');
const Netmask = require('netmask').Netmask;
const ExtIP = require("ext-ip")();

const Wol = require('wol');	//TODO:SUPPR

const Nmap = require('node-nmap');
//Nmap.nmapLocation = 'nmap'; //default 
//Nmap.nmapLocation = 'C:\Program Files (x86)\Nmap\nmap.exe';  //NOTOK
//Nmap.nmapLocation = 'C:/Program Files (x86)/Nmap/nmap.exe';  //OK

const { fork } = require('child_process');



function getDirectories(p) {
	var dirs =  Fs.readdirSync(p).filter(function (file) {
		return Fs.statSync(p+'/'+file).isDirectory();
	});
	dirsPaths = [];
	dirs.map(function (dir) {
		dirsPaths.push(Path.join(p, dir));
	});
	return dirsPaths;
}
function getPlugins(type='all',result='dirPath', format='object'){
    var results;
    var pluginsDirPath;
    if(type=='all'){
        var remoteRequestsPlugins = getDirectories('./plugins/remote-requests/');
        var localResponsesPlugins = getDirectories('./plugins/local-responses-enabled/');
        pluginsDirPath = remoteRequestsPlugins.concat(localResponsesPlugins);
    }
    else if(type=='remote'){
        pluginsDirPath = getDirectories('./plugins/remote-requests/');
    }
    else if(type=='local'){
        pluginsDirPath = getDirectories('./plugins/local-responses-enabled/');
    }
    //get results :
    if(result=='dirName'){
        pluginsDirName = new Array();
        pluginsDirPath.forEach(function(dirPath) {
            pluginsDirName.push(Path.basename(dirPath));
        });
        results = pluginsDirName;
    }else{
        results = pluginsDirPath;
    }
    //format results :
    if(format=='object'){
        //array to object for gun.js compatibility
        var obj = {};
        var pluginsId = 0;
        results.forEach(function(key) {
            pluginsId += 1;
            obj['plugin'+pluginsId] = key;
        });
        results = obj;
    }
    return results;
}
function pcObject(params, lanInterface, wanInterface){
    var msgErr = 'pcObject() missing parameter: '
    if(!params.hostname) console.log(msgErr+'hostname');
    if(!params.lastCheck) console.log(msgErr+'lastCheck');
    if(!params.lanIP) console.log(msgErr+'lanIP');  //<> lanInterface.ip_address
    if(!params.lanMAC) console.log(msgErr+'lanMAC');
    pc = params;
    pc.online = true;
    pc.nickname = '';
    pc.lanNetwork = lanInterface.network;
    pc.lanBitmask = lanInterface.bitmask;
    pc.lanFullmask = lanInterface.fullmask;
    pc.lanGateway = lanInterface.gateway_ip;
    pc.wanIP = wanInterface.ip;
    if(typeof pc.lanMAC != 'undefined' && pc.lanMAC != null){
        pc.lanMAC = pc.lanMAC.toUpperCase();
    }
    return pc;
}






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
    
    //define appServerId with node-machine-id + lan mac adress
    NodeMachineId.machineId({original: true}).then((id) => {
        function hash(guid){
            return Crypto.createHash('sha256').update(guid).digest('hex');
        }
        appServerId = hash(id+lanInterface.mac_address); //global scope
        //console.log('OriginalMachineId: '+ id +' \nHashedMachineId: '+ appServerId);
        //PC-Damien: 228e7f73b987fab96ddade3220d3a87f2c700aea65f02e34220060a119f12f5f
    })

    
    
    //----- LAUNCH HTTP SERVER -----
    var app = Express();
    app.set('port', Config.val('SERVER_PORT') );
    app.use(Express.static(Path.join(__dirname, 'web')));
    //__dirname is native Node variable which contains the file path of the current folder
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
    
    app.get('/config', function(req, res) {
        var hostmachine = req.headers.host.split(':')[0];
        if(hostmachine!=='localhost' && hostmachine!=='127.0.0.1')
        {
            res.send(401);
            //on utilise un token pour etre sur que l'ordre de config vient du PC où est installé l'app
            //szinon: laucnh another server listening localhost only:
            //var localhostSrv = http.createServer().listen(80, '127.0.0.1');
        }
        else
        {
            //localhost only
            res.send('/config');
            
            //TODO
        }
    });
    
    app.get('/check', function(req, res) {
        var params = {
            hostname: Os.hostname(),
            lastCheck: new Date().getTime(),
            lanIP: lanInterface.ip_address,
            lanMAC: lanInterface.mac_address,
            machineID: appServerId,
            plugins: getPlugins('all','dirName')
        };
        var pc = pcObject(params, lanInterface, wanInterface);
        //console.log(pc);
        res.json(pc); //json response
    });
    
    
    //----- DECENTRALIZED DB -----
    var gun = Gun({ file: Config.val('FILE_SHARED_DB'), web: server});
    var dbComputers = gun.get( Config.val('TABLE_COMPUTERS') ); 
    //dbComputers is decentralized db and can be updated by multiples servers and so represents multiples lans
    //we need a way to determine if one computer is in the lan of the server (to declare him offline).
    
    ////----- LOCAL DB -----
    //var gunLocal = Gun({ file: Config.val('FILE_LOCAL_DB') });
    //var dbPreviousScan = gun.get( Config.val('TABLE_COMPUTERS_LAN') );
    
    //OR ONLY THAT :
    var visibleComputers = new Array();

    
    
    
   //----- LISTEN SOCKET -----
   const Io = require('socket.io')({path: Config.val('PATH_EVENTS')});
   Io.listen(server);
   Io.sockets.on('connection', function(socket){
    

        //exec nmap ping on lan interface :
        var quickscan = new Nmap.QuickScan(scanNetwork);
        //quickscan.startScan(); //not required...

        quickscan.on('error', function(error){
            console.log(error);
        });
        quickscan.on('complete', function(data){
            var scannedComputers = [];
            var scanTimeStamp = new Date().getTime();
            var remotePlugins = getPlugins('remote','dirName');
            
            for(var i=0 ; i<data.length ; i++){
                var d = data[i];
                //console.log(d);
                var params = {
                    hostname: d.hostname,
                    lastCheck: scanTimeStamp,
                    lanIP: d.ip,
                    lanMAC: d.mac,
                };
                pc = pcObject(params, lanInterface, wanInterface);
                
                //Gun.js do not support array, pc must be an object
                //pc simple key value object for simlper gun.js database
                
                var plugins = remotePlugins;
                //self scan specific :
                if(pc.lanIP == lanInterface.ip_address){
                    pc.lanMAC = lanInterface.mac_address;
                    console.log('fixed null mac address returned for server');
                    console.log('fixed not only remote plugins for server');
                    plugins = getPlugins('all','dirName');
                }
                //computer identifier :
                var idPC = pc.lanMAC;
                idPC = idPC.replace(new RegExp(':', 'g'), '');
                //var idPC = pc.lanNetwork + pc.lanBitmask + pc.lanMAC;
                //we stay with MAC adress only as unique identifier 
                //(it's supposed to be, and lan config is reproducible too)
                
                //for compare that scan to the others:
                visibleComputers[idPC] = scanTimeStamp;
                scannedComputers[idPC] = scanTimeStamp;
                
                //each plugins as a key of pc object:
                for (var key in plugins) {
                    pc[key] = plugins[key];
                }
                
                dbComputers.get(idPC).put(pc);
            }
            
            
            
            dbComputers.on(function (newVal) {
                //console.log('[gunDB] computers updated');
                //console.log(newVal); //full gun object
            });
            
            //show offline computers :
            Object.keys(visibleComputers).forEach(function (idPC) {
                if(!scannedComputers[idPC]){
                    dbComputers.get(idPC).get('online').put(false);
                }
            });
        });
       
		
        //ADD .ON FOR EACH PLUGIN (SUB DIRECTORY)
        var plugins = getPlugins('all','dirPath','array');
        plugins.map(function(dirPath) {
            var eventName = Path.basename(dirPath);	//pluginDirName
            var execPath = '';

            var exec = Fs.readdirSync(dirPath).filter( function(elm){return elm.match(/execute\.*/g);} );
            if(exec.length == 1)
            {
                execPath = dirPath + Path.sep + exec;
                
                //SOCKER IO EVENT ----- ACTION ON RECEIVED EVENTS -----
                socket.on(eventName, function(pcTarget){
                    console.log("'"+ eventName +"' event received, pcTarget:");
                    console.log(pcTarget);
                    
                    
                    if(dirPath.indexOf('local-responses') >= 0){
                        if(pcTarget.lanMAC == lanInterface.mac_address){
                            pcTarget = 'self';
                        }else{
                            pcTarget = {};
                            console.log('[PLUGIN '+ eventName +'] error: local execution only');
                        }
                    }
                    
                    //exec plugin in child process
                    if(pcTarget)
                    {
                        const compute = fork(execPath);
                        compute.send(pcTarget);
                        compute.on('message', (msg) => {
                            console.log('[PLUGIN '+ eventName +'] message: '+ msg);
                        });
                    }

                });

            }


            var logMsg = '[PLUGIN '+ eventName +'] file: ';
            if(execPath != ''){
                logMsg += execPath;
            }
            else{
                logMsg += dirPath + Path.sep +'execute.* ERROR_NOT_FOUND';
            }
            console.log(logMsg); //(server console.log only after socket io connection)

        });


       


//        //SOCKER IO EVENT
//        //----- ACTION ON RECEIVED EVENTS -----
//        socket.on('wol', function(pcTarget){
//            console.log("=== WORKING WOL EXEC ===");
//            //...MARCHE PLUS... en fait wol marche plus du tout...
//
//            try {
//                //send magic packet
//                var macAddr = pcTarget.lanMAC;
//                Wol.wake(macAddr, function(err, res){
//                    console.log('wol result: '+ res);
//                });
//            } catch (e) {
//                console.warn('Catched error on wol', macAddr, e);
//            }
//
//        });
			  
                  



    });
    
    
    
    
});


