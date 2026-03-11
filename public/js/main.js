/* -------------------------------------------------------
   METAR / TAF
------------------------------------------------------- */
async function loadMetarTaf() {
  const panel = document.getElementById('weather');
  if (!panel) return;

  const safe = (v, fallback = '—') => (v === null || v === undefined ? fallback : v);

  try {
    const base = CONFIG.apiBase || '';
    const [metarRes, tafRes] = await Promise.all([
      fetch(`${base}/api/metar?icao=${CONFIG.airport.code}`),
      fetch(`${base}/api/taf?icao=${CONFIG.airport.code}`)
    ]);

    if (!metarRes.ok) throw new Error(`METAR HTTP ${metarRes.status}`);
    if (!tafRes.ok)   throw new Error(`TAF HTTP ${tafRes.status}`);

    const metar = await metarRes.json();
    const taf   = await tafRes.json();

    const raw      = safe(metar?.raw);
    const temp     = safe(metar?.temperature?.value);
    const windKt   = safe(metar?.wind_speed?.value);
    const vis      = safe(metar?.visibility?.value ?? metar?.visibility?.repr);
    const qnhHpa   = safe(metar?.altimeter?.value);

    panel.innerHTML = `
      <h2>Météo (METAR/TAF)</h2>

      <div><b>METAR (${CONFIG.airport.code})</b></div>
      <div class="metar-block">${raw}</div>

      <div class="metar-info">
        Temp: <b>${temp}°C</b> · 
        Vent: <b>${windKt} kt</b> · 
        Visibilité: <b>${vis}</b> · 
        QNH: <b>${qnhHpa} hPa</b>
      </div>

      <div style="margin-top:10px;"><b>TAF (${CONFIG.airport.code})</b></div>
      <div class="metar-block">${safe(taf?.raw)}</div>
    `;
  } catch (e) {
    const msg = (e && e.message) ? e.message : 'Erreur inconnue';
    panel.innerHTML = `
      <h2>Météo (METAR/TAF)</h2>
      <p class="loading" style="color:#ffb4b4">Erreur : ${msg}</p>
    `;
  }
}

/* -------------------------------------------------------
   APP INITIALIZATION
------------------------------------------------------- */
if (!window.__APP_INITIALIZED__) {
  window.__APP_INITIALIZED__ = true;

  document.addEventListener('DOMContentLoaded', async () => {

    /* --- Init Leaflet Map --- */
    const mapContainer = document.getElementById('map');
    if (!mapContainer) return;
    if (mapContainer._leaflet_id) return; // évite double init

    const map = L.map('map', { zoomControl: true })
      .setView([CONFIG.airport.lat, CONFIG.airport.lon], 12);

    L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      { attribution: '© OpenStreetMap, © CARTO' }
    ).addTo(map);

    L.marker([CONFIG.airport.lat, CONFIG.airport.lon])
      .addTo(map)
      .bindPopup(`<b>${CONFIG.airport.name}</b><br>${CONFIG.airport.code}`);

    if (typeof window.drawCorridors === 'function') {
      window.drawCorridors(map);
    }

    /* --- METAR + TAF --- */
    await loadMetarTaf();

    /* --- Geofences + watcher alertes --- */
    const geofences = await (window.loadGeofences ? window.loadGeofences() : Promise.resolve({}));
    const watcher = window.setupGeofenceWatcher
      ? window.setupGeofenceWatcher(map, geofences)
      : () => {};

    /* --- Sonomètres (graphe + liste) --- */
    if (window.renderNoise) {
      await window.renderNoise();
    }

    /* --- Altitude slider --- */
    const altRange = document.getElementById('altRange');
    const altValue = document.getElementById('altValue');
    if (altRange && altValue) {
      altRange.addEventListener('input', () => {
        altValue.textContent = altRange.value;
      });
    }

    /* --- Trafic AirLabs --- */
    async function refreshFlights() {
      try {
        const base = CONFIG.apiBase || '';
        const data = await fetch(`${base}/api/flights?scope=all`).then(r => r.json());
        watcher(data); // geofencing des vols (entrée en zone => alerte)
      } catch (e) {
        // silencieux (évite de casser le cycle si API momentanément indispo)
      }
    }

    // Premier chargement
    await refreshFlights();

    // Rafraîchissements périodiques
    setInterval(refreshFlights, 15000);     // trafic (15 s)
    setInterval(loadMetarTaf, 5 * 60 * 1000); // METAR/TAF (5 min)
    setInterval(() => window.renderNoise && window.renderNoise(), 60 * 1000); // bruit (1 min)
  });
}
