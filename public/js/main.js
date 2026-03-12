/* ---------------- METAR / TAF + RWY 22/04 ---------------- */
function inferRunway(wdir){
  if (wdir==null) return '—';
  const diff22=Math.abs(wdir-222);
  const diff04=Math.abs(wdir-42);
  return (diff22<diff04)?'22':'04';
}

function runwayBeep(){
  try{
    const ctx=new (window.AudioContext||window.webkitAudioContext)();
    const o=ctx.createOscillator(); o.type='sine'; o.frequency.value=880;
    o.connect(ctx.destination); o.start(); setTimeout(()=>{o.stop();ctx.close()},180);
  }catch{}
}

function runwayAlert(newRwy){
  if (!newRwy || newRwy==='—') return;
  const old=window.__RWY_STATE__||null;
  if (old && old!==newRwy){
    runwayBeep();
    const ul=document.getElementById('alerts-list');
    if (ul){ const li=document.createElement('li'); li.textContent=`Changement de piste : RWY ${old} → RWY ${newRwy} (${new Date().toLocaleTimeString()})`; ul.prepend(li); }
  }
  window.__RWY_STATE__=newRwy;
}

async function loadMetarTaf(){
  const panel=document.getElementById('weather'); if(!panel) return;
  const safe=(v,fb='—')=>(v==null?fb:v);
  try{
    const base=CONFIG.apiBase||'';
    const [metarRes, tafRes]=await Promise.all([
      fetch(`${base}/api/metar?icao=${CONFIG.airport.code}`),
      fetch(`${base}/api/taf?icao=${CONFIG.airport.code}`)
    ]);
    if(!metarRes.ok) throw new Error(`METAR HTTP ${metarRes.status}`);
    if(!tafRes.ok)   throw new Error(`TAF HTTP ${tafRes.status}`);
    const metar=await metarRes.json();
    const taf=await tafRes.json();
    const raw=safe(metar?.raw); const temp=safe(metar?.temperature?.value);
    const wind=safe(metar?.wind_speed?.value); const vis=safe(metar?.visibility?.value ?? metar?.visibility?.repr);
    const qnh=safe(metar?.altimeter?.value);
    const rwy=inferRunway(metar?.wind_direction?.value);
    runwayAlert(rwy);
    panel.innerHTML=`
      <h2>Météo (METAR/TAF)</h2>
      <div class="rwy">Piste probable : <b>RWY ${rwy}</b></div>
      <div><b>METAR (${CONFIG.airport.code})</b></div>
      <div class="metar-block">${raw}</div>
      <div class="metar-info">Temp: <b>${temp}°C</b> · Vent: <b>${wind} kt</b> · Visibilité: <b>${vis}</b> · QNH: <b>${qnh} hPa</b></div>
      <div style="margin-top:10px;"><b>TAF (${CONFIG.airport.code})</b></div>
      <div class="metar-block">${safe(taf?.raw)}</div>`;
  }catch(e){ panel.innerHTML=`<h2>Météo (METAR/TAF)</h2><p class="loading" style="color:#ff6b6b">Erreur: ${e.message}</p>`; }
}

