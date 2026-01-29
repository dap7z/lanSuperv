/*************************************************************************************
 lanSuperv/back/server.js : entry point for the server application
 *************************************************************************************/

//LIBRARIES:
const Os = require('os');
const NodeMachineId = require('node-machine-id');

const Path = require('path');

const Express = require('express'); //nodejs framework
const BodyParser = require('body-parser'); //to get POST data
const WebSocket = require('ws'); //WebSocket pour signalisation WebRTC

const Crypto = require('crypto');  //hash machineID

const LanDiscovery = require('lan-discovery');

const IsPortAvailable = require('is-port-available');

let F = require('./functions.js'); //FONCTIONS


//--GLOBALS--
let G = {
    CONFIG_FILE: null,
    CONFIG: null,

    THIS_PC: {
        hostnameLocal: Os.hostname(),
        machineID: null,
        idPC: null,
        lanInterface: null,
        wanInterface: null
    },
    VISIBLE_COMPUTERS_FILE: null,
    VISIBLE_COMPUTERS: null,
    SCAN_IN_PROGRESS: false,      // State of current broadcast scan
    SCAN_TIMEOUT: null,           // Internal use, timeout reference
    SCAN_TIMEOUT_MS: 1000*60*10,  // Timeout value for broadcast scan
    QUICKSCAN_EXECUTED_AT: null,
    SCANNED_COMPUTERS: null, //(reset before each scan)
    PLUGINS_INFOS: [],
    WEB_SERVER: null,
    WEB_SERVER_INSTANCE: null,
    LAN_DISCOVERY: null,
    QUICKSCAN_CHECK_QUEUE: new Set(),
    WEBSOCKET_SERVER: null, // Serveur WebSocket pour signalisation WebRTC
};



class Server {

    constructor(configFileAbsolutePath) {
        if(! configFileAbsolutePath){
            // Use CONFIG_FILE from environment if defined (Docker), otherwise local config.js
            const path = require('path');
            const fs = require('fs');
            let configDir;
            
            // Debug: log environment variables
            console.log('[SERVER] LANSUPERV_CONFIG_DIR: ' + (process.env.LANSUPERV_CONFIG_DIR || 'NOT SET'));
            console.log('[SERVER] CONFIG_FILE: ' + (process.env.CONFIG_FILE || 'NOT SET'));
            console.log('[SERVER] process.execPath: ' + process.execPath);
            
            // Use LANSUPERV_CONFIG_DIR if provided (from Electron), otherwise use process.execPath
            if (process.env.LANSUPERV_CONFIG_DIR) {
                configDir = process.env.LANSUPERV_CONFIG_DIR;
                console.log('[SERVER] Using LANSUPERV_CONFIG_DIR: ' + configDir);
            } else {
                // Use process.execPath to get the executable directory
                // NOTE: In Node.js child process, this points to node.exe, not Electron exe!
                const exePath = process.execPath;
                configDir = path.dirname(exePath);
                console.log('[SERVER] Using process.execPath (WARNING: points to node.exe): ' + configDir);
            }
            
            configFileAbsolutePath = process.env.CONFIG_FILE || path.join(configDir, 'config.js');
            if (!fs.existsSync(configFileAbsolutePath)) {
                console.error('[SERVER] ERROR: config.js not found at: ' + configFileAbsolutePath);
            }
        }
        G.CONFIG_FILE = configFileAbsolutePath;
        G.CONFIG = require(configFileAbsolutePath);
    }

