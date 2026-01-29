# Guide de build Electron - lanSuperv

Ce guide explique comment compiler l'application Electron avec `electron-builder` pour créer des versions portables (sans installateur).

---

## Prérequis

1. **Node.js** >= 24.0.0
2. **npm** ou **yarn**
3. **Git** (pour la distribution via GitHub Releases)
4. **Dépendances installées** :
   ```bash
   npm install
   ```

---

## Configuration electron-builder

### 1. Le fichier de configuration de build

Si necessaire mettre à jour le fichier `electron-builder.json` à la racine du projet.

---

## Build portable (sans installateur)

### Windows dir

```bash
npm run build:electron:win
```

Génère un dossier `lanSuperv\dist-electron\win-unpacked` dans lequel lanSuperv.exe peut être exécuté directement sans installation.

**Fonctionnalités supportées** :
- ✅ **Démarrage automatique au boot** : Fonctionne via `app.setLoginItemSettings()` qui crée une entrée dans le registre Windows
- ✅ **Mises à jour automatiques** : `electron-updater` peut mettre à jour les applications portables

Ces fonctionnalités peuvent être activées/désactivées via le menu tray de l'application.

Pour diagnostiquer un problème de build sur windows :
1) Ctrl+Alt+Suppr kill old processus
2) Supprimer le dossier lanSuperv\dist-electron et les ancien log en powershell : 
   Remove-Item -Path "T:\GITLAB\lanSuperv\dist-electron" -Recurse -Force
   Remove-Item -Path "$env:TEMP\lanSuperv-electron-main.log" -Force -ErrorAction SilentlyContinue
3) Recompiler l'application :
     npm run build:electron:win
4) Lancer l'application depuis un terminal mode administrateur pour voir les logs :
     cd T:\GITLAB\lanSuperv\dist-electron\win-unpacked
     lanSuperv.exe
5) Vérifier les logs sous powershell :
   Get-Content "$env:TEMP\lanSuperv-electron-main.log" 

### Linux AppImage

```bash
npm run build:electron:linux
```

Génère `lanSuperv-{version}-x86_64.AppImage` qui peut être exécuté directement.

**Fonctionnalités supportées** :
- ✅ **Démarrage automatique au boot** : Fonctionne via `app.setLoginItemSettings()` qui crée un fichier `.desktop` dans `~/.config/autostart/`
- ✅ **Mises à jour automatiques** : `electron-updater` peut mettre à jour les applications portables

Ces fonctionnalités peuvent être activées/désactivées via le menu tray de l'application.

### macOS ZIP

```bash
npm run build:electron:mac
```

Génère `lanSuperv-{version}-mac.zip` qui contient l'application portable.

**Fonctionnalités supportées** :
- ✅ **Démarrage automatique au boot** : Fonctionne via `app.setLoginItemSettings()` qui utilise LaunchAgents
- ✅ **Mises à jour automatiques** : `electron-updater` peut mettre à jour les applications portables

Ces fonctionnalités peuvent être activées/désactivées via le menu tray de l'application.

---

## Scripts npm à ajouter dans package.json

Ajouter ces scripts dans la section `"scripts"` de `package.json` :

```json
{
  "scripts": {
    "electron": "electron electron-main.js",
    "build:electron": "electron-builder",
    "build:electron:win": "electron-builder --win --x64 --target=portable",
    "build:electron:linux": "electron-builder --linux --x64 --target=AppImage",
    "build:electron:linux:arm64": "electron-builder --linux --arm64 --target=AppImage",
    "build:electron:mac": "electron-builder --mac --target=zip",
    "build:electron:all": "electron-builder --win --linux --mac"
  }
}
```

---

## Configuration pour GitHub Releases

### 1. Token GitHub

Créer un token GitHub avec les permissions `repo` :
1. Aller sur https://github.com/settings/tokens
2. Créer un nouveau token (classic)
3. Cocher `repo` dans les permissions
4. Copier le token

### 2. Variable d'environnement

**Windows (PowerShell) :**
```powershell
$env:GH_TOKEN="votre_token_github"
```

**Linux/macOS :**
```bash
export GH_TOKEN="votre_token_github"
```

### 3. Build et publication automatique

```bash
npm run build:electron -- --publish always
# or windows zip only :
npm run build:electron -- --win zip --x64 --publish always
```

Cela va :
1. Compiler l'application
2. Publier automatiquement sur GitHub Releases
3. Configurer `electron-updater` pour utiliser ces releases

---

## Structure des fichiers générés

Après le build, les fichiers sont générés dans `dist-electron/` :

```
dist-electron/
├── win-unpacked                           # Dir windows with lanSuperv.exe
├── lanSuperv-0.7.000-x86_64.AppImage      # Portable Linux (x64)
├── lanSuperv-0.7.000-arm64.AppImage       # Portable Linux (ARM64)
└── lanSuperv-0.7.000-mac.zip              # Portable macOS
```

## Build pour plusieurs architectures

### Windows
```bash
# x64 uniquement
npm run build:electron:win
```

### Linux
```bash
# x64
npm run build:electron:linux
```

### macOS
```bash
# x64 (Intel) ou arm64 (Apple Silicon) - détecté automatiquement
npm run build:electron:mac

# Les deux architectures
electron-builder --mac zip --x64 --arm64
```

---

## Dépannage

### Erreur : "GH_TOKEN is not set"

Définir la variable d'environnement `GH_TOKEN` avant de publier.

### Build échoue sur Linux

Installer les dépendances nécessaires :
```bash
# Debian/Ubuntu
sudo apt-get install -y libnss3-dev libatk-bridge2.0-dev libdrm2 libxkbcommon-dev libxcomposite-dev libxdamage-dev libxrandr-dev libgbm-dev libxss-dev libasound2-dev

# Fedora
sudo dnf install -y nss atk at-spi2-atk libdrm libxkbcommon libXcomposite libXdamage libXrandr mesa-libgbm libXScrnSaver alsa-lib
```

### Build échoue sur macOS

Installer Xcode Command Line Tools :
```bash
xcode-select --install
```

---

## Workflow de release recommandé

1. **Mettre à jour la version** dans `package.json`
2. **Commit et tag** :
   ```bash
   git add package.json
   git commit -m "Bump version to X.Y.Z"
   git tag vX.Y.Z
   git push origin main --tags
   ```
3. **Build et publier** :
   ```bash
   export GH_TOKEN="votre_token"
   npm run build:electron:all -- --publish always
   ```
4. **Vérifier** sur GitHub Releases que les fichiers sont bien publiés

---

## Notes importantes

### Mises à jour automatiques

Les mises à jour automatiques via `electron-updater` nécessitent :
- Des releases GitHub avec les fichiers `.exe`, `.AppImage`, `.dmg`, etc.
- Un fichier `latest.yml` (généré automatiquement par `electron-builder`)
- La configuration correcte dans `electron-updater-config.js`

---

## Ressources

- [Documentation electron-builder](https://www.electron.build/)
- [Configuration electron-builder](https://www.electron.build/configuration/configuration)
- [GitHub Releases](https://docs.github.com/en/repositories/releasing-projects-on-github)
