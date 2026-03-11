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

/* ------------------- AIRLABS: FLIGHTS ------------------- */
/* !! Nouveau domaine 2025+ : https://airlabs.co/api/v9/  */
const AIRPORT_IATA = 'LGG';

app.get('/api/flights', async (req, res) => {
  try {
    const base = 'https://airlabs.co/api/v9/flights';
    const key = encodeURIComponent(AIRLABS_KEY || '');

    const [dep, arr, over] = await Promise.all([
      axios.get(`${base}?dep_iata=${AIRPORT_IATA}&api_key=${key}`, { timeout: 10000 }),
      axios.get(`${base}?arr_iata=${AIRPORT_IATA}&api_key=${key}`, { timeout: 10000 }),
      axios.get(`${base}?lat=50.637&lng=5.443&distance=50&api_key=${key}`, { timeout: 10000 })
    ]);

    res.json({
      departures: dep?.data?.response || [],
      arrivals:   arr?.data?.response || [],
      over:       over?.data?.response || []
    });
  } catch (e) {
    res.status(500).json({ error: 'AirLabs error', details: e.message });
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
