/**
 * Script de test pour le plugin WOL
 * Usage: node execute.test.js [MAC_ADDRESS]
 * Exemples: 
 *    node execute.test.js CC:28:AA:A6:C5:17
 *    node back/plugins/remote-requests/wol/execute.test.js CC:28:AA:A6:C5:17
 *    LANSUPERV_PLUGIN_MODE=true ./lan-superv-linux-arm64 back/plugins/remote-requests/wol/execute.test.js CC:28:AA:A6:C5:17
 */

const { fork } = require('child_process');
const path = require('path');

// Récupérer l'adresse MAC depuis les arguments
const macAddress = process.argv[2];

console.log(`[TEST WOL] Testing WOL plugin with MAC address: ${macAddress}`);
console.log(`[TEST WOL] Plugin path: ${__dirname}/execute.js`);

// Paramètres à envoyer au plugin (simulant ceux du serveur)
const eventParams = {
    eventName: 'wol',
    pcTargetLanMAC: macAddress,
    pcTargetLanIP: '',
    eventFrom: 'test',
    lanInterface: {
        name: 'eth0',
        ip_address: ''
    }
};

// Lancer le plugin en processus enfant
const pluginPath = path.join(__dirname, 'execute.js');
const child = fork(pluginPath, [], {
    silent: false, // Afficher stdout/stderr
    env: {
        ...process.env,
        LANSUPERV_PLUGIN_MODE: 'true'
    }
});

// Gérer les messages du plugin
child.on('message', (msg) => {
    console.log(`[TEST WOL] Plugin message: ${msg}`);
    
    if (msg === 'done' || msg === 'fail' || msg.startsWith('fail:')) {
        console.log(`[TEST WOL] Plugin finished with status: ${msg}`);
        process.exit(msg === 'done' ? 0 : 1);
    }
});

// Gérer les erreurs
child.on('error', (error) => {
    console.error(`[TEST WOL] Error spawning plugin:`, error);
    process.exit(1);
});

// Gérer la sortie du processus
child.on('exit', (code, signal) => {
    if (code !== 0) {
        console.error(`[TEST WOL] Plugin exited with code ${code} and signal ${signal}`);
    } else {
        console.log(`[TEST WOL] Plugin exited successfully`);
    }
    process.exit(code || 0);
});

// Envoyer les paramètres au plugin après un court délai
setTimeout(() => {
    console.log(`[TEST WOL] Sending eventParams to plugin...`);
    child.send(eventParams);
}, 100);

// Timeout de sécurité (10 secondes)
setTimeout(() => {
    console.error(`[TEST WOL] Timeout: Plugin did not respond within 10 seconds`);
    child.kill();
    process.exit(1);
}, 10000);
