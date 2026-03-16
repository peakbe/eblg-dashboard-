// ==========================================================
//  EBLG DASHBOARD — SERVER APP (Version 2026 complète)
// ==========================================================

import express from "express";
import path from "path";
import axios from "axios";
import fs from "fs";
import { fileURLToPath } from "url";

// Resolve dirname (ESM)
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app  = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "./public")));


// ==========================================================
//  Tools
// ==========================================================
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lat2 - lon1);
  const a = Math.sin(dLat/2)**2
          + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2))
          * Math.sin(dLon/2)**2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function readJSON(file) {
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}


// ==========================================================
//  FLIGHTS — AirLabs API (VERSION 2026)
// ==========================================================
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

    // 3 appels AirLabs
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
      f.lat && f.lng && haversineKm(C_LAT, C_LON, f.lat, f.lng) <= 50
    );

    const arr50 = arr.filter(f =>
      f.lat && f.lng && haversineKm(C_LAT, C_LON, f.lat, f.lng) <= 50
    );

    const over50 = all.filter(f =>
      f.lat && f.lng && haversineKm(C_LAT, C_LON, f.lat, f.lng) <= 50
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


// ==========================================================
//  AIRLABS DIAGNOSTIC
// ==========================================================
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
    result.checks.push({ name: "env", ok: false, error: "Missing AIRLABS_KEY" });
    return res.status(500).json(result);
  }

  async function ping(name, url, params = {}) {
    const start = Date.now();
    try {
      const r = await axios.get(url, {
        params: { api_key: AIRLABS_KEY, ...params },
        headers: { "User-Agent": "EBLG-Dashboard/diag" },
        timeout: 10000
      });
      const ms = Date.now() - start;
      const resp = r.data || {};
      const count = Array.isArray(resp.response) ? resp.response.length : 0;
      return { name, ok: true, status: r.status, ms, count };
    } catch (e) {
      const ms = Date.now() - start;
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
    ping("all",     `${BASE}/flights`)
  ]);

  result.checks = checks;

  const okCount = checks.filter(c => c.ok).length;
  if (okCount === checks.length)      result.summary = "OK";
  else if (okCount > 0)              result.summary = "PARTIAL";
  else                               result.summary = "FAIL";

  const code = result.summary === "OK" ? 200 :
               result.summary === "PARTIAL" ? 207 : 502;

  res.status(code).json(result);
});


// ==========================================================
//  METAR & TAF (AVWX / OPENMETEO)
// ==========================================================
app.get("/api/metar", async (req, res) => {
  const { icao } = req.query;
  if (!icao) return res.status(400).json({ error: "Missing ICAO" });

  try {
    const r = await axios.get(`https://avwx.rest/api/metar/${icao}`, {
      headers: { Authorization: `Bearer ${process.env.AVWX_TOKEN}` }
    });
    return res.json(r.data);
  } catch (e) {
    return res.status(500).json({ error: "AVWX METAR error", details: e.message });
  }
});

app.get("/api/taf", async (req, res) => {
  const { icao } = req.query;
  if (!icao) return res.status(400).json({ error: "Missing ICAO" });

  try {
    const r = await axios.get(`https://avwx.rest/api/taf/${icao}`, {
      headers: { Authorization: `Bearer ${process.env.AVWX_TOKEN}` }
    });
    return res.json(r.data);
  } catch (e) {
    return res.status(500).json({ error: "AVWX TAF error", details: e.message });
  }
});


// ==========================================================
//  GEOFENCES LGG (7 zones)
// ==========================================================
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
        name: "St-Georges",
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


// ==========================================================
//  FALLBACK STATIC HTML
// ==========================================================
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "./public/index.html"));
});


// ==========================================================
//  START SERVER
// ==========================================================
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

process.on("SIGTERM", () => server.close(() => process.exit(0)));
process.on("SIGINT", () => server.close(() => process.exit(0)));
