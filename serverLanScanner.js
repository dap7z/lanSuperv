let F = require(__dirname + '/functions'); //FONCTIONS
let G = null; //GLOBALS

//LIBRARIES:
const Nmap = require('node-nmap');
const Fs = require('fs');


class ServerLanScanner {

    constructor(G_ref) {
        G = G_ref;
        //----- APPLY G.CONFIGURATION -----
        Nmap.nmapLocation = G.CONFIG.val('NMAP_LOCATION');
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
                finalResult.online = finalResult["respondsTo-ping"];	//TO_REMOVE
                if (finalResult["respondsTo-ping"]) {
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

            let errorMsg = "";
            Request(url).catch(function (err) {
                errorMsg = err;
                //example: "Error: connect ECONNREFUSED 127.0.0.1:842"
            }).then(function (jsonString) {
                let finalResult = {};
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
                    finalResult['respondsTo-http'] = false;
                }
                finalResult.idPC = idPC;
                finalResult.lanIP = ip;

                resolve(finalResult);
            });

        });
    }


    /*
    function socketCheck(pc, idPC) {
        let lanMAC = pc.lanMAC;
        let machineID = pc.machineID;

        return new Promise(function (resolve) {

            if(lanMAC && machineID){

                //[...]
            }

            let finalResult = {
                idPC: idPC,
                'respondsTo-socket': false
            };
            //stay false until gun-js db update

            resolve(finalResult);
        });
    }*/


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

        console.log("[INFO] socketCheckNoNeedPromise dbMsg.set:");
        console.log(reqData);
    }


    async startQuickScan() {
        //use global variable G.VISIBLE_COMPUTERS
        let arrayReturn = [];

        for (let [idPC, pcObject] of G.VISIBLE_COMPUTERS) {


            //TO FIX
            //problem pcObject of G.VISIBLE_COMPUTERS haven't machineID !


            //RESET (PLUGINS AND RESPONDSTO)
            //G.GUN_DB_COMPUTERS.get(idPC).put(null);  //NOK :(
            G.GUN_DB_COMPUTERS.get(idPC).once(function (pcToUpdate, id) {
                for (let key in pcToUpdate) {
                    let value = pcToUpdate[key];
                    if (key.startsWith("plugin") || key.startsWith("respondsTo-")) {
                        value = null;
                    }
                    pcToUpdate[key] = value;
                }
                G.GUN_DB_COMPUTERS.get(idPC).put(pcToUpdate);
            });


            //PING CHECK PROMISES
            let pingPromise = this.pingCheck(pcObject, idPC).then(function (finalResult) {
                //Update pc infos :
                F.logCheckWarning("ping", G.GUN_DB_COMPUTERS, finalResult);
                G.GUN_DB_COMPUTERS.get(finalResult.idPC).once(function (pcToUpdate, id) {
                    for (let key in finalResult) {
                        pcToUpdate[key] = finalResult[key];
                    }
                    G.GUN_DB_COMPUTERS.get(finalResult.idPC).put(pcToUpdate);
                    F.logCheckResult("ping", pcToUpdate);
                });

            }, function (reason) {
                console.log("##Promise## [pingCheck] Promise rejected");
            });
            arrayReturn.push(pingPromise);

            //HTTP CHECK PROMISES
            let httpPromise = this.httpCheck(pcObject, idPC).then(function (finalResult) {
                //Update pc infos :
                F.logCheckWarning("http", G.GUN_DB_COMPUTERS, finalResult);
                G.GUN_DB_COMPUTERS.get(finalResult.idPC).once(function (pcToUpdate, id) {
                    for (let key in finalResult) {
                        pcToUpdate[key] = finalResult[key];
                    }
                    G.GUN_DB_COMPUTERS.get(finalResult.idPC).put(pcToUpdate);
                    F.logCheckResult("http", pcToUpdate);
                });
            }, function (reason) {
                console.log("##Promise## [httpCheck] Promise rejected");
            });
            arrayReturn.push(httpPromise);

            /*
            //SOCKET (GUN.JS) PROMISES
            let socketPromise = socketCheck(pcObject, idPC).then(function (finalResult) {
                F.logCheckWarning("socket", G.GUN_DB_COMPUTERS, finalResult);
            }, function (reason) {
                console.log("##Promise## [socketCheck] Promise rejected");
            });
            arrayReturn.push(socketPromise);
            */
            this.socketCheckNoNeedPromise(pcObject, idPC);


        }

        console.log("OK! QuickScan launched (work in promises, not finished yet)");
        return arrayReturn;
    }


    startFullScan() {
        if (G.NMAP_IS_WORKING) {
            console.log('FIXED! launchLanScan canceled (G.NMAP_IS_WORKING)');
        }
        else {
            G.NMAP_IS_WORKING = true;

            let scan = new Nmap.NmapScan(G.SCAN_NETWORK, '-sP -T4');
            scan.on('error', (error) => {
                console.log(error);
            });
            scan.on('complete', (data) => {
                console.log('OK! nmap scan completed in ' + scan.scanTime / 1000 + ' sec');
                //console.log(data);
                G.SCANNED_COMPUTERS = new Map();
                let scanTimeStamp = new Date().toISOString();
                let remotePlugins = F.simplePluginsList('remote', G.PLUGINS_INFOS);
                for (let i = 0; i < data.length; i++) {
                    let d = data[i];
                    let params = {
                        lastCheck: scanTimeStamp,
                        hostname: d.hostname,
                        lanIP: d.ip,
                        lanMAC: d.mac
                        //machineID: nmap scan cant return that :(
                    };


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
                    G.SCANNED_COMPUTERS.set(idPC, scanTimeStamp);
                    //each plugins as a key of pc object:
                    for (let key in plugins) {
                        pc[key] = plugins[key];
                    }
                    G.GUN_DB_COMPUTERS.get(idPC).put(pc);
                }


                console.log("[INFO] Save G.VISIBLE_COMPUTERS: " + G.VISIBLE_COMPUTERS_FILE);
                //console.log(G.VISIBLE_COMPUTERS);

                //save G.VISIBLE_COMPUTERS map in json file for reloading after restart
                Fs.writeFile(G.VISIBLE_COMPUTERS_FILE, F.strMapToJson(G.VISIBLE_COMPUTERS), 'binary', function (err) {
                    if (err) console.log(err);
                });


                G.VISIBLE_COMPUTERS.forEach(function (value, key) {
                    let idPC = key;
                    if (G.SCANNED_COMPUTERS.has(idPC) === false) {
                        console.log('idPC:' + idPC + ' => online false');
                        G.GUN_DB_COMPUTERS.get(idPC).get('online').put(false);
                        G.GUN_DB_COMPUTERS.get(idPC).get('respondsTo-ping').put(false);
                    }
                });


                //[launchLanScan] FREE LOCK AND PROGRAM NEXT CALL
                G.NMAP_IS_WORKING = false;
                let nbSecsBeforeNextScan = 60 * 60;
                setTimeout(() => {
                    this.startFullScan ();
                }, 1000 * nbSecsBeforeNextScan);

            });
        }
    }


};


module.exports = ServerLanScanner;