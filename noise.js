let noiseChart;

async function renderNoise(){
  const base = CONFIG.apiBase || '';
  const latest = await fetch(`${base}/api/noise/latest`).then(r=>r.json()).catch(()=>({latest:null}));
  const history = await fetch(`${base}/api/noise/history`).then(r=>r.json()).catch(()=>({items:[]}));

  const list = document.getElementById('noise-list');
  list.innerHTML = '';

  if (latest?.latest){
    const li = document.createElement('li');
    li.textContent = `Dernier: ${latest.latest.id} – ${latest.latest.value} dB (${new Date(latest.latest.ts).toLocaleString()})`;
    list.appendChild(li);
  } else {
    const li = document.createElement('li');
    li.textContent = 'Aucune mesure encore.';
    list.appendChild(li);
  }

  const byTime = history.items.slice(-200);
  const labels = byTime.map(d => new Date(d.ts).toLocaleTimeString());
  const values = byTime.map(d => d.value);

  const ctx = document.getElementById('noiseChart').getContext('2d');
  if (noiseChart) noiseChart.destroy();
  noiseChart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets: [{ label: 'dB(A)', data: values, borderColor:'#4cc3ff', backgroundColor:'rgba(76,195,255,0.15)', tension:0.25, pointRadius:0 }] },
    options: {
      responsive:true,
      plugins:{ legend:{ labels:{ color:'#cfe2ff' } } },
      scales:{ x:{ ticks:{ color:'#a9b6cf'} , grid:{ color:'rgba(255,255,255,0.06)'} }, y:{ ticks:{ color:'#a9b6cf'} , grid:{ color:'rgba(255,255,255,0.06)'} } }
    }
  });
}
