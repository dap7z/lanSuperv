# Tests E2E Cypress - LanSuperv

**Avantages Cypress :**
- Excellent pour les tests E2E
- Interface utilisateur agréable
- Bon debugging

**Inconvénients Cypress :**
- Limitations avec WebRTC (peut nécessiter des flags spéciaux)
- Plus difficile de contrôler plusieurs navigateurs simultanément
- Moins adapté pour les tests multi-instances

## Prérequis

1. **Docker et Docker Compose** doivent être installés
2. **Node.js** >= 24.0.0
3. **Cypress** sera installé automatiquement avec `npm install`

## Installation

```bash
npm install
npx cypress install
```

## Exécution des tests

### Lancer tous les tests Cypress (mode headless)

```bash
npm run test:cypress
```

### Ouvrir l'interface Cypress (recommandé pour le débogage)

```bash
npm run test:cypress:open
```

## Structure des tests

```
cypress/
├── e2e/
│   └── chat-sync.cy.js      # Test de synchronisation chat
├── support/
│   ├── commands.js          # Commandes personnalisées Cypress
│   └── e2e.js               # Configuration support
└── README.md
```

## Tests disponibles

### Test 1: Synchronisation bidirectionnelle des messages

Ce test vérifie que les messages de chat sont bien synchronisés entre deux instances Docker via WebRTC :

1. Démarre deux instances Docker (instance1 et instance2)
2. Se connecte à l'interface web de instance1
3. Envoie un message depuis instance1
4. Vérifie que le message est reçu par instance2 (interface + logs)
5. Se connecte à l'interface web de instance2
6. Envoie un message depuis instance2
7. Vérifie que le message est reçu par instance1 (interface + logs)

## Configuration

Les tests utilisent `docker-compose.test.yml` pour créer deux instances :
- **instance1** : http://localhost:8421
- **instance2** : http://localhost:8422

## Limitations Cypress

⚠️ **Note importante** : Cypress ne peut pas contrôler plusieurs navigateurs simultanément. Le test se fait donc de manière séquentielle :
- D'abord sur instance1 (envoi et vérification)
- Puis sur instance2 (envoi et vérification)

## Dépannage

### Les conteneurs ne démarrent pas

Vérifiez que les ports 8421 et 8422 ne sont pas déjà utilisés :
```bash
lsof -i :8421
lsof -i :8422
```

### Les tests échouent avec un timeout

Les connexions WebRTC peuvent prendre du temps. Augmentez les timeouts dans `cypress.config.js` si nécessaire.

### Les messages ne sont pas synchronisés

Vérifiez les logs des conteneurs :
```bash
docker logs lansuperv-test-instance1
docker logs lansuperv-test-instance2
```

Assurez-vous que les deux instances peuvent communiquer via le réseau Docker.