/* ---------------- APP INIT ---------------- */
if (!window.__APP_INITIALIZED__) {
  window.__APP_INITIALIZED__ = true;

  document.addEventListener('DOMContentLoaded', async () => {
    // Spinner dynamique
    const spinner=document.createElement('div'); spinner.id='spinner'; document.body.appendChild(spinner);

    // Carte
    const map=L.map('map',{zoomControl:true}).setView([CONFIG.airport.lat,CONFIG.airport.lon],12);
    L.tileLayer(CONFIG.mapTiles.esriLightGray.url,{ attribution: CONFIG.mapTiles.esriLightGray.attribution }).addTo(map);

    // Aéroport
    L.marker([CONFIG.airport.lat,CONFIG.airport.lon]).addTo(map).bindPopup(`<b>${CONFIG.airport.name}</b><br>${CONFIG.airport.code}`);

    // Couloirs
    if (typeof window.drawCorridors==='function') window.drawCorridors(map);

    // Sonomètres (icône simple)
    const layerNoise=L.layerGroup().addTo(map);
    CONFIG.noiseMonitors.forEach(m=>{
      const iconHtml=`<div class="noise-pin"><span>${m.id}</span></div>`;
      const icon=L.divIcon({ className:'noise-pin-wrap', html:iconHtml, iconSize:[36,36], iconAnchor:[18,18]});
      L.marker([m.lat,m.lon],{icon}).addTo(layerNoise).bindPopup(`<b>${m.id}</b><br>${m.name}`);
    });

    // Filtres trafic (créés dynamiquement dans la carte Trafic)
    const trafCard=document.getElementById('aircrafts');
    if (trafCard){
      const filters=document.createElement('div'); filters.id='flight-filters'; filters.innerHTML=
        `<label><input type="checkbox" id="flt-dep" checked> Départs</label>
         <label><input type="checkbox" id="flt-arr" checked> Arrivées</label>
         <label><input type="checkbox" id="flt-over" checked> Survols</label>`;
      trafCard.insertBefore(filters, trafCard.querySelector('.lists'));
    }

    // Bouton reset carte (dans le footer si présent)
    const footBtns=document.querySelector('footer');
    if (footBtns){
      const btn=document.createElement('button'); btn.id='resetMap'; btn.className='btn-small'; btn.textContent='⟳ Recentrer carte';
      btn.addEventListener('click',()=> map.setView([CONFIG.airport.lat,CONFIG.airport.lon],12));
      footBtns.appendChild(btn);
    }

    // Météo
    await loadMetarTaf();

    // Geofences + watcher
    const geof=(window.loadGeofences? await window.loadGeofences():{});
    const watcher=(window.setupGeofenceWatcher? window.setupGeofenceWatcher(map,geof) : ()=>{});

    // Noise (individuel + stats)
    if (window.renderNoise) await window.renderNoise();

    // Altitude slider
    const altRange=document.getElementById('altRange'); const altValue=document.getElementById('altValue');
    if (altRange&&altValue) altRange.addEventListener('input',()=>{ altValue.textContent=altRange.value; });

    // Couches trafic
    const layerDeps=L.layerGroup().addTo(map);
    const layerArrs=L.layerGroup().addTo(map);
    const layerOver=L.layerGroup().addTo(map);

    function filterFlights(data){
      const sDep=document.getElementById('flt-dep')?.checked ?? true;
      const sArr=document.getElementById('flt-arr')?.checked ?? true;
      const sOvr=document.getElementById('flt-over')?.checked ?? true;
      return {
        departures: sDep? (data.departures||[]):[],
        arrivals:   sArr? (data.arrivals||[]):[],
        over:       sOvr? (data.over||[]):[]
      };
    }

    function drawFlights(data){
      layerDeps.clearLayers(); layerArrs.clearLayers(); layerOver.clearLayers();
      const add=(f,color,layer,label)=>{
        if (!f.lat||!f.lng) return; const icon=(typeof aircraftDivIcon==='function')? aircraftDivIcon(color, f.dir||0): undefined;
        L.marker([f.lat,f.lng],{icon}).addTo(layer).bindPopup(`<b>${label}</b><br>${f.flight_iata||f.flight_icao||f.callsign||'Vol'} · ${f.reg_number||''}`);
      };
      (data.departures||[]).forEach(f=>add(f,'#ff8c3a',layerDeps,'Départ'));
      (data.arrivals||[]).forEach(f=>add(f,'#3aa3ff',layerArrs,'Arrivée'));
      (data.over||[]).forEach(f=>add(f,'#a36bff',layerOver,'Survol'));
    }

    async function refreshFlights(){
      try{
        const base=CONFIG.apiBase||''; const raw=await fetch(`${base}/api/flights?scope=all`).then(r=>r.json());
        const filtered=filterFlights(raw); drawFlights(filtered); watcher(filtered);
      }catch{}
    }

    await refreshFlights();
    setInterval(refreshFlights,15000);
    setInterval(loadMetarTaf,5*60*1000);
    setInterval(()=>window.renderNoise && window.renderNoise(),60*1000);

    // Fin init → cacher spinner
    const sp=document.getElementById('spinner'); if (sp) sp.classList.add('hidden');
  });
}

// Expo console si besoin
window.loadMetarTaf = loadMetarTaf;
