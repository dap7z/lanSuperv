let F = require('./functions.js'); //FONCTIONS
let G = null; //GLOBALS

//LIBRARIES:
const Ping = require('ping-bluebird');  //ping with better promise
const LanDiscovery = require('lan-discovery');
const Net = require('net');
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
                    console.log(`--> event pcDetected received for idPC: ${idPC}, launching onePcScan`);
                    let pcObject = G.VISIBLE_COMPUTERS.get(idPC);
                    if (!pcObject) {
                        console.log(`[SCAN] WARNING! pcObject not found in VISIBLE_COMPUTERS for idPC: ${idPC}`);
                        return;
                    }
                    if (pcObject.QuickScanExecutedAt && G.QUICKSCAN_EXECUTED_AT && pcObject.QuickScanExecutedAt === G.QUICKSCAN_EXECUTED_AT) {
                        console.log(`[SCAN] Skipping onePcScan for ${idPC} (Already executed, just before, in last QuickScan)`);
                    } else {
                        this.onePcScan(pcObject, idPC);
                    }
                });
                
                this.processScanResult(params, remotePlugins);
            })
            // EVENT_DEVICES_INFOS : we got IP+MAC of all devices
            .on(LanDiscovery.EVENT_DEVICES_INFOS, (data) => {

                console.log(`[SCAN] EVENT_DEVICES_INFOS received with ${data ? data.length : 0} devices`);

                // Clear broadcast scan timeout if it exists
                if (G.SCAN_TIMEOUT) {
                    clearTimeout(G.SCAN_TIMEOUT);
                    G.SCAN_TIMEOUT = null;
                }

                // Inutile de lancer un QuickScan ici, on a deja demandé un onePcScan asyunchrone à chaque PC dectecé (EVENT_DEVICE_INFOS)
                // Donc on affiche simplement un log de fin du broadcast scan et on retire le lock SCAN_IN_PROGRESS ...même si il reste des onePcScan en cours :
                console.log('--> event '+ LanDiscovery.EVENT_DEVICES_INFOS + 'received, ALL ' + data.length + ' DEVICES FOUND :', data.map(device => device.name).join(', '));

                //[launchLanScan] FREE LOCK AND PROGRAM NEXT CALL
                G.SCAN_IN_PROGRESS = false;

                // Sauvegarder l'état des ordinateurs visibles après le scan
                if (G.database) {
                    G.database.dbVisibleComputersSave();
                }

                // Si INTERVAL_SCAN est défini dans le config.js, on programme le prochain broadcast scan :
                // Sinon il interviendra lors du prochain chargement de la page web
                let intervalMinutes = G.CONFIG.val('INTERVAL_SCAN');
                if (intervalMinutes > 0) {
                    let nbSecsBeforeNextScan = intervalMinutes * 60;
                    console.log(`[SCAN] Next scan scheduled in ${intervalMinutes} minutes`);
                    setTimeout(() => {
                        this.startBroadcastScan();
                    }, 1000 * nbSecsBeforeNextScan);
                } else {
                    console.log(`[SCAN] Periodic scan is disabled`);
                }
            })
            // EVENT_SCAN_COMPLETE : scan statistics
            .on(LanDiscovery.EVENT_SCAN_COMPLETE, (data) => {
                //console.log('--> event '+ LanDiscovery.EVENT_SCAN_COMPLETE +' :\n', data);
                console.log('OK! network scan completed in ' + data.scanTimeMS / 1000 + ' sec');
                
                // Clear broadcast scan timeout if it exists
                if (G.SCAN_TIMEOUT) {
                    clearTimeout(G.SCAN_TIMEOUT);
                    G.SCAN_TIMEOUT = null;
                }
                
                // Free lock
                G.SCAN_IN_PROGRESS = false;
            });
    }

    //QuickScan: only previously visibles computers
    //LanScan: using Bonjour/mDNS discovery (ping removed)

    //utility function to ensure that essential properties are initialized in the result
    _generateCheckResponse(checkResult, pc) {
        if (checkResult["respondsTo-ping"] || checkResult["respondsTo-http"] || checkResult["respondsTo-socket"]) {
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


    async socketCheck(pc, idPC, bypassDecentralizedDb = false) {

        if (bypassDecentralizedDb) {
            G.QUICKSCAN_CHECK_QUEUE.add(idPC);
        }

        let checkResult = { 'respondsTo-socket': false };


        try {
            // LIGHT CHECK VIA TCP CONNECT (No Gun.js write)
            await new Promise((resolve, reject) => {
                let socket = new Net.Socket();
                let port = G.CONFIG.val('SERVER_PORT');
                let host = pc.lanIP;

                socket.setTimeout(2000); // 2 sec timeout

                socket.on('connect', () => {
                    // Connection successful -> Socket is listening
                    checkResult['respondsTo-socket'] = true;
                    socket.destroy();
                    resolve();
                });

                socket.on('timeout', () => {
                    // Timeout -> Socket likely not listening or firewall
                    socket.destroy();
                    resolve(); // We resolve to continue, checkResult stays false
                });

                socket.on('error', (err) => {
                    // Error -> Socket unreachable
                    socket.destroy();
                    resolve(); // We resolve to continue
                });

                socket.connect(port, host);
            });
        } catch (e) {
            // Should not happen as we catch errors in promise
        }

        if (bypassDecentralizedDb) {
            G.QUICKSCAN_CHECK_QUEUE.delete(idPC);
        }


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

        checkResult.idPC = idPC;
        checkResult.lanIP = pc.lanIP;
        return this._generateCheckResponse(checkResult, pc);
    }


    // onePcScan: checks ping/http/socket sur UN SEUL PC
    // Retourne une promesse qui se résout quand tous les checks sont terminés
    onePcScan(pcObject, idPC) {
        // RESET seulement les propriétés respondsTo-* en les mettant à false
        G.database.dbComputersSaveData(idPC, {
            'respondsTo-ping': false,
            'respondsTo-http': false,
            'respondsTo-socket': false
        });

        // Lancer les 3 checks en parallèle
        const pingPromise = this.pingCheck(pcObject, idPC).catch((reason) => {
            console.log("##ERROR## [pingCheck] Error:", reason);
            return { 'respondsTo-ping': false, idPC: idPC, lanIP: pcObject.lanIP };
        });

        const httpPromise = this.httpCheck(pcObject, idPC).catch((reason) => {
            console.log("##ERROR## [httpCheck] Error:", reason);
            return { 'respondsTo-http': false, idPC: idPC, lanIP: pcObject.lanIP };
        });

        const socketPromise = this.socketCheck(pcObject, idPC, true).catch((reason) => {
            console.log("##ERROR## [socketCheck] Error:", reason);
            return { 'respondsTo-socket': false, idPC: idPC, lanIP: pcObject.lanIP };
        });

        // Retourner une promesse qui attend tous les checks relatifs à un PC pour faire une seule mise à jour
        return Promise.all([pingPromise, httpPromise, socketPromise]).then(([pingResult, httpResult, socketResult]) => {
            // Fusionner tous les résultats en un seul objet
            const mergedResult = {
                ...pingResult,
                ...httpResult,
                ...socketResult
            };

            // Logs de warning si nécessaire
            F.logCheckWarning("ping", pingResult);
            F.logCheckWarning("http", httpResult);
            F.logCheckWarning("socket", socketResult);

            // Une seule mise à jour à Gun.js avec tous les résultats fusionnés
            G.database.dbComputersSaveData(idPC, mergedResult, "quickScan", false);
        });
    }

    async startQuickScan() {
        G.QUICKSCAN_EXECUTED_AT = new Date().toISOString();
        //use global variable G.VISIBLE_COMPUTERS
        const promises = [];

        let delay = 0;
        const DELAY_BETWEEN_ONE_PC_SCAN = 200; // Délai de 200ms entre chaque scan de PC

        for (let [idPC, pcObject] of G.VISIBLE_COMPUTERS) {
            pcObject.QuickScanExecutedAt = G.QUICKSCAN_EXECUTED_AT;
            
            // Créer une promesse qui attend le délai puis lance le scan
            const pcPromise = new Promise((resolve) => {
                setTimeout(async () => {
                    // onePcScan retourne maintenant une seule promesse qui attend tous les checks
                    try {
                        await this.onePcScan(pcObject, idPC);
                        resolve();
                    } catch (error) {
                        console.error(`[QUICKSCAN] Error scanning PC ${idPC}:`, error);
                        resolve(); // Résoudre quand même pour ne pas bloquer les autres scans
                    }
                }, delay);
            });
            
            promises.push(pcPromise);
            delay += DELAY_BETWEEN_ONE_PC_SCAN; // Incrémenter le délai pour le prochain PC
        }

        console.log(`OK! QuickScan launched (work in async, not finished yet) - ${G.VISIBLE_COMPUTERS.size} PC(s) will be scanned with ${DELAY_BETWEEN_ONE_PC_SCAN}ms delay between each`);
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


    // fonction processBonjourDiscovery à simplifier
    /**
     * Traite une découverte de PC via Bonjour/mDNS
     */
    processBonjourDiscovery(pcInfo) {
        console.log(`[SCAN] processBonjourDiscovery for ${pcInfo.hostname} (${pcInfo.lanIP}, idPC: ${pcInfo.idPC})`);
        let remotePlugins = F.simplePluginsList('remote', G.PLUGINS_INFOS);
        
        // Si on n'a pas la MAC, essayer de la récupérer depuis VISIBLE_COMPUTERS si le PC était déjà connu
        let lanMAC = pcInfo.lanMAC;
        if (!lanMAC && pcInfo.idPC) {
            const existingPC = G.VISIBLE_COMPUTERS.get(pcInfo.idPC);
            if (existingPC && existingPC.lanMAC) {
                lanMAC = existingPC.lanMAC;
            }
        }
        
        // Si on n'a toujours pas la MAC, essayer de la récupérer via ARP si possible
        // (dans Docker, cela peut ne pas fonctionner, mais on essaie quand même)
        if (!lanMAC && pcInfo.lanIP && G.LAN_DISCOVERY) {
            // Essayer de récupérer la MAC via lan-discovery si disponible
            // Note: dans Docker, cela peut ne pas fonctionner
            try {
                // On laisse la MAC vide pour l'instant, elle sera peut-être récupérée lors du onePcScan
                console.log(`[SCAN] MAC address not available for ${pcInfo.lanIP}, will try to retrieve during onePcScan`);
            } catch (error) {
                console.log(`[SCAN] Could not retrieve MAC for ${pcInfo.lanIP}:`, error.message);
            }
        }
        
        let params = {
            lastCheck: new Date().toISOString(),
            hostname: pcInfo.hostname || '',
            lanIP: pcInfo.lanIP,
            lanMAC: lanMAC || ''
        };
        
        // Calculer idPC - utiliser celui fourni par Bonjour si disponible, sinon calculer
        let idPC = pcInfo.idPC;
        if (!idPC) {
            if (params.lanMAC) {
                idPC = F.getPcIdentifier({ lanMAC: params.lanMAC, lanIP: params.lanIP });
            } else {
                // Si on n'a pas de MAC, utiliser l'IP pour générer un idPC temporaire
                // Note: l'idPC basé uniquement sur l'IP peut changer si l'IP change
                idPC = F.getPcIdentifier({ lanIP: params.lanIP });
                console.log(`[SCAN] Generated temporary idPC from IP for ${params.lanIP}: ${idPC}`);
            }
        }
        
        // Écouter l'événement de détection complète pour ce PC et déclencher onePcScan
        // Utiliser 'on' au lieu de 'once' pour permettre de déclencher un scan à chaque nouvelle détection
        this.on(`pcDetected:${idPC}`, () => {
            console.log(`[SCAN] PC detected via Bonjour - idPC: ${idPC}, launching onePcScan`);
            let pcObject = G.VISIBLE_COMPUTERS.get(idPC);
            if (!pcObject) {
                console.log(`[SCAN] WARNING! pcObject not found in VISIBLE_COMPUTERS for idPC: ${idPC}`);
                return;
            }
            // Toujours déclencher onePcScan pour une nouvelle détection Bonjour
            // (même si un QuickScan a été exécuté, car Bonjour peut détecter de nouveaux PC)
            console.log(`[SCAN] Triggering onePcScan for Bonjour-discovered PC: ${idPC}`);
            this.onePcScan(pcObject, idPC);
        });
        
        this.processScanResult(params, remotePlugins);
    }

    startBroadcastScan() {
        if (G.SCAN_IN_PROGRESS) {
            console.log("FIXED! launchLanScan canceled (G.SCAN_IN_PROGRESS)");
            return false;
        }

        let remotePlugins = F.simplePluginsList('remote', G.PLUGINS_INFOS);
        
        // Initialiser SCANNED_COMPUTERS s'il n'existe pas
        if (!G.SCANNED_COMPUTERS) {
            G.SCANNED_COMPUTERS = new Map();
        }

        if (G.CONFIG.val('ENABLE_SCAN') === false) {
            console.log("FIXED! launchLanScan canceled (G.CONFIG.val('ENABLE_SCAN') === false)");
            //empty database from previous scan
            G.database.dbComputersClearData();
            //generate fake self scan result
            let params = {
                lastCheck: new Date().toISOString(),
                lanIP: G.THIS_PC.lanInterface.ip_address,
                lanMAC: G.THIS_PC.lanInterface.mac_address,
                hostname: G.THIS_PC.hostnameLocal || "SELF",
            };
            this.processScanResult(params, remotePlugins);
        }
        else {
            G.SCAN_IN_PROGRESS = true;
            console.log("OK! launchLanScan at", new Date().toISOString());

            let networkToScan = G.THIS_PC.lanInterface.network + '/' + G.THIS_PC.lanInterface.bitmask; //cdir notation
            let tabIP = F.cidrRange(networkToScan);
            
            // Les listeners sont déjà configurés dans setupScanListeners(), on lance juste le scan
            G.LAN_DISCOVERY.getDefaultInterface().then(() => {
                G.LAN_DISCOVERY.startScan({ ipArrayToScan: tabIP });
                
                // Set timeout for broadcast scan (60 seconds)
                G.SCAN_TIMEOUT = setTimeout(() => {
                    console.warn(`[SCAN] ERROR! Broadcast scan timeout reached`);
                    console.warn(`[SCAN] ERROR! No EVENT_DEVICES_INFOS received, scan may have hung or failed`);
                    
                    // Free lock
                    G.SCAN_IN_PROGRESS = false;
                    
                    // Clear timeout reference
                    G.SCAN_TIMEOUT = null;
                }, G.CONFIG.val('SCAN_TIMEOUT_MS'));
            }).catch((err) => {
                console.error('[SCAN] Failed to get default interface for scan:', err.message);
                console.error('[SCAN] Stack:', err.stack);
                G.SCAN_IN_PROGRESS = false;
            });
        }
    }

}


module.exports = ServerLanScanner;