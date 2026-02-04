/**
 * Fonctions pour le lancement d'Electron et le système de verrouillage
 */

const path = require('path');
const fs = require('fs');
const Spawn = require('cross-spawn');

/**
 * Vérifie si une instance Electron existe déjà pour ce plugin
 * @param {string} lockFile - Chemin vers le fichier de verrouillage
 * @param {string} pluginName - Nom du plugin (pour les logs)
 * @returns {boolean|string} - true si instance existe, false si aucune, 'launching' si en cours de lancement
 */
function checkExistingInstance(lockFile, pluginName) {
    if (!fs.existsSync(lockFile)) {
        return false;
    }
    
    try {
        const lockData = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
        const now = Date.now();
        const LOCK_TIMEOUT_MS = 60 * 1000; // 1 minute
        
        // Vérifier si le verrou est trop ancien (plus d'une minute)
        if (lockData.timestamp && (now - lockData.timestamp) > LOCK_TIMEOUT_MS) {
            console.log(`[${pluginName}] Verrou trop ancien (${Math.round((now - lockData.timestamp) / 1000)}s), nettoyage...`);
            try {
                fs.unlinkSync(lockFile);
            } catch (e) {
                // Ignorer l'erreur de suppression
            }
            return false; // Verrou expiré, considérer comme inexistant
        }
        
        // Si le fichier indique qu'une instance est en train de se lancer, attendre un peu
        if (lockData.launching) {
            return 'launching';
        }
        
        // Vérifier si le processus existe encore
        if (lockData.pid && lockData.pid > 0) {
            try {
                // Envoyer un signal 0 pour vérifier si le processus existe (ne tue pas le processus)
                process.kill(lockData.pid, 0);
                return true; // Le processus existe
            } catch (e) {
                // Le processus n'existe plus (erreur ESRCH = no such process)
                console.log(`[${pluginName}] Processus ${lockData.pid} n'existe plus, nettoyage du verrou...`);
                try {
                    fs.unlinkSync(lockFile);
                } catch (e2) {
                    // Ignorer l'erreur de suppression
                }
                return false;
            }
        }
        
        return false; // Pas de PID valide
    } catch (e) {
        // Erreur lors de la lecture du fichier, considérer comme inexistant
        console.warn(`[${pluginName}] Erreur lors de la lecture du fichier de verrouillage:`, e.message);
        try {
            fs.unlinkSync(lockFile);
        } catch (e2) {
            // Ignorer l'erreur de suppression
        }
        return false;
    }
}

/**
 * Tue un processus Electron existant de manière synchrone
 * @param {number} pid - PID du processus à tuer
 * @param {string} pluginName - Nom du plugin (pour les logs)
 * @returns {boolean} - true si le processus a été tué, false sinon
 */
function killExistingProcessSync(pid, pluginName) {
    if (!pid || pid <= 0) {
        return false;
    }
    
    try {
        // Vérifier si le processus existe
        process.kill(pid, 0);
        // Le processus existe, le tuer
        console.log(`[${pluginName}] Arrêt du processus Electron existant (PID: ${pid})`);
        try {
            // Essayer SIGTERM d'abord (arrêt gracieux)
            process.kill(pid, 'SIGTERM');
        } catch (e) {
            // Erreur lors de l'envoi du signal, essayer SIGKILL directement
            try {
                process.kill(pid, 'SIGKILL');
            } catch (e2) {
                console.warn(`[${pluginName}] Impossible de tuer le processus ${pid}:`, e2.message);
                return false;
            }
        }
        
        // Attendre que le processus se termine (vérification synchrone avec retry)
        let retries = 0;
        const maxRetries = 20; // 20 tentatives de 100ms = 2 secondes max
        while (retries < maxRetries) {
            try {
                process.kill(pid, 0);
                // Le processus existe encore, attendre
                retries++;
                // Utiliser une boucle synchrone pour attendre (bloquant mais nécessaire)
                const start = Date.now();
                while (Date.now() - start < 100) {
                    // Attendre 100ms
                }
            } catch (e) {
                // Le processus a été arrêté
                console.log(`[${pluginName}] Processus ${pid} arrêté après ${retries} tentatives`);
                return true;
            }
        }
        
        // Si le processus existe encore après maxRetries, forcer l'arrêt
        try {
            console.log(`[${pluginName}] Forçage de l'arrêt du processus (PID: ${pid})`);
            process.kill(pid, 'SIGKILL');
            return true;
        } catch (e) {
            console.warn(`[${pluginName}] Impossible de forcer l'arrêt du processus ${pid}:`, e.message);
            return false;
        }
    } catch (e) {
        // Le processus n'existe plus
        return false;
    }
}

