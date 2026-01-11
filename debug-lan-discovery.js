// Fichier de test pour diagnostiquer un problème de détection de la passerelle par défaut
// On l'execute avec la commande suivante : 		node debug-lan-discovery.js

const os = require('os');
const defaultGateway = require('default-gateway');
const LanDiscovery = require('lan-discovery');

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

// 2. Tester default-gateway directement
console.log('\n2. Test de default-gateway:');
defaultGateway.v4().then(result => {
    console.log('  ✓ Passerelle IPv4 trouvée:', result);
}).catch(err => {
    console.log('  ✗ Erreur default-gateway IPv4:', err.message);
    console.log('  Détails:', err);
});

defaultGateway.v6().then(result => {
    console.log('  ✓ Passerelle IPv6 trouvée:', result);
}).catch(err => {
    console.log('  ✗ Erreur default-gateway IPv6:', err.message);
});

// 3. Tester LanDiscovery
console.log('\n3. Test de LanDiscovery.getDefaultInterface():');
const discovery = new LanDiscovery({ verbose: false, timeout: 60 });
discovery.getDefaultInterface().then(interface => {
    console.log('  ✓ Interface par défaut trouvée:');
    console.log(JSON.stringify(interface, null, 2));
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

