# Architecture des Données et Persistance

LanSuperv utilise principalement **Gun.js**, une base de données graphe décentralisée, pour la gestion de l'état en temps réel, couplée à quelques fichiers JSON pour la persistance locale et la configuration.

## 1. Gun.js (base de données décentralisée)

Gun.js est utilisé pour synchroniser l'état entre le serveur et tous les clients connectés (navigateurs).

### Pourquoi Gun.js ?
*   **Temps réel** : Les mises à jour sont poussées (push) vers les clients via WebSockets.
*   **Offline-first** : Tolérance aux coupures réseaux.
*   **Décentralisé** : Permet une architecture où plusieurs serveurs LanSuperv pourraient potentiellement s'échanger des informations (Peers).

### Modèle de Données (Schéma)

Les données sont organisées en nœuds principaux (tables virtuelles) définis dans `config.js` :

#### `TABLE_COMPUTERS`
Stocke l'état de chaque appareil détecté.
*   **Clé** : `idPC` (Identifiant unique calculé à partir de l'adresse MAC).
*   **Champs** :
    *   `hostname` : Nom de l'hôte.
    *   `lanIP` : Adresse IP locale.
    *   `lanMAC` : Adresse MAC.
    *   `machineID` : ID unique de la machine (si l'agent est installé).
    *   `lastCheck` : Date de la dernière vérification.
    *   `respondsTo-ping` (bool) : Répond au Ping.
    *   `respondsTo-http` (bool) : Répond aux requêtes HTTP (agent actif).
    *   `respondsTo-socket` (bool) : Connecté via WebSocket.

#### `TABLE_MESSAGES`
Utilisé pour le chat et l'envoi de commandes asynchrones.
*   **Champs** :
    *   `eventName` : Type d'événement (ex: 'check', 'message').
    *   `eventResult` : Contenu du message ou résultat.
    *   `pcTargetLanMAC` : Cible de la commande.
    *   `who` : Expéditeur.
    *   `eventSendedAt` / `eventReceivedAt` : Horodatage.

## 2. Persistance Locale (`serverDatabase.js`)

En plus de Gun.js (qui peut sauvegarder ses données via l'option `radisk`), le serveur maintient certains états via des fichiers JSON standards.

*   **`visibleComputers.json`** :
    *   Sauvegarde la liste des ordinateurs détectés (`G.VISIBLE_COMPUTERS` Map en mémoire).
    *   Chargé au démarrage du serveur pour restaurer rapidement la connaissance du réseau avant le premier scan.
    *   Permet au serveur de se souvenir des appareils même s'ils sont hors ligne au redémarrage.

*   **Configuration (`config.js`)** :
    *   Fichier JS exportant un objet configuration.
    *   Définit les ports, les chemins, les peers Gun.js, etc.
