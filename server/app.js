// =============================================================
//  EBLG DASHBOARD — SERVER APP (Hybride FIDS + AirLabs + Open‑Meteo)
//  >>> PARTIE 1/3 <<<
//  - Express + static
//  - Cache
//  - Utils
//  - METAR/TAF : Open‑Meteo Aviation (brut + décodé)
//  - FIDS LGG : parsing HTML → JSON
// =============================================================

import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import axios from "axios";
import * as cheerio from "cheerio";
import NodeCache from "node-cache";

// ---------- Resolve dirname (ESM) ----------
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ---------- App ----------
const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "./public")));

// ---------- Cache 60s ----------
const cache = new NodeCache({ stdTTL: 60, checkperiod: 20 });

// =============================================================
//  Utils
// =============================================================
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2
          + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2))
          * Math.sin(dLon/2)**2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// =============================================================
//  METAR & TAF — Open‑Meteo Aviation (Option A : brut + décodé)
//  - METAR : renvoie { raw_text, decoded{...} } pour l’ICAO demandé
//  - TAF   : renvoie un objet de prévisions "aviation-like" (TAF‑like)
//    NB : ce n’est PAS un TAF officiel, mais une prévision aviation
// =============================================================

// Helper METAR Open‑Meteo (renvoie { raw_text, decoded:{} })
async function fetchOpenMeteoMetar(icao) {
  // cache 60s par ICAO
  const key = `om:metar:${icao}`;
  const cached = cache.get(key);
  if (cached) return cached;

  // Endpoint aviation (sans clé) — format JSON simple
  // On demande un METAR-like comprenant le brut + les champs décodés.
  const url = "https://api.open-meteo.com/v1/air-aviation";
  const params = { icao, format: "json", metar: "true" };

  const r = await axios.get(url, { params, timeout: 10000, headers: { "User-Agent": "EBLG-Dashboard/OM-METAR" }});
  const data = r.data || {};

  // Normalisation de la forme attendue par le front
  const result = {
    icao: icao.toUpperCase(),
    raw_text: data?.metar?.raw_text || data?.raw_text || null,
    decoded: {
      temperature:      data?.metar?.temperature ?? data?.temperature ?? null,
      dewpoint:         data?.metar?.dewpoint ?? data?.dewpoint ?? null,
      wind_direction:   data?.metar?.wind_direction ?? data?.wind_direction ?? null,
      wind_speed:       data?.metar?.wind_speed ?? data?.wind_speed ?? null,
      visibility:       data?.metar?.visibility ?? data?.visibility ?? null,
      clouds:           data?.metar?.clouds ?? data?.clouds ?? [],
      qnh:              data?.metar?.qnh ?? data?.qnh ?? null
    }
  };

  cache.set(key, result);
  return result;
}

// Helper "TAF-like" (prévision aviation Open‑Meteo)
// On retourne une structure simple : { icao, forecast:[ ...items horaire... ] }
async function fetchOpenMeteoTafLike(icao) {
  const key = `om:taf:${icao}`;
  const cached = cache.get(key);
  if (cached) return cached;

  // On utilise le même endpoint aviation en demandant des variables horaires
  // NB : cette partie "TAF-like" est une prévision, pas un TAF officiel.
  const url = "https://api.open-meteo.com/v1/air-aviation";
  const params = {
    icao,
    format: "json",
    // variables horaires courantes pour une prévision "aviation-like"
    hourly: [
      "temperature_2m",
      "dewpoint_2m",
      "wind_speed_10m",
      "wind_direction_10m",
      "visibility",
      "cloud_base",
      "pressure_msl"
    ].join(",")
  };

  const r = await axios.get(url, { params, timeout: 12000, headers: { "User-Agent": "EBLG-Dashboard/OM-TAF" }});
  const d = r.data || {};
  const times   = d?.hourly?.time || [];
  const temps   = d?.hourly?.temperature_2m || [];
  const dewpts  = d?.hourly?.dewpoint_2m || [];
  const wspd    = d?.hourly?.wind_speed_10m || [];
  const wdir    = d?.hourly?.wind_direction_10m || [];
  const vis     = d?.hourly?.visibility || [];
  const base    = d?.hourly?.cloud_base || [];
  const qnh     = d?.hourly?.pressure_msl || [];

  const forecast = times.map((t, i) => ({
    time: t,
    temperature: temps[i] ?? null,
    dewpoint: dewpts[i] ?? null,
    wind_speed: wspd[i] ?? null,
    wind_direction: wdir[i] ?? null,
    visibility: vis[i] ?? null,
    cloud_base: base[i] ?? null,
    qnh: qnh[i] ?? null
  }));

  const result = { icao: icao.toUpperCase(), forecast };
  cache.set(key, result);
  return result;
}

