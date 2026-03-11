function destPoint(lat, lon, bearingDeg, distanceKm) {
  const R = 6371;
  const brng = bearingDeg * Math.PI/180;
  const dR = distanceKm / R;
  const lat1 = lat * Math.PI/180;
  const lon1 = lon * Math.PI/180;
  const lat2 = Math.asin(Math.sin(lat1)*Math.cos(dR) + Math.cos(lat1)*Math.sin(dR)*Math.cos(brng));
  const lon2 = lon1 + Math.atan2(Math.sin(brng)*Math.sin(dR)*Math.cos(lat1), Math.cos(dR)-Math.sin(lat1)*Math.sin(lat2));
  return { lat: lat2*180/Math.PI, lon: lon2*180/Math.PI };
}

function drawCorridors(map) {
  const layer = L.layerGroup().addTo(map);
  const c = CONFIG.corridors;
  const center = c.runway_center;

  const depEnd = destPoint(center.lat, center.lon, c.dep_bearing_deg, c.length_km);
  const arrStart = destPoint(center.lat, center.lon, c.arr_bearing_deg, c.length_km);

  L.polyline([[center.lat, center.lon], [depEnd.lat, depEnd.lon]], { color:'#ff8c3a', weight:4 }).addTo(layer);
  L.polyline([[arrStart.lat, arrStart.lon], [center.lat, center.lon]], { color:'#3aa3ff', weight:4 }).addTo(layer);

  return layer;
}

window.drawCorridors = drawCorridors;
