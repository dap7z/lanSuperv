/**
 * WebRTCClient : Gère les connexions WebRTC côté client
 * Pattern : Client crée l'offre et le data channel, serveur répond
 */
import { 
    createPeerConnection, 
    setupPeerConnectionHandlers, 
    applyPendingIceCandidates, 
    addIceCandidate,
    createOffer,
    cleanupConnection 
} from './utils/webRtc.js';

export default class WebRTCClient {
    constructor(config) {
        this.config = config;
        this.pc = null;
        this.dataChannel = null;
        this.ws = null;
        this.localData = {
            computers: new Map(),
            messages: new Map()
        };
        this.listeners = {
            computers: new Map(),
            messages: new Map()
        };
        this.isConnected = false;
        this.serverUrl = this._getServerUrl();
        this.serverIdPC = null;
        this.pendingIceCandidates = [];
        this.reconnectTimer = null;
        this.connectionAttempts = 0;
        this.maxReconnectDelay = 10000;
    }

    _getServerUrl() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const hostname = window.location.hostname;
        const port = window.location.port;
        if (!port || port === '80' || port === '443') {
            return `${protocol}//${hostname}`;
        }
        return `${protocol}//${hostname}:${port}`;
    }

    /**
     * Initialise la connexion WebRTC
     */
    async init() {
        await this._connectSignaling();
    }

    /**
     * Nettoie les ressources d'une connexion WebRTC
     */
    _cleanupConnection() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        cleanupConnection(this.pc, this.dataChannel, null, this.pendingIceCandidates);
        this.dataChannel = null;
        this.pc = null;
        this.isConnected = false;
        this.pendingIceCandidates = [];
    }

    /**
     * Établit la connexion WebSocket pour la signalisation
     */
    _connectSignaling() {
        return new Promise((resolve, reject) => {
            // Fermer l'ancienne connexion WebSocket si elle existe
            if (this.ws) {
                this.ws.onclose = null;
                this.ws.onerror = null;
                this.ws.close();
            }

            // Nettoyer l'ancienne connexion WebRTC si elle n'est pas connectée
            if (this.pc && this.pc.connectionState !== 'connected') {
                this._cleanupConnection();
            }

            const wsUrl = `${this.serverUrl}/webrtc-signaling`;
            console.log(`[WebRTC Client] Connecting to signaling: ${wsUrl}`);
            
            this.ws = new WebSocket(wsUrl);
            
            this.ws.onopen = () => {
                console.log("[WebRTC Client] Signaling connected");
                this.connectionAttempts = 0;
                // Notifier le serveur qu'on est prêt
                this.ws.send(JSON.stringify({ type: 'ready' }));
                resolve();
            };
            
            this.ws.onmessage = async (event) => {
                try {
                    const message = JSON.parse(event.data);
                    await this._handleSignalingMessage(message);
                } catch (error) {
                    console.error("[WebRTC Client] Error handling signaling message:", error);
                }
            };
            
            this.ws.onerror = (error) => {
                console.error("[WebRTC Client] WebSocket error:", error);
                reject(error);
            };
            
            this.ws.onclose = () => {
                console.log("[WebRTC Client] Signaling closed, reconnecting...");
                this.isConnected = false;
                this._scheduleReconnect();
            };
        });
    }

    _scheduleReconnect() {
        if (this.reconnectTimer) return;
        
        const delay = Math.min(1000 * Math.pow(2, this.connectionAttempts), this.maxReconnectDelay);
        this.connectionAttempts++;
        
        console.log(`[WebRTC Client] Scheduling reconnect in ${delay}ms (attempt ${this.connectionAttempts})`);
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this._connectSignaling().catch(err => {
                console.error("[WebRTC Client] Reconnect failed:", err);
            });
        }, delay);
    }

    /**
     * Gère les messages de signalisation
     */
    async _handleSignalingMessage(message) {
        switch (message.type) {
            case 'server-ready':
                // Le serveur est prêt, créer l'offre
                await this._createOffer();
                break;
            case 'answer':
                await this._handleAnswer(message.answer);
                break;
            case 'ice-candidate':
                await this._handleIceCandidate(message.candidate);
                break;
        }
    }

    /**
     * Crée l'offre WebRTC (pattern : client crée l'offre)
     */
    async _createOffer() {
        console.log("[WebRTC Client] Server ready, creating offer");
        
        // Nettoyer toute connexion existante
        this._cleanupConnection();
        
        // Créer une nouvelle RTCPeerConnection
        this.pc = createPeerConnection(RTCPeerConnection);
        
        // Créer le data channel (côté client)
        this.dataChannel = this.pc.createDataChannel('lansuperv', { ordered: true });
        this._setupDataChannel(this.dataChannel);

        // Configurer les handlers
        setupPeerConnectionHandlers(
            this.pc,
            (candidate) => {
                // Envoyer les candidats ICE au serveur
                if (this.ws?.readyState === WebSocket.OPEN) {
                    this.ws.send(JSON.stringify({ type: 'ice-candidate', candidate }));
                }
            },
            (iceState) => {
                console.log(`[WebRTC Client] ICE state: ${iceState}`);
                if (iceState === 'failed') {
                    console.error("[WebRTC Client] ICE failed, reconnecting...");
                    this._cleanupConnection();
                    this._scheduleReconnect();
                }
            },
            (connectionState) => {
                console.log(`[WebRTC Client] Connection state: ${connectionState}`);
                this.isConnected = (connectionState === 'connected');
                
                if (connectionState === 'connected') {
                    console.log("[WebRTC Client] ✅ Connected!");
                } else if (connectionState === 'failed' || connectionState === 'disconnected') {
                    console.log(`[WebRTC Client] Connection ${connectionState}, reconnecting...`);
                    this._cleanupConnection();
                    this._scheduleReconnect();
                }
            }
        );

        try {
            // Créer et envoyer l'offre
            const offer = await createOffer(this.pc);
            
            if (this.ws?.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({ type: 'offer', offer }));
            } else {
                console.error("[WebRTC Client] WebSocket not open, cannot send offer");
                this._cleanupConnection();
            }
        } catch (error) {
            console.error("[WebRTC Client] Error creating offer:", error);
            this._cleanupConnection();
            this._scheduleReconnect();
        }
    }

    /**
     * Gère la réponse du serveur
     */
    async _handleAnswer(answer) {
        console.log("[WebRTC Client] Received answer from server");
        
        if (!this.pc) {
            console.warn("[WebRTC Client] Received answer but no peer connection exists");
            return;
        }
        
        try {
            await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
            // Appliquer les candidats ICE en attente
            await applyPendingIceCandidates(this.pc, this.pendingIceCandidates, RTCIceCandidate, "[WebRTC Client]");
        } catch (error) {
            console.error("[WebRTC Client] Error setting remote description:", error);
            this._cleanupConnection();
            this._scheduleReconnect();
        }
    }

    async _handleIceCandidate(candidate) {
        await addIceCandidate(this.pc, candidate, RTCIceCandidate, this.pendingIceCandidates, "[WebRTC Client]");
    }

    _setupDataChannel(dataChannel) {
        console.log(`[WebRTC Client] Data channel created: ${dataChannel.label}`);
        
        dataChannel.onopen = () => {
            console.log("[WebRTC Client] Data channel open");
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
        
        dataChannel.onerror = (error) => {
            console.error("[WebRTC Client] Data channel error:", error);
        };
        
        dataChannel.onclose = () => {
            console.log("[WebRTC Client] Data channel closed");
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
        
        return new WebRTCNode(this, tableName);
    }
}

class WebRTCNode {
    constructor(client, table) {
        this.client = client;
        this.table = table;
        this.id = null;
    }

    get(id) {
        const node = new WebRTCNode(this.client, this.table);
        node.id = id;
        return node;
    }

    put(data) {
        if (this.id && this.table) {
            if (this.table === 'computers') {
                this.client.localData.computers.set(this.id, data);
            } else if (this.table === 'messages') {
                this.client.localData.messages.set(this.id, data);
            }
            
            // Envoyer au serveur
            if (this.client.dataChannel?.readyState === 'open') {
                this.client.dataChannel.send(JSON.stringify({ 
                    type: 'update', 
                    table: this.table, 
                    id: this.id, 
                    data 
                }));
            }
            
            // Notifier les listeners
            this.client._notifyListeners(this.table, this.id, data);
        }
        return this;
    }

    map() {
        return {
            on: (callback) => {
                if (!this.client.listeners[this.table]) {
                    this.client.listeners[this.table] = new Map();
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

    on(callback) {
        if (this.id && this.table) {
            if (!this.client.listeners[this.table].has(this.id)) {
                this.client.listeners[this.table].set(this.id, new Set());
            }
            this.client.listeners[this.table].get(this.id).add(callback);
            
            const dataMap = this.table === 'computers' 
                ? this.client.localData.computers 
                : this.client.localData.messages;
            const data = dataMap.get(this.id);
            if (data) {
                callback(data, this.id);
            }
        }
        return this;
    }
}
