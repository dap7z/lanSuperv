//=================================//
// LANSUPERV FUNCTIONS COLLECTIONS //
//=================================//

//used libraries
const {fork} = require('child_process');


class F {


    static simplePluginsList(type='all', PLUGINS_INFOS){
        //return names of enabled plugins in a simple object for gun.js compatibility
        let pluginsList = {};
        let counter = 1;
        if(typeof PLUGINS_INFOS === 'undefined'){
            const ServerPluginsInfos = require('./serverPluginsInfos');
            PLUGINS_INFOS = ServerPluginsInfos.build();
        }
        for (const [ eventName, pluginObjet ] of Object.entries(PLUGINS_INFOS)) {
            if(pluginObjet.isEnabled){
                if((type==='all') || (type==='remote' && pluginObjet.isRemote)){
                    pluginsList['plugin'+counter] = eventName;
                    counter ++;
                }
            }
        }
        return pluginsList;
    }


    //=========== USED IN serverEventHandler AND plgins/local-reponses/check/execute.js ==========
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
        let plugins = F.simplePluginsList('all');
        for (let key in plugins) {
            pc[key] = plugins[key];
        }
        //respondsTo information:
        if(respondTo){
            pc['respondsTo-'+respondTo] = true;
            pc['lastResponse'] = new Date().toISOString();
        }
        return pc;
    }
    //=====================


    static getPcIdentifier(pc){
        let idPC = pc.lanMAC;   //computer identifier (simplified MAC adress)
        //used as unique identifier (it's supposed to be and we cant machine-id if app is not installed)
        if(idPC){
            idPC = idPC.replace(new RegExp(':', 'g'), '');
        }
        return idPC;
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


    static logCheckWarning(checkType, finalResult) {
        if (typeof finalResult.idPC === 'undefined') {
            console.log("WARNING! [" + checkType + "] finalResult.idPC required !");
        }
    }

}

module.exports = F;
