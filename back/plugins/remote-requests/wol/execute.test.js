/**
 * Script de test pour le plugin WOL
 * Usage: node execute.test.js [MAC_ADDRESS]
 * Exemples: 
 *    node execute.test.js CC:28:AA:A6:C5:17
 *    node back/plugins/remote-requests/wol/execute.test.js CC:28:AA:A6:C5:17
 *    LANSUPERV_PLUGIN_MODE=true ./lan-superv-linux-arm64 back/plugins/remote-requests/wol/execute.test.js CC:28:AA:A6:C5:17
 */

const { spawn } = require('child_process');
const path = require('path');

// Détecter si on est en mode SEA (binaire compilé)
function isAppCompiled() {
    const execPath = process.execPath;
    const execName = path.basename(execPath);
    
    // Windows: check for .exe extension (but not node.exe)
    if (execPath.endsWith('.exe') && !execPath.includes('node.exe')) {
        return true;
    }
    
    // Linux: check if executable name contains 'linux'
    if (execName.includes('linux')) {
        return true;
    }
    
    return false;
}

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
const nodePath = process.execPath; // Utilise le binaire SEA si on est en mode compilé, sinon node

// CRITICAL: Set LANSUPERV_PLUGIN_MODE to prevent child process from starting their own server
const pluginEnv = { ...process.env };
pluginEnv.LANSUPERV_PLUGIN_MODE = 'true';
delete pluginEnv.NODE_OPTIONS; // Clear NODE_OPTIONS to prevent environment inheritance

const child = spawn(nodePath, [pluginPath], {
    stdio: ['pipe', 'pipe', 'pipe', 'ipc'], // Enable IPC for message passing
    env: pluginEnv,
    shell: false
});

// Gérer la sortie stdout/stderr
if (child.stdout) {
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (data) => {
        const output = data.toString().trim();
        if (output) {
            console.log(output);
        }
    });
}

if (child.stderr) {
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (data) => {
        const output = data.toString().trim();
        if (output) {
            console.error(output);
        }
    });
}

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
