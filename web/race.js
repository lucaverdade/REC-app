import { predictions } from './trends.js';
import { ICON, cardHead, countUp } from './ui.js';
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
  screen.innerHTML = '<header class="top"><h1>Prova</h1></header><p class="empty">Carregando…</p>';
  let d;
  try { d = await api('/api/race'); } catch (e) { if (e.message !== '401') screen.querySelector('.empty').textContent = `Não carregou: ${e.message}`; return; }
  const r = d.race, n = r.days;
  const count = n > 1 ? `<b data-count="${n}">${n}</b><span>dias</span>` : n === 1 ? '<b>Amanhã</b>' : n === 0 ? '<b>Hoje</b>' : '<b>Prova feita</b>';

  screen.innerHTML = `
    <header class="top"><h1>Prova</h1></header>

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

    <section class="card">${cardHead('stopwatch', 'Previsões de corrida', { color: 'var(--pred)' })}<div id="pred"></div></section>

    ${heatHtml(d.heat)}

    <section class="card" id="wx">${cardHead('sun', 'Clima em Aracaju no dia', { color: '#ffb547' })}<p class="empty">Carregando…</p></section>

    <section class="card" id="chk"></section>

    <section class="card" id="carbo">${cardHead('fork', 'Carbo por dia', { color: 'var(--good)', info: 'Publicado pelo chat de treino em prova.json. Toque num dia para ver o que fazer.' })}
      ${d.carbo?.length ? carboHtml(d.carbo) : '<p class="empty">Ainda não publicado pelo chat de treino.</p>'}
    </section>

    <section class="card">${cardHead('route', 'Plano de prova', { info: d.notas ? esc(d.notas) : '' })}
      ${d.pace ? `<div class="legs">${[['natacao', 'Natação', 'swim'], ['bike', 'Bike', 'bike'], ['corrida', 'Corrida', 'run'], ['nutricao', 'Nutrição', 'gel']]
        .filter(([k]) => d.pace[k]).map(([k, l, ic]) => `<div class="leg" style="--c:var(--${k === 'nutricao' ? 'good' : k})"><div class="leg-h">${ICON[ic]}<b>${l}</b></div><p>${esc(d.pace[k])}</p></div>`).join('')}</div>`
        : '<p class="empty">Ainda não publicado pelo chat de treino.</p>'}
      ${d.halfPrediction ? `<p class="card-foot">Meia isolada hoje: <b>${tfmt(d.halfPrediction)}</b>. No 70.3 a corrida vem depois de 90 km de bike.</p>` : ''}
    </section>`;

  renderChecklist(screen.querySelector('#chk'), d.items, api);
  renderWeather(screen.querySelector('#wx'), api);
  predictions(screen, api);
  bindCarbo(screen, d.carbo);
  countUp(screen);
}

// Carbo: colunas por dia (altura = gramas); toque mostra a nota do dia
function carboHtml(list) {
  const max = Math.max(...list.map((c) => Number(c.gramas) || 0), 1);
  const today = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
  const sel = Math.max(0, list.findIndex((c) => c.data >= today));
  return `<div class="cb-cols">${list.map((c, i) => {
    const dt = new Date(c.data + 'T12:00:00');
    return `<button type="button" class="cb-col" data-i="${i}" aria-pressed="${i === sel}"><span class="cb-g">${esc(c.gramas)}<small>g</small></span>
      <span class="cb-bar"><i style="height:${Math.round(((Number(c.gramas) || 0) / max) * 100)}%"></i></span>
      <span class="cb-d">${dt.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}<b>${dt.getDate()}</b></span></button>`;
  }).join('')}</div><p class="cb-note">${esc(list[sel]?.nota ?? '')}</p>`;
}
function bindCarbo(screen, list) {
  const box = screen.querySelector('#carbo'); if (!box || !list?.length) return;
  box.querySelectorAll('.cb-col').forEach((b) => b.addEventListener('click', () => {
    box.querySelectorAll('.cb-col').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    box.querySelector('.cb-note').textContent = list[Number(b.dataset.i)]?.nota ?? '';
  }));
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
  const icon = (r) => ((r.rain ?? 0) >= 40 ? ICON.rain : (r.rain ?? 0) >= 15 ? ICON.cloud : r.h <= 6 ? ICON.partly : ICON.sun);
  const info = prev ? 'Previsão Open-Meteo, atualizada a cada 3 h. Gota = chance de chuva.'
    : `Média de ${w.years ?? 10} anos (22/11 a 06/12), Open-Meteo. Gota = % das horas com chuva. A previsão do dia entra sozinha a partir de ${new Date(w.availableFrom + 'T12:00:00').toLocaleDateString('pt-BR', { day: 'numeric', month: 'numeric' })}.`;
  sec.innerHTML = `${cardHead('sun', 'Clima em Aracaju no dia', { color: '#ffb547', info })}
    <p class="card-lead">${head}</p>
    <div class="wx-strip" role="list" aria-label="Clima por hora">${w.rows.map((r) => `
      <div class="wx-h" role="listitem"><span class="wx-t">${r.h}h</span>${icon(r)}<b>${r.temp ?? '–'}°</b>${prev && r.feels != null ? `<small>sens. ${r.feels}°</small>` : ''}<small>${r.hum ?? '–'}%</small><small>${r.wind ?? '–'} km/h</small>${(r.rain ?? 0) > 0 ? `<small class="wx-rain">💧${r.rain}%</small>` : '<small class="wx-rain">–</small>'}</div>`).join('')}
    </div>`;
}