    start(){
        //---------------------------------------------------------------------------------------------------------------------------------------------------------------

        //----- LAUNCH HTTP SERVER -----
        G.WEB_SERVER = Express();
        G.WEB_SERVER.set('port', G.CONFIG.val('SERVER_PORT') );
        
        // Serve static files with cache-control headers to force reload on every page load
        G.WEB_SERVER.use(Express.static(Path.join(__dirname, '../front'), {
            setHeaders: function(res, path) {
                // Disable caching for all static files
                res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
                res.setHeader('Pragma', 'no-cache');
                res.setHeader('Expires', '0');
                res.setHeader('Surrogate-Control', 'no-store');
                // Remove ETag to prevent conditional requests
                res.removeHeader('ETag');
            }
        }));
        //__dirname is native Node variable which contains the file path of the current folder
        G.WEB_SERVER.use(BodyParser.urlencoded({extended: false}));   //to get POST data
        //extended: false means you are parsing strings only (not parsing images/videos..etc)
        G.WEB_SERVER.use(BodyParser.json());

        // route middleware that will happen on every request
        let appRouter = Express.Router();
        appRouter.use(function(req, res, next) {
            console.log("[HTTP] " + req.method, req.url);
            // continue doing what we were doing and go to the route
            next();
        });

        //errorHandler has to be last defined:
        G.WEB_SERVER.use(function(err, req, res, next) {
            console.error(err.stack);
            res.status(500).send('ERROR! Something broke on htpp server!');
            //20171013 port busy (EADDRINUSE) not catched here => use of IsPortAvailable
            //(Debian "pm2 start server.js" + "~/.nvm/versions/node/v8.5.0/bin/node server.js")
        });

        //Serve config.js as if it was in front directory
        G.WEB_SERVER.get('/config.js', function (req, res) {
            // Set cache-control headers for config.js
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
            res.sendFile(G.CONFIG_FILE);
        });

        G.LAN_DISCOVERY = new LanDiscovery({ verbose: false, timeout: 60 });
        G.LAN_DISCOVERY.getDefaultInterface().then( (defaultInterface) => {
            //we start here with network informations
            console.log(defaultInterface);
            G.THIS_PC.lanInterface = defaultInterface;

            //define machineID with node-machine-id + lan mac address
            NodeMachineId.machineId({original: true}).then(function (id) {
                function hash(guid) {
                    //return Crypto.createHash('sha1').update(guid).digest('hex'); //=>40
                    return Crypto.createHash('sha256').update(guid).digest('hex'); //=>64
                }
                let macAddress = G.THIS_PC.lanInterface.mac_address;
                G.THIS_PC.machineID = hash(id + macAddress); //global scope
                G.THIS_PC.idPC = F.getPcIdentifier({lanMAC: macAddress});
                console.log("[PcIdentifier] OK! Got mac address from lan interface, now we can calculate G.THIS_PC.idPC:", G.THIS_PC.idPC);
            });

            IsPortAvailable(G.WEB_SERVER.get('port')).then( (status) => {
                if (!status) {
                    console.log('ERROR! Port ' + G.WEB_SERVER.get('port') + ' is not available!');
                    console.log('Reason : ' + IsPortAvailable.lastError);
                }
                else {
                    // Listen on all interfaces (0.0.0.0) to accept connections from the network
                    G.WEB_SERVER_INSTANCE = G.WEB_SERVER.listen(G.WEB_SERVER.get('port'), '0.0.0.0', () => {
                        //get listening port
                        let port = G.WEB_SERVER_INSTANCE.address().port;
                        
                        //----- INITIALIZE WEBSOCKET SERVER FOR WebRTC SIGNALING -----
                        G.WEBSOCKET_SERVER = new WebSocket.Server({ 
                            server: G.WEB_SERVER_INSTANCE,
                            path: '/webrtc-signaling'
                        });
                        
                        // Define handleWebRTCSignaling in the scope of start()
                        const { RTCPeerConnection, RTCSessionDescription, RTCIceCandidate } = require('wrtc');
                        
                        async function handleWebRTCSignaling(ws, message, clientState) {
                            switch (message.type) {
                                case 'request-offer':
                                    // Client requests an offer, create a WebRTC connection
                                    if (!clientState.pc) {
                                        clientState.pc = new RTCPeerConnection({
                                            iceServers: [
                                                { urls: 'stun:stun.l.google.com:19302' }
                                            ]
                                        });
                                        
                                        // Create a data channel to exchange data
                                        const dataChannel = clientState.pc.createDataChannel('lansuperv', {
                                            ordered: true
                                        });
                                        
                                        clientState.dataChannel = dataChannel;
                                        setupServerDataChannel(dataChannel);
                                        
                                        // Handle ICE candidates
                                        clientState.pc.onicecandidate = (event) => {
                                            if (event.candidate && ws.readyState === WebSocket.OPEN) {
                                                ws.send(JSON.stringify({
                                                    type: 'ice-candidate',
                                                    candidate: event.candidate
                                                }));
                                            }
                                        };
                                        
                                        // Create an offer
                                        const offer = await clientState.pc.createOffer();
                                        await clientState.pc.setLocalDescription(offer);
                                        
                                        ws.send(JSON.stringify({
                                            type: 'offer',
                                            offer: offer
                                        }));
                                    }
                                    break;
                                    
                                case 'answer':
                                    if (clientState.pc) {
                                        await clientState.pc.setRemoteDescription(new RTCSessionDescription(message.answer));
                                    }
                                    break;
                                    
                                case 'ice-candidate':
                                    if (clientState.pc && clientState.pc.remoteDescription) {
                                        await clientState.pc.addIceCandidate(new RTCIceCandidate(message.candidate));
                                    }
                                    break;
                            }
                        }
                        
                        function setupServerDataChannel(dataChannel) {
                            // Function to send initial data
                            const sendInitialData = () => {
                                // Check that idPC is defined before sending
                                if (!G.THIS_PC.idPC) {
                                    console.log('[WebRTC Signaling] Waiting for idPC to be defined before sending initial data...');
                                    // Retry after a short delay
                                    setTimeout(sendInitialData, 100);
                                    return;
                                }
                                
                                const initialData = {
                                    computers: {},
                                    messages: {},
                                    serverIdPC: G.THIS_PC.idPC
                                };
                                
                                // Retrieve all computers data from WebRTCManager
                                if (G.webrtcManager) {
                                    const computers = G.webrtcManager.getAllData('computers');
                                    computers.forEach((pc, id) => {
                                        initialData.computers[id] = pc;
                                    });
                                    
                                    const messages = G.webrtcManager.getAllData('messages');
                                    messages.forEach((msg, id) => {
                                        initialData.messages[id] = msg;
                                    });
                                }
                                
                                console.log('[WebRTC Signaling] Sending initial data with serverIdPC:', G.THIS_PC.idPC, 'initialData:', JSON.stringify(initialData));
                                dataChannel.send(JSON.stringify({
                                    type: 'initial-data',
                                    data: initialData
                                }));
                            };
                            
                            dataChannel.onopen = () => {
                                // Send initial data (with idPC check)
                                sendInitialData();
                            };
                            
                            dataChannel.onmessage = (event) => {
                                try {
                                    const message = JSON.parse(event.data);
                                    if (message.type === 'update') {
                                        // Save via WebRTCManager
                                        if (G.webrtcManager) {
                                            G.webrtcManager.saveData(message.table, message.id, message.data);
                                        }
                                    }
                                } catch (error) {
                                    console.error('[WebRTC Signaling] Error handling data channel message:', error);
                                }
                            };
                            
                            // Listen for updates from WebRTCManager to send to client
                            if (G.webrtcManager) {
                                const updateListener = ({ table, id, data }) => {
                                    if (dataChannel.readyState === 'open') {
                                        dataChannel.send(JSON.stringify({
                                            type: 'update',
                                            table: table,
                                            id: id,
                                            data: data
                                        }));
                                    }
                                };
                                G.webrtcManager.on('dataUpdate', updateListener);
                                
                                // Clean up listener when data channel closes
                                dataChannel.onclose = () => {
                                    G.webrtcManager.removeListener('dataUpdate', updateListener);
                                };
                            }
                        }
                        
                        G.WEBSOCKET_SERVER.on('connection', (ws) => {
                            console.log('[WebRTC Signaling] Client connected');
                            const clientState = { pc: null, dataChannel: null };
                            
                            ws.on('message', async (message) => {
                                try {
                                    const data = JSON.parse(message);
                                    await handleWebRTCSignaling(ws, data, clientState);
                                } catch (error) {
                                    console.error('[WebRTC Signaling] Error handling message:', error);
                                }
                            });
                            
                            ws.on('close', () => {
                                console.log('[WebRTC Signaling] Client disconnected');   // we do pass here when browser tab closes
                                if (clientState.pc) {
                                    clientState.pc.close();
                                }
                            });
                        });
                        
                        console.log('[WebRTC Signaling] WebSocket server started on /webrtc-signaling');
                        
                        let url = 'http://localhost:'+port;
                        let serverUpNotification = 'Web server available on '+ url +' (lanIP: '+ G.THIS_PC.lanInterface.ip_address +', ';
                        //get public ip using fetch native (replaces ext-ip)
                        const controller = new AbortController();
                        const timeoutId = setTimeout(() => controller.abort(), 5000);
                        
                        fetch('https://api.ipify.org?format=json', { signal: controller.signal })
                            .then(response => {
                                clearTimeout(timeoutId);
                                return response.json();
                            })
                            .then(data => {
                                const ip = data.ip;
                                serverUpNotification += 'wanIP: ' + ip + ')';
                                G.THIS_PC.wanInterface = {ip: ip};
                                console.log('OK! '+ serverUpNotification);
                            })
                            .catch(err => {
                                clearTimeout(timeoutId);
                                serverUpNotification += 'unknow wanIP)';
                                G.THIS_PC.wanInterface = {ip: null};
                                console.log('OK! '+ serverUpNotification);
                            })
                            .finally(() => {
                                this.onWebServerReady();  //function of Server class
                            });
                    });
                }
            });

            // apply the routes to our application
            G.WEB_SERVER.use('/', appRouter);

        }).catch(function(err){
            console.log("main got unknown error, print error and exit...");
            console.log(err);

            process.exit();
        });
		//---------------------------------------------------------------------------------------------------------------------------------------------------------------
    }


