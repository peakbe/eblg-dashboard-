/* ----------------------------------------------------------
   CONFIG
---------------------------------------------------------- */
const AVWX_API_KEY = "ersegQzkf2Dfal-o26B4b5uzMrXBeHK2jOpOaY7nffc";

const PROXY = "https://eblg-proxy.onrender.com/proxy?url=";

const FIDS_ARR = PROXY + encodeURIComponent("https://fids.liegeairport.com/api/flights/Arrivals");
const FIDS_DEP = PROXY + encodeURIComponent("https://fids.liegeairport.com/api/flights/Departures");

const EBLG = { lat:50.6374, lon:5.4432, runways:[
  { name:"04", heading:40 },
  { name:"22", heading:220 }
]};

/* ----------------------------------------------------------
   SONOMÈTRES
---------------------------------------------------------- */
const SONOS = [
  { id:"F017", lat:50.764883, lon:5.630606 },
  { id:"F001", lat:50.737, lon:5.608833 },
  { id:"F014", lat:50.718894, lon:5.573164 },
  { id:"F015", lat:50.688839, lon:5.526217 },
  { id:"F005", lat:50.639331, lon:5.323519 },
  { id:"F003", lat:50.601167, lon:5.3814 },
  { id:"F011", lat:50.601142, lon:5.356006 },
  { id:"F008", lat:50.594878, lon:5.35895 },
  { id:"F002", lat:50.588414, lon:5.370522 },
  { id:"F007", lat:50.590756, lon:5.345225 },
  { id:"F009", lat:50.580831, lon:5.355417 },
  { id:"F004", lat:50.605414, lon:5.321406 },
  { id:"F010", lat:50.599392, lon:5.313492 },
  { id:"F013", lat:50.586914, lon:5.308678 },
  { id:"F016", lat:50.619617, lon:5.295345 },
  { id:"F006", lat:50.609594, lon:5.271403 },
  { id:"F012", lat:50.621917, lon:5.254747 }
];

/* ----------------------------------------------------------
   MAP
---------------------------------------------------------- */
const map = L.map("map").setView([EBLG.lat, EBLG.lon], 11);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);

L.circleMarker([EBLG.lat, EBLG.lon], {radius:7, color:"#10b981", fillColor:"#10b981", fillOpacity:1})
  .addTo(map)
  .bindPopup("EBLG – Liège Airport");

const SONO_MARKERS = SONOS.map(s => ({
  ...s,
  marker: L.circleMarker([s.lat, s.lon], {
    radius:5, color:"#2563eb", fillColor:"#2563eb", fillOpacity:1
  }).addTo(map).bindPopup(s.id)
}));

let corridorLayer = null;
let arrowLayer = null;

/* ----------------------------------------------------------
   METAR
---------------------------------------------------------- */
async function fetchMetar() {
  const url = `https://avwx.rest/api/metar/EBLG?token=${AVWX_API_KEY}&format=json`;
  const r = await fetch(url);
  return r.json();
}

function updateMetarUI(m) {
  document.getElementById("meteo-summary").textContent =
    `Vent ${m.wind_direction.value}° / ${m.wind_speed.value} kt – T° ${m.temperature.value}°C`;

  document.getElementById("meteo-raw").textContent = m.raw;
}

/* ----------------------------------------------------------
   FIDS
---------------------------------------------------------- */
async function fetchFIDS() {
  const [arr, dep] = await Promise.all([
    fetch(FIDS_ARR).then(r => r.json()),
    fetch(FIDS_DEP).then(r => r.json())
  ]);

  return {
    arrivals: Array.isArray(arr) ? arr : [],
    departures: Array.isArray(dep) ? dep : []
  };
}

