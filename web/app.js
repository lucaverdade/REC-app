// REC — app. Sem framework.
import { renderTrends, renderTrendDetail, zoneOfPct, FORM_ZONES } from './trends.js';
import { renderTrain } from './train.js';
import { renderRace, renderReport } from './race.js';
import { reviewHtml } from './review.js';
import { renderShare } from './share.js';
import { ICON, cardHead, countUp, readyColor, heroRing, animateRings, readyStops } from './ui.js';
import { renderActivity } from './activity.js';
import { renderSleep, renderWeekReview } from './views.js';
import { recalcHistory, testOne } from './zones.js';
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
  if (opts.raw) return res;
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

function readyPartsHtml(r) {
  if (!r) return '';
  const W = { corpo: 55, carga: 20, ontem: 10, sono: 15 };
  return `<ul>${r.parts.map((p) => {
    const w = p.z == null ? 0 : Math.min(Math.abs(p.z) / 2.5, 1) * 50;
    const bar = p.z == null ? '' : p.z >= 0 ? `<span style="left:50%;width:${w}%"></span>` : `<span class="down" style="right:50%;width:${w}%"></span>`;
    return `<li><span class="label">${esc(p.label)}</span><span class="value ${p.z == null ? 'missing' : ''}">${W[p.key]}%</span><span class="bar" aria-hidden="true">${bar}</span><span class="base rp-d">${esc(p.detail)}</span></li>`;
  }).join('')}</ul>${r.cap ? `<p class="comment">${esc(r.cap)}</p>` : ''}<p class="comment rp-note">Cada parte comparada com o seu normal; barra para a direita ajuda, para a esquerda pesa. O número é fixo desde a manhã: o treino de hoje entra na Prontidão de amanhã.</p>`;
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
    return `<li class="act-card" style="--c: var(--${esc(a.sport)})">${a.id ? `<a class="ac-link" href="#atv/${encodeURIComponent(a.id)}" aria-label="Ver os detalhes do treino"></a>` : ''}
      <div class="ac-head"><span class="ac-sport">${esc(a.label)}</span><span class="meta">${esc(a.time)}</span>
        ${a.strain != null ? `<span class="ac-strain"><b>${a.strain}</b><small>Strain</small></span>` : ''}</div>
      <div class="ac-stats">${stats.join('')}</div>
      ${zones}
      ${a.id ? '<span class="ac-share">Detalhes do treino ›</span>' : ''}
    </li>`;
  }).join('')}</ul>`;
}

// ---------- anéis do topo (REC, Forma, Strain) ----------
const RC = 2 * Math.PI * 40;
// Forma: anel com as 5 faixas (−50% a +40%), faixa atual acesa e marcador na posição
const FZ = [[-50, -30, 'risco'], [-30, -10, 'produtivo'], [-10, 5, 'neutro'], [5, 20, 'descansado'], [20, 40, 'perdendo']];
function formSegments(pct) {
  const pos = (v) => (Math.min(40, Math.max(-50, v)) + 50) / 90;
  const cur = pct == null ? null : FZ.find(([lo, hi]) => pct < hi) ?? FZ[FZ.length - 1];
  const segs = FZ.map(([lo, hi, k]) => {
    const a = pos(lo) + 0.012, b = pos(hi) - 0.012;
    return `<circle cx="50" cy="50" r="40" class="rt-seg" style="stroke:var(--z-${k});opacity:${cur && cur[2] === k ? 1 : 0.28}"
      stroke-dasharray="${(b - a) * RC} ${RC}" stroke-dashoffset="${-a * RC}"/>`;
  }).join('');
  if (pct == null) return segs;
  const ang = pos(pct) * 2 * Math.PI;
  return `${segs}<circle cx="${50 + 40 * Math.cos(ang)}" cy="${50 + 40 * Math.sin(ang)}" r="6" class="rt-mark" style="fill:var(--z-${cur[2]})"/>`;
}

// REC: 5 faixas em tons do semáforo, faixa atual acesa e marcador no valor
const RZ = [[0, 20, '--rb1'], [20, 33.5, '--rb2'], [33.5, 50, '--rb3'], [50, 66.5, '--rb4'], [66.5, 100, '--rb5']];
function recSegments(rec) {
  const pos = (v) => Math.min(100, Math.max(0, v)) / 100;
  const cur = rec == null ? null : RZ.find(([lo, hi]) => rec < hi) ?? RZ[RZ.length - 1];
  const segs = RZ.map(([lo, hi, c]) => {
    const a = pos(lo) + 0.008, b = pos(hi) - 0.008;
    return `<circle cx="50" cy="50" r="40" class="rt-seg${cur && cur[2] === c ? ' rt-seg-on' : ''}" style="stroke:var(${c});opacity:${cur && cur[2] === c ? 1 : 0.28}"
      stroke-dasharray="${(b - a) * RC} ${RC}" stroke-dashoffset="${-a * RC}"/>`;
  }).join('');
  if (rec == null) return segs;
  const ang = pos(rec) * 2 * Math.PI;
  return `${segs}<g class="rt-markg" style="--a:${(pos(rec) * 360).toFixed(1)}deg"><circle cx="90" cy="50" r="6" class="rt-mark" style="fill:var(${cur[2]})"/></g>`;
}

// anel de Strain com meta do dia: enche com o feito; tracinho na meta (2/3 da volta)
function strainRing(done, t) {
  // Strain não é porcentagem: o anel mostra o número feito; a meta é o tracinho.
  // Escala fixa = 1,5 × meta. Até a meta o arco é ciano; o que passa da meta fica em outra cor.
  const target = t.target, scale = target * 1.5;
  const fIn = Math.min(done, target) / scale, fOver = Math.max(0, Math.min(done, scale) - target) / scale;
  const tA = (target / scale) * 2 * Math.PI;
  const over = done - target;
  const why = [
    `Seu dia médio (Fitness): ${t.base}`,
    ...t.factors.map((x) => `${x.label}: ×${String(x.f).replace('.', ',')}`),
    t.week ? `Semana: teto ${t.week.hi}, feito até ontem ${t.week.doneBefore}, sobram ${t.week.room} para ${t.week.daysLeft} ${t.week.daysLeft === 1 ? 'dia' : 'dias'}${t.week.limited ? ' (limitou a meta)' : ''}` : null,
  ].filter(Boolean);
  const status = done === 0 ? 'Nenhum treino ainda.'
    : over < 0 ? `Faltam ${-over} para a meta.`
    : over <= target * 0.15 ? 'Na meta.'
    : `${over} acima da meta.`;
  return `<div class="st-card">
    <span class="st-ring">
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r="40" class="rt-track"/>
        <circle cx="50" cy="50" r="40" class="rt-arc st-arc" stroke-dasharray="${RC}" stroke-dashoffset="${RC}" data-target="${RC * (1 - fIn)}"/>
        ${fOver > 0 ? `<circle cx="50" cy="50" r="40" class="st-over" stroke-dasharray="${(RC * fOver).toFixed(1)} ${RC}" stroke-dashoffset="${(-RC * (target / scale)).toFixed(1)}"/>` : ''}
        <line x1="${50 + 33 * Math.cos(tA)}" y1="${50 + 33 * Math.sin(tA)}" x2="${50 + 49 * Math.cos(tA)}" y2="${50 + 49 * Math.sin(tA)}" class="st-tick"/>
      </svg>
      <span class="rt-val"><span>${done}</span></span>
    </span>
    <div class="st-txt">
      <b>Strain ${done} <span>· meta ${target}</span></b>
      <span class="${over > target * 0.15 ? 'st-hi' : ''}">${status}</span>
      ${t.plan != null ? `<small>Plano de hoje previa ${t.plan}${t.planNote === 'acima' ? ', acima da meta' : t.planNote === 'abaixo' ? ', bem abaixo da meta' : ''}.</small>` : ''}
      <details class="st-why"><summary>Como a meta foi calculada</summary><ul>${why.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>
        <p>A meta é quanto Strain cabe hoje sem pesar demais, olhando REC, semana e carga recente. Strain não tem teto: cresce com a duração e muito com a FC (mesma régua do Relative Effort do Strava). Modo sombra: o plano do treinador manda.</p></details>
    </div>
  </div>`;
}

function ringTile({ id, value, unit = '', frac = 0, color, valColor = '', label, sub, aria, segments }) {
  const f1 = Math.max(0, Math.min(1, frac)), f2 = Math.max(0, Math.min(1, frac - 1)); // segunda volta (Strain acima de 100%)
  return `<button type="button" class="rtile" data-ring="${id}" aria-label="${esc(aria)}" ${id === 'ready' ? 'aria-expanded="false" aria-controls="ready-parts"' : ''}>
    <span class="rt-ring">
      <svg viewBox="0 0 100 100" aria-hidden="true">
        ${segments ?? `<circle cx="50" cy="50" r="40" class="rt-track"/>
        <circle cx="50" cy="50" r="40" class="rt-arc" style="stroke:${color}" stroke-dasharray="${RC}" stroke-dashoffset="${RC}" data-target="${RC * (1 - f1)}"/>`}
        ${!segments && f2 > 0 ? `<circle cx="50" cy="50" r="40" class="rt-arc rt-lap" style="stroke:${color}" stroke-dasharray="${RC}" stroke-dashoffset="${RC}" data-target="${RC * (1 - f2)}"/>` : ''}
      </svg>
      <span class="rt-val"${valColor ? ` style="color:${valColor}"` : ''}><span><span${typeof value === 'number' ? ` data-count="${value}"` : ''}>${value}</span>${unit ? `<small>${unit}</small>` : ''}</span></span>
    </span>
    <span class="rt-label">${esc(label)}</span>
    <span class="rt-sub">${esc(sub)}</span>
  </button>`;
}

// anel principal (05/11): sem nome; arco em degradê pelas cores da escala até o valor do dia, ponta luminosa,
// brilho que respira devagar e número que conta. Animação via --p (CSS @property).
function heroReady(v, { sub = '', aria = '' } = {}) {
  return heroRing({ id: 'ready', frac: v == null ? 0 : v / 100, text: v ?? '–', count: typeof v === 'number' ? v : null, unit: '%', stops: v == null ? ['var(--text-3)', 'var(--text-3)'] : readyStops(v),
    sub: esc(sub), aria, empty: v == null, attrs: 'aria-expanded="false" aria-controls="ready-parts"' });
}

// linha curta embaixo de cada anel
function recSub(d) {
  const prev = d.week.filter((w) => w.date < d.date && w.rec != null).map((w) => w.rec);
  if (prev.length < 3) return '';
  return `média da semana ${Math.round(prev.reduce((a, b) => a + b, 0) / prev.length)}`;
}
const shortZone = (k) => ({ risco: 'Muito cansado', produtivo: 'Em bloco de treino', neutro: 'Equilibrado', descansado: 'Descansado', perdendo: 'Perdendo forma' }[k] ?? '');
// Strain do dia comparado ao seu dia normal (Fitness = Strain médio por dia nas últimas 6 semanas)
function strainCat(l) {
  if (!l || l.strain == null) return '';
  if (!l.strain) return 'Descanso';
  const r = l.fitness ? l.strain / l.fitness : 1;
  return r < 0.5 ? 'Leve' : r < 1.25 ? 'Moderado' : r < 2 ? 'Pesado' : 'Muito pesado';
}

// sessões planejadas para o dia (do plano publicado pelo chat de treino), com Strain previsto
function plannedHtml(pl, acts) {
  return `<ul class="planned">${pl.map((p) => `<li><span><i class="dot s-${esc(p.sport)}"></i>${esc(p.titulo || p.label)}
      <span class="meta">${p.minutos ? `${p.minutos} min` : ''}${p.zona ? `, ${esc(p.zona)}` : ''}</span></span>
      ${p.strain != null ? `<span class="pl-strain">previsto <b>${p.strain}</b></span>` : ''}</li>`).join('')}</ul>`;
}

// Fadiga (muda todo dia) e Fitness como tendência de semanas
function loadStrip(l) {
  const dv = l.fatigueVsYesterday;
  const fat = dv == null || dv === 0 ? 'igual a ontem' : `${dv > 0 ? '↑' : '↓'} ${Math.abs(dv)} desde ontem`;
  const f4 = l.fitness4w;
  const fit = f4 == null ? '' : f4 === 0 ? 'estável em 4 sem.' : `${f4 > 0 ? '↑' : '↓'} ${Math.abs(f4)}% em 4 sem.`;
  return `<a class="load-strip" href="#tendencias" aria-label="Fadiga e Fitness. Ver tendências.">
    <div class="ls-row">
      <span class="ls-l"><i class="dot" style="background:var(--fatigue)"></i>Fadiga</span>
      <b class="c-fat" data-count="${l.fatigue}">${l.fatigue}</b>
      <span class="ls-d ${dv > 0 ? 'bad' : dv < 0 ? 'good' : ''}">${fat}</span>
      ${spark((l.trend ?? []).slice(-14).map((x) => x.fatigue), 'var(--fatigue)')}
    </div>
    <div class="ls-row">
      <span class="ls-l"><i class="dot" style="background:var(--fitness)"></i>Fitness</span>
      <b class="c-fit" data-count="${l.fitness}">${l.fitness}</b>
      <span class="ls-d ${f4 > 0 ? 'good' : f4 < 0 ? 'bad' : ''}">${fit}</span>
      ${weekDots(l.fitnessWeekly ?? [])}
    </div>
    <p class="ls-note">Fadiga: últimos 14 dias. Fitness: um ponto por semana.</p>
  </a>`;
}
// pontos semanais do Fitness (5 semanas)
function weekDots(vals) {
  if (vals.length < 2) return '';
  const lo = Math.min(...vals), hi = Math.max(...vals), W = 70, H = 20;
  const pts = vals.map((v, i) => [((i / (vals.length - 1)) * W), H - ((v - lo) / (hi - lo || 1)) * H]);
  return `<svg class="wk-dots" viewBox="-4 -4 ${W + 8} ${H + 8}" aria-hidden="true">
    <polyline points="${pts.map((p) => p.map((x) => x.toFixed(1)).join(',')).join(' ')}"/>
    ${pts.map(([x, y], i) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${i === pts.length - 1 ? 3.2 : 2.4}"/>`).join('')}
  </svg>`;
}

// cartão de Fitness e Fadiga: número, variação em 7 dias e mini-gráfico de 4 semanas
function spark(vals, color) {
  const xs = vals.filter((v) => v != null);
  if (xs.length < 2) return '';
  const lo = Math.min(...xs), hi = Math.max(...xs), W = 120, H = 30;
  const pts = vals.map((v, i) => `${((i / (vals.length - 1)) * W).toFixed(1)},${(H - ((v - lo) / (hi - lo || 1)) * H).toFixed(1)}`).join(' ');
  return `<svg class="spark" viewBox="-2 -2 ${W + 4} ${H + 4}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" style="stroke:${color}"/></svg>`;
}
function loadCard(l) {
  const dl = l.delta7 ?? {};
  const arrow = (v, goodUp) => (v == null || v === 0 ? '<span class="lc-d">estável em 7 dias</span>'
    : `<span class="lc-d ${(v > 0) === goodUp ? 'good' : 'bad'}">${v > 0 ? '↑' : '↓'} ${Math.abs(v)} em 7 dias</span>`);
  return `<a class="load-card" href="#tendencias" aria-label="Fitness e fadiga. Ver tendências.">
    <div class="lc">
      <span class="lc-l">Fitness</span>
      <b class="c-fit">${l.fitness}</b>
      ${arrow(dl.fitness, true)}
      ${spark((l.trend ?? []).map((x) => x.fitness), 'var(--fitness)')}
    </div>
    <div class="lc">
      <span class="lc-l">Fadiga</span>
      <b class="c-fat" data-count="${l.fatigue}">${l.fatigue}</b>
      ${arrow(dl.fatigue, false)}
      ${spark((l.trend ?? []).map((x) => x.fatigue), 'var(--fatigue)')}
    </div>
    <p class="lc-note">Fitness é o seu Strain médio por dia nas últimas 6 semanas; Fadiga, na última semana.</p>
  </a>`;
}

// chips: cada contribuinte do REC com seta para cima/baixo
function chipsHtml(list) {
  return list.filter((c) => c.pull != null).map((c) => {
    const dir = c.pull >= 0.25 ? 'up' : c.pull <= -0.25 ? 'down' : 'flat';
    const arrow = dir === 'up' ? '↑' : dir === 'down' ? '↓' : '→';
    const short = { 'FC de repouso': 'FC repouso', 'Estresse de ontem': 'Estresse' }[c.label] ?? c.label;
    return `<span class="chip ${dir}" role="listitem">${esc(short)} <b>${arrow}</b></span>`;
  }).join('');
}

// ---------- Sono: noite, dívida, necessidade e regularidade ----------
const hmm = (h) => { if (h == null) return '–'; const m = Math.round(h * 60); return `${Math.floor(m / 60)}\u00a0h\u00a0${String(m % 60).padStart(2, '0')}`; };
function sleepInfo(s) {
  return `<p><b>Sua base</b> vem da resposta do seu HRV, não do hábito: o app cruza as horas dormidas com o HRV da noite (contra a sua base de 60 dias) nos últimos 180 dias e acha a partir de quantas horas o HRV para de melhorar. Refeita todo mês${s.base && !s.base.fallback ? ` (em ${s.base.month.slice(5)}/${s.base.month.slice(0, 4)}: ${s.base.n} noites; abaixo de 7 h seu HRV ficou ${s.base.below7 > 0 ? '+' : ''}${String(s.base.below7).replace('.', ',')}% da base, com 7 h ou mais ${s.base.above7 > 0 ? '+' : ''}${String(s.base.above7).replace('.', ',')}%)` : ''}.</p>
        <p><b>Dívida</b>: nos últimos 14 dias, quanto você dormiu abaixo da sua necessidade, com as noites recentes pesando mais (uma noite curta perde metade do peso a cada 7 dias). Noites acima da necessidade e cochilos pagam a dívida. Faixas da Oura: baixa até 2 h, moderada de 2 a 5 h, alta acima de 5 h.</p>
        <p><b>Deitar até</b>: horário em que você costuma acordar (mediana das últimas noites do mesmo tipo de dia, útil ou fim de semana) − a meta − o tempo que você costuma ficar acordado na cama − 15 min para pegar no sono.</p>
        <p><b>Regularidade</b>: 100 menos a variação média dos horários de deitar e acordar nas últimas 14 noites (variação de 15 min ≈ 82; de 30 min ≈ 64).</p>
        <p><b>Meta de hoje</b> muda todo dia: sua base + 30 min quando a Forma está em bloco de treino ou muito cansado (nessas semanas seu HRV rende mais com 8 a 8,5 h) + até 30 min pela dívida + até 30 min pelo treino do dia − cochilo de hoje. Os acréscimos somam no máximo 1 h. Não é preciso pagar a dívida de uma vez: ela some aos poucos com noites um pouco mais longas, cochilos e o próprio tempo.</p>`;
}

function sleepCard(d) {
  const s = d.sleep, n = s.night, need = s.need;
  const pn = s.personalNeed ?? 7.5;
  const pct = n?.hours != null ? Math.min(1.25, n.hours / pn) : 0;
  const extra = [];
  if (need.fromLoad >= 1 / 60) extra.push(`carga +${Math.round(need.fromLoad * 60)} min`);
  if (need.fromDebt >= 1 / 60) extra.push(`dívida +${Math.round(need.fromDebt * 60)} min`);
  if (need.fromStrain >= 1 / 60) extra.push(`treino +${Math.round(need.fromStrain * 60)} min`);
  if (need.nap >= 1 / 60) extra.push(`cochilo −${Math.round(need.nap * 60)} min`);
  const r = s.regularity;
  // à vista: noite × base, meta de hoje e horário de deitar. Dívida, regularidade e contas ficam no ⓘ.
  const debtTxt = s.debt == null ? null : s.debt < 1 / 6 ? 'nenhuma' : `${hmm(s.debt)}${s.level && s.level.key !== 'nenhuma' ? `, ${s.level.label}` : ''}`;
  const facts = [
    debtTxt ? `<b>Dívida (14 dias):</b> ${debtTxt}.` : null,
    `<b>Meta ${d.isToday ? 'de hoje' : 'da noite seguinte'}:</b> ${hmm(need.total)} = base ${hmm(pn)}${extra.length ? ` + ${extra.join(', ')}` : ''}.`,
    s.bedtime && d.isToday ? `<b>Acordar:</b> por volta de ${esc(s.bedtime.wake)}.` : null,
    r ? `<b>Últimas ${r.nights} noites:</b> deita por volta de ${r.bedtime} (±${r.bedSd} min), acorda por volta de ${r.wake} (±${r.wakeSd} min).${s.regularityScore != null ? ` Regularidade ${s.regularityScore}/100.` : ''}` : null,
    s.napYesterday ? `<b>Cochilo ${d.isToday ? 'ontem' : 'no dia anterior'}:</b> ${Math.round(s.napYesterday * 60)} min (conta na dívida).` : null,
  ].filter(Boolean).map((x) => `<p>${x}</p>`).join('');
  return `
    <section class="card sleep-card" aria-label="Sono">
      ${cardHead('moon', 'Sono', { color: 'var(--sleep)', right: n?.start && n?.end ? `${esc(n.start)} → ${esc(n.end)}` : '', info: `<div class="sl-facts">${facts}</div>${sleepInfo(s)}` })}
      <div class="sl-main"><b>${hmm(n?.hours)}</b><span>de ${hmm(pn)} (sua base)</span></div>
      <div class="sl-bar"><i style="width:${(pct / 1.25) * 100}%"></i><em style="left:${(1 / 1.25) * 100}%"></em></div>
      <div class="sl-two">
        <div><small>${d.isToday ? 'Meta hoje à noite' : 'Meta da noite seguinte'}</small><b>${hmm(need.total)}</b></div>
        ${s.bedtime && d.isToday ? `<div><small>Deitar até</small><b class="sl-bedt">${esc(s.bedtime.bedtime)}</b></div>` : ''}
      </div>
      ${n?.hours != null ? `<a class="b-link" href="#sono/${d.date}">Ver a noite em detalhe ›</a>` : ''}
    </section>`;
}

// ---------- relatório da manhã (A1): primeira abertura do dia, até 12 h ----------
const ls = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
function morningHtml(d) {
  const rd = d.ready?.score == null ? null : Math.round(d.ready.score);
  if (!d.isToday || new Date().getHours() >= 12 || ls.get('rec.morning') === d.date || rd == null) return '';
  const sg = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v);
  const zc = readyColor(rd);
  const n = d.sleep?.night, base = d.sleep?.personalNeed, need = d.sleep?.need;
  const pl = d.planned ?? [];
  const prev = pl.reduce((a, p) => a + (p.strain ?? 0), 0), tgt = d.day?.target?.target;
  const HC = { acima: 'var(--good)', estavel: 'var(--text)', fadiga: 'var(--warn)', risco: 'var(--bad)' };
  const date = new Date(d.date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  const hrvArrow = { acima: '↑', estavel: '→', fadiga: '↓', risco: '↓' }[d.hrvTrend?.cls] ?? '';
  const tiles = [
    { k: 'Noite', v: n?.hours != null ? hmm(n.hours) : '–', c: 'var(--sleep)', bar: n?.hours != null && base ? Math.min(1, n.hours / base) : null,
      s: base ? `base ${hmm(base)}` : '' },
    d.hrvTrend ? { k: 'HRV', v: `${d.hrvTrend.mean7}<small> ms</small>`, c: HC[d.hrvTrend.cls], s: `${hrvArrow} ${d.hrvTrend.label.toLowerCase()}` } : null,
    d.load?.formPct != null ? { k: 'Forma', v: `${sg(d.load.formPct)}<small>%</small>`, c: `var(--z-${d.load.zone?.key ?? 'neutro'})`, s: d.load.zone?.label ?? '' } : null,
  ].filter(Boolean);
  let k = 0; const st = () => `style="--i:${k++}"`;
  return `<section class="morning" aria-label="Relatório da manhã" style="--rz:${zc}">
    <span class="mr-aura" aria-hidden="true"></span>
    <div class="mr-top" ${st()}>
      <div><p class="mr-hi">${ICON.sun}Bom dia</p><p class="mr-date">${esc(date.charAt(0).toUpperCase() + date.slice(1))}</p></div>
      <button type="button" class="mr-close" aria-label="Fechar o relatório até amanhã">×</button>
    </div>
    <div class="mr-hero" ${st()}>
      ${heroRing({ frac: rd / 100, text: rd, count: rd, unit: '%', stops: readyStops(rd), size: 'sm' })}
      <div class="mr-hero-txt">
        ${d.day?.summary ? `<p class="mr-phrase">${esc(d.day.summary)}</p>` : ''}
        ${d.day?.why?.[0] && !/^Meta/.test(d.day.why[0]) ? `<p class="mr-why">${esc(d.day.why[0])}</p>` : ''}
        <span class="mr-lab">Recuperação <b>${d.rec ?? '–'}</b></span>
      </div>
    </div>
    <div class="mr-tiles" ${st()}>${tiles.map((t) => `<div class="mr-tile"><span class="mr-lab">${t.k}</span><b style="color:${t.c}">${t.v}</b>${t.bar != null ? `<span class="mr-bar"><i style="--w:${(t.bar * 100).toFixed(0)}%"></i></span>` : ''}<small>${esc(t.s)}</small></div>`).join('')}</div>
    <div class="mr-block" ${st()}>
      <span class="mr-lab">Treino de hoje</span>
      ${pl.length ? `<ul class="mr-sess">${pl.map((p) => `<li style="--c:var(--${p.sport}, var(--strain))"><span><b>${esc(p.titulo || p.label)}</b><small>${p.minutos ? `${p.minutos} min` : ''}${p.zona ? ` · ${esc(p.zona)}` : ''}</small></span>${p.strain ? `<em>${p.strain}</em>` : ''}</li>`).join('')}</ul>
        ${tgt ? `<div class="mr-meter"><span class="mr-lab">Previsto <b>${prev}</b> · meta <b>${tgt}</b></span><span class="mr-mbar"><i style="--w:${Math.min(100, (prev / Math.max(prev, tgt * 1.5)) * 100).toFixed(0)}%"></i><u style="left:${Math.min(100, (tgt / Math.max(prev, tgt * 1.5)) * 100).toFixed(0)}%"></u></span></div>` : ''}`
        : '<p class="mr-meta">Sem treino planejado.</p>'}
    </div>
    ${need ? `<div class="mr-block mr-night" ${st()}><span class="mr-lab">Hoje à noite</span><p>${ICON.moon}Meta <b>${hmm(need.total)}</b>${d.sleep.bedtime ? ` · deitar até <b>${esc(d.sleep.bedtime.bedtime)}</b>` : ''}</p></div>` : ''}
    ${(() => { const al = (d.alerts ?? []).find((x) => x.kind !== 'carga'); return al ? `<p class="mr-alert" ${st()}>${esc(al.text)}</p>` : ''; })()}
  </section>`;
}

// ---------- linha do tempo do dia: sono, treinos, FC e estresse em 24 h ----------
function timelineHtml(t, isToday) {
  const W = 340, H = 92, X = (m) => (m / 1440) * W;
  const head = cardHead('clock', isToday ? 'Seu dia' : 'O dia', { color: 'var(--fatigue)', info: 'Sono (faixa lilás), treinos (faixa da cor da modalidade), FC (linha) e estresse da Garmin (barras) a cada 5 minutos. Toque no gráfico para ver a hora.' });
  if (!t.hr.length && !t.stress && !t.workouts.length && !t.sleep.length) return `${head}<p class="empty">${t.error ? `Sem curva da Garmin (${esc(t.error)}).` : 'Sem dados do dia ainda.'}</p>`;
  const hrMax = Math.max(120, ...t.hr.map((p) => p[1])), hrMin = Math.min(40, ...t.hr.map((p) => p[1]));
  const yHr = (v) => 14 + (1 - (v - hrMin) / (hrMax - hrMin)) * (H - 30);
  const path = (pts, y) => { let d = '', last = -99; for (const [m, v] of pts) { d += `${m - last > 15 ? 'M' : 'L'}${X(m).toFixed(1)},${y(v).toFixed(1)}`; last = m; } return d; };
  const stressArea = t.stress ? t.stress.map(([m, v]) => `<rect x="${X(m).toFixed(1)}" y="${(H - 16 - (v / 100) * 26).toFixed(1)}" width="${(X(5) + 0.2).toFixed(2)}" height="${((v / 100) * 26).toFixed(1)}" class="tl-st"/>`).join('') : '';
  const sleep = t.sleep.map((b) => `<rect x="${X(b.start).toFixed(1)}" y="0" width="${(X(b.end) - X(b.start)).toFixed(1)}" height="${H - 16}" class="tl-sleep"/>`).join('');
  const work = t.workouts.map((w) => `<rect x="${X(w.start).toFixed(1)}" y="0" width="${Math.max(2, X(w.dur)).toFixed(1)}" height="${H - 16}" class="tl-w" style="fill:var(--${w.sport})"/>`).join('');
  const now = isToday ? (() => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); })() : null;
  const avg = (xs) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  const dayHr = t.hr.filter(([m]) => !t.sleep.some((b) => m >= b.start && m < b.end)).map((p) => p[1]);
  const stressDay = t.stress ? avg(t.stress.filter(([m]) => !t.sleep.some((b) => m >= b.start && m < b.end)).map((p) => p[1])) : null;
  return `${head}
    <svg viewBox="0 0 ${W} ${H - 14}" class="tl-svg" role="img" aria-label="Linha do tempo do dia">
      ${sleep}${work}${stressArea}
      ${t.hr.length ? `<path d="${path(t.hr, yHr)}" class="tl-hr"/>` : ''}
      ${now != null ? `<line x1="${X(now).toFixed(1)}" x2="${X(now).toFixed(1)}" y1="0" y2="${H - 16}" class="tl-now"/>` : ''}
      <line x1="0" x2="${W}" y1="${H - 16}" y2="${H - 16}" class="tl-base"/>
      <line class="tl-cur" x1="-10" x2="-10" y1="0" y2="${H - 16}"/>
    </svg>
    <div class="tl-ticks" aria-hidden="true">${[0, 6, 12, 18, 24].map((h) => `<span>${h}h</span>`).join('')}</div>
    <p class="tl-tip" aria-live="polite">${[dayHr.length ? `FC média acordado <b>${avg(dayHr)}</b>` : null, stressDay != null ? `estresse médio acordado <b>${stressDay}</b>` : null].filter(Boolean).join(' · ') || 'Toque no gráfico para ver a hora.'}</p>
    <div class="yr-leg"><span><i style="background:color-mix(in srgb, var(--sleep) 30%, transparent)"></i>Sono</span>${t.workouts.length ? '<span><i style="background:var(--accent)"></i>Treino</span>' : ''}<span><i style="background:var(--fatigue);height:2px;border-radius:0"></i>FC</span>${t.stress ? '<span><i style="background:color-mix(in srgb, var(--warn) 55%, transparent)"></i>Estresse</span>' : ''}</div>`;
}
function bindTimeline(screen, t) {
  const svg = screen.querySelector('.tl-svg'); if (!svg) return;
  const tip = screen.querySelector('.tl-tip'), cur = svg.querySelector('.tl-cur');
  const show = (ev) => {
    const r = svg.getBoundingClientRect(), x = ((ev.touches?.[0] ?? ev).clientX - r.left) / r.width;
    const m = Math.max(0, Math.min(1439, Math.round(x * 1440))), near = (arr) => arr?.reduce((b, p) => (Math.abs(p[0] - m) < Math.abs(b[0] - m) ? p : b), arr[0]);
    const hr = t.hr.length ? near(t.hr) : null, st = t.stress?.length ? near(t.stress) : null;
    const w = t.workouts.find((w) => m >= w.start && m <= w.start + w.dur), sl = t.sleep.find((b) => m >= b.start && m < b.end);
    cur.setAttribute('x1', (x * 340).toFixed(1)); cur.setAttribute('x2', (x * 340).toFixed(1));
    tip.textContent = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}${sl ? ' · dormindo' : ''}${w ? ` · ${w.label}` : ''}${hr && Math.abs(hr[0] - m) <= 10 ? ` · FC ${hr[1]}` : ''}${st && Math.abs(st[0] - m) <= 10 ? ` · estresse ${st[1]}` : ''}`;
  };
  svg.addEventListener('click', show); svg.addEventListener('touchmove', show, { passive: true });
}

// ---------- aviso da véspera (I4): a partir das 17 h, o que vem amanhã e a meta de sono ----------
function tomorrowHtml(d) {
  if (!d.isToday || new Date().getHours() < 17 || !d.tomorrow || ls.get('rec.tomorrow') === d.date) return '';
  const ss = d.tomorrow.sessions ?? [], key = ss.find((x) => x.chave), need = d.sleep?.need, bed = d.sleep?.bedtime;
  const wd = new Date(d.tomorrow.date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  const tot = ss.reduce((a, p) => a + (p.strain ?? 0), 0), min = ss.reduce((a, p) => a + (p.minutos ?? 0), 0);
  // quanto falta para o horário de deitar
  const left = bed?.bedtime ? (() => { const [h, m] = bed.bedtime.split(':').map(Number), now = new Date(); let x = h * 60 + m - (now.getHours() * 60 + now.getMinutes()); if (x < -240) x += 1440; return x; })() : null;
  const leftTxt = left == null ? '' : left <= 0 ? 'já passou da hora' : left < 60 ? `em ${left} min` : `em ${Math.floor(left / 60)}h${String(left % 60).padStart(2, '0')}`;
  let k = 0; const st = () => `style="--i:${k++}"`;
  return `<section class="tmr" aria-label="Amanhã">
    <span class="tmr-sky" aria-hidden="true"></span>
    <div class="mr-top" ${st()}>
      <div><p class="mr-hi">${ICON.moon}Amanhã</p><p class="mr-date">${esc(wd.charAt(0).toUpperCase() + wd.slice(1))}</p></div>
      <button type="button" class="tmr-close mr-close" aria-label="Fechar até amanhã">×</button>
    </div>
    ${ss.length ? `<ul class="mr-sess" ${st()}>${ss.map((p) => `<li style="--c:var(--${p.sport}, var(--strain))"><span><b>${esc(p.titulo || p.label)}${p.chave ? ' <em class="tmr-key">chave</em>' : ''}</b><small>${p.minutos ? `${p.minutos} min` : ''}${p.zona ? ` · ${esc(p.zona)}` : ''}</small></span>${p.strain ? `<em>${p.strain}</em>` : ''}</li>`).join('')}</ul>
      <p class="mr-meta" ${st()}>${min ? `${hmm(min / 60)} no total` : ''}${tot ? ` · Strain previsto <b>${tot}</b>` : ''}</p>`
      : `<p class="tmr-rest" ${st()}>Descanso no plano.</p>`}
    ${need ? `<div class="tmr-night" ${st()}>
      <div><span class="mr-lab">Meta de sono</span><b>${hmm(need.total)}</b></div>
      ${bed ? `<div><span class="mr-lab">Deitar até</span><b>${esc(bed.bedtime)}</b><small>${esc(leftTxt)}</small></div>` : ''}
    </div>${key ? `<p class="mr-meta" ${st()}>Véspera de treino-chave.</p>` : ''}` : ''}
  </section>`;
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


// ordem e visibilidade dos blocos do Hoje (Ajustes → Personalizar o Hoje; guardado neste aparelho)
const HOJE_BLOCKS = [['frase', 'Frase do dia'], ['portas', 'Sono · Strain · Recuperação'], ['carga', 'Fitness · Fadiga · Forma'], ['treinos', 'Treinos de hoje'], ['registro', 'Registro do dia']];
function hojePrefs() {
  let p = null; try { p = JSON.parse(localStorage.getItem('rec.hoje') || 'null'); } catch {}
  const known = HOJE_BLOCKS.map((x) => x[0]);
  const list = Array.isArray(p) ? p.filter((x) => known.includes(x.k)) : [];
  for (const k of known) if (!list.some((x) => x.k === k)) list.push({ k, on: true });
  return list;
}
const hojeOrder = () => hojePrefs().filter((x) => x.on).map((x) => x.k);

// ---------- Hoje v3 (05/11): uma frase, três portas (Sono, Strain, Corpo), carga em uma linha ----------
function oneThingHtml(d) {
  const t = d.day?.target?.target, why = d.day?.why;
  // frase nova (título + porquês) já traz a meta de Strain; o servidor antigo não
  const lines = [...(why ?? []), ...(d.alerts ?? []).filter((a) => !why || a.kind !== 'carga').map((a) => a.text), !why && t != null && d.isToday ? `Meta de Strain do dia: ${t}.` : null].filter(Boolean);
  if (!d.day?.summary && !lines.length) return '';
  return `<section class="one-thing"><b>${esc(d.day?.summary ?? 'Dia sem resumo ainda.')}</b>${lines.map((l) => `<span>${esc(l)}</span>`).join('')}</section>`;
}
const hcomp = (h) => { if (h == null) return '–'; const m = Math.round(h * 60); return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`; };
function triHtml(d) {
  const s = d.sleep, n = s?.night, l = d.load, t = d.day?.target?.target, st = l?.strain ?? 0;
  const pl = d.planned?.length ?? 0;
  const tr = d.day?.trend;
  return `<div class="tri">
    <a class="tile" href="#sono/${d.date}"><span class="tk">Sono<i>›</i></span><b style="color:var(--sleep)">${hcomp(n?.hours)}</b><small>base ${hcomp(s?.personalNeed)}${s?.debt >= 1 / 6 ? `<br>dívida ${hcomp(s.debt)}` : ''}</small></a>
    <a class="tile" href="#strain/${d.date}"><span class="tk">Strain<i>›</i></span><b style="color:var(--strain)">${st}${t != null ? `<small class="of">/${t}</small>` : ''}</b>${t ? `<span class="tbar"><i style="width:${Math.min(100, (st / t) * 100)}%"></i></span>` : ''}<small>${pl ? `${pl} ${pl === 1 ? 'treino previsto' : 'treinos previstos'}` : esc(strainCat(l))}</small></a>
    <a class="tile" href="#rec/${d.date}"><span class="tk">Recuperação<i>›</i></span><b style="color:${d.rec == null ? 'var(--text-3)' : readyColor(d.rec)}">${d.rec ?? '–'}</b><small>REC${tr ? `<br>${tr.dir === 'up' ? '↑' : tr.dir === 'down' ? '↓' : '→'} ${esc(tr.txt.replace('REC ', ''))}` : ''}</small></a>
  </div>`;
}
function loadLine(l, date) {
  const sg = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)}`;
  const dv = l.fatigueVsYesterday, f4 = l.fitness4w;
  return `<a class="load-line" href="#strain/${date}" aria-label="Fitness, Fadiga e Forma">
    <span><small>Fitness</small><b>${l.fitness}</b>${f4 != null ? `<em>${sg(f4)}% 4 sem.</em>` : ''}</span>
    <span><small>Fadiga</small><b>${l.fatigue}</b>${dv != null ? `<em>${dv === 0 ? '= ontem' : `${sg(dv)} desde ontem`}</em>` : ''}</span>
    <span><small>Forma</small><b>${l.formPct == null ? '–' : `${sg(l.formPct)}%`}</b><em>${esc(shortZone(l.zone?.key))}</em></span>
  </a>`;
}
// planejado × feito numa lista só
function sessionsHtml(pl, acts) {
  const used = new Set();
  const rows = pl.map((p) => {
    const a = acts.find((x, i) => !used.has(i) && x.sport === p.sport && used.add(i));
    return { p, a };
  });
  acts.forEach((a, i) => { if (!used.has(i)) rows.push({ p: null, a }); });
  if (!rows.length) return '<p class="empty">Sem treino planejado nem feito.</p>';
  const dur = (m) => (m >= 60 ? `${Math.floor(m / 60)}h${String(Math.round(m % 60)).padStart(2, '0')}` : `${Math.round(m)} min`);
  return `<ul class="ses-list">${rows.map(({ p, a }) => {
    const sport = a?.sport ?? p.sport, title = p ? (p.titulo || p.label) : a.label;
    const sub = a ? [dur(a.min), a.km >= 0.5 ? `${String(Math.round(a.km * 10) / 10).replace('.', ',')} km` : null, a.avghr ? `FC ${Math.round(a.avghr)}` : null].filter(Boolean).join(' · ')
      : [p.minutos ? `${p.minutos} min` : null, p.zona].filter(Boolean).join(' · ');
    const right = a ? `<b>${a.strain ?? '–'}</b><small>${p?.strain != null ? `previsto ${p.strain}` : p ? 'feito' : 'fora do plano'}</small>` : `<span class="pill">previsto ${p.strain ?? '–'}</span>`;
    const inner = `<i class="sesc" style="background:var(--${esc(sport)})"></i><span class="st"><b>${esc(title)}</b><small>${esc(sub)}</small></span><span class="sr">${right}</span>`;
    return `<li>${a?.id ? `<a href="#atv/${encodeURIComponent(a.id)}">${inner}</a>` : `<div>${inner}</div>`}</li>`;
  }).join('')}</ul>`;
}

// detalhe do Corpo (REC): sinais, comentário e a semana
async function renderRecDetail(date) {
  document.documentElement.style.setProperty('--rec', 'var(--text-3)');
  const nav = navSeq;
  screen.innerHTML = '<header class="top"><a class="back-link" href="#hoje">‹ Hoje</a></header><p class="empty">Carregando…</p>';
  let d; try { d = todayCache?.[date] ?? await api(`/api/today?date=${date}`); } catch (e) { if (nav === navSeq) screen.querySelector('.empty').textContent = errText(e); return; }
  if (nav !== navSeq) return;
  screen.innerHTML = `<header class="top"><a class="back-link" href="#hoje">‹ Hoje</a></header>
    <h1 class="td-title">Recuperação</h1><p class="td-sub">${esc(cap(fmtDate(date, { weekday: 'long', day: 'numeric', month: 'long' })))}</p>
    <section class="dhero">${heroRing({ frac: (d.rec ?? 0) / 100, text: d.rec ?? '–', count: d.rec, stops: readyStops(d.rec), size: 'md', empty: d.rec == null,
      sub: `REC${d.day?.trend ? ` · ${esc(d.day.trend.txt.replace('REC ', ''))}` : ''}` })}</section>
    <p class="comment">${esc(d.comment)}</p>
    <section class="card contrib is-open"><div><ul>${contribHtml(d.contributors)}</ul></div></section>
    <section class="card">${cardHead('clock', 'Últimos 7 dias')}
      <ol class="week">${d.week.map((w) => `<li class="${w.date === date ? 'is-today' : ''}"><i style="background:${w.rec == null ? 'var(--line)' : readyColor(w.rec)}"></i>${esc(fmtDate(w.date, { weekday: 'narrow' }))}<small>${w.rec ?? '–'}</small></li>`).join('')}</ol>
      ${d.shadowMode ? '<p class="shadow-note">Modo sombra: os portões do plano (HRV ≥ 100, FC de repouso ≤ 41) continuam valendo.</p>' : ''}</section>
    <a class="b-link" href="#tendencias">Tendências do corpo ›</a>`;
  animateRings(screen); countUp(screen);
}

// detalhe do Strain: meta, treinos, carga e a curva do dia
async function renderStrainDetail(date) {
  document.documentElement.style.setProperty('--rec', 'var(--text-3)');
  const nav = navSeq;
  screen.innerHTML = '<header class="top"><a class="back-link" href="#hoje">‹ Hoje</a></header><p class="empty">Carregando…</p>';
  let d; try { d = todayCache?.[date] ?? await api(`/api/today?date=${date}`); } catch (e) { if (nav === navSeq) screen.querySelector('.empty').textContent = errText(e); return; }
  if (nav !== navSeq) return;
  screen.innerHTML = `<header class="top"><a class="back-link" href="#hoje">‹ Hoje</a></header>
    <h1 class="td-title">Strain</h1><p class="td-sub">${esc(cap(fmtDate(date, { weekday: 'long', day: 'numeric', month: 'long' })))}</p>
    <section class="dhero">${(() => { const st = d.load?.strain ?? 0, tg = d.day?.target?.target;
      return heroRing({ frac: tg ? st / tg : st / 100, text: st, count: st, color: 'var(--strain)', size: 'md', sub: tg ? `meta ${tg}` : 'Strain do dia' }); })()}</section>
    <section class="card sd-card">${d.day?.target ? strainRing(d.load?.strain ?? 0, d.day.target) : ''}
      ${d.planned?.length ? plannedHtml(d.planned, d.activities) : ''}</section>
    <section class="card">${cardHead('bolt', 'Treinos', { color: 'var(--strain)' })}${actsHtml(d.activities)}</section>
    <section class="card">${cardHead('trend', 'Carga')}${d.load ? loadStrip(d.load) : ''}</section>
    <section class="card tl" id="tl">${cardHead('clock', d.isToday ? 'Seu dia' : 'O dia')}<p class="empty">Carregando…</p></section>`;
  api(`/api/timeline?date=${date}`).then((t) => { const el = screen.querySelector('#tl'); if (el && nav === navSeq) { el.innerHTML = timelineHtml(t, d.isToday); bindTimeline(screen, t); } }).catch(() => screen.querySelector('#tl')?.remove());
  animateRings(screen); countUp(screen);
}

function render(d) {
  const z = zoneOf(d.rec);
  document.documentElement.style.setProperty('--rec', d.ready?.score != null ? readyColor(d.ready.score) : zoneVar(z));
  const raceTxt = d.race.days > 0 ? `Aracaju em ${d.race.days} dias` : d.race.days === 0 ? 'Dia de prova' : '';
  const todayIso = d.date;

  screen.innerHTML = `
    <header class="top day-top">
      <div class="daynav">
        <button type="button" data-day="1" aria-label="Dia anterior" ${dayOffset >= MAX_BACK ? 'disabled' : ''}>‹</button>
        <h1>${d.isToday ? 'Hoje, ' : ''}${esc(fmtDate(todayIso, { weekday: d.isToday ? undefined : 'short', day: 'numeric', month: 'short' }).replace(/\./g, ''))}</h1>
        <button type="button" data-day="-1" aria-label="Próximo dia" ${dayOffset === 0 ? 'disabled' : ''}>›</button>
      </div>
      <span class="top-r">${raceTxt ? `<a class="race race-link" href="#prova" aria-label="${esc(raceTxt)}. Abrir a aba Prova.">${esc(raceTxt)} ›</a>` : ''}<a class="gear" href="#ajustes" aria-label="Ajustes">${ICON.gear}</a></span>
    </header>

    ${d.phase && d.isToday ? `<p class="phase-line">${esc(d.phase)}</p>` : ''}
    ${d.syncIssue ? `<a class="alert sync-alert" role="status" href="#garmin">${esc(d.syncIssue.text)} <em>Garmin ›</em></a>` : ''}

    ${morningHtml(d)}
    ${tomorrowHtml(d)}
    <div id="hoje-review"></div>

    ${d.race.raceWeek ? `<a class="race-banner" href="#prova"><span>Semana da prova</span><b>${d.race.days > 1 ? `${d.race.days} dias para Aracaju` : d.race.days === 1 ? 'Amanhã é dia de prova' : d.race.days === 0 ? 'Hoje é dia de prova' : 'Prova feita'}</b><em>Prova ›</em></a>` : ''}

    ${(() => {
      const r = d.ready, sc = r?.score == null ? null : Math.round(r.score);
      const fp = d.load?.formPct;
      // manhã sem a noite: mostra a de ontem apagada, pulsando de leve, até a Garmin entregar
      const wait = sc == null && d.isToday && d.readyPrev != null ? Math.round(d.readyPrev) : null;
      const shownV = sc ?? wait;
      return `<section class="hero${wait != null ? ' is-wait' : ''}" aria-label="Estou pronto hoje?">
      ${heroReady(shownV, {
        sub: wait != null ? 'de ontem · esperando a noite' : sc == null && d.isToday ? 'a noite ainda não chegou' : '',
        aria: wait != null ? `Ontem, ${wait}%. A noite de hoje ainda não chegou.` : shownV == null ? 'Sem número hoje.' : `${shownV}% pronto para hoje. Toque para ver o que entrou na conta.` })}
    </section>
    <div class="contrib" id="ready-parts"><div>${readyPartsHtml(r)}</div></div>`;
    })()}

    ${d.needsHistory ? '<p class="alert">O histórico ainda não foi carregado, então o REC não tem base. <a href="#garmin">Puxar histórico da Garmin</a></p>' : ''}
    ${hojeOrder().map((k) => ({
      frase: oneThingHtml(d),
      portas: triHtml(d),
      carga: d.load ? loadLine(d.load, todayIso) : '',
      treinos: `<section class="card">
      ${cardHead('bolt', d.isToday ? 'Treinos de hoje' : 'Treinos do dia', { color: 'var(--strain)', right: (d.planned?.length || d.activities.length) ? `Strain ${d.load?.strain ?? 0}${d.planned?.length ? ` de ${d.planned.reduce((x, p) => x + (p.strain ?? 0), 0)} previsto` : ''}` : '' })}
      ${sessionsHtml(d.planned ?? [], d.activities)}
    </section>`,
      registro: `<section class="card reg">
      ${cardHead('smile', d.isToday ? 'Registro do dia' : 'Registro', { color: 'var(--accent)', info: 'Como me sinto (1 a 10) e o diário do dia. Marque à noite o que aconteceu: conta para o REC de amanhã; o efeito de cada hábito aparece em Corpo → O que mexe no meu REC.' })}
      <div class="feel-dots" role="radiogroup" aria-label="Como me sinto, de 1 a 10">${Array.from({ length: 10 }, (_, i) => i + 1).map((v) => `<button type="button" role="radio" data-feel="${v}" aria-checked="${d.feel === v}">${v}</button>`).join('')}</div>
      <span class="saved" aria-live="polite"></span>
      ${d.habits ? `<div class="hb-list">${[...d.habits.defs].sort((a, b) => d.habits.on.includes(b.key) - d.habits.on.includes(a.key)).map((h) => `<button type="button" class="hb" data-tag="${h.key}" aria-pressed="${d.habits.on.includes(h.key)}">${esc(h.label)}</button>`).join('')}</div>` : ''}
    </section>`,
    }[k] ?? '')).join('\n')}

    <div class="foot">
      <button class="sync" type="button" ${d.isToday ? '' : 'hidden'}>Atualizar dados</button>
    </div>
  `;

  animateRings(screen);
  // anéis: animação única ao abrir
  requestAnimationFrame(() => requestAnimationFrame(() => {
    screen.querySelectorAll('.rt-arc').forEach((a) => { a.style.strokeDashoffset = a.dataset.target; });
  }));

  // Prontidão: abre as quatro partes
  const rp = screen.querySelector('#ready-parts'), rBtn = screen.querySelector('[data-ring="ready"]');
  rBtn.addEventListener('click', () => { const open = rp.classList.toggle('is-open'); rBtn.setAttribute('aria-expanded', String(open)); });

  // como me sinto: um toque
  const saved = screen.querySelector('.reg .saved');
  screen.querySelectorAll('[data-feel]').forEach((b) => b.addEventListener('click', async () => {
    screen.querySelectorAll('[data-feel]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    try { await api('/api/feel', { method: 'POST', body: JSON.stringify({ date: todayIso, value: Number(b.dataset.feel) }) }); saved.textContent = 'Nota salva.'; }
    catch { saved.textContent = 'Não salvou. Tente de novo.'; }
  }));

  // relatório da manhã: fechar até amanhã
  // fechar com uma saída suave (encolhe e some)
  const closeCard = (sel, key) => screen.querySelector(`${sel} .mr-close`)?.addEventListener('click', () => {
    ls.set(key, todayIso); const el = screen.querySelector(sel); if (!el) return;
    el.style.height = `${el.offsetHeight}px`; requestAnimationFrame(() => el.classList.add('is-closing'));
    setTimeout(() => el.remove(), 420);
  });
  closeCard('.morning', 'rec.morning'); closeCard('.tmr', 'rec.tomorrow');

  // resumo da semana: domingo a partir das 18 h (semana atual) e segunda (semana anterior)
  if (d.isToday) {
    const now = new Date(), dow = now.getDay();
    const mon = (iso, k) => { const t = new Date(iso + 'T12:00:00'); t.setDate(t.getDate() - ((t.getDay() + 6) % 7) - 7 * k); return t.toISOString().slice(0, 10); };
    const target = dow === 0 && now.getHours() >= 18 ? mon(todayIso, 0) : dow === 1 ? mon(todayIso, 1) : null;
    if (target && ls.get('rec.review') !== target) {
      api(`/api/review?monday=${target}`).then((r) => {
        const el = screen.querySelector('#hoje-review'); if (!el || !r.sessions) return;
        el.innerHTML = reviewHtml(r, { closable: true });
        el.querySelector('.rv-close')?.addEventListener('click', () => { ls.set('rec.review', target); el.innerHTML = ''; });
      }).catch(() => {});
    }
  }

  countUp(screen);

  // diário de hábitos
  screen.querySelectorAll('.hb').forEach((b) => b.addEventListener('click', async () => {
    const on = b.getAttribute('aria-pressed') !== 'true';
    b.setAttribute('aria-pressed', String(on));
    try { await api('/api/tags', { method: 'POST', body: JSON.stringify({ date: todayIso, tag: b.dataset.tag, on }) }); }
    catch { b.setAttribute('aria-pressed', String(!on)); }
  }));

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

// navegação (04/11): cada troca de aba ganha um número; resposta que chega depois de trocar de aba é descartada
// (antes, a busca automática da Garmin terminava e redesenhava o Hoje por cima da aba aberta).
let navSeq = 0, loadSeq = 0, todayCache = null;
const onHoje = () => (location.hash || '#hoje') === '#hoje';
const sameDay = (a, b) => { const k = (x) => JSON.stringify({ ...x, lastSync: 0, minsSinceSync: 0, syncIssue: 0 }); return k(a) === k(b); };
async function load() {
  const nav = navSeq, my = ++loadSeq;
  const live = () => nav === navSeq && my === loadSeq && onHoje();
  try {
    const date = addIso(isoToday(), -dayOffset);
    // mostra na hora o último Hoje desse dia (se houver) e atualiza quando a resposta chegar
    if (!todayCache) { try { const c = JSON.parse(localStorage.getItem('rec.today') || 'null'); if (c?.date) todayCache = { [c.date]: c }; } catch {} }
    const shown = todayCache?.[date] ?? null;
    if (shown) render(shown);
    else screen.innerHTML = '<header class="top"><h1>Hoje</h1></header><p class="empty">Carregando…</p>';
    const d = await api(`/api/today?date=${date}`);
    todayCache = { ...(todayCache ?? {}), [date]: d };
    if (dayOffset === 0) try { localStorage.setItem('rec.today', JSON.stringify(d)); } catch {}
    if (!live()) return;
    if (!shown || !sameDay(d, shown) || JSON.stringify(d.syncIssue) !== JSON.stringify(shown.syncIssue)) render(d);
    const stale = d.minsSinceSync == null || d.minsSinceSync > 15;
    if (dayOffset === 0 && (d.needsSync || stale) && autoTried !== `${d.date}-${Math.floor(Date.now() / 900000)}`) {
      autoTried = `${d.date}-${Math.floor(Date.now() / 900000)}`;
      const sync = screen.querySelector('.sync');
      if (sync) { sync.disabled = true; sync.textContent = d.needsSync ? 'Buscando a noite na Garmin…' : 'Buscando treinos novos…'; }
      await api('/api/refresh?auto=1', { method: 'POST' }).catch(() => {});
      const d2 = await api(`/api/today?date=${date}`);
      todayCache = { ...todayCache, [date]: d2 };
      try { localStorage.setItem('rec.today', JSON.stringify(d2)); } catch {}
      if (!live()) return;
      if (!sameDay(d2, d)) render(d2);
      const b = screen.querySelector('.sync');
      if (b) { if (d2.needsSync) b.textContent = 'A noite ainda não chegou à Garmin. Sincronize o relógio e toque aqui.'; else { b.disabled = false; b.textContent = 'Atualizado agora'; } }
    }
  }
  catch (e) { if (e.message !== '401' && live() && !screen.querySelector('.hero')) screen.innerHTML = '<p class="comment" style="margin-top:40vh">Sem conexão com o servidor. Abra de novo em instantes.</p>'; }
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
  const head = '<header class="top"><h1>Garmin</h1><a class="foot-link" href="#hoje">Voltar</a></header>';
  screen.innerHTML = `${head}<p class="empty">Conferindo…</p>`;
  let d; const nav = navSeq;
  try { d = await api('/api/diag'); } catch (e) { if (e.message !== '401' && nav === navSeq) screen.querySelector('.empty').textContent = errText(e); return; }
  if (nav !== navSeq) return;
  const n = (v) => (v ?? 0).toLocaleString('pt-BR');
  const fmt = (iso) => (iso ? fmtDate(iso, { day: 'numeric', month: 'short', year: 'numeric' }) : '–');
  const ago = (m) => (m == null ? '' : m < 60 ? `há ${m} min` : m < 48 * 60 ? `há ${Math.round(m / 60)} h` : `há ${Math.round(m / 1440)} dias`);
  const hour = new Date(Date.now() - 3 * 3600e3).getUTCHours();
  const z = d.zonas.states, zPend = z.pendente ?? 0, zErr = z.erro ?? 0, zFit = z.fit ?? 0, zSemId = z.sem_id ?? 0;

  // cada linha: estado (ok | falta | erro | info), título, texto; "passo" = o que o botão principal faz
  const rows = [];
  rows.push(!d.hasKey ? { s: 'erro', t: 'Conexão', x: 'A chave não está cadastrada no servidor.' }
    : d.sync.status === 'erro' ? { s: 'erro', t: 'Conexão', x: `A última busca falhou ${ago(d.sync.mins)}: ${String(d.sync.detail ?? '').slice(0, 120)}`, now: true }
    : d.sync.okMins == null ? { s: 'falta', t: 'Conexão', x: 'O servidor ainda não buscou nada na Garmin.', now: true }
    : d.sync.okMins > 120 && hour >= 6 ? { s: 'falta', t: 'Conexão', x: `Última busca ${ago(d.sync.okMins)}. A automática pode ter parado.`, now: true }
    : { s: 'ok', t: 'Conexão', x: `Última busca ${ago(d.sync.okMins)}. Busca sozinha a cada 15–30 min.` });
  const NF = { hrv: 'HRV', rhr: 'FC de repouso', sleep: 'sono', resp: 'respiração', stress: 'estresse de ontem' };
  const miss = Object.keys(NF).filter((k) => !d.noite[k]);
  rows.push(!miss.length ? { s: 'ok', t: 'Noite de hoje', x: 'HRV, FC de repouso, sono, respiração e estresse de ontem.' }
    : miss.length === 5 || (!d.noite.sleep && !d.noite.hrv) ? { s: hour < 11 ? 'info' : 'falta', t: 'Noite de hoje', x: hour < 11 ? 'Ainda não chegou. O relógio precisa sincronizar com o Garmin Connect.' : 'Não chegou. Abra o Garmin Connect no celular para o relógio sincronizar.', now: true }
    : { s: 'falta', t: 'Noite de hoje', x: `Falta: ${miss.map((k) => NF[k]).join(', ')}.${miss.includes('resp') && miss.length === 1 ? ' O REC sai sem ela.' : ''}`, now: true });
  rows.push(d.dias.falta ? { s: 'falta', t: 'Dias', x: `Faltam ${n(d.dias.falta)} dias desde ${fmt(HISTORY_FROM)}.`, passo: 'dias' }
    : { s: 'ok', t: 'Dias', x: `${n(d.dias.n)} dias desde ${fmt(d.dias.first)}, HRV em ${n(d.dias.hrv)} noites.${d.dias.buracos ? ` ${d.dias.buracos} dias dos últimos 120 a Garmin não tem (relógio fora do pulso).` : ''}` });
  rows.push(d.horarios.falta ? { s: 'falta', t: 'Horários de sono', x: `${n(d.horarios.falta)} noites dos últimos 90 dias sem hora de deitar e acordar.`, passo: 'horarios' }
    : { s: 'ok', t: 'Horários de sono', x: 'Hora de deitar e acordar nos últimos 90 dias.' });
  rows.push(d.treinos.falta ? { s: 'falta', t: 'Treinos do último ano', x: `${n(d.treinos.falta)} treinos vieram do arquivo inicial, sem calorias, efeito de treino e o arquivo para as zonas.`, passo: 'treinos' }
    : { s: 'ok', t: 'Treinos do último ano', x: `${n(d.treinos.total)} treinos com os dados completos da Garmin.` });
  const errTxt = d.zonas.erros.map((e) => `${e.e ?? 'sem motivo'} (${e.n})`).join('; ');
  rows.push(zErr && !zPend ? { s: 'erro', t: 'Zonas do histórico', x: `${n(zErr)} treinos deram erro ao reler o arquivo: ${errTxt}.`, passo: 'zonas_erro' }
    : zPend ? { s: 'falta', t: 'Zonas do histórico', x: `${n(zPend)} treinos ainda com as zonas antigas do Garmin.${d.treinos.falta && zSemId ? ' Vem depois dos treinos.' : ''}${zErr ? ` ${zErr} com erro.` : ''}`, passo: 'zonas' }
    : zSemId && d.treinos.falta ? { s: 'falta', t: 'Zonas do histórico', x: 'Vem depois dos treinos.', passo: 'zonas' }
    : { s: 'ok', t: 'Zonas do histórico', x: `${n(zFit)} treinos refeitos com as zonas atuais.${z.sem_fc ? ` ${z.sem_fc} sem FC no arquivo.` : ''}${z.sem_arquivo ? ` ${z.sem_arquivo} sem arquivo na Garmin.` : ''}` });
  rows.push(d.rec.falta ? { s: 'falta', t: 'REC', x: `${n(d.rec.falta)} dias com HRV e sono ainda sem o cálculo.`, passo: 'rec' }
    : { s: 'ok', t: 'REC', x: `${n(d.rec.n)} dias calculados.` });

  const todo = rows.filter((r) => r.passo);
  const bad = rows.filter((r) => r.s === 'falta' || r.s === 'erro').length;
  const MARK = { ok: '✓', falta: '!', erro: '×', info: '·' };
  const fa = d.extras.idadeFitness, sb = d.extras.baseSono;

  screen.innerHTML = `${head}
    <section class="card dg">
      ${cardHead('check', 'Situação', { right: bad ? `${bad} para ver` : 'tudo em dia', info: `<p>Cada linha é uma parte dos dados que o app usa. <b>✓</b> está completa; <b>!</b> falta algo; <b>×</b> deu erro.</p><p>O botão faz só o que falta, sempre na mesma ordem: dias → horários de sono → treinos → zonas → REC. Um passo nunca desfaz outro: completar treinos mantém as zonas já refeitas.</p><p>Se a Garmin pedir pausa, ele espera e continua sozinho. Se você fechar o app no meio, toque de novo: retoma de onde parou.</p>` })}
      <ul class="dg-list">${rows.map((r, i) => `
        <li class="dg-${r.s}"><span class="dg-m" aria-label="${r.s}">${MARK[r.s]}</span>
          <div><b>${r.t}</b><p>${esc(r.x)}</p>${r.now && d.hasKey ? `<button type="button" class="dg-now" data-i="${i}">Buscar agora</button>` : ''}</div></li>`).join('')}
      </ul>
      ${todo.length ? `<button class="btn dg-go" id="go" ${d.hasKey ? '' : 'disabled'}>Completar o que falta</button>` : ''}
      <p class="progress" id="go-out" aria-live="polite"></p>
    </section>

    <section class="card dg">
      ${cardHead('heart', 'Também vem da Garmin')}
      <ul class="dg-list dg-quiet">
        <li><span class="dg-m">·</span><div><b>Linha do tempo do dia</b><p>${d.extras.linhaDoTempo ? `Curvas de FC e estresse até ${esc(fmt(d.extras.linhaDoTempo))}. Busca ao abrir o dia.` : 'Busca ao abrir a linha do tempo de um dia.'}</p></div></li>
        <li><span class="dg-m">·</span><div><b>Idade fitness</b><p>${fa?.fitnessAge != null ? `${Math.round(fa.fitnessAge)} anos (atualiza 1× por mês).` : fa?.error ? (/404/.test(fa.error) ? 'A Garmin não libera esse dado pela API pessoal.' : `A Garmin não entregou: ${esc(fa.error)}`) : 'Ainda não buscada; abre em Tendências.'}</p></div></li>
        <li><span class="dg-m">·</span><div><b>Base de sono</b><p>${sb ? `${Math.floor(sb.hours)}h${String(Math.round((sb.hours % 1) * 60)).padStart(2, '0')}, refeita em ${esc(sb.month.split('-').reverse().join('/'))}${sb.fallback ? ' (padrão de 7h30; poucas noites para medir)' : ''}.` : 'Calculada na próxima abertura do Hoje.'}</p></div></li>
      </ul>
    </section>

    <details class="card dg-adv">
      <summary>Avançado</summary>
      <p class="note">Ferramentas de conferência. Nada aqui é necessário no dia a dia.</p>
      <div class="dg-tools">
        <button class="btn ghost" id="check" ${d.hasKey ? '' : 'disabled'}>Testar conexão</button>
        <button class="btn ghost" id="zcur" ${d.hasKey ? '' : 'disabled'}>Ver zonas atuais</button>
        <button class="btn ghost" id="ztest" ${d.hasKey ? '' : 'disabled'}>Testar zonas com 1 treino</button>
        <button class="btn ghost" id="refill" ${d.hasKey ? '' : 'disabled'}>Buscar de novo os últimos 90 dias</button>
        <button class="btn ghost" id="zundo">Voltar às zonas originais</button>
        <button class="btn ghost" id="probe" ${d.hasKey ? '' : 'disabled'}>Testar fases do sono e VO2máx</button>
      </div>
      <div id="adv-out" class="dg-out" aria-live="polite"></div>
      <h3 class="dg-h3">Últimas buscas</h3>
      <div id="log"><p class="progress">…</p></div>
    </details>`;

  const out = screen.querySelector('#go-out'), adv = screen.querySelector('#adv-out');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const short = (iso) => iso.split('-').reverse().slice(0, 2).join('/');
  // chamada que espera sozinha quando a Garmin pede pausa
  async function call(path, label) {
    for (let tent = 1; ; tent++) {
      try { return await api(path, { method: 'POST' }); }
      catch (e) {
        if (!/limite|429/.test(e.message) || tent >= 15) throw e;
        for (let s = 60; s > 0; s--) { label(`a Garmin pediu pausa, retomando em ${s} s`); await sleep(1000); }
      }
    }
  }

  screen.querySelectorAll('.dg-now').forEach((b) => b.addEventListener('click', async () => {
    b.disabled = true; b.textContent = 'Buscando…';
    try { await api('/api/refresh', { method: 'POST' }); } catch (e) { b.textContent = errText(e); return; }
    renderGarmin();
  }));

  screen.querySelector('#go')?.addEventListener('click', async (ev) => {
    const btn = ev.currentTarget; btn.disabled = true;
    const steps = todo.map((r) => r.passo), total = steps.length;
    const say = (i, t, msg) => { out.textContent = `Passo ${i + 1} de ${total} · ${t}: ${msg}`; };
    try {
      for (let i = 0; i < steps.length; i++) {
        const p = steps[i];
        if (p === 'dias' || p === 'horarios') {
          const t = p === 'dias' ? 'dias' : 'horários de sono', js = d[p === 'dias' ? 'dias' : 'horarios'].janelas;
          for (let k = 0; k < js.length; k++) {
            say(i, t, `bloco ${k + 1} de ${js.length} (${short(js[k][0])} a ${short(js[k][1])})`);
            await call(`/api/garmin/backfill?from=${js[k][0]}&to=${js[k][1]}`, (m) => say(i, t, m));
            await sleep(1200);
          }
        } else if (p === 'treinos') {
          const js = d.treinos.janelas;
          for (let k = 0; k < js.length; k++) {
            say(i, 'treinos', `${short(js[k][0])} a ${short(js[k][1])} (${k + 1} de ${js.length})`);
            await call(`/api/garmin/activities?from=${js[k][0]}&to=${js[k][1]}`, (m) => say(i, 'treinos', m));
          }
        } else if (p === 'zonas' || p === 'zonas_erro') {
          if (p === 'zonas_erro') await api('/api/zones/retry', { method: 'POST' });
          const r = await recalcHistory(api, { onEach: ({ item, z, error, left }) => say(i, 'zonas', error ? `${short(item.date)} pulado (${error})` : `${short(item.date)} ${z ? 'refeito' : 'sem FC'}${left != null ? ` · faltam ${Math.max(0, left)}` : ''}`) });
          if (r.stop) throw new Error(r.stop);
        }
      }
      // dias novos mudam o REC: recalcula do primeiro dia que mudou até hoje, em blocos de 60
      const starts = [...(steps.includes('dias') ? [d.dias.janelas[0]?.[0]] : []), ...(steps.includes('rec') ? [addDaysIso(d.rec.ate[0], -59)] : [])].filter(Boolean).sort();
      if (starts.length) for (let to = addDaysIso(starts[0], 59); ; to = addDaysIso(to, 60)) {
        const end = to > d.hoje ? d.hoje : to; out.textContent = `Recalculando o REC até ${short(end)}…`;
        await api(`/api/recompute?to=${end}&keep=60`, { method: 'POST' }); if (end === d.hoje) break;
      }
      out.textContent = 'Pronto. Conferindo de novo…';
      setTimeout(renderGarmin, 900);
    } catch (e) { out.textContent = `Parou: ${errText(e)} Toque de novo: continua do que falta.`; btn.disabled = false; }
  });

  // --- avançado ---
  const SL = { default: 'Padrão (Hyrox e outros)', bike: 'Bike', corrida: 'Corrida', natacao: 'Natação' };
  const tool = (id, fn) => screen.querySelector(id).addEventListener('click', async (ev) => {
    const b = ev.currentTarget; b.disabled = true; adv.innerHTML = '<p class="progress">…</p>';
    try { await fn(b); } catch (e) { adv.innerHTML = `<p class="alert">${esc(errText(e))}</p>`; }
    b.disabled = false;
  });
  tool('#check', async () => {
    const r = await api('/api/garmin/check?days=14');
    const LABEL = { hrv: 'HRV', rhr: 'FC de repouso', sleep_h: 'Sono', sleep_score: 'Score do sono', resp: 'Respiração', stress: 'Estresse' };
    adv.innerHTML = `<ul class="acts">${r.fields.map((f) => `<li><span>${LABEL[f.field]}</span><span class="meta">${f.api} de 14 dias${f.ambos ? `, ${f.iguais}/${f.ambos} iguais ao banco` : ''}</span></li>`).join('')}</ul>
      <details class="raw"><summary>Detalhes técnicos</summary><pre>${esc(JSON.stringify({ campos: r.raw, detalhe: r.detail, amostra: r.sample }, null, 1))}</pre></details>`;
  });
  tool('#zcur', async () => {
    const { zones } = await api('/api/zones/current');
    adv.innerHTML = `<ul class="acts">${Object.entries(zones).map(([k, z]) => `<li><span>${SL[k] ?? k}</span><span class="meta">Z1 ${z.floors[0]} · Z2 ${z.floors[1]} · Z3 ${z.floors[2]} · Z4 ${z.floors[3]} · Z5 ${z.floors[4]}${z.max ? ` · máx ${z.max}` : ''}</span></li>`).join('')}</ul>`;
  });
  tool('#probe', async () => {
    const r = await api('/api/garmin/probe');
    const f = r.sono?.fases_lidas, v = r.perfil?.vo2 ?? {};
    const lines = [
      `Fases do sono: ${r.sono?.erro ? `erro ${r.sono.erro}` : f?.trechos ? `chegam (${f.trechos} trechos)` : r.sono?.profundo_s != null ? 'só os totais por fase' : 'não chegam pela chave pessoal'}`,
      `VO2máx no perfil: ${r.perfil?.erro ? `erro ${r.perfil.erro}` : Object.keys(v).length ? Object.entries(v).map(([k, x]) => `${k} ${x}`).join(' · ') : 'não vem'}`,
      `VO2máx nos treinos: ${Object.keys(r.atividade_lista?.vo2 ?? {}).length || Object.keys(r.atividade_detalhe?.vo2 ?? {}).length ? 'vem' : 'não vem'}`,
    ];
    adv.innerHTML = `<ul class="acts">${lines.map((l) => `<li><span>${esc(l)}</span></li>`).join('')}</ul>
      <details class="raw" open><summary>Detalhes técnicos (me mande print)</summary><pre>${esc(JSON.stringify(r, null, 1))}</pre></details>`;
  });
  tool('#ztest', async () => { adv.innerHTML = `<p class="progress">${(await testOne(api)).map((x) => esc(x)).join('<br>')}</p>`; });
  tool('#refill', async () => {
    const today = d.hoje, js = [];
    for (let x = addDaysIso(today, -89); x <= today; x = addDaysIso(x, 14)) js.push([x, addDaysIso(x, 13) > today ? today : addDaysIso(x, 13)]);
    const p = document.createElement('p'); p.className = 'progress'; adv.replaceChildren(p);
    for (let k = 0; k < js.length; k++) { p.textContent = `Bloco ${k + 1} de ${js.length}…`; await call(`/api/garmin/backfill?from=${js[k][0]}&to=${js[k][1]}`, (m) => { p.textContent = m; }); await sleep(1200); }
    await api(`/api/recompute?to=${today}&keep=60`, { method: 'POST' });
    p.textContent = 'Pronto.';
  });
  let undoArmed = false;
  tool('#zundo', async (b) => {
    if (!undoArmed) { undoArmed = true; b.textContent = 'Toque de novo para confirmar'; adv.innerHTML = '<p class="progress">Volta todos os treinos às zonas que vieram do Garmin. O Strain antigo volta junto e "Zonas do histórico" fica pendente de novo.</p>'; return; }
    await api('/api/zones/undo', { method: 'POST' }); undoArmed = false; b.textContent = 'Voltar às zonas originais';
    adv.innerHTML = '<p class="progress">Zonas originais de volta.</p>'; setTimeout(renderGarmin, 1200);
  });
  // registro das buscas só quando abre o avançado
  screen.querySelector('.dg-adv').addEventListener('toggle', async (ev) => {
    if (!ev.currentTarget.open || ev.currentTarget.dataset.loaded) return; ev.currentTarget.dataset.loaded = '1';
    const box = screen.querySelector('#log');
    try {
      const st = await api('/api/garmin/status');
      box.innerHTML = st.log.length ? `<ul class="acts">${st.log.map((l) => `<li><span>${esc(new Date(l.at + 'Z').toLocaleString('pt-BR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))}</span><span class="meta">${esc(l.status)}: ${esc(l.detail)}</span></li>`).join('')}</ul>` : '<p class="empty">Nenhuma ainda.</p>';
    } catch (e) { box.innerHTML = `<p class="progress">${esc(errText(e))}</p>`; }
  });
}

// --- ajustes: Garmin e tema (04/11, saíram do rodapé) ---
function renderSettings() {
  document.documentElement.style.setProperty('--rec', 'var(--text-3)');
  screen.innerHTML = `
    <header class="top"><a class="back-link" href="#hoje">‹ Hoje</a></header>
    <h1 class="td-title">Ajustes</h1>
    <p class="set-h">Dados</p>
    <nav class="card set-list">
      <a href="#garmin"><i class="set-ic" style="background:#e2614f">${ICON.heart}</i><span><b>Garmin</b><small id="set-garmin">Dados, conexão e o que falta completar</small></span><em>›</em></a>
    </nav>
    <p class="set-h">App</p>
    <nav class="card set-list">
      <a href="#personalizar"><i class="set-ic" style="background:#3f93d4">${ICON.check}</i><span><b>Personalizar o Hoje</b><small>Quais blocos aparecem e em que ordem</small></span><em>›</em></a>
      <a href="#tema"><i class="set-ic" style="background:#a86fd6">${ICON.sun}</i><span><b>Tema</b><small>Fundo e cartões</small></span><em>›</em></a>
      <a href="#widget"><i class="set-ic" style="background:#1f9e90">${ICON.bolt}</i><span><b>Widget do iPhone</b><small>O número do dia na tela inicial</small></span><em>›</em></a>
    </nav>
    <p class="set-h">Métricas e treinador</p>
    <nav class="card set-list">
      <a href="#tend/calib"><i class="set-ic" style="background:#d2764a">${ICON.smile}</i><span><b>O REC acerta?</b><small>Calibração × como me sinto</small></span><em>›</em></a>
      <a href="#treinador"><i class="set-ic" style="background:#6b6d75">${ICON.book}</i><span><b>Relatório do treinador</b><small id="set-coach">Publicado no GitHub para o chat de treino</small></span><em>›</em></a>
    </nav>`;
  api('/api/diag').then((d) => {
    const miss = [d.dias.falta, d.horarios.falta, d.treinos.falta, d.zonas.states.pendente, d.zonas.states.erro, d.rec.falta].filter((x) => x > 0).length;
    const el = screen.querySelector('#set-garmin'); if (el && miss) el.textContent = `${miss} ${miss === 1 ? 'parte' : 'partes'} para completar`;
  }).catch(() => {});
}

// --- personalizar o Hoje: mostrar/ocultar e mudar a ordem (guardado neste aparelho) ---
function renderCustomize() {
  document.documentElement.style.setProperty('--rec', 'var(--text-3)');
  const draw = () => {
    const list = hojePrefs(), name = Object.fromEntries(HOJE_BLOCKS);
    screen.innerHTML = `<header class="top"><h1>Personalizar o Hoje</h1><a class="foot-link" href="#ajustes">Voltar</a></header>
      <p class="note">O anel do dia fica sempre no topo. Escolha o que aparece embaixo dele e em que ordem.</p>
      <ul class="card cz-list">${list.map((x, i) => `<li>
        <label><input type="checkbox" data-on="${x.k}" ${x.on ? 'checked' : ''}><span>${esc(name[x.k])}</span></label>
        <span class="cz-mv"><button type="button" data-up="${i}" aria-label="Subir" ${i === 0 ? 'disabled' : ''}>↑</button><button type="button" data-dn="${i}" aria-label="Descer" ${i === list.length - 1 ? 'disabled' : ''}>↓</button></span></li>`).join('')}</ul>
      <button class="btn ghost" id="cz-reset">Voltar ao padrão</button>`;
    const save = (l) => { try { localStorage.setItem('rec.hoje', JSON.stringify(l)); } catch {} draw(); };
    screen.querySelectorAll('[data-on]').forEach((c) => c.addEventListener('change', () => save(list.map((x) => (x.k === c.dataset.on ? { ...x, on: c.checked } : x)))));
    screen.querySelectorAll('[data-up]').forEach((b) => b.addEventListener('click', () => { const i = Number(b.dataset.up), l = [...list]; [l[i - 1], l[i]] = [l[i], l[i - 1]]; save(l); }));
    screen.querySelectorAll('[data-dn]').forEach((b) => b.addEventListener('click', () => { const i = Number(b.dataset.dn), l = [...list]; [l[i + 1], l[i]] = [l[i], l[i + 1]]; save(l); }));
    screen.querySelector('#cz-reset').addEventListener('click', () => { try { localStorage.removeItem('rec.hoje'); } catch {} draw(); });
  };
  draw();
}

// --- relatório do treinador: prévia, status e enviar agora ---
async function renderCoach() {
  document.documentElement.style.setProperty('--rec', 'var(--text-3)');
  const head = '<header class="top"><h1>Relatório do treinador</h1><a class="foot-link" href="#ajustes">Voltar</a></header>';
  screen.innerHTML = `${head}<p class="empty">Montando…</p>`;
  const nav = navSeq;
  let d; try { d = await api('/api/coach-report'); } catch (e) { if (nav === navSeq) screen.querySelector('.empty').textContent = errText(e); return; }
  if (nav !== navSeq) return;
  const when = d.sent?.last ? new Date(d.sent.last).toLocaleString('pt-BR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : null;
  screen.innerHTML = `${head}
    <section class="card">${cardHead('book', 'Como funciona', { color: 'var(--accent)' })}
      <p class="note">O servidor publica <b>relatorio/ultimo.md</b> no repositório do app duas vezes por dia: assim que a noite chega da Garmin e às 20 h (com o treino do dia). Cada dia também fica guardado em relatorio/AAAA-MM-DD.md. O chat de treino lê esse arquivo antes de montar os treinos.</p>
      <p class="note">${d.hasToken ? (when ? `Último envio: ${esc(when)}.` : 'Token configurado; ainda não enviou.') : '<b>Falta configurar</b> o token do GitHub no Cloudflare (secret GITHUB_TOKEN).'}</p>
      <button class="btn dg-go" id="co-send" ${d.hasToken ? '' : 'disabled'}>Enviar agora</button>
      <p class="progress" id="co-out" aria-live="polite"></p>
    </section>
    <section class="card">${cardHead('check', 'Prévia (o que o treinador vê)', { color: 'var(--text-2)' })}<pre class="co-md">${esc(d.md)}</pre></section>`;
  screen.querySelector('#co-send').addEventListener('click', async (ev) => {
    const b = ev.currentTarget, out = screen.querySelector('#co-out'); b.disabled = true; out.textContent = 'Enviando…';
    try { const r = await api('/api/coach-report', { method: 'POST' }); out.textContent = r.ok ? 'Publicado no GitHub.' : `Não enviou: ${r.error}`; }
    catch (e) { out.textContent = `Não enviou: ${errText(e)}`; }
    b.disabled = false;
  });
}

// --- widget do iPhone (Scriptable): passo a passo + copiar o código já com o endereço deste app ---
function renderWidgetHelp() {
  document.documentElement.style.setProperty('--rec', 'var(--text-3)');
  screen.innerHTML = `
    <header class="top"><h1>Widget do iPhone</h1><a class="foot-link" href="#ajustes">Voltar</a></header>
    <section class="card">
      <ol class="wg-steps">
        <li>Instale o app <b>Scriptable</b> (gratuito) na App Store.</li>
        <li>Toque em <b>Copiar código</b> aqui embaixo. Ele já vem com o endereço do seu app.</li>
        <li>Abra o Scriptable, toque no <b>+</b> (canto de cima), cole o código e toque no título “Untitled Script” para dar o nome <b>REC</b>. Toque em <b>Done</b>. Já tem o script? Abra o REC no Scriptable, apague tudo e cole o novo.</li>
        <li>Toque no script REC uma vez: deve aparecer uma prévia do widget. Se aparecer “sem conexão”, me avise.</li>
        <li>Na tela inicial do iPhone, segure um espaço vazio até os ícones tremerem → <b>Editar</b> → <b>Adicionar widget</b> → procure <b>Scriptable</b> → escolha o tamanho <b>médio</b> (ou pequeno) → <b>Adicionar widget</b>.</li>
        <li>Com os ícones ainda tremendo, toque no widget → em <b>Script</b> escolha <b>REC</b> → em <b>When Interacting</b> escolha <b>Open URL</b> (abre o app ao tocar). Toque fora para fechar.</li>
      </ol>
      <button class="btn dg-go" id="wg-copy">Copiar código</button>
      <p class="progress" id="wg-out" aria-live="polite"></p>
      <p class="note">O widget se atualiza sozinho mais ou menos a cada 30 minutos (o iPhone decide o momento exato). Pequeno: o anel do dia. Médio: anel + REC, Forma, Strain e treino do dia.</p>
    </section>`;
  // código completo (desenho + execução) já com o endereço deste app: é só colar no Scriptable
  const fullCode = async () => {
    const core = await (await fetch('/widget-core.js', { cache: 'no-store' })).text();
    return `// REC — widget do iPhone (Scriptable). Código completo; para atualizar, copie de novo em Ajustes → Widget do iPhone.\nconst APP = '${location.origin}';\n\n`
      + core.replace(/^if \(typeof module.*$/m, '')
      + `\nconst widget = await draw(APP, config.runsInWidget ? config.widgetFamily : 'medium');\nif (config.runsInWidget) Script.setWidget(widget); else await widget.presentMedium();\nScript.complete();\n`;
  };
  screen.querySelector('#wg-copy').addEventListener('click', async () => {
    const out = screen.querySelector('#wg-out');
    let code = '';
    try { code = await fullCode(); await navigator.clipboard.writeText(code); out.textContent = 'Copiado. Agora cole no Scriptable (passo 3).'; }
    catch (e) {
      out.textContent = 'Não deu para copiar sozinho. Segure no texto abaixo → Selecionar tudo → Copiar.';
      const ta = document.createElement('textarea'); ta.className = 'wg-code'; ta.readOnly = true; ta.value = code || await fullCode(); out.after(ta);
    }
  });
}

// --- tema (guardado só neste aparelho) ---
const THEMES = [
  { key: 'preto', name: 'Preto', bg: '#000', card: '#0e0f12' },
  { key: 'grafite', name: 'Grafite', bg: '#16171a', card: '#1d1f23' },
  { key: 'verde', name: 'Verde-escuro', bg: '#07110e', card: '#0d1a15' },
  { key: 'marinho', name: 'Azul-marinho', bg: '#070d1a', card: '#0d1526' },
];
function applyTheme(k) {
  const t = THEMES.find((x) => x.key === k) ?? THEMES[0];
  if (t.key === 'preto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t.key;
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', t.bg);
  try { localStorage.setItem('rec.theme', t.key); } catch {}
}
function renderTheme() {
  document.documentElement.style.setProperty('--rec', 'var(--text-3)');
  let cur = 'preto'; try { cur = localStorage.getItem('rec.theme') || 'preto'; } catch {}
  screen.innerHTML = `
    <header class="top"><h1>Tema</h1><a class="foot-link" href="#ajustes">Voltar</a></header>
    <div class="themes">${THEMES.map((t) => `
      <button type="button" class="theme-opt" data-theme-key="${t.key}" aria-pressed="${t.key === cur}">
        <span class="sw" style="background:${t.bg}"><i style="background:${t.card}"></i></span>${t.name}</button>`).join('')}
    </div>
    <p class="note">Muda só o fundo e os cartões. As cores do REC, da Forma e das modalidades continuam iguais. Fica guardado neste aparelho.</p>`;
  screen.querySelectorAll('.theme-opt').forEach((b) => b.addEventListener('click', () => {
    applyTheme(b.dataset.themeKey);
    screen.querySelectorAll('.theme-opt').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  }));
}

// transições (05/11): tela de detalhe entra da direita, voltar entra da esquerda, troca de aba com fade
const TAB_H = new Set(['#hoje', '#treino', '#prova', '#tendencias']);
const SET2 = new Set(['#garmin', '#tema', '#widget', '#treinador', '#tend/calib', '#personalizar']);
const depthOf = (h) => (TAB_H.has(h) ? 0 : SET2.has(h) ? 2 : 1);
let lastDepth = null;
function navAnim(h) {
  const dep = depthOf(h), cls = lastDepth == null ? null : dep > lastDepth ? 'nav-push' : dep < lastDepth ? 'nav-pop' : 'nav-fade';
  lastDepth = dep;
  if (!cls) return;
  screen.classList.remove('nav-push', 'nav-pop', 'nav-fade', 'slide-l', 'slide-r'); void screen.offsetWidth; screen.classList.add(cls);
}
screen.addEventListener('animationend', (e) => { if (e.target === screen) screen.classList.remove('nav-push', 'nav-pop', 'nav-fade'); });

// esqueleto de carregamento: todo "Carregando…" vira faixas que brilham; some quando o texto muda (erro) ou o bloco é trocado
const markSk = (root) => root.querySelectorAll?.('.empty').forEach((el) => el.classList.toggle('sk', el.textContent.trim() === 'Carregando…'));
new MutationObserver((ms) => { for (const m of ms) { const t = m.target.nodeType === 1 ? m.target : m.target.parentElement; if (t) { if (t.classList?.contains('sk') && t.textContent.trim() !== 'Carregando…') t.classList.remove('sk'); markSk(t); } } })
  .observe(screen, { childList: true, subtree: true, characterData: true });

function route() {
  const h = location.hash || '#hoje';
  navAnim(h);
  document.querySelectorAll('.tab[href]').forEach((t) => {
    const on = t.getAttribute('href') === (h.startsWith('#relatorio/') ? '#prova' : h.startsWith('#tend/') ? (h === '#tend/calib' ? '#hoje' : '#tendencias') : h.startsWith('#semana/') ? '#treino' : h.startsWith('#sono/') || h.startsWith('#rec/') || h.startsWith('#strain/') ? '#hoje' : h === '#garmin' || h === '#tema' || h === '#ajustes' || h === '#widget' || h === '#treinador' || h === '#personalizar' || h.startsWith('#atv/') || h.startsWith('#card/') ? '#hoje' : h);
    t.classList.toggle('is-active', on);
    if (on) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current');
  });
  window.scrollTo(0, 0);
  document.body.classList.remove('is-share');
  navSeq++;
  // telas dos outros módulos escrevem numa página própria: se a resposta chegar depois de trocar de aba, cai numa página que já saiu da tela
  const page = () => { const pg = document.createElement('div'); pg.className = 'page'; screen.replaceChildren(pg); return pg; };
  if (h.startsWith('#card/')) renderShare(page(), api, decodeURIComponent(h.slice(6)));
  else if (h.startsWith('#atv/')) renderActivity(page(), api, decodeURIComponent(h.slice(5)));
  else if (h === '#garmin') renderGarmin();
  else if (h === '#tema') renderTheme();
  else if (h === '#ajustes') renderSettings();
  else if (h === '#widget') renderWidgetHelp();
  else if (h === '#treinador') renderCoach();
  else if (h === '#personalizar') renderCustomize();
  else if (h === '#tendencias') renderTrends(page(), api);
  else if (h === '#treino') renderTrain(page(), api);
  else if (h === '#prova') renderRace(page(), api);
  else if (h.startsWith('#relatorio/')) renderReport(page(), api, h.slice(11));
  else if (h.startsWith('#tend/')) renderTrendDetail(page(), api, h.slice(6));
  else if (h.startsWith('#sono/')) renderSleep(page(), api, h.slice(6));
  else if (h.startsWith('#rec/')) renderRecDetail(h.slice(5));
  else if (h.startsWith('#strain/')) renderStrainDetail(h.slice(8));
  else if (h.startsWith('#semana/')) renderWeekReview(page(), api, h.slice(8));
  else load();
}
window.addEventListener('hashchange', route);

// ao voltar para o app: recarrega (pega a noite se chegou e troca o dia se virou)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && (location.hash || '#hoje') === '#hoje') { autoTried = ''; dayOffset = 0; load(); }
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
route();
