// ***********************************************
// This example commands.js shows you how to
// create various custom commands and overwrite
// existing commands.
//
// For more comprehensive examples of custom
// commands please read more here:
// https://on.cypress.io/custom-commands
// ***********************************************

/**
 * Récupère les logs d'un conteneur Docker
 */
Cypress.Commands.add('getDockerLogs', (containerName, lines = null) => {
  return cy.task('getDockerLogs', { containerName, lines }).then((result) => {
    if (result.success) {
      return result.logs;
    } else {
      cy.log(`Error getting logs for ${containerName}:`, result.error);
      return '';
    }
  });
});

/**
 * Attend qu'un conteneur soit prêt
 * Note: cy.task a un timeout par défaut de 60s, donc on fait des vérifications courtes en boucle
 */
Cypress.Commands.add('waitForContainerReady', (containerName, maxWaitTime = 120000) => {
  const checkInterval = 2000; // Vérifier toutes les 2 secondes
  const startTime = Date.now();
  let checkCount = 0;
  
  const checkReady = () => {
    const elapsed = Date.now() - startTime;
    checkCount++;
    
    if (elapsed > maxWaitTime) {
      // Récupérer les logs finaux pour le débogage
      return cy.task('getDockerLogs', { containerName, lines: 50 }).then((logsResult) => {
        const finalLogs = logsResult.success ? logsResult.logs : 'Could not retrieve logs';
        cy.log(`Final logs for ${containerName}:`, finalLogs);
        throw new Error(`Container ${containerName} did not become ready within ${maxWaitTime}ms. Last logs: ${finalLogs.substring(0, 500)}`);
      });
    }
    
    return cy.task('waitForContainerReady', { containerName, maxWaitTime: 5000 })
      .then((result) => {
        if (result && result.ready) {
          cy.log(`Container ${containerName} is ready (after ${checkCount} checks, ${Math.round(elapsed/1000)}s)`);
          return cy.wrap(result);
        }
        
        // Afficher un log toutes les 10 vérifications pour le débogage
        if (checkCount % 10 === 0) {
          cy.log(`Waiting for ${containerName}... (${checkCount} checks, ${Math.round(elapsed/1000)}s elapsed)`);
          if (result && result.lastLogs) {
            cy.log(`Last logs: ${result.lastLogs}`);
          }
        }
        
        // Attendre un peu avant de réessayer
        return cy.wait(checkInterval).then(() => {
          return checkReady();
        });
      });
  };
  
  return checkReady();
});

/**
 * Attend qu'un message de chat apparaisse
 */
Cypress.Commands.add('waitForChatMessage', (messageText, timeout = 15000) => {
  cy.get('ul.chatmessage li.chatmsg span.what', { timeout })
    .should('contain', messageText);
});