// --- Routes METAR/TAF ---
app.get("/api/metar", async (req, res) => {
  const { icao } = req.query;
  if (!icao) return res.status(400).json({ error: "Missing ICAO" });
  try {
    const metar = await fetchOpenMeteoMetar(icao);
    return res.json(metar);
  } catch (e) {
    return res.status(500).json({ error: "Open‑Meteo METAR error", details: e.message });
  }
});

app.get("/api/taf", async (req, res) => {
  const { icao } = req.query;
  if (!icao) return res.status(400).json({ error: "Missing ICAO" });
  try {
    const taf = await fetchOpenMeteoTafLike(icao);
    return res.json(taf);
  } catch (e) {
    return res.status(500).json({ error: "Open‑Meteo TAF‑like error", details: e.message });
  }
});

// =============================================================
//  FIDS LGG — Parse HTML https://fids.liegeairport.com/spw → JSON
//  - On lit les <table> et leur <thead>/<tbody>
//  - On mappe dynamiquement via l’entête (FR/EN), puis on normalise
//  - Résultat : { departures:[], arrivals:[] }
// =============================================================
async function fetchFidsLGG() {
  const c = cache.get("fids:lgg");
  if (c) return c;

  const url = "https://fids.liegeairport.com/spw"; // page publique FIDS
  const html = await axios.get(url, {
    timeout: 12000,
    headers: {
      "User-Agent": "EBLG-Dashboard/FIDS (+https://eblg-dashboard.onrender.com)",
      "Accept": "text/html"
    }
  });

  const $ = cheerio.load(html.data);

  const blocks = [];
  $("table").each((i, table) => {
    // Titre de section (Departures / Arrivals) juste au-dessus de la table
    const title = $(table).prevAll("h2, h3").first().text().trim().toLowerCase();
    const dir = title.includes("dep") ? "departures"
             : title.includes("arr") ? "arrivals"
             : (i === 0 ? "departures" : "arrivals"); // fallback robuste

    // En-têtes colonnes
    const headers = $(table).find("thead th").map((_, th) => $(th).text().trim().toLowerCase()).get();

    // Lignes
    const rows = [];
    $(table).find("tbody tr").each((_, tr) => {
      const cells = $(tr).find("td").map((__, td) => $(td).text().trim()).get();
      if (!cells.length) return;

      // Crée un dict { header: cellValue }
      const row = {};
      headers.forEach((h, idx) => { row[h] = cells[idx] ?? ""; });

      // Normalisation : on garde un schéma stable pour le front
      rows.push({
        date:      row["date"] || row["day"] || null,
        flight:    row["flight"] || row["vol"] || row["flt"] || null,
        reg:       row["a/c reg."] || row["reg"] || row["registration"] || null,
        ac_type:   row["a/c type"] || row["type"] || null,
        origin:    row["origin"] || row["from"] || null,
        dest:      row["dest"] || row["to"] || null,
        via:       row["via"] || null,
        stand:     row["stand"] || null,
        handler:   row["handler"] || null,
        sched:     row["sched."] || row["sta"] || row["std"] || null,
        est:       row["est."] || row["eta"] || row["etd"] || null,
        actual:    row["actual"] || row["landed"] || null,
        block:     row["block time"] || row["on block"] || null,
        runway:    row["runway"] || null,
        direction: dir
      });
    });

    blocks.push({ dir, rows });
  });

  const departures = blocks.filter(b => b.dir === "departures").flatMap(b => b.rows);
  const arrivals   = blocks.filter(b => b.dir === "arrivals").flatMap(b => b.rows);

  const payload = { departures, arrivals, source: "FIDS" };
  cache.set("fids:lgg", payload);
  return payload;
}

// --- Route FIDS ---
app.get("/api/flights/fids", async (req, res) => {
  try {
    const data = await fetchFidsLGG();
    res.setHeader("X-Source-Planning", "FIDS-LGG");
    return res.json({ departures: data.departures, arrivals: data.arrivals });
  } catch (e) {
    console.error("FIDS LGG ERROR:", e.message);
    return res.status(500).json({ error: "FIDS error", details: e.message });
  }
});

// >>> FIN PARTIE 1/3
// =============================================================
//  AIRLABS — GEO POSITIONS (carte)
//  - Retourne les avions avec lat/lng (pour drawFlights → "over")
//  - Cache 60 s
//  - Tolère absence de clé (retourne over:[] sans erreur)
// =============================================================
async function fetchAirLabsPositions() {
  const AIRLABS_KEY = process.env.AIRLABS_KEY || "";
  // Pas de clé → on ne casse pas le front
  if (!AIRLABS_KEY) return { over: [], source: "none", note: "No AIRLABS_KEY" };

  const c = cache.get("airlabs:positions");
  if (c) return c;

  try {
    const r = await axios.get("https://airlabs.co/api/v9/flights", {
      params: { api_key: AIRLABS_KEY },
      timeout: 12000,
      headers: { "User-Agent": "EBLG-Dashboard-Positions" }
    });

    const all = r.data?.response || [];
    // On conserve uniquement les objets avec lat/lng pour la carte
    const over = all.filter(f => typeof f.lat === "number" && typeof f.lng === "number");

    const payload = { over, source: "AirLabs" };
    cache.set("airlabs:positions", payload);
    return payload;

  } catch (e) {
    // Si quota dépassé / erreur → on renvoie over:[] afin de ne pas interrompre le front
    console.error("AirLabs POS ERROR:", e?.response?.data || e.message);
    return { over: [], source: "AirLabs/error", error: e.message };
  }
}

