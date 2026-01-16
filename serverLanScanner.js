let F = require('./functions.js'); //FONCTIONS
let G = null; //GLOBALS

//LIBRARIES:
const Ping = require('ping-bluebird');  //ping with better promise
const LanDiscovery = require('lan-discovery');
const EventEmitter = require('events');

class ServerLanScanner extends EventEmitter {

    constructor(G_ref) {
        super();
        G = G_ref;
    }

    setupScanListeners() {
        if (!G.LAN_DISCOVERY) {
            console.log("ERROR! setupScanListeners() called but G.LAN_DISCOVERY is not initialized yet");
            return;
        }
        
        // Use arrow function to preserve 'this' context
        G.LAN_DISCOVERY
            // EVENT_DEVICE_INFOS : new info(s) si available for one device
            .on(LanDiscovery.EVENT_DEVICE_INFOS, (device) => {
                //console.log('--> event '+ LanDiscovery.EVENT_DEVICE_INFOS +' :\n', device);
                let remotePlugins = F.simplePluginsList('remote', G.PLUGINS_INFOS);
                let params = {
                    lastCheck: new Date().toISOString(),
                    hostname: device.name || '',  // Utiliser device.name si disponible
                    lanIP: device.ip,
                    lanMAC: device.mac
                    //machineID: scan cant return that :(
                };
                
                // Calculer idPC avant processScanResult pour pouvoir écouter l'événement
                let idPC = F.getPcIdentifier({ lanMAC: params.lanMAC, lanIP: params.lanIP });
                
                // Listen for the detection completed event for this PC
                this.once(`pcDetected:${idPC}`, () => {
                    console.log(`[SCAN] pcDetected event received for idPC: ${idPC}, launching onePcScan`);
                    let pcObject = G.VISIBLE_COMPUTERS.get(idPC);
                    if (pcObject) {
                        this.onePcScan(pcObject, idPC);
                    } else {
                        console.log(`[SCAN] WARNING! pcObject not found in VISIBLE_COMPUTERS for idPC: ${idPC}`);
                    }
                });
                
                this.processScanResult(params, remotePlugins);
            })
            // EVENT_DEVICES_INFOS : we got IP+MAC of all devices
            .on(LanDiscovery.EVENT_DEVICES_INFOS, (data) => {

                console.log('--> event '+ LanDiscovery.EVENT_DEVICES_INFOS + ', OK ALL ' + data.length + ' DEVICES FOUND HERE :', data.map(device => device.name).join(', '));

                G.database.dbVisibleComputersSave();

                //[launchLanScan] FREE LOCK AND PROGRAM NEXT CALL
                G.SCAN_IN_PROGRESS = false;
                let nbSecsBeforeNextScan = 60 * 60;   // FULL SCAN every hour, followed by onePcScan on every detected PC.
                setTimeout(() => {
                    this.startFullScan();
                }, 1000 * nbSecsBeforeNextScan);
            })
            // EVENT_SCAN_COMPLETE : scan statistics
            .on(LanDiscovery.EVENT_SCAN_COMPLETE, (data) => {
                //console.log('--> event '+ LanDiscovery.EVENT_SCAN_COMPLETE +' :\n', data);
                console.log('OK! scan completed in ' + data.scanTimeMS / 1000 + ' sec');
            });
    }

    //QuickScan: only previously visibles computers
    //LanScan: map ping on whole lan primary interface

    //utility function to ensure that essential properties are initialized in the result
    _generateCheckResponse(checkResult, pc) {
        if (checkResult["respondsTo-ping"]) {
            checkResult.lastResponse = new Date().toISOString();
        }
        checkResult.hostname = pc.hostname || '';
        checkResult.lanIP = pc.lanIP || checkResult.lanIP;
        checkResult.lanMAC = pc.lanMAC || '';
        return checkResult;
    }

    async pingCheck(pc, idPC) {
        let ip = pc.lanIP;
        let hostAddress = ip;
        if (hostAddress === G.THIS_PC.lanInterface.ip_address) {
            hostAddress = '127.0.0.1';   //self scan specific
            //20171018 Ping('localhost') doesnt work with the ping-bluebird nodejs package on windows10
        }
        let respondsToPing = false;
        try {
            const res = await Ping(hostAddress, {timeout: 4});
            respondsToPing = res.alive;
        } catch (res) {
            //required to resolve(finalResult) after ping fail
        }
        return this._generateCheckResponse({
            idPC: idPC,
            lanIP: ip,
            'respondsTo-ping': respondsToPing
        }, pc);
    }


    async httpCheck(pc, idPC) {
        let ip = pc.lanIP;
        let hostAddress = ip;
        if (hostAddress === G.THIS_PC.lanInterface.ip_address) {
            hostAddress = '127.0.0.1';  //self scan specific
        }
        let url = 'http://' + hostAddress + ':' + G.CONFIG.val('SERVER_PORT') + G.CONFIG.val('PATH_HTTP_EVENTS') + '/check';

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        let checkResult = {};
        try {
            const response = await fetch(url, { signal: controller.signal });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            clearTimeout(timeoutId);
            checkResult = {...data};
        } catch (err) {
            clearTimeout(timeoutId);
            checkResult = {'respondsTo-http': false};
        }
        checkResult.idPC = idPC;
        checkResult.lanIP = ip;
        return this._generateCheckResponse(checkResult, pc);

    }