/**
 * Traite le résultat de la vérification d'instance et gère les cas existants
 * @param {boolean|string} checkResult - Résultat de checkExistingInstance
 * @param {string} lockFile - Chemin vers le fichier de verrouillage
 * @param {string} pluginName - Nom du plugin (pour les logs)
 * @param {Function} launchCallback - Fonction à appeler pour lancer Electron si nécessaire
 * @returns {boolean} - true si le cas a été géré, false si on doit continuer
 */
function processInstanceCheck(checkResult, lockFile, pluginName, launchCallback) {
    if (checkResult === true) {
        // Une instance existe déjà, tuer le processus et lancer un nouveau
        try {
            const lockData = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
            const existingPid = lockData.pid;
            
            if (existingPid && existingPid > 0) {
                console.log(`[${pluginName}] Instance existante détectée (PID: ${existingPid}), arrêt avant de lancer une nouvelle instance`);
                killExistingProcessSync(existingPid, pluginName);
                
                // Nettoyer le fichier de verrouillage
                try {
                    if (fs.existsSync(lockFile)) {
                        fs.unlinkSync(lockFile);
                    }
                } catch (e) {
                    // Ignorer l'erreur
                }
                // Lancer une nouvelle instance
                launchCallback();
                return true; // Indique qu'on a géré le cas
            } else {
                // Pas de PID valide, nettoyer et continuer
                try {
                    if (fs.existsSync(lockFile)) {
                        fs.unlinkSync(lockFile);
                    }
                } catch (e) {
                    // Ignorer l'erreur
                }
                return false;
            }
        } catch (e) {
            console.warn(`[${pluginName}] Erreur lors de la lecture du fichier de verrouillage:`, e.message);
            // Nettoyer et continuer
            try {
                if (fs.existsSync(lockFile)) {
                    fs.unlinkSync(lockFile);
                }
            } catch (e2) {
                // Ignorer l'erreur
            }
            return false;
        }
    } else if (checkResult === false) {
        // Nettoyer le fichier de verrouillage obsolète s'il existe
        if (fs.existsSync(lockFile)) {
            try {
                fs.unlinkSync(lockFile);
            } catch (e) {
                // Ignorer l'erreur
            }
        }
        return false; // Continuer le processus
    }
    return false; // 'launching' ou autre, continuer
}

/**
 * Met à jour les options dans le fichier de verrouillage si une instance est en cours de lancement
 * @param {string} lockFile - Chemin vers le fichier de verrouillage
 * @param {Object} eventOptions - Options de l'événement à mettre à jour
 * @param {string} pluginName - Nom du plugin (pour les logs)
 * @param {Function} onSuccess - Fonction à appeler en cas de succès (pour envoyer les messages au parent)
 * @returns {boolean} - true si les options ont été mises à jour, false sinon
 */
function updateOptionsIfLaunching(lockFile, eventOptions, pluginName, onSuccess) {
    try {
        const lockData = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
        lockData.options = eventOptions;
        lockData.timestamp = Date.now();
        fs.writeFileSync(lockFile, JSON.stringify(lockData), 'utf8');
        console.log(`[${pluginName}] Instance en cours de lancement détectée, options mises à jour dans le fichier de verrouillage`);
        if (onSuccess) {
            onSuccess();
        }
        return true;
    } catch (e) {
        console.warn(`[${pluginName}] Erreur lors de la mise à jour des options:`, e.message);
        return false;
    }
}

/**
 * Crée ou met à jour le fichier de verrouillage avec les options
 * @param {string} lockFile - Chemin vers le fichier de verrouillage
 * @param {Object} eventOptions - Options de l'événement
 * @param {string} pluginName - Nom du plugin (pour les logs)
 * @param {boolean} launching - Si true, ajoute le flag launching
 * @returns {boolean} - true si le fichier a été créé, false s'il existait déjà
 */
