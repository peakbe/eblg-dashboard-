// ====================================================================
// routes.js — Version complète
// - Geofences (chargement + dessin)
// - Watcher dynamique vols → zones (entrée/sortie)
// - Sonomètres fixes LGG (18 points)
// - Recadrage automatique sur polygones
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
    const base = (typeof CONFIG !== "undefined" && CONFIG.apiBase) ? CONFIG.apiBase : "";
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
// 3) Sonomètres fixes — LGG
// ======================================================
function createSonometersLayer(map) {
  // Coordonnées converties en décimal (WGS84)
  const sensors = [
    { id: "F017", addr: "Rue de la Pommeraie, 4690 Wonck",                 lat: 50.764883, lon: 5.630606 },
    { id: "F001", addr: "Rue Franquet, Houtain",                            lat: 50.738044, lon: 5.608833 },
    { id: "F014", addr: "Rue Léon Labaye, Juprelle",                        lat: 50.718895, lon: 5.573164 },
    { id: "F015", addr: "Rue du Brouck, Juprelle",                          lat: 50.688839, lon: 5.526217 },
    { id: "F005", addr: "Rue Caquin, Haneffe",                              lat: 50.639330, lon: 5.323520 },
    { id: "F003", addr: "Rue Fond Méan, Saint-Georges",                     lat: 50.601167, lon: 5.381401 },
    { id: "F011", addr: "Rue Albert 1er, Saint-Georges",                    lat: 50.601142, lon: 5.356006 },
    { id: "F008", addr: "Rue Warfusée, Saint-Georges",                      lat: 50.594877, lon: 5.358950 },
    { id: "F002", addr: "Rue Noiset, Saint-Georges",                        lat: 50.588414, lon: 5.370523 },
    { id: "F007", addr: "Rue Yernawe, Saint-Georges",                       lat: 50.590755, lon: 5.345225 },
    { id: "F009", addr: "Bibliothèque, Place Verte 4470 Stockay",           lat: 50.580831, lon: 5.355417 },
    { id: "F004", addr: "Vinâve des Stréats, Verlaine",                     lat: 50.605414, lon: 5.321406 },
    { id: "F010", addr: "Rue Haute Voie, Verlaine",                         lat: 50.599391, lon: 5.313492 },
    { id: "F013", addr: "Rue Bois Léon, Verlaine",                          lat: 50.586914, lon: 5.308678 },
    { id: "F016", addr: "Rue de Chapon-Seraing, Verlaine",                  lat: 50.619617, lon: 5.295344 },
    { id: "F006", addr: "Rue Bolly Chapon, Seraing",                        lat: 50.609594, lon: 5.271403 },
    { id: "F012", addr: "Rue Barbe d'Or, 4317 Aineffe",                     lat: 50.621917, lon: 5.254747 },
  ];

  if (!window.__SENSORS_LAYER) {
    window.__SENSORS_LAYER = L.layerGroup().addTo(map);
  } else {
    window.__SENSORS_LAYER.clearLayers();
  }

  // Icône simple (rond bleu foncé)
  const icon = L.divIcon({
    className: "sensor-marker",
    html: `<div style="
      width:12px;height:12px;border-radius:50%;
      background:#0a3d91;border:2px solid #fff;
      box-shadow:0 0 4px rgba(0,0,0,.3);"></div>`
  });

  sensors.forEach(s => {
    const m = L.marker([s.lat, s.lon], { icon }).addTo(window.__SENSORS_LAYER);
    m.bindPopup(`<b>${s.id}</b><br>${s.addr}`);
  });

  console.log(`[SENSORS] ${sensors.length} sonomètres ajoutés`);
}

// ======================================================
// 4) Dessin + Watcher dynamique vols → zones
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

  // 4a) Dessin des polygones
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

  // Recadrage auto sur l’ensemble des polygones
  if (layers.length) {
    const b = L.latLngBounds();
    layers.forEach(l => b.extend(l.getBounds()));
    map.fitBounds(b, { padding: [28, 28] });
  }

  // Ajouter les sonomètres
  createSonometersLayer(map);

  // 4b) WATCHER dynamique (ALERTES ZONES)
  return function watcher(allFlights) {
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

        // LatLngs → [ [LatLng, ...] ] pour polygon simple
        const ring = poly.getLatLngs()[0];
        const vs = ring.map(pt => [pt.lat, pt.lng]);

        const isIn = pointInPolygon(p, vs);

        // 1) Entrée en zone
        if (isIn && !wasIn) {
          insideState.set(key, true);

          poly.setStyle({ color: "#ff0000", fillOpacity: 0.55 });
          poly.bindPopup(`<b>${zoneId}</b><br>Vol : ${flightId}`).openPopup();

          const ul = document.getElementById("alerts-list");
          if (ul) {
            const li = document.createElement("li");
            li.textContent = `[${new Date().toLocaleTimeString()}] ${flightId} est entré dans ${zoneId}`;
            ul.prepend(li);
          }

          console.log(`[ALERTE] ${flightId} → entrée dans ${zoneId}`);
        }

        // 2) Sortie de zone
        if (!isIn && wasIn) {
          insideState.set(key, false);
          poly.setStyle({ color: poly.__origColor || "#ff8800", fillOpacity: 0.25 });
          console.log(`[INFO] ${flightId} → sortie de ${zoneId}`);
        }
      });
    });
  };
};
``