    socketCheckNoNeedPromise(pc, idPC) {
        //like sendRequest function in client.js :
        let reqData = {
            eventName: 'check',
            eventResult: '',
            eventSendedAt: new Date().toISOString(),
            eventReceivedAt: null,
            pcTargetLanMAC: pc.lanMAC,
            who: "socketCheck"
        };
        if (pc.machineID) {
            reqData['pcTargetMachineID'] = pc.machineID;
        }

        //20181014: attention PC-LAN-AVEC-LANSUPERV-INSTALLE n'a pas de machineID ici...
        //(alors qu'il en renvoi bien un lors appel http://localhost:842/cmd/check)
        //console.log("exec socketCheckWithoutPromise(), lanMAC:"+pc.lanMAC);
        //console.log("machineID:"+pc.machineID);

        let dbMsg = G.GUN.get(G.CONFIG.val('TABLE_MESSAGES'));
        dbMsg.set(reqData);
        //we cant wait for a response as with http event
        //respondTo-socket update is done in gun.js database directly

        //console.log("[INFO] socketCheckNoNeedPromise dbMsg.set:");
        //console.log(reqData);
    }


    // onePcScan: checks ping/http/socket sur UN SEUL PC
    // Retourne un tableau de promises pour ping, http et socket
    onePcScan(pcObject, idPC) {
        // RESET seulement les propriétés respondsTo-* en les mettant à false
        G.database.dbComputersSaveData(idPC, {
            'respondsTo-ping': false,
            'respondsTo-http': false,
            'respondsTo-socket': false
        });

        const promises = [];

        //PING CHECK
        promises.push(
            (async () => {
                try {
                    const finalResult = await this.pingCheck(pcObject, idPC);
                    F.logCheckWarning("ping", finalResult);
                    G.database.dbComputersSaveData(idPC, finalResult, "ping", false);
                } catch (reason) {
                    console.log("##ERROR## [pingCheck] Error:", reason);
                }
            })()
        );

        //HTTP CHECK
        promises.push(
            (async () => {
                try {
                    const finalResult = await this.httpCheck(pcObject, idPC);
                    F.logCheckWarning("http", finalResult);
                    G.database.dbComputersSaveData(idPC, finalResult, "http", false);
                } catch (reason) {
                    console.log("##ERROR## [httpCheck] Error:", reason);
                }
            })()
        );

        this.socketCheckNoNeedPromise(pcObject, idPC);
        
        return promises;
    }

    async startQuickScan() {
        //use global variable G.VISIBLE_COMPUTERS
        const promises = [];

        for (let [idPC, pcObject] of G.VISIBLE_COMPUTERS) {
            const pcPromises = this.onePcScan(pcObject, idPC);
            promises.push(...pcPromises);
        }

        console.log("OK! QuickScan launched (work in async, not finished yet)");
        return promises;
    }


    processScanResult(params, remotePlugins){
        let pc = F.pcObject(params, G.THIS_PC, "SCAN");
        let plugins = remotePlugins;

        if (pc.lanIP === G.THIS_PC.lanInterface.ip_address) {
            //self scan specific
            let wasEmpty = pc.lanMAC;
            pc.lanMAC = G.THIS_PC.lanInterface.mac_address;
            console.log("FIXED! correct lanMAC field for server (was: '" + wasEmpty + "')");
            pc.machineID = G.THIS_PC.machineID;
            console.log("FIXED! add machineID field for server");
            plugins = F.simplePluginsList('all', G.PLUGINS_INFOS);
            console.log("FIXED! add local-responses plugins for server");
        }

        let idPC = F.getPcIdentifier(pc);
        //for compare that scan to the others:
        G.VISIBLE_COMPUTERS.set(idPC, pc);
        G.SCANNED_COMPUTERS.set(idPC, pc.lastCheck);
        //each plugins as a key of pc object:
        for (let key in plugins) {
            pc[key] = plugins[key];
        }
        
        
        console.log(`[SCAN] Saving PC - idPC: ${idPC}, hostname: ${pc.hostname || 'N/A'}, lanIP: ${pc.lanIP || 'N/A'}, lanMAC: ${pc.lanMAC || 'N/A'}`);
        G.database.dbComputersSaveData(idPC, pc);
        
        // Émettre l'événement de pcDetected
        // On utilise setImmediate pour s'assurer que la sauvegarde Gun.js est bien terminée
        setImmediate(() => {
            this.emit(`pcDetected:${idPC}`);
        });
    }


    startFullScan() {
        if (G.SCAN_IN_PROGRESS) {
            console.log("FIXED! launchLanScan canceled (G.SCAN_IN_PROGRESS)");
            return false;
        }

        let remotePlugins = F.simplePluginsList('remote', G.PLUGINS_INFOS);
        G.SCANNED_COMPUTERS = new Map();

        if (G.CONFIG.val('ENABLE_SCAN') === false) {
            console.log("FIXED! launchLanScan canceled (G.CONFIG.val('ENABLE_SCAN') === false)");
            //empty database from previous scan
            G.database.dbComputersClearData();
            //generate fake self scan result
            let params = {
                lastCheck: new Date().toISOString(),
                lanIP: G.THIS_PC.lanInterface.ip_address,
                lanMAC: G.THIS_PC.lanInterface.mac_address,
                hostname: "SELF (ENABLE_SCAN=false)", //(quickly override by computer name)
            };
            this.processScanResult(params, remotePlugins);
        }
        else {
            G.SCAN_IN_PROGRESS = true;
            console.log("OK! launchLanScan at", new Date().toISOString());

            let networkToScan = G.THIS_PC.lanInterface.network + '/' + G.THIS_PC.lanInterface.bitmask; //cdir notation
            let tabIP = F.cidrRange(networkToScan);
            
            // Les listeners sont déjà configurés dans setupScanListeners(), on lance juste le scan
            G.LAN_DISCOVERY.startScan({ ipArrayToScan: tabIP });
        }
    }

}


module.exports = ServerLanScanner;