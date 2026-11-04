// Modo prova: Ironman 70.3 Aracaju. Ativa sozinho na semana da prova; antes disso abre como prévia.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const tfmt = (m) => {
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

    ${projHtml(d.projection, r.date)}

    <section class="block" id="wx"><h2>Clima em Aracaju no dia</h2><p class="empty">Carregando…</p></section>

    <section class="block" id="chk"></section>

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

  renderChecklist(screen.querySelector('#chk'), d.items, api);
  renderWeather(screen.querySelector('#wx'), api);
}

// Clima do dia da prova: previsão hora a hora (a partir de 16 dias antes) ou o que costuma fazer
async function renderWeather(sec, api) {
  let w; try { w = await api('/api/weather'); } catch (e) { sec.querySelector('.empty').textContent = `Não carregou: ${e.message}`; return; }
  if (!w.rows?.length) { sec.querySelector('.empty').textContent = 'Clima indisponível agora. Tenta de novo mais tarde.'; return; }
  const prev = w.mode === 'previsao';
  const max = Math.max(...w.rows.map((r) => r.temp ?? 0)), min = Math.min(...w.rows.map((r) => r.temp ?? 99));
  const hum = Math.round(w.rows.reduce((a, r) => a + (r.hum ?? 0), 0) / w.rows.length);
  const head = prev
    ? `Previsão para domingo, 5 h às 13 h: <b>${min}–${max} °C</b>, umidade ~${hum}%.`
    : `O que costuma fazer em 29/11 entre 5 h e 13 h: <b>${min}–${max} °C</b>, umidade ~${hum}%.`;
  sec.innerHTML = `
    <h2>Clima em Aracaju no dia</h2>
    <p class="proj-head">${head}</p>
    <div class="wx" role="table" aria-label="Clima por hora">
      <div class="wx-r wx-h" role="row"><span>Hora</span><span>°C</span>${prev ? '<span>Sensação</span>' : ''}<span>Umidade</span><span>Vento</span><span>Chuva</span></div>
      ${w.rows.map((r) => `<div class="wx-r" role="row"><span>${r.h} h</span><span><b>${r.temp ?? '–'}</b></span>${prev ? `<span>${r.feels ?? '–'}</span>` : ''}<span>${r.hum ?? '–'}%</span><span>${r.wind ?? '–'} km/h</span><span>${r.rain ?? '–'}%</span></div>`).join('')}
    </div>
    <p class="note">${prev ? 'Previsão Open-Meteo, atualizada a cada 3 h. Chuva = chance de chover.'
      : `Média de ${w.years ?? 10} anos (22/11 a 06/12), Open-Meteo. Chuva = % das horas com chuva. A previsão do dia entra sozinha a partir de ${new Date(w.availableFrom + 'T12:00:00').toLocaleDateString('pt-BR', { day: 'numeric', month: 'numeric' })}.`}</p>`;
}

