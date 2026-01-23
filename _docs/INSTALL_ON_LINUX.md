# Installation de lanSuperv sur Ubuntu et Raspberry Pi

Ce guide vous permettra d'installer lanSuperv sur un linux type debian fraîchement installé, en étant connecté en SSH.

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
npm --version
node --version
```

Vous devriez voir `v24.x.x` pour Node.js.

## Étape 3 ~raspberry~ : Installation des outils 

Certains modules natifs nécessitent des outils. Installez-les :

```bash
#Installation des outils de compilations :
sudo apt install -y build-essential python3

#Installation des outils reseaux :
sudo apt install -y bind9-host
(la commande hostname n'est pas installé de base sur un Raspberry Pi)
```

## Étape 4 : Téléchargement du projet

Clonez le dépôt Git du projet :

```bash
cd /la/ou/vous/voulez/installer/lappli

# Cloner le projet
git clone https://github.com/dap7z/lanSuperv.git

# Entrer dans le répertoire du projet
cd lanSuperv
```

## Étape 5 : Installation des dépendances npm

```bash
#Installation des outils de compilation :
npm install node-pre-gyp
#Installation des librairies nodejs utilises par l'application :
npm install
```

Cette étape peut prendre plusieurs minutes car elle compile les modules natifs.

## Étape 6 : Configuration de l'application

Créez le fichier de configuration à partir de l'exemple :
(par défaut, le port utilisé est 842 et le scan reseau est desactivé)

```bash
cp config.js.sample config.js
nano config.js
=> PARAMS['ENABLE_SCAN'] = true;
```

## Étape 7 : Configuration du pare-feu (Firewall)

Si vous utilisez `ufw` (Uncomplicated Firewall), déverrouillez le port 842 :

```bash
# Vérifier si ufw est installé puis le statut du pare-feu
sudo ufw --version
sudo ufw status

# Si parefeu installé et actif, autoriser le port 842 (HTTP)
sudo ufw allow 842/tcp
```

## Étape 8 : Démarrage de l'application

Generer le front web puis démarrez l'application avec :

```bash
npm run dev
npm start
```

L'application devrait démarrer et être accessible à l'adresse `http://<IP>:842`

Pour trouver l'adresse IP de votre machine linux :

```bash
hostname -I
```

## Étape 9 (Optionnel) : Configuration pour démarrer au boot et ne pas etre limité a l'execution de la console courante

Pour que l'application démarre automatiquement au boot, vous pouvez créer un service systemd.

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
//User=pi
WorkingDirectory=/home/pi/apps/lanSuperv
ExecStart=/usr/bin/node /home/pi/apps/lanSuperv/start.js
Restart=always
RestartSec=360

[Install]
WantedBy=multi-user.target
```

**Important :** Remplacez :
- `User=pi` par votre nom d'utilisateur ou commenter la ligne si seul root peut s'attribuer le port
- `/home/pi/apps/lanSuperv` par le chemin réel vers votre installation

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
Alors autoriser Node à binder sans root (necessaire au moins sur Raspberry, mais pas forcement suffisant...) :

```bash
sudo apt update && sudo apt install libcap2-bin
sudo setcap 'cap_net_bind_service=+ep' $(which node)
```


Si erreur suivante :
	(index):154  GET http://10.10.1.20:842/dist/bundle.js net::ERR_ABORTED 404 (Not Found)     (index):154  
Alors il faut generer les fichiers dist du front web via : 
```bash
npm run dev
```

### Logs de l'application

Si l'application est lancée manuellement, les logs s'affichent directement dans le terminal.
Si l'application est lancée en mode service ~linux~, consultez les logs :

```bash
sudo journalctl -u lansuperv.service -n 50
```