import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import morgan from 'morgan';
import cors from 'cors';
import axios from 'axios';
import fs from 'fs';
import NodeCache from 'node-cache';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ------------------- APP ------------------- */
const app = express();
const PORT = process.env.PORT || 8080;

const AVWX_TOKEN = process.env.AVWX_TOKEN;
const AIRLABS_KEY = process.env.AIRLABS_KEY;

app.use(morgan('dev'));
app.use(cors());
app.use(express.json());

/* ------------------- STATIC FRONT ------------------- */
app.use(express.static(path.join(__dirname, './public')));

/* ------------------- DATA STORE ------------------- */
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const noiseFile = path.join(dataDir, 'noise.json');
const alertsFile = path.join(dataDir, 'alerts.json');
if (!fs.existsSync(noiseFile)) fs.writeFileSync(noiseFile, JSON.stringify([]));
if (!fs.existsSync(alertsFile)) fs.writeFileSync(alertsFile, JSON.stringify([]));

const readJSON = (f) => JSON.parse(fs.readFileSync(f, 'utf-8'));
const writeJSON = (f, obj) => fs.writeFileSync(f, JSON.stringify(obj, null, 2));

/* ------------------- CACHE ------------------- */
const cache = new NodeCache({ stdTTL: 120, checkperiod: 60 });

/* ------------------- HEALTHCHECK (optionnel) ------------------- */
app.get('/healthz', (_, res) => res.sendStatus(200));

/* ------------------- AVWX: METAR ------------------- */
app.get('/api/metar', async (req, res) => {
  const icao = (req.query.icao || 'EBLG').toUpperCase();
  try {
    const url = `https://avwx.rest/api/metar/${icao}?format=json&token=${encodeURIComponent(AVWX_TOKEN || '')}`;
    const { data } = await axios.get(url, { timeout: 8000 });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'AVWX METAR error', details: e.message });
  }
});

/* ------------------- AVWX: TAF ------------------- */
app.get('/api/taf', async (req, res) => {
  const icao = (req.query.icao || 'EBLG').toUpperCase();
  try {
    const url = `https://avwx.rest/api/taf/${icao}?format=json&token=${encodeURIComponent(AVWX_TOKEN || '')}`;
    const { data } = await axios.get(url, { timeout: 8000 });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'AVWX TAF error', details: e.message });
  }
});

/* --- Flights (AirLabs) --- */
const AIRPORT_IATA = 'LGG';

// Utilitaires back-end
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon/2)**2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function withinRadius(f, cLat, cLon, radiusKm = 50) {
  if (!f) return false;
  // AirLabs renvoie `lat`/`lng`, mais on garde des fallback robustes
  const lat = (typeof f.lat === 'number') ? f.lat :
              (typeof f.latitude === 'number') ? f.latitude :
              (f.geography?.lat ?? f.position?.lat);
  const lon = (typeof f.lng === 'number') ? f.lng :
              (typeof f.lon === 'number') ? f.lon :
              (f.geography?.lng ?? f.position?.lon);

  if (typeof lat !== 'number' || typeof lon !== 'number') return false;
  return haversineKm(cLat, cLon, lat, lon) <= radiusKm;
}

app.get('/api/flights', async (req, res) => {
  try {
    const key = encodeURIComponent(AIRLABS_KEY || '');
    const headers = {
      "User-Agent": "EBLG-Dashboard/1.0 (+https://eblg-dashboard)",
      "Accept-Encoding": "gzip"
    };
    const base = "https://airlabs.co/api/v9/flights";

    // 1) Appels AirLabs (départs, arrivées, survol rayon 50)
    const [dep, arr, over] = await Promise.all([
      axios.get(`${base}?dep_iata=${AIRPORT_IATA}&api_key=${key}`,  { headers, timeout: 10000 }),
      axios.get(`${base}?arr_iata=${AIRPORT_IATA}&api_key=${key}`,  { headers, timeout: 10000 }),
      axios.get(`${base}?lat=50.637&lng=5.443&distance=50&api_key=${key}`, { headers, timeout: 10000 })
    ]);

    // 2) Filtrage serveur : seulement les vols dans 50 km autour d’EBLG
    const C_LAT = 50.637;
    const C_LON = 5.443;
    const radiusKm = 50;

    const deps50 = (dep.data?.response || []).filter(f => withinRadius(f, C_LAT, C_LON, radiusKm));
    const arrs50 = (arr.data?.response || []).filter(f => withinRadius(f, C_LAT, C_LON, radiusKm));

    // Survols : déjà fournis par AirLabs via lat/lng/distance=50 (on peut renvoyer tels quels)
    const ovs50  = (over.data?.response || []);

    // 3) Réponse normalisée
    res.json({
      departures: deps50,
      arrivals:   arrs50,
      over:       ovs50
    });
  } catch (e) {
    res.status(500).json({
      error: 'AirLabs error',
      details: e?.response?.data || e.message
    });
  }
});


/* ------------------- GEOFENCES (Nominatim) ------------------- */
function extractPolygonsFromGeojson(geojson) {
  const polys = [];
  if (!geojson) return polys;
  const toLatLon = coords => coords.map(pt => [pt[1], pt[0]]); // [lat, lon]

  if (geojson.type === 'Polygon') {
    polys.push(toLatLon(geojson.coordinates[0]));
  } else if (geojson.type === 'MultiPolygon') {
    for (const poly of geojson.coordinates) polys.push(toLatLon(poly[0]));
  }
  return polys;
}

async function fetchBoundaryByName(name) {
  const url = 'https://nominatim.openstreetmap.org/search';
  const params = { q: `${name}, Belgium`, format: 'jsonv2', polygon_geojson: 1, addressdetails: 1 };
  const headers = { 'User-Agent': 'EBLG-Dashboard/1.0 (contact@example.com)' };
  const { data } = await axios.get(url, { params, headers, timeout: 15000 });

  const candidates = (data || []).filter(r => r.geojson);
  const prefer = candidates.find(r => ['administrative','municipality','town','village'].includes(r.type)) || candidates[0];
  if (!prefer) return null;

  const polys = extractPolygonsFromGeojson(prefer.geojson);
  // simplification légère
  return polys.map(poly => poly.filter((_, i) => i % 3 === 0));
}

app.get('/api/geofences', async (req, res) => {
  try {
    const names = ['Saint-Georges-sur-Meuse', 'Verlaine', 'Houtain-Saint-Siméon', 'Wonck'];
    const result = {};
    for (const n of names) {
      try { result[n] = await fetchBoundaryByName(n); }
      catch { result[n] = null; }
    }
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: 'Geofence error', details: e.message });
  }
});

/* ------------------- NOISE API ------------------- */
app.get('/api/noise/latest', (req, res) => {
  const all = readJSON(noiseFile);
  const latest = all.length ? all[all.length - 1] : null;
  res.json(latest);
});

app.get('/api/noise/history', (req, res) => {
  const { from, to, id } = req.query;
  let data = readJSON(noiseFile);
  if (id) data = data.filter(d => d.id === id);
  if (from) data = data.filter(d => new Date(d.ts) >= new Date(from));
  if (to) data = data.filter(d => new Date(d.ts) <= new Date(to));
  res.json({ items: data.slice(-5000) });
});

app.post('/api/noise/ingest', (req, res) => {
  const { id, value, lat, lon, meta } = req.body || {};
  if (!id || typeof value !== 'number') {
    return res.status(400).json({ error: 'id and value required' });
  }
  const rec = {
    id, value,
    lat: typeof lat === 'number' ? lat : null,
    lon: typeof lon === 'number' ? lon : null,
    meta: meta || null,
    ts: new Date().toISOString()
  };
  const all = readJSON(noiseFile);
  all.push(rec);
  writeJSON(noiseFile, all);
  res.json({ ok: true, stored: rec });
});

/* ------------------- FALLBACK FRONT ------------------- */
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, './public/index.html'));
});

/* ------------------- START ------------------- */
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

/* ------------------- GRACEFUL SHUTDOWN ------------------- */
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Closing server gracefully...');
  server.close(() => process.exit(0));
});
