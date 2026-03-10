document.addEventListener('DOMContentLoaded', async () => {
  // Carte
  const map = L.map('map', { zoomControl:true }).setView([CONFIG.airport.lat, CONFIG.airport.lon], 12);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { attribution: '&copy; OpenStreetMap, &copy; CARTO' }).addTo(map);

  // Marqueur aéroport
  L.marker([CONFIG.airport.lat, CONFIG.airport.lon]).addTo(map)
    .bindPopup(`<b>${CONFIG.airport.name}</b><br>${CONFIG.airport.code}`);

  // Couloirs
  drawCorridors(map);

  // Couches
  const layerNoise = L.layerGroup().addTo(map);
  const layerDeps  = L.layerGroup().addTo(map);
  const layerArrs  = L.layerGroup().addTo(map);
  const layerOver  = L.layerGroup().addTo(map);
  const layerTrails= L.layerGroup().addTo(map);

  // Theme
  document.getElementById('toggleTheme').addEventListener('click', () => {
    document.documentElement.classList.toggle('light');
  });

  // Sonomètres
  const noiseList = document.getElementById('noise-list');
  CONFIG.noiseMonitors.forEach(m => {
    L.marker([m.lat, m.lon], { icon: noiseDivIcon() })
      .addTo(layerNoise)
      .bindPopup(`<b>${m.id}</b><br>${m.name}`);
    const li = document.createElement('li');
    li.textContent = `${m.id} – ${m.name}`;
    noiseList.appendChild(li);
  });

  // METAR/TAF via backend
  await loadMetarTaf();

  // Geofences via backend + watcher
  const geofences = await loadGeofences();
  const onFlightsGeofence = setupGeofenceWatcher(map, geofences);

  // Altitude filtre
  const altRange = document.getElementById('altRange');
  const altValue = document.getElementById('altValue');
  altRange.addEventListener('input', () => { altValue.textContent = altRange.value; });

  // Boucle trafic
  async function refreshFlights(){
    try{
      const base = CONFIG.apiBase || '';
      const data = await fetch(`${base}/api/flights?scope=all`).then(r=>r.json());

      // Clean couches
      layerDeps.clearLayers(); layerArrs.clearLayers(); layerOver.clearLayers(); layerTrails.clearLayers();
      document.getElementById('list-deps').innerHTML = '';
      document.getElementById('list-arrs').innerHTML = '';
      document.getElementById('list-over').innerHTML = '';

      const altMax = Number(altRange.value);

      const addFlightMarker = (f, color, layer, listId, labelPrefix) => {
        if (typeof f.alt === 'number' && f.alt > altMax) return;
        if (!f.lat || !f.lng) return;
        const icon = aircraftDivIcon(color, f.dir || 0);
        L.marker([f.lat, f.lng], { icon }).addTo(layer)
          .bindPopup(`<b>${labelPrefix}</b><br>${flightLabel(f)}`);
        const li = document.createElement('li');
        li.textContent = flightLabel(f);
        document.getElementById(listId).appendChild(li);
      };

      (data.departures||[]).forEach(f => addFlightMarker(f, '#ff8c3a', layerDeps, 'list-deps', 'Départ'));
      (data.arrivals||[]).forEach(f   => addFlightMarker(f, '#3aa3ff', layerArrs, 'list-arrs', 'Arrivée'));
      (data.over||[]).forEach(f       => addFlightMarker(f, '#a36bff', layerOver, 'list-over', 'Survol'));

      // Trails/route si dispo
      await drawTrailsIfAvailable(data, layerTrails);

      // Geofence alerts
      onFlightsGeofence(data);
    }catch(e){ console.warn('Trafic error', e); }
  }

  // Premier run
  await renderNoise();
  await refreshFlights();

  // Intervalles
  setInterval(loadMetarTaf, 5*60*1000);
  setInterval(refreshFlights, 15*1000);
  setInterval(renderNoise, 60*1000);
});

// ----------- Helpers front -----------
function flightLabel(f){
  const callsign = f.flight_iata || f.flight_icao || f.callsign || '—';
  const reg = f.reg_number ? ` · ${f.reg_number}` : '';
  const alt = (typeof f.alt === 'number') ? ` · ${Math.round(f.alt)} ft` : '';
  return `${callsign}${reg}${alt}`;
}

async function loadMetarTaf(){
  const w = document.getElementById('weather');
  try{
    const base = CONFIG.apiBase || '';
    const [metar, taf] = await Promise.all([
      fetch(`${base}/api/metar?icao=${CONFIG.airport.code}`).then(r=>r.json()),
      fetch(`${base}/api/taf?icao=${CONFIG.airport.code}`).then(r=>r.json())
    ]);
    const temp = metar?.temperature?.value ?? '—';
    const wind = metar?.wind_speed?.value ?? '—';
    const vis  = metar?.visibility?.value ?? (metar?.visibility?.repr ?? '—');

    w.innerHTML = `
      <h2>Météo (METAR/TAF)</h2>
      <div><b>METAR (${CONFIG.airport.code})</b></div>
      <div style="font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; background:#0b1120; border:1px solid #22304a; padding:6px; border-radius:8px; margin:6px 0 8px 0;">
        ${metar?.raw ?? '—'}
      </div>
      <div style="font-size:13px; color:#c9d7ee;">
        Temp: <b>${temp}°C</b> · Vent: <b>${wind} kt</b> · Visibilité: <b>${vis}</b>
      </div>
      <div style="margin-top:10px;"><b>TAF (${CONFIG.airport.code})</b></div>
      <div style="font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; background:#0b1120; border:1px solid #22304a; padding:6px; border-radius:8px;">
        ${taf?.raw ?? '—'}
      </div>
    `;
  }catch(e){
    w.innerHTML = `<h2>Météo (METAR/TAF)</h2><p class="loading">Erreur chargement METAR/TAF</p>`;
  }
}

async function drawTrailsIfAvailable(allFlights, layer){
  const base = CONFIG.apiBase || '';
  const pick = (arr, n=4) => (arr||[]).slice(0, n);
  const candidates = [ ...pick(allFlights.arrivals, 3), ...pick(allFlights.departures, 3), ...pick(allFlights.over, 2) ];
  for (const f of candidates) {
    try {
      const params = new URLSearchParams();
      if (f.flight_iata) params.append('flight_iata', f.flight_iata);
      else if (f.flight_icao) params.append('flight_icao', f.flight_icao);
      else if (f.hex) params.append('hex', f.hex);
      else if (f.reg_number) params.append('reg_number', f.reg_number);
      const resp = await fetch(`${base}/api/flight?${params.toString()}`).then(r=>r.json());
      const detail = resp?.response;
      if (!detail) continue;
      const trail = Array.isArray(detail.trail) ? detail.trail : [];
      if (trail.length >= 2) {
        const coords = trail.map(p => [p.lat, p.lng]);
        L.polyline(coords, { color:'#a36bff', weight:2, opacity:0.6 }).addTo(layer);
      }
      const route = Array.isArray(detail.route) ? detail.route : [];
      if (route.length >= 2) {
        const coords = route.filter(p => p.lat && p.lng).map(p => [p.lat, p.lng]);
        L.polyline(coords, { color:'#999999', weight:1.5, opacity:0.7, dashArray:'3 6' }).addTo(layer);
      }
    } catch {}
  }
}
