//=================================//
// LANSUPERV FUNCTIONS COLLECTIONS //
//=================================//

//used libraries
const Fs = require('fs');
const Path = require('path');
const {fork} = require('child_process');


class F {


    constructor() {
        console.log("class F constructor just called :)");
    }


    static getDirectories(p){
        let dirs =  Fs.readdirSync(p).filter(function (file) {
            return Fs.statSync(p+'/'+file).isDirectory();
        });
        let dirsPaths = [];
        dirs.map(function (dir) {
            dirsPaths.push(Path.join(p, dir));
        });
        return dirsPaths;
    }


    static getPlugins(type='all',result='dirPath', format='object'){
        let results;
        let pluginsDirPath;
        let pluginsDirName;
        switch(type){
            case 'all':
                let remoteRequestsPlugins = this.getDirectories(__dirname+'/plugins/remote-requests/');
                let localResponsesPlugins = this.getDirectories(__dirname+'/plugins/local-responses/');
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
            let obj = {};
            let pluginsId = 0;
            results.forEach(function(key) {
                pluginsId += 1;
                obj['plugin'+pluginsId] = key;
            });
            results = obj;
        }
        return results;
    }


    static pcObject(params, THIS_PC, diagCallFrom=''){
        let lanInterface = THIS_PC.lanInterface;
        let wanInterface = THIS_PC.wanInterface;
        let expectedParams = ['hostname', 'lastCheck', 'lanIP', 'lanMAC'];
        let missingSomeParams = false;
        expectedParams.forEach(function(paramKey) {
            if(!params[paramKey]){
                params[paramKey]='';
                console.log('WARNING! pcObject() missing parameter: '+ paramKey);
                missingSomeParams = true;
            }
        });
        let pc = params;
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
    }


    static checkData(THIS_PC, respondTo){
        let params = {
            hostname: THIS_PC.hostnameLocal,
            lastCheck: new Date().toISOString(),
            lanIP: THIS_PC.lanInterface.ip_address,
            lanMAC: THIS_PC.lanInterface.mac_address,
            machineID: THIS_PC.machineID
        };
        let pc = this.pcObject(params, THIS_PC);
        //each plugins as a key of pc object:
        let plugins = this.getPlugins('all','dirName');
        for (let key in plugins) {
            pc[key] = plugins[key];
        }
        //respondsTo information:
        if(respondTo){
            pc['respondsTo-'+respondTo] = true;
            pc['lastResponse'] = new Date().toISOString();
            pc['online'] = true;
        }
        return pc;
    }


    static getPcIdentifier(pc){
        let idPC = pc.lanMAC;   //computer identifier (simplified MAC adress)
        //used as unique identifier (it's supposed to be and we cant machine-id if app is not installed)
        if(idPC){
            idPC = idPC.replace(new RegExp(':', 'g'), '');
        }
        return idPC;
    }


    static eventTargetIsThisPC(eventData, THIS_PC){
        let pcTargetLanMAC = null;
        let pcTargetMachineID = null;

        if (typeof eventData.pcTarget === 'undefined') {
            if(typeof eventData.pcTargetLanMAC === 'undefined' && typeof eventData.pcTargetMachineID === 'undefined'){
                return true;  //not specified -> self event
            }

            //gun js event :
            pcTargetLanMAC = eventData.pcTargetLanMAC;
            pcTargetMachineID = eventData.pcTargetMachineID;
        }else{

            //http event :
            pcTargetLanMAC = eventData.pcTarget.lanMAC;
            pcTargetMachineID = eventData.pcTarget.machineID;
        }

        if(pcTargetLanMAC === THIS_PC.lanInterface.mac_address) return true;
        if(pcTargetMachineID === THIS_PC.machineID) return true;

        return false;
    }


    static eventRedirection(eventData, dbComputers, method='http'){
        let pcTarget = eventData.pcTarget;
        let eventName = eventData.eventName;

        console.log('[PLUGIN '+ eventName +']: local execution only => resend event through socket');
        //console.log('pcTarget');
        //console.log(pcTarget);



        //Search computer that have the same machineID in (gun.js bdd|local array!) and get his actual IP:
        //console.log('Search for machineID:'+ pcTarget.machineID);
        //TODO


        //Retrieve pc info from database :
        let idTargetPC = this.getPcIdentifier(pcTarget);
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
                let Request = require('request');
                // Set the headers
                let headers = {
                    'User-Agent':       'LanSuperv Agent/1.0.0',
                    'Content-Type':     'application/x-www-form-urlencoded'
                };

                let jsonString = JSON.stringify({
                    'eventName': eventName,
                    'pcTarget': pcTarget,
                    'password' : '*not*Implemented*',
                });

                let reqUrl = 'http://'+ pcTarget.lanIP +':'+ Config.val('SERVER_PORT') + Config.val('PATH_HTTP_EVENTS') +'/'+ eventName;
                console.log('[eventRedirection with http] reqUrl: '+reqUrl);

                // Configure the request
                let options = {
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

    }


    static async eventExecution(eventParams){
        return new Promise(function (resolve) {
            let eventName = eventParams.eventName;
            let execPath = eventParams.execPath;

            let lastObjectMsg = {};
            let compute = fork(execPath);
            compute.send(eventParams);
            compute.on('message', (msg) => {
                let text = '[PLUGIN ' + eventName + '] message: ';
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
    }


    //http://2ality.com/2015/08/es6-map-json.html
    static strMapToObj(strMap) {
        let obj = Object.create(null);
        for (let [k,v] of strMap) {
            // We don’t escape the key '__proto__'
            // which can cause problems on older engines
            obj[k] = v;
        }
        return obj;
    }
    static objToStrMap(obj) {
        let strMap = new Map();
        for (let k of Object.keys(obj)) {
            strMap.set(k, obj[k]);
        }
        return strMap;
    }
    static strMapToJson(strMap) {
        return JSON.stringify(this.strMapToObj(strMap));
    }
    static jsonToStrMap(jsonStr) {
        return this.objToStrMap(JSON.parse(jsonStr));
    }


    static logCheckResult(checkType, pcToUpdate) {
        let log = "##Promise## AFTER " + checkType + "Check() UPDATE PC " + pcToUpdate.lanIP + " IN DATABASE  (";
        if (!pcToUpdate['respondsTo-' + checkType]) {
            log += "NOT ";
        }
        log += "respondsTo-" + checkType + ")";

        console.log(log);
    }
    static logCheckWarning(checkType, dbComputers, finalResult) {
        if (typeof dbComputers === 'undefined') {
            console.log("WARNING! [" + checkType + "] gun.js dbComputers required !");
        }
        if (typeof finalResult.idPC === 'undefined') {
            console.log("WARNING! [" + checkType + "] finalResult.idPC required !");
        }
    }

};


module.exports = F;