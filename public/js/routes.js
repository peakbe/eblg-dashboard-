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
