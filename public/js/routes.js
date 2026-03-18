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
// 2) Distance Haversine (pour pulse < 3 km)
// ======================================================
function distanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;

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
// 4) Création des sonomètres LGG (18)
// ======================================================
function createSonometersLayer(map) {
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
    const marker = L.marker([s.lat, s.lon], { icon }).addTo(window.__SENSORS_LAYER);
    marker.__id = s.id;
    marker.__addr = s.addr;
    marker.bindPopup(`<b>${s.id}</b><br>${s.addr}`);
  });

  console.log("[SENSORS] Sonomètres chargés :", sensors.length);
}

// Ajout du CSS dynamique
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
``
