// ====================================================================
// routes.js — Version complète + Alertes dynamiques geofences (Option B)
// ====================================================================

// ======================================================
// 1) Fonction utilitaire : pointInPolygon()
// ======================================================
function pointInPolygon(point, vs) {
  const x = point[0], y = point[1];
  let inside = false;

  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const xi = vs[i][0], yi = vs[i][1];
    const xj = vs[j][0], yj = vs[j][1];

    const intersect = ((yi > y) !== (yj > y)) &&
                      (x < (xj - xi) * (y - yi) / (yj - yi) + xi);

    if (intersect) inside = !inside;
  }
  return inside;
}

// ======================================================
// 2) Chargement des geofences depuis le backend
// ======================================================
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

// ======================================================
// 3) Dessin + Watcher dynamique vols → zones
// ======================================================
window.setupGeofenceWatcher = function (map, geof) {
  // Retry si la carte n'est pas prête
  if (!map || typeof map.eachLayer !== "function") {
    console.warn("[GEOF] Map pas encore prête → retry...");
    setTimeout(() => window.setupGeofenceWatcher(map, geof), 300);
    return () => {};
  }

  // Données invalides
  if (!geof || !Array.isArray(geof.items)) {
    console.warn("[GEOF] Données geofence invalides →", geof);
    return () => {};
  }

  console.log(`[GEOF] Rendu des zones: ${geof.items.length}`);

  // LayerGroup global (unique)
  if (!window.__GEOF_LAYERGROUP) {
    window.__GEOF_LAYERGROUP = L.layerGroup().addTo(map);
  } else {
    window.__GEOF_LAYERGROUP.clearLayers();
  }

  const layers = [];
  const insideState = new Map();

  // ======================================================
  // 3a) Dessin des polygones
  // ======================================================
  geof.items.forEach((zone) => {
    if (!zone.points || zone.points.length < 3) return;

    const polygon = L.polygon(zone.points, {
      color: zone.color,
      weight: 2,
      fillOpacity: 0.25
    }).addTo(window.__GEOF_LAYERGROUP);

    // Mémorisation
    polygon.__zoneId = zone.id;
    polygon.__origColor = zone.color;
    layers.push(polygon);
  });

  console.log(`[GEOF] Polygones affichés: ${layers.length}`);

  // 🔎 Recadrage automatique pour que tu voies les polygones
  if (layers.length) {
    const b = L.latLngBounds();
    layers.forEach(l => b.extend(l.getBounds()));
    map.fitBounds(b, { padding: [28, 28] });

  // ======================================================
  // 3b) WATCHER dynamique (ALERTES ZONES)
  // ======================================================
  return function watcher(allFlights) {

    // Fusion départs / arrivées / survols
    const { departures = [], arrivals = [], over = [] } = allFlights;
    const flights = [...departures, ...arrivals, ...over];

    flights.forEach(f => {
      if (!f.lat || !f.lng) return;

      const p = [f.lat, f.lng];
      const flightId = (
        f.hex ||
        f.flight_iata ||
        f.flight_icao ||
        f.callsign ||
        f.reg_number ||
        ("UNK_" + Math.random())
      );

      layers.forEach(poly => {
        const zoneId = poly.__zoneId;
        const key = `${zoneId}:${flightId}`;

        const wasIn = insideState.get(key) || false;

        // Conversion en tableau brut [lat,lng] pour pointInPolygon()
        const vs = poly.getLatLngs()[0].map(pt => [pt.lat, pt.lng]);
        const isIn = pointInPolygon(p, vs);

        // ======================
        // 1) ENTRÉE EN ZONE
        // ======================
        if (isIn && !wasIn) {
          insideState.set(key, true);

          // Changement couleur + opacité
          poly.setStyle({ color: "#ff0000", fillOpacity: 0.55 });

          // Popup
          poly.bindPopup(
            `<b>${zoneId}</b><br>Vol : ${flightId}`
          ).openPopup();

          // Log dans la liste ALERTES
          const ul = document.getElementById("alerts-list");
          if (ul) {
            const li = document.createElement("li");
            li.textContent =
              `[${new Date().toLocaleTimeString()}] ` +
              `${flightId} est entré dans ${zoneId}`;
            ul.prepend(li);
          }

          console.log(`[ALERTE] ${flightId} → entrée dans ${zoneId}`);
        }

        // ======================
        // 2) SORTIE DE ZONE
        // ======================
        if (!isIn && wasIn) {
          insideState.set(key, false);

          // Retour au style original
          poly.setStyle({ color: poly.__origColor, fillOpacity: 0.25 });

          console.log(`[INFO] ${flightId} → sortie de ${zoneId}`);
        }
      });
    });
  };
};
