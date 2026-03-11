if (!window.__NOISE_INIT__) {
  window.__NOISE_INIT__ = true;

  let noiseChart;

  async function renderNoise(){
    const base = CONFIG.apiBase || '';
    const latest = await fetch(`${base}/api/noise/latest`).then(r=>r.json()).catch(()=>null);
    const history = await fetch(`${base}/api/noise/history`).then(r=>r.json()).catch(()=>({items:[]}));

    const list=document.getElementById('noise-list');
    if(!list) return;
    list.innerHTML='';

    if(latest?.id){
      const li=document.createElement('li');
      li.textContent=`Dernier: ${latest.id} – ${latest.value} dB`;
      list.appendChild(li);
    }

    const byTime=history.items.slice(-200);
    const labels=byTime.map(d=>new Date(d.ts).toLocaleTimeString());
    const values=byTime.map(d=>d.value);

    const canvas=document.getElementById('noiseChart');
    if(!canvas) return;

    const ctx=canvas.getContext('2d');
    if(noiseChart) noiseChart.destroy();

    noiseChart=new Chart(ctx,{
      type:'line',
      data:{labels,datasets:[{label:'dB(A)',data:values,borderColor:'#4cc3ff', backgroundColor:'rgba(76,195,255,0.15)', tension:0.25, pointRadius:0}]},
      options:{responsive:true}
    });
  }

  window.renderNoise = renderNoise;
}