    onWebServerReady() {

        //----- CONNECT DATABASE -----
        const ServerDatabase = require('./serverDatabase');
        G.database = new ServerDatabase(G);
        G.database.initConnection();

        //----- GET PLUGINS INFORMATIONS -----
        const ServerPluginsInfos = require('./serverPluginsInfos');
        G.PLUGINS_INFOS = ServerPluginsInfos.build();

        //----- INITIALIZE EVENT HANDLER (before WebRTC to avoid errors) -----
        const ServerEventHandler = require('./serverEventHandler');
        G.eventHandler = new ServerEventHandler(G);
        G.eventHandler.setupHttpEventsLiteners();

        //----- INITIALIZE WebRTC MANAGER -----
        const ServerWebRTCManager = require('./serverWebRTCManager');
        G.webrtcManager = new ServerWebRTCManager(G);
        G.webrtcManager.init();
        
        // Configure event listeners after WebRTC initialization
        G.eventHandler.setupSocketEventsListeners();
        // (required for processing ping broadcast scan results and launching onePcScan on newly detected PCs)
        
        // Reload G.VISIBLE_COMPUTERS map on server restart
        G.database.dbVisibleComputersLoad();

        //----- LAUNCH FIRST SCAN -----
        const ServerLanScanner = require('./serverLanScanner');
        let lanScanner = new ServerLanScanner(G);
        // Store lanScanner reference for event emit in ServerLanScanner class
        G.lanScanner = lanScanner;
        // Setup listener one time only, just after instantiation
        lanScanner.setupScanListeners();
        
        // ---- START WEBRTC
        // Listen for PC discoveries via Bonjour/WebRTC
        G.webrtcManager.on('pcDiscovered', (pcInfo) => {
            console.log(`[SCAN] PC discovered via Bonjour: ${pcInfo.hostname} (${pcInfo.lanIP}, idPC: ${pcInfo.idPC})`);
            lanScanner.processBonjourDiscovery(pcInfo);
        });
        
        // Initialize SCANNED_COMPUTERS (required for processScanResult)
        if (!G.SCANNED_COMPUTERS) {
            G.SCANNED_COMPUTERS = new Map();
        }
        
        // Add this PC to the list (common for both cases)
        let params = {
            lastCheck: new Date().toISOString(),
            lanIP: G.THIS_PC.lanInterface.ip_address,
            lanMAC: G.THIS_PC.lanInterface.mac_address,
            hostname: G.THIS_PC.hostnameLocal || "SELF",
        };
        let remotePlugins = F.simplePluginsList('remote', G.PLUGINS_INFOS);
        lanScanner.processScanResult(params, remotePlugins);


        //----- HANDLE WebRTC ROUTES (for Node.js to Node.js compatibility) -----
        G.WEB_SERVER.post('/webrtc/offer', BodyParser.json(), function (req, res) {
            const { from, offer } = req.body;
            console.log(`[WebRTC] Received offer - from: ${from}, THIS_PC.idPC: ${G.THIS_PC.idPC}, offer present: ${!!offer}`);
            
            if (!from || !offer) {
                console.log(`[WebRTC] Missing from or offer - from: ${from}, offer: ${offer ? 'present' : 'missing'}`);
                return res.status(400).json({ error: 'Missing from or offer' });
            }

            // Ignore our own offer
            if (from === G.THIS_PC.idPC) {
                console.log(`[WebRTC] Ignoring offer from self - from: ${from}, THIS_PC.idPC: ${G.THIS_PC.idPC}`);
                return res.status(400).json({ error: 'Cannot connect to self' });
            }

            console.log(`[WebRTC] Handling offer from ${from}`);
            G.webrtcManager.handleOffer(from, offer)
                .then(answer => {
                    console.log(`[WebRTC] Offer handled successfully, sending answer to ${from}`);
                    res.json({ answer: answer });
                })
                .catch(error => {
                    console.error(`[WebRTC] Error handling offer from ${from}:`, error);
                    res.status(500).json({ error: error.message });
                });
        });

        G.WEB_SERVER.post('/webrtc/ice-candidate', BodyParser.json(), function (req, res) {
            const { from, candidate } = req.body;
            if (!from || !candidate) {
                return res.status(400).json({ error: 'Missing from or candidate' });
            }

            G.webrtcManager.handleIceCandidate(from, candidate);
            res.json({ status: 'ok' });
        });
        // ---- END WEBRTC

        //----- HANDLE HOMEPAGE REQUEST (HTTP/HTTPS) -----
        G.WEB_SERVER.get('/', function (homePageRequest, homePageResponse) {
            // Set cache-control headers for HTML page to force reload
            homePageResponse.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
            homePageResponse.setHeader('Pragma', 'no-cache');
            homePageResponse.setHeader('Expires', '0');
            homePageResponse.sendFile(Path.join(__dirname, '../front/view.html'));
            console.log("~~~~ SEND HTML PAGE AND START QUICK SCAN (ping/http/socket) ~~~~");
            if (G.VISIBLE_COMPUTERS.size > 0) {
                lanScanner.startQuickScan()
                    .then(function (v) {
                        console.log('°°°°°°°°°°°°° PROMISES (PENDINGS)  °°°°°°°°°°°°°°');
                        console.log(v);
                        lanScanner.startBroadcastScan();
                    })
                    .catch(function (err) {
                        console.error(err);
                    });
            }
        });

    }

}

module.exports = Server;
