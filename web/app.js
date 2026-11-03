// REC — app. Sem framework.
import { renderTrends, zoneOfPct, FORM_ZONES } from './trends.js';
import { renderTrain } from './train.js';
const TOKEN_KEY = 'rec.token';
const screen = document.getElementById('screen');

const store = {
  get: () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set: (v) => { try { localStorage.setItem(TOKEN_KEY, v); } catch {} },
  clear: () => { try { localStorage.removeItem(TOKEN_KEY); } catch {} },
};

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { 'content-type': 'application/json', ...(store.get() ? { authorization: `Bearer ${store.get()}` } : {}), ...(opts.headers || {}) },
  });
  if (res.status === 401) { const had = store.get(); store.clear(); renderGate(had ? 'Código não aceito. Confira e entre de novo.' : ''); throw new Error('401'); }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const zoneOf = (r) => (r == null ? null : r <= 33 ? 'red' : r <= 66 ? 'yellow' : 'green');
const zoneVar = (z) => (z ? `var(--rec-${z})` : 'var(--text-3)');
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const fmtDate = (iso, opts) => new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', opts);

// ---------- acesso ----------
function renderGate(err = '') {
  screen.innerHTML = `
    <form class="gate" autocomplete="off">
      <h1>REC</h1>
      <label for="code">Código de acesso</label>
      <input id="code" type="password" inputmode="text" autocapitalize="off" autocorrect="off" autocomplete="off" spellcheck="false" required>
      <button type="submit">Entrar</button>
      <p class="err" role="alert">${esc(err)}</p>
    </form>`;
  screen.querySelector('form').addEventListener('submit', (e) => {
    e.preventDefault();
    store.set(screen.querySelector('#code').value.trim());
    route();
  });
}

// ---------- hoje ----------
const C = 2 * Math.PI * 46;

function ringSvg(rec) {
  // marcas finas nas divisas das zonas (33 e 66)
  const tick = (p) => {
    const a = (p / 100) * 2 * Math.PI;
    const x1 = 50 + 41 * Math.cos(a), y1 = 50 + 41 * Math.sin(a);
    const x2 = 50 + 51 * Math.cos(a), y2 = 50 + 51 * Math.sin(a);
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
  };
  return `
    <svg class="ring" viewBox="0 0 100 100" aria-hidden="true">
      <circle class="track" cx="50" cy="50" r="46"/>
      <g class="ticks">${tick(33.5)}${tick(66.5)}</g>
      <circle class="arc" cx="50" cy="50" r="46" stroke-dasharray="${C}" stroke-dashoffset="${C}"
        data-target="${rec == null ? C : C * (1 - rec / 100)}"/>
    </svg>`;
}

function contribHtml(list) {
  return list.map((c) => {
    let bar = '';
    if (c.pull != null) {
      const w = Math.min(Math.abs(c.pull) / 3, 1) * 50;
      bar = c.pull >= 0
        ? `<span style="left:50%;width:${w}%"></span>`
        : `<span class="down" style="right:50%;width:${w}%"></span>`;
    }
    const baseTxt = c.base == null ? '' : c.key === 'sleep' ? `necessidade ${c.base}` : `base ${c.base}`;
    return `
      <li>
        <span class="label">${esc(c.label)}</span>
        <span class="value ${c.value == null ? 'missing' : ''}">${c.value == null ? '–' : esc(c.value)}</span>
        <span class="bar" aria-hidden="true">${bar}</span>
        <span class="base">${esc(baseTxt)}</span>
      </li>`;
  }).join('');
}

