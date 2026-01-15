let F = require('./functions.js'); //FONCTIONS
let G = null; //GLOBALS

//LIBRARIES:
const Ping = require('ping-bluebird');  //ping with better promise
const LanDiscovery = require('lan-discovery');

class ServerLanScanner {

    constructor(G_ref) {
        G = G_ref;
    }

    //QuickScan: only previously visibles computers
    //LanScan: map ping on whole lan primary interface


    pingCheck(pc, idPC) {
        let ip = pc.lanIP;
        let hostAddress = ip;
        if (hostAddress === G.THIS_PC.lanInterface.ip_address) {
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
                if (finalResult["respondsTo-ping"]) {
                    //add lastResponse (already in F.checkData() for httpCheck and socketCheck)
                    finalResult.lastResponse = new Date().toISOString();
                }
                resolve(finalResult);
            });
        });
    }


    httpCheck(pc, idPC) {
        let ip = pc.lanIP;
        return new Promise(function (resolve) {

            let hostAddress = ip;
            if (hostAddress === G.THIS_PC.lanInterface.ip_address) {
                hostAddress = '127.0.0.1';  //self scan specific
            }
            let url = 'http://' + hostAddress + ':' + G.CONFIG.val('SERVER_PORT') + G.CONFIG.val('PATH_HTTP_EVENTS') + '/check';

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            fetch(url, { signal: controller.signal })
                .then(response => {
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    return response.json();
                })
                .then(data => {
                    clearTimeout(timeoutId);
                    resolve({
                        ...data,
                        idPC: idPC,
                        lanIP: ip
                    });
                })
                .catch(err => {
                    clearTimeout(timeoutId);
                    resolve({
                        'respondsTo-http': false,
                        idPC: idPC,
                        lanIP: ip
                    });
                });

        });
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


    async startQuickScan() {
        //use global variable G.VISIBLE_COMPUTERS
        let arrayReturn = [];

        for (let [idPC, pcObject] of G.VISIBLE_COMPUTERS) {

            //RESET (PLUGINS AND RESPONDSTO)
            G.database.dbComputersSaveData(idPC, {});

            //PING CHECK PROMISES
            let pingPromise = this.pingCheck(pcObject, idPC).then(function (finalResult) {
                //Update pc infos :
                F.logCheckWarning("ping", finalResult);
                G.database.dbComputersSaveData(idPC, finalResult, "ping");
            }, function (reason) {
                console.log("##Promise## [pingCheck] Promise rejected "+ reason);
            });
            arrayReturn.push(pingPromise);

            //HTTP CHECK PROMISES
            let httpPromise = this.httpCheck(pcObject, idPC).then(function (finalResult) {
                //Update pc infos :
                F.logCheckWarning("http", finalResult);
                G.database.dbComputersSaveData(idPC, finalResult, "http"); //NEW
            }, function (reason) {
                console.log("##Promise## [httpCheck] Promise rejected "+ reason);
            });
            arrayReturn.push(httpPromise);

            this.socketCheckNoNeedPromise(pcObject, idPC);
        }

        console.log("OK! QuickScan launched (work in promises, not finished yet)");
        return arrayReturn;
    }


    processScanResult(params, remotePlugins){
        let pc = F.pcObject(params, G.THIS_PC, "SCAN");
        //Gun.js do not support array, pc must be an object
        //pc simple key value object for simpler gun.js database
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
        G.database.dbComputersSaveData(idPC, pc);
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
            G.LAN_DISCOVERY
                .on(LanDiscovery.EVENT_DEVICE_INFOS, (device) => {
                    //console.log('--> event '+ LanDiscovery.EVENT_DEVICE_INFOS +' :\n', device);
                    let params = {
                        lastCheck: new Date().toISOString(),
                        hostname: device.name,
                        lanIP: device.ip,
                        lanMAC: device.mac
                        //machineID: scan cant return that :(
                    };
                    this.processScanResult(params, remotePlugins);
                })
                .on(LanDiscovery.EVENT_DEVICES_INFOS, (data) => {
                    //console.log('--> event '+ LanDiscovery.EVENT_DEVICES_INFOS +' :\n', data);
                    G.database.dbVisibleComputersSave();

                    //[launchLanScan] FREE LOCK AND PROGRAM NEXT CALL
                    G.SCAN_IN_PROGRESS = false;
                    let nbSecsBeforeNextScan = 60 * 60;
                    setTimeout(() => {
                        this.startFullScan ();
                    }, 1000 * nbSecsBeforeNextScan);
                })
                .on(LanDiscovery.EVENT_SCAN_COMPLETE, (data) => {
                    //console.log('--> event '+ LanDiscovery.EVENT_SCAN_COMPLETE +' :\n', data);
                    console.log('OK! scan completed in ' + data.scanTimeMS / 1000 + ' sec');
                })
                .startScan({ ipArrayToScan: tabIP }); // last call reserved to launch it
        }
    }

}


module.exports = ServerLanScanner;