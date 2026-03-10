# Base Node
FROM node:18-slim

# Workdir
WORKDIR /app

# Copier package.json depuis /server
COPY server/package.json ./package.json
COPY server/package-lock.json ./package-lock.json

# Installer dépendances serveur
RUN npm install --production

# Copier le backend complet
COPY server/app.js ./app.js
COPY server/data ./data

# Copier le FRONT depuis /public
COPY public ./public

# Exposer port (Render utilisera PORT env)
EXPOSE 10000

# Start server
CMD ["npm", "start"]
