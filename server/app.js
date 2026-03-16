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

const app = express();
const PORT = process.env.PORT || 8080;

const AVWX_TOKEN = process.env.AVWX_TOKEN;
const AIRLABS_KEY = process.env.AIRLABS_KEY;

app.use(morgan('dev'));
app.use(cors());
app.use(express.json());

// Serve front-end static assets
app.use(express.static(path.join(__dirname, './public')));

// Data store
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const noiseFile = path.join(dataDir, 'noise.json');
const alertsFile = path.join(dataDir, 'alerts.json');
if (!fs.existsSync(noiseFile)) fs.writeFileSync(noiseFile, JSON.stringify([]));
if (!fs.existsSync(alertsFile)) fs.writeFileSync(alertsFile, JSON.stringify([]));
const readJSON = (f) => JSON.parse(fs.readFileSync(f, 'utf-8'));
const writeJSON = (f, obj) => fs.writeFileSync(f, JSON.stringify(obj, null, 2));

// Cache
const cache = new NodeCache({ stdTTL: 120, checkperiod: 60 });

// --- METAR ---
app.get('/api/metar', async (req, res) => {
  const icao = (req.query.icao || 'EBLG').toUpperCase();
  try {
    const url = `https://avwx.rest/api/metar/${icao}?format=json&token=${encodeURIComponent(AVWX_TOKEN||'')}`;
    const { data } = await axios.get(url, { timeout: 8000 });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'AVWX METAR error', details: e.message });
  }
});

// --- TAF ---
app.get('/api/taf', async (req, res) => {
  const icao = (req.query.icao || 'EBLG').toUpperCase();
  try {
    const url = `https://avwx.rest/api/taf/${icao}?format=json&token=${encodeURIComponent(AVWX_TOKEN||'')}`;
    const { data } = await axios.get(url, { timeout: 8000 });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'AVWX TAF error', details: e.message });
  }
});

// --- Flights (AirLabs) ---
const AIRPORT_IATA = 'LGG';
app.get('/api/flights', async (req, res) => {
  try {
    const base = 'https://api.airlabs.co/v9/flights';
    const key = encodeURIComponent(AIRLABS_KEY||'');
    const [dep, arr, over] = await Promise.all([
      axios.get(`${base}?dep_iata=${AIRPORT_IATA}&api_key=${key}`, { timeout: 8000 }),
      axios.get(`${base}?arr_iata=${AIRPORT_IATA}&api_key=${key}`, { timeout: 8000 }),
      axios.get(`${base}?lat=50.637&lng=5.443&distance=50&api_key=${key}`, { timeout: 8000 })
    ]);
    res.json({
      departures: dep?.data?.response || [],
      arrivals: arr?.data?.response || [],
      over: over?.data?.response || []
    });
  } catch (e) {
    res.status(500).json({ error: 'AirLabs error', details: e.message });
  }
});

// --- Geofences (Nominatim) ---
function extractPolygonsFromGeojson(geojson) {
  const polys = [];
  if (!geojson) return polys;
  const toLatLon = coords => coords.map(pt => [pt[1], pt[0]]);
  if (geojson.type === 'Polygon') polys.push(toLatLon(geojson.coordinates[0]));
  if (geojson.type === 'MultiPolygon') {
    for (const poly of geojson.coordinates) polys.push(toLatLon(poly[0]));
  }
  return polys;
}

async function fetchBoundaryByName(name) {
  const url = 'https://nominatim.openstreetmap.org/search';
  const params = { q: name + ', Belgium', format: 'jsonv2', polygon_geojson: 1, addressdetails: 1 };
  const headers = { 'User-Agent': 'EBLG-Dashboard/1.0 (contact@example.com)' };
  const { data } = await axios.get(url, { params, headers, timeout: 15000 });
  const candidates = (data || []).filter(r => r.geojson);
  const prefer = candidates.find(r => ['administrative','municipality','town','village'].includes(r.type)) || candidates[0];
  if (!prefer) return null;
  const polys = extractPolygonsFromGeojson(prefer.geojson);
  const simplified = polys.map(poly => poly.filter((_, i) => i % 3 === 0));
  return simplified;
}

app.get('/api/geofences', async (req, res) => {
  try {
    const names = [ 'Saint-Georges-sur-Meuse', 'Verlaine', 'Houtain-Saint-Siméon', 'Wonck' ];
    const result = {};
    for (const n of names) {
      try { result[n] = await fetchBoundaryByName(n); } catch { result[n] = null; }
    }
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: 'Geofence error', details: e.message });
  }
});

// --- Noise API ---
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
  if (!id || typeof value !== 'number') return res.status(400).json({ error: 'id and value required' });
  const rec = { id, value, lat: typeof lat==='number'?lat:null, lon: typeof lon==='number'?lon:null, meta: meta||null, ts: new Date().toISOString() };
  const all = readJSON(noiseFile); all.push(rec); writeJSON(noiseFile, all);
  res.json({ ok: true, stored: rec });
});

/* ==========================================================
   TOOLS
   ========================================================== */
import axios from "axios";

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

/* ==========================================================
   ROUTE DIAGNOSTIC AIRLABS
   ========================================================== */
app.get("/api/_diag/airlabs", async (req, res) => {
  const AIRLABS_KEY = process.env.AIRLABS_KEY || "";
  const BASE = "https://airlabs.co/api/v9";

  const result = {
    now: new Date().toISOString(),
    env: { airlabs_key_present: AIRLABS_KEY ? true : false },
    checks: [],
    summary: "UNKNOWN"
  };

  if (!AIRLABS_KEY) {
    result.summary = "FAIL";
    result.checks.push({
      name: "env.AIRLABS_KEY",
      ok: false,
      error: "Missing AIRLABS_KEY"
    });
    return res.status(500).json(result);
  }

  async function ping(name, url, params = {}) {
    const started = Date.now();
    try {
      const r = await axios.get(url, {
        params: { api_key: AIRLABS_KEY, ...params },
        headers: {
          "User-Agent": "EBLG-Dashboard/diag",
          "Accept-Encoding": "gzip"
        },
        timeout: 10000
      });
      const ms = Date.now() - started;
      const body = r.data || {};
      const count = Array.isArray(body.response) ? body.response.length : 0;
      return { name, ok: true, status: r.status, ms, count };
    } catch (e) {
      const ms = Date.now() - started;
      return {
        name, ok: false, ms,
        status: e?.response?.status,
        error: e?.response?.data || e.message
      };
    }
  }

  const checks = await Promise.all([
    ping("dep_lgg", `${BASE}/flights`, { dep_iata: "LGG" }),
    ping("arr_lgg", `${BASE}/flights`, { arr_iata: "LGG" }),
    ping("all",     `${BASE}/flights`) // base dataset
  ]);

  result.checks = checks;

  const okCount = checks.filter(c => c.ok).length;
  if (okCount === checks.length)      result.summary = "OK";
  else if (okCount > 0)              result.summary = "PARTIAL";
  else                               result.summary = "FAIL";

  const code =
    result.summary === "OK"      ? 200 :
    result.summary === "PARTIAL" ? 207 :
                                   502;

  return res.status(code).json(result);
});

/* ==========================================================
   ROUTE /api/flights — VERSION 2026 CORRIGÉE
   ========================================================== */
app.get("/api/flights", async (req, res) => {
  const { scope = "near" } = req.query;
  const AIRLABS_KEY = process.env.AIRLABS_KEY || "";
  const BASE = "https://airlabs.co/api/v9";

  const C_LAT = 50.6370;
  const C_LON = 5.4430;

  if (!AIRLABS_KEY) {
    return res.status(500).json({
      error: "AirLabs error",
      details: "Missing AIRLABS_KEY"
    });
  }

  try {
    const headers = {
      "User-Agent": "EBLG-Dashboard/1.0",
      "Accept-Encoding": "gzip"
    };

    const [depR, arrR, allR] = await Promise.all([
      axios.get(`${BASE}/flights`, {
        params: { dep_iata: "LGG", api_key: AIRLABS_KEY },
        headers, timeout: 10000
      }),
      axios.get(`${BASE}/flights`, {
        params: { arr_iata: "LGG", api_key: AIRLABS_KEY },
        headers, timeout: 10000
      }),
      axios.get(`${BASE}/flights`, {
        params: { api_key: AIRLABS_KEY },
        headers, timeout: 10000
      })
    ]);

    const dep = depR.data?.response || [];
    const arr = arrR.data?.response || [];
    const all = allR.data?.response || [];

    // Mode RAW complet
    if (scope === "all") {
      return res.json({
        departures: dep,
        arrivals: arr,
        over: all
      });
    }

    // Mode NEAR 50 km
    const dep50 = dep.filter(f =>
      typeof f.lat === "number" &&
      typeof f.lng === "number" &&
      haversineKm(C_LAT, C_LON, f.lat, f.lng) <= 50
    );

    const arr50 = arr.filter(f =>
      typeof f.lat === "number" &&
      typeof f.lng === "number" &&
      haversineKm(C_LAT, C_LON, f.lat, f.lng) <= 50
    );

    const over50 = all.filter(f =>
      typeof f.lat === "number" &&
      typeof f.lng === "number" &&
      haversineKm(C_LAT, C_LON, f.lat, f.lng) <= 50
    );

    return res.json({
      departures: dep50,
      arrivals: arr50,
      over: over50
    });

  } catch (e) {
    console.error("AirLabs /api/flights error:", e?.response?.data || e.message);
    return res.status(500).json({
      error: "AirLabs error",
      details: e?.response?.data || e.message
    });
  }
});

// Fallback -> index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, './public/index.html'));
});

const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received. Closing server gracefully...');
  server.close(() => process.exit(0));
});
process.on('SIGINT', () => {
  console.log('SIGINT received. Closing server gracefully...');
  server.close(() => process.exit(0));
});
