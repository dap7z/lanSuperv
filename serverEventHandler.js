let F = require('./functions.js'); //FONCTIONS
let G = null; //GLOBALS

//LIBRARIES:
const {fork} = require('child_process');

class ServerEventHandler {

    constructor(G_ref) {
        G = G_ref;
    }


    eventTargetIsThisPC(eventData){
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

        if(pcTargetLanMAC === G.THIS_PC.lanInterface.mac_address) return true;
        if(pcTargetMachineID === G.THIS_PC.machineID) return true;

        return false;
    }


    eventRedirection(eventData, dbComputers, method='http'){
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
                let jsonString = JSON.stringify({
                    'eventName': eventName,
                    'pcTarget': pcTarget,
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

        });

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


    //same process (and parameters) on socket or http :
    async eventDispatcher(p, f) {
        let eventResult = null;

        //used globals: G.PLUGINS_INFOS G.THIS_PC.lanInterface
        //fonctions args: p(eventParameters), f(eventFrom)
        console.log("LOG! eventDispatcher receive " + p.eventName + " event from " + f + ", pcTarget:" + p.pcTarget.lanMAC);
        //console.log(p.pcTarget);

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
        if (p.dirPath.indexOf('local-responses') >= 0) //if local-response
        {
            if (this.eventTargetIsThisPC(p)) {
                p.pcTarget = 'self';
            }
            else if (p.pcTarget !== 'self') {
                if (f !== 'socket') {
                    this.eventRedirection(p, G.GUN_DB_COMPUTERS);
                }
                //event transmited, nothing more to do.
                //(and not even need eventRedirection if it comes from gun.js db)
                processEvent = false;
            }
        }
        if (processEvent) {
            if (p.pcTarget === 'self') {
                p.pcTarget = G.THIS_PC;
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
                eventName: request.params.eventName,
                pcTarget: 'self'
            };
            //example:
            //http://localhost:842/cmd/check
            //http://localhost:842/cmd/power-off
            let responseData = await this.eventDispatcher(p, 'http');
            response.json(responseData); //json response
        });
        console.log("OK! setup http events listeners");
    }


    setupSocketEventsListeners(){
        //++++++++++ SOCKET EVENT (GUN.JS) ++++++++++
        G.GUN_DB_MESSAGES.map().on( (eventData, id) => {

            if (eventData && eventData.eventReceivedAt == null) {

                //calculate idPC of target
                let pcTarget = {
                    lanMAC: eventData.pcTargetLanMAC,
                    machineID: eventData.pcTargetMachineID
                };
                pcTarget.idPC = F.getPcIdentifier(pcTarget);
                //(idPC: lanMAC sans les deux points ou machineID, pour l'instant uniquement lanMAC')

                let readMessage = false;
                if(pcTarget.lanMAC === G.THIS_PC.lanInterface) readMessage = true;
                if(pcTarget.machineID === G.THIS_PC.machineID) readMessage = true;

                //If eventData.type == remote-request && eventData.target in G.VISIBLE_COMPUTERS -> read and process event
                if(typeof G.PLUGINS_INFOS[eventData.eventName] === 'undefined')
                {
                    console.log("WARNING! undefined event '"+ eventData.eventName +"' in G.PLUGINS_INFOS");
                    //DIAG: undefined event 'undefined' in G.PLUGINS_INFOS
                }
                else if(G.PLUGINS_INFOS[eventData.eventName].isRemote)
                {
                    //Reminder: G.VISIBLE_COMPUTERS is empty before 1st scan and then contains only powered on pc
                    //May be not the thing to use here ... (for wol)
                    //But still acceptable since we save it in a file :)
                    readMessage = G.VISIBLE_COMPUTERS.has(pcTarget.idPC);
                }


                if(readMessage)
                {
                    eventData.eventResult = '';
                    eventData.eventReceivedAt = new Date().toISOString();
                    //we have to update database first if event is going to stop the server (power-off/sleep-mode/...)
                    G.GUN_DB_MESSAGES.get(id).put(eventData, () => {
                        //then we can process event:

                        if(eventData.eventName === 'check')
                        {
                            if(this.eventTargetIsThisPC(eventData))
                            {
                                //check events (specific, socketCheck update database directly) :
                                let finalResult = F.checkData(G.THIS_PC, 'socket');
                                finalResult['idPC'] = pcTarget.idPC;
                                G.database.dbComputersSaveData(finalResult.idPC, finalResult, "socket"); //NEW
                            }
                        }
                        else
                        {
                            //standard events :
                            let p = {
                                eventName: eventData.eventName,
                                pcTarget: pcTarget,
                            };
                            let responseData = this.eventDispatcher(p, 'socket');

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

                            G.GUN_DB_MESSAGES.get(id).put(eventData);
                        }

                    });

                }
            }
        });
        console.log("OK! setup gun.js socket events listeners");
    }


};


module.exports = ServerEventHandler;