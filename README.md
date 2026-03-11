# EBLG Dashboard (AVWX + AirLabs + OSM geofence + Noise)

## Déploiement Render (front + backend Node)

1. Poussez ce dossier sur GitHub (branche `main`).
2. Sur https://render.com → New → **Web Service** → sélectionnez ce repo.
3. Render détecte `render.yaml`. Ajoutez les variables d'environnement :
   - `AVWX_TOKEN=...`
   - `AIRLABS_KEY=...`
   - `PORT=10000`
4. Create Web Service → Manual Deploy → **Clear build cache & deploy**.

Une fois déployé : `https://<votre-service>.onrender.com/`
