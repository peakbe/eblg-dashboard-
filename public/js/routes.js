function destPoint(lat, lon, bearingDeg, distanceKm){
  const R=6371, br=bearingDeg*Math.PI/180, dR=distanceKm/R;
  const la=lat*Math.PI/180, lo=lon*Math.PI/180;
  const la2=Math.asin(Math.sin(la)*Math.cos(dR)+Math.cos(la)*Math.sin(dR)*Math.cos(br));
  const lo2=lo+Math.atan2(Math.sin(br)*Math.sin(dR)*Math.cos(la), Math.cos(dR)-Math.sin(la)*Math.sin(la2));
  return { lat: la2*180/Math.PI, lon: lo2*180/Math.PI };
}
function drawCorridors(map){
  const layer=L.layerGroup().addTo(map);
  const c=CONFIG.corridors, center=c.runway_center;
  const depEnd=destPoint(center.lat,center.lon,c.dep_bearing_deg,c.length_km);
  const arrStart=destPoint(center.lat,center.lon,c.arr_bearing_deg,c.length_km);
  L.polyline([[center.lat,center.lon],[depEnd.lat,depEnd.lon]],{color:'#ff8c3a',weight:4}).addTo(layer);
  L.polyline([[arrStart.lat,arrStart.lon],[center.lat,center.lon]],{color:'#3aa3ff',weight:4}).addTo(layer);
  return layer;
}
window.drawCorridors = drawCorridors;
/* =======================================================
   GEOFENCES – Chargement et affichage Leaflet
   ======================================================= */

window.loadGeofences = async function() {
  try {
    const base = CONFIG.apiBase || "";
    const data = await fetch(`${base}/api/geofences`).then(r => r.json());
    console.log("Geofences chargées :", data);
    return data;
  } catch (e) {
    console.error("Erreur geofences :", e);
    return { items: [] };
  }
};

/* Dessine les geofences sur la carte */
window.setupGeofenceWatcher = function(map, geof) {
  if (!geof || !geof.items) return () => {};

  const layers = [];

  geof.items.forEach(zone => {
    if (!zone.points || zone.points.length < 3) return;

    const poly = L.polygon(zone.points, {
      color: zone.color || "#ff0000",
      weight: 2,
      fillOpacity: 0.15
    }).addTo(map);

    poly.bindPopup(`<b>${zone.name}</b>`);
    layers.push(poly);
  });

  console.log(`Geofences affichées : ${geof.items.length}`);

  // Watcher (optionnel, pour alertes avion-zones)
  return function watcher(flights) {
    // Placeholder pour futures détections.
  };
};
