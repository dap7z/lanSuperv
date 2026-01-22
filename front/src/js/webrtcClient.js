/**
 * WebRTCClient : Gère les connexions WebRTC côté client
 * Remplace Gun.js pour la synchronisation de données avec le serveur
 */
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
        console.log("[WebRTC Client] Initializing WebRTC connection...");
        
        // Établir la connexion WebSocket pour la signalisation
        await this._connectSignaling();
    }

    /**
     * Établit la connexion WebSocket pour la signalisation
     */
    _connectSignaling() {
        return new Promise((resolve, reject) => {
            const wsUrl = `${this.serverUrl}/webrtc-signaling`;
            console.log("[WebRTC Client] Connecting to signaling server:", wsUrl);
            
            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = () => {
                console.log("[WebRTC Client] Signaling WebSocket connected");
                this._requestOffer();
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
                console.log("[WebRTC Client] WebSocket closed, reconnecting...");
                this.isConnected = false;
                // Reconnexion automatique après 3 secondes
                setTimeout(() => this._connectSignaling(), 3000);
            };

            // Résoudre après un court délai pour permettre l'établissement de la connexion
            setTimeout(() => resolve(), 100);
        });
    }

    /**
     * Demande une offre WebRTC au serveur
     */
    _requestOffer() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'request-offer' }));
        }
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
        
        this.pc = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' }
            ]
        });

        // Écouter les data channels créés par le serveur
        this.pc.ondatachannel = (event) => {
            this._setupDataChannel(event.channel);
        };

        // Gérer les candidats ICE
        this.pc.onicecandidate = (event) => {
            if (event.candidate && this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({
                    type: 'ice-candidate',
                    candidate: event.candidate
                }));
            }
        };

        // Gérer les changements d'état de connexion
        this.pc.onconnectionstatechange = () => {
            console.log("[WebRTC Client] Connection state:", this.pc.connectionState);
            this.isConnected = (this.pc.connectionState === 'connected');
            if (this.pc.connectionState === 'disconnected' || this.pc.connectionState === 'failed') {
                console.log("[WebRTC Client] Connection lost, reconnecting...");
                this._connectSignaling();
            }
        };

        await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);

        // Envoyer la réponse au serveur
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'answer',
                answer: answer
            }));
        }
    }

    /**
     * Gère une réponse WebRTC (ne devrait pas arriver côté client, mais au cas où)
     */
    async _handleAnswer(answer) {
        if (this.pc && this.pc.signalingState !== 'stable') {
            await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
        }
    }

    /**
     * Gère un candidat ICE
     */
    async _handleIceCandidate(candidate) {
        if (this.pc && this.pc.remoteDescription) {
            await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
    }

    /**
     * Configure un data channel
     */
    _setupDataChannel(dataChannel) {
        console.log("[WebRTC Client] Data channel received:", dataChannel.label);
        
        dataChannel.onopen = () => {
            console.log("[WebRTC Client] Data channel opened");
            this.dataChannel = dataChannel;
            this.isConnected = true;
            // Demander les données initiales
            this._requestInitialData();
        };

        dataChannel.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                this._handleDataMessage(message);
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

    /**
     * Demande les données initiales au serveur
     */
    _requestInitialData() {
        if (this.dataChannel && this.dataChannel.readyState === 'open') {
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
        if (table === 'computers') {
            this.localData.computers.set(id, data);
            this._notifyListeners('computers', id, data);
        } else if (table === 'messages') {
            this.localData.messages.set(id, data);
            this._notifyListeners('messages', id, data);
        }
    }

    /**
     * Gère une suppression de données
     */
    _handleDelete(table, id) {
        if (table === 'computers') {
            this.localData.computers.delete(id);
        } else if (table === 'messages') {
            this.localData.messages.delete(id);
        }
        this._notifyListeners(table, id, null);
    }

    /**
     * Gère les données initiales
     */
    _handleInitialData(data) {
        if (data.computers) {
            Object.entries(data.computers).forEach(([id, pc]) => {
                this.localData.computers.set(id, pc);
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
        console.log(`[WebRTC Client] get(${table}) -> tableName: ${tableName}`);
        return new WebRTCNode(this, tableName);
    }

    /**
     * Envoie une mise à jour au serveur
     */
    _sendUpdate(table, id, data) {
        if (this.dataChannel && this.dataChannel.readyState === 'open') {
            this.dataChannel.send(JSON.stringify({
                type: 'update',
                table: table,
                id: id,
                data: data
            }));
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
