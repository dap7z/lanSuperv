FROM node:24-slim

# Hostnames attendus pour les conteneurs :
# - lansuperv-1 (instance 1)
# - lansuperv-2 (instance 2)
# Les hostnames sont définis dans docker-compose.yml

# Installer les dépendances système nécessaires pour les modules natifs
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Créer le répertoire de travail
WORKDIR /app

# Copier les fichiers de configuration des dépendances
COPY package*.json ./

# Installer node-gyp et node-pre-gyp globalement (nécessaires pour wrtc et autres modules natifs)
RUN npm install -g node-gyp node-pre-gyp

# Installer les dépendances
RUN npm install

# Copier le reste de l'application
COPY . .

# Copier et rendre exécutable le script d'entrée
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Exposer le port par défaut (sera surchargé dans docker-compose)
EXPOSE 842

# Utiliser le script d'entrée
ENTRYPOINT ["docker-entrypoint.sh"]

# Commande par défaut
CMD ["node", "start.js"]
