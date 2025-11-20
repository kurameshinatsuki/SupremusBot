FROM node:20

WORKDIR /app

# Copier les fichiers de configuration
COPY package*.json ./
COPY .env ./

# Installer les dépendances
RUN npm install --only=production

# Copier le code source
COPY . .

# Créer le dossier auth pour les sessions
RUN mkdir -p auth

# Exposer le port (optionnel)
EXPOSE 3000

# Commande de démarrage
CMD ["npm", "start"]
