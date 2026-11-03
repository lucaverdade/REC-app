// Modo prova: Ironman 70.3 Aracaju. Ativa sozinho na semana da prova; antes disso abre como prévia.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tfmt = (m) => {
  if (m == null) return '–';
  const s = Math.round(m * 60), h = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
  return h ? `${h}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${mm}:${String(ss).padStart(2, '0')}`;
};
const recVar = (r) => (r == null ? 'var(--text-3)' : r <= 33 ? 'var(--rec-red)' : r <= 66 ? 'var(--rec-yellow)' : 'var(--rec-green)');
const dayTxt = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '');

export async function renderRace(screen, api) {
  document.documentElement.style.setProperty('--rec', 'var(--text-3)');
  screen.innerHTML = '<header class="top"><h1>Modo prova</h1><a class="foot-link" href="#hoje">Voltar</a></header><p class="empty">Carregando…</p>';
  let d;
  try { d = await api('/api/race'); } catch (e) { if (e.message !== '401') screen.querySelector('.empty').textContent = `Não carregou: ${e.message}`; return; }
  const r = d.race, n = r.days;
  const count = n > 1 ? `<b>${n}</b><span>dias</span>` : n === 1 ? '<b>Amanhã</b>' : n === 0 ? '<b>Hoje</b>' : '<b>Prova feita</b>';
  const total = d.groups.reduce((a, g) => a + g.itens.length, 0);
  const done = d.groups.reduce((a, g) => a + g.itens.filter((i) => d.check[i.id]).length, 0);

  screen.innerHTML = `
    <header class="top"><h1>Modo prova</h1><a class="foot-link" href="#hoje">Voltar</a></header>
    ${r.raceWeek ? '' : '<p class="note">Prévia. O modo prova aparece sozinho na aba Hoje a partir de 23/11.</p>'}

    <section class="race-hero">
      <p class="rh-name">${esc(r.name)}</p>
      <p class="rh-date">${esc((() => { const t = new Date(r.date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }); return t.charAt(0).toUpperCase() + t.slice(1); })())}</p>
      <div class="rh-count">${count}</div>
      <div class="rh-legs">
        <div><i class="dot s-natacao"></i><b>1,9 km</b><small>Natação</small></div>
        <div><i class="dot s-bike"></i><b>90 km</b><small>Bike</small></div>
        <div><i class="dot s-corrida"></i><b>21,1 km</b><small>Corrida</small></div>
      </div>
      <div class="rh-now">
        <span><i style="background:${recVar(d.today.rec)}"></i>REC hoje <b>${d.today.rec ?? '–'}</b></span>
        <span>Forma <b class="z-${d.today.zone?.key ?? 'neutro'}">${d.today.formPct == null ? '–' : (d.today.formPct > 0 ? '+' : d.today.formPct < 0 ? '−' : '') + Math.abs(d.today.formPct) + '%'}</b></span>
      </div>
    </section>

    <section class="block">
      <h2>Checklist <span class="h2-num">${done} de ${total}</span></h2>
      ${d.groups.map((g) => `
        <h3 class="sub">${esc(g.grupo)}</h3>
        <ul class="checklist">${g.itens.map((i) => `
          <li><label><input type="checkbox" data-id="${esc(i.id)}" ${d.check[i.id] ? 'checked' : ''}><span>${esc(i.texto)}</span></label></li>`).join('')}
        </ul>`).join('')}
    </section>

    <section class="block">
      <h2>Carbo por dia</h2>
      ${d.carbo?.length ? `<ul class="acts">${d.carbo.map((c) => `<li><span>${esc(dayTxt(c.data))}</span><span class="meta"><b>${esc(c.gramas)} g</b>${c.nota ? `, ${esc(c.nota)}` : ''}</span></li>`).join('')}</ul>`
        : '<p class="empty">Ainda não publicado pelo chat de treino.</p>'}
    </section>

    <section class="block">
      <h2>Plano de prova</h2>
      ${d.pace ? `<ul class="acts">${[['natacao', 'Natação'], ['bike', 'Bike'], ['corrida', 'Corrida'], ['nutricao', 'Nutrição na prova']]
        .filter(([k]) => d.pace[k]).map(([k, l]) => `<li><span><i class="dot s-${k === 'nutricao' ? 'outro' : k}"></i>${l}</span><span class="meta">${esc(d.pace[k])}</span></li>`).join('')}</ul>`
        : '<p class="empty">Ainda não publicado pelo chat de treino.</p>'}
      ${d.notas ? `<p class="note">${esc(d.notas)}</p>` : ''}
      ${d.halfPrediction ? `<p class="note">Previsão da meia isolada hoje: <b>${tfmt(d.halfPrediction)}</b> (referência; no 70.3 a corrida vem depois de 90 km de bike).</p>` : ''}
    </section>`;

  screen.querySelectorAll('.checklist input').forEach((cb) => cb.addEventListener('change', async () => {
    const h = screen.querySelector('.h2-num');
    const cur = Number(h.textContent.split(' ')[0]) + (cb.checked ? 1 : -1);
    h.textContent = `${cur} de ${total}`;
    try { await api('/api/race/check', { method: 'POST', body: JSON.stringify({ id: cb.dataset.id, done: cb.checked }) }); }
    catch { cb.checked = !cb.checked; h.textContent = `${cur + (cb.checked ? 1 : -1)} de ${total}`; }
  }));
}
