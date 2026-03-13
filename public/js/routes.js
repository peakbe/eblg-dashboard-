/* =======================================================
   routes.js — version propre, complète et SANS ENCODAGE
   ======================================================= */

// Chargement des geofences depuis le backend
window.loadGeofences = async function () {
  try {
    const base = CONFIG.apiBase || "";
    const res = await fetch(`${base}/api/geofences`);
    const data = await res.json();
    console.log("[GEOF] Geofences chargées:", data);
    return data;
  } catch (e) {
    console.error("[GEOF] Erreur geofences:", e);
    return { items: [] };
  }
};

// Affichage des geofences sur Leaflet + watcher optionnel
window.setupGeofenceWatcher = function (map, geof) {
  // 1) Map pas prête → retry
  if (!map || typeof map.eachLayer !== "function") {
    console.warn("[GEOF] Map pas encore prête → retry...");
    setTimeout(() => window.setupGeofenceWatcher(map, geof), 300);
    return () => {};
  }

  // 2) Données invalides
  if (!geof || !Array.isArray(geof.items)) {
    console.warn("[GEOF] Données geofence invalides →", geof);
    return () => {};
  }

  console.log(`[GEOF] Rendu des zones: ${geof.items.length}`);

  // Créer LayerGroup global si pas encore fait
  if (!window.__GEOF_LAYERGROUP) {
    window.__GEOF_LAYERGROUP = L.layerGroup().addTo(map);
  } else {
    window.__GEOF_LAYERGROUP.clearLayers();
  }

  const layers = [];

  geof.items.forEach((zone) => {
    if (!zone.points || zone.points.length < 3) return;

    const polygon = L.polygon(zone.points, {
      color: zone.color || "#ff0000",
      weight: 2,
      fillOpacity: 0.25
    }).addTo(window.__GEOF_LAYERGROUP);

    polygon.bindPopup(`<b>${zone.name}</b>`);
    layers.push(polygon);
  });

  console.log(`[GEOF] Polygones affichés: ${layers.length}`);

  // Recentrage automatique
  if (layers.length) {
    const b = L.latLngBounds();
    layers.forEach(l => b.extend(l.getBounds()));
    map.fitBounds(b, { padding: [24,24] });
  }

  // Watcher placeholder
  return function watcher(allFlights) {
    // Futur traitement avion→zone
  };
};
