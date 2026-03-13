/* ===========================================================
   EBLG Dashboard – main.js (Complet)
   - Utilitaires (distance, format, fetchJson)
   - UI Trafic: bannière A3, mini heatmap, liste compacte A2
   - Filtres Départs / Arrivées / Survols (insertion DOM)
   - Dessin des vols (Leaflet) + logique 50 km (back) + B1
   - METAR/TAF + piste probable RWY 22/04 + alerte
   - Carte Esri Light Gray + couloirs + sonomètres + spinner
   =========================================================== */

/* ------------------ Utilitaires généraux ------------------ */

// Distance orthodromique (Haversine) en km
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

// Filtre de proximité (si jamais on veut re-filtrer côté front)
function isWithinRadius(f, centerLat, centerLon, radiusKm = 50) {
  if (!f || typeof f.lat !== 'number' || typeof f.lng !== 'number') return false;
  const d = haversineKm(centerLat, centerLon, f.lat, f.lng);
  return d <= radiusKm;
}

// HH:MMZ depuis timestamp (AirLabs `updated` en secondes)
function formatZulu(ts) {
  if (!ts) return "--:--Z";
  const d = new Date(ts * 1000);
  return d.toISOString().slice(11, 16) + "Z";
}

// Helpers d’affichage (compact)
function airlineDisplay(f) {
  return f.airline_iata || f.airline_icao || "Compagnie";
}
function aircraftDisplay(f) {
  return f.aircraft_icao || "Type?";
}

/* ------------------ Helper fetch JSON robuste ------------------ */
/* Evite l’erreur “Unexpected token '<' … not valid JSON” quand
   le serveur renvoie du HTML (fallback / erreur) */
async function fetchJson(url) {
  const r = await fetch(url, { headers: { 'Accept': 'application/json' } });
  const text = await r.text();
  const ct = (r.headers.get('content-type') || '').toLowerCase();
  if (!ct.includes('application/json')) {
    console.error('Non-JSON response from', url, 'status=', r.status, 'head=', text.slice(0, 200));
    throw new Error(`Réponse non-JSON depuis ${url} (status ${r.status})`);
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    console.error('JSON parse error for', url, e, 'payload head=', text.slice(0, 200));
    throw e;
  }
}

/* ------------------ Bloc UI: bannière / heatmap / liste ------------------ */

// A3 – Bannière orange “Vol(s) actif(s) dans la zone (X)”
function renderTrafficBanner(count) {
  const banner = document.createElement('div');
  banner.className = "traffic-banner";
  banner.textContent = `🟠 Vol(s) actif(s) dans la zone (${count})`;
  return banner;
}

// Mini “heatmap” (barres ASCII 1..5)
function renderTrafficHeatmap(count) {
  const max = 5;
  const level = Math.max(0, Math.min(max, count)); // borne [0..5]
  let bars = "";
  for (let i = 0; i < max; i++) bars += (i < level) ? "█" : "░";
  const div = document.createElement('div');
  div.className = "traffic-heatmap";
  div.textContent = `Activité : ${bars}  (${level}/${max})`;
  return div;
}

// A2 – Liste compacte : “QR8560 · Qatar · B77L · 08:50Z · EBLG → KORD”
function renderCompactFlightList(flts) {
  const ul = document.createElement('ul');
  ul.className = "flight-compact-list";

  flts.forEach(f => {
    const li = document.createElement('li');
    const id   = f.flight_iata || f.flight_icao || "???";
    const comp = airlineDisplay(f);
    const type = aircraftDisplay(f);
    const time = formatZulu(f.updated);
    const dep  = f.dep_iata || "???";
    const arr  = f.arr_iata || "???";
    li.innerHTML = `<b>${id}</b> · ${comp} · ${type} · ${time} · ${dep} → ${arr}`;
    ul.appendChild(li);
  });

  return ul;
}

/* ------------------ Bloc UI: “Aucun vol” + bouton B1 ------------------ */

