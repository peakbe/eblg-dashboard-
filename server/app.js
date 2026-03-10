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

// FRONTEND statique
app.use(express.static(path.join(__dirname, '../public')));

// DATA store
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const noiseFile = path.join(dataDir, 'noise.json');
const alertsFile = path.join(dataDir, 'alerts.json');
if (!fs.existsSync(noiseFile)) fs.writeFileSync(noiseFile, JSON.stringify([]));
if (!fs.existsSync(alertsFile)) fs.writeFileSync(alertsFile, JSON.stringify([]));

const readJSON = f => JSON.parse(fs.readFileSync(f, 'utf-8'));
const writeJSON = (f, obj) => fs.writeFileSync(f, JSON.stringify(obj, null, 2));

// CACHE
const cache = new NodeCache({ stdTTL: 120, checkperiod: 60 });

// --------------------- METAR ---------------------
app.get('/api/metar', async (req, res) => {
  const icao = (req.query.icao || 'EBLG').toUpperCase();
  try {
    const url = `https://avwx.rest/api/metar/${icao}?format=json&token=${AVWX_TOKEN}`;
    const { data } = await axios.get(url);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'AVWX METAR error', details: e.message });
  }
});

// --------------------- TAF ---------------------
app.get('/api/taf', async (req, res) => {
  const icao = (req.query.icao || 'EBLG').toUpperCase();
  try {
    const url = `https://avwx.rest/api/taf/${icao}?format=json&token=${AVWX_TOKEN}`;
    const { data } = await axios.get(url);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'AVWX TAF error', details: e.message });
  }
});

// --------------------- AirLabs FLIGHTS ---------------------
const AIRPORT_IATA = 'LGG';

app.get('/api/flights', async (req, res) => {
  try {
    const akey = encodeURIComponent(AIRLABS_KEY);
    const base = 'https://api.airlabs.co/v9/flights';

    const dep  = await axios.get(`${base}?dep_iata=${AIRPORT_IATA}&api_key=${akey}`);
    const arr  = await axios.get(`${base}?arr_iata=${AIRPORT_IATA}&api_key=${akey}`);
    const over = await axios.get(`${base}?lat=50.637&lng=5.443&distance=50&api_key=${akey}`);

    res.json({
      departures: dep.data.response || [],
      arrivals: arr.data.response || [],
      over: over.data.response || []
    });
  } catch (e) {
    res.status(500).json({ error: 'AirLabs error', details: e.message });
  }
});

// --------------------- Noise ---------------------
app.get('/api/noise/latest', (req, res) => {
  const all = readJSON(noiseFile);
  res.json(all.at(-1) || null);
});

// --------------------- START SERVER ---------------------
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