// --- Route positions (pour debug direct si besoin) ---
app.get("/api/flights/positions", async (req, res) => {
  try {
    const pos = await fetchAirLabsPositions();
    res.setHeader("X-Source-Positions", pos.source || "none");
    return res.json({ over: pos.over || [] });
  } catch (e) {
    return res.status(500).json({ error: "AirLabs error", details: e.message });
  }
});

// =============================================================
//  FLIGHTS (HYBRIDE) — FIDS (planning) + AirLabs (positions)
//  - Unifie le format consommé par ton front :
//      { departures:[], arrivals:[], over:[] }
//  - Ajoute des en‑têtes pour diagnostiquer la source
// =============================================================
app.get("/api/flights", async (req, res) => {
  try {
    const [fids, pos] = await Promise.all([
      fetchFidsLGG(),         // planning officiel LGG
      fetchAirLabsPositions() // positions pour la carte
    ]);

    res.setHeader("X-Source-Planning",  "FIDS-LGG");
    res.setHeader("X-Source-Positions", pos.source || "none");

    return res.json({
      departures: fids.departures,
      arrivals:   fids.arrivals,
      over:       pos.over || []
    });

  } catch (e) {
    console.error("Hybrid flights ERROR:", e.message);
    return res.status(500).json({ error: "Hybrid flights error", details: e.message });
  }
});

// >>> FIN PARTIE 2/3
// =============================================================
//  DIAGNOSTIC AirLabs
//  - Vérifie la connectivité / validité clé
//  - Renvoie un résumé OK / PARTIAL / FAIL
// =============================================================
app.get("/api/_diag/airlabs", async (req, res) => {
  const AIRLABS_KEY = process.env.AIRLABS_KEY || "";
  const BASE = "https://airlabs.co/api/v9";

  const result = {
    now: new Date().toISOString(),
    env: { airlabs_key_present: !!AIRLABS_KEY },
    checks: [],
    summary: "UNKNOWN"
  };

  if (!AIRLABS_KEY) {
    result.summary = "FAIL";
    result.checks.push({ name: "env.AIRLABS_KEY", ok: false, error: "Missing AIRLABS_KEY" });
    return res.status(500).json(result);
  }

  async function ping(name, params) {
    const started = Date.now();
    try {
      const r = await axios.get(`${BASE}/flights`, {
        params: { api_key: AIRLABS_KEY, ...params },
        headers: { "User-Agent": "EBLG-Dashboard/diag", "Accept-Encoding": "gzip" },
        timeout: 10000
      });
      const ms = Date.now() - started;
      const body = r.data || {};
      const count = Array.isArray(body.response) ? body.response.length : 0;
      return { name, ok: true, status: r.status, ms, count };
    } catch (e) {
      const ms = Date.now() - started;
      return { name, ok: false, ms, status: e?.response?.status, error: e?.response?.data || e.message };
    }
  }

  const checks = await Promise.all([
    ping("dep_lgg", { dep_iata: "LGG" }),
    ping("arr_lgg", { arr_iata: "LGG" }),
    ping("all",     {})
  ]);

  result.checks = checks;
  const okCount = checks.filter(c => c.ok).length;
  result.summary = (okCount === checks.length) ? "OK" : (okCount > 0 ? "PARTIAL" : "FAIL");

  const code = result.summary === "OK" ? 200 : (result.summary === "PARTIAL" ? 207 : 502);
  return res.status(code).json(result);
});

// =============================================================
//  GEOFENCES LGG (7 zones)
// =============================================================
app.get("/api/geofences", (req, res) => {
  const geof = {
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
        name: "St‑Georges",
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
        name: "Verlaine",
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
        name: "Juprelle",
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
        name: "Haneffe",
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
        name: "Aineffe",
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
  res.json(geof);
});

// =============================================================
//  FALLBACK STATIC HTML
// =============================================================
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "./public/index.html"));
});

// =============================================================
//  START SERVER
// =============================================================
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

process.on("SIGTERM", () => server.close(() => process.exit(0)));
process.on("SIGINT",  () => server.close(() => process.exit(0)));

// >>> FIN PARTIE 3/3