const ZN = ['Abaixo da Z1', 'Z1', 'Z2', 'Z3', 'Z4', 'Z5'];
function actsHtml(acts) {
  if (!acts.length) return '<p class="empty">Nenhum treino registrado.</p>';
  const nfm = (v, d = 0) => v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const dur = (m) => (m >= 60 ? `${Math.floor(m / 60)}<small>h</small>${String(Math.round(m % 60)).padStart(2, '0')}` : `${Math.round(m)}<small>min</small>`);
  return `<ul class="act-cards">${acts.map((a) => {
    const stats = [`<div><b>${dur(a.min)}</b><small>duração</small></div>`];
    if (a.km >= 0.5) stats.push(`<div><b>${nfm(a.km, 1)}</b><small>km</small></div>`);
    if (a.avghr) stats.push(`<div><b>${Math.round(a.avghr)}</b><small>bpm méd.</small></div>`);
    let zones = '';
    if (a.zones) {
      const tot = a.zones.reduce((x, y) => x + y, 0) || 1;
      const used = a.zones.map((m, i) => ({ i, m })).filter((z) => z.m > 0);
      // barra segmentada + rótulos: cada zona usada com minutos e %
      zones = `<div class="ac-zones" aria-hidden="true">${used.map((z) => `<i class="zc-${z.i}" style="flex:${z.m}"></i>`).join('')}</div>
        <ul class="ac-zlist">${used.map((z) => `<li><i class="zc-${z.i}"></i>${ZN[z.i]} <b>${z.m} min</b> <span>${Math.round((z.m / tot) * 100)}%</span></li>`).join('')}</ul>`;
    }
    return `<li class="act-card" style="--c: var(--${esc(a.sport)})">
      <div class="ac-head"><span class="ac-sport">${esc(a.label)}</span><span class="meta">${esc(a.time)}</span>
        ${a.strain != null ? `<span class="ac-strain"><b>${a.strain}</b><small>Strain</small></span>` : ''}</div>
      <div class="ac-stats">${stats.join('')}</div>
      ${zones}
    </li>`;
  }).join('')}</ul>`;
}

// ---------- Forma: medidor semicircular com as faixas (como o anel do REC) ----------
const G = { min: -50, max: 40 };
function gaugeSvg(pct) {
  const cx = 110, cy = 104, r = 86;
  const ang = (v) => Math.PI * (1 - (Math.min(Math.max(v, G.min), G.max) - G.min) / (G.max - G.min));
  const pt = (v, rr = r) => [cx + rr * Math.cos(ang(v)), cy - rr * Math.sin(ang(v))];
  let lo = G.min, segs = '';
  for (const z of FORM_ZONES) {
    const hi = Math.min(z.max, G.max);
    const [x1, y1] = pt(lo + 0.6), [x2, y2] = pt(hi - 0.6);
    const on = pct != null && zoneOfPct(pct).key === z.key;
    segs += `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)} A${r} ${r} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}" class="gseg${on ? ' on' : ''}" style="stroke:var(--z-${z.key});color:var(--z-${z.key});opacity:${on ? 1 : 0.4}"/>`;
    lo = hi;
  }
  let marker = '';
  if (pct != null) { const [mx, my] = pt(pct); marker = `<circle cx="${mx.toFixed(1)}" cy="${my.toFixed(1)}" r="7" class="gmark" style="fill:var(--z-${zoneOfPct(pct).key})"/>`; }
  return `<svg viewBox="0 0 220 116" class="gauge" aria-hidden="true">${segs}${marker}</svg>`;
}

function formCard(d) {
  const l = d.load, z = l.zone;
  const sg = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v);
  return `
    <a class="form-card" href="#tendencias" aria-label="Forma ${l.formPct ?? '–'} por cento. Ver tendências.">
      <div class="gauge-wrap">
        ${gaugeSvg(l.formPct)}
        <div class="gauge-val">
          <span class="num z-${z?.key ?? 'neutro'}">${l.formPct == null ? '–' : sg(l.formPct) + '%'}</span>
          <span class="hint">${esc(z?.label ?? 'Forma')}</span>
        </div>
      </div>
      <div class="ff">
        <div><span class="c-fit">${l.fitness}</span><small>Fitness</small></div>
        <div><span class="c-fat">${l.fatigue}</span><small>Fadiga</small></div>
        <div><span>${l.strain}</span><small>Strain ${d.isToday ? 'hoje' : 'no dia'}</small></div>
      </div>
    </a>`;
}


