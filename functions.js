//=================================//
// LANSUPERV FUNCTIONS COLLECTIONS //
//=================================//

//used libraries
const Fs = require('fs');
const Path = require('path');
const { fork } = require('child_process');

//public functions
module.exports = {
    
    getDirectories: function(p){
        var dirs =  Fs.readdirSync(p).filter(function (file) {
            return Fs.statSync(p+'/'+file).isDirectory();
        });
        dirsPaths = [];
        dirs.map(function (dir) {
            dirsPaths.push(Path.join(p, dir));
        });
        return dirsPaths;
    },
    
    
    getPlugins: function(type='all',result='dirPath', format='object'){
        var results;
        var pluginsDirPath;
        if(type=='all'){
            var remoteRequestsPlugins = this.getDirectories('./plugins/remote-requests/');
            var localResponsesPlugins = this.getDirectories('./plugins/local-responses-enabled/');
            pluginsDirPath = remoteRequestsPlugins.concat(localResponsesPlugins);
        }
        else if(type=='remote'){
            pluginsDirPath = this.getDirectories('./plugins/remote-requests/');
        }
        else if(type=='local'){
            pluginsDirPath = this.getDirectories('./plugins/local-responses-enabled/');
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
    },
    
    
    pcObject: function(params, lanInterface, wanInterface, diagCallFrom=''){
        var expectedParams = new Array('hostname', 'lastCheck', 'lanIP', 'lanMAC');
        var missingSomeParams = false;
        expectedParams.forEach(function(paramKey) {
            if(!params[paramKey]){
                params[paramKey]='';
                console.log('pcObject() missing parameter: '+ paramKey);
                missingSomeParams = true;
            } 
        });
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
        //if(missingSomeParams){
        //    console.log("Some params was missing (diagCallFrom:"+ diagCallFrom +") :");
        //    console.log(pc);
        //}
        return pc;
    },
    
    
    getPcIdentifier: function(pc){
        var idPC = pc.lanMAC;   //computer identifier (simplified MAC adress)
        //used as unique identifier (it's supposed to be and we cant machine-id if app is not installed)
        return idPC.replace(new RegExp(':', 'g'), '');
    },
    
    
    eventRedirection: function(pcTarget, eventName, dbComputers, method='http'){
        console.log('[PLUGIN '+ eventName +']: local execution only => resend event through socket');

        //Search computer that have the same machineID in (gun.js bdd|local array!) and get his actual IP:
        //console.log('Search for machineID:'+ pcTarget.machineID);
        //TODO


        //Retrieve pc info from database :
        var idTargetPC = this.getPcIdentifier(pcTarget);
        dbComputers.get(idTargetPC).val(function(pcTarget, id){
            //necessite dbComputers en parametre fonction eventRedirection...
            
            
            if(method=='socket')
            {
                //NOT WORKING YET
                //TODO: TESTS AND DEV
                
                //====[SOCKET]====
                var newRoute = 'http://'+pcTarget.lanIP+':'+Config.val('SOCKET_PORT')+Config.val('PATH_SOCKET_EVENTS');
                console.log('newRoute: '+ newRoute); //"http://10.10.22.36:842/whatever"
                var ioClient = require("socket.io-client");
                var socketClient = ioClient.connect(newRoute);
                socketClient.on('connect', function () { console.log("socket connected to "+ pcTarget.lanIP); });   //OK?
                socketClient.emit(eventName, pcTarget);

                console.log('=> socket redirected to :'+ newRoute);
                //===============
            }
            else
            {
                //HALF WORKING (form post data is not sended => selfTarget => OK FOR ONE REDIRECTION, NOT MORE)
                //TODO: TESTS AND DEV
                
                //====[HTTP]====
                var Request = require('request');
                // Set the headers
                var headers = {
                    'User-Agent':       'LanSuperv Agent/1.0.0',
                    'Content-Type':     'application/x-www-form-urlencoded'
                }

                var jsonString = JSON.stringify({
                    'eventName': eventName,
                    'password' : 'notImplemented',
                    'pcTarget': pcTarget
                });

                var reqUrl = 'http://'+ pcTarget.lanIP +':'+ Config.val('SERVER_PORT') + Config.val('PATH_HTTP_EVENTS') +'/'+ eventName;
                console.log('reqUrl: '+reqUrl); //OK?

                // Configure the request
                var options = {
                    url: reqUrl,
                    method: 'POST',
                    headers: headers,
                    form: {'jsonString': jsonString}
                }
                
                
//                // Start the request
//                Request(options, function (error, response, body) {
//
//                    console.log(Config.val('PATH_HTTP_EVENTS') +' response.statusCode: '+ response.statusCode);
//                    console.log(body);
//                    console.log(response);
//                    //OK?
//
//                    if (!error && response.statusCode == 200) {
//                        // Print out the response body
//                        console.log('sucess');
//                        console.log(body);
//                    }
//                })
                
                
                Request(options, function(err, res, body) {  
                    if(err)
                    {
                        console.log('Error '+ err.code +' '+ reqUrl);
                         //ECONNREFUSED if no response
                    }
                    else
                    {
                        //console.log("resRES");
                        //console.log(res);

                        console.log("bodyBODY");
                        console.log(body); //undefined
                    }
                });

                
                //===============
            }
            

//#### OTHERS SOCKETS TESTS            
//#         var ioClient = require('socket.io-client');
//#         var socketClient = ioClient.connect('http://'+pcTarget.lanIP, {
//#             port: Config.val('SOCKET_PORT'),
//#             path: Config.val('PATH_SOCKET_EVENTS')
//#         });
//#         socketClient.on('connect', function () { console.log("socket connected to "+ pcTarget.lanIP); });
//#         socketClient.emit('private message', { user: 'me', msg: 'whazzzup?' });

            
//#         //FAIL var Io2 = require('socket.io')({path: Config.val('PATH_SOCKET_EVENTS')});
//#         //var ioClient = require('socket.io-client'); 
//#         var ioClient = require('socket.io-client')({path: Config.val('PATH_SOCKET_EVENTS')});
//#         function emitMessageToServer( socketClient ){
//#             console.log('emit to other server <3');
//#             
//#             socketClient.emit('my other event', { my: 'data' });
//#             
//#             setTimeout(function(){
//#                 emitMessage(socket);
//#             }, 1000);
//#         }
//#         //FAIL var socketClient = ioClient.connect("http://localhost:3000");
//#         var socketClient = ioClient.connect(newRoute, {path: Config.val('PATH_SOCKET_EVENTS')});
//#         emitMessageToServer(socketClient);
//#         
//#//         //FAIL
//#//         var clientSocket = Io2.connect(newRoute, {path: Config.val('PATH_SOCKET_EVENTS')}, function(){
//#//             console.log('............................');
//#//             console.log('connected to other server <3');
//#//    
//#//    
//#//             //socket.emit(eventName, pcTarget);
//#//         });
//#         
//#         //ERREUR: Io2.connect is not a function
//####

            
        });
        
    },
    
    
    eventExecution: function(pcTarget, eventName, execPath){
        var compute = fork(execPath);
        compute.send(pcTarget);
        compute.on('message', (msg) => {
            console.log('[PLUGIN '+ eventName +'] message: '+ msg);
        });
    }


};