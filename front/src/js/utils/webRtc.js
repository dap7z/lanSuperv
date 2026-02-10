/**
 * Utilitaires WebRTC partagés entre client et serveur
 * Compatible avec les APIs natives du navigateur et le package 'wrtc' de Node.js
 * 
 * ⚠️ CODE SOURCE COMMUN AVEC LE BACK : lanSuperv\back\utils\webRtc.js
 */

/**
 * Crée une configuration RTCPeerConnection standard
 */
export function createWebRTCConfig() {
    return {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' }
        ],
        iceCandidatePoolSize: 0
    };
}

/**
 * Crée une nouvelle RTCPeerConnection avec la configuration standard
 * @param {RTCPeerConnection} RTCPeerConnectionClass - La classe RTCPeerConnection (native ou wrtc)
 * @returns {RTCPeerConnection} Une nouvelle instance de RTCPeerConnection
 */
export function createPeerConnection(RTCPeerConnectionClass) {
    return new RTCPeerConnectionClass(createWebRTCConfig());
}

/**
 * Configure les handlers ICE pour une RTCPeerConnection
 * @param {RTCPeerConnection} pc - La RTCPeerConnection à configurer
 * @param {Function} onIceCandidate - Callback appelé quand un candidat ICE est disponible
 * @param {Function} onIceConnectionStateChange - Callback appelé quand l'état ICE change
 * @param {Function} onConnectionStateChange - Callback appelé quand l'état de connexion change
 */
export function setupPeerConnectionHandlers(pc, onIceCandidate, onIceConnectionStateChange, onConnectionStateChange) {
    // Handler pour les candidats ICE
    if (onIceCandidate) {
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                onIceCandidate(event.candidate);
            } else {
                console.log('[WebRTC Utils] All ICE candidates gathered');
            }
        };
    }

    // Handler pour les changements d'état ICE
    if (onIceConnectionStateChange) {
        pc.oniceconnectionstatechange = () => {
            if (!pc) return; // Vérifier que pc n'est pas null
            onIceConnectionStateChange(pc.iceConnectionState);
        };
    }

    // Handler pour les changements d'état de connexion
    if (onConnectionStateChange) {
        pc.onconnectionstatechange = () => {
            if (!pc) return; // Vérifier que pc n'est pas null
            onConnectionStateChange(pc.connectionState);
        };
    }
}

/**
 * Applique les candidats ICE en attente à une RTCPeerConnection
 * @param {RTCPeerConnection} pc - La RTCPeerConnection
 * @param {Array} pendingCandidates - Tableau des candidats ICE en attente
 * @param {RTCIceCandidate} RTCIceCandidateClass - La classe RTCIceCandidate (native ou wrtc)
 * @param {String} logPrefix - Préfixe pour les logs (ex: "[WebRTC Client]" ou "[WebRTC Signaling]")
 * @returns {Promise} Promise résolue quand tous les candidats sont appliqués
 */
export async function applyPendingIceCandidates(pc, pendingCandidates, RTCIceCandidateClass, logPrefix = '[WebRTC Utils]') {
    if (!pc || !pendingCandidates || pendingCandidates.length === 0) {
        return;
    }

    console.log(`${logPrefix} Applying ${pendingCandidates.length} pending ICE candidates`);
    for (const candidate of pendingCandidates) {
        try {
            await pc.addIceCandidate(new RTCIceCandidateClass(candidate));
        } catch (error) {
            console.error(`${logPrefix} Error adding pending ICE candidate:`, error);
        }
    }
}

/**
 * Ajoute un candidat ICE à une RTCPeerConnection ou le stocke en attente
 * @param {RTCPeerConnection} pc - La RTCPeerConnection
 * @param {Object} candidate - Le candidat ICE à ajouter
 * @param {RTCIceCandidate} RTCIceCandidateClass - La classe RTCIceCandidate (native ou wrtc)
 * @param {Array} pendingCandidates - Tableau pour stocker les candidats en attente
 * @param {String} logPrefix - Préfixe pour les logs
 * @returns {Promise} Promise résolue quand le candidat est ajouté ou stocké
 */
export async function addIceCandidate(pc, candidate, RTCIceCandidateClass, pendingCandidates, logPrefix = '[WebRTC Utils]') {
    if (!pc) {
        // Stocker le candidat si la connexion n'existe pas encore
        console.log(`${logPrefix} Storing ICE candidate for later (connection not created yet)`);
        if (pendingCandidates) {
            pendingCandidates.push(candidate);
        }
        return;
    }

    if (pc.remoteDescription) {
        try {
            await pc.addIceCandidate(new RTCIceCandidateClass(candidate));
            console.log(`${logPrefix} Added ICE candidate:`, candidate.candidate?.substring(0, 50) + "...");
        } catch (error) {
            console.error(`${logPrefix} Error adding ICE candidate:`, error);
        }
    } else {
        // Stocker le candidat pour plus tard si la connexion n'est pas encore prête
        console.log(`${logPrefix} Storing ICE candidate for later (remoteDescription not set yet)`);
        if (pendingCandidates) {
            pendingCandidates.push(candidate);
        }
    }
}

/**
 * Crée une offre WebRTC
 * @param {RTCPeerConnection} pc - La RTCPeerConnection
 * @returns {Promise<RTCSessionDescription>} Promise résolue avec l'offre créée
 */
export async function createOffer(pc) {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    return offer;
}

/**
 * Crée une réponse WebRTC à partir d'une offre
 * @param {RTCPeerConnection} pc - La RTCPeerConnection
 * @param {RTCSessionDescription} offer - L'offre reçue
 * @param {RTCSessionDescription} RTCSessionDescriptionClass - La classe RTCSessionDescription (native ou wrtc)
 * @returns {Promise<RTCSessionDescription>} Promise résolue avec la réponse créée
 */
export async function createAnswer(pc, offer, RTCSessionDescriptionClass) {
    await pc.setRemoteDescription(new RTCSessionDescriptionClass(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    return answer;
}

/**
 * Nettoie une connexion WebRTC
 * @param {RTCPeerConnection} pc - La RTCPeerConnection à nettoyer
 * @param {RTCDataChannel} dataChannel - Le data channel à fermer (optionnel)
 * @param {Number} connectionTimeout - Le timeout à annuler (optionnel)
 * @param {Array} pendingCandidates - Le tableau de candidats en attente à vider (optionnel)
 * @returns {Object} État nettoyé avec isConnected: false
 */
export function cleanupConnection(pc, dataChannel = null, connectionTimeout = null, pendingCandidates = null) {
    if (connectionTimeout) {
        clearTimeout(connectionTimeout);
    }
    if (dataChannel) {
        dataChannel.close();
    }
    if (pc) {
        pc.close();
    }
    if (pendingCandidates) {
        pendingCandidates.length = 0;
    }
    return { isConnected: false };
}

if (typeof module !== 'undefined' && module.exports) {
    // necessaire pour le back : 
    module.exports = {
        createWebRTCConfig,
        createPeerConnection,
        setupPeerConnectionHandlers,
        applyPendingIceCandidates,
        addIceCandidate,
        createOffer,
        createAnswer,
        cleanupConnection
    };
}
