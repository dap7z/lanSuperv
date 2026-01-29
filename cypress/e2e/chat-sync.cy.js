const INSTANCE1_URL = 'http://localhost:8421';
const INSTANCE2_URL = 'http://localhost:8422';
const INSTANCE1_CONTAINER = 'lansuperv-test-instance1';
const INSTANCE2_CONTAINER = 'lansuperv-test-instance2';

describe('Chat Synchronization Tests', () => {
  
  before(() => {
    cy.log('Starting Docker containers...');
    
    // Démarrer les instances Docker
    cy.task('execDockerCompose', { command: 'up', args: ['-d'] }).then((result) => {
      if (!result.success) {
        cy.log('Error starting Docker containers:');
        cy.log('Error:', result.error);
        if (result.stdout) cy.log('Stdout:', result.stdout);
        if (result.stderr) cy.log('Stderr:', result.stderr);
        throw new Error('Failed to start Docker containers');
      }
      cy.log('Docker compose output:', result.output);
      
      // Attendre que les conteneurs soient prêts
      cy.log('Waiting for containers to be ready...');
      cy.log('Waiting for instance1...');
      cy.waitForContainerReady(INSTANCE1_CONTAINER, 120000);
      cy.log('Waiting for instance2...');
      cy.waitForContainerReady(INSTANCE2_CONTAINER, 120000);
      
      // Attendre un peu plus pour que les connexions WebRTC puissent s'établir
      cy.wait(5000);
      
      cy.log('Containers are ready');
    });
  });

  after(() => {
    cy.log('Test completed, stopping containers...');
    
    // Arrêter immédiatement les instances Docker (avec timeout court)
    cy.task('execDockerCompose', { command: 'down', args: [] }).then((result) => {
      if (result.success) {
        cy.log('Containers stopped');
      } else {
        cy.log('Error stopping Docker containers:', result.error);
        // Essayer de forcer l'arrêt avec docker kill si nécessaire
        cy.log('Attempting to force stop containers...');
      }
    });
  });

  it('Test 1: Bidirectional chat synchronization', () => {
    // Ouvrir deux fenêtres (une pour chaque instance)
    // Note: Cypress ne peut pas contrôler plusieurs navigateurs simultanément
    // On va donc tester séquentiellement ou utiliser des onglets
    
    // === Étape 1 : Message depuis instance1 vers instance2 ===
    cy.log('Sending message from instance1 to instance2...');
    cy.visit(INSTANCE1_URL);
    
    // Attendre que la page soit chargée
    cy.get('form#chat').should('be.visible');
    
    // Attendre que WebRTC soit connecté (vérifier via JavaScript, avec timeout)
    cy.window().then((win) => {
      return new Cypress.Promise((resolve, reject) => {
        const startTime = Date.now();
        const maxWait = 15000; // 15 secondes max
        
        const checkConnection = () => {
          if (Date.now() - startTime > maxWait) {
            // Timeout atteint, continuer quand même
            cy.log('WebRTC connection check timeout, continuing anyway');
            resolve();
            return;
          }
          
          if (win.sharedObject && 
              win.sharedObject.webRtcClient && 
              win.sharedObject.webRtcClient.isConnected) {
            cy.log('WebRTC connection detected');
            resolve();
          } else {
            setTimeout(checkConnection, 500);
          }
        };
        checkConnection();
      });
    });
    
    // Attendre un peu pour que les connexions WebRTC s'établissent
    cy.wait(3000);
    
    const message1 = 'helloFromChatInstance1';
    
    // Remplir le champ de message
    cy.get('form#chat input.msg').type(message1);
    
    // Envoyer le message
    cy.get('form#chat button.msgSubmitBtn').click();
    
    // Vérifier que le message apparaît dans la liste
    cy.waitForChatMessage(message1, 15000);
    
    // Vérifier les logs de instance2
    cy.log('Checking logs of instance2...');
    cy.getDockerLogs(INSTANCE2_CONTAINER).then((logs) => {
      expect(logs).to.include('helloFromChatInstance1');
      expect(logs).to.include('type: \'text\'');
      expect(logs).to.include('[EVENT-RECEPTION] Received data without eventName');
    });
    
    cy.log('✓ Message from instance1 received by instance2');

    // === Étape 2 : Message depuis instance2 vers instance1 ===
    cy.log('Sending message from instance2 to instance1...');
    cy.visit(INSTANCE2_URL);
    
    // Attendre que la page soit chargée
    cy.get('form#chat').should('be.visible');
    
    // Attendre que WebRTC soit connecté (vérifier via JavaScript, avec timeout)
    cy.window().then((win) => {
      return new Cypress.Promise((resolve, reject) => {
        const startTime = Date.now();
        const maxWait = 15000; // 15 secondes max
        
        const checkConnection = () => {
          if (Date.now() - startTime > maxWait) {
            // Timeout atteint, continuer quand même
            cy.log('WebRTC connection check timeout, continuing anyway');
            resolve();
            return;
          }
          
          if (win.sharedObject && 
              win.sharedObject.webRtcClient && 
              win.sharedObject.webRtcClient.isConnected) {
            cy.log('WebRTC connection detected');
            resolve();
          } else {
            setTimeout(checkConnection, 500);
          }
        };
        checkConnection();
      });
    });
    
    // Attendre un peu pour que les connexions WebRTC s'établissent
    cy.wait(3000);
    
    const message2 = 'helloFromChatInstance2';
    
    // Remplir le champ de message
    cy.get('form#chat input.msg').type(message2);
    
    // Envoyer le message
    cy.get('form#chat button.msgSubmitBtn').click();
    
    // Vérifier que le message apparaît dans la liste
    cy.waitForChatMessage(message2, 15000);
    
    // Vérifier les logs de instance1
    cy.log('Checking logs of instance1...');
    cy.getDockerLogs(INSTANCE1_CONTAINER).then((logs) => {
      expect(logs).to.include('helloFromChatInstance2');
      expect(logs).to.include('type: \'text\'');
      expect(logs).to.include('[EVENT-RECEPTION] Received data without eventName');
    });
    
    cy.log('✓ Message from instance2 received by instance1');
    cy.log('✓ Test completed successfully');
    
    // Attendre un peu pour que tout soit bien synchronisé avant la fin du test
    cy.wait(1000);
  });
});