function render(d) {
  const z = zoneOf(d.rec);
  document.documentElement.style.setProperty('--rec', zoneVar(z));
  const raceTxt = d.race.days > 0 ? `Aracaju em ${d.race.days} dias` : d.race.days === 0 ? 'Dia de prova' : '';
  const todayIso = d.date;

  screen.innerHTML = `
    <header class="top day-top">
      <div class="daynav">
        <button type="button" data-day="1" aria-label="Dia anterior" ${dayOffset >= MAX_BACK ? 'disabled' : ''}>‹</button>
        <h1>${d.isToday ? 'Hoje, ' : ''}${esc(fmtDate(todayIso, { weekday: d.isToday ? undefined : 'short', day: 'numeric', month: 'short' }).replace(/\./g, ''))}</h1>
        <button type="button" data-day="-1" aria-label="Próximo dia" ${dayOffset === 0 ? 'disabled' : ''}>›</button>
      </div>
      <span class="race">${esc(raceTxt)}</span>
    </header>

    <button class="ring-wrap" aria-expanded="false" aria-controls="contrib"
      aria-label="${d.rec == null ? 'REC sem dados' : `REC ${d.rec}`}. Toque para ver o que compõe o número.">
      ${ringSvg(d.rec)}
      <span class="ring-value">
        <span class="num">${d.rec == null ? '–' : d.rec}</span>
        <span class="hint">REC</span>
      </span>
    </button>

    <ol class="week" aria-label="Últimos 7 dias">
      ${d.week.map((w) => `
        <li class="${w.date === todayIso ? 'is-today' : ''}" title="${w.rec ?? '–'}">
          <i style="background:${w.rec == null ? 'var(--line)' : zoneVar(zoneOf(w.rec))}"></i>
          ${esc(fmtDate(w.date, { weekday: 'narrow' }))}
        </li>`).join('')}
    </ol>

    <div class="contrib" id="contrib"><div><ul>${contribHtml(d.contributors)}</ul></div></div>

    ${d.alerts.map((a) => `<p class="alert" role="status">${esc(a.text)}</p>`).join('')}

    ${d.needsHistory ? '<p class="alert">O histórico ainda não foi carregado, então o REC não tem base. <a href="#garmin">Puxar histórico da Garmin</a></p>' : ''}
    <p class="comment">${esc(d.comment)}</p>
    ${d.shadowMode ? '<p class="shadow-note">Modo sombra: os portões do plano (HRV ≥ 100, FC de repouso ≤ 41) continuam valendo.</p>' : ''}

    ${d.load ? formCard(d) : ''}

    <section class="block">
      <h2>${d.isToday ? 'Treino de hoje' : 'Treinos do dia'}</h2>
      ${actsHtml(d.activities)}
    </section>



    <section class="block feel ${d.feel == null ? 'unset' : ''}">
      <h2 id="feel-label">Como me sinto</h2>
      <div class="feel-row">
        <input type="range" min="1" max="10" step="1" value="${d.feel ?? 5}" aria-labelledby="feel-label">
        <output class="${d.feel == null ? 'unset' : ''}">${d.feel ?? '–'}</output>
      </div>
      <span class="saved" aria-live="polite"></span>
    </section>

    <div class="foot">
      <button class="sync" type="button" ${d.isToday ? '' : 'hidden'}>Atualizar dados</button>
      <a class="foot-link" href="#garmin">Garmin</a>
    </div>
  `;

  // anel: animação única ao abrir
  const arc = screen.querySelector('.arc');
  requestAnimationFrame(() => requestAnimationFrame(() => { arc.style.strokeDashoffset = arc.dataset.target; }));

  // contribuintes ao tocar
  const ringBtn = screen.querySelector('.ring-wrap');
  const contrib = screen.querySelector('#contrib');
  ringBtn.addEventListener('click', () => {
    const open = contrib.classList.toggle('is-open');
    ringBtn.setAttribute('aria-expanded', String(open));
  });

  // nota opcional
  const feel = screen.querySelector('.feel');
  const range = feel.querySelector('input');
  const out = feel.querySelector('output');
  const saved = feel.querySelector('.saved');
  range.addEventListener('input', () => { out.textContent = range.value; out.classList.remove('unset'); feel.classList.remove('unset'); });
  range.addEventListener('change', async () => {
    try {
      await api('/api/feel', { method: 'POST', body: JSON.stringify({ date: todayIso, value: Number(range.value) }) });
      saved.textContent = 'Nota salva.';
    } catch { saved.textContent = 'Não salvou. Tente de novo.'; }
  });

  // atualizar
  const sync = screen.querySelector('.sync');
  sync.addEventListener('click', async () => {
    sync.disabled = true; sync.textContent = 'Atualizando…';
    try { await api('/api/refresh', { method: 'POST' }); await load(); }
    catch { sync.disabled = false; sync.textContent = 'Falhou. Tocar para tentar de novo.'; }
  });
}

