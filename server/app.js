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

// Setup
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

const AVWX_TOKEN = process.env.AVWX_TOKEN;
const AIRLABS_KEY = process.env.AIRLABS_KEY;

app.use(morgan('dev'));
app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, './public')));

// DATA STORE -------------------------------------------------
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const noiseFile = path.join(dataDir, 'noise.json');
const alertsFile = path.join(dataDir, 'alerts.json');

if (!fs.existsSync(noiseFile)) fs.writeFileSync(noiseFile, JSON.stringify([]));
if (!fs.existsSync(alertsFile)) fs.writeFileSync(alertsFile, JSON.stringify([]));

const readJSON = f => JSON.parse(fs.readFileSync(f, 'utf-8'));
const writeJSON = (f, o) => fs.writeFileSync(f, JSON.stringify(o, null, 2));

// CACHE -------------------------------------------------------
const cache = new NodeCache({ stdTTL: 120, checkperiod: 60 });


// AVWX --------------------------------------------------------
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


// AIRLABS (FILTRAGE 50km) --------------------------------------

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

  const lat =
    typeof f.lat === 'number' ? f.lat :
    typeof f.latitude === 'number' ? f.latitude :
    f.geography?.lat ?? f.position?.lat;

  const lon =
    typeof f.lng === 'number' ? f.lng :
    typeof f.lon === 'number' ? f.lon :
    f.geography?.lng ?? f.position?.lon;

  if (typeof lat !== 'number' || typeof lon !== 'number') return false;

  return haversineKm(cLat, cLon, lat, lon) <= radiusKm;
}

const AIRPORT_IATA = 'LGG';
const C_LAT = 50.637;
const C_LON = 5.443;

app.get('/api/flights', async (req, res) => {
  try {
    const key = encodeURIComponent(AIRLABS_KEY || '');
    const headers = {
      "User-Agent": "EBLG-Dashboard/1.0",
      "Accept-Encoding": "gzip"
    };

    const base = "https://airlabs.co/api/v9/flights";

    const [dep, arr, over] = await Promise.all([
      axios.get(`${base}?dep_iata=${AIRPORT_IATA}&api_key=${key}`, { headers, timeout: 10000 }),
      axios.get(`${base}?arr_iata=${AIRPORT_IATA}&api_key=${key}`, { headers, timeout: 10000 }),
      axios.get(`${base}?lat=${C_LAT}&lng=${C_LON}&distance=50&api_key=${key}`, { headers, timeout: 10000 })
    ]);

    const deps50 = (dep.data?.response || []).filter(f => withinRadius(f, C_LAT, C_LON, 50));
    const arrs50 = (arr.data?.response || []).filter(f => withinRadius(f, C_LAT, C_LON, 50));
    const ovs50  = over.data?.response || [];

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


// NOISE ---------------------------------------------------------
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
  if (!id || typeof value !== 'number')
    return res.status(400).json({ error: 'id and value required' });

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

  res.json({ ok:true, stored: rec });
});


// GEOFENCES (inchangé)

/* --- API GEOFENCES --- */
app.get('/api/geofences', (req, res) => {
  res.json({
    items: []  // pour l’instant : vide mais VALIDE
  });
});

/* ==========================================================
   API GEOFENCES – EBLG
   ========================================================== */

app.get('/api/geofences', (req, res) => {
  const geofencesEBLG = {
    items: [
      {
        id: "rwy22_approach",
        name: "Approche RWY 22",
        type: "polygon",
        color: "#ff8800",
        points: [
          [50.6370, 5.4430],
          [50.6280, 5.4200],
          [50.6200, 5.3950],
          [50.6150, 5.3800],
          [50.6130, 5.3600],
          [50.6370, 5.4430]
        ]
      },
      {
        id: "rwy04_approach",
        name: "Approche RWY 04",
        type: "polygon",
        color: "#0088ff",
        points: [
          [50.6370, 5.4430],
          [50.6500, 5.4800],
          [50.6600, 5.5100],
          [50.6700, 5.5400],
          [50.6370, 5.4430]
        ]
      },
      {
        id: "st_georges",
        name: "Zone St‑Georges",
        type: "polygon",
        color: "#ff0000",
        points: [
          [50.6030, 5.3500],
          [50.5980, 5.3600],
          [50.5900, 5.3700],
          [50.5850, 5.3600],
          [50.5880, 5.3480],
          [50.6030, 5.3500]
        ]
      },
      {
        id: "verlaine",
        name: "Zone Verlaine",
        type: "polygon",
        color: "#e67e22",
        points: [
          [50.6150, 5.3000],
          [50.6070, 5.3200],
          [50.5950, 5.3120],
          [50.5960, 5.2950],
          [50.6080, 5.2880],
          [50.6150, 5.3000]
        ]
      },
      {
        id: "juprelle",
        name: "Zone Juprelle",
        type: "polygon",
        color: "#2980b9",
        points: [
          [50.7150, 5.5650],
          [50.7050, 5.5800],
          [50.6950, 5.5650],
          [50.7000, 5.5500],
          [50.7100, 5.5500],
          [50.7150, 5.5650]
        ]
      },
      {
        id: "haneffe",
        name: "Zone Haneffe",
        type: "polygon",
        color: "#16a085",
        points: [
          [50.6450, 5.3300],
          [50.6400, 5.3400],
          [50.6300, 5.3300],
          [50.6320, 5.3150],
          [50.6400, 5.3100],
          [50.6450, 5.3300]
        ]
      },
      {
        id: "aineffe",
        name: "Zone Aineffe",
        type: "polygon",
        color: "#8e44ad",
        points: [
          [50.6250, 5.2600],
          [50.6170, 5.2700],
          [50.6100, 5.2580],
          [50.6120, 5.2450],
          [50.6200, 5.2420],
          [50.6250, 5.2600]
        ]
      }
    ]
  };

  res.json(geofencesEBLG);
});

// FALLBACK

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, './public/index.html'));
});

// START
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

process.on('SIGTERM', () => server.close(()=>process.exit(0)));
process.on('SIGINT', () => server.close(()=>process.exit(0)));
``
