let F = require('./functions.js'); //FONCTIONS
let G = null; //GLOBALS

//LIBRARIES:
const { RTCPeerConnection, RTCSessionDescription, RTCIceCandidate } = require('wrtc');
const Bonjour = require('bonjour');
const EventEmitter = require('events');
const Crypto = require('crypto');
const Http = require('http');

/**
 * WebRTCManager : Gère les connexions P2P WebRTC entre instances Node.js
 * Remplace Gun.js pour la synchronisation de données entre serveurs
 */
class ServerWebRTCManager extends EventEmitter {

    constructor(G_ref) {
        super();
        G = G_ref;
        
        this.peers = new Map(); // Map<peerId, RTCPeerConnection>
        this.dataChannels = new Map(); // Map<peerId, RTCDataChannel>
        this.localData = {
            computers: new Map(), // Map<idPC, pcData>
            messages: new Map()  // Map<messageId, messageData>
        };
        this.pendingOffers = new Map(); // Map<peerId, offer>
        this.discoveredServices = new Set(); // Set<peerId> pour éviter les doublons
        this.bonjour = null;
        this.service = null;
        this.isInitialized = false;
    }

    /**
     * Initialise le gestionnaire WebRTC
     */
    init() {
        if (this.isInitialized) {
            console.log("[WebRTC] Already initialized");
            return;
        }

        console.log("[WebRTC] Initializing WebRTC manager...");
        
        // Initialiser Bonjour pour la découverte de services
        this.bonjour = Bonjour();
        
        // Publier ce service sur le réseau local
        const serviceName = `lansuperv-${G.THIS_PC.idPC || Crypto.randomBytes(4).toString('hex')}`;
        const port = G.CONFIG.val('SERVER_PORT');
        
        this.service = this.bonjour.publish({
            name: serviceName,
            type: 'lansuperv',
            port: port,
            txt: {
                idPC: G.THIS_PC.idPC || '',
                hostname: G.THIS_PC.hostnameLocal || '',
                lanIP: G.THIS_PC.lanInterface?.ip_address || ''
            }
        });

        console.log(`[WebRTC] Service published: ${serviceName} on port ${port}`);

        // Découvrir les autres services LanSuperv sur le réseau
        this.browser = this.bonjour.find({ type: 'lansuperv' }, (service) => {
            this._onServiceDiscovered(service);
        });

        this.browser.on('up', (service) => {
            this._onServiceDiscovered(service);
        });

        // Monitoring périodique des connexions 
        this.monitoringInterval = setInterval(() => {
            this._logConnectionStats();
        }, 60000); // toutes les 60 secondes

        this.isInitialized = true;
        console.log("[WebRTC] WebRTC manager initialized");
    }

    /**
     * Appelé quand un service LanSuperv est découvert sur le réseau
     */
    _onServiceDiscovered(service) {
        // Extraire l'idPC du service (peut être dans txt.idPC ou extrait du nom)
        const serviceIdPC = service.txt?.idPC;
        const serviceName = service.name;
        
        // Si le nom du service commence par "lansuperv-", extraire l'idPC
        let peerIdPC = serviceIdPC;
        if (!peerIdPC || peerIdPC === '') {
            if (serviceName.startsWith('lansuperv-')) {
                peerIdPC = serviceName.replace('lansuperv-', '');
            } else {
                peerIdPC = serviceName;
            }
        }

        // Ignorer notre propre service (une seule fois)
        if (peerIdPC === G.THIS_PC.idPC) {
            if (!this.discoveredServices.has(peerIdPC)) {
                console.log(`[WebRTC] Ignoring own service - peerIdPC: ${peerIdPC}, THIS_PC.idPC: ${G.THIS_PC.idPC}`);
                this.discoveredServices.add(peerIdPC);
            }
            return;
        }

        // Éviter de traiter le même service plusieurs fois
        if (this.discoveredServices.has(peerIdPC)) {
            return;
        }
        this.discoveredServices.add(peerIdPC);

        const peerIP = service.txt?.lanIP || service.host;
        const peerPort = service.port;
        const peerHostname = service.txt?.hostname || serviceName;

        console.log(`[WebRTC] Service discovered: ${serviceName} at ${peerIP}:${peerPort} (idPC: ${peerIdPC}, serviceIdPC: ${serviceIdPC})`);

        // Émettre un événement pour que le scanner réseau traite cette découverte
        this.emit('pcDiscovered', {
            idPC: peerIdPC,
            hostname: peerHostname,
            lanIP: peerIP,
            lanMAC: null, // MAC non disponible via Bonjour, sera récupérée lors du onePcScan si possible
            port: peerPort
        });

        // Éviter les connexions en double
        if (this.peers.has(peerIdPC)) {
            console.log(`[WebRTC] Already connected to ${peerIdPC}`);
            return;
        }

        // Créer une connexion WebRTC avec ce peer
        this._createPeerConnection(peerIdPC, peerIP, peerPort);
    }

    /**
     * Crée une connexion WebRTC avec un peer
     */
    _createPeerConnection(peerId, peerIP, peerPort) {
        console.log(`[WebRTC] Creating peer connection to ${peerId} (${peerIP}:${peerPort})`);

        // Configuration WebRTC optimisée pour Docker
        // Dans Docker, on utilise les noms de service pour la connectivité
        const pc = new RTCPeerConnection({
            iceServers: [
                // STUN pour découvrir l'adresse publique (peut ne pas fonctionner dans Docker)
                { urls: 'stun:stun.l.google.com:19302' }
            ],
            // Forcer l'utilisation de candidats host (adresses locales)
            iceCandidatePoolSize: 0
        });

        // Créer un data channel pour échanger des données
        const dataChannel = pc.createDataChannel('lansuperv', {
            ordered: true
        });

        this._setupDataChannel(dataChannel, peerId);

        // Gérer les candidats ICE
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                console.log(`[WebRTC] ICE candidate from ${peerId}:`, event.candidate.candidate);
                // Envoyer le candidat au peer via HTTP (car on n'a pas encore de connexion WebRTC)
                this._sendIceCandidate(peerId, peerIP, peerPort, event.candidate);
            } else {
                console.log(`[WebRTC] All ICE candidates gathered for ${peerId}`);
            }
        };
        
        // Gérer les erreurs ICE
        pc.oniceconnectionstatechange = () => {
            console.log(`[WebRTC] ICE connection state with ${peerId}: ${pc.iceConnectionState}`);
        };
        
        pc.onicegatheringstatechange = () => {
            console.log(`[WebRTC] ICE gathering state with ${peerId}: ${pc.iceGatheringState}`);
        };

        // Gérer la connexion établie
        pc.onconnectionstatechange = () => {
            console.log(`[WebRTC] Connection state with ${peerId}: ${pc.connectionState}`);
            if (pc.connectionState === 'connected') {
                this.emit('peerConnected', peerId);
            } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
                this._cleanupPeer(peerId);
            }
        };

        // Créer une offre
        pc.createOffer()
            .then(offer => {
                return pc.setLocalDescription(offer);
            })
            .then(() => {
                // Envoyer l'offre au peer via HTTP
                return this._sendOffer(peerId, peerIP, peerPort, pc.localDescription);
            })
            .catch(error => {
                console.error(`[WebRTC] Error creating offer for ${peerId}:`, error);
            });

        this.peers.set(peerId, pc);
        this.pendingOffers.set(peerId, { peerIP, peerPort });
    }

    /**
     * Configure un data channel
     */
    _setupDataChannel(dataChannel, peerId) {
        dataChannel.onopen = () => {
            console.log(`[WebRTC] Data channel opened with ${peerId}`);
            this.dataChannels.set(peerId, dataChannel);
            
            // Synchroniser les données initiales
            this._syncInitialData(peerId);
        };

        dataChannel.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                this._handlePeerMessage(peerId, message);
            } catch (error) {
                console.error(`[WebRTC] Error parsing message from ${peerId}:`, error);
            }
        };

        dataChannel.onerror = (error) => {
            console.error(`[WebRTC] Data channel error with ${peerId}:`, error);
        };

        dataChannel.onclose = () => {
            console.log(`[WebRTC] Data channel closed with ${peerId}`);
            this.dataChannels.delete(peerId);
        };
    }

    /**
     * Envoie une offre SDP au peer via HTTP
     */
    _sendOffer(peerId, peerIP, peerPort, offer) {
        return new Promise((resolve, reject) => {
            const postData = JSON.stringify({
                from: G.THIS_PC.idPC,
                offer: offer
            });

            const options = {
                hostname: peerIP,
                port: peerPort,
                path: '/webrtc/offer',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData)
                }
            };

            const req = Http.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => {
                    data += chunk;
                });
                res.on('end', () => {
                    if (res.statusCode === 200) {
                        try {
                            const answer = JSON.parse(data);
                            const pc = this.peers.get(peerId);
                            if (pc) {
                                pc.setRemoteDescription(new RTCSessionDescription(answer.answer))
                                    .then(() => resolve())
                                    .catch(reject);
                            } else {
                                resolve();
                            }
                        } catch (error) {
                            reject(error);
                        }
                    } else {
                        reject(new Error(`HTTP ${res.statusCode}`));
                    }
                });
            });

            req.on('error', reject);
            req.write(postData);
            req.end();
        });
    }

    /**
     * Envoie un candidat ICE au peer via HTTP
     */
    _sendIceCandidate(peerId, peerIP, peerPort, candidate) {
        const postData = JSON.stringify({
            from: G.THIS_PC.idPC,
            candidate: candidate
        });

        const options = {
            hostname: peerIP,
            port: peerPort,
            path: '/webrtc/ice-candidate',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = Http.request(options, () => {
            // Ignorer la réponse
        });

        req.on('error', () => {
            // Ignorer les erreurs silencieusement (le peer peut ne pas être prêt)
        });
        req.write(postData);
        req.end();
    }

    /**
     * Synchronise les données initiales avec un nouveau peer
     */
    _syncInitialData(peerId) {
        // Envoyer toutes les données computers
        this.localData.computers.forEach((pcData, idPC) => {
            this._sendUpdate('computers', idPC, pcData, peerId);
        });

        // Envoyer les messages récents (optionnel)
        // this.localData.messages.forEach((msgData, msgId) => {
        //     this._sendUpdate('messages', msgId, msgData, peerId);
        // });
    }

    /**
     * Gère les messages reçus d'un peer
     */
    _handlePeerMessage(peerId, message) {
        switch (message.type) {
            case 'update':
                this._handleUpdate(peerId, message.table, message.id, message.data);
                break;
            case 'delete':
                this._handleDelete(peerId, message.table, message.id);
                break;
            default:
                console.log(`[WebRTC] Unknown message type from ${peerId}:`, message.type);
        }
    }

    /**
     * Gère une mise à jour de données d'un peer
     */
    _handleUpdate(peerId, table, id, data) {
        if (table === 'computers') {
            // Mettre à jour les données localement
            this.localData.computers.set(id, data);
            
            // Émettre un événement pour que le reste de l'application soit notifié
            this.emit('dataUpdate', { table, id, data });
        } else if (table === 'messages') {
            this.localData.messages.set(id, data);
            this.emit('dataUpdate', { table, id, data });
        }
    }

    /**
     * Gère une suppression de données d'un peer
     */
    _handleDelete(peerId, table, id) {
        if (table === 'computers') {
            this.localData.computers.delete(id);
        } else if (table === 'messages') {
            this.localData.messages.delete(id);
        }
        this.emit('dataDelete', { table, id });
    }

    /**
     * Envoie une mise à jour à tous les peers connectés
     */
    _sendUpdate(table, id, data, targetPeerId = null) {
        const message = {
            type: 'update',
            table: table,
            id: id,
            data: data
        };

        if (targetPeerId) {
            // Envoyer à un peer spécifique
            const dataChannel = this.dataChannels.get(targetPeerId);
            if (dataChannel && dataChannel.readyState === 'open') {
                dataChannel.send(JSON.stringify(message));
            }
        } else {
            // Diffuser à tous les peers
            this.dataChannels.forEach((dataChannel, peerId) => {
                if (dataChannel.readyState === 'open') {
                    dataChannel.send(JSON.stringify(message));
                }
            });
        }
    }

    /**
     * Nettoie les ressources d'un peer
     */
    _cleanupPeer(peerId) {
        const pc = this.peers.get(peerId);
        if (pc) {
            pc.close();
        }
        this.peers.delete(peerId);
        this.dataChannels.delete(peerId);
        this.pendingOffers.delete(peerId);
    }

    /**
     * Affiche les statistiques des connexions qui pourraient être nettoyées
     */
    _logConnectionStats() {
        const stats = {
            total: this.peers.size,
            connected: 0,
            connecting: 0,
            disconnected: 0,
            failed: 0,
            closed: 0,
            new: 0,
            iceFailed: 0,
            withoutDataChannel: 0,
            stalePendingOffers: 0
        };

        for (const [peerId, pc] of this.peers.entries()) {
            // Compter par état de connexion
            const state = pc.connectionState;
            if (state === 'connected') stats.connected++;
            else if (state === 'connecting') stats.connecting++;
            else if (state === 'disconnected') stats.disconnected++;
            else if (state === 'failed') stats.failed++;
            else if (state === 'closed') stats.closed++;
            else if (state === 'new') stats.new++;

            // Compter les échecs ICE
            if (pc.iceConnectionState === 'failed') {
                stats.iceFailed++;
            }

            // Compter les connexions sans data channel
            if (!this.dataChannels.has(peerId) && state !== 'new') {
                stats.withoutDataChannel++;
            }
        }

        // Compter les offres en attente sans connexion correspondante
        for (const [peerId] of this.pendingOffers.entries()) {
            if (!this.peers.has(peerId)) {
                stats.stalePendingOffers++;
            }
        }

        // Afficher seulement s'il y a des connexions problématiques
        const problematicCount = stats.failed + stats.disconnected + stats.iceFailed + 
                                stats.withoutDataChannel + stats.stalePendingOffers + 
                                (stats.connecting > 0 && stats.connecting > 5 ? stats.connecting : 0);

        if (problematicCount > 0 || stats.total > 0) {
            console.log(`[WebRTC] Statistiques des connexions:`);
            console.log(`  Total: ${stats.total} | Connectées: ${stats.connected}`);
            if (stats.failed > 0) {
                console.log(`  ⚠️  État 'failed': ${stats.failed} connexion(s) à nettoyer`);
            }
            if (stats.disconnected > 0) {
                console.log(`  ⚠️  État 'disconnected': ${stats.disconnected} connexion(s) à nettoyer`);
            }
            if (stats.iceFailed > 0) {
                console.log(`  ⚠️  ICE 'failed': ${stats.iceFailed} connexion(s) à nettoyer`);
            }
            if (stats.withoutDataChannel > 0) {
                console.log(`  ⚠️  Sans data channel: ${stats.withoutDataChannel} connexion(s) à nettoyer`);
            }
            if (stats.stalePendingOffers > 0) {
                console.log(`  ⚠️  Offres en attente orphelines: ${stats.stalePendingOffers} à nettoyer`);
            }
            if (stats.connecting > 5) {
                console.log(`  ⚠️  En cours de connexion (>5): ${stats.connecting} connexion(s) (possible surcharge)`);
            }
            if (stats.new > 0) {
                console.log(`  ℹ️  État 'new': ${stats.new} connexion(s) en attente`);
            }
        }
    }

    /**
     * Sauvegarde des données dans la "base de données" locale et synchronise avec les peers
     */
    saveData(table, id, data) {
        // Sauvegarder localement
        if (table === 'computers') {
            this.localData.computers.set(id, data);
        } else if (table === 'messages') {
            this.localData.messages.set(id, data);
        }

        // Synchroniser avec tous les peers
        this._sendUpdate(table, id, data);

        // Émettre un événement local
        this.emit('dataUpdate', { table, id, data });
    }

    /**
     * Supprime des données et synchronise avec les peers
     */
    deleteData(table, id) {
        if (table === 'computers') {
            this.localData.computers.delete(id);
        } else if (table === 'messages') {
            this.localData.messages.delete(id);
        }

        // Diffuser la suppression
        const message = {
            type: 'delete',
            table: table,
            id: id
        };

        this.dataChannels.forEach((dataChannel) => {
            if (dataChannel.readyState === 'open') {
                dataChannel.send(JSON.stringify(message));
            }
        });

        this.emit('dataDelete', { table, id });
    }

    /**
     * Récupère toutes les données d'une table
     */
    getAllData(table) {
        if (table === 'computers') {
            return new Map(this.localData.computers);
        } else if (table === 'messages') {
            return new Map(this.localData.messages);
        }
        return new Map();
    }

    /**
     * Gère une offre WebRTC reçue d'un autre peer
     */
    async handleOffer(from, offer) {
        // Vérifier si on a déjà une connexion avec ce peer
        if (this.peers.has(from)) {
            console.log(`[WebRTC] Already have connection with ${from}, closing old one`);
            this._cleanupPeer(from);
        }

        // Configuration WebRTC optimisée pour Docker
        const pc = new RTCPeerConnection({
            iceServers: [
                // STUN pour découvrir l'adresse publique (peut ne pas fonctionner dans Docker)
                { urls: 'stun:stun.l.google.com:19302' }
            ],
            // Forcer l'utilisation de candidats host (adresses locales)
            iceCandidatePoolSize: 0
        });

        // Écouter les data channels créés par le peer distant
        // Les data channels WebRTC sont bidirectionnels, donc l'answerer ne doit
        // que écouter le canal créé par l'offerer, pas en créer un second
        pc.ondatachannel = (event) => {
            const dataChannel = event.channel;
            this._setupDataChannel(dataChannel, from);
        };

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                console.log(`[WebRTC] ICE candidate to ${from}:`, event.candidate.candidate);
                // Trouver l'IP du peer depuis les pendingOffers ou utiliser une méthode alternative
                const pending = this.pendingOffers.get(from);
                if (pending) {
                    this._sendIceCandidate(from, pending.peerIP, pending.peerPort, event.candidate);
                }
            } else {
                console.log(`[WebRTC] All ICE candidates gathered for ${from}`);
            }
        };
        
        // Gérer les erreurs ICE
        pc.oniceconnectionstatechange = () => {
            console.log(`[WebRTC] ICE connection state with ${from}: ${pc.iceConnectionState}`);
        };
        
        pc.onicegatheringstatechange = () => {
            console.log(`[WebRTC] ICE gathering state with ${from}: ${pc.iceGatheringState}`);
        };

        pc.onconnectionstatechange = () => {
            console.log(`[WebRTC] Connection state with ${from}: ${pc.connectionState}`);
            if (pc.connectionState === 'connected') {
                this.emit('peerConnected', from);
            } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
                this._cleanupPeer(from);
            }
        };

        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        
        // Appliquer les candidats ICE en attente si disponibles
        if (this.pendingIceCandidates && this.pendingIceCandidates.has(from)) {
            const pendingCandidates = this.pendingIceCandidates.get(from);
            console.log(`[WebRTC] Applying ${pendingCandidates.length} pending ICE candidates for ${from}`);
            for (const candidate of pendingCandidates) {
                try {
                    await pc.addIceCandidate(new RTCIceCandidate(candidate));
                } catch (error) {
                    console.error(`[WebRTC] Error adding pending ICE candidate:`, error);
                }
            }
            this.pendingIceCandidates.delete(from);
        }

        this.peers.set(from, pc);

        return answer;
    }

    /**
     * Gère un candidat ICE reçu d'un autre peer
     */
    handleIceCandidate(from, candidate) {
        console.log(`[WebRTC] Received ICE candidate from ${from}:`, candidate.candidate);
        const pc = this.peers.get(from);
        if (pc && pc.remoteDescription) {
            pc.addIceCandidate(new RTCIceCandidate(candidate))
                .then(() => {
                    console.log(`[WebRTC] Successfully added ICE candidate from ${from}`);
                })
                .catch(error => {
                    console.error(`[WebRTC] Error adding ICE candidate from ${from}:`, error);
                });
        } else {
            console.log(`[WebRTC] Storing ICE candidate from ${from} for later (connection not ready)`);
            // Stocker le candidat pour plus tard si la connexion n'est pas encore prête
            if (!this.pendingIceCandidates) {
                this.pendingIceCandidates = new Map();
            }
            if (!this.pendingIceCandidates.has(from)) {
                this.pendingIceCandidates.set(from, []);
            }
            this.pendingIceCandidates.get(from).push(candidate);
        }
    }

    /**
     * Nettoie les ressources
     */
    destroy() {
        // Arrêter le monitoring
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }

        if (this.service) {
            this.bonjour.unpublishAll(() => {});
        }
        if (this.browser) {
            this.browser.stop();
        }
        this.peers.forEach((pc, peerId) => {
            this._cleanupPeer(peerId);
        });
        if (this.bonjour) {
            this.bonjour.destroy();
        }
    }
}

module.exports = ServerWebRTCManager;