function updateFlightsUI(f) {
  const el = document.getElementById("flights-list");
  const all = [...f.arrivals, ...f.departures];

  if (!all.length) {
    el.textContent = "Aucun vol FIDS disponible.";
    return;
  }

  el.innerHTML = all.slice(0,50).map(v => `
    <div class="flight-row">
      ${v.direction === "Arrivals" ? "ARR" : "DEP"} 
      ${v.flightPax} (${v.aircraftType}) – RWY ${v.runway || "?"}<br>
      STD/STA: ${format(v.sTx)} – ETD/ETA: ${format(v.eTx)} – ATD/ATA: ${format(v.aTx)}
    </div>
  `).join("");
}

function format(t) {
  if (!t) return "-";
  return new Date(t).toISOString().substring(11,16);
}

/* ----------------------------------------------------------
   RUNWAY + COULOIR + FLÈCHES
---------------------------------------------------------- */
function extractRunway(f) {
  const all = [...f.arrivals, ...f.departures];
  const r = all.find(v => v.runway);
  if (!r) return null;

  const name = r.runway.replace(/[^0-9]/g,"");
  return EBLG.runways.find(x => x.name === name) || null;
}

function computePoint([lat,lon], heading, km) {
  const R = 6371;
  const d = km / R;
  const br = heading * Math.PI/180;
  const la = lat * Math.PI/180;
  const lo = lon * Math.PI/180;

  const la2 = Math.asin(Math.sin(la)*Math.cos(d) + Math.cos(la)*Math.sin(d)*Math.cos(br));
  const lo2 = lo + Math.atan2(Math.sin(br)*Math.sin(d)*Math.cos(la), Math.cos(d)-Math.sin(la)*Math.sin(la2));

  return [la2*180/Math.PI, lo2*180/Math.PI];
}

function buildCorridor(heading) {
  const start = [EBLG.lat, EBLG.lon];
  const end = computePoint(start, heading, 20);

  const leftStart = computePoint(start, heading - 90, 1.5);
  const rightStart = computePoint(start, heading + 90, 1.5);
  const leftEnd = computePoint(end, heading - 90, 3.5);
  const rightEnd = computePoint(end, heading + 90, 3.5);

  return {
    polygon: [leftStart, leftEnd, rightEnd, rightStart],
    centerline: [start, end]
  };
}

function computeImpacted(heading) {
  const { polygon, centerline } = buildCorridor(heading);

  if (corridorLayer) map.removeLayer(corridorLayer);
  corridorLayer = L.polygon(polygon, {
    color: "#f97316",
    weight: 2,
    fillOpacity: 0.15
  }).addTo(map);

  if (arrowLayer) map.removeLayer(arrowLayer);
  arrowLayer = L.polylineDecorator(centerline, {
    patterns: [
      {
        offset: 0,
        repeat: 200,
        symbol: L.Symbol.arrowHead({
          pixelSize: 14,
          polygon: false,
          pathOptions: {
            stroke: true,
            color: "#f97316",
            weight: 3
          }
        })
      }
    ]
  }).addTo(map);

  const impacted = [];

  SONO_MARKERS.forEach(s => {
    const inside = L.polygon(polygon).getBounds().contains([s.lat, s.lon]);
    s.marker.setStyle(
      inside
        ? { color: "#b91c1c", fillColor: "#b91c1c" }
        : { color: "#2563eb", fillColor: "#2563eb" }
    );
    if (inside) impacted.push(s);
  });

  return impacted;
}

/* ----------------------------------------------------------
   MAIN
---------------------------------------------------------- */
async function refresh() {
  const metar = await fetchMetar();
  updateMetarUI(metar);

  const fids = await fetchFIDS();
  updateFlightsUI(fids);

  const rw = extractRunway(fids);
  if (!rw) {
    document.getElementById("runway-info").textContent = "Piste non déterminée.";
    return;
  }

  document.getElementById("runway-info").textContent =
    `Piste ${rw.name} (cap ${rw.heading}°)`;

  const impacted = computeImpacted(rw.heading);

  document.getElementById("sonos-impacted").innerHTML =
    impacted.length
      ? impacted.map(s => `<span class="tag impacted">${s.id}</span>`).join(" ")
      : "Aucun sonomètre impacté.";
}

refresh();
