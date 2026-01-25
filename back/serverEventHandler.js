let F = require('./functions.js'); //FONCTIONS
let G = null; //GLOBALS

//LIBRARIES:
const {fork} = require('child_process');

class ServerEventHandler {

    constructor(G_ref) {
        G = G_ref;
        // Set pour tracker les événements en cours de traitement (évite les doubles traitements)
        this.processingEvents = new Set();
    }

    // Fonction pour obtenir l'idPC de la cible à partir de eventData
    targetIdPC(eventData){
        return F.getPcIdentifier({lanMAC: eventData.pcTargetLanMAC});
    }

    eventTargetIsThisPC(eventData){
        // Si aucune cible spécifiée (undefined pour pcTargetLanMAC), alors evenement broadcasté vers tous les PC y compris celui-ci.
        if (!eventData.pcTargetLanMAC) {
            return true;
        }
        // Vérifier si l'idPC de la cible correspond à ce PC
        let pcTargetIdPC = this.targetIdPC(eventData);
        let myIdPC = G.THIS_PC.idPC;
        return pcTargetIdPC === myIdPC;
    }


    eventRedirection(eventData, method='http'){
        let eventName = eventData.eventName;

        console.log('[PLUGIN '+ eventName +']: local execution only => resend event through http');

        //Retrieve pc info from database :
        let idTargetPC = this.targetIdPC(eventData);
        
        // Récupérer les informations du PC depuis WebRTC
        if (!G.webrtcManager) {
            console.log('[eventRedirection] ERROR! G.webrtcManager is not defined');
            return;
        }
        
        const allComputers = G.webrtcManager.getAllData('computers');
        const pcTarget = allComputers.get(idTargetPC);
        
        if (!pcTarget) {
            console.log(`[eventRedirection] ERROR! PC target not found in database - idTargetPC: ${idTargetPC}`);
            return;
        }

        if(method==='socket')
        {
            //====[SOCKET]====
            console.log("[ERROR] WebRTC sockets events NO NEED REDIRECTION !");
        }
        else if(method==='http')
        {
            //HALF WORKING (form post data is not sended => selfTarget => OK FOR ONE REDIRECTION, NOT MORE)
            //TODO: TESTS AND DEV

            //====[HTTP]====
            let jsonString = JSON.stringify({
                'eventName': eventName,
                'pcTargetLanMAC': eventData.pcTargetLanMAC,
                'pcTargetMachineID': eventData.pcTargetMachineID,
                'password' : '*not*Implemented*',
            });

            let reqUrl = 'http://'+ pcTarget.lanIP +':'+ G.CONFIG.val('SERVER_PORT') + G.CONFIG.val('PATH_HTTP_EVENTS') +'/'+ eventName;
            console.log('[eventRedirection with http] reqUrl: '+reqUrl);

            const params = new URLSearchParams({ jsonString });
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            fetch(reqUrl, {
                method: 'POST',
                headers: {
                    'User-Agent': 'LanSuperv Agent/1.0.0',
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: params.toString(),
                signal: controller.signal
            })
            .then(response => {
                clearTimeout(timeoutId);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return response.json();
            })
            .then(data => {
                console.log("JSON response:", data);
            })
            .catch(err => {
                clearTimeout(timeoutId);
                const errorMsg = err.name === 'AbortError' ? 'timeout' : (err.code || err.message);
                console.log(`Error: ${errorMsg} ${reqUrl}`);
            });

            //===============
        }
        else
        {
            console.log('[error] function eventRedirection: unknow method parameter');
        }

    }


    async eventExecution(eventParams){
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

    /**
     * Router before event processing
     * used globals: G.PLUGINS_INFOS G.THIS_PC.lanInterface
     * @param {*} p : eventParameters object
     * @param {*} f : eventFrom (socket or http)
     * @returns 
     */
    async eventDispatcher(p, f) {
        let eventResult = null;
        console.log("LOG! eventDispatcher receive " + p.eventName + " event from " + f 
            + ", for pcTargetLanMAC : " + (p.pcTargetLanMAC || 'N/A') 
            + " and pcTargetMachineID : " + (p.pcTargetMachineID || 'N/A') 
        );

        //add some event parameters :
        p.lanInterface = G.THIS_PC.lanInterface;
        p.eventFrom = f;
        p.dirPath = "";
        p.execPath = "";
        if (G.PLUGINS_INFOS[p.eventName]) {
            p.dirPath = G.PLUGINS_INFOS[p.eventName].dirPath;
            p.execPath = G.PLUGINS_INFOS[p.eventName].execPath;
        }

        let processEvent = true;
        let pcTargetIsThisPC = this.eventTargetIsThisPC(p);
        
        if (p.dirPath.indexOf('local-responses') >= 0) //if local-response
        {
            if (pcTargetIsThisPC) {
                // Événement destiné à ce PC, on le traite
                p.thisPC = G.THIS_PC;
            }
            else {
                // Événement destiné à un autre PC, on le redirige
                if (f !== 'socket') {
                    this.eventRedirection(p);
                }
                //event transmited, nothing more to do.
                //(and not even need eventRedirection if it comes from WebRTC)
                processEvent = false;
            }
        }
        if (processEvent) {
            if (pcTargetIsThisPC) {
                p.thisPC = G.THIS_PC;
                //(required for self check event)
            }
            //exec plugin in child process
            eventResult = await this.eventExecution(p);
            //console.log(eventResult);  //OK
        }

        return eventResult;  //stay null in case of event redirection
    }


    setupHttpEventsLiteners() {
        //++++++++++ HTTP EVENT ++++++++++ (support only self target)
        G.WEB_SERVER.all(G.CONFIG.val('PATH_HTTP_EVENTS') + '/:eventName', async (request, response) => {
            //all() GET, POST, PUT, DELETE, or any other HTTP request method
            //request.query comes from query parameters in the URL
            //request.body properties come from a form post where the form data
            //request.params comes from path segments of the URL that match a parameter in the route definition such a /song/:songid
            let p = {
                eventName: request.params.eventName
            };
            
            // Recuperation d'un eventuel pcTarget autre que le PC local
            if (request.body && request.body.pcTargetLanMAC) {
                p.pcTargetLanMAC = request.body.pcTargetLanMAC;
            }
            if (request.body && request.body.pcTargetMachineID) {
                p.pcTargetMachineID = request.body.pcTargetMachineID;
            }
            
            //example:
            //http://localhost:842/cmd/check
            //http://localhost:842/cmd/power-off
            let responseData = await this.eventDispatcher(p, 'http');
            response.json(responseData); //json response
        });
        console.log("[EVENT-RECEPTION] OK, http events listeners have been setup");
    }


    setupSocketEventsListeners(){
        //++++++++++ SOCKET EVENT (WebRTC) ++++++++++
        console.log("[EVENT-RECEPTION] Setting up WebRTC socket events listeners on DATABASE MESSAGES.");
        
        if (!G.webrtcManager) {
            console.error("[EVENT-RECEPTION] ERROR! G.webrtcManager is not defined");
            return;
        }
        
        // Écouter les mises à jour de messages depuis WebRTC
        G.webrtcManager.on('dataUpdate', ({ table, id, data }) => {
            if (table !== 'messages') {
                return;
            }
            
            const eventData = data;
            if (eventData && eventData.eventReceivedAt == null) {

                // log des evénements reçus pas encore traités
                if (!eventData.eventName) {
                    console.log("[EVENT-RECEPTION] Received data without eventName, ignoring it. Might be a chat message :", eventData);
                    return; // don't process this undefined eventName (chat, bug, hack)
                }

                //calculate idPC of target
                let pcTargetIdPC = this.targetIdPC(eventData);
                let readMessage = this.eventTargetIsThisPC(eventData);
                let isSelfShutdownEvent = readMessage && (eventData.eventName === 'power-off' || eventData.eventName === 'sleep-mode');

                
                //If eventData.type == remote-request && eventData.target in G.VISIBLE_COMPUTERS -> read and process event
                if(typeof G.PLUGINS_INFOS[eventData.eventName] === 'undefined')
                {
                    console.log("[EVENT-RECEPTION] Event '"+ eventData.eventName + "' does not correspond to a plugin name, ignoring it");
                }
                else if(G.PLUGINS_INFOS[eventData.eventName].isRemote)
                {
                    //Reminder: G.VISIBLE_COMPUTERS is empty before 1st scan and then contains only powered on pc
                    //May be not the thing to use here ... (for wol)
                    //But still acceptable since we save it in a file :)
                    if(G.VISIBLE_COMPUTERS.has(pcTargetIdPC)) {
                        readMessage = true;
                        console.log(`[EVENT-RECEPTION] Event ${eventData.eventName} is remote-request and target is in VISIBLE_COMPUTERS`);
                    }
                }

                if(!readMessage)
                {
                    // Log de débogage pour comprendre pourquoi l'événement n'est pas pris en compte pour etre traité ou transmis
                    let myIdPC = G.THIS_PC.idPC;
                    console.log(`[EVENT-RECEPTION] Event ${eventData.eventName} NOT processed - pcTargetIdPC: ${pcTargetIdPC}, THIS_PC.idPC: ${myIdPC}`);
                    // Ne pas acquitter l'événement s'il n'est pas destiné à ce PC (sauf si on le transfère à un autre PC)
                    return;
                }
                else
                {

                    // --- Traitement specifique aux événements qui arrêtent le PC (power-off/sleep-mode) :
                    //   - si l'événement date de plus de 2 minutes, on l'ignore et on l'aquitte pour éviter re-traitement au redémarrage
                    let shouldIgnoreEvent = false;
                    if (isSelfShutdownEvent)
                    {
                        let ageInMinutes = 0;
                        if(! eventData.eventSendedAt){
                            shouldIgnoreEvent = true;
                        }else{
                            // Vérifier si l'événement date de plus de 2 minutes
                            const eventDate = new Date(eventData.eventSendedAt);
                            const now = new Date();
                            ageInMinutes = (now - eventDate) / (1000 * 60);
                            if (ageInMinutes > 2) {
                                shouldIgnoreEvent = true;
                            }
                        }
                        if(shouldIgnoreEvent){
                            let message = `Event ${eventData.eventName} ignored (too old: ${ageInMinutes.toFixed(2)} minutes)`;
                            console.log('[EVENT] ' + message);
                            // Acquitter l'événement comme si on l'avait traité
                            eventData.eventResult = JSON.stringify({ msg: message });
                            eventData.eventReceivedAt = new Date().toISOString();
                            G.webrtcManager.saveData('messages', id, eventData);
                            // L'événement doit être ignoré, ne pas continuer le traitement
                            return;
                            }
                        }
                     // ---

                    // Marquer l'événement comme "en cours de traitement" immédiatement pour éviter les doubles traitements
                    let eventReceivedAt = new Date().toISOString();
                    eventData.eventReceivedAt = eventReceivedAt;
                    G.webrtcManager.saveData('messages', id, eventData);
                    console.log(`[EVENT-RECEPTION] Event ${eventData.eventName} (id: ${id}) marked as received at ${eventReceivedAt}`);
                    
                    // Maintenant traiter l'événement
                    if(eventData.eventName === 'check')
                    {
                        if(this.eventTargetIsThisPC(eventData))
                        {
                            //check events (specific, socketCheck update database directly) :
                            let finalResult = F.checkData(G.THIS_PC, 'socket');
                            finalResult['idPC'] = pcTargetIdPC;
                            G.database.dbComputersSaveData(finalResult.idPC, finalResult, "socket"); //NEW
                            
                            // Mettre à jour eventResult pour les événements check
                            eventData.eventResult = JSON.stringify({ msg: 'check completed' });
                            G.webrtcManager.saveData('messages', id, eventData);
                        }
                    }
                    else
                    {
                        //standard events :
                        let p = {
                            eventName: eventData.eventName,
                            pcTargetLanMAC: eventData.pcTargetLanMAC,
                            pcTargetMachineID: eventData.pcTargetMachineID,
                        };
                        
                        // Utiliser await pour attendre la fin du traitement
                        this.eventDispatcher(p, 'socket').then((responseData) => {
                            let evtResult = {};
                            if (responseData) {
                                evtResult = responseData;
                                //contain evtResult.msg
                            }
                            else {
                                evtResult.msg = eventData.eventName + ' event received (no response)';
                            }
                            //send response message by updating eventResult database field:
                            eventData.eventResult = JSON.stringify(evtResult);
                            G.webrtcManager.saveData('messages', id, eventData);
                        }).catch((error) => {
                            console.error(`[EVENT] Error processing event ${eventData.eventName}:`, error);
                            eventData.eventResult = JSON.stringify({ msg: 'error: ' + error.message });
                            G.webrtcManager.saveData('messages', id, eventData);
                        });
                    }

                }
            }
        });
        console.log("OK! setup WebRTC socket events listeners");
    }

}


module.exports = ServerEventHandler;