// Aclimatação ao calor: sessões no calor dos últimos 14 dias
export function heatHtml(h, withTitle = true) {
  if (!h) return '';
  const dd = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'numeric' }).replace('.', '');
  const head = !h.count14 ? 'Nenhuma sessão no calor nos últimos 14 dias.'
    : `<b>${h.count14} ${h.count14 === 1 ? 'sessão' : 'sessões'}</b> no calor nos últimos 14 dias (${h.minutes14} min)${h.daysSince != null ? `, a última ${h.daysSince === 0 ? 'hoje' : h.daysSince === 1 ? 'ontem' : `há ${h.daysSince} dias`}` : ''}.`;
  const info = `Conta como sessão no calor o treino que o plano marcou como calor ("Calor 1", "Calor 2"…) ou o treino na rua com temperatura média de 28 °C ou mais em Brasília durante o treino${h.weather ? '' : ' (temperatura indisponível agora)'}. Treinos de 20 min ou mais.<br><br>Referência dos estudos de aclimatação: as adaptações (mais plasma, suor mais cedo, FC mais baixa no calor) aparecem com cerca de 5 sessões e ficam quase completas com 8 a 10 em 1 a 2 semanas; sem estímulo por mais de uma semana, começam a se perder aos poucos.`;
  const dots = Array.from({ length: 10 }, (_, i) => `<i class="${i < h.count14 ? 'on' : ''}"></i>`).join('');
  return `
    <section class="card heat">
      ${withTitle ? cardHead('flame', 'Aclimatação ao calor', { color: '#ff8a5c', info }) : ''}
      <p class="card-lead">${head}</p>
      <div class="heat-dots" aria-hidden="true">${dots}<span>5 · 8–10</span></div>
      ${h.sessions.length ? `<ul class="acts">${h.sessions.map((x) => `<li><span><i class="dot s-${x.sport}"></i>${esc(dd(x.date))} · ${esc(x.label)} ${x.min} min</span><span class="meta">${esc(x.why)}</span></li>`).join('')}</ul>` : ''}
      ${withTitle ? '' : `<p class="note">${info}</p>`}
    </section>`;
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
    <section class="card proj">
      ${cardHead('trend', 'Forma até a prova', { color: 'var(--z-descansado)', info: `Barras cheias: Forma real. Tracejadas: projeção com o Strain previsto do plano publicado (dia sem sessão = descanso). Alvo para a prova: descansado, entre +5% e +20%.${pr.raceDay ? '' : ' A projeção chega ao dia da prova quando o plano das últimas semanas for publicado.'}` })}
      <p class="card-lead">${head}</p>
      <svg viewBox="0 -4 ${W} ${H + 22}" class="chart" role="img" aria-label="Forma dos últimos 14 dias e projetada pelo plano">${bands}<line x1="0" x2="${W}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}" class="zero"/>${sep}${bars}${ticks}</svg>
    </section>`;
}

// Checklist escrito pelo Luca: adicionar, marcar e apagar; salvo no servidor.
function renderChecklist(sec, items, api) {
  const done = items.filter((i) => i.done).length;
  sec.innerHTML = `
    ${cardHead('check', 'Checklist', { right: items.length ? `${done} de ${items.length}` : '' })}
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
