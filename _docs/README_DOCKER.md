# Docker Setup pour LanSuperv

Ce guide explique comment lancer deux instances de LanSuperv dans des conteneurs Docker pour tester la communication WebRTC entre instances.

## Prérequis

- Docker Desktop installé et **démarré** sur Windows/Mac
- Docker et Docker Compose installés sur Linux
- Ports 8421 et 8422 disponibles sur votre machine

### Sur Windows

**Important** : Assurez-vous que Docker Desktop est démarré avant d'exécuter les commandes Docker. Si vous voyez l'erreur :
```
error during connect: in the default daemon configuration on Windows, the docker client must be run with elevated privileges
```

Cela signifie que Docker Desktop n'est pas démarré. Démarrez Docker Desktop depuis le menu Démarrer ou la barre des tâches.

## Structure des fichiers

- `Dockerfile` : Image Docker pour l'application
- `docker-compose.yml` : Configuration pour orchestrer deux instances
- `.dockerignore` : Fichiers à exclure du build Docker

## Utilisation

### 1. Construire les images

```bash
docker-compose build
```

### 2. Lancer les deux instances

```bash
docker-compose up -d
```

### 3. Voir les logs

```bash
# Lancement avec logs
docker compose logs --tail=50 lansuperv-1

# Logs de toutes les instances
docker-compose logs -f

# Logs d'une instance spécifique
docker-compose logs -f lansuperv-1
docker-compose logs -f lansuperv-2
```

### 4. Accéder aux interfaces web

- Instance 1 : http://localhost:8421
- Instance 2 : http://localhost:8422

### 5. Arrêter les instances

```bash
docker-compose down
```

### 6. Arrêter et supprimer les volumes (données)

```bash
docker-compose down -v
```

## Configuration

Les deux instances partagent :
- Le même `DATABASE_NAME` (`db-lansuperv`) pour synchroniser les données
- Le même réseau Docker (`lansuperv-network`) pour la communication WebRTC

Chaque instance a :
- Son propre nom de conteneur (`lansuperv-1` et `lansuperv-2`)
- Son propre port exposé (8421 et 8422)
- Son propre volume de données (`lansuperv-data-1` et `lansuperv-data-2`)
- Sa propre configuration (`config.instance1.js` et `config.instance2.js`)

## Dépannage

### Vérifier que les conteneurs sont en cours d'exécution

```bash
docker-compose ps
```

### Accéder au shell d'un conteneur

```bash
docker exec -it lansuperv-instance-1 /bin/bash
docker exec -it lansuperv-instance-2 /bin/bash
```

### Vérifier la communication réseau entre les conteneurs

```bash
# Depuis l'instance 1, tester la connexion à l'instance 2
docker exec -it lansuperv-instance-1 ping lansuperv-2

# Depuis l'instance 2, tester la connexion à l'instance 1
docker exec -it lansuperv-instance-2 ping lansuperv-1
```

### Mode développement avec montage des sources

Les fichiers sources sont montés en volume dans les conteneurs, ce qui permet de modifier le code sans reconstruire l'image. 

**Important pour le code front-end** : Les modifications du code JavaScript front-end (`web/src/js/*.js`) nécessitent une recompilation avec webpack :

```bash
# Recompiler le bundle front-end
npm run dev

# Ou depuis un conteneur Docker
docker exec -it lansuperv-instance-1 npm run dev
```

**Pour le code serveur** : Les modifications sont prises en compte après un redémarrage du conteneur :

```bash
# Redémarrer un conteneur après modification du code serveur
docker-compose restart lansuperv-1
docker-compose restart lansuperv-2

# Ou redémarrer tous les conteneurs
docker-compose restart
```

**Note** : `node_modules` n'est pas monté en volume (il reste dans l'image) car il contient des modules natifs compilés. Si vous modifiez `package.json`, vous devrez reconstruire l'image :

```bash
docker-compose build
docker-compose up -d
```

## Notes importantes

- Les conteneurs utilisent le mode réseau `bridge` par défaut. Pour accéder au réseau local réel (scan LAN), vous pouvez décommenter `network_mode: "host"` dans `docker-compose.yml`, mais cela nécessite des privilèges supplémentaires.
- Les permissions `NET_RAW` et `NET_ADMIN` sont nécessaires pour le scan réseau LAN.
- Les deux instances doivent avoir le même `DATABASE_NAME` pour que la synchronisation WebRTC fonctionne correctement.
- **Découverte WebRTC (mDNS/Bonjour)** : Dans un réseau Docker bridge, mDNS peut ne pas fonctionner correctement. Les instances peuvent toujours communiquer via HTTP en utilisant les noms de service Docker (`lansuperv-1` et `lansuperv-2`). Si la découverte automatique ne fonctionne pas, les instances peuvent se connecter manuellement via les routes HTTP `/webrtc/offer` et `/webrtc/ice-candidate`.
