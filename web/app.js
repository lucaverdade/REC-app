// REC — app. Sem framework.
import { renderTrends, zoneOfPct, FORM_ZONES } from './trends.js';
import { renderTrain } from './train.js';
import { renderRace } from './race.js';
import { reviewHtml } from './review.js';
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
    return `<circle cx="50" cy="50" r="40" class="rt-seg" style="stroke:var(${c});opacity:${cur && cur[2] === c ? 1 : 0.28}"
      stroke-dasharray="${(b - a) * RC} ${RC}" stroke-dashoffset="${-a * RC}"/>`;
  }).join('');
  if (rec == null) return segs;
  const ang = pos(rec) * 2 * Math.PI;
  return `${segs}<circle cx="${50 + 40 * Math.cos(ang)}" cy="${50 + 40 * Math.sin(ang)}" r="6" class="rt-mark" style="fill:var(${cur[2]})"/>`;
}

// anel de Strain com meta do dia: enche com o feito; tracinho na meta (2/3 da volta)
function strainRing(done, t) {
  const target = t.target;
  const scale = Math.max(target * 1.5, done);
  const f = Math.min(1, done / scale), tA = (target / scale) * 2 * Math.PI;
  const pct = target ? Math.round((done / target) * 100) : null;
  const left = Math.max(0, target - done);
  const why = [
    `Seu dia médio (Fitness): ${t.base}`,
    ...t.factors.map((x) => `${x.label}: ×${String(x.f).replace('.', ',')}`),
    t.week ? `Semana: teto ${t.week.hi}, feito até ontem ${t.week.doneBefore}, sobram ${t.week.room} para ${t.week.daysLeft} ${t.week.daysLeft === 1 ? 'dia' : 'dias'}${t.week.limited ? ' (limitou a meta)' : ''}` : null,
  ].filter(Boolean);
  return `<div class="st-card">
    <span class="st-ring">
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r="40" class="rt-track"/>
        <circle cx="50" cy="50" r="40" class="rt-arc st-arc" stroke-dasharray="${RC}" stroke-dashoffset="${RC}" data-target="${RC * (1 - f)}"/>
        <line x1="${50 + 33 * Math.cos(tA)}" y1="${50 + 33 * Math.sin(tA)}" x2="${50 + 49 * Math.cos(tA)}" y2="${50 + 49 * Math.sin(tA)}" class="st-tick"/>
      </svg>
      <span class="rt-val"><span>${pct ?? '–'}<small>%</small></span></span>
    </span>
    <div class="st-txt">
      <b>Strain ${done} <span>de ${target}</span></b>
      <span>${done >= target ? `Meta de hoje atingida${done > target * 1.15 ? `: ${done - target} acima` : ''}.` : `Cabem mais ${left} hoje.`}</span>
      ${t.plan != null ? `<small>Plano de hoje: ${t.plan}${t.planNote === 'acima' ? ' (acima da meta)' : t.planNote === 'abaixo' ? ' (bem abaixo da meta)' : ''}</small>` : ''}
      <details class="st-why"><summary>Como a meta foi calculada</summary><ul>${why.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>
        <p>Modo sombra: o plano do treinador manda.</p></details>
    </div>
  </div>`;
}

