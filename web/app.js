// REC — aba Hoje. Sem framework; um arquivo.
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
    headers: { 'content-type': 'application/json', authorization: `Bearer ${store.get()}`, ...(opts.headers || {}) },
  });
  if (res.status === 401) { store.clear(); renderGate('Código não aceito. Confira e entre de novo.'); throw new Error('401'); }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
      <input id="code" type="password" inputmode="text" autocapitalize="off" required>
      <button type="submit">Entrar</button>
      <p class="err" role="alert">${esc(err)}</p>
    </form>`;
  screen.querySelector('form').addEventListener('submit', (e) => {
    e.preventDefault();
    store.set(screen.querySelector('#code').value.trim());
    load();
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

function actsHtml(acts) {
  if (!acts.length) return '<p class="empty">Nenhum treino registrado hoje.</p>';
  return `<ul class="acts">${acts.map((a) => {
    const bits = [];
    if (a.km >= 0.5) bits.push(`${a.km.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km`);
    bits.push(`${Math.round(a.min)} min`);
    if (a.avghr) bits.push(`${Math.round(a.avghr)} bpm`);
    if (a.load) bits.push(`carga ${Math.round(a.load)}`);
    return `<li><span>${esc(a.label)} <span class="meta">${esc(a.time)}</span></span><span class="meta">${bits.join(', ')}</span></li>`;
  }).join('')}</ul>`;
}

function render(d) {
  const z = zoneOf(d.rec);
  document.documentElement.style.setProperty('--rec', zoneVar(z));
  const raceTxt = d.race.days > 0 ? `Aracaju em ${d.race.days} dias` : d.race.days === 0 ? 'Dia de prova' : '';
  const todayIso = d.date;

  screen.innerHTML = `
    <header class="top">
      <h1>${esc(cap(fmtDate(todayIso, { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '')))}</h1>
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

    <p class="comment">${esc(d.comment)}</p>
    ${d.shadowMode ? '<p class="shadow-note">Modo sombra: os portões do plano (HRV ≥ 100, FC de repouso ≤ 41) continuam valendo.</p>' : ''}

    <section class="block">
      <h2>Treino de hoje</h2>
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

    <button class="sync" type="button">Atualizar dados</button>
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

async function load() {
  if (!store.get()) return renderGate();
  try { render(await api('/api/today')); }
  catch (e) { if (e.message !== '401') screen.innerHTML = '<p class="comment" style="margin-top:40vh">Sem conexão com o servidor. Abra de novo em instantes.</p>'; }
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
load();
