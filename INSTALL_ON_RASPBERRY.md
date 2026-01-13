# Installation de lanSuperv sur Raspberry Pi

Ce guide vous permettra d'installer lanSuperv sur un Raspberry Pi fraîchement installé, en étant connecté en SSH.

## Prérequis

- Raspberry Pi avec Raspberry Pi OS (ou autre distribution Linux basée sur Debian)
- Accès SSH au Raspberry Pi
- Connexion Internet active

## Étape 1 : Mise à jour du système

Avant toute chose, mettez à jour votre système :

```bash
sudo apt update
sudo apt upgrade -y
```

## Étape 2 : Installation de Node.js 24

lanSuperv nécessite Node.js version 24 ou supérieure. Nous allons installer Node.js 24 LTS via NodeSource :

```bash
# Installation des dépendances nécessaires
sudo apt install -y curl

# Ajout du dépôt NodeSource pour Node.js 24
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -

# Installation de Node.js
sudo apt install -y nodejs

# Vérification de l'installation
node --version
npm --version
```

Vous devriez voir `v24.x.x` pour Node.js.

## Étape 3 : Installation de Git

```bash
sudo apt install -y git
```

## Étape 4 : Installation des outils de compilation

Certains modules natifs nécessitent des outils de compilation. Installez-les :

```bash
sudo apt install -y build-essential python3
```

## Étape 5 : Téléchargement du projet

Clonez le dépôt Git du projet :

```bash
# Créer un répertoire pour l'application (optionnel)
mkdir -p ~/shared/apps
cd ~/shared/apps


# Cloner le projet
git clone https://github.com/dap7z/lanSuperv.git

# Entrer dans le répertoire du projet
cd lanSuperv
```

**Note :** Si vous utilisez un dépôt privé, vous devrez peut-être configurer vos identifiants Git ou utiliser SSH.

## Étape 6 : Installation des dépendances npm

```bash
npm install
```

Cette étape peut prendre plusieurs minutes car elle compile les modules natifs.

## Étape 7 : Configuration de l'application

Créez le fichier de configuration à partir de l'exemple :

```bash
cp config.js.sample config.js
nano config.js
=> PARAMS['ENABLE_SCAN'] = true;
```

Vous pouvez éditer le fichier `config.js` si nécessaire (par défaut, le port utilisé est 842 et le scan reseau est desactivé).

## Étape 8 : Configuration du pare-feu (Firewall)

Si vous utilisez `ufw` (Uncomplicated Firewall), déverrouillez le port 842 :

```bash
# Vérifier si ufw est installé
sudo ufw --version

# Si ufw n'est pas installé, l'installer
sudo apt install -y ufw

# Autoriser le port 842 (HTTP) ... et conserver l'accès au port ZZ (SSH) 
sudo ufw allow 842/tcp
sudo ufw allow 22/tcp

# Vérifier le statut du pare-feu
sudo ufw status

# L'activer si necessaire 
sudo ufw enable
```

## Étape 9 : Démarrage de l'application

Démarrez l'application avec :

```bash
npm start
```

L'application devrait démarrer et être accessible à l'adresse `http://<IP_DU_RASPBERRY>:842`

Pour trouver l'adresse IP de votre Raspberry Pi :

```bash
hostname -I
```

## Étape 10 (Optionnel) : Configuration pour démarrer au boot

Pour que l'application démarre automatiquement au boot du Raspberry Pi, vous pouvez créer un service systemd.

### Créer le service systemd

```bash
sudo nano /etc/systemd/system/lansuperv.service
```

Ajoutez le contenu suivant (en adaptant le chemin si nécessaire) :

```ini
[Unit]
Description=lanSuperv - LAN Supervision Service
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/shared/apps/lanSuperv
ExecStart=/usr/bin/node /home/pi/shared/apps/lanSuperv/start.js
Restart=always
RestartSec=360

[Install]
WantedBy=multi-user.target
```

**Important :** Remplacez :
- `User=pi` par votre nom d'utilisateur
- `/home/pi/shared/apps/lanSuperv` par le chemin réel vers votre installation

### Activer et démarrer le service

```bash
# Recharger systemd
sudo systemctl daemon-reload

# Activer le service au boot
sudo systemctl enable lansuperv.service

# Démarrer le service maintenant
sudo systemctl start lansuperv.service

# Vérifier le statut
sudo systemctl status lansuperv.service
```

### Commandes utiles pour gérer le service

```bash
# Arrêter le service
sudo systemctl stop lansuperv.service

# Redémarrer le service
sudo systemctl restart lansuperv.service

# Voir les logs
sudo journalctl -u lansuperv.service -f
```

## Dépannage

Si erreur suivante :
    ERROR! Port 842 is not available!                                                                                                                                           
    Reason : EACCES
Alors autoriser Node à binder sans root (sur Raspberry) :

```bash
sudo apt update && sudo apt install libcap2-bin
sudo setcap 'cap_net_bind_service=+ep' $(which node)
```


Si erreur suivante :
	(index):154  GET http://10.10.1.20:842/dist/bundle.js net::ERR_ABORTED 404 (Not Found)     (index):154  
Alors il faut genrer le fichier via : 
```bash
npm run dev
```

### Logs de l'application

Si l'application est lancée en mode service, consultez les logs :

```bash
sudo journalctl -u lansuperv.service -n 50
```

Si l'application est lancée manuellement, les logs s'affichent directement dans le terminal.

## Accès à l'interface web

Une fois l'application démarrée, accédez à l'interface web depuis n'importe quel navigateur sur le réseau local :

```
http://<IP_DU_RASPBERRY>:842
```

Par exemple : `http://192.168.1.100:842`
