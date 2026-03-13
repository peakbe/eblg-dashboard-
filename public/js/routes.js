/* =======================================================
   routes.js — version propre, complète et validée
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
  // 1) La carte n’est pas encore totalement prête ? On retry.
  if (!map || typeof map.eachLayer !== "function") {
    console.warn("[GEOF] Map pas encore prête → retry...");
    setTimeout(() => window.setupGeofenceWatcher(map, geof), 300);
    return () => {};
  }

  // 2) Les données geofence invalides → rien à faire.
  if (!geof || !Array.isArray(geof.items)) {
    console.warn("[GEOF] Données geofence invalides →", geof);
    return () => {};
  }

  console.log(`[GEOF] Rendu des zones: ${geof.items.length}`);

  const layers = [];

  geof.items.forEach((zone) => {
    if (!zone.points || zone.points.length < 3) return;

    const polygon = L.polygon(zone.points, {
      color: zone.color || "#ff0000",
      weight: 2,
      fillOpacity: 0.25
    }).addTo(map);

    polygon.bindPopup(`<b>${zone.name}</b>`);
    layers.push(polygon);
  });

  console.log(`[GEOF] Polygones affichés: ${layers.length}`);

  // Watcher placeholder
  return function watcher(allFlights) {
    // Future alert logic here
  };
};
