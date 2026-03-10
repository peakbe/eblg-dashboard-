# Dockerfile - EBLG Dashboard (Backend + Front)

# 1. Base Node (version LTS recommandée Render)
FROM node:18-slim

# 2. Définir le dossier de travail
WORKDIR /app

# 3. Copier les fichiers serveur
COPY package.json package-lock.json* ./
COPY app.js ./
COPY data ./data

# 4. Installer les dépendances
RUN npm install --production

# 5. Copier le front-end (dossier public)
COPY ../public ./public

# 6. Exposer le port dynamique fourni par Render
EXPOSE 10000

# 7. Lancer le serveur
CMD ["npm", "start"]
