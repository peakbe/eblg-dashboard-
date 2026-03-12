/* ---------------- METAR / TAF ---------------- */
async function loadMetarTaf() {
  const panel = document.getElementById('weather');
  if (!panel) return;
  const safe = (v, fb='—') => (v==null? fb : v);

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

    const raw  = safe(metar?.raw);
    const temp = safe(metar?.temperature?.value);
    const wind = safe(metar?.wind_speed?.value);
    const vis  = safe(metar?.visibility?.value ?? metar?.visibility?.repr);
    const qnh  = safe(metar?.altimeter?.value);

    panel.innerHTML = `
      <h2>Météo (METAR/TAF)</h2>
      <div><b>METAR (${CONFIG.airport.code})</b></div>
      <div class="metar-block">${raw}</div>
      <div class="metar-info">
        Temp: <b>${temp}°C</b> · Vent: <b>${wind} kt</b> · Visibilité: <b>${vis}</b> · QNH: <b>${qnh} hPa</b>
      </div>
      <div style="margin-top:10px;"><b>TAF (${CONFIG.airport.code})</b></div>
      <div class="metar-block">${safe(taf?.raw)}</div>
    `;
  } catch(e) {
    panel.innerHTML = `
      <h2>Météo (METAR/TAF)</h2>
      <p class="loading" style="color:#ff6b6b">Erreur: ${e.message}</p>
    `;
  }
}

/* ---------------- APP INIT ---------------- */
if (!window.__APP_INITIALIZED__) {
  window.__APP_INITIALIZED__ = true;

  document.addEventListener('DOMContentLoaded', async () => {
    // Spinner (créé ici pour éviter de toucher index.html)
    const spinner = document.createElement('div');
    spinner.id = 'spinner';
    document.body.appendChild(spinner);

    try {
      // Carte
      const map = L.map('map', { zoomControl:true })
        .setView([CONFIG.airport.lat, CONFIG.airport.lon], 12);

      // Esri Light Gray Canvas
      L.tileLayer(CONFIG.mapTiles.esriLightGray.url, {
        attribution: CONFIG.mapTiles.esriLightGray.attribution
      }).addTo(map);

      // Aéroport
      L.marker([CONFIG.airport.lat, CONFIG.airport.lon]).addTo(map)
        .bindPopup(`<b>${CONFIG.airport.name}</b><br>${CONFIG.airport.code}`);

      // Couloirs
      if (typeof window.drawCorridors === 'function') window.drawCorridors(map);

      // Sonomètres sur la carte
      const layerNoise = L.layerGroup().addTo(map);
      CONFIG.noiseMonitors.forEach(m => {
        const iconHtml = `
          <div class="noise-pin">
            <span>${m.id}</span>
          </div>`;
        const icon = L.divIcon({ className:'noise-pin-wrap', html:iconHtml, iconSize:[36,36], iconAnchor:[18,18] });
        L.marker([m.lat, m.lon], { icon }).addTo(layerNoise).bindPopup(`<b>${m.id}</b><br>${m.name}`);
      });

      // Météo
      await loadMetarTaf();

      // Geofences
      const geof = await (window.loadGeofences ? window.loadGeofences() : Promise.resolve({}));
      const watcher = window.setupGeofenceWatcher ? window.setupGeofenceWatcher(map, geof) : ()=>{};

      // Bruit (individuel + Lden/Lnight)
      if (window.renderNoise) await window.renderNoise();

      // Altitude slider
      const altRange = document.getElementById('altRange');
      const altValue = document.getElementById('altValue');
      if (altRange && altValue) {
        altRange.addEventListener('input', () => { altValue.textContent = altRange.value; });
      }

      // Trafic
      async function refreshFlights() {
        try {
          const base = CONFIG.apiBase || '';
          const data = await fetch(`${base}/api/flights?scope=all`).then(r=>r.json());
          watcher(data);
        } catch {}
      }
      await refreshFlights();

      // Rafraîchissements
      setInterval(refreshFlights, 15000);
      setInterval(loadMetarTaf, 5*60*1000);
      setInterval(()=>window.renderNoise && window.renderNoise(), 60*1000);

    } finally {
      // Masque le spinner dès que l'init est terminée
      const sp = document.getElementById('spinner');
      if (sp) sp.classList.add('hidden');
    }
  });
}

// Rendre accessible depuis la console au besoin
window.loadMetarTaf = loadMetarTaf;
