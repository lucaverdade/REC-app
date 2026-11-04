// REC — app. Sem framework.
import { renderTrends, renderTrendDetail, zoneOfPct, FORM_ZONES } from './trends.js';
import { renderTrain } from './train.js';
import { renderRace, renderReport } from './race.js';
import { reviewHtml } from './review.js';
import { renderShare } from './share.js';
import { ICON, cardHead, countUp, readyColor } from './ui.js';
import { renderActivity } from './activity.js';
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
        <p>A meta é quanto Strain cabe hoje sem pesar demais, olhando REC, semana e carga recente. Strain não tem teto: é a soma de minutos × zona. Modo sombra: o plano do treinador manda.</p></details>
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
  const prev = pl.reduce((a, p) => a + (p.strain ?? 0), 0);
  const HC = { acima: 'var(--good)', estavel: 'var(--text)', fadiga: 'var(--warn)', risco: 'var(--bad)' };
  const date = new Date(d.date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  // anel pequeno da Prontidão
  const R = 30, C = 2 * Math.PI * R, fill = Math.max(0.02, Math.min(1, rd / 100));
  const ring = `<svg viewBox="0 0 76 76" class="mr-ring" aria-hidden="true">
    <circle cx="38" cy="38" r="${R}" class="mr-ring-bg"/>
    <circle cx="38" cy="38" r="${R}" class="mr-ring-fg" style="stroke:${zc}" stroke-dasharray="${(C * fill).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 38 38)"/>
  </svg>`;
  const tiles = [
    { k: 'Noite', v: n?.hours != null ? hmm(n.hours) : '–', c: n?.hours != null && base && n.hours >= base ? 'var(--sleep)' : 'var(--text)',
      s: base ? `base ${hmm(base)}${d.sleep.debt >= 1 / 6 ? ` · dívida ${hmm(d.sleep.debt)}` : ''}` : '' },
    d.hrvTrend ? { k: 'HRV', v: `${d.hrvTrend.mean7}<small> ms</small>`, c: HC[d.hrvTrend.cls], s: d.hrvTrend.label } : null,
    d.load?.formPct != null ? { k: 'Forma', v: `${sg(d.load.formPct)}<small>%</small>`, c: `var(--z-${d.load.zone?.key ?? 'neutro'})`, s: d.load.zone?.label ?? '' } : null,
  ].filter(Boolean);
  return `<section class="morning" aria-label="Relatório da manhã" style="--rz:${zc}">
    <div class="mr-top">
      <div><p class="mr-hi">Bom dia</p><p class="mr-date">${esc(date.charAt(0).toUpperCase() + date.slice(1))}</p></div>
      <button type="button" class="mr-close" aria-label="Fechar o relatório até amanhã">×</button>
    </div>
    <div class="mr-hero">
      <div class="mr-rec">${ring}<b>${rd}<small>%</small></b></div>
      <div class="mr-hero-txt">
        <span class="mr-lab">Prontidão · REC ${d.rec ?? '–'}${d.day?.trend ? ` (${esc(d.day.trend.txt.replace('REC ', ''))})` : ''}</span>
        ${d.day?.summary ? `<p class="mr-phrase">${esc(d.day.summary)}</p>` : ''}
      </div>
    </div>
    <div class="mr-tiles">${tiles.map((t) => `<div class="mr-tile"><span class="mr-lab">${t.k}</span><b style="color:${t.c}">${t.v}</b><small>${esc(t.s)}</small></div>`).join('')}</div>
    <div class="mr-block">
      <span class="mr-lab">Treino de hoje</span>
      ${pl.length ? `<ul class="mr-plan">${pl.map((p) => `<li><i class="dot s-${p.sport}"></i><span>${esc(p.titulo || p.label)}</span><em>${p.minutos ? `${p.minutos} min` : ''}${p.zona ? ` · ${esc(p.zona)}` : ''}</em></li>`).join('')}</ul>
        ${d.day?.target ? `<p class="mr-meta">Strain previsto <b>${prev}</b> · meta do dia <b>${d.day.target.target}</b></p>` : ''}`
        : '<p class="mr-meta">Sem treino planejado.</p>'}
    </div>
    ${need ? `<div class="mr-block mr-night"><span class="mr-lab">Hoje à noite</span><p>Meta <b>${hmm(need.total)}</b>${d.sleep.bedtime ? ` · deitar até <b>${esc(d.sleep.bedtime.bedtime)}</b>` : ''}</p></div>` : ''}
    ${d.alerts?.length ? `<p class="mr-alert">${esc(d.alerts[0].text)}</p>` : ''}
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
  if (!d.isToday || new Date().getHours() < 17 || !d.tomorrow) return '';
  const ss = d.tomorrow.sessions ?? [], key = ss.find((x) => x.chave), need = d.sleep?.need, bed = d.sleep?.bedtime;
  const wd = new Date(d.tomorrow.date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long' });
  return `<section class="tmr" aria-label="Amanhã">
    <span class="mr-lab">Amanhã, ${esc(wd)}</span>
    ${ss.length ? `<ul class="mr-plan">${ss.map((p) => `<li><i class="dot s-${p.sport}"></i><span>${esc(p.titulo || p.label)}${p.chave ? ' <em class="tmr-key">chave</em>' : ''}</span><em>${p.minutos ? `${p.minutos} min` : ''}${p.zona ? ` · ${esc(p.zona)}` : ''}</em></li>`).join('')}</ul>` : '<p class="mr-meta">Sem treino no plano: descanso.</p>'}
    ${need ? `<p class="tmr-sleep">Hoje à noite: meta <b>${hmm(need.total)}</b>${bed ? ` · deitar até <b>${esc(bed.bedtime)}</b>` : ''}${key ? ' (véspera de sessão-chave)' : ''}</p>` : ''}
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
      ${ringTile({ id: 'ready', value: shownV ?? '–', unit: shownV == null ? '' : '%', frac: (shownV ?? 0) / 100, color: readyColor(shownV), valColor: shownV == null ? '' : readyColor(shownV), label: 'Prontidão',
        sub: wait != null ? 'de ontem · esperando a noite de hoje' : sc == null && d.isToday ? 'a noite ainda não chegou' : '', aria: wait != null ? `Prontidão de ontem, ${wait}%. A noite de hoje ainda não chegou.` : 'Prontidão. Toque para ver o que entrou na conta.' })}
      <div class="hero-mini">
        <button type="button" class="mini" data-ring="rec" aria-expanded="false" aria-controls="contrib" aria-label="REC. Toque para ver o que compõe o número.">
          <span class="mini-l">REC</span><b style="color:${d.rec == null ? 'var(--text-3)' : zoneVar(zoneOf(d.rec))}">${d.rec ?? '–'}</b>
          <span class="mini-s">${d.day?.trend ? `${d.day.trend.dir === 'up' ? '↑' : d.day.trend.dir === 'down' ? '↓' : '→'} ${esc(d.day.trend.txt.replace('REC ', ''))}` : '&nbsp;'}</span></button>
        <button type="button" class="mini" data-ring="forma" aria-label="Forma. Toque para ver as tendências.">
          <span class="mini-l">Forma</span><b>${fp == null ? '–' : `${fp > 0 ? '+' : fp < 0 ? '−' : ''}${Math.abs(fp)}<small>%</small>`}</b>
          <span class="mini-s">${esc(shortZone(d.load?.zone?.key))}</span></button>
      </div>
    </section>
    <div class="contrib" id="ready-parts"><div>${readyPartsHtml(r)}</div></div>`;
    })()}

    ${d.day?.summary ? `<p class="day-summary s-${zoneOf(d.rec)}">${esc(d.day.summary)}</p>` : ''}

    ${d.load ? loadStrip(d.load) : ''}

    <div class="chips" role="list" aria-label="O que puxou o REC">${chipsHtml(d.contributors)}</div>

    <div class="contrib" id="contrib"><div>
      <p class="comment">${esc(d.comment)}</p>
      <ul>${contribHtml(d.contributors)}</ul>
      <ol class="week" aria-label="REC nos últimos 7 dias">
        ${d.week.map((w) => `
          <li class="${w.date === todayIso ? 'is-today' : ''}" title="${w.rec ?? '–'}">
            <i style="background:${w.rec == null ? 'var(--line)' : zoneVar(zoneOf(w.rec))}"></i>
            ${esc(fmtDate(w.date, { weekday: 'narrow' }))}
          </li>`).join('')}
      </ol>
      ${d.shadowMode ? '<p class="shadow-note">Modo sombra: os portões do plano (HRV ≥ 100, FC de repouso ≤ 41) continuam valendo.</p>' : ''}
    </div></div>

    ${d.alerts.map((a) => `<p class="alert" role="status">${esc(a.text)}</p>`).join('')}
    ${d.needsHistory ? '<p class="alert">O histórico ainda não foi carregado, então o REC não tem base. <a href="#garmin">Puxar histórico da Garmin</a></p>' : ''}
    ${d.sleep ? sleepCard(d) : ''}

    <section class="card">
      ${cardHead('bolt', d.isToday ? 'Treino de hoje' : 'Treinos do dia', { color: 'var(--strain)' })}
      ${d.day?.target ? strainRing(d.load?.strain ?? 0, d.day.target) : ''}
      ${d.planned?.length ? plannedHtml(d.planned, d.activities) : ''}
      ${actsHtml(d.activities)}
    </section>



    <section class="card tl" id="tl">${cardHead('clock', d.isToday ? 'Seu dia' : 'O dia', { color: 'var(--fatigue)' })}<p class="empty">Carregando…</p></section>

    <section class="card feel ${d.feel == null ? 'unset' : ''}">
      <header class="ch" style="--ic:var(--accent)">${ICON.smile}<h2 id="feel-label">Como me sinto</h2></header>
      <div class="feel-row">
        <input type="range" min="1" max="10" step="1" value="${d.feel ?? 5}" aria-labelledby="feel-label">
        <output class="${d.feel == null ? 'unset' : ''}">${d.feel ?? '–'}</output>
      </div>
      <span class="saved" aria-live="polite"></span>
    </section>

    ${d.habits ? `<section class="card habits">
      ${cardHead('book', d.isToday ? 'Diário de hoje' : 'Diário do dia', { color: 'var(--accent)', info: 'Marque à noite o que aconteceu no dia. Conta para o REC de amanhã; o efeito de cada hábito aparece em Tendências → Corpo → O que mexe no meu REC.' })}
      <div class="hb-list">${[...d.habits.defs].sort((a, b) => d.habits.on.includes(b.key) - d.habits.on.includes(a.key)).map((h) => `<button type="button" class="hb" data-tag="${h.key}" aria-pressed="${d.habits.on.includes(h.key)}">${esc(h.label)}</button>`).join('')}</div>
    </section>` : ''}

    <div class="foot">
      <button class="sync" type="button" ${d.isToday ? '' : 'hidden'}>Atualizar dados</button>
    </div>
  `;

  // anéis: animação única ao abrir
  requestAnimationFrame(() => requestAnimationFrame(() => {
    screen.querySelectorAll('.rt-arc').forEach((a) => { a.style.strokeDashoffset = a.dataset.target; });
  }));

  // REC: abre os contribuintes; Forma: Tendências; Strain: treinos do dia
  const contrib = screen.querySelector('#contrib');
  const recBtn = screen.querySelector('[data-ring="rec"]');
  const toggle = () => { const open = contrib.classList.toggle('is-open'); recBtn.setAttribute('aria-expanded', String(open)); };
  recBtn.addEventListener('click', toggle);
  screen.querySelector('.chips')?.addEventListener('click', toggle);
  screen.querySelector('[data-ring="forma"]').addEventListener('click', () => { location.hash = '#tendencias'; });
  // Prontidão: abre as quatro partes
  const rp = screen.querySelector('#ready-parts'), rBtn = screen.querySelector('[data-ring="ready"]');
  rBtn.addEventListener('click', () => { const open = rp.classList.toggle('is-open'); rBtn.setAttribute('aria-expanded', String(open)); });

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

  // linha do tempo do dia (carrega depois da tela)
  api(`/api/timeline?date=${todayIso}`).then((t) => { const el = screen.querySelector('#tl'); if (el) el.innerHTML = timelineHtml(t, d.isToday); bindTimeline(screen, t); }).catch(() => { const el = screen.querySelector('#tl'); if (el) el.remove(); });

  // relatório da manhã: fechar até amanhã
  screen.querySelector('.mr-close')?.addEventListener('click', () => { ls.set('rec.morning', todayIso); screen.querySelector('.morning')?.remove(); });

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
    <header class="top"><h1>Ajustes</h1><a class="foot-link" href="#hoje">Voltar</a></header>
    <nav class="card set-list">
      <a href="#garmin">${ICON.heart}<span><b>Garmin</b><small id="set-garmin">Dados, conexão e o que falta completar</small></span><em>›</em></a>
      <a href="#tema">${ICON.sun}<span><b>Tema</b><small>Fundo e cartões</small></span><em>›</em></a>
    </nav>`;
  api('/api/diag').then((d) => {
    const miss = [d.dias.falta, d.horarios.falta, d.treinos.falta, d.zonas.states.pendente, d.zonas.states.erro, d.rec.falta].filter((x) => x > 0).length;
    const el = screen.querySelector('#set-garmin'); if (el && miss) el.textContent = `${miss} ${miss === 1 ? 'parte' : 'partes'} para completar`;
  }).catch(() => {});
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

function route() {
  const h = location.hash || '#hoje';
  document.querySelectorAll('.tab[href]').forEach((t) => {
    const on = t.getAttribute('href') === (h.startsWith('#relatorio/') ? '#prova' : h.startsWith('#tend/') ? '#tendencias' : h === '#garmin' || h === '#tema' || h === '#ajustes' || h.startsWith('#atv/') || h.startsWith('#card/') ? '#hoje' : h);
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
  else if (h === '#tendencias') renderTrends(page(), api);
  else if (h === '#treino') renderTrain(page(), api);
  else if (h === '#prova') renderRace(page(), api);
  else if (h.startsWith('#relatorio/')) renderReport(page(), api, h.slice(11));
  else if (h.startsWith('#tend/')) renderTrendDetail(page(), api, h.slice(6));
  else load();
}
window.addEventListener('hashchange', route);

// ao voltar para o app: recarrega (pega a noite se chegou e troca o dia se virou)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && (location.hash || '#hoje') === '#hoje') { autoTried = ''; dayOffset = 0; load(); }
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
route();
