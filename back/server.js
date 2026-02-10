/*************************************************************************************
 lanSuperv/back/server.js : entry point for the server application
 *************************************************************************************/

// CRITICAL: Check if we're in plugin mode BEFORE loading any modules
// If LANSUPERV_PLUGIN_EXECUTE is set, we're in plugin mode
if (process.env.LANSUPERV_PLUGIN_EXECUTE) {
    // We're in plugin mode, don't require modules.
    module.exports = class DummyServer {
        constructor() {
            console.log('[SERVER] Running in plugin mode, server initialization skipped');
            // EXAMPLE : [PLUGIN wol] stdout: [SERVER] Running in plugin mode, server initialization skipped
        }
        start() {
            console.log('[SERVER] Running in plugin mode, server startup skipped');
            // EXAMPLE : [PLUGIN wol] stdout: [SERVER] Running in plugin mode, server startup skipped
        }
    };
    // Stop here, continue by example in /plugins/local-responses/screen-joke/app.js
} else {
    // Normal server mode - continue loading modules, and execute the rest of the file.

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
                    console.log('Please stop the process using port ' + G.WEB_SERVER.get('port') + ' or change SERVER_PORT in config.js');
                    process.exit(1);
                    return;
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
                        const webRtcUtils = require('./utils/webRtc');
                        
                        // Map pour gérer les connexions par clientId (permettre plusieurs onglets depuis la même IP)
                        const clientConnectionsById = new Map(); // Map<clientId, { ws: WebSocket, clientState: Object, createdAt: Date }>
                        
                        function cleanupClientState(clientState) {
                            webRtcUtils.cleanupConnection(clientState.pc, clientState.dataChannel, clientState.connectionTimeout, clientState.pendingIceCandidates);
                            clientState.dataChannel = null;
                            clientState.pc = null;
                            clientState.connectionTimeout = null;
                        }
                        
                        // Nettoyer les connexions en attente trop longtemps
                        function cleanupStaleConnections() {
                            const now = Date.now();
                            const STALE_TIMEOUT = 15000; // 15 secondes
                            
                            clientConnectionsById.forEach((conn, clientId) => {
                                if (!conn.clientState.pc) return;
                                
                                const state = conn.clientState.pc.connectionState;
                                const age = now - conn.createdAt;
                                
                                // Si la connexion est en attente depuis trop longtemps
                                if ((state === 'new' || state === 'connecting') && age > STALE_TIMEOUT) {
                                    console.log(`[WebRTC Signaling] Cleaning up stale connection for ${clientId} (state: ${state}, age: ${age}ms)`);
                                    cleanupClientState(conn.clientState);
                                    if (conn.ws && conn.ws.readyState === WebSocket.OPEN) {
                                        conn.ws.close();
                                    }
                                    clientConnectionsById.delete(clientId);
                                }
                            });
                        }
                        
                        // Vérifier toutes les 5 secondes
                        setInterval(cleanupStaleConnections, 5000);

                        async function handleWebRTCSignaling(ws, message, clientState) {
                            try {
                                switch (message.type) {
                                    case 'request-offer':
                                        console.log(`[WebRTC Signaling] request-offer from ${clientState.clientId}`);
                                        
                                        // Vérifier s'il existe une connexion active pour ce clientId (permet plusieurs onglets)
                                        const existingConn = clientConnectionsById.get(clientState.clientId);
                                        if (existingConn && existingConn.clientState.pc) {
                                            const existingState = existingConn.clientState.pc.connectionState;
                                            if (existingState === 'connected') {
                                                console.log(`[WebRTC Signaling] Reusing connected connection for ${clientState.clientId}`);
                                                // Mettre à jour la référence WebSocket
                                                if (existingConn.ws !== ws) {
                                                    existingConn.ws.close();
                                                }
                                                clientConnectionsById.set(clientState.clientId, { 
                                                    ws, 
                                                    clientState: existingConn.clientState, 
                                                    createdAt: existingConn.createdAt 
                                                });
                                                return;
                                            } else if (existingState === 'connecting') {
                                                const age = Date.now() - existingConn.createdAt;
                                                if (age < 10000) {
                                                    console.log(`[WebRTC Signaling] Connection already connecting for ${clientState.clientId}, waiting...`);
                                                    return;
                                                } else {
                                                    console.log(`[WebRTC Signaling] Cleaning stale connecting connection for ${clientState.clientId}`);
                                                    cleanupClientState(existingConn.clientState);
                                                    if (existingConn.ws !== ws) {
                                                        existingConn.ws.close();
                                                    }
                                                    clientConnectionsById.delete(clientState.clientId);
                                                }
                                            } else {
                                                cleanupClientState(existingConn.clientState);
                                                if (existingConn.ws !== ws) {
                                                    existingConn.ws.close();
                                                }
                                                clientConnectionsById.delete(clientState.clientId);
                                            }
                                        }
                                        
                                        // Nettoyer l'état actuel si nécessaire
                                        if (clientState.pc) {
                                            cleanupClientState(clientState);
                                        }
                                        
                                        // Créer une nouvelle connexion
                                        clientState.pc = webRtcUtils.createPeerConnection(RTCPeerConnection);
                                        clientState.dataChannel = clientState.pc.createDataChannel('lansuperv', { ordered: true });
                                        setupServerDataChannel(clientState.dataChannel);
                                        
                                        // Configurer les handlers
                                        webRtcUtils.setupPeerConnectionHandlers(
                                            clientState.pc,
                                            (candidate) => {
                                                if (ws.readyState === WebSocket.OPEN) {
                                                    ws.send(JSON.stringify({ type: 'ice-candidate', candidate }));
                                                }
                                            },
                                            (iceState) => {
                                                console.log(`[WebRTC Signaling] ICE state: ${iceState} - ${clientState.clientId}`);
                                                if (iceState === 'failed') {
                                                    console.error(`[WebRTC Signaling] ICE failed - ${clientState.clientId}`);
                                                    cleanupClientState(clientState);
                                                    const conn = clientConnectionsById.get(clientState.clientId);
                                                    if (conn && conn.clientState === clientState) {
                                                        clientConnectionsById.delete(clientState.clientId);
                                                    }
                                                }
                                            },
                                            (connectionState) => {
                                                console.log(`[WebRTC Signaling] Connection state: ${connectionState} - ${clientState.clientId}`);
                                                if (connectionState === 'connected') {
                                                    console.log(`[WebRTC Signaling] ✅ Connected to ${clientState.clientId}`);
                                                    if (clientState.connectionTimeout) {
                                                        clearTimeout(clientState.connectionTimeout);
                                                        clientState.connectionTimeout = null;
                                                    }
                                                } else if (connectionState === 'disconnected' || connectionState === 'failed') {
                                                    console.log(`[WebRTC Signaling] Connection ${connectionState} - ${clientState.clientId}`);
                                                    cleanupClientState(clientState);
                                                    const conn = clientConnectionsById.get(clientState.clientId);
                                                    if (conn && conn.clientState === clientState) {
                                                        clientConnectionsById.delete(clientState.clientId);
                                                    }
                                                }
                                            }
                                        );
                                        
                                        // Créer et envoyer l'offre
                                        try {
                                            const offer = await webRtcUtils.createOffer(clientState.pc);
                                            
                                            // Enregistrer la connexion AVANT d'envoyer l'offre
                                            clientConnectionsById.set(clientState.clientId, { 
                                                ws, 
                                                clientState, 
                                                createdAt: Date.now() 
                                            });
                                            
                                            if (ws.readyState === WebSocket.OPEN) {
                                                ws.send(JSON.stringify({ type: 'offer', offer }));
                                            } else {
                                                console.error(`[WebRTC Signaling] WebSocket not open, cannot send offer to ${clientState.clientId}`);
                                                cleanupClientState(clientState);
                                                clientConnectionsById.delete(clientState.clientId);
                                                return;
                                            }
                                            
                                            // Timeout pour nettoyer les connexions qui ne se connectent pas
                                            clientState.connectionTimeout = setTimeout(() => {
                                                if (clientState.pc && clientState.pc.connectionState !== 'connected') {
                                                    console.warn(`[WebRTC Signaling] Connection timeout for ${clientState.clientId}`);
                                                    cleanupClientState(clientState);
                                                    const conn = clientConnectionsById.get(clientState.clientId);
                                                    if (conn && conn.clientState === clientState) {
                                                        clientConnectionsById.delete(clientState.clientId);
                                                    }
                                                }
                                            }, 20000);
                                        } catch (error) {
                                            console.error(`[WebRTC Signaling] Error creating offer for ${clientState.clientId}:`, error);
                                            cleanupClientState(clientState);
                                            const conn = clientConnectionsById.get(clientState.clientId);
                                            if (conn && conn.clientState === clientState) {
                                                clientConnectionsById.delete(clientState.clientId);
                                            }
                                        }
                                        break;
                                        
                                    case 'answer':
                                        console.log(`[WebRTC Signaling] answer from ${clientState.clientId}`);
                                        if (!clientState.pc) {
                                            console.warn(`[WebRTC Signaling] Received answer but no peer connection exists for ${clientState.clientId}`);
                                            return;
                                        }
                                        try {
                                            await clientState.pc.setRemoteDescription(new RTCSessionDescription(message.answer));
                                            await webRtcUtils.applyPendingIceCandidates(
                                                clientState.pc, 
                                                clientState.pendingIceCandidates, 
                                                RTCIceCandidate, 
                                                '[WebRTC Signaling]'
                                            );
                                        } catch (error) {
                                            console.error(`[WebRTC Signaling] Error setting remote description for ${clientState.clientId}:`, error);
                                        }
                                        break;
                                    
                                    case 'ice-candidate':
                                        if (!message.candidate) {
                                            console.warn(`[WebRTC Signaling] Received null ICE candidate from ${clientState.clientId}`);
                                            return;
                                        }
                                        try {
                                            await webRtcUtils.addIceCandidate(
                                                clientState.pc, 
                                                message.candidate, 
                                                RTCIceCandidate, 
                                                clientState.pendingIceCandidates, 
                                                '[WebRTC Signaling]'
                                            );
                                        } catch (error) {
                                            console.error(`[WebRTC Signaling] Error adding ICE candidate from ${clientState.clientId}:`, error);
                                        }
                                        break;
                                    
                                    default:
                                        console.warn(`[WebRTC Signaling] Unknown message type: ${message.type}`);
                                }
                            } catch (error) {
                                console.error(`[WebRTC Signaling] Error handling message from ${clientState.clientId}:`, error);
                            }
                        }
                        
                        function setupServerDataChannel(dataChannel) {
                            const sendInitialData = () => {
                                if (!G.THIS_PC.idPC) {
                                    setTimeout(sendInitialData, 100);
                                    return;
                                }
                                
                                const initialData = { computers: {}, messages: {}, serverIdPC: G.THIS_PC.idPC };
                                if (G.webrtcManager) {
                                    G.webrtcManager.getAllData('computers').forEach((pc, id) => {
                                        initialData.computers[id] = pc;
                                    });
                                    G.webrtcManager.getAllData('messages').forEach((msg, id) => {
                                        initialData.messages[id] = msg;
                                    });
                                }
                                
                                dataChannel.send(JSON.stringify({ type: 'initial-data', data: initialData }));
                            };
                            
                            dataChannel.onopen = sendInitialData;
                            dataChannel.onmessage = (event) => {
                                try {
                                    const message = JSON.parse(event.data);
                                    if (message.type === 'update' && G.webrtcManager) {
                                        G.webrtcManager.saveData(message.table, message.id, message.data);
                                    }
                                } catch (error) {
                                    console.error('[WebRTC Signaling] Error handling data channel message:', error);
                                }
                            };
                            
                            if (G.webrtcManager) {
                                const updateListener = ({ table, id, data }) => {
                                    if (dataChannel.readyState === 'open') {
                                        dataChannel.send(JSON.stringify({ type: 'update', table, id, data }));
                                    }
                                };
                                G.webrtcManager.on('dataUpdate', updateListener);
                                dataChannel.onclose = () => G.webrtcManager.removeListener('dataUpdate', updateListener);
                            }
                        }
                        
                        G.WEBSOCKET_SERVER.on('connection', (ws, req) => {
                            const clientIP = req.socket.remoteAddress || req.headers['x-forwarded-for'] || 'unknown';
                            const clientPort = req.socket.remotePort || 'unknown';
                            const clientId = `${clientIP}:${clientPort}`;
                            
                            console.log(`[WebRTC Signaling] Client connected - ${clientId}`);
                            
                            const clientState = { 
                                pc: null, 
                                dataChannel: null,
                                pendingIceCandidates: [],
                                connectionTimeout: null,
                                clientId,
                                clientIP
                            };
                            
                            ws.on('message', async (message) => {
                                try {
                                    const parsed = JSON.parse(message);
                                    await handleWebRTCSignaling(ws, parsed, clientState);
                                } catch (error) {
                                    console.error(`[WebRTC Signaling] Error handling message from ${clientState.clientId}:`, error);
                                }
                            });
                            
                            ws.on('error', (error) => {
                                console.error(`[WebRTC Signaling] WebSocket error for ${clientState.clientId}:`, error);
                            });
                            
                            ws.on('close', () => {
                                console.log(`[WebRTC Signaling] Client disconnected - ${clientState.clientId}`);
                                
                                // Nettoyer la connexion de la map si c'est la connexion enregistrée
                                const conn = clientConnectionsById.get(clientState.clientId);
                                if (conn && conn.ws === ws) {
                                    clientConnectionsById.delete(clientState.clientId);
                                }
                                
                                // Nettoyer l'état du client
                                cleanupClientState(clientState);
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

} // End of else block for plugin mode check
