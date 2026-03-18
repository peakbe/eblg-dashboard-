// ====================================================================
// routes.js — Version complète (Geofences + Sonomètres + Toggle + Pulse)
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
// 2) Fonction utilitaire distance (Haversine) pour le pulse
// ======================================================
function distanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI/180;
  const dLon = (lon2 - lon1) * Math.PI/180;
  const a =
    Math.sin(dLat/2)**2 +
    Math.cos(lat1*Math.PI/180) *
    Math.cos(lat2*Math.PI/180) *
    Math.sin(dLon/2)**2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// ======================================================
// 3) Chargement des geofences
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
}

// ======================================================
// 3-3) Sonomètres fixes — LGG (18)
// ======================================================
function createSonometersLayer(map) {
``
  const sensors = [
    { id: "F017", addr: "Rue de la Pommeraie, Wonck",        lat: 50.764883, lon: 5.630606 },
    { id: "F001", addr: "Rue Franquet, Houtain",             lat: 50.738044, lon: 5.608833 },
    { id: "F014", addr: "Rue Léon Labaye, Juprelle",         lat: 50.718895, lon: 5.573164 },
    { id: "F015", addr: "Rue du Brouck, Juprelle",           lat: 50.688839, lon: 5.526217 },
    { id: "F005", addr: "Rue Caquin, Haneffe",               lat: 50.639330, lon: 5.323520 },
    { id: "F003", addr: "Rue Fond Méan, Saint-Georges",      lat: 50.601167, lon: 5.381401 },
    { id: "F011", addr: "Rue Albert 1er, Saint-Georges",     lat: 50.601142, lon: 5.356006 },
    { id: "F008", addr: "Rue Warfusée, Saint-Georges",       lat: 50.594877, lon: 5.358950 },
    { id: "F002", addr: "Rue Noiset, Saint-Georges",         lat: 50.588414, lon: 5.370523 },
    { id: "F007", addr: "Rue Yernawe, Saint-Georges",        lat: 50.590755, lon: 5.345225 },
    { id: "F009", addr: "Bibliothèque, Place Verte Stockay", lat: 50.580831, lon: 5.355417 },
    { id: "F004", addr: "Vinâve des Stréats, Verlaine",      lat: 50.605414, lon: 5.321406 },
    { id: "F010", addr: "Rue Haute Voie, Verlaine",          lat: 50.599391, lon: 5.313492 },
    { id: "F013", addr: "Rue Bois Léon, Verlaine",           lat: 50.586914, lon: 5.308678 },
    { id: "F016", addr: "Rue de Chapon-Seraing, Verlaine",   lat: 50.619617, lon: 5.295344 },
    { id: "F006", addr: "Rue Bolly Chapon, Seraing",         lat: 50.609594, lon: 5.271403 },
    { id: "F012", addr: "Rue Barbe d'Or, Aineffe",           lat: 50.621917, lon: 5.254747 },
  ];

  if (!window.__SENSORS_LAYER) {
    window.__SENSORS_LAYER = L.layerGroup().addTo(map);
  } else {
    window.__SENSORS_LAYER.clearLayers();
  }

  const icon = L.divIcon({
    className: "sensor-marker",
    html: `<div class="sensor-dot"></div>`
  });

  sensors.forEach(s => {
    const m = L.marker([s.lat, s.lon], { icon }).addTo(window.__SENSORS_LAYER);
    m.__id = s.id;
    m.__addr = s.addr;
    m.bindPopup(`<b>${s.id}</b><br>${s.addr}`);
  });

  console.log(`[SENSORS] ${sensors.length} sonomètres ajoutés`);
}