let autoTried = '';   // uma busca automática por dia, por abertura
const MAX_BACK = 7;   // dá para voltar até 7 dias
let dayOffset = 0;
const isoToday = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const addIso = (iso, n) => { const t = new Date(iso + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };

function goDay(step, dir) {
  const next = Math.min(MAX_BACK, Math.max(0, dayOffset + step));
  if (next === dayOffset) return;
  dayOffset = next;
  screen.classList.remove('slide-l', 'slide-r');
  void screen.offsetWidth;
  screen.classList.add(dir);
  load();
}

// deslizar: arrastar para a direita volta um dia; para a esquerda avança
let sx = null, sy = null;
screen.addEventListener('touchstart', (e) => {
  if ((location.hash || '#hoje') !== '#hoje' || e.target.closest('input, .chart-wrap')) { sx = null; return; }
  sx = e.touches[0].clientX; sy = e.touches[0].clientY;
}, { passive: true });
screen.addEventListener('touchend', (e) => {
  if (sx == null) return;
  const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
  sx = null;
  if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
  if (dx > 0) goDay(1, 'slide-r'); else goDay(-1, 'slide-l');
}, { passive: true });
screen.addEventListener('click', (e) => {
  const b = e.target.closest('[data-day]');
  if (b && !b.disabled) goDay(Number(b.dataset.day), Number(b.dataset.day) > 0 ? 'slide-r' : 'slide-l');
});

async function load() {
  try {
    const date = addIso(isoToday(), -dayOffset);
    const d = await api(`/api/today?date=${date}`);
    render(d);
    if (dayOffset === 0 && d.needsSync && autoTried !== d.date) {
      autoTried = d.date;
      const sync = screen.querySelector('.sync');
      sync.disabled = true; sync.textContent = 'Buscando a noite na Garmin…';
      await api('/api/refresh?auto=1', { method: 'POST' }).catch(() => {});
      const d2 = await api(`/api/today?date=${date}`);
      render(d2);
      if (d2.needsSync) screen.querySelector('.sync').textContent = 'A noite ainda não chegou à Garmin. Sincronize o relógio e toque aqui.';
    }
  }
  catch (e) { if (e.message !== '401') screen.innerHTML = '<p class="comment" style="margin-top:40vh">Sem conexão com o servidor. Abra de novo em instantes.</p>'; }
}


// ---------- Garmin: estado, teste e histórico ----------
const HISTORY_FROM = '2025-05-01'; // HRV existe desde set/2025; 4 meses antes dão a base de FC de repouso
const addDaysIso = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const ERR = {
  sem_chave: 'A chave da Garmin ainda não está cadastrada. No Cloudflare: Worker rec → Settings → Variables and Secrets → secret GARMIN_API_KEY.',
};
const errText = (e) => ERR[e.message] || e.message;

async function renderGarmin() {
  document.documentElement.style.setProperty('--rec', 'var(--text-3)');
  screen.innerHTML = '<header class="top"><h1>Garmin</h1><a class="foot-link" href="#hoje">Voltar</a></header><p class="empty">Carregando…</p>';
  let st;
  try { st = await api('/api/garmin/status'); } catch (e) { if (e.message !== '401') screen.querySelector('.empty').textContent = errText(e); return; }
  const n = (v) => (v ?? 0).toLocaleString('pt-BR');
  const fmt = (iso) => (iso ? fmtDate(iso, { day: 'numeric', month: 'short', year: 'numeric' }) : '–');
  screen.innerHTML = `
    <header class="top"><h1>Garmin</h1><a class="foot-link" href="#hoje">Voltar</a></header>
    <ul class="acts kv">
      <li><span>Chave</span><span class="meta">${st.hasKey ? 'cadastrada' : 'não cadastrada'}</span></li>
      <li><span>Dias no banco</span><span class="meta">${n(st.dias.n)} (${fmt(st.dias.first)} a ${fmt(st.dias.last)})</span></li>
      <li><span>Noites com HRV</span><span class="meta">${n(st.dias.hrv)}</span></li>
      <li><span>Dias com REC</span><span class="meta">${n(st.recs)}</span></li>
      <li><span>Atividades</span><span class="meta">${n(st.atividades.n)}</span></li>
      <li><span>Com zonas de FC (base do Strain)</span><span class="meta">${n(st.atividades.zonas)}</span></li>
    </ul>
    ${st.hasKey ? '' : `<p class="alert">${esc(ERR.sem_chave)}</p>`}

    <section class="block">
      <h2>Histórico</h2>
      <p class="note">Busca tudo desde ${fmt(HISTORY_FROM)} direto da API, em blocos de 14 dias. Só precisa uma vez; depois o app se atualiza sozinho.</p>
      <button class="btn" id="hist" ${st.hasKey ? '' : 'disabled'}>Puxar histórico</button>
      <p class="progress" id="hist-out" aria-live="polite"></p>
    </section>

    <section class="block">
      <h2>Teste da conexão</h2>
      <p class="note">Busca os últimos 14 dias e mostra quais campos a API entrega.</p>
      <button class="btn ghost" id="check" ${st.hasKey ? '' : 'disabled'}>Testar conexão</button>
      <div id="check-out"></div>
    </section>

    <section class="block">
      <h2>Zonas de FC do Garmin</h2>
      <p class="note">FC máxima, de repouso e limiar configurados no seu Garmin. São a base do cálculo de carga padrão do mercado (hrTSS).</p>
      <button class="btn ghost" id="zones" ${st.hasKey ? '' : 'disabled'}>Ver zonas</button>
      <div id="zones-out"></div>
    </section>

    <section class="block">
      <h2>Últimas sincronizações</h2>
      ${st.log.length ? `<ul class="acts">${st.log.map((l) => `<li><span>${esc(new Date(l.at + 'Z').toLocaleString('pt-BR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))}</span><span class="meta">${esc(l.status)}: ${esc(l.detail)}</span></li>`).join('')}</ul>` : '<p class="empty">Nenhuma ainda.</p>'}
    </section>`;

  screen.querySelector('#hist').addEventListener('click', async (ev) => {
    const btn = ev.currentTarget, out = screen.querySelector('#hist-out');
    btn.disabled = true;
    const today = st.hoje, chunks = [];
    for (let d = HISTORY_FROM; d <= today; d = addDaysIso(d, 14)) chunks.push([d, addDaysIso(d, 13) > today ? today : addDaysIso(d, 13)]);
    let dias = 0, ativ = 0;
    try {
      // retoma de onde parou (o que já veio fica salvo no banco)
      let done = ''; try { done = localStorage.getItem('rec.histDone') || ''; } catch {}
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      for (let i = 0; i < chunks.length; i++) {
        if (chunks[i][1] <= done && chunks[i][1] < addDaysIso(today, -3)) continue;
        for (let tent = 1; ; tent++) {
          out.textContent = `Buscando bloco ${i + 1} de ${chunks.length}…`;
          try {
            const r = await api(`/api/garmin/backfill?from=${chunks[i][0]}&to=${chunks[i][1]}`, { method: 'POST' });
            dias += r.dias; ativ += r.atividades;
            try { localStorage.setItem('rec.histDone', chunks[i][1]); } catch {}
            break;
          } catch (e) {
            // Garmin recusou por excesso de chamadas: espera e tenta de novo sozinho
            if (!/limite|429/.test(e.message) || tent >= 15) throw e;
            for (let s = 60; s > 0; s--) { out.textContent = `A Garmin pediu uma pausa. Bloco ${i + 1} de ${chunks.length}, retomando em ${s} s…`; await sleep(1000); }
          }
        }
        await sleep(1500); // ritmo mais leve para não estourar o limite
      }
      for (let d = '2025-09-01'; d <= today; d = addDaysIso(d, 60)) {
        out.textContent = `Calculando o REC até ${fmt(d)}…`;
        const to = addDaysIso(d, 59) > today ? today : addDaysIso(d, 59);
        await api(`/api/recompute?to=${to}&keep=60`, { method: 'POST' });
      }
      out.textContent = `Pronto: ${n(dias)} dias e ${n(ativ)} atividades.`;
      setTimeout(renderGarmin, 1500);
    } catch (e) {
      out.textContent = `Parou: ${errText(e)} Toque de novo para continuar; o que já veio fica salvo.`;
      btn.disabled = false;
    }
  });

  screen.querySelector('#zones').addEventListener('click', async (ev) => {
    const out = screen.querySelector('#zones-out');
    out.innerHTML = '<p class="progress">Buscando…</p>';
    try { out.innerHTML = `<pre class="raw-pre">${esc(JSON.stringify(await api('/api/garmin/zones'), null, 1))}</pre>`; }
    catch (e) { out.innerHTML = `<p class="alert">${esc(errText(e))}</p>`; }
  });

  screen.querySelector('#check').addEventListener('click', async (ev) => {
    const btn = ev.currentTarget, out = screen.querySelector('#check-out');
    btn.disabled = true; out.innerHTML = '<p class="progress">Testando…</p>';
    try {
      const r = await api('/api/garmin/check?days=14');
      const LABEL = { hrv: 'HRV', rhr: 'FC de repouso', sleep_h: 'Sono', sleep_score: 'Score do sono', resp: 'Respiração', stress: 'Estresse' };
      out.innerHTML = `
        <ul class="acts">${r.fields.map((f) => `<li><span>${LABEL[f.field]}</span><span class="meta">${f.api} de 14 dias${f.ambos ? `, ${f.iguais}/${f.ambos} iguais ao banco` : ''}</span></li>`).join('')}</ul>
        <details class="raw"><summary>Detalhes técnicos</summary><pre>${esc(JSON.stringify({ campos: r.raw, detalhe: r.detail, amostra: r.sample }, null, 1))}</pre></details>`;
    } catch (e) { out.innerHTML = `<p class="alert">${esc(errText(e))}</p>`; }
    btn.disabled = false;
  });
}

function route() {
  const h = location.hash || '#hoje';
  document.querySelectorAll('.tab[href]').forEach((t) => {
    const on = t.getAttribute('href') === (h === '#garmin' ? '#hoje' : h);
    t.classList.toggle('is-active', on);
    if (on) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current');
  });
  window.scrollTo(0, 0);
  if (h === '#garmin') renderGarmin();
  else if (h === '#tendencias') renderTrends(screen, api);
  else if (h === '#treino') renderTrain(screen, api);
  else load();
}
window.addEventListener('hashchange', route);

// ao voltar para o app: recarrega (pega a noite se chegou e troca o dia se virou)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && (location.hash || '#hoje') === '#hoje') { autoTried = ''; dayOffset = 0; load(); }
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
route();
