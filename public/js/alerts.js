if (!window.__ALERTS_INIT__) {
  window.__ALERTS_INIT__ = true;

  function pointInPolygon(point, polygon){
    const [x, y] = [point[1], point[0]];
    let inside = false;
    for (let i=0,j=polygon.length-1;i<polygon.length;j=i++){
      const xi=polygon[i][1], yi=polygon[i][0];
      const xj=polygon[j][1], yj=polygon[j][0];
      const intersect=((yi>y)!=(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi)+xi);
      if(intersect) inside=!inside;
    }
    return inside;
  }

  function makeBeep(){
    try{
      const ctx=new(window.AudioContext||window.webkitAudioContext)();
      const o=ctx.createOscillator(); const g=ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
     o.stop();
ctx.close();},120);
    }catch{}
  }

  async function loadGeofences(){
    const base = CONFIG.apiBase || '';
    const r=await fetch(`${base}/api/geofences`);
    return await r.json();
  }

  function setupGeofenceWatcher(map, polygonsByName){
    const alertsUl=document.getElementById('alerts-list');
    const insideState=new Map();

    return function(allFlights){
      const {departures=[],arrivals=[],over=[]}=allFlights;
      const list=[...departures,...arrivals,...over];
      const base=CONFIG.apiBase||'';

      list.forEach(f=>{
        if(!f.lat||!f.lng) return;
        const pos=[f.lat,f.lng];

        Object.entries(polygonsByName).forEach(([name,polys])=>{
          if(!polys) return;
          const arr=Array.isArray(polys[0][0])?polys:[polys];
          const key=name+':' +(f.hex||f.flight_iata||f.flight_icao||f.reg_number||f.callsign);

          const isIn=arr.some(poly=>pointInPolygon(pos,poly));
          const wasIn=insideState.get(key)||false;

          if(isIn && !wasIn){
            makeBeep();
            const li=document.createElement('li');
            li.textContent=`[${new Date().toLocaleTimeString()}] ${name} ← ${f.flight_iata||f.flight_icao||f.callsign}`;
            alertsUl.prepend(li);

            fetch(`${base}/api/alerts/log`,{
              method:'POST',
              headers:{'Content-Type':'application/json'},
              body:JSON.stringify({zone:name,flight:f,position:pos})
            });
          }
          insideState.set(key,isIn);
        });
      });
    }
  }

  window.loadGeofences = loadGeofences;
  window.setupGeofenceWatcher = setupGeofenceWatcher;
}
