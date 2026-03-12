/* ------------------ Noise: Lden & Lnight (par sonomètre) ------------------ */

if (!window.__NOISE_ENHANCED__) {
  window.__NOISE_ENHANCED__ = true;

  // Couleurs visuelles selon Lden (approx. seuils EU)
  function colorForLden(v) {
    if (v == null || isNaN(v)) return '#95a5a6'; // neutre si inconnu
    if (v <= 50) return '#2ecc71'; // vert
    if (v <= 55) return '#f1c40f'; // jaune
    if (v <= 65) return '#e67e22'; // orange
    return '#e74c3c';              // rouge
  }

  // Heat badge : petit indicateur couleur visualisant Lden
  function heatBadge(v) {
    const c = colorForLden(v);
    const label = (v != null && !isNaN(v)) ? `${Math.round(v)} dB` : '—';
    return `
      <span class="heat-badge" style="background:${c}"></span>
      <span class="heat-label">${label}</span>
    `;
  }

  // Conversion LAeq simple (échantillons supposés iso-espacés)
  function laeq(values) {
    const arr = (values || []).filter(x => typeof x === 'number' && isFinite(x));
    if (!arr.length) return null;
    const mean10 = arr.reduce((s,x)=> s + Math.pow(10, x/10), 0) / arr.length;
    return 10 * Math.log10(mean10);
  }

  // Filtre par heure locale [start, end) ; accepte chevauchement nuit
  function filterByHourSpan(items, startHour, endHour) {
    return (items || []).filter(d => {
      const t = new Date(d.ts);
      const h = t.getHours();
      if (startHour < endHour) {
        return h >= startHour && h < endHour;
      } else {
        // ex: 22 -> 06
        return (h >= startHour) || (h < endHour);
      }
    });
  }

  // Calcul Lden + Lnight sur les 24h glissantes
  function computeLdenLnight(items24h) {
    const day = filterByHourSpan(items24h, 6, 18);
    const eve = filterByHourSpan(items24h, 18, 22);
    const nig = filterByHourSpan(items24h, 22, 6);

    const Ld = laeq(day.map(d => d.value));
    const Le = laeq(eve.map(d => d.value));
    const Ln = laeq(nig.map(d => d.value));

    let Lden = null;
    if (Ld != null || Le != null || Ln != null) {
      const pDay = (Ld != null) ? Math.pow(10,  Ld/10)         : 0;
      const pEve = (Le != null) ? Math.pow(10, (Le+5)/10)      : 0; // +5 dB
      const pNig = (Ln != null) ? Math.pow(10, (Ln+10)/10)     : 0; // +10 dB
      const sum  = (12/24)*pDay + (4/24)*pEve + (8/24)*pNig;
      Lden = (sum > 0) ? 10 * Math.log10(sum) : null;
    }

    return { Ld, Le, Ln, Lden, Lnight: Ln };
  }

  async function renderNoise() {
    const base = CONFIG.apiBase || '';
    const list = document.getElementById('noise-list');
    const canvas = document.getElementById('noiseChart');

    if (list) list.innerHTML = '';

    // Récupère l’historique complet (le backend tronque déjà)
    const hist = await fetch(`${base}/api/noise/history`).then(r=>r.json()).catch(()=>({items:[]}));
    const items = hist.items || [];

    // Fenêtre 24h glissantes
    const now = Date.now();
    const from24 = now - 24*3600*1000;
    const last24 = items.filter(d => +new Date(d.ts) >= from24);

    // Groupement par sonomètre
    const byId = new Map();
    last24.forEach(d => {
      if (!byId.has(d.id)) byId.set(d.id, []);
      byId.get(d.id).push(d);
    });

    // Index des moniteurs pour nom/position
    const metaById = new Map(CONFIG.noiseMonitors.map(m => [m.id, m]));

    // Remplissage UI (individuel)
    if (list) {
      // Ordre: nom de zone puis id
      const ordered = [...byId.keys()].sort((a,b) => {
        const A = metaById.get(a)?.name || a;
        const B = metaById.get(b)?.name || b;
        return A.localeCompare(B) || a.localeCompare(b);
      });

      ordered.forEach(id => {
        const data = byId.get(id);
        const meta = metaById.get(id) || { name:id };
        const latest = data[data.length-1];

        const { Lden, Lnight } = computeLdenLnight(data);
        const heat = heatBadge(Lden);

        const li = document.createElement('li');
        li.className = 'noise-item';
        li.innerHTML = `
          <div class="noise-row">
            <div class="noise-id">${id}</div>
            <div class="noise-name">${meta.name || ''}</div>
            <div class="noise-instant">${latest ? `${Math.round(latest.value)} dB(A)` : '—'}</div>
            <div class="noise-stats">
              <span class="tag">Lnight: <b>${(Lnight!=null)?Math.round(Lnight):'—'} dB</b></span>
              <span class="tag">Lden: <b>${(Lden!=null)?Math.round(Lden):'—'} dB</b></span>
            </div>
            <div class="noise-heat">${heat}</div>
          </div>
        `;
        list.appendChild(li);
      });

      if (!ordered.length) {
        const li = document.createElement('li');
        li.textContent = 'Aucune donnée (24h).';
        list.appendChild(li);
      }
    }

    // Graph rapide (derniers points tout capteurs confondus)
    if (canvas) {
      const ctx = canvas.getContext('2d');
      const last = last24.slice(-200);
      const labels = last.map(d => new Date(d.ts).toLocaleTimeString());
      const values = last.map(d => d.value);
      if (window.__NOISE_CHART__) { window.__NOISE_CHART__.destroy(); }
      window.__NOISE_CHART__ = new Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: 'dB(A)',
            data: values,
            borderColor:'#3a7bd5',
            backgroundColor:'rgba(58,123,213,0.15)',
            tension:0.25,
            pointRadius:0
          }]
        },
        options: { responsive:true }
      });
    }
  }

  // expose
  window.renderNoise = renderNoise;
}