function createOrUpdateLockFile(lockFile, eventOptions, pluginName, launching = false) {
    try {
        if (!fs.existsSync(lockFile)) {
            const tempLockData = {
                pid: 0,
                options: eventOptions,
                timestamp: Date.now(),
                launching: launching
            };
            fs.writeFileSync(lockFile, JSON.stringify(tempLockData), 'utf8');
            if (launching) {
                console.log(`[${pluginName}] Fichier de verrouillage créé/mis à jour avant le lancement d'Electron`);
            } else {
                console.log(`[${pluginName}] Fichier de verrouillage créé immédiatement`);
            }
            return true;
        } else {
            // Mettre à jour le fichier existant avec les nouvelles options
            const lockData = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
            lockData.options = eventOptions;
            lockData.timestamp = Date.now();
            if (launching) {
                lockData.launching = true;
            }
            fs.writeFileSync(lockFile, JSON.stringify(lockData), 'utf8');
            return false;
        }
    } catch (e) {
        console.warn(`[${pluginName}] Erreur lors de la création/mise à jour du fichier de verrouillage:`, e.message);
        return false;
    }
}

/**
 * Lance un processus Electron pour un plugin
 * @param {Object} options - Options de lancement
 * @param {string} options.pluginName - Nom du plugin
 * @param {string} options.lockFile - Chemin vers le fichier de verrouillage
 * @param {string} options.appPath - Chemin absolu vers app.js du plugin
 * @param {string} options.electronPath - Chemin vers l'exécutable Electron
 * @param {Object} options.eventOptions - Options de l'événement à transmettre
 * @param {string} options.pluginDir - Répertoire du plugin (pour cwd)
 * @param {Function} options.onExit - Callback appelé quand le processus se termine (code, pluginName)
 * @param {Function} options.onError - Callback appelé en cas d'erreur (error, pluginName)
 */
function launchAppJS(options) {
    const {
        pluginName,
        lockFile,
        appPath,
        electronPath,
        eventOptions,
        pluginDir,
        onExit,
        onError
    } = options;

    /*
    console.log(`[${pluginName}] Using Electron path: ${electronPath}`);
    console.log(`[${pluginName}] App path: ${appPath}`);
    */
    
    // Mettre à jour le fichier de verrouillage avec le flag launching
    createOrUpdateLockFile(lockFile, eventOptions, pluginName, true);
    
    // Set environment variable with plugin app path
    const pluginEnv = { ...process.env };
    pluginEnv.LANSUPERV_PLUGIN_APP_JS = appPath;
    
    // Transmettre les options de l'événement via variable d'environnement
    if (Object.keys(eventOptions).length > 0) {
        pluginEnv.LANSUPERV_PLUGIN_OPTIONS = JSON.stringify(eventOptions);
    }
    
    // En mode développement, electronPath est 'electron' et on doit passer electron-entrypoint.js comme argument
    // En mode compilé, electronPath est l'exécutable et on ne passe pas d'arguments
    const spawnArgs = [];
    if (electronPath === 'electron') {
        // Mode développement : passer electron-entrypoint.js comme argument
        // Remonter de 4 niveaux depuis le plugin pour arriver à la racine du projet
        const electronEntryPoint = path.resolve(pluginDir, '..', '..', '..', '..', 'electron-entrypoint.js');
        spawnArgs.push(electronEntryPoint);
        console.log(`[${pluginName}] Mode développement: ajout de electron-entrypoint.js comme argument: ${electronEntryPoint}`);
    }
    
    // electron-entrypoint.js will detect LANSUPERV_PLUGIN_APP_JS and load the plugin
    const child = Spawn(electronPath, spawnArgs, {
        stdio: 'inherit',
        cwd: pluginDir,
        env: pluginEnv
    });
    
    child.on('error', (error) => {
        console.error(`[${pluginName}] Erreur lors du lancement d'Electron:`, error);
        if (onError) {
            onError(error, pluginName);
        }
    });
    
    child.on('exit', (code) => {
        // Supprimer le fichier de verrouillage quand le processus se termine
        try {
            if (fs.existsSync(lockFile)) {
                fs.unlinkSync(lockFile);
            }
        } catch (e) {
            // Ignorer l'erreur
        }
        
        if (onExit) {
            onExit(code, pluginName);
        }
    });
}

module.exports = {
    checkExistingInstance,
    killExistingProcessSync,
    processInstanceCheck,
    updateOptionsIfLaunching,
    createOrUpdateLockFile,
    launchAppJS
};
