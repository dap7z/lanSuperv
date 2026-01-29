# Installation de lanSuperv sur Windows

Ce guide vous permettra d'installer lanSuperv en mode développement sur un windows fraîchement installé.

## Étape 1 ~windows~ : Installation de Cmder 
Pour avoir accès à l'equivalent de certaines commandes linux sur windows, vous pouvez installer Cmder
https://cmder.app/

## Étape 2 ~windows~ : Installation de Node.js 24

lanSuperv nécessite Node.js version 24 ou supérieure. Nous allons installer Node.js 24 LTS  :
Sous windows, lancer l'installation avec lanSuperv/_dev/install/node-v*.*.*-x64.msi
Ou télecharger la dernière version LTS sur https://nodejs.org

```bash
# Vérification de l'installation
npm --version
node --version
```

Vous devriez voir `v24.x.x` pour Node.js.

La compilation de lanSuperv nécessite les outils de microsoft dispo dans _dev/install/.
Voir le fichier _dev/install/install-dev-windows.txt

## Étape 3 ~windows~ : Installation des outils 

Certains modules natifs nécessitent des outils. Installez-les :
lanSuperv/_dev/install/python-2.7.16.amd64.msi
lanSuperv/_dev/install/vs_community_2015.exe

Puis installer globalement node-gyp :
```bash
#Installation des outils de compilations :
npm config set msvs_version 2015 --global
npm install -g node-gyp-install
npm install -g node-gyp
```

> For native modules compilation, install Visual Studio Build Tools or Visual Studio Community
```sh
$ npm config set msvs_version 2015 --global
$ npm install -g node-gyp-install
$ npm install -g node-gyp #(node-gyp have to be installed globaly)
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

## Étape 7 ~windows~ : Configuration du pare-feu (Firewall)

Par défaut, depuis windows 11, les requetes ping ne sont plus autorisés, même sur le profil réseau privé.
Ci dessous la precedure pour l'autoriser :
### En ligne de commande PowerShell : 
```bash
New-NetFirewallRule -DisplayName "Allow ICMP Ping" -Direction Inbound -Protocol ICMPv4 -IcmpType 8 -Action Allow (adaptez pour IPv6).
```
### Ou via l'interface graphique : 
Pare-feu Windows Defender avec sécurité avancée (tapez wf.msc dans Exécuter).
Dans Règles de trafic entrant, trouvez Partage de fichiers et d'imprimantes (Demande d'écho - ICMPv4-In), clic droit > Activer la règle (répétez pour ICMPv6-In).
Appliquez au profil réseau actif


## Étape 8 : Démarrage de l'application

Generer le front web puis démarrez l'application avec :

```bash
npm run dev
npm start
```

L'application devrait démarrer et être accessible à l'adresse `http://<IP>:842`

Pour trouver l'adresse IP de votre machine ~windows~ :

```bash
ipconfig | findstr /i "IPv4"
```

## Étape 9 (Optionnel) ~windows~ : Configuration pour démarrer au boot et ne pas etre limité a l'execution de la console courante

Voir le fichier start-lan-superv.bat à la racine du projet.
La mise en place dans le plannificateur des taches est expliqué en commentaire dans le fichier

## Dépannage

Si l'interface web de l'application n'est pas accessible, autorisé le port 842 au niveau du parfeu ~windows~

Si erreur suivante :
	(index):154  GET http://10.10.1.20:842/dist/bundle.js net::ERR_ABORTED 404 (Not Found)     (index):154  
Alors il faut generer les fichiers dist du front web via : 
```bash
npm run dev
```

Si erreur suivante :
	npm start
    Error: Cannot find module './build/Release/raw.node'
Alors il faut recompilé le module dans node_modules/raw-socket (@justjam2013/raw-socket) : 
```bash
#npm rebuild
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
npm rebuild @justjam2013/raw-socket
cd node_modules\raw-socket
npm run build
```

### Logs de l'application

Si l'application est lancée manuellement, les logs s'affichent directement dans le terminal.