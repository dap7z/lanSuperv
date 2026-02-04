# Système de Plugins LanSuperv

LanSuperv utilise un système de plugins modulaire permettant d'étendre simplement ses capacités sans modifier le cœur de l'application. Chaque plugin s'exécute dans un processus enfant (Child Process) isolé.

## Structure des Plugins

Les plugins sont situés dans le dossier `back/plugins/` et sont classés en deux catégories :

1.  **`remote-requests/`** : Plugins exécutés par le serveur pour agir sur une machine distante (ex: Wake-on-LAN).
2.  **`local-responses/`** : Plugins exécutés par l'agent local (sur la machine cible) en réponse à une commande reçue (ex: Shutdown).

### Organisation des fichiers
Chaque plugin est un dossier portant le nom de la commande (ex: `wol`, `power-off`) contenant au minimum :
*   **`execute.js`** : Le point d'entrée du script Node.js.
*   *(Optionnel)* `package.json` : Si le plugin a des dépendances spécifiques.
*   *(Optionnel)* Autres scripts ou ressources nécessaires.

## Fonctionnement Technique

Lorsqu'un événement survient (demande HTTP ou message Gun.js), `serverEventHandler.js` détermine le plugin à appeler et lance `execute.js` via `child_process.fork()`.

### Communication Parent <-> Enfant

La communication se fait via le mécanisme IPC (Inter-Process Communication) natif de Node.js :

*   **Entrée** : Le processus parent envoie un objet `eventParams` via `process.send()`.
*   **Sortie** : Le plugin renvoie des messages (logs ou résultat final) au parent via `process.send()`.

### Objet `eventParams`
L'objet reçu par le plugin contient généralement :
*   `eventName` : Nom de l'événement (ex: 'wol').
*   `pcTargetLanMAC` : Adresse MAC de la cible.
*   `pcTargetLanIP` : Adresse IP de la cible.
*   `eventFrom` : Source de l'événement ('http' ou 'socket').

## Créer un Nouveau Plugin

Pour créer un plugin (ex: `hello-world`), suivez ces étapes :

1.  **Créer le dossier** :
    ```bash
    mkdir back/plugins/local-responses/hello-world
    ```

2.  **Créer le script `execute.js`** :
    ```javascript
    // back/plugins/local-responses/hello-world/execute.js
    
    // 1. Écouter le message de démarrage
    process.on('message', (eventParams) => {
        
        // 2. Notifier le parent du démarrage
        process.send('start');
    
        try {
            console.log("Hello World! Received params:", eventParams);
    
            // ... Votre logique ici ...
            // var result = maFonction(eventParams);
    
            // 3. Renvoyer le résultat (objet ou string)
            process.send({ msg: "Action completed successfully" });
            
            // 4. (Optionnel) Signaler la fin explicite si le parent attend 'done'
            // process.send('done'); 
    
        } catch (e) {
            console.error("Error in hello-world plugin:", e);
            // 5. Signaler l'échec
            process.send('fail');
        }
    });
    ```

3.  **Tester** :
    *   Redémarrer LanSuperv (les plugins sont chargés au démarrage).
    *   Appeler le plugin via HTTP : `http://localhost:842/cmd/hello-world`
    *   Ou via l'interface web.

## Bonnes Pratiques

*   **Isolation** : Gérez les erreurs avec des blocs `try/catch` pour éviter de crasher le processus enfant silencieusement.
*   **Logs** : Utilisez `console.log` pour le débogage (les logs sont capturés par le processus parent).
*   **Dépendances** : Si votre plugin nécessite des modules NPM, installez-les à la racine du projet ou gérez un `node_modules` local au plugin (plus complexe).
