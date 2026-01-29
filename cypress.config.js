const { defineConfig } = require('cypress');
const { execSync } = require('child_process');

module.exports = defineConfig({
  e2e: {
    setupNodeEvents(on, config) {
      // Tâches Node.js pour gérer Docker
      on('task', {
        execDockerCompose({ command, args = [] }) {
          try {
            // Pour la commande 'down', ajouter des options pour forcer l'arrêt
            let finalArgs = args;
            if (command === 'down') {
              finalArgs = ['--remove-orphans', '--timeout', '5', ...args];
            }
            
            const result = execSync(`docker-compose -f docker-compose.test.yml ${command} ${finalArgs.join(' ')}`, {
              encoding: 'utf-8',
              cwd: process.cwd(),
              timeout: 10000 // Timeout de 10 secondes max pour la commande
            });
            return { success: true, output: result };
          } catch (error) {
            // Si 'down' échoue, essayer de forcer l'arrêt avec docker kill
            if (command === 'down') {
              try {
                console.log('docker-compose down failed, trying to force kill containers...');
                // Tuer les conteneurs individuellement
                try {
                  execSync('docker kill lansuperv-test-instance1', {
                    encoding: 'utf-8',
                    cwd: process.cwd(),
                    stdio: 'ignore'
                  });
                } catch (e) {}
                try {
                  execSync('docker kill lansuperv-test-instance2', {
                    encoding: 'utf-8',
                    cwd: process.cwd(),
                    stdio: 'ignore'
                  });
                } catch (e) {}
                // Nettoyer avec docker-compose
                try {
                  execSync('docker-compose -f docker-compose.test.yml down --remove-orphans --timeout 2', {
                    encoding: 'utf-8',
                    cwd: process.cwd(),
                    stdio: 'ignore'
                  });
                } catch (e) {}
                return { success: true, output: 'Containers force stopped' };
              } catch (killError) {
                // Ignorer les erreurs de kill
              }
            }
            
            return { 
              success: false, 
              error: error.message,
              stdout: error.stdout?.toString(),
              stderr: error.stderr?.toString()
            };
          }
        },
        getDockerLogs({ containerName, lines = null }) {
          try {
            const cmd = lines 
              ? `docker logs --tail ${lines} ${containerName}`
              : `docker logs ${containerName}`;
            const logs = execSync(cmd, { 
              encoding: 'utf-8',
              stdio: ['ignore', 'pipe', 'ignore']
            });
            return { success: true, logs };
          } catch (error) {
            return { success: false, error: error.message, logs: '' };
          }
        },
        isContainerRunning({ containerName }) {
          try {
            const result = execSync(`docker ps --filter "name=${containerName}" --format "{{.Names}}"`, { 
              encoding: 'utf-8',
              stdio: ['ignore', 'pipe', 'ignore']
            });
            return result.trim() === containerName;
          } catch (error) {
            return false;
          }
        },
        waitForContainerReady({ containerName, maxWaitTime = 5000 }) {
          // Cette tâche vérifie rapidement si le conteneur est prêt
          // Elle est appelée plusieurs fois depuis la commande Cypress
          try {
            const isRunning = execSync(`docker ps --filter "name=${containerName}" --format "{{.Names}}"`, { 
              encoding: 'utf-8',
              stdio: ['ignore', 'pipe', 'ignore']
            }).trim() === containerName;

            if (!isRunning) {
              return { ready: false, reason: 'Container not running' };
            }

            const logs = execSync(`docker logs --tail 100 ${containerName}`, { 
              encoding: 'utf-8',
              stdio: ['ignore', 'pipe', 'ignore']
            });
            
            // Vérifier plusieurs indicateurs de disponibilité
            const readyIndicators = [
              'OK! Web server available',
              '[WebRTC] WebRTC manager initialized',
              'Web server available',
              'WebRTC manager initialized',
              'WebRTC Signaling] WebSocket server started'
            ];
            
            const isReady = readyIndicators.some(indicator => logs.includes(indicator));
            
            if (isReady) {
              return { ready: true };
            }
            
            // Retourner les dernières lignes des logs pour le débogage
            const lastLines = logs.split('\n').slice(-5).join('\n');
            return { 
              ready: false, 
              reason: 'Container running but not ready yet',
              lastLogs: lastLines
            };
          } catch (error) {
            return { ready: false, reason: error.message };
          }
        }
      });
    },
    specPattern: 'cypress/e2e/**/*.cy.{js,jsx,ts,tsx}',
    supportFile: 'cypress/support/e2e.js',
    viewportWidth: 1280,
    viewportHeight: 720,
    video: false, // Désactiver la vidéo pour éviter les problèmes en fin de test
    screenshotOnRunFailure: true,
    pageLoadTimeout: 30000,
    requestTimeout: 15000, // Réduire le timeout des requêtes pour éviter les blocages
    responseTimeout: 10000,
    defaultCommandTimeout: 30000,
    // Désactiver les restrictions WebRTC pour les tests
    chromeWebSecurity: false,
  },
});