function ringTile({ id, value, frac = 0, color, label, sub, aria, segments }) {
  const f1 = Math.max(0, Math.min(1, frac)), f2 = Math.max(0, Math.min(1, frac - 1)); // segunda volta (Strain acima de 100%)
  return `<button type="button" class="rtile" data-ring="${id}" aria-label="${esc(aria)}" ${id === 'rec' ? 'aria-expanded="false" aria-controls="contrib"' : ''}>
    <span class="rt-ring">
      <svg viewBox="0 0 100 100" aria-hidden="true">
        ${segments ?? `<circle cx="50" cy="50" r="40" class="rt-track"/>
        <circle cx="50" cy="50" r="40" class="rt-arc" style="stroke:${color}" stroke-dasharray="${RC}" stroke-dashoffset="${RC}" data-target="${RC * (1 - f1)}"/>`}
        ${!segments && f2 > 0 ? `<circle cx="50" cy="50" r="40" class="rt-arc rt-lap" style="stroke:${color}" stroke-dasharray="${RC}" stroke-dashoffset="${RC}" data-target="${RC * (1 - f2)}"/>` : ''}
      </svg>
      <span class="rt-val"><span>${value}</span></span>
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
      <b class="c-fat">${l.fatigue}</b>
      <span class="ls-d ${dv > 0 ? 'bad' : dv < 0 ? 'good' : ''}">${fat}</span>
      ${spark((l.trend ?? []).slice(-14).map((x) => x.fatigue), 'var(--fatigue)')}
    </div>
    <div class="ls-row">
      <span class="ls-l"><i class="dot" style="background:var(--fitness)"></i>Fitness</span>
      <b class="c-fit">${l.fitness}</b>
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
      <b class="c-fat">${l.fatigue}</b>
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
function sleepCard(d) {
  const s = d.sleep, n = s.night, need = s.need;
  const pn = s.personalNeed ?? 7.5;
  const pct = n?.hours != null ? Math.min(1.25, n.hours / pn) : 0;
  const extra = [];
  if (need.fromDebt >= 1 / 60) extra.push(`dívida +${Math.round(need.fromDebt * 60)} min`);
  if (need.fromStrain >= 1 / 60) extra.push(`treino +${Math.round(need.fromStrain * 60)} min`);
  if (need.nap >= 1 / 60) extra.push(`cochilo −${Math.round(need.nap * 60)} min`);
  const r = s.regularity;
  return `
    <section class="sleep-card" aria-label="Sono">
      <div class="sl-head"><span class="sl-title">Sono</span>
        ${n?.start && n?.end ? `<span class="meta">${esc(n.start)} → ${esc(n.end)}</span>` : ''}</div>
      <div class="sl-main"><b>${hmm(n?.hours)}</b><span>de ${hmm(pn)} (sua necessidade)</span></div>
      <div class="sl-bar"><i style="width:${(pct / 1.25) * 100}%"></i><em style="left:${(1 / 1.25) * 100}%"></em></div>
      <div class="sl-stats">
        <div><span class="debt-${s.level?.key ?? 'nenhuma'}">${s.debt == null ? '–' : s.debt < 1 / 6 ? 'nenhuma' : hmm(s.debt)}</span><small>Dívida (14 dias)${s.level && s.level.key !== 'nenhuma' ? `, ${s.level.label}` : ''}</small></div>
        <div><span>${hmm(need.total)}</span><small>${d.isToday ? 'Meta para hoje à noite' : 'Meta para a noite seguinte'}${extra.length ? ` (${extra.join(', ')})` : ''}</small></div>
      </div>
      ${s.bedtime && d.isToday ? `<p class="sl-bed">Deitar até <b>${esc(s.bedtime.bedtime)}</b><span>para acordar por volta de ${esc(s.bedtime.wake)} com a meta de ${hmm(need.total)}</span></p>` : ''}
      ${r ? `<p class="sl-reg">Últimas ${r.nights} noites: deita por volta de <b>${r.bedtime}</b> (±${r.bedSd} min), acorda por volta de <b>${r.wake}</b> (±${r.wakeSd} min).${s.regularityScore != null ? ` Regularidade <b>${s.regularityScore}</b>/100.` : ''}</p>` : ''}
      ${s.napYesterday ? `<p class="sl-reg">Cochilo ${d.isToday ? 'ontem' : 'no dia anterior'}: <b>${Math.round(s.napYesterday * 60)} min</b> (conta na dívida).</p>` : ''}
      <details class="explain sl-exp"><summary>Como é calculado</summary>
        <p><b>Sua necessidade</b> é a média das suas últimas 90 noites, sem as 10% mais curtas e as 10% mais longas (como a Oura faz). Cochilos contam.</p>
        <p><b>Dívida</b>: nos últimos 14 dias, quanto você dormiu abaixo da sua necessidade, com as noites recentes pesando mais (uma noite curta perde metade do peso a cada 7 dias). Noites acima da necessidade e cochilos pagam a dívida. Faixas da Oura: baixa até 2 h, moderada de 2 a 5 h, alta acima de 5 h.</p>
        <p><b>Deitar até</b>: horário em que você costuma acordar (mediana das últimas noites do mesmo tipo de dia, útil ou fim de semana) − a meta − o tempo que você costuma ficar acordado na cama − 15 min para pegar no sono.</p>
        <p><b>Regularidade</b>: 100 menos a variação média dos horários de deitar e acordar nas últimas 14 noites (variação de 15 min ≈ 82; de 30 min ≈ 64).</p>
        <p><b>Meta de hoje</b>: sua necessidade + até 30 min por causa da dívida + até 30 min pelo treino do dia − cochilo de hoje (como o Whoop). Não é preciso pagar a dívida de uma vez: ela some aos poucos com noites um pouco mais longas, cochilos e o próprio tempo.</p>
      </details>
    </section>`;
}

// ---------- relatório da manhã (A1): primeira abertura do dia, até 12 h ----------
const ls = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
function morningHtml(d) {
  if (!d.isToday || new Date().getHours() >= 12 || ls.get('rec.morning') === d.date || d.rec == null) return '';
  const sg = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v);
  const n = d.sleep?.night, pn = d.sleep?.personalNeed;
  const pl = d.planned ?? [];
  const plTxt = pl.length ? pl.map((p) => `${esc(p.label)}${p.minutos ? ` ${p.minutos} min` : ''}${p.zona ? ` ${esc(p.zona)}` : ''}`).join(' · ') : 'Sem treino planejado';
  const prev = pl.reduce((a, p) => a + (p.strain ?? 0), 0);
  const rows = [
    ['REC', `<b style="color:${zoneVar(zoneOf(d.rec))}">${d.rec}</b>${d.day?.trend ? ` · ${esc(d.day.trend.txt.replace('REC ', ''))}` : ''}`],
    ['Noite', n?.hours != null ? `<b>${hmm(n.hours)}</b> de ${hmm(pn)}${d.sleep.debt >= 1 / 6 ? ` · dívida ${hmm(d.sleep.debt)}` : ''}` : '–'],
    d.hrvTrend ? ['HRV', `<b>${esc(d.hrvTrend.label)}</b> · 7 noites ${d.hrvTrend.mean7} ms (normal ${d.hrvTrend.lo}–${d.hrvTrend.hi})`] : null,
    d.load?.formPct != null ? ['Forma', `<b>${sg(d.load.formPct)}%</b> · ${esc(d.load.zone?.label ?? '')}`] : null,
    ['Treino', `${plTxt}${pl.length && d.day?.target ? `<br><span class="meta">Strain previsto ${prev}, meta ${d.day.target.target}</span>` : ''}`],
    d.alerts?.length ? ['Atenção', esc(d.alerts[0].text)] : null,
  ].filter(Boolean);
  return `<section class="morning" aria-label="Relatório da manhã">
    <div class="mr-head"><span>Bom dia · relatório da manhã</span><button type="button" class="mr-close" aria-label="Fechar">×</button></div>
    <ul class="mr-list">${rows.map(([k, v]) => `<li><span>${k}</span><span>${v}</span></li>`).join('')}</ul>
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
      ${raceTxt ? `<a class="race race-link" href="#prova" aria-label="${esc(raceTxt)}. Abrir o modo prova.">${esc(raceTxt)} ›</a>` : ''}
    </header>

    ${d.syncIssue ? `<a class="alert sync-alert" role="status" href="#garmin">${esc(d.syncIssue.text)} <em>Garmin ›</em></a>` : ''}

    ${morningHtml(d)}
    <div id="hoje-review"></div>

    ${d.race.raceWeek ? `<a class="race-banner" href="#prova"><span>Semana da prova</span><b>${d.race.days > 1 ? `${d.race.days} dias para Aracaju` : d.race.days === 1 ? 'Amanhã é dia de prova' : d.race.days === 0 ? 'Hoje é dia de prova' : 'Prova feita'}</b><em>Modo prova ›</em></a>` : ''}

    <section class="rings rings-2" aria-label="Estou pronto hoje?">
      ${ringTile({ id: 'rec', value: d.rec == null ? '–' : d.rec, segments: recSegments(d.rec),
        label: 'REC', sub: d.day?.trend ? `${d.day.trend.dir === 'up' ? '↑' : d.day.trend.dir === 'down' ? '↓' : '→'} ${d.day.trend.txt.replace('REC ', '')}` : '', aria: 'REC. Toque para ver o que compõe o número.' })}
      ${ringTile({ id: 'forma', value: d.load?.formPct == null ? '–' : `${d.load.formPct > 0 ? '+' : d.load.formPct < 0 ? '−' : ''}${Math.abs(d.load.formPct)}<small>%</small>`,
        segments: formSegments(d.load?.formPct), label: 'Forma', sub: shortZone(d.load?.zone?.key), aria: 'Forma. Toque para ver as tendências.' })}
    </section>

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

    <section class="block">
      <h2>${d.isToday ? 'Treino de hoje' : 'Treinos do dia'}</h2>
      ${d.day?.target ? strainRing(d.load?.strain ?? 0, d.day.target) : ''}
      ${d.planned?.length ? plannedHtml(d.planned, d.activities) : ''}
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

    ${d.habits ? `<section class="block habits">
      <h2>${d.isToday ? 'Diário de hoje' : 'Diário do dia'}</h2>
      <div class="hb-list">${d.habits.defs.map((h) => `<button type="button" class="hb" data-tag="${h.key}" aria-pressed="${d.habits.on.includes(h.key)}">${esc(h.label)}</button>`).join('')}</div>
      <p class="hb-note">Marque à noite o que aconteceu no dia. Conta para o REC de amanhã.</p>
    </section>` : ''}

    <div class="foot">
      <button class="sync" type="button" ${d.isToday ? '' : 'hidden'}>Atualizar dados</button>
      <span class="foot-links"><a class="foot-link" href="#prova">Modo prova</a><a class="foot-link" href="#garmin">Garmin</a><a class="foot-link" href="#tema">Tema</a></span>
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

async function load() {
  try {
    const date = addIso(isoToday(), -dayOffset);
    const d = await api(`/api/today?date=${date}`);
    render(d);
    const stale = d.minsSinceSync == null || d.minsSinceSync > 15;
    if (dayOffset === 0 && (d.needsSync || stale) && autoTried !== `${d.date}-${Math.floor(Date.now() / 900000)}`) {
      autoTried = `${d.date}-${Math.floor(Date.now() / 900000)}`;
      const sync = screen.querySelector('.sync');
      sync.disabled = true; sync.textContent = d.needsSync ? 'Buscando a noite na Garmin…' : 'Buscando treinos novos…';
      await api('/api/refresh?auto=1', { method: 'POST' }).catch(() => {});
      const d2 = await api(`/api/today?date=${date}`);
      render(d2);
      if (d2.needsSync) screen.querySelector('.sync').textContent = 'A noite ainda não chegou à Garmin. Sincronize o relógio e toque aqui.';
      else { const b = screen.querySelector('.sync'); if (b) { b.disabled = false; b.textContent = 'Atualizado agora'; } }
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
      <h2>Atualizar os últimos 90 dias</h2>
      <p class="note">Busca de novo os últimos 90 dias, inclusive dados que o app passou a guardar depois (horários de sono, cochilos).</p>
      <button class="btn ghost" id="refill" ${st.hasKey ? '' : 'disabled'}>Buscar 90 dias</button>
      <p class="progress" id="refill-out" aria-live="polite"></p>
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

  screen.querySelector('#refill').addEventListener('click', async (ev) => {
    const btn = ev.currentTarget, out = screen.querySelector('#refill-out');
    btn.disabled = true;
    const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));
    const today = st.hoje, chunks = [];
    for (let d = addDaysIso(today, -89); d <= today; d = addDaysIso(d, 14)) chunks.push([d, addDaysIso(d, 13) > today ? today : addDaysIso(d, 13)]);
    try {
      for (let i = 0; i < chunks.length; i++) {
        for (let tent = 1; ; tent++) {
          out.textContent = `Bloco ${i + 1} de ${chunks.length}…`;
          try { await api(`/api/garmin/backfill?from=${chunks[i][0]}&to=${chunks[i][1]}`, { method: 'POST' }); break; }
          catch (e) {
            if (!/limite|429/.test(e.message) || tent >= 15) throw e;
            for (let s = 60; s > 0; s--) { out.textContent = `A Garmin pediu uma pausa. Retomando em ${s} s…`; await sleepMs(1000); }
          }
        }
        await sleepMs(1500);
      }
      await api(`/api/recompute?to=${today}&keep=60`, { method: 'POST' });
      out.textContent = 'Pronto.';
    } catch (e) { out.textContent = `Parou: ${errText(e)}`; }
    btn.disabled = false;
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
    <header class="top"><h1>Tema</h1><a class="foot-link" href="#hoje">Voltar</a></header>
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
    const on = t.getAttribute('href') === (h === '#garmin' || h === '#tema' ? '#hoje' : h);
    t.classList.toggle('is-active', on || (h === '#prova' && t.getAttribute('href') === '#hoje'));
    if (on) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current');
  });
  window.scrollTo(0, 0);
  if (h === '#garmin') renderGarmin();
  else if (h === '#tema') renderTheme();
  else if (h === '#tendencias') renderTrends(screen, api);
  else if (h === '#treino') renderTrain(screen, api);
  else if (h === '#prova') renderRace(screen, api);
  else load();
}
window.addEventListener('hashchange', route);

// ao voltar para o app: recarrega (pega a noite se chegou e troca o dia se virou)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && (location.hash || '#hoje') === '#hoje') { autoTried = ''; dayOffset = 0; load(); }
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
route();
