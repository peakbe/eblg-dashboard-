###############################################
# 1) STAGE DE BUILD – Dépendances + Front
###############################################
FROM node:18-slim AS builder

# Dossier de travail
WORKDIR /app

########### BACK-END ###########
# Copier package.json du serveur
COPY server/package.json ./package.json
COPY server/package-lock.json ./package-lock.json

# Installer les dépendances backend
RUN npm install --production

# Copier le backend complet
COPY server/app.js ./app.js
COPY server/data ./data

########### FRONT-END ###########
# Copier le dossier public
COPY public ./public

# (Optionnel) Optimisation front si besoin
# Ici, pas de build front (HTML/CSS/JS statique simple)
# Mais on pourrait ajouter minification future

###############################################
# 2) STAGE FINAL – Image ultra légère
###############################################
FROM node:18-slim AS runner

WORKDIR /app

# Copier uniquement ce qui est nécessaire au runtime
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/app.js ./app.js
COPY --from=builder /app/data ./data
COPY --from=builder /app/public ./public

# Port géré par Render via variable ENV PORT
EXPOSE 10000

CMD ["npm", "start"]
