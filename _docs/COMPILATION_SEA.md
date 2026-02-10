# Déploiement avec Node.js SEA (Single Executable Applications)

## Vue d'ensemble

Node.js SEA (Single Executable Applications) est la **solution officielle** de Node.js pour créer des exécutables autonomes.

## Prérequis

- **Node.js 24.0.0+**
- Windows (pour la compilation Windows)
- Raspbery ou autre (pour compilation linux-arm64)

## Configuration

### Fichier de configuration SEA

Le fichier `sea-config.json` définit l'application à empaqueter :

```json
{
  "main": "application.js",
  "output": "dist/sea-prep.blob",
  "disableExperimentalSEAWarning": false
}
```

### Script de build

Le script `build-sea.js` automatise le processus de compilation :

1. Compile le frontend avec webpack
2. Génère le blob SEA
3. Copie l'exécutable Node.js
4. Injecte le blob dans l'exécutable
5. Copie les fichiers externes (plugins, config, etc.)

## Compilation

### Méthode 1: Script npm (recommandé)

```bash
npm run build:sea:win-64
npm run build:sea:linux-64
#npm run build:sea:linux-arm64 #exec on arm64 system
```

### Méthode 2: Script manuel

```bash
node build-sea.js
```

## Structure de déploiement

Après compilation, la structure est :

```
dist/
  lan-superv.exe              # Exécutable compilé
  plugins/                     # Plugins (chargés dynamiquement)
    local-responses/
    remote-requests/
  config.js.sample            # Fichier de configuration exemple
  front/                      # Frontend compilé
    dist/
      bundle.js
    ...
  tmp/                       # repertoire de travail supprimé à la fin du build
```

## Fichiers externes

Les fichiers suivants sont **exclus** de l'exécutable et chargés dynamiquement :

- `back/plugins/` - Tous les plugins
- `config.js` - Configuration (à l'utilisateur de créer le fichier à partir de `config.js.sample`)
- `front/` - Frontend (inclus dans l'exécutable mais peut être surchargé)


## Développement : détection de l'environnement SEA

Dans le code source de l'application, utilisez les fonctions centralisées de `functions.js` pour détecter le mode d'exécution et/ou F.getAppDirectory() pour lire des fichiers à la racine de l'application :

```javascript
const F = require('./back/functions');

// Détecter si on est en mode exécutable compilé
if (F.isAppCompiled()) {
    // Mode SEA (exécutable compilé)
} else {
    // Mode développement
}
```

## Dépannage

### Erreur: "Cannot find module"

Vérifiez que tous les modules sont installés :
```bash
npm install
```

## Références

- [Documentation officielle Node.js SEA](https://nodejs.org/api/single-executable-applications.html)
- [Guide SEA de Node.js](https://github.com/nodejs/single-executable-applications)