// Forma projetada até a prova: últimos 14 dias reais + dias com plano publicado
const ZONES = [['risco', -Infinity, -30], ['produtivo', -30, -10], ['neutro', -10, 5], ['descansado', 5, 20], ['perdendo', 20, Infinity]];
const zkey = (p) => ZONES.find(([, lo, hi]) => p >= lo && p < hi)?.[0] ?? 'neutro';
const sg = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v) + '%';
const short = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { day: 'numeric', month: 'numeric' });
export function projHtml(pr, raceDate) {
  if (!pr?.series?.length) return '';
  const S = pr.series.filter((x) => x.formPct != null);
  const W = 340, H = 130, n = S.length;
  const lo = Math.min(-40, ...S.map((x) => x.formPct)), hi = Math.max(25, ...S.map((x) => x.formPct));
  const y = (v) => ((hi - v) / (hi - lo)) * H, slot = W / n, bw = Math.max(3, Math.min(14, slot - 3));
  const bands = ZONES.map(([k, a, b]) => { const t = y(Math.min(b, hi)), bt = y(Math.max(a, lo)); return bt > t ? `<rect x="0" y="${t.toFixed(1)}" width="${W}" height="${(bt - t).toFixed(1)}" fill="var(--z-${k})" opacity=".07"/>` : ''; }).join('');
  const bars = S.map((x, i) => {
    const top = Math.min(y(x.formPct), y(0)), h = Math.max(1, Math.abs(y(x.formPct) - y(0)));
    const cx = i * slot + (slot - bw) / 2;
    return `<rect x="${cx.toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="1.5" fill="var(--z-${zkey(x.formPct)})" ${x.projected ? 'fill-opacity=".35" stroke="var(--z-' + zkey(x.formPct) + ')" stroke-width="1" stroke-dasharray="2 2"' : ''}/>`;
  }).join('');
  const iToday = S.findIndex((x) => x.projected);
  const sep = iToday > 0 ? `<line x1="${(iToday * slot).toFixed(1)}" x2="${(iToday * slot).toFixed(1)}" y1="0" y2="${H}" class="pj-sep"/>` : '';
  const ticks = [0, iToday > 0 ? iToday - 1 : null, n - 1].filter((i, k, a) => i != null && a.indexOf(i) === k)
    .map((i) => `<text x="${(i * slot + slot / 2).toFixed(1)}" y="${H + 14}" text-anchor="middle" class="pj-t">${S[i].date === raceDate ? 'prova' : short(S[i].date)}</text>`).join('');
  const end = pr.raceDay ? { ...pr.raceDay, date: raceDate } : pr.end;
  const head = pr.raceDay
    ? `Forma prevista no dia da prova: <b class="z-${end.zone?.key}">${sg(end.formPct)}</b>, ${esc(end.zone?.label.toLowerCase())}.`
    : end ? `Plano publicado até ${esc(short(pr.planUntil ?? end.date))}. Forma prevista em ${esc(short(end.date))}: <b class="z-${end.zone?.key}">${sg(end.formPct)}</b>, ${esc(end.zone?.label.toLowerCase())}.` : '';
  return `
    <section class="block proj">
      <h2>Forma até a prova</h2>
      <p class="proj-head">${head}</p>
      <svg viewBox="0 -4 ${W} ${H + 22}" class="chart" role="img" aria-label="Forma dos últimos 14 dias e projetada pelo plano">${bands}<line x1="0" x2="${W}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}" class="zero"/>${sep}${bars}${ticks}</svg>
      <p class="note">Barras cheias: Forma real. Tracejadas: projeção com o Strain previsto do plano publicado (dia sem sessão = descanso). Alvo para a prova: descansado, entre +5% e +20%.${pr.raceDay ? '' : ' A projeção chega ao dia da prova quando o plano das últimas semanas for publicado.'}</p>
    </section>`;
}

// Checklist escrito pelo Luca: adicionar, marcar e apagar; salvo no servidor.
function renderChecklist(sec, items, api) {
  const done = items.filter((i) => i.done).length;
  sec.innerHTML = `
    <h2>Checklist${items.length ? ` <span class="h2-num">${done} de ${items.length}</span>` : ''}</h2>
    ${items.length ? `<ul class="checklist">${items.map((i) => `
      <li><label><input type="checkbox" data-id="${esc(i.id)}" ${i.done ? 'checked' : ''}><span>${esc(i.texto)}</span></label>
        <button type="button" class="ck-del" data-del="${esc(i.id)}" aria-label="Apagar ${esc(i.texto)}">×</button></li>`).join('')}</ul>`
      : '<p class="empty">Lista vazia. Escreva o que não pode esquecer.</p>'}
    <form class="ck-add">
      <input name="t" maxlength="200" placeholder="Novo item" autocomplete="off" aria-label="Novo item">
      <button class="btn" type="submit">Adicionar</button>
    </form>`;
  const send = async (body) => {
    try { const r = await api('/api/race/items', { method: 'POST', body: JSON.stringify(body) }); renderChecklist(sec, r.items, api); }
    catch (e) { sec.querySelector('.ck-add input').placeholder = `Não salvou: ${e.message}`; }
  };
  sec.querySelector('.ck-add').addEventListener('submit', (e) => {
    e.preventDefault();
    const t = e.currentTarget.elements.t.value.trim();
    if (t) send({ action: 'add', texto: t }).then(() => sec.querySelector('.ck-add input')?.focus());
  });
  sec.querySelectorAll('.checklist input').forEach((cb) => cb.addEventListener('change', () => send({ action: 'toggle', id: cb.dataset.id, done: cb.checked })));
  sec.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => send({ action: 'remove', id: b.dataset.del })));
}
