// Cartão do treino para print e post (formato de story, 9:16). Abre ao tocar num treino.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = (v, d = 0) => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const ZN = ['Abaixo da Z1', 'Z1', 'Z2', 'Z3', 'Z4', 'Z5'];
const recVar = (r) => (r == null ? 'var(--text-3)' : r <= 33 ? 'var(--rec-red)' : r <= 66 ? 'var(--rec-yellow)' : 'var(--rec-green)');

function dur(m) {
  const s = Math.round(m * 60), h = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
  return h ? `${h}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${mm}:${String(ss).padStart(2, '0')}`;
}
function pace(a) {
  if (!a.km || a.km < 0.3 || !a.min) return null;
  if (a.sport === 'corrida') { const p = a.min / a.km; return { v: `${Math.floor(p)}:${String(Math.round((p % 1) * 60)).padStart(2, '0')}`, u: '/km', k: 'Ritmo médio' }; }
  if (a.sport === 'natacao') { const p = a.min / (a.km * 10); return { v: `${Math.floor(p)}:${String(Math.round((p % 1) * 60)).padStart(2, '0')}`, u: '/100 m', k: 'Ritmo médio' }; }
  if (a.sport === 'bike') return { v: nf(a.km / (a.min / 60), 1), u: 'km/h', k: 'Velocidade média' };
  return null;
}

export async function renderShare(screen, api, id) {
  document.body.classList.add('is-share');
  screen.innerHTML = '<p class="empty">Carregando…</p>';
  let a;
  try { a = await api(`/api/activity?id=${encodeURIComponent(id)}`); } catch (e) { screen.innerHTML = `<p class="empty">Não carregou: ${esc(e.message)}</p>`; return; }
  const date = new Date(a.date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '');
  const pc = pace(a);
  const stats = [
    { k: 'Duração', v: dur(a.min) },
    a.km >= 0.3 ? { k: 'Distância', v: a.sport === 'natacao' ? nf(a.km * 1000) : nf(a.km, 2), u: a.sport === 'natacao' ? 'm' : 'km' } : null,
    pc ? { k: pc.k, v: pc.v, u: pc.u } : null,
    a.kcal != null ? { k: a.kcalActive ? 'Calorias ativas' : 'Calorias', v: nf(a.kcal), u: 'kcal' } : null,
    a.avghr ? { k: 'FC média', v: Math.round(a.avghr), u: a.maxhr ? `bpm · máx ${Math.round(a.maxhr)}` : 'bpm' } : null,
    a.power ? { k: 'Potência média', v: a.power, u: 'W' } : a.elev >= 20 && !a.indoor ? { k: 'Subida', v: nf(a.elev), u: 'm' } : a.cadence ? { k: 'Cadência', v: a.cadence, u: a.sport === 'corrida' ? 'ppm' : a.sport === 'bike' ? 'rpm' : 'braç./min' } : null,
  ].filter(Boolean).slice(0, 6);
  const z = a.zones, zt = z ? z.reduce((x, y) => x + y, 0) || 1 : 1;
  const used = z ? z.map((m, i) => ({ i, m })).filter((x) => x.m > 0) : [];
  // anel do Strain: escala de 2× o seu dia médio (Fitness); passa disso, fecha a volta
  const R = 52, C = 2 * Math.PI * R;
  const frac = a.strainVsDay != null ? Math.min(1, a.strainVsDay / 2) : 0.5;
  const title = a.name && a.name.toLowerCase() !== a.label.toLowerCase() ? a.name : a.label;
  screen.innerHTML = `
    <article class="share" style="--c: var(--${esc(a.sport)})">
      <button type="button" class="sh-close" aria-label="Fechar">×</button>
      <header class="sh-top"><span class="sh-brand">REC</span><span>${esc(date)} · ${esc(a.time ?? '')}</span></header>
      <div class="sh-hero">
        <p class="sh-sport"><i></i>${esc(a.label)}${a.indoor ? ' · indoor' : ''}</p>
        <h1 class="sh-title">${esc(title)}</h1>
      </div>
      ${a.strain != null ? `<div class="sh-strain">
        <svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="${R}" class="sh-track"/>
          <circle cx="60" cy="60" r="${R}" class="sh-arc" stroke-dasharray="${(C * frac).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 60 60)"/></svg>
        <div class="sh-sv"><b>${a.strain}</b><span>Strain</span></div>
        ${a.strainVsDay != null ? `<p class="sh-rel">${a.strainVsDay >= 1.05 ? `${nf(a.strainVsDay, 1)}× o seu dia médio` : a.strainVsDay >= 0.95 ? 'Igual ao seu dia médio' : `${Math.round(a.strainVsDay * 100)}% do seu dia médio`}</p>` : ''}
      </div>` : ''}
      <div class="sh-grid">${stats.map((s) => `<div><span>${s.k}</span><b>${s.v}${s.u ? `<small>${esc(s.u)}</small>` : ''}</b></div>`).join('')}</div>
      ${used.length ? `<div class="sh-zones">
        <div class="sh-zbar">${used.map((x) => `<i class="zc-${x.i}" style="flex:${x.m}"></i>`).join('')}</div>
        <ul>${used.filter((x) => x.m / zt >= 0.04).map((x) => `<li><i class="zc-${x.i}"></i>${ZN[x.i].replace('Abaixo da Z1', '&lt;Z1')} <b>${x.m}′</b></li>`).join('')}</ul>
      </div>` : ''}
      <footer class="sh-foot">
        ${a.rec != null ? `<span><i style="background:${recVar(a.rec)}"></i>REC da manhã <b>${a.rec}</b></span>` : ''}
        ${a.form != null ? `<span>Forma <b>${a.form > 0 ? '+' : a.form < 0 ? '−' : ''}${Math.abs(a.form)}%</b></span>` : ''}
      </footer>
    </article>`;
  screen.querySelector('.sh-close').addEventListener('click', () => { if (history.length > 1) history.back(); else location.hash = '#hoje'; });
}
