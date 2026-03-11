if (!window.__APP_INITIALIZED__) {
  window.__APP_INITIALIZED__ = true;

  document.addEventListener('DOMContentLoaded', async () => {

    const mapContainer=document.getElementById('map');
    if(!mapContainer) return;
    if(mapContainer._leaflet_id) return;

    const map=L.map('map',{zoomControl:true})
      .setView([CONFIG.airport.lat,CONFIG.airport.lon],12);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{
      attribution:'&copy; OpenStreetMap & CARTO'
    }).addTo(map);

    L.marker([CONFIG.airport.lat, CONFIG.airport.lon]).addTo(map)
      .bindPopup(`<b>${CONFIG.airport.name}</b><br>${CONFIG.airport.code}`);

    if(typeof window.drawCorridors==='function') window.drawCorridors(map);

    const geofences = await window.loadGeofences();
    const watcher = window.setupGeofenceWatcher(map,geofences);

    await window.renderNoise();

    async function refreshFlights(){
      const base = CONFIG.apiBase || '';
      const data = await fetch(`${base}/api/flights?scope=all`).then(r=>r.json()).catch(()=>null);
      if(!data) return;

      watcher(data);
    }

    refreshFlights();
    setInterval(refreshFlights,15000);
    setInterval(renderNoise,60000);
  });
}