// Contenu “aucun vol” + bouton “Afficher tous les vols LGG (zoom Europe)”
function renderNoCloseFlightsMessage(container, onShowAll) {
  const p = document.createElement('p');
  p.className = "loading";
  p.textContent = "Aucun vol dans un rayon de 50 km autour d’EBLG.";
  container.appendChild(p);

  const btn = document.createElement("button");
  btn.className = "btn-small";
  btn.textContent = "➡ Afficher tous les vols LGG";
  btn.addEventListener("click", () => {
    if (typeof onShowAll === "function") onShowAll();
  });
  container.appendChild(btn);
}

/* ------------------ Filtres “Départs / Arrivées / Survols” -------------- */

// Insère les 3 cases sous le <h2> du panneau Trafic (emplacement stable)
function ensureFlightFilters() {
  const trafCard = document.getElementById('aircrafts');
  if (!trafCard) return;

  // Déjà présents ?
  if (document.getElementById('flight-filters')) return;

  const h2 = trafCard.querySelector("h2");
  if (!h2) return;

  const filters = document.createElement("div");
  filters.id = "flight-filters";
  filters.innerHTML = `
    <label><input type="checkbox" id="flt-dep" checked> Départs</label>
    <label><input type="checkbox" id="flt-arr" checked> Arrivées</label>
    <label><input type="checkbox" id="flt-over"> Survols</label>
  `;
  h2.insertAdjacentElement("afterend", filters);
}
ensureFlightFilters();

// Applique les filtres UI à la réponse backend (déjà 50 km côté serveur)
function filterFlights(data) {
  const sDep = document.getElementById('flt-dep')?.checked ?? true;
  const sArr = document.getElementById('flt-arr')?.checked ?? true;
  const sOvr = document.getElementById('flt-over')?.checked ?? false; // Survols masqués par défaut

  return {
    departures: sDep ? (data.departures || []) : [],
    arrivals:   sArr ? (data.arrivals   || []) : [],
    over:       sOvr ? (data.over       || []) : []
  };
}

/* ------------------ Dessin des vols sur couches Leaflet ------------------ */
/*
  drawFlights(data, layers)
  - data : { departures:[], arrivals:[], over:[] }
  - layers : { layerDeps, layerArrs, layerOver } (Leaflet LayerGroup)
*/
function drawFlights(data, layers) {
  const { layerDeps, layerArrs, layerOver } = layers;
  layerDeps.clearLayers();
  layerArrs.clearLayers();
  layerOver.clearLayers();

  const add = (f, color, layer, label) => {
    if (!f || typeof f.lat !== 'number' || typeof f.lng !== 'number') return;
    const icon = (typeof aircraftDivIcon === 'function') ? aircraftDivIcon(color, f.dir || 0) : undefined;
    const id   = f.flight_iata || f.flight_icao || f.callsign || 'Vol';
    const reg  = f.reg_number ? ` · ${f.reg_number}` : '';
    L.marker([f.lat, f.lng], { icon }).addTo(layer)
      .bindPopup(`<b>${label}</b><br>${id}${reg}`);
  };

  (data.departures || []).forEach(f => add(f, '#ff8c3a', layerDeps, 'Départ'));
  (data.arrivals   || []).forEach(f => add(f, '#3aa3ff', layerArrs, 'Arrivée'));
  (data.over       || []).forEach(f => add(f, '#a36bff', layerOver, 'Survol'));
}

/* ===================================================================
   INITIALISATION CARTE + TRAFIC + METEO + RENDER
   =================================================================== */