// Ajout du style pour le marqueur et le pulse
const style = document.createElement("style");
style.innerHTML = `
.sensor-dot {
  width:12px; height:12px;
  border-radius:50%;
  background:#0a3d91;
  border:2px solid #fff;
  box-shadow:0 0 4px rgba(0,0,0,.3);
}
.sensor-pulse {
  animation:pulse 1.2s infinite;
}
@keyframes pulse {
  0% { transform:scale(1);   box-shadow:0 0 4px rgba(255,0,0,.4); }
  50%{ transform:scale(1.5); box-shadow:0 0 10px rgba(255,80,0,.7); }
  100%{ transform:scale(1);  box-shadow:0 0 4px rgba(255,0,0,.4); }
}
`;
document.head.appendChild(style);
// ====================================================================
// 4) Watcher dynamique geofences + affichage
// ====================================================================
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

  // ============================
  // 4a) DESSIN DES POLYGONES
  // ============================
  geof.items.forEach((zone) => {
    if (!zone.points || zone.points.length < 3) return;

    const polygon = L.polygon(zone.points, {
      color: zone.color || "#ff8800",
      weight: 2,
      fillOpacity: 0.25
    }).addTo(window.__GEOF_LAYERGROUP);

    // Mémorisation utile pour le watcher
    polygon.__zoneId = zone.id;
    polygon.__origColor = zone.color || "#ff8800";

    layers.push(polygon);
  });

  console.log(`[GEOF] Polygones affichés: ${layers.length}`);

  // ============================
  // 4b) RECADRAGE AUTOMATIQUE
  // ============================
  if (layers.length) {
    const b = L.latLngBounds();
    layers.forEach(l => b.extend(l.getBounds()));
    map.fitBounds(b, { padding: [28, 28] });
  }

  // ============================
  // 4c) AJOUT DES SONOMÈTRES
  // ============================
  createSonometersLayer(map);

  // ====================================================================
  // 4d) WATCHER VOLS → ZONES + ALERTES + PULSE (<3km)
  // ====================================================================
  return function watcher(allFlights) {

    // On fusionne les trois types de vols
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

      // ----------- CHECK DES ZONES -----------
      layers.forEach(poly => {
        const zoneId = poly.__zoneId;
        const key = `${zoneId}:${flightId}`;

        const wasIn = insideState.get(key) || false;

        const ring = poly.getLatLngs()[0];
        const vs = ring.map(pt => [pt.lat, pt.lng]);
        const isIn = pointInPolygon(p, vs);

        // ====== ENTRÉE ======
        if (isIn && !wasIn) {
          insideState.set(key, true);

          // Couleur dynamique rouge
          poly.setStyle({ color: "#ff0000", fillOpacity: 0.55 });

          // Popup
          poly.bindPopup(`<b>${zoneId}</b><br>Vol : ${flightId}`).openPopup();

          // Ajout à ALERTES
          const ul = document.getElementById("alerts-list");
          if (ul) {
            const li = document.createElement("li");
            li.textContent =
              `[${new Date().toLocaleTimeString()}] ${flightId} est entré dans ${zoneId}`;
            ul.prepend(li);
          }

          console.log(`[ALERTE] ${flightId} → entrée dans ${zoneId}`);
        }

        // ====== SORTIE ======
        if (!isIn && wasIn) {
          insideState.set(key, false);
          poly.setStyle({ color: poly.__origColor, fillOpacity: 0.25 });
          console.log(`[INFO] ${flightId} → sortie de ${zoneId}`);
        }
      }); // fin boucle polygones


      // ----------- CHECK DES SONOMÈTRES (pulse < 3 km) -----------
      if (window.__SENSORS_LAYER) {
        window.__SENSORS_LAYER.eachLayer(marker => {
          const el = marker._icon?.firstElementChild;
          if (!el) return;

          let isNear = false;

          const d = distanceKm(
            f.lat, f.lng,
            marker.getLatLng().lat,
            marker.getLatLng().lng
          );

          if (d <= 3) isNear = true;

          if (isNear) {
            el.classList.add("sensor-pulse");
            el.style.background = "#ff3300"; // rouge/orange
          } else {
            el.classList.remove("sensor-pulse");
            el.style.background = "#0a3d91"; // couleur normale
          }
        });
      }

    }); // fin boucle vols

  }; // fin watcher
};
// ====================================================================
// 5) Bouton ON / OFF pour afficher / masquer les sonomètres
// ====================================================================

// Fonction appelée par le bouton
window.toggleSensors = function() {
  const btn = document.getElementById("toggle-sensors");
  if (!window.__SENSORS_LAYER) return;

  if (map.hasLayer(window.__SENSORS_LAYER)) {
    map.removeLayer(window.__SENSORS_LAYER);
    btn.textContent = "Sonomètres OFF";
    btn.classList.add("off");
  } else {
    window.__SENSORS_LAYER.addTo(map);
    btn.textContent = "Sonomètres ON";
    btn.classList.remove("off");
  }
};

// Activation du bouton quand la page est prête
document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("toggle-sensors");
  if (btn) {
    btn.addEventListener("click", window.toggleSensors);
    btn.textContent = "Sonomètres ON";
  }
});

// ====================================================================
// FIN DU FICHIER routes.js (version complète)
// ====================================================================
