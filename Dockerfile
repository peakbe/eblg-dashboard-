FROM node:18-slim AS builder
WORKDIR /app
COPY server/package.json ./package.json
COPY server/package-lock.json ./package-lock.json
RUN npm install --production
COPY server/app.js ./app.js
COPY server/data ./data
COPY public ./public
FROM node:18-slim AS runner
WORKDIR /app
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/app.js ./app.js
COPY --from=builder /app/data ./data
COPY --from=builder /app/public ./public
EXPOSE 10000
CMD ["npm","start"]