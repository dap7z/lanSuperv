//=================================//
// LANSUPERV FUNCTIONS COLLECTIONS //
//=================================//

//used libraries
const Fs = require('fs');
const Path = require('path');
const {fork} = require('child_process');


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
        switch(type){
            case 'all':
                var remoteRequestsPlugins = this.getDirectories(__dirname+'/plugins/remote-requests/');
                var localResponsesPlugins = this.getDirectories(__dirname+'/plugins/local-responses/');
                pluginsDirPath = remoteRequestsPlugins.concat(localResponsesPlugins);
                break;
            case 'remote':
                pluginsDirPath = this.getDirectories(__dirname+'/plugins/remote-requests/');
                break;
            case 'local':
                pluginsDirPath = this.getDirectories(__dirname+'/plugins/local-responses/');
                break;
            default:
                pluginsDirPath = '';
        }

        //get results :
        if(result==='dirName'){
            pluginsDirName = [];
            pluginsDirPath.forEach(function(dirPath) {
                pluginsDirName.push(Path.basename(dirPath));
            });
            results = pluginsDirName;
        }else{
            results = pluginsDirPath;
        }
        //format results :
        if(format==='object'){
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
    
    
    pcObject: function(params, THIS_PC, diagCallFrom=''){
        var lanInterface = THIS_PC.lanInterface;
        var wanInterface = THIS_PC.wanInterface;
        var expectedParams = ['hostname', 'lastCheck', 'lanIP', 'lanMAC'];
        var missingSomeParams = false;
        expectedParams.forEach(function(paramKey) {
            if(!params[paramKey]){
                params[paramKey]='';
                console.log('WARNING! pcObject() missing parameter: '+ paramKey);
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
        if(typeof pc.lanMAC !== 'undefined' && pc.lanMAC != null){
            pc.lanMAC = pc.lanMAC.toUpperCase();
        }
        //if(missingSomeParams){
        //    console.log("Some params was missing (diagCallFrom:"+ diagCallFrom +") :");
        //    console.log(pc);
        //}
        return pc;
    },


    checkData: function(THIS_PC, respondTo){
        var params = {
            hostname: THIS_PC.hostnameLocal,
            lastCheck: new Date().toISOString(),
            lanIP: THIS_PC.lanInterface.ip_address,
            lanMAC: THIS_PC.lanInterface.mac_address,
            machineID: THIS_PC.machineID
        };
        var pc = this.pcObject(params, THIS_PC);
        //each plugins as a key of pc object:
        var plugins = this.getPlugins('all','dirName');
        for (var key in plugins) {
            pc[key] = plugins[key];
        }
        //respondsTo information:
        if(respondTo){
            pc['respondsTo-'+respondTo] = true;
        }
        return pc;
    },
    
    
    getPcIdentifier: function(pc){
        var idPC = pc.lanMAC;   //computer identifier (simplified MAC adress)
        //used as unique identifier (it's supposed to be and we cant machine-id if app is not installed)
        if(idPC){
            idPC = idPC.replace(new RegExp(':', 'g'), '');
        }
        return idPC;
    },
    
    
    eventRedirection: function(eventData, dbComputers, method='http'){
        var pcTarget = eventData.pcTarget;
        var eventName = eventData.eventName;
        
        console.log('[PLUGIN '+ eventName +']: local execution only => resend event through socket');
        //console.log('pcTarget');
        //console.log(pcTarget);
        


        //Search computer that have the same machineID in (gun.js bdd|local array!) and get his actual IP:
        //console.log('Search for machineID:'+ pcTarget.machineID);
        //TODO


        //Retrieve pc info from database :
        var idTargetPC = this.getPcIdentifier(pcTarget);
        dbComputers.get(idTargetPC).once(function(pcTarget, id){
            //necessite dbComputers en parametre fonction eventRedirection...

            if(method==='socket')
            {
                //====[SOCKET]====
                console.log("[ERROR] GUN.JS SOCKETS EVENTS NO NEED REDIRECTION !");
            }
            else if(method==='http')
            {
                //HALF WORKING (form post data is not sended => selfTarget => OK FOR ONE REDIRECTION, NOT MORE)
                //TODO: TESTS AND DEV
                
                //====[HTTP]====
                var Request = require('request');
                // Set the headers
                var headers = {
                    'User-Agent':       'LanSuperv Agent/1.0.0',
                    'Content-Type':     'application/x-www-form-urlencoded'
                };

                var jsonString = JSON.stringify({
                    'eventName': eventName,
                    'pcTarget': pcTarget,
                    'password' : '*not*Implemented*',
                });

                var reqUrl = 'http://'+ pcTarget.lanIP +':'+ Config.val('SERVER_PORT') + Config.val('PATH_HTTP_EVENTS') +'/'+ eventName;
                console.log('[eventRedirection with http] reqUrl: '+reqUrl);

                // Configure the request
                var options = {
                    url: reqUrl,
                    method: 'POST',
                    headers: headers,
                    form: {'jsonString': jsonString}
                };

                Request(options, function(err, res, body) {  
                    if(err)
                    {
                        console.log('Error '+ err.code +' '+ reqUrl);
                         //ECONNREFUSED if no response
                    }
                    else
                    {
                        console.log("JSON response:");
                        console.log(body);
                    }
                });
                
                //===============
            }
            else
            {
                console.log('[error] function eventRedirection: unknow method parameter');
            }
            
        });
        
    },
    
    
    eventExecution: async function(eventParams){
        return new Promise(function (resolve) {
            var eventName = eventParams.eventName;
            var execPath = eventParams.execPath;

            var lastObjectMsg = {};
            var compute = fork(execPath);
            compute.send(eventParams);
            compute.on('message', (msg) => {
                var text = '[PLUGIN ' + eventName + '] message: ';
                if (typeof msg === 'object') {
                    //console.log(text);
                    //console.log(msg);
                    lastObjectMsg = msg;
                } else {
                    console.log(text + msg);
                }

                if (msg === 'end') {
                    //promise return lastObjectMsg
                    resolve(lastObjectMsg);
                }
            });
        });
    },


    //http://2ality.com/2015/08/es6-map-json.html
    strMapToObj: function(strMap) {
        let obj = Object.create(null);
        for (let [k,v] of strMap) {
            // We don’t escape the key '__proto__'
            // which can cause problems on older engines
            obj[k] = v;
        }
        return obj;
    },
    objToStrMap: function(obj) {
        let strMap = new Map();
        for (let k of Object.keys(obj)) {
            strMap.set(k, obj[k]);
        }
        return strMap;
    },
    strMapToJson: function(strMap) {
        return JSON.stringify(this.strMapToObj(strMap));
    },
    jsonToStrMap: function(jsonStr) {
        return this.objToStrMap(JSON.parse(jsonStr));
    },



    logCheckResult: function(checkType, pcToUpdate) {
        var log = "##Promise## AFTER " + checkType + "Check() UPDATE PC " + pcToUpdate.lanIP + " IN DATABASE  (";
        if (!pcToUpdate['respondsTo-' + checkType]) {
            log += "NOT ";
        }
        log += "respondsTo-" + checkType + ")";

        console.log(log);
    },
    logCheckWarning: function(checkType, dbComputers, finalResult) {
        if (typeof dbComputers === 'undefined') {
            console.log("WARNING! [" + checkType + "] gun.js dbComputers required !");
        }
        if (typeof finalResult.idPC === 'undefined') {
            console.log("WARNING! [" + checkType + "] finalResult.idPC required !");
        }
    }

};