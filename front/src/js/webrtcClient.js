/**
 * WebRTCClient : Gère les connexions WebRTC côté client
 * Remplace Gun.js pour la synchronisation de données avec le serveur
 */
import { 
    createPeerConnection, 
    setupPeerConnectionHandlers, 
    applyPendingIceCandidates, 
    addIceCandidate, 
    createAnswer,
    cleanupConnection 
} from './utils/webRtc.js';

export default class WebRTCClient {
    constructor(config) {
        this.config = config;
        this.pc = null;
        this.dataChannel = null;
        this.ws = null; // WebSocket pour la signalisation
        this.localData = {
            computers: new Map(),
            messages: new Map()
        };
        this.listeners = {
            computers: new Map(), // Map<id, Set<listeners>>
            messages: new Map()    // Map<id, Set<listeners>>
        };
        this.isConnected = false;
        this.serverUrl = this._getServerUrl();
        this.serverIdPC = null; // idPC du serveur web actuel (pour déterminer isCurrentWebServer)
        this.pendingIceCandidates = []; // Candidats ICE en attente
        this.connectionTimeout = null; // Timeout pour détecter les échecs
        this.isReconnecting = false; // Éviter les reconnexions multiples
    }

    _getServerUrl() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const hostname = window.location.hostname;
        let port = window.location.port;
        // Si pas de port dans l'URL (port par défaut), ne pas l'ajouter
        if (!port || port === '80' || port === '443') {
            return `${protocol}//${hostname}`;
        }
        return `${protocol}//${hostname}:${port}`;
    }

    /**
     * Initialise la connexion WebRTC
     */
    async init() {
        // Établir la connexion WebSocket pour la signalisation
        await this._connectSignaling();
    }

    /**
     * Nettoie les ressources d'une connexion WebRTC
     */
    _cleanupConnection() {
        cleanupConnection(this.pc, this.dataChannel, this.connectionTimeout, this.pendingIceCandidates);
        this.connectionTimeout = null;
        this.dataChannel = null;
        this.pc = null;
        this.isConnected = false;
    }

    /**
     * Établit la connexion WebSocket pour la signalisation
     */
    _connectSignaling() {
        if (this.isReconnecting || (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING))) {
            return Promise.resolve();
        }
        
        return new Promise((resolve, reject) => {
            const wsUrl = `${this.serverUrl}/webrtc-signaling`;
            console.log(`[WebRTC Client] Connecting to signaling server: ${wsUrl}`);
            
            if (this.ws) {
                this.ws.onclose = null;
                this.ws.close();
            }
            
            if (this.pc && this.pc.connectionState !== 'connected' && this.pc.connectionState !== 'connecting') {
                this._cleanupConnection();
            }
            
            this.ws = new WebSocket(wsUrl);
            this.ws.onopen = () => {
                console.log("[WebRTC Client] Signaling WebSocket connected");
                this.isReconnecting = false;
                if (!this.pc || (this.pc.connectionState !== 'connected' && this.pc.connectionState !== 'connecting')) {
                    this._requestOffer();
                }
            };
            this.ws.onmessage = async (event) => {
                try {
                    await this._handleSignalingMessage(JSON.parse(event.data));
                } catch (error) {
                    console.error("[WebRTC Client] Error handling signaling message:", error);
                }
            };
            this.ws.onerror = (error) => {
                console.error("[WebRTC Client] WebSocket error:", error);
                reject(error);
            };
            this.ws.onclose = () => {
                this.isConnected = false;
                this.isReconnecting = true;
                setTimeout(() => {
                    this.isReconnecting = false;
                    this._connectSignaling();
                }, 3000);
            };
            setTimeout(() => resolve(), 100);
        });
    }

    /**
     * Demande une offre WebRTC au serveur
     */
    _requestOffer() {
        if (this.pc && (this.pc.connectionState === 'connected' || this.pc.connectionState === 'connecting')) {
            return;
        }
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'request-offer' }));
        }
    }

    /**
     * Helper pour la reconnexion après un échec
     */
    _reconnectAfterDelay(delay = 2000) {
        this._cleanupConnection();
        setTimeout(() => this._connectSignaling(), delay);
    }

    /**
     * Gère les messages de signalisation
     */
    async _handleSignalingMessage(message) {
        switch (message.type) {
            case 'offer':
                await this._handleOffer(message.offer);
                break;
            case 'answer':
                await this._handleAnswer(message.answer);
                break;
            case 'ice-candidate':
                await this._handleIceCandidate(message.candidate);
                break;
            case 'data':
                this._handleDataMessage(message);
                break;
        }
    }

    /**
     * Gère une offre WebRTC du serveur
     */
    async _handleOffer(offer) {
        console.log("[WebRTC Client] Received offer from server");
        this._cleanupConnection();
        
        this.pc = createPeerConnection(RTCPeerConnection);
        this.pc.ondatachannel = (event) => this._setupDataChannel(event.channel);

        setupPeerConnectionHandlers(
            this.pc,
            (candidate) => {
                if (this.ws?.readyState === WebSocket.OPEN) {
                    console.log(`[WebRTC Client] Sending ICE candidate: ${candidate.candidate?.substring(0, 80)}...`);
                    this.ws.send(JSON.stringify({ type: 'ice-candidate', candidate }));
                }
            },
            (iceState) => {
                console.log(`[WebRTC Client] ICE connection state: ${iceState}`);
                if (iceState === 'failed') {
                    console.error("[WebRTC Client] ICE connection failed, reconnecting...");
                    this._reconnectAfterDelay();
                }
            },
            (connectionState) => {
                console.log(`[WebRTC Client] Connection state: ${connectionState}`);
                this.isConnected = (connectionState === 'connected');
                if (connectionState === 'connected') {
                    console.log("[WebRTC Client] Connection established successfully!");
                    if (this.connectionTimeout) {
                        clearTimeout(this.connectionTimeout);
                        this.connectionTimeout = null;
                    }
                } else if (connectionState === 'disconnected' || connectionState === 'failed') {
                    console.log(`[WebRTC Client] Connection lost (state: ${connectionState}), reconnecting...`);
                    this._reconnectAfterDelay();
                }
            }
        );

        try {
            const answer = await createAnswer(this.pc, offer, RTCSessionDescription);
            await applyPendingIceCandidates(this.pc, this.pendingIceCandidates, RTCIceCandidate, "[WebRTC Client]");
            
            if (this.ws?.readyState === WebSocket.OPEN) {
                console.log("[WebRTC Client] Sending answer to server");
                this.ws.send(JSON.stringify({ type: 'answer', answer }));
            } else {
                console.error("[WebRTC Client] Cannot send answer: WebSocket not open");
            }

            this.connectionTimeout = setTimeout(() => {
                if (this.pc?.connectionState !== 'connected' && this.pc?.connectionState !== 'connecting') {
                    console.warn("[WebRTC Client] Connection timeout, forcing reconnection...");
                    this._reconnectAfterDelay();
                }
            }, 15000);
        } catch (error) {
            console.error("[WebRTC Client] Error handling offer:", error);
            this._reconnectAfterDelay();
        }
    }

    async _handleAnswer(answer) {
        if (this.pc?.signalingState !== 'stable') {
            await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
        }
    }

    async _handleIceCandidate(candidate) {
        console.log(`[WebRTC Client] Received ICE candidate: ${candidate.candidate?.substring(0, 80)}...`);
        await addIceCandidate(this.pc, candidate, RTCIceCandidate, this.pendingIceCandidates, "[WebRTC Client]");
    }

    _setupDataChannel(dataChannel) {
        console.log("[WebRTC Client] Data channel received:", dataChannel.label);
        dataChannel.onopen = () => {
            this.dataChannel = dataChannel;
            this.isConnected = true;
            this._requestInitialData();
        };
        dataChannel.onmessage = (event) => {
            try {
                this._handleDataMessage(JSON.parse(event.data));
            } catch (error) {
                console.error("[WebRTC Client] Error parsing data message:", error);
            }
        };
        dataChannel.onerror = (error) => console.error("[WebRTC Client] Data channel error:", error);
        dataChannel.onclose = () => {
            this.dataChannel = null;
            this.isConnected = false;
        };
    }

    _requestInitialData() {
        if (this.dataChannel?.readyState === 'open') {
            this.dataChannel.send(JSON.stringify({ type: 'request-initial-data' }));
        }
    }

    /**
     * Gère les messages de données
     */
    _handleDataMessage(message) {
        switch (message.type) {
            case 'update':
                this._handleUpdate(message.table, message.id, message.data);
                break;
            case 'delete':
                this._handleDelete(message.table, message.id);
                break;
            case 'initial-data':
                this._handleInitialData(message.data);
                break;
        }
    }

    /**
     * Gère une mise à jour de données
     */
    _handleUpdate(table, id, data) {
        if (table === 'computers' || table === 'messages') {
            this.localData[table].set(id, data);
            this._notifyListeners(table, id, data);
        }
    }

    /**
     * Gère une suppression de données
     */
    _handleDelete(table, id) {
        if (table === 'computers' || table === 'messages') {
            this.localData[table].delete(id);
            this._notifyListeners(table, id, null);
        }
    }

    /**
     * Gère les données initiales
     */
    _handleInitialData(data) {
        // Stocker l'idPC du serveur (pour déterminer isCurrentWebServer)
        // console.log("[WebRTC Client] _handleInitialData called with data:", data); // OK :)
        if (data.serverIdPC) {
            this.serverIdPC = data.serverIdPC;
        }
        
        // Charger les computers AVANT de les notifier, pour que serverIdPC soit disponible
        if (data.computers) {
            Object.entries(data.computers).forEach(([id, pc]) => {
                this.localData.computers.set(id, pc);
            });
            // Notifier après avoir stocké serverIdPC
            Object.entries(data.computers).forEach(([id, pc]) => {
                this._notifyListeners('computers', id, pc);
            });
        }
        if (data.messages) {
            Object.entries(data.messages).forEach(([id, msg]) => {
                this.localData.messages.set(id, msg);
                this._notifyListeners('messages', id, msg);
            });
        }
    }
    
    /**
     * Retourne l'idPC du serveur web actuel
     */
    getServerIdPC() {
        return this.serverIdPC;
    }

    /**
     * Notifie les listeners d'un changement
     */
    _notifyListeners(table, id, data) {
        // Notifier les listeners spécifiques à cet ID
        const idListeners = this.listeners[table].get(id);
        if (idListeners) {
            idListeners.forEach(listener => {
                try {
                    listener(data, id);
                } catch (error) {
                    console.error("[WebRTC Client] Error in listener:", error);
                }
            });
        }

        // Notifier les listeners globaux (map)
        const mapListeners = this.listeners[table].get('*');
        if (mapListeners) {
            mapListeners.forEach(listener => {
                try {
                    listener(data, id);
                } catch (error) {
                    console.error("[WebRTC Client] Error in map listener:", error);
                }
            });
        }
    }

    /**
     * Émule l'API Gun.js : get(table)
     */
    get(table) {
        // Extraire le nom de table depuis le chemin complet (ex: 'db-lansuperv/computers' -> 'computers')
        let tableName = table;
        if (table && typeof table === 'string' && table.includes('/')) {
            tableName = table.split('/').pop();
        }
        // Normaliser le nom de table (computers ou messages)
        if (tableName !== 'computers' && tableName !== 'messages') {
            // Si ce n'est pas un nom de table valide, essayer de le détecter
            if (tableName && typeof tableName === 'string') {
                if (tableName.includes('computer')) {
                    tableName = 'computers';
                } else if (tableName.includes('message')) {
                    tableName = 'messages';
                } else {
                    console.warn(`[WebRTC Client] Unknown table name: ${tableName}, defaulting to 'computers'`);
                    tableName = 'computers';
                }
            } else {
                console.warn(`[WebRTC Client] Invalid table parameter: ${table}, defaulting to 'computers'`);
                tableName = 'computers';
            }
        }
        //console.log(`[WebRTC Client] get(${table}) -> tableName: ${tableName}`);
        return new WebRTCNode(this, tableName);
    }

    /**
     * Envoie une mise à jour au serveur
     */
    _sendUpdate(table, id, data) {
        if (this.dataChannel?.readyState === 'open') {
            this.dataChannel.send(JSON.stringify({ type: 'update', table, id, data }));
        }
    }
}

/**
 * WebRTCNode : Émule un nœud Gun.js
 */
class WebRTCNode {
    constructor(client, table) {
        this.client = client;
        this.table = table;
        this.id = null;
    }

    /**
     * Émule get(id)
     */
    get(id) {
        const node = new WebRTCNode(this.client, this.table);
        node.id = id;
        return node;
    }

    /**
     * Émule put(data)
     */
    put(data) {
        if (this.id && this.table) {
            // Sauvegarder localement
            if (this.table === 'computers') {
                this.client.localData.computers.set(this.id, data);
            } else if (this.table === 'messages') {
                this.client.localData.messages.set(this.id, data);
            }
            
            // Envoyer au serveur
            this.client._sendUpdate(this.table, this.id, data);
            
            // Notifier les listeners
            this.client._notifyListeners(this.table, this.id, data);
        }
        return this;
    }

    /**
     * Émule map().on(callback)
     */
    map() {
        return {
            on: (callback) => {
                // Vérifier que la table existe dans listeners
                if (!this.client || !this.client.listeners) {
                    console.error(`[WebRTC Client] Client or listeners not initialized`);
                    return;
                }
                if (!this.table || !this.client.listeners[this.table]) {
                    console.error(`[WebRTC Client] Unknown table: ${this.table}, available tables:`, Object.keys(this.client.listeners));
                    return;
                }
                if (!this.client.listeners[this.table].has('*')) {
                    this.client.listeners[this.table].set('*', new Set());
                }
                this.client.listeners[this.table].get('*').add(callback);
                
                // Notifier avec les données existantes
                const dataMap = this.table === 'computers' 
                    ? this.client.localData.computers 
                    : this.client.localData.messages;
                dataMap.forEach((data, id) => {
                    callback(data, id);
                });
            },
            once: (callback) => {
                // Pour once(), on appelle une seule fois avec toutes les données
                const dataMap = this.table === 'computers' 
                    ? this.client.localData.computers 
                    : this.client.localData.messages;
                dataMap.forEach((data, id) => {
                    callback(data, id);
                });
            }
        };
    }

    /**
     * Émule on(callback)
     */
    on(callback) {
        if (this.id && this.table) {
            // Vérifier que la table existe dans listeners
            if (!this.client.listeners[this.table]) {
                console.error(`[WebRTC Client] Unknown table: ${this.table}`);
                return this;
            }
            if (!this.client.listeners[this.table].has(this.id)) {
                this.client.listeners[this.table].set(this.id, new Set());
            }
            this.client.listeners[this.table].get(this.id).add(callback);
            
            // Notifier avec les données existantes si disponibles
            const data = this.table === 'computers'
                ? this.client.localData.computers.get(this.id)
                : this.client.localData.messages.get(this.id);
            if (data) {
                callback(data, this.id);
            }
        }
        return this;
    }
}
