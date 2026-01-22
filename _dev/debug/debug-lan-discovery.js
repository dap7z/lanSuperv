// Fichier de test pour diagnostiquer un problème de détection de la passerelle par défaut
// On l'execute avec la commande suivante : 		node debug-lan-discovery.js

const os = require('os');
const LanDiscovery = require('lan-discovery');
const F = require('../back/functions.js'); //FONCTIONS
const discovery = new LanDiscovery({ verbose: false, timeout: 60 });
const discoveryVerbose = new LanDiscovery({ verbose: true, timeout: 10 });

console.log('=== DIAGNOSTIC RÉSEAU ===\n');

// 1. Afficher toutes les interfaces réseau
console.log('1. Interfaces réseau disponibles:');
const interfaces = os.networkInterfaces();
Object.keys(interfaces).forEach(name => {
    console.log(`\n  Interface: ${name}`);
    interfaces[name].forEach(addr => {
        console.log(`    - ${addr.family} ${addr.address} (netmask: ${addr.netmask}, internal: ${addr.internal}, mac: ${addr.mac || 'N/A'})`);
    });
});

// 2. Tester la fonction deviceName
async function testDeviceName(ipTest){
    console.log('------------ TEST DEVICE NAME -----------------');
    console.log('Testing IP:', ipTest);
    try {
        // Utiliser la méthode deviceName de l'instance
        let name = await discoveryVerbose.deviceName(ipTest);
        console.log(ipTest + " name is :", name);
    } catch (error) {
        console.error('Error:', error);
    }
    console.log('-----------------------------------------------');
}
testDeviceName('10.10.1.200');

// 3. Tester LanDiscovery (comme dans l'application principale)
console.log('\n2. Test de LanDiscovery.getDefaultInterface():');
let defaultInterface = null;

discovery.getDefaultInterface().then(interface => {
    console.log('  ✓ Interface par défaut trouvée:');
    console.log(JSON.stringify(interface, null, 2));
    
    // Afficher les détails de l'interface
    console.log('\n  Détails de l\'interface:');
    console.log(`    - IP: ${interface.ip_address}`);
    console.log(`    - MAC: ${interface.mac_address}`);
    console.log(`    - Network: ${interface.network}`);
    console.log(`    - Bitmask: ${interface.bitmask}`);
    console.log(`    - Fullmask: ${interface.fullmask}`);
    console.log(`    - Gateway: ${interface.gateway_ip}`);
    
    defaultInterface = interface;
    
    // 4. Lancer le scan du LAN
    console.log('\n3. Lancement du scan du LAN:');
    const networkToScan = interface.network + '/' + interface.bitmask;
    console.log(`  Réseau à scanner: ${networkToScan}`);
    
    const tabIP = F.cidrRange(networkToScan);
    console.log(`  Nombre d'adresses IP à scanner: ${tabIP.length}`);
    console.log(`  Première IP: ${tabIP[0]}, Dernière IP: ${tabIP[tabIP.length - 1]}`);
    
    let deviceCount = 0;
    const startTime = Date.now();
    
    discovery
        .on(LanDiscovery.EVENT_DEVICE_INFOS, (device) => {
            deviceCount++;
            console.log(`\n  [${deviceCount}] Appareil trouvé:`);
            console.log(`    - Nom: ${device.name || 'N/A'}`);
            console.log(`    - IP: ${device.ip || 'N/A'}`);
            console.log(`    - MAC: ${device.mac || 'N/A'}`);
            console.log(`    - Données complètes:`, JSON.stringify(device, null, 2));
        })
        .on(LanDiscovery.EVENT_DEVICES_INFOS, (data) => {
            console.log('\n  ✓ Scan terminé - Tous les appareils:');
            console.log(`    Nombre total d'appareils trouvés: ${deviceCount}`);
            console.log(`    Temps de scan: ${((Date.now() - startTime) / 1000).toFixed(2)} secondes`);
        })
        .on(LanDiscovery.EVENT_SCAN_COMPLETE, (data) => {
            console.log('\n  ✓ Scan complété:');
            console.log(`    Temps total: ${(data.scanTimeMS / 1000).toFixed(2)} secondes`);
            console.log(`    Appareils trouvés: ${deviceCount}`);
        })
        .startScan({ ipArrayToScan: tabIP });
        
    console.log('  Scan en cours... (attendez la fin du scan)');
    
}).catch(err => {
    console.log('  ✗ Erreur LanDiscovery:');
    console.log('  Message:', err.message);
    console.log('  Stack:', err.stack);
});

// Attendre un peu pour que les promesses se résolvent
setTimeout(() => {
    console.log('\n=== FIN DU DIAGNOSTIC ===');
    process.exit(0);
}, 3000);