if (!window.__APP_INITIALIZED__) {
  window.__APP_INITIALIZED__ = true;

  document.addEventListener("DOMContentLoaded", async () => {

    /* ----------------- SPINNER (création dynamique) ----------------- */
    const spinner = document.createElement("div");
    spinner.id = "spinner";
    document.body.appendChild(spinner);

    /* ----------------- CARTE LEAFLET (Esri light-gray) -------------- */
    window.map = L.map("map", { zoomControl: true })
  .setView([CONFIG.airport.lat, CONFIG.airport.lon], 12);

    L.tileLayer(CONFIG.mapTiles.esriLightGray.url, {
      attribution: CONFIG.mapTiles.esriLightGray.attribution
    }).addTo(map);

    // Aéroport (marqueur)
    L.marker([CONFIG.airport.lat, CONFIG.airport.lon])
      .addTo(map)
      .bindPopup(`<b>${CONFIG.airport.name}</b><br>${CONFIG.airport.code}`);

    /* ----------------- Couloirs RWY 22 / 04 -------------------------- */
    if (typeof window.drawCorridors === "function") {
      window.drawCorridors(map);
    }

    /* ----------------- Sonomètres (icônes rondes) -------------------- */
    const layerNoise = L.layerGroup().addTo(map);
    CONFIG.noiseMonitors.forEach(m => {
      const iconHtml = `<div class="noise-pin"><span>${m.id}</span></div>`;
      const icon = L.divIcon({
        className: "noise-pin-wrap",
        html: iconHtml,
        iconSize: [36, 36],
        iconAnchor: [18, 18]
      });
      L.marker([m.lat, m.lon], { icon })
        .addTo(layerNoise)
        .bindPopup(`<b>${m.id}</b><br>${m.name}`);
    });

    /* ----------------- Piste probable (METAR/TAF) ------------------- */
    function inferRunway(wdir) {
      if (wdir == null) return "—";
      const diff22 = Math.abs(wdir - 222);
      const diff04 = Math.abs(wdir - 42);
      return diff22 < diff04 ? "22" : "04";
    }

    function runwayBeep() {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.value = 880;
        o.connect(ctx.destination);
        o.start();
        setTimeout(() => { o.stop(); ctx.close(); }, 180);
      } catch (e) {}
    }

    function runwayAlert(newRwy) {
      if (!newRwy || newRwy === "—") return;
      const old = window.__RWY_STATE__ || null;
      if (old && old !== newRwy) {
        runwayBeep();
        const ul = document.getElementById("alerts-list");
        if (ul) {
          const li = document.createElement("li");
          li.textContent = `Changement de piste : RWY ${old} → RWY ${newRwy} (${new Date().toLocaleTimeString()})`;
          ul.prepend(li);
        }
      }
      window.__RWY_STATE__ = newRwy;
    }

    async function loadMetarTaf() {
      const panel = document.getElementById("weather");
      if (!panel) return;
      const safe = (v, fb = "—") => (v == null ? fb : v);

      try {
        const base = CONFIG.apiBase || "";
        const [metar, taf] = await Promise.all([
          fetchJson(`${base}/api/metar?icao=${CONFIG.airport.code}`),
          fetchJson(`${base}/api/taf?icao=${CONFIG.airport.code}`)
        ]);

        const raw  = safe(metar?.raw);
        const temp = safe(metar?.temperature?.value);
        const wind = safe(metar?.wind_speed?.value);
        const vis  = safe(metar?.visibility?.value ?? metar?.visibility?.repr);
        const qnh  = safe(metar?.altimeter?.value);

        const rwy = inferRunway(metar?.wind_direction?.value);
        runwayAlert(rwy);

        panel.innerHTML = `
          <h2>Météo (METAR/TAF)</h2>
          <div class="rwy">Piste probable : <b>RWY ${rwy}</b></div>

          <div><b>METAR (${CONFIG.airport.code})</b></div>
          <div class="metar-block">${raw}</div>

          <div class="metar-info">
            Temp: <b>${temp}°C</b> · Vent: <b>${wind} kt</b> ·
            Visibilité: <b>${vis}</b> · QNH: <b>${qnh} hPa</b>
          </div>

          <div style="margin-top:10px;"><b>TAF (${CONFIG.airport.code})</b></div>
          <div class="metar-block">${safe(taf?.raw)}</div>
        `;
      } catch (e) {
        panel.innerHTML = `
          <h2>Météo (METAR/TAF)</h2>
          <p class="loading" style="color:#ff6b6b">Erreur: ${e.message}</p>
        `;
      }
    }

    // Expose pour debug si besoin (dans le bon scope)
    window.loadMetarTaf = loadMetarTaf;

    /* ------------------- GEOFENCES ------------------------------------ */
  // Charger les geofences normalement
const geof = await loadGeofences();

// Premier appel (peut arriver trop tôt)
setupGeofenceWatcher(map, geof);

// Deuxième appel garanti (après que Leaflet a terminé son rendu)
setTimeout(() => {
  console.log("[GEOF] Retry affichage geofences après 500ms");
  setupGeofenceWatcher(map, geof);
}, 500);

    /* ------------------- NOISE (sonomètres) ---------------------------- */
    if (window.renderNoise) await window.renderNoise();

    /* ------------------- SLIDER ALTITUDE ------------------------------- */
    const altRange = document.getElementById("altRange");
    const altValue = document.getElementById("altValue");
    if (altRange && altValue) {
      altRange.addEventListener("input", () => { altValue.textContent = altRange.value; });
    }

    /* ------------------- COUCHES TRAFIC -------------------------------- */
    const layerDeps = L.layerGroup().addTo(map);
    const layerArrs = L.layerGroup().addTo(map);
    const layerOver = L.layerGroup().addTo(map);
    const layers = { layerDeps, layerArrs, layerOver };

    /* ------------------- LOGIQUE PRINCIPALE refreshFlights ------------- */
    let showAllFlights = false;  // activé par le bouton B1

    function zoomEurope() {
      // Zoom “Europe” niveau 4
      map.setView([CONFIG.airport.lat, CONFIG.airport.lon], 4);
    }

    async function refreshFlights() {
      try {
        const base = CONFIG.apiBase || "";
        const raw  = await fetchJson(`${base}/api/flights?scope=all`);

        const filtered = showAllFlights ? raw : filterFlights(raw); // filtres UI sur 50 km back
        drawFlights(filtered, layers);

        // UI du panneau Trafic
        const trafCard = document.getElementById("aircrafts");
        const listsBlock = trafCard.querySelector(".lists");
        listsBlock.innerHTML = "";  // reset

        const closeFlights = [
          ...(filtered.departures || []),
          ...(filtered.arrivals   || [])
        ];

        // Cas 1 : aucun vol proche → message + bouton B1
        if (!showAllFlights && closeFlights.length === 0) {
          renderNoCloseFlightsMessage(listsBlock, () => {
            showAllFlights = true;
            zoomEurope();
            refreshFlights();
          });
          return;
        }

        // Cas 2 : vol(s) dans la zone → bannière + heatmap + liste compacte
        if (!showAllFlights && closeFlights.length > 0) {
          listsBlock.appendChild(renderTrafficBanner(closeFlights.length));
          listsBlock.appendChild(renderTrafficHeatmap(closeFlights.length));
          listsBlock.appendChild(renderCompactFlightList(closeFlights));
        }

        // Cas 3 : mode “Afficher tous les vols LGG”
        if (showAllFlights) {
          const allFlights = [
            ...(filtered.departures || []),
            ...(filtered.arrivals   || []),
            ...(filtered.over       || [])
          ];
          listsBlock.appendChild(renderTrafficHeatmap(allFlights.length));
          listsBlock.appendChild(renderCompactFlightList(allFlights));
        }

        watcher(filtered);
      } catch (e) {
        console.error("refreshFlights error:", e);
      }
    }

    /* ------------------- LANCEMENT INITIAL ----------------------------- */
    await loadMetarTaf();
    await refreshFlights();

    // Rafraîchissements périodiques
    setInterval(refreshFlights, 15000);          // trafic
    setInterval(loadMetarTaf, 5 * 60 * 1000);    // météo
    setInterval(() => window.renderNoise && window.renderNoise(), 60000);

    // Cacher spinner en fin d’init
    const sp = document.getElementById("spinner");
    if (sp) sp.classList.add("hidden");

  }); // DOMContentLoaded
}
