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


    static checkData(THIS_PC, respondTo, PLUGINS_INFOS){
        let params = {
            hostname: THIS_PC.hostnameLocal,
            lastCheck: new Date().toISOString(),
            lanIP: THIS_PC.lanInterface.ip_address,
            lanMAC: THIS_PC.lanInterface.mac_address,
            machineID: THIS_PC.machineID
        };
        let pc = this.pcObject(params, THIS_PC);
        //each plugins as a key of pc object:
        let plugins = F.simplePluginsList('all', PLUGINS_INFOS);
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


    /**
     * Detects if the application is running in compiled executable mode (SEA) or development mode
     * @returns {boolean} true if compiled executable, false if development mode
     */
    static isAppCompiled() {
        const execPath = process.execPath;
        const path = require('path');
        const execName = path.basename(execPath);
        
        // Windows: check for .exe extension (but not node.exe)
        if (execPath.endsWith('.exe') && !execPath.includes('node.exe')) {
            return true;
        }
        
        // Linux: check if executable name contains 'linux'
        if (execName.includes('linux')) {
            return true;
        }
        
        // Default: not compiled (development mode)
        return false;
    }

    /**
     * Returns the base directory according to the execution mode
     * - In executable mode: executable directory
     * - In development mode: current working directory
     * @returns {string} Base directory path
     */
    static getAppDirectory() {
        const path = require('path');
        return this.isAppCompiled() ? path.dirname(process.execPath) : process.cwd();
    }

    // CIDR range function (replaces cidr-range package to avoid vulnerable ip dependency)
    // Used in serverLanScanner.js and debug-lan-discovery.js
    static cidrRange(cidr) {
        let [network, prefixLength] = cidr.split('/');
        let prefix = parseInt(prefixLength, 10);
        
        // Convert IP to number
        let ipToNumber = (ip) => {
            return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
        };
        
        // Convert number to IP
        let numberToIp = (num) => {
            return [
                (num >>> 24) & 0xFF,
                (num >>> 16) & 0xFF,
                (num >>> 8) & 0xFF,
                num & 0xFF
            ].join('.');
        };
        
        let networkNum = ipToNumber(network);
        let mask = (0xFFFFFFFF << (32 - prefix)) >>> 0;
        let networkStart = networkNum & mask;
        let networkEnd = networkStart | (~mask >>> 0);
        
        let ips = [];
        for (let i = networkStart; i <= networkEnd; i++) {
            // Skip network and broadcast addresses
            if (i !== networkStart && i !== networkEnd) {
                ips.push(numberToIp(i));
            }
        }
    
        return ips;
    }

    // GLobal file logging function
    static writeLogToFile(message) {
        const path = require('path');
        const fs = require('fs');
        let LOG_FILE = path.join(this.getAppDirectory(), 'lanSuperv-electron-main.log');
        try {
            const timestamp = new Date().toISOString();
            fs.appendFileSync(LOG_FILE, `[${timestamp}] ${message}\n`);
        } catch (error) {
            // Last resort: try to write to current directory
            try {
                const localLog = path.join(__dirname, 'electron-main.log');
                fs.appendFileSync(localLog, `[${new Date().toISOString()}] ${message}\n`);
            } catch (e) {
                // Ignore if all fails
            }
        }
    }

    // Liste les vidéos disponibles dans le dossier videos d'un plugin
    static listAvailableVideos(pluginDirPath) {
        const path = require('path');
        const fs = require('fs');
        const videosDir = path.join(pluginDirPath, 'videos');
        const videos = [];
        
        try {
            if (fs.existsSync(videosDir) && fs.statSync(videosDir).isDirectory()) {
                const files = fs.readdirSync(videosDir);
                files.forEach(file => {
                    // Exclure les fichiers .txt et autres fichiers non-vidéo
                    if (!file.endsWith('.txt') && !file.startsWith('.')) {
                        const filePath = path.join(videosDir, file);
                        const stat = fs.statSync(filePath);
                        if (stat.isFile()) {
                            // Extraire le nom de la vidéo sans extension
                            const videoName = path.parse(file).name;
                            // Créer l'option au format "video-xxx"
                            const option = 'video-' + videoName;
                            videos.push({
                                option: option,
                                filename: file,
                                path: filePath
                            });
                        }
                    }
                });
            }
        } catch (error) {
            console.warn('[listAvailableVideos] Erreur lors de la lecture du dossier videos:', error);
        }
        
        return videos;
    }

}

module.exports = F;
