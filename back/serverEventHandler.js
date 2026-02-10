let F = require('./functions.js'); //FONCTIONS
let G = null; //GLOBALS

//LIBRARIES:
const {fork} = require('child_process');

class ServerEventHandler {

    constructor(G_ref) {
        G = G_ref;
        // Set to track events being processed (avoids double processing)
        this.processingEvents = new Set();
    }

    // Function to get the target idPC from eventData
    targetIdPC(eventData){
        return F.getPcIdentifier({lanMAC: eventData.pcTargetLanMAC});
    }

    eventTargetIsThisPC(eventData){
        // If no target specified (undefined for pcTargetLanMAC), then event is broadcast to all PCs including this one.
        if (!eventData.pcTargetLanMAC) {
            return true;
        }
        // Check if the target idPC matches this PC
        let pcTargetIdPC = this.targetIdPC(eventData);
        let myIdPC = G.THIS_PC.idPC;
        return pcTargetIdPC === myIdPC;
    }


    eventRedirection(eventData, method='http'){
        let eventName = eventData.eventName;

        console.log('[PLUGIN '+ eventName +']: local execution only => resend event through http');

        //Retrieve pc info from database :
        let idTargetPC = this.targetIdPC(eventData);
        
        // Get PC information from WebRTC
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
                'eventName': eventData.eventName,
                'eventOptions': eventData.eventOptions || null,
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
            // In SEA mode, use node explicitly to prevent the child process from inheriting the SEA environment (and try to get the port 842 too).
            const F = require('./functions');
            let compute;
            let nodePath = process.execPath;

            // CRITICAL: Set LANSUPERV_PLUGIN_MODE to prevent child process from starting their own server
            // The environment variable will be checked by application.js at the very beginning
            const pluginEnv = { ...process.env };
            pluginEnv.LANSUPERV_PLUGIN_MODE = 'true'; // Signal that we're in plugin mode
            delete pluginEnv.NODE_OPTIONS; // Clear NODE_OPTIONS to prevent environment inheritance
            
            const {spawn} = require('child_process');
            // Use spawn with node/lanSuperv.exe as executable and plugin script
            compute = spawn(nodePath, [execPath], {
                stdio: ['pipe', 'pipe', 'pipe', 'ipc'], // Enable IPC for message passing
                env: pluginEnv, // Use environment with plugin mode flag
                shell: false // Don't use shell to avoid path escaping issues
            });

            // Verify that compute was created successfully
            if (!compute) {
                console.error(`[PLUGIN ${eventName}] Failed to create child process`);
                resolve({});
                return;
            }
            
            console.log(`[PLUGIN ${eventName}] Plugin process ${execPath} spawned (PID: ${compute.pid})`);
            
            // Verify that stdout and stderr are available
            let srvErrorOutput = '';
            let srvStdOutput = '';
            if (!compute.stdout || !compute.stderr) {
                console.error(`[PLUGIN ${eventName}] ERROR: spawn() failed to create stdout/stderr streams. Path: ${execPath}`);
                console.error(`[PLUGIN ${eventName}] This usually happens when the path contains spaces or special characters`);
                resolve({});
                return;
            } else {
                compute.stdout.setEncoding('utf8');
                compute.stdout.on('data', (data) => {
                    const output = data.toString().trim();
                    if (output) {
                        console.log(`[PLUGIN ${eventName} standardOutput] ${output}`);   //OK
                    }
                });
                compute.stderr.on('data', (data) => {
                    const output = data.toString().trim();
                    srvErrorOutput += output + '\n';
                    if (output) {
                        console.error(`[PLUGIN ${eventName} errorOutput] ${output}`);  //OK
                    }
                });
            }
            
            // -- setup listener
            compute.on('message', (msg) => {
                let text = '[PLUGIN ' + eventName + '] message: ';
                if (typeof msg === 'object') {
                    lastObjectMsg = msg;
                } else {
                    console.log(text + msg);
                }

                if (msg === 'end') {
                    //promise return lastObjectMsg
                    resolve(lastObjectMsg);
                }
            });
            compute.on('error', (error) => {
                console.error(`[PLUGIN ${eventName}] Failed to start process:`, error);
                resolve({});
            });
            // --
            // Send eventParams using IPC
            setTimeout(() => {
                if (compute && !compute.killed) {
                    compute.send(eventParams);
                }
            }, 100);
            
            compute.on('exit', (code) => {
                if (code !== 0) {
                    console.error(`[PLUGIN ${eventName}] Process exited with code ${code}`);
                    if (srvErrorOutput) {
                        console.error(`[PLUGIN ${eventName}] Complete stderr output:\n${srvErrorOutput}`);
                    }
                }
                // If no 'end' message was received, resolve anyway
                if (lastObjectMsg && Object.keys(lastObjectMsg).length > 0) {
                    resolve(lastObjectMsg);
                } else {
                    resolve({});
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
                // Event intended for this PC, process it
                p.thisPC = G.THIS_PC;
            }
            else {
                // Event intended for another PC, redirect it
                if (f !== 'socket') {
                    this.eventRedirection(p);
                }
                //event transmitted, nothing more to do.
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
            
            // Recuperation des options de l'événement (depuis query string ou body)
            if (request.query && request.query.options) {
                try {
                    p.eventOptions = JSON.parse(request.query.options);
                } catch (e) {
                    // Fallback: si ce n'est pas du JSON, traiter comme une valeur simple
                    p.eventOptions = { type: request.query.options };
                }
            }
            if (request.body && request.body.eventOptions) {
                p.eventOptions = request.body.eventOptions;
            }
            
            //example:
            //http://localhost:842/cmd/check
            //http://localhost:842/cmd/power-off
            //http://localhost:842/cmd/screen-joke?options={"type":"video-destroyed-screen"}
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
        
        // Listen for message updates from WebRTC
        G.webrtcManager.on('dataUpdate', ({ table, id, data }) => {
            if (table !== 'messages') {
                return;
            }
            
            const eventData = data;
            if (eventData && eventData.eventReceivedAt == null) {

                // log of received events not yet processed
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
                    // Debug log to understand why the event is not being considered for processing or transmission
                    let myIdPC = G.THIS_PC.idPC;
                    console.log(`[EVENT-RECEPTION] Event ${eventData.eventName} NOT processed - pcTargetIdPC: ${pcTargetIdPC}, THIS_PC.idPC: ${myIdPC}`);
                    // Do not acknowledge the event if it's not intended for this PC (unless we transfer it to another PC)
                    return;
                }
                else
                {

                    // --- Specific handling for events that stop the PC (power-off/sleep-mode) :
                    //   - if the event is older than 2 minutes, ignore it and acknowledge it to avoid re-processing on restart
                    let shouldIgnoreEvent = false;
                    if (isSelfShutdownEvent)
                    {
                        let ageInMinutes = 0;
                        if(! eventData.eventSendedAt){
                            shouldIgnoreEvent = true;
                        }else{
                            // Check if the event is older than 2 minutes
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
                            // Acknowledge the event as if we had processed it
                            eventData.eventResult = JSON.stringify({ msg: message });
                            eventData.eventReceivedAt = new Date().toISOString();
                            G.webrtcManager.saveData('messages', id, eventData);
                            // The event should be ignored, do not continue processing
                            return;
                            }
                        }
                     // ---

                    // Mark the event as "being processed" immediately to avoid double processing
                    let eventReceivedAt = new Date().toISOString();
                    eventData.eventReceivedAt = eventReceivedAt;
                    G.webrtcManager.saveData('messages', id, eventData);
                    console.log(`[EVENT-RECEPTION] Event ${eventData.eventName} (id: ${id}) marked as received at ${eventReceivedAt}`);
                    
                    // Now process the event
                    //standard events :
                    let p = {
                        eventName: eventData.eventName,
                        pcTargetLanMAC: eventData.pcTargetLanMAC,
                        pcTargetMachineID: eventData.pcTargetMachineID,
                    };
                    //events with options :
                    if (eventData.eventOptions) {
                        p.eventOptions = eventData.eventOptions;
                    }
                    
                    //use await to wait for processing to complete
                    this.eventDispatcher(p, 'socket').then((responseData) => {
                        let evtResult = {};
                        if (responseData) {
                            evtResult = responseData;
                            //contain evtResult.msg
                        }
                        else {
                            evtResult.msg = eventData.eventName + ' event received (no response)';
                        }
                        
                        //specific handling for self check events: save to computers database
                        if (eventData.eventName === 'check' && responseData && this.eventTargetIsThisPC(eventData)) {
                            let finalResult = responseData;
                            finalResult['idPC'] = pcTargetIdPC;
                            G.database.dbComputersSaveData(finalResult.idPC, finalResult, "socket");
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
        });
        console.log("OK! setup WebRTC socket events listeners");
    }

}


module.exports = ServerEventHandler;