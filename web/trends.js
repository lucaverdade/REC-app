// Aba Tendências: períodos de calendário (semana seg–dom, mês, 3 e 6 meses, 1 ano) com navegação.
import { fmtDay, lineChart, nf } from './charts.js';
import { projHtml, heatHtml } from './race.js';
import { ICON, cardHead, readyColor, heroRing, animateRings, readyStops, countUp } from './ui.js';

const UNITS = [['semana', 'Semana'], ['mes', 'Mês'], ['3m', '3 meses'], ['6m', '6 meses'], ['ano', '1 ano']];
const SPORTS = ['bike', 'corrida', 'natacao', 'hyrox', 'academia', 'outro'];
const SPORT_LABEL = { bike: 'Bike', corrida: 'Corrida', natacao: 'Natação', hyrox: 'Hyrox', academia: 'Academia', outro: 'Outro' };
export const FORM_ZONES = [
  { max: -30, key: 'risco', label: 'Muito cansado' },
  { max: -10, key: 'produtivo', label: 'Em bloco de treino' },
  { max: 5, key: 'neutro', label: 'Equilibrado' },
  { max: 20, key: 'descansado', label: 'Descansado' },
  { max: Infinity, key: 'perdendo', label: 'Perdendo forma' },
];
export const zoneOfPct = (p) => (p == null ? null : FORM_ZONES.find((z) => p < z.max));

let unit = 'semana', offset = 0; // período de 'Como treinei?'
try { unit = localStorage.getItem('rec.unit') || 'semana'; if (!UNITS.some(([u]) => u === unit)) unit = 'semana'; } catch {}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const signed = (v, d = 0) => (v == null ? '–' : (v > 0 ? '+' : v < 0 ? '−' : '') + nf(Math.abs(v), d));
const zoneVar = (r) => (r == null ? null : r <= 33 ? 'var(--rec-red)' : r <= 66 ? 'var(--rec-yellow)' : 'var(--rec-green)');
const hm = (h) => { if (h == null) return '–'; const m = Math.round(h * 60); return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`; };
const legend = (keys) => `<div class="legend">${keys.map((k) => `<span><i class="dot s-${k}"></i>${SPORT_LABEL[k]}</span>`).join('')}</div>`;
const row = (k, v) => `<div><span>${k}</span><b>${v}</b></div>`;

const ZSHORT = ['Abaixo Z1', 'Z1', 'Z2', 'Z3', 'Z4', 'Z5'];
const ZONE_NAMES = ['Abaixo da Z1', 'Z1 Aquecimento', 'Z2 Leve', 'Z3 Aeróbico', 'Z4 Limiar', 'Z5 Máximo'];
function periodTitle(d) {
  const o = { day: 'numeric', month: 'short' };
  const a = new Date(d.start + 'T12:00:00'), b = new Date(d.end + 'T12:00:00');
  if (d.unit === 'mes') { const t = a.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }); return t.charAt(0).toUpperCase() + t.slice(1); }
  const yr = a.getFullYear() !== b.getFullYear() || b.getFullYear() !== new Date().getFullYear();
  const f = (x) => x.toLocaleDateString('pt-BR', yr ? { ...o, year: 'numeric' } : o).replace(/\./g, '');
  const prefix = d.unit === 'semana' && d.offset === 0 ? 'Esta semana, ' : '';
  return `${prefix}${f(a)} – ${f(b)}`;
}

// Tendências (04/11, v2): uma tela inicial com o resumo e uma lista de métricas agrupadas; cada uma abre na própria tela.
// Antes eram 2 abas com 11 blocos sanfonados: difícil achar o que se queria.
const SECS = {
  recov: ['Prontidão e REC', 'REC, HRV, FC de repouso e sono contra o seu normal', (b, a) => recovery(b, a), 'heart', 'var(--rec-green)'],
  hrvt: ['Tendência do HRV', 'Adaptando bem ou acumulando fadiga', (b, a) => hrvTrendSec(b, a), 'heart', 'var(--hrv)'],
  stress31: ['Estresse acumulado', 'O último mês contra o seu normal', (b, a) => stressSec(b, a), 'moon', 'var(--warn)'],
  habs: ['O que mexe no meu REC', 'Hábitos do diário e horário de sono', (b, a) => habits(b, a), 'book', 'var(--accent)'],
  calib: ['O REC acerta?', 'REC e Prontidão × "como me sinto"', (b, a) => calibSec(b, a), 'smile', 'var(--accent)'],
  sw: ['Strain semanal', 'Quanto treinei por semana, contra a sua faixa', (b, a) => strainWeeks(b, a), 'bolt', 'var(--strain)'],
  evo: ['Fitness, Fadiga e Forma', 'Estou evoluindo?', (b, a) => evolve(b, a), 'trend', 'var(--fitness)'],
  zones: ['Zonas de treino', 'Tempo em cada zona de FC, por modalidade', (b, a) => zonesSec(b, a), 'flame', '#86c3f2'],
  vol: ['Volume', 'Horas por modalidade e intensidade', (b, a) => volume(b, a), 'stopwatch', 'var(--text-2)'],
  focus: ['Foco da carga', 'Leve, forte ou anaeróbico nas últimas 4 semanas', (b, a) => focusSec(b, a), 'flame', '#ff8a5c'],
  fage: ['VO2máx e idade fitness', 'Números da Garmin', (b, a) => fageSec(b, a), 'run', 'var(--pred)'],
  year: ['O ano em quadradinhos', 'Um quadrado por dia: REC, Strain ou sono', (b, a) => yearSec(b, a), 'clock', 'var(--accent)'],
};

// ---------- aba Corpo (04/11, v3): painel rolável, gráficos à vista, um seletor de período para todos ----------
const BODY_PER = [[7, '7D'], [30, '1M'], [91, '3M'], [182, '6M'], [365, '1A']];
let bodyDays = (() => { try { return Number(localStorage.getItem('rec.bodyDays')) || 30; } catch { return 30; } })();
export async function renderTrends(screen, api) {
  document.documentElement.style.setProperty('--rec', 'var(--text-3)');
  screen.innerHTML = `
    <header class="top"><h1>Corpo</h1></header>
    <div class="seg body-per" role="tablist">${BODY_PER.map(([d, l]) => `<button role="tab" data-bd="${d}" aria-selected="${d === bodyDays}">${l}</button>`).join('')}</div>
    <section class="bh" id="b-sum"><p class="empty">Carregando…</p></section>
    <div class="b-minis" id="b-minis"></div>
    <section class="card rise" style="--i:2" id="b-ready"></section>
    <section class="card rise" style="--i:3" id="b-hrv"></section>
    <section class="card rise" style="--i:4" id="b-rhr"></section>
    <section class="card rise" style="--i:5" id="b-sleep"></section>
    <section class="card rise" style="--i:6">${cardHead('moon', 'Estresse acumulado', { color: 'var(--warn)' })}<div class="block" id="stress31"></div></section>
    <section class="card rise" style="--i:7">${cardHead('book', 'O que mexe no meu REC', { color: 'var(--accent)' })}<div class="block" id="habs"></div></section>
    <section class="card rise" style="--i:8">${cardHead('clock', 'O ano em quadradinhos', { color: 'var(--accent)' })}<div class="block" id="year"></div></section>`;
  screen.querySelectorAll('[data-bd]').forEach((b) => b.addEventListener('click', () => {
    bodyDays = Number(b.dataset.bd); try { localStorage.setItem('rec.bodyDays', String(bodyDays)); } catch {}
    screen.querySelectorAll('[data-bd]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    bodyCharts(screen, api);
  }));
  bodyCharts(screen, api);
  stressSec(screen, api); habits(screen, api); yearSec(screen, api);
}

async function bodyCharts(screen, api) {
  const n = bodyDays, per = BODY_PER.find((x) => x[0] === n)?.[1] ?? '';
  let t, rs, h;
  try { [t, rs, h] = await Promise.all([longtrend(api, Math.max(28, n)), api(`/api/ready-series?days=${n}`), api('/api/hrvtrend').catch(() => null)]); }
  catch (e) { screen.querySelector('#b-sum').innerHTML = `<p class="empty">Não carregou: ${esc(e.message)}</p>`; return; }
  const days = t.days.slice(-n), dates = days.map((x) => x.date), sm = t.summary, need = t.sleepNeed;
  const avg = (v) => { const x = v.filter((y) => y != null); return x.length ? x.reduce((a, b) => a + b, 0) / x.length : null; };
  const rd = rs.days, rDates = rd.map((x) => x.date);
  const aR = avg(rd.map((x) => x.ready)), aRec = avg(rd.map((x) => x.rec));
  const v = t.verdict;
  // topo (05/11): anel da nota média do período + o veredito; embaixo, três anéis = quanto do período ficou no seu normal
  const arrow = v ? (v.trend === 'melhorando' ? '↑' : v.trend === 'piorando' ? '↓' : '→') : '';
  screen.querySelector('#b-sum').innerHTML = `<div class="bh-row rise" style="--i:0">
      ${heroRing({ frac: (aR ?? 0) / 100, text: aR == null ? '–' : Math.round(aR), count: aR == null ? null : Math.round(aR), unit: '%', stops: aR == null ? ['var(--text-3)', 'var(--text-3)'] : readyStops(aR), size: 'md', empty: aR == null,
        sub: `média · ${per}${aRec != null ? ` · REC ${Math.round(aRec)}` : ''}` })}
    </div>
    ${v ? `<div class="bh-txt rise" style="--i:1"><p class="b-ans">${esc(v.answer)}</p><p class="b-trend">${arrow} ${esc(v.trendTxt)}</p>
      ${v.reasons.length ? `<ul class="v-sig">${v.reasons.slice(0, 3).map((g) => `<li class="${g.bad ? 'bad' : 'ok'}"><b>${g.bad ? '!' : '✓'}</b>${esc(g.txt)}</li>`).join('')}</ul>` : ''}</div>`
      : '<p class="empty">Ainda sem dados suficientes.</p>'}`;
  const share = (xs, ok) => { const v2 = xs.filter((x) => ok(x) != null); return v2.length ? v2.filter((x) => ok(x)).length / v2.length : null; };
  const pHrv = share(days, (x) => (x.hrv == null || x.hrvLo == null ? null : x.hrv >= x.hrvLo));
  const pRhr = share(days, (x) => (x.rhr == null || x.rhrHi == null ? null : x.rhr <= x.rhrHi));
  const pSl = share(days, (x) => (x.sleep == null ? null : x.sleep >= need - 0.5));
  const mean = (k) => avg(days.map((x) => x[k]));
  const mini = (id, lab, val, unit, f, color, stops) => `<a class="b-mini rise" style="--i:1" href="#${id}" data-jump="${id}">${heroRing({ frac: f ?? 0, text: val, unit, color, stops, size: 'xs', empty: f == null })}
    <b>${lab}</b><small>${f == null ? 'sem dados' : `${Math.round(f * 100)}% no normal`}</small></a>`;
  screen.querySelector('#b-minis').innerHTML =
    mini('b-hrv', 'HRV', mean('hrv') == null ? '–' : Math.round(mean('hrv')), 'ms', pHrv, 'var(--hrv)')
    + mini('b-rhr', 'FC repouso', mean('rhr') == null ? '–' : nf(mean('rhr'), 0), 'bpm', pRhr, 'var(--rhr)')
    + mini('b-sleep', 'Sono', hm(mean('sleep')).replace(/\s/g, ''), '', pSl, 'var(--sleep)', ['#5d4fd1', '#9d8cff', '#cfc6ff']);
  screen.querySelectorAll('[data-jump]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); screen.querySelector(`#${a.dataset.jump}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }));

  const head = (sel, icon, title, color, big, sub) => `${cardHead(icon, title, { color })}<div class="b-big"><b>${big}</b><small>${sub}</small></div><div class="b-chart"></div>`;
  const box = (id) => screen.querySelector(id);
  box('#b-ready').innerHTML = `${cardHead('bolt', 'Nota do dia e REC', { color: aR == null ? 'var(--text-2)' : readyColor(aR) })}<div class="b-chart"></div>`;
  bandLine(box('#b-ready .b-chart'), { dates: rDates, values: rd.map((x) => x.ready), color: 'rgba(179,167,230,.9)', min: 0, max: 100, height: 120, axes: 'x',
    dots: (val) => readyColor(val), extra: [{ values: rd.map((x) => x.rec), color: 'rgba(255,255,255,.28)', width: 1 }], label: 'Nota do dia',
    tip: (i) => row('Nota do dia', rd[i].ready == null ? '–' : `${rd[i].ready}%`) + row('REC', rd[i].rec ?? '–') + row('Strain', rd[i].strain) });
  box('#b-ready').insertAdjacentHTML('beforeend', '<p class="b-leg"><span><i style="background:#b3a7e6"></i>Nota do dia</span><span><i style="background:rgba(255,255,255,.35)"></i>REC</span></p>');

  const hv = avg(days.map((x) => x.hrv)), hb = avg(days.map((x) => x.hrvBase));
  box('#b-hrv').innerHTML = head('#b-hrv', 'heart', 'HRV', 'var(--hrv)', hv == null ? '–' : `${Math.round(hv)}<i> ms</i>`, `média · ${per}${hb ? ` · base ${Math.round(hb)} ms` : ''}${h?.label ? ` · ${h.label.toLowerCase()}` : ''}`);
  bandLine(box('#b-hrv .b-chart'), { dates, values: days.map((x) => x.hrv), lo: days.map((x) => x.hrvLo), hi: days.map((x) => x.hrvHi), base: days.map((x) => x.hrvBase), color: 'var(--hrv)', height: 120, axes: 'x', label: 'HRV',
    tip: (i) => row('HRV', `${nf(days[i].hrv)} ms`) + row('Faixa normal', `${nf(days[i].hrvLo)}–${nf(days[i].hrvHi)}`) });

  const rv = avg(days.map((x) => x.rhr)), rb = avg(days.map((x) => x.rhrBase));
  box('#b-rhr').innerHTML = head('#b-rhr', 'heart', 'FC de repouso', 'var(--rhr)', rv == null ? '–' : `${nf(rv, 1)}<i> bpm</i>`, `média · ${per}${rb ? ` · base ${nf(rb, 1)} bpm` : ''}`);
  bandLine(box('#b-rhr .b-chart'), { dates, values: days.map((x) => x.rhr), lo: days.map((x) => x.rhrLo), hi: days.map((x) => x.rhrHi), base: days.map((x) => x.rhrBase), color: 'var(--rhr)', height: 110, axes: 'x', label: 'FC de repouso',
    tip: (i) => row('FC', `${nf(days[i].rhr)} bpm`) + row('Faixa normal', `${nf(days[i].rhrLo)}–${nf(days[i].rhrHi)}`) });

  const sv = avg(days.map((x) => x.sleep)), short = days.filter((x) => x.sleep != null && x.sleep < need - 0.5).length, nights = days.filter((x) => x.sleep != null).length;
  box('#b-sleep').innerHTML = head('#b-sleep', 'moon', 'Sono', 'var(--sleep)', hm(sv), `média · ${per} · base ${hm(need)} · ${short} de ${nights} noites com mais de 30 min a menos`);
  bandLine(box('#b-sleep .b-chart'), { dates, values: days.map((x) => x.sleep), bars: true, color: 'var(--sleep)', min: 0, ref: need, refLabel: hm(need), height: 110, axes: 'x', label: 'Sono',
    barColor: (val) => (val < need - 0.5 ? 'color-mix(in srgb, var(--sleep) 45%, #000)' : 'var(--sleep)'), tip: (i) => row('Sono', hm(days[i].sleep)) });
  box('#b-sleep').insertAdjacentHTML('beforeend', `<a class="b-link" href="#sono/${new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10)}">Ver a última noite em detalhe ›</a>`);
  animateRings(screen); countUp(screen);
}

// ---------- Treino → Evolução (04/11): tudo de treino em cartões abertos ----------
export async function renderEvolution(box, api) {
  const C = (id, icon, title, color) => `<section class="card">${cardHead(icon, title, { color })}<div class="block" id="${id}"></div></section>`;
  box.innerHTML = `
    ${C('sw', 'bolt', 'Strain semanal', 'var(--strain)')}
    ${C('evo', 'trend', 'Fitness, Fadiga e Forma', 'var(--fitness)')}
    ${C('scat', 'bolt', 'Strain × Prontidão', '#b3a7e6')}
    ${C('zones', 'flame', 'Zonas de treino', '#86c3f2')}
    ${C('vol', 'stopwatch', 'Volume', 'var(--text-2)')}
    ${C('focus', 'flame', 'Foco da carga', '#ff8a5c')}
    ${C('fage', 'run', 'VO2máx e idade fitness', 'var(--pred)')}`;
  strainWeeks(box, api); evolve(box, api); scatterSec(box, api); zonesSec(box, api); volume(box, api); focusSec(box, api); fageSec(box, api);
}

// Strain × Prontidão (04/11, v2 mais simples): quanto você costuma treinar quando acorda com Prontidão baixa, média ou alta
async function scatterSec(box, api) {
  const sec = box.querySelector('#scat'); if (!sec) return;
  sec.innerHTML = '<p class="empty">Carregando…</p>';
  let d; try { d = await api('/api/ready-series?days=182'); } catch (e) { sec.innerHTML = `<p class="empty">Não carregou: ${esc(e.message)}</p>`; return; }
  const pts = d.days.filter((x) => x.ready != null);
  if (pts.length < 10) { sec.innerHTML = '<p class="empty">Poucos dias com Prontidão ainda.</p>'; return; }
  const grp = (lo, hi) => { const g = pts.filter((p) => p.ready >= lo && p.ready <= hi && p.strain > 0); return { n: g.length, s: g.length ? Math.round(g.reduce((a, p) => a + p.strain, 0) / g.length) : null }; };
  const G = [['Baixa', 0, 33, 17], ['Média', 34, 66, 50], ['Alta', 67, 100, 84]].map(([l, lo, hi, mid]) => ({ l, lo, hi, c: readyColor(mid), ...grp(lo, hi) }));
  const max = Math.max(...G.map((g) => g.s ?? 0), 1);
  const last = pts[pts.length - 1], cur = G.find((g) => last.ready >= g.lo && last.ready <= g.hi);
  sec.innerHTML = `
    <p class="sp-q">Quanto você costuma treinar no dia, conforme a Prontidão da manhã</p>
    <ul class="sp-bars">${G.map((g) => `<li class="${g === cur ? 'on' : ''}"><span class="sp-l"><b style="color:${g.c}">${g.l}</b><small>${g.lo}–${g.hi}%</small></span>
      <span class="sp-t"><i style="width:${g.s ? (g.s / max) * 100 : 0}%;background:${g.c}"></i></span><span class="sp-v"><b>${g.s ?? '–'}</b><small>${g.n} dias</small></span></li>`).join('')}</ul>
    <p class="note">Strain médio nos dias com treino, últimos 6 meses. ${cur ? `Hoje a Prontidão está <b>${cur.l.toLowerCase()}</b> (${last.ready}%): nesses dias você costuma fazer Strain por volta de <b>${cur.s ?? '–'}</b>.` : ''}</p>`;
}

/** Uma métrica na própria tela (#tend/<id>). */
export function renderTrendDetail(screen, api, id) {
  document.documentElement.style.setProperty('--rec', 'var(--text-3)');
  const S = SECS[id]; if (!S) { location.hash = '#tendencias'; return; }
  const back = id === 'calib' ? ['#ajustes', 'Ajustes'] : ['#tendencias', 'Corpo'];
  screen.innerHTML = `<header class="top"><a class="back-link" href="${back[0]}">‹ ${back[1]}</a></header>
    <h1 class="td-title"><i class="ts-ic" style="--ic:${S[4]}">${ICON[S[3]] ?? ''}</i>${S[0]}</h1><p class="td-sub">${S[1]}</p>
    <section class="block" id="${id}"></section>`;
  S[2](screen, api);
}

// zonas de treino (estilo Strava): barras por zona, faixas de FC, período e comparação com o período anterior
const ZL = ['abaixo da Z1', 'Z1', 'Z2', 'Z3', 'Z4', 'Z5'];
let zSport = 'todas', zDays = 30;
async function zonesSec(box, api) {
  const sec = box.querySelector('#zones');
  const SP = [['todas', 'Todas'], ['corrida', 'Corrida'], ['bike', 'Bike'], ['natacao', 'Natação']];
  const PER = [[7, '7D'], [30, '1M'], [90, '3M'], [180, '6M'], [365, '1A']];
  const COL = ['#3a3d47', '#cfe0f5', '#9fc2ee', '#6fa3e6', '#4a7fd6', '#2f5bb8'];
  sec.innerHTML = '<p class="empty">Carregando…</p>';
  let d; try { d = await api(`/api/zones-dist?sport=${zSport}&days=${zDays}`); } catch (e) { sec.innerHTML = `<p class="empty">Não carregou: ${esc(e.message)}</p>`; return; }
  const c = d.cur, p = d.prev, top = c.pct.indexOf(Math.max(...c.pct));
  const diff = c.total && p.total ? Math.round(c.pct[top] - p.pct[top]) : null;
  const fmtD = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }).replace('.', '');
  const hh = (m) => (m >= 60 ? `${Math.floor(m / 60)} h ${String(Math.round(m % 60)).padStart(2, '0')}` : `${Math.round(m)} min`);
  const maxP = Math.max(...c.pct, 1);
  sec.innerHTML = `
    <div class="zs-chips">${SP.map(([k, l]) => `<button type="button" data-zs="${k}" aria-pressed="${k === zSport}">${l}</button>`).join('')}</div>
    ${c.total ? `<div class="zs-head"><div><b>${nf(c.pct[top], 0)}% em ${ZL[top] === 'abaixo da Z1' ? 'abaixo da Z1' : ZL[top]}</b><small>${fmtD(d.from)} – hoje · ${hh(c.total)} em ${c.n} ${c.n === 1 ? 'treino' : 'treinos'}</small></div>
      ${diff != null ? `<div class="zs-diff ${diff > 0 ? 'up' : diff < 0 ? 'dn' : ''}"><b>${diff > 0 ? '▲' : diff < 0 ? '▼' : '='} ${Math.abs(diff)} pts</b><small>vs. período anterior</small></div>` : ''}</div>
    <ul class="zs-bars">${[5, 4, 3, 2, 1, 0].map((i) => `<li><span class="zs-l">${i === 0 ? '&lt;Z1' : 'Z' + i}</span><span class="zs-t"><i style="width:${(c.pct[i] / maxP) * 100}%;background:${COL[i]}"></i><b>${nf(c.pct[i], 0)}%</b></span><span class="zs-r">${d.ranges ? esc(d.ranges[i]) : ''}</span></li>`).join('')}</ul>
    ${d.ranges ? '<p class="zs-unit">bpm · zonas atuais do seu Garmin' + (zSport === 'todas' ? ' (padrão)' : '') + '</p>' : ''}`
    : '<p class="empty">Sem treinos com zonas de FC neste período.</p>'}
    <div class="seg seg-sm zs-per">${PER.map(([k, l]) => `<button role="tab" data-zd="${k}" aria-selected="${k === zDays}">${l}</button>`).join('')}</div>
    ${c.total && p.total ? `<p class="zs-note">Período anterior (${fmtD(addIsoT(d.from, -zDays))} – ${fmtD(addIsoT(d.from, -1))}): ${[0, 1, 2, 3, 4, 5].filter((i) => p.pct[i] >= 1).map((i) => `${ZL[i]} ${nf(p.pct[i], 0)}%`).join(' · ')}.</p>` : ''}`;
  sec.querySelectorAll('[data-zs]').forEach((b) => b.addEventListener('click', () => { zSport = b.dataset.zs; zonesSec(box, api); }));
  sec.querySelectorAll('[data-zd]').forEach((b) => b.addEventListener('click', () => { zDays = Number(b.dataset.zd); zonesSec(box, api); }));
}
const addIsoT = (iso, n) => { const t = new Date(iso + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };

let liCache = null;
const loadInsights = (api) => (liCache ??= api('/api/load-insights').catch((e) => { liCache = null; throw e; }));

// I1 · Foco da carga
async function focusSec(box, api) {
  const sec = box.querySelector('#focus');
  sec.innerHTML = '<p class="empty">Carregando…</p>';
  let d; try { d = await loadInsights(api); } catch (e) { sec.innerHTML = `<p class="empty">Não carregou: ${esc(e.message)}</p>`; return; }
  const f = d.focus;
  if (!f) { sec.innerHTML = '<p class="empty">Sem treinos com zonas nas últimas 4 semanas.</p>'; return; }
  const ROWS = [['low', 'Aeróbico leve', 'abaixo da Z1 a Z2', 'var(--z-descansado)'], ['high', 'Aeróbico forte', 'Z3 e Z4', '#2fbf8f'], ['ana', 'Anaeróbico', 'Z5', '#ff8a5c']];
  const ST = { falta: 'falta', ok: 'na faixa', sobra: 'sobra' };
  sec.innerHTML = `
    <p class="headline">${esc(f.txt)}</p>
    <div class="fc-rows">${ROWS.map(([k, l, zz, c]) => {
      const [lo, hi] = f.ref[k];
      return `<div class="fc-row fc-${f.status[k]}"><div class="fc-top"><span>${l} <small>${zz}</small></span><b>${f.pct[k]}%</b><em>${ST[f.status[k]]}</em></div>
        <div class="fc-bar"><span class="fc-ref" style="left:${lo}%;width:${hi - lo}%"></span><i style="width:${f.pct[k]}%;background:${c}"></i></div></div>`;
    }).join('')}</div>
    <p class="note">Parte do Strain das últimas 4 semanas em cada tipo de esforço. A faixa clara é a referência para endurance em fase de construção (adaptada do "Foco da carga" da Garmin): leve 55–75%, forte 20–40%, anaeróbico 3–12%. Na semana da prova o leve sobe naturalmente.</p>`;
}

// I5 · Estresse acumulado
async function stressSec(box, api) {
  const sec = box.querySelector('#stress31');
  sec.innerHTML = '<p class="empty">Carregando…</p>';
  let d; try { d = await api('/api/stress31'); } catch (e) { sec.innerHTML = `<p class="empty">Não carregou: ${esc(e.message)}</p>`; return; }
  if (!d) { sec.innerHTML = '<p class="empty">Precisa de pelo menos 10 dias de dados no último mês.</p>'; return; }
  const ST = { ok: ['no normal', ''], atencao: ['atenção', 'c-warn'], pesando: ['pesando', 'c-bad'], sem: ['sem dados', ''] };
  sec.innerHTML = `
    <p class="headline">Estresse acumulado <b class="sx-${d.level}">${esc(d.label.toLowerCase())}</b> nos últimos 31 dias.</p>
    <div class="sx-grid">${d.contributors.map((c) => `<span class="sx-c sx-${c.state}"><b>${esc(c.label.replace(' (Garmin)', '').replace(' (Fadiga acima do Fitness)', ''))}</b><small>${ST[c.state][0]}${c.k === 'reg' && c.pct != null ? ` · ${c.pct}% irregulares` : ''}${c.k === 'carga' ? ` · ${c.days} de 31 dias` : ''}</small></span>`).join('')}</div>
    <details class="explain"><summary>Como é calculado</summary>
      <p>Inspirado no "Estresse acumulado" da Oura: olha o mês inteiro, não o dia. Junta a média de 31 dias de HRV, sono, estresse da Garmin e FC de repouso contra o seu normal (os mesmos sinais do REC), o aumento de noites com horário irregular e os dias com Fadiga acima do Fitness.</p>
      <p>Baixo: o mês está no seu normal. Moderado: algum sinal pesando há semanas. Alto: vários sinais abaixo do normal por muito tempo, quando o risco de desgaste e de ficar doente sobe.</p>
    </details>`;
}

// I6 · Idade fitness e VO2máx (Garmin)
async function fageSec(box, api) {
  const sec = box.querySelector('#fage');
  sec.innerHTML = '<p class="empty">Carregando…</p>';
  let d; try { d = await api('/api/fitness-age'); } catch (e) { sec.innerHTML = `<p class="empty">Não carregou: ${esc(e.message)}</p>`; return; }
  const fa = d.fitnessAge;
  const last = (xs) => (xs.length ? xs[xs.length - 1] : null);
  const first90 = (xs) => { const lim = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10); return xs.find((x) => x.date >= lim) ?? null; };
  const row = (sp, l) => { const xs = d.vo2[sp]; const a = last(xs), b = first90(xs); if (!a) return ''; const dv = b ? Math.round((a.vo2 - b.vo2) * 10) / 10 : null;
    return `<li><span>VO2máx ${l}</span><span class="meta"><b>${nf(a.vo2)}</b>${dv ? ` · ${dv > 0 ? '+' : '−'}${nf(Math.abs(dv), 1)} em 3 meses` : ''}</span></li>`; };
  const vo2 = row('corrida', 'corrida') + row('bike', 'bike');
  sec.innerHTML = `
    ${fa?.fitnessAge != null ? `<p class="headline">Idade fitness <b>${nf(fa.fitnessAge)}</b>${fa.chronologicalAge ? ` (idade real ${nf(fa.chronologicalAge)})` : ''}${fa.achievable ? `. Possível chegar a ${nf(fa.achievable)}.` : '.'}</p>` : `<p class="note">${fa?.error ? `A Garmin não entregou a idade fitness (${esc(fa.error)}).` : 'Idade fitness indisponível.'}</p>`}
    ${vo2 ? `<ul class="acts">${vo2}</ul>` : '<p class="note">Os treinos ainda não trouxeram o VO2máx da Garmin. Garmin → Buscar 90 dias preenche os anteriores.</p>'}
    <p class="note">Calculados pela Garmin: a idade fitness usa VO2máx, FC de repouso, minutos intensos e peso; o VO2máx vem das corridas e pedais ao ar livre com FC (e potência na bike). Atualiza uma vez por mês (idade) e a cada treino (VO2máx).</p>`;
}

// Calibração: REC × nota "como me sinto"
// conferência mensal automática (backtest de 12 meses): uma linha por mês e aviso se algo piorou
function calibLogHtml(log) {
  if (!log.length) return '';
  const last = log[log.length - 1], prev = log[log.length - 2];
  const warn = [];
  if (last.feel.n >= 15 && last.feel.rhoReady != null && last.feel.rhoRec != null && last.feel.rhoReady < last.feel.rhoRec - 0.1) warn.push('a Prontidão está acompanhando como você se sente pior que o REC sozinho: hora de recalibrar os pesos');
  if (prev && last.feel.rhoReady != null && prev.feel.rhoReady != null && last.feel.rhoReady < prev.feel.rhoReady - 0.15) warn.push('a concordância da Prontidão caiu desde o mês passado');
  if (Math.abs(last.ready.sd - last.rec.sd) > 6) warn.push('a Prontidão está espalhando os números bem diferente do REC');
  const mm = (m) => { const [y, mo] = m.split('-'); return `${['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][Number(mo) - 1]}/${y.slice(2)}`; };
  return `<h3 class="dg-h3">Conferência mensal (12 meses)</h3>
    ${warn.length ? `<p class="alert">${esc(warn.join('; ').replace(/^./, (c) => c.toUpperCase()))}.</p>` : ''}
    <ul class="acts">${log.slice(-6).reverse().map((x) => `<li><span>${mm(x.month)}</span><span class="meta">REC ${nf(x.rec.mean, 0)} ± ${nf(x.rec.sd, 0)} · Prontidão ${nf(x.ready.mean, 0)} ± ${nf(x.ready.sd, 0)}${x.feel.n ? ` · sentir: REC ${x.feel.rhoRec == null ? '–' : nf(x.feel.rhoRec, 2)}, Prontidão ${x.feel.rhoReady == null ? '–' : nf(x.feel.rhoReady, 2)} (${x.feel.n})` : ''}</span></li>`).join('')}</ul>
    <p class="note">Roda sozinha no começo de cada mês com os últimos 12 meses: média e dispersão do REC e da Prontidão e quanto cada um acompanha o "como me sinto".</p>`;
}

async function calibSec(box, api) {
  const sec = box.querySelector('#calib');
  sec.innerHTML = '<p class="empty">Carregando…</p>';
  let d, bt = null; try { [d, bt] = await Promise.all([api('/api/calibration'), api('/api/backtest').catch(() => null)]); } catch (e) { sec.innerHTML = `<p class="empty">Não carregou: ${esc(e.message)}</p>`; return; }
  const SN = { hrv: 'HRV', sleep: 'Sono', rhr: 'FC de repouso', resp: 'Respiração', stress: 'Estresse' };
  const pctDone = Math.min(100, Math.round((d.withRec / d.target) * 100));
  const read = d.rho == null ? '' : d.rho >= 0.5 ? 'o REC acompanha bem como você se sente' : d.rho >= 0.3 ? 'o REC acompanha em parte como você se sente' : d.rho >= 0.1 ? 'relação fraca entre o REC e como você se sente' : 'o REC ainda não acompanha como você se sente';
  sec.innerHTML = `
    <p class="headline">${d.withRec} de ${d.target} notas "como me sinto" com REC.${d.withRec >= 15 && d.rho != null ? ` Concordância ${nf(d.rho, 2)}: ${read}.` : ' Com 15 notas aparece a primeira leitura.'}</p>
    <div class="wk-bar"><i style="width:${pctDone}%"></i></div>
    ${d.withRec >= 15 ? `<ul class="acts">${d.groups.filter((g) => g.n).map((g) => `<li><span>Dias em que se sentiu ${esc(g.label.toLowerCase())}</span><span class="meta">REC médio <b>${g.rec}</b> · ${g.n} dias</span></li>`).join('')}</ul>
      <p class="note">Sinal que mais acompanha a sua nota: ${d.signals.filter((x) => x.rho != null).sort((a, b) => b.rho - a.rho).slice(0, 2).map((x) => `${SN[x.k]} (${nf(x.rho, 2)})`).join(', ') || '–'}.</p>` : ''}
    ${d.withRec >= 15 && d.ready?.rho != null ? `<p class="note">Prontidão × como me sinto: concordância <b>${nf(d.ready.rho, 2)}</b> (${d.ready.n} dias)${d.rho != null ? `; o REC sozinho: ${nf(d.rho, 2)}` : ''}. Se a Prontidão ficar abaixo do REC, os pesos da carga e do sono precisam de ajuste.</p>` : ''}
    ${calibLogHtml(bt?.log ?? [])}
    <p class="note">${d.enough ? 'Já dá para calibrar: ajustar os pesos do REC para seguir melhor como você se sente.' : 'Marque a nota "como me sinto" na aba Hoje todo dia. Com 40 notas dá para ajustar os pesos e limites do REC (planejado para depois de Aracaju).'}</p>`;
}

// O ano em quadradinhos: 53 colunas (semanas) × 7 linhas (seg a dom)
let yearMetric = (() => { try { return localStorage.getItem('rec.year') || 'rec'; } catch { return 'rec'; } })();
async function yearSec(box, api) {
  const sec = box.querySelector('#year');
  sec.innerHTML = '<p class="empty">Carregando…</p>';
  let d; try { d = await api('/api/year'); } catch (e) { sec.innerHTML = `<p class="empty">Não carregou: ${esc(e.message)}</p>`; return; }
  const draw = () => {
    const days = d.days, q = (xs, p) => { const s = xs.filter((x) => x > 0).sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) * p)] : 1; };
    const sMax = q(days.map((x) => x.strain), 0.95);
    const color = (x) => {
      if (yearMetric === 'rec') return x.rec == null ? null : `var(--rb${x.rec <= 20 ? 1 : x.rec <= 40 ? 2 : x.rec <= 60 ? 3 : x.rec <= 80 ? 4 : 5})`;
      if (yearMetric === 'strain') { if (!x.strain) return 'var(--track)'; const f = Math.min(1, x.strain / sMax); return `color-mix(in srgb, var(--strain) ${Math.round(20 + 80 * f)}%, var(--card))`; }
      if (x.sleep == null) return null; const g = x.sleep - d.sleepNeed;
      return g >= 0 ? 'var(--sleep)' : g >= -0.75 ? 'color-mix(in srgb, var(--sleep) 55%, var(--card))' : 'color-mix(in srgb, var(--sleep) 22%, var(--card))';
    };
    const W = 53, C = 6, G = 1.5, w = W * (C + G), h = 7 * (C + G);
    let cells = '', months = '', lastM = '';
    days.forEach((x, i) => {
      const col = Math.floor(i / 7), row = i % 7, c = color(x);
      cells += `<rect x="${(col * (C + G)).toFixed(1)}" y="${(row * (C + G)).toFixed(1)}" width="${C}" height="${C}" rx="1.4" data-i="${i}" style="fill:${c ?? 'transparent'};${c ? '' : 'stroke:var(--line-soft);stroke-width:.6'}"/>`;
      const m = x.d.slice(5, 7);
      if (row === 0 && m !== lastM) { lastM = m; months += `<text x="${(col * (C + G)).toFixed(1)}" y="-3" class="yr-m">${['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][Number(m) - 1]}</text>`; }
    });
    const legend = yearMetric === 'rec' ? '<span><i style="background:var(--rb1)"></i>0–20</span><span><i style="background:var(--rb3)"></i>41–60</span><span><i style="background:var(--rb5)"></i>81–100</span><span><i class="yr-none"></i>sem REC</span>'
      : yearMetric === 'strain' ? '<span><i style="background:var(--track)"></i>sem treino</span><span><i style="background:color-mix(in srgb, var(--strain) 45%, var(--card))"></i>leve</span><span><i style="background:var(--strain)"></i>pesado</span>'
      : `<span><i style="background:color-mix(in srgb, var(--sleep) 22%, var(--card))"></i>> 45 min abaixo</span><span><i style="background:var(--sleep)"></i>≥ base (${hm(d.sleepNeed)})</span>`;
    const avail = days.filter((x) => (yearMetric === 'rec' ? x.rec != null : yearMetric === 'sleep' ? x.sleep != null : true));
    const head = yearMetric === 'rec' ? (() => { const v = avail.map((x) => x.rec); return v.length ? `REC médio ${Math.round(v.reduce((a, b) => a + b, 0) / v.length)} em ${v.length} dias; ${v.filter((x) => x >= 67).length} verdes e ${v.filter((x) => x <= 33).length} vermelhos.` : 'Sem REC no período.'; })()
      : yearMetric === 'strain' ? `${days.filter((x) => x.strain > 0).length} dias com treino em 53 semanas.`
      : `${avail.filter((x) => x.sleep >= d.sleepNeed).length} de ${avail.length} noites com a sua base de sono ou mais.`;
    sec.innerHTML = `
      <div class="seg seg-sm" role="tablist">${[['rec', 'REC'], ['strain', 'Strain'], ['sleep', 'Sono']].map(([k, l]) => `<button role="tab" data-ym="${k}" aria-selected="${k === yearMetric}">${l}</button>`).join('')}</div>
      <p class="headline">${head}</p>
      <div class="yr-wrap"><svg viewBox="0 -12 ${w} ${h + 14}" style="width:${(w * 2.3).toFixed(0)}px" class="yr" role="img" aria-label="Um quadrado por dia nas últimas 53 semanas">${months}${cells}</svg></div>
      <p class="yr-tip" aria-live="polite">Toque num quadrado para ver o dia. Arraste para ver os meses anteriores.</p>
      <div class="yr-day" aria-live="polite"></div>
      <div class="yr-leg">${legend}</div>`;
    const wrap = sec.querySelector('.yr-wrap'); wrap.scrollLeft = wrap.scrollWidth; // abre no mês atual; arrasta para trás
    sec.querySelectorAll('[data-ym]').forEach((b) => b.addEventListener('click', () => { yearMetric = b.dataset.ym; try { localStorage.setItem('rec.year', yearMetric); } catch {} draw(); }));
    sec.querySelector('.yr').addEventListener('click', (e) => {
      const i = e.target.dataset?.i; if (i == null) return; const x = days[Number(i)];
      sec.querySelectorAll('.yr rect.sel').forEach((r) => r.classList.remove('sel')); e.target.classList.add('sel');
      const dt = new Date(x.d + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '');
      sec.querySelector('.yr-tip').hidden = true;
      yrDay(sec.querySelector('.yr-day'), api, x.d, dt);
    });
  };
  draw();
}

// dia do ano em quadradinhos: as 3 métricas, o que puxou o REC, treinos e diário (04/11)
const recVar = (v) => `var(--rb${v <= 20 ? 1 : v <= 40 ? 2 : v <= 60 ? 3 : v <= 80 ? 4 : 5})`;
async function yrDay(box, api, date, dt) {
  box.innerHTML = `<div class="yd"><p class="empty">${esc(dt)}…</p></div>`;
  let d; try { d = await api(`/api/day?date=${date}`); } catch (e) { box.innerHTML = `<div class="yd"><p class="empty">Não carregou: ${esc(e.message)}</p></div>`; return; }
  const FMT = { hrv: (v) => `${Math.round(v)} ms`, rhr: (v) => `${Math.round(v)} bpm`, sleep: (v) => hm(v), resp: (v) => `${nf(v, 1)} rpm`, stress: (v) => `${Math.round(v)}` };
  const sig = d.signals.filter((s) => s.z != null && Math.abs(s.z) >= 0.5).sort((a, b) => a.z - b.z);
  const line = (s) => `${esc(s.label)} ${s.v != null ? FMT[s.k](s.v) : ''}${s.b != null ? ` <small>(base ${FMT[s.k](s.b)})</small>` : ''}`;
  const down = sig.filter((s) => s.z < 0).slice(0, 3), up = sig.filter((s) => s.z > 0).reverse().slice(0, 2);
  const ctx = [
    d.strainPrev > 0 ? `Treino na véspera: Strain <b>${d.strainPrev}</b>` : 'Véspera sem treino',
    d.tagsPrev.length ? `Diário da véspera: ${esc(d.tagsPrev.join(', '))}` : null,
    d.feel != null ? `Como me sinto: <b>${d.feel}</b>` : null,
    d.tags.length ? `Diário do dia: ${esc(d.tags.join(', '))}` : null,
  ].filter(Boolean);
  const sl = d.sleep?.h;
  box.innerHTML = `<div class="yd">
    <header><b>${esc(dt.charAt(0).toUpperCase() + dt.slice(1))}</b><button type="button" class="yd-x" aria-label="Fechar">×</button></header>
    <div class="yd-3">
      <div><small>REC</small><b style="color:${d.rec == null ? 'var(--text-3)' : recVar(d.rec)}">${d.rec ?? '–'}</b></div>
      <div><small>Strain</small><b style="color:var(--strain)">${d.strain || 0}</b></div>
      <div><small>Sono</small><b style="color:var(--sleep)">${sl != null ? hm(sl) : '–'}</b>${sl != null ? `<em>${sl >= d.sleepBase ? 'na base ou acima' : `${hm(d.sleepBase - sl)} abaixo da base`}</em>` : ''}</div>
    </div>
    ${down.length || up.length ? `<div class="yd-why">
      ${down.length ? `<p><span class="yd-dn">↓ puxou para baixo</span>${down.map(line).join(' · ')}</p>` : ''}
      ${up.length ? `<p><span class="yd-up">↑ ajudou</span>${up.map(line).join(' · ')}</p>` : ''}
    </div>` : d.rec != null ? '<p class="yd-ctx">Tudo perto da base: nenhum sinal fora do normal.</p>' : ''}
    ${ctx.length ? `<p class="yd-ctx">${ctx.join(' · ')}</p>` : ''}
    ${d.acts.filter((a) => ['natacao', 'bike', 'corrida'].includes(a.sport)).length >= 2 ? `<a class="yd-rr" href="#relatorio/${d.date}">Ver como relatório de prova ›</a>` : ''}
    ${d.acts.length ? `<ul class="yd-acts">${d.acts.map((a) => `<li><a href="#atv/${encodeURIComponent(a.id)}"><i style="background:var(--${a.sport})"></i><span>${esc(a.label)}</span><em>${a.min} min${a.km ? ` · ${nf(a.km, 1)} km` : ''}${a.strain != null ? ` · Strain ${a.strain}` : ''}</em>›</a></li>`).join('')}</ul>` : '<p class="yd-ctx">Sem treino neste dia.</p>'}
  </div>`;
  box.querySelector('.yd-x').addEventListener('click', () => { box.innerHTML = ''; const t = box.parentElement.querySelector('.yr-tip'); if (t) t.hidden = false; box.parentElement.querySelectorAll('.yr rect.sel').forEach((r) => r.classList.remove('sel')); });
}

let raceCache = null;
const raceData = (api) => (raceCache ??= api('/api/race').catch((e) => { raceCache = null; throw e; }));

async function heatSec(box, api) {
  const sec = box.querySelector('#heat');
  sec.innerHTML = '<p class="empty">Carregando…</p>';
  try { const d = await raceData(api); sec.innerHTML = heatHtml(d.heat, false); } catch (e) { sec.innerHTML = `<p class="empty">Não carregou: ${esc(e.message)}</p>`; }
}

async function projSec(box, api) {
  const sec = box.querySelector('#proj');
  sec.innerHTML = '<p class="empty">Carregando…</p>';
  try { const d = await raceData(api); sec.innerHTML = projHtml(d.projection, d.race.date) || '<p class="empty">Sem plano publicado para projetar.</p>'; }
  catch (e) { sec.innerHTML = `<p class="empty">Não carregou: ${esc(e.message)}</p>`; }
}

// ---------- Tendência do HRV (HRV4Training) ----------
const HCLS = { acima: 'var(--good)', estavel: 'var(--text)', fadiga: 'var(--warn)', risco: 'var(--bad)' };
async function hrvTrendSec(box, api) {
  const sec = box.querySelector('#hrvt');
  sec.innerHTML = '<h2>Tendência do HRV</h2><p class="empty">Carregando…</p>';
  let h; try { h = await api('/api/hrvtrend'); } catch (e) { sec.querySelector('.empty').textContent = `Não carregou: ${e.message}`; return; }
  if (!h) { sec.querySelector('.empty').textContent = 'Precisa de pelo menos 30 noites com HRV.'; return; }
  const pos = h.mean7 > h.hi ? 'acima da' : h.mean7 < h.lo ? 'abaixo da' : 'dentro da';
  const cv = h.cv7 != null && h.cvTyp != null ? ` Variação da semana ${nf(h.cv7, 1)}% (seu normal ${nf(h.cvTyp, 1)}%).` : '';
  const s = h.series, dates = s.map((x) => x.date);
  sec.innerHTML = `
    <h2>Tendência do HRV</h2>
    <div class="verdict hv" style="--vc:${HCLS[h.cls]}">
      <p class="v-answer" style="color:${HCLS[h.cls]}">${esc(h.label)}</p>
      <p class="v-load">Média de 7 noites ${h.mean7} ms, ${pos} sua faixa normal (${h.lo}–${h.hi} ms).${cv} ${h.days > 1 ? `Há ${h.days} dias nessa leitura.` : 'Mudou hoje.'}</p>
    </div>
    <div class="hv-chart"></div>
    <details class="explain"><summary>Como é calculado</summary>
      <p>Método HRV4Training: a média de 7 noites do HRV (em escala log) comparada com a sua faixa normal, que é a média dos 60 dias anteriores ± meio desvio-padrão. Também olha a variação do HRV na semana (CV) contra o seu normal.</p>
      <p><b>Adaptando bem</b>: média acima da faixa. <b>Estável</b>: dentro. <b>Fadiga acumulada</b>: abaixo, com variação estável ou menor. <b>Risco de má adaptação</b>: abaixo, com variação subindo (o HRV oscilando mais que o normal).</p>
    </details>`;
  bandLine(sec.querySelector('.hv-chart'), { dates, values: s.map((x) => x.mean7), lo: s.map((x) => x.lo), hi: s.map((x) => x.hi), color: 'var(--hrv)', height: 110, axes: true,
    dots: (v, i) => HCLS[s[i]?.cls] ?? null, label: 'HRV média 7 noites',
    tip: (i) => row('Média 7 noites', `${s[i].mean7 ?? '–'} ms`) + row('Faixa normal', `${s[i].lo ?? '–'}–${s[i].hi ?? '–'}`) });
}

// ---------- O que mexe no meu REC (diário + regularidade do sono) ----------
async function habits(box, api) {
  const sec = box.querySelector('#habs');
  sec.innerHTML = '<h2>O que mexe no meu REC</h2><p class="empty">Carregando…</p>';
  let d; try { d = await api('/api/habits'); } catch (e) { sec.querySelector('.empty').textContent = `Não carregou: ${e.message}`; return; }
  const row = (r) => {
    const n = d.minDays;
    const val = r.ready
      ? `<span class="hd ${r.diff < 0 ? 'neg' : r.diff > 0 ? 'pos' : ''}">${r.diff > 0 ? '+' : r.diff < 0 ? '−' : ''}${Math.abs(r.diff)}</span>`
      : `<span class="hd wait">faltam ${Math.max(0, n - r.with.n) + Math.max(0, n - r.without.n)} dias</span>`;
    const sub = r.ready
      ? `REC ${String(r.with.avg).replace('.', ',')} com × ${String(r.without.avg).replace('.', ',')} sem · ${r.with.n} e ${r.without.n} dias`
      : `${r.with.n} ${r.with.n === 1 ? 'dia' : 'dias'} com, ${r.without.n} sem (precisa de ${n} de cada)`;
    return `<li><div><span class="hl">${r.label.replace(/[&<>]/g, '')}</span><span class="hs">${sub}</span></div>${val}</li>`;
  };
  sec.innerHTML = `
    <h2>O que mexe no meu REC</h2>
    <p class="note">Diferença de pontos no REC da manhã seguinte, com × sem cada marcação do diário${d.since ? ` (desde ${new Date(d.since + 'T12:00:00').toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }).replace('.', '')})` : ''}. O horário de sono irregular é automático.</p>
    <ul class="hab-rows">${d.rows.map(row).join('')}</ul>
    ${!d.since ? '<p class="note">Comece marcando o diário na aba Hoje, à noite.</p>' : ''}
    <p class="note">É associação, não causa: outros fatores do dia também mudam o REC. Fica mais confiável com mais dias.</p>`;
}

// ---------- janelas longas (Estou evoluindo? / Recuperação) ----------
const WINS = [[56, '2 meses'], [91, '3 meses'], [182, '6 meses'], [365, '1 ano']];
let evoWin = 56, recWin = 56;
const winSeg = (cur, attr) => `<div class="seg seg-sm" role="tablist">${WINS.map(([d, l]) => `<button role="tab" data-${attr}="${d}" aria-selected="${d === cur}">${l}</button>`).join('')}</div>`;
const ltCache = new Map();
async function longtrend(api, days) {
  if (!ltCache.has(days)) ltCache.set(days, api(`/api/longtrend?days=${days}`));
  try { return await ltCache.get(days); } catch (e) { ltCache.delete(days); throw e; }
}

/** Gráfico de linha com faixa (lo/hi), base tracejada, área e marcadores; toque mostra o dia. */
function bandLine(wrap, o) {
  const W = 340, H = o.height ?? 120, n = o.dates.length;
  const all = [...o.values, ...(o.lo ?? []), ...(o.hi ?? []), ...(o.extra ?? []).flatMap((e) => e.values)].filter((v) => v != null);
  if (!all.length) { wrap.innerHTML = '<p class="empty">Sem dados no período.</p>'; return; }
  let lo = o.min ?? Math.min(...all), hi = o.max ?? Math.max(...all);
  const pad = (hi - lo) * 0.08 || 1; if (o.min == null) lo -= pad; if (o.max == null) hi += pad;
  const x = (i) => (n === 1 ? W / 2 : (i / (n - 1)) * (W - 30));
  const y = (v) => H - ((v - lo) / (hi - lo)) * H;
  const path = (vals) => { let d = '', pen = false; vals.forEach((v, i) => { if (v == null) { pen = false; return; } d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`; pen = true; }); return d; };
  let svg = '';
  // faixa normal
  if (o.lo && o.hi) {
    const seg = []; let run = [];
    o.lo.forEach((v, i) => { if (v == null || o.hi[i] == null) { if (run.length) seg.push(run); run = []; } else run.push(i); });
    if (run.length) seg.push(run);
    for (const r of seg) {
      const top = r.map((i) => `${x(i).toFixed(1)},${y(o.hi[i]).toFixed(1)}`).join(' ');
      const bot = r.slice().reverse().map((i) => `${x(i).toFixed(1)},${y(o.lo[i]).toFixed(1)}`).join(' ');
      svg += `<polygon points="${top} ${bot}" class="bl-band" style="fill:${o.color}"/>`;
    }
  }
  for (const b of o.hbands ?? []) svg += `<rect x="0" width="${W - 30}" y="${y(Math.min(b[1], hi))}" height="${Math.max(0, y(Math.max(b[0], lo)) - y(Math.min(b[1], hi)))}" class="bl-band" style="fill:${b[2] ?? o.color}"/>`;
  if (o.ref != null) svg += `<line x1="0" x2="${W - 30}" y1="${y(o.ref)}" y2="${y(o.ref)}" class="bl-ref"/><text x="${W}" y="${y(o.ref) + 3}" class="ax" text-anchor="end">${o.refLabel ?? ''}</text>`;
  if (o.base) svg += `<path d="${path(o.base)}" class="bl-base"/>`;
  if (o.bars) {
    const bw = Math.max(1.5, (W - 30) / n - 1.5);
    o.values.forEach((v, i) => { if (v != null) svg += `<rect x="${x(i) - bw / 2}" y="${y(v)}" width="${bw}" height="${Math.max(0.5, H - y(v))}" rx="1" style="fill:${o.barColor ? o.barColor(v) : o.color}"/>`; });
  } else {
    // área com degradê que some no fundo (05/11): em todo gráfico de linha, salvo area: false
    if (o.area !== false) {
      const gid = `g${Math.random().toString(36).slice(2, 8)}`, fi = o.values.findIndex((v) => v != null), la = o.values.length - 1 - [...o.values].reverse().findIndex((v) => v != null);
      svg += `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:${o.color};stop-opacity:.32"/><stop offset="1" style="stop-color:${o.color};stop-opacity:0"/></linearGradient></defs>`;
      if (fi >= 0) svg += `<path d="${path(o.values.map((v, i) => (i < fi || i > la ? null : v ?? o.values.slice(0, i).reverse().find((z) => z != null))))} L${x(la).toFixed(1)},${H} L${x(fi).toFixed(1)},${H} Z" style="fill:url(#${gid})"/>`;
    }
    svg += `<path d="${path(o.values)}" class="bl-line bl-draw" pathLength="1" style="stroke:${o.color}"/>`;
  }
  for (const e of o.extra ?? []) svg += `<path d="${path(e.values)}" class="bl-line" style="stroke:${e.color};stroke-width:${e.width ?? 1.6}"/>`;
  if (o.dots) o.values.forEach((v, i) => { if (v != null) { const c = o.dots(v, i); if (c) svg += `<circle cx="${x(i)}" cy="${y(v)}" r="${n > 120 ? 1.6 : 2.6}" style="fill:${c}"/>`; } });
  // faixa de cores embaixo (ex.: zona da Forma por dia)
  let strip = '';
  if (o.strip) {
    const sw = (W - 30) / n;
    strip = o.strip.map((c, i) => (c ? `<rect x="${x(i) - sw / 2}" y="${H + 8}" width="${sw + 0.3}" height="8" style="fill:${c}"/>` : '')).join('');
  }
  const niceT = (v) => { const st = hi - lo > 60 ? 20 : hi - lo > 20 ? 10 : hi - lo > 6 ? 2 : 1; return Math.round(v / st) * st; };
  const yTicks = o.yTicks ?? [niceT(lo + (hi - lo) * 0.2), niceT(lo + (hi - lo) * 0.8)];
  const yt = o.axes === false || o.axes === 'x' ? '' : yTicks.map((v) => `<text x="${W}" y="${y(v) + 3}" class="ax" text-anchor="end">${o.yFmt ? o.yFmt(v) : nf(v)}</text>`).join('');
  const xi = o.axes === false ? [] : o.axes === 'x' ? [0, n - 1] : [0, Math.round((n - 1) / 2), n - 1];
  const xt = xi.map((i, k) => `<text x="${x(i)}" y="${H + (o.strip ? 30 : 14)}" class="ax" text-anchor="${k === 0 ? 'start' : k === xi.length - 1 ? 'end' : 'middle'}">${fmtDay(o.dates[i])}</text>`).join('');
  const totalH = H + (o.strip ? 18 : 0) + (o.axes === false ? 2 : 18);
  wrap.innerHTML = `<svg viewBox="0 -4 ${W} ${totalH + 4}" class="chart bl" role="img" aria-label="${esc(o.label ?? '')}">${svg}${strip}${yt}${xt}
    <line class="bl-rule" y1="-4" y2="${H}" visibility="hidden"/><rect class="bl-hit" x="0" y="-4" width="${W}" height="${totalH}" fill="transparent"/></svg>
    ${o.tip ? '<div class="tip" hidden></div>' : ''}`;
  if (!o.tip) return;
  const el = wrap.querySelector('svg'), rule = el.querySelector('.bl-rule'), tip = wrap.querySelector('.tip'), hit = el.querySelector('.bl-hit');
  const show = (ev) => {
    const b = el.getBoundingClientRect(); const px = ((ev.clientX - b.left) / b.width) * W;
    const i = Math.max(0, Math.min(n - 1, Math.round((px / (W - 30)) * (n - 1))));
    rule.setAttribute('x1', x(i)); rule.setAttribute('x2', x(i)); rule.setAttribute('visibility', 'visible');
    tip.innerHTML = `<p>${fmtDay(o.dates[i])}</p>${o.tip(i)}`; tip.hidden = false;
    const left = (x(i) / W) * b.width; tip.style.left = `${Math.min(Math.max(left - tip.offsetWidth / 2, 0), b.width - tip.offsetWidth)}px`;
  };
  hit.addEventListener('pointerdown', show); hit.addEventListener('pointermove', show);
  hit.addEventListener('pointerleave', () => { rule.setAttribute('visibility', 'hidden'); tip.hidden = true; });
  hit.style.touchAction = 'pan-y';
}

// ---------- Estou evoluindo? ----------
async function evolve(box, api) {
  const sec = box.querySelector('#evo'); if (!sec) return;
  let t;
  try { t = await longtrend(api, evoWin); } catch (e) { sec.innerHTML = `<p class="empty">Não carregou: ${esc(e.message)}</p>`; return; }
  const sm = t.summary, z = zoneOfPct(sm.formPct);
  const fitTxt = sm.fitness4wPct == null ? '' : sm.fitness4wPct === 0 ? 'Fitness estável nas últimas 4 semanas.' : `Fitness ${sm.fitness4wPct > 0 ? 'subiu' : 'caiu'} ${Math.abs(sm.fitness4wPct)}% em 4 semanas.`;
  const fatTxt = sm.fatigueAboveDays > 0 ? `Fadiga acima do Fitness há ${sm.fatigueAboveDays} ${sm.fatigueAboveDays === 1 ? 'dia' : 'dias'}.` : 'Fadiga abaixo do Fitness: o cansaço está saindo.';
  sec.innerHTML = `
    <h2>Estou evoluindo?</h2>
    <p class="headline">${fitTxt} ${fatTxt}${z ? ` Forma hoje: <b class="z-${z.key}">${signed(sm.formPct)}%, ${z.label.toLowerCase()}</b>.` : ''}</p>
    <div class="evo-nums">
      <span><i class="dot" style="background:var(--fitness)"></i>Fitness <b class="c-fit">${nf(sm.fitness)}</b></span>
      <span><i class="dot" style="background:var(--fatigue)"></i>Fadiga <b class="c-fat">${nf(sm.fatigue)}</b></span>
    </div>
    <div class="chart-wrap" id="ch-evo"></div>
    <h3 class="sub evo-sub">Forma por dia <small>(Fitness − Fadiga) ÷ Fitness</small></h3>
    <div class="chart-wrap" id="ch-form"></div>
    <div class="legend form-legend">${FORM_ZONES.map((f) => `<span><i class="dot" style="background:var(--z-${f.key})"></i>${f.label}</span>`).join('')}</div>
    ${winSeg(evoWin, 'ew')}
    <details class="explain">
      <summary>Como ler</summary>
      <p><b>Fitness</b> (área azul): quanto treino seu corpo está acostumado a fazer, a média do seu Strain nas últimas 6 semanas. Subindo devagar = você está aumentando a carga de forma sustentável.</p>
      <p><b>Fadiga</b> (linha rosa): a mesma conta para a última semana. Quando fica acima do Fitness, você está treinando mais que o seu normal.</p>
      <p><b>Forma por dia</b> (barras embaixo): (Fitness − Fadiga) ÷ Fitness. Abaixo de zero você está carregando mais que o normal; a faixa verde (+5% a +20%, descansado) é onde se quer chegar no dia da prova.</p>
      <p><b>Strain</b>: minutos × FC média em escala exponencial, a mesma régua do Relative Effort do Strava.</p>
    </details>`;
  const days = t.days;
  bandLine(sec.querySelector('#ch-evo'), {
    dates: days.map((x) => x.date), values: days.map((x) => x.fitness), color: 'var(--fitness)', area: true, height: 150, label: 'Fitness e Fadiga',
    extra: [{ values: days.map((x) => x.fatigue), color: 'var(--fatigue)', width: 2 }],
    tip: (i) => row('Fitness', nf(days[i].fitness)) + row('Fadiga', nf(days[i].fatigue)) + row('Forma', days[i].formPct == null ? '–' : `${signed(days[i].formPct)}%`),
  });
  formBars(sec.querySelector('#ch-form'), days);
  sec.querySelectorAll('[data-ew]').forEach((b) => b.addEventListener('click', () => { evoWin = Number(b.dataset.ew); evolve(box, api); }));
}

// Forma em barras: uma por dia, cor da faixa, linha do zero e a faixa de prova (+5 a +20%) sombreada
function formBars(wrap, days) {
  const v = days.map((x) => x.formPct), ok = v.filter((x) => x != null); if (!ok.length) { wrap.innerHTML = ''; return; }
  const W = 340, H = 90, lo = Math.min(-40, ...ok), hi = Math.max(25, ...ok), y = (x) => ((hi - x) / (hi - lo)) * H, n = v.length, bw = Math.max(1.2, (W - 30) / n - 1);
  const X = (i) => (i / Math.max(1, n - 1)) * (W - 30 - bw);
  wrap.innerHTML = `<svg viewBox="0 0 ${W} ${H + 16}" class="chart" role="img" aria-label="Forma por dia">
    <rect x="0" width="${W - 30}" y="${y(20)}" height="${y(5) - y(20)}" fill="rgba(79,209,154,.12)"/>
    <line x1="0" x2="${W - 30}" y1="${y(0)}" y2="${y(0)}" stroke="var(--line)"/>
    ${v.map((x, i) => (x == null ? '' : `<rect x="${X(i).toFixed(1)}" width="${bw.toFixed(1)}" y="${Math.min(y(0), y(x)).toFixed(1)}" height="${Math.max(1, Math.abs(y(x) - y(0))).toFixed(1)}" rx="1" fill="var(--z-${zoneOfPct(x).key})"/>`)).join('')}
    <text x="${W}" y="${y(0) + 3}" class="ax" text-anchor="end">0%</text><text x="${W}" y="${y(20) - 2}" class="ax" text-anchor="end">prova</text>
    <text x="0" y="${H + 13}" class="ax">${fmtDay(days[0].date)}</text><text x="${W - 30}" y="${H + 13}" class="ax" text-anchor="end">${fmtDay(days[n - 1].date)}</text>
  </svg>`;
}

// ---------- Como treinei? (período de calendário) ----------
async function volume(box, api) {
  const sec = box.querySelector('#vol'); if (!sec) return;
  let d;
  try { d = await api(`/api/trends?unit=${unit}&offset=${offset}`); } catch (e) { sec.innerHTML = `<p class="empty">Não carregou: ${esc(e.message)}</p>`; return; }
  const multi = d.weeks > 1.01;
  const zt = d.zones.reduce((a, z) => a + (z.hours ?? 0), 0);
  const easy = zt ? Math.round(((d.zones[0].hours + d.zones[1].hours + d.zones[2].hours) / zt) * 100) : null;
  const mid = zt ? Math.round((d.zones[3].hours / zt) * 100) : null, hard = zt ? 100 - easy - mid : null;
  const perWeek = d.total.hours / d.weeks;
  sec.innerHTML = `
    <h2>Como treinei?</h2>
    <div class="seg seg-sm" role="tablist">${UNITS.map(([u, l]) => `<button role="tab" data-u="${u}" aria-selected="${u === unit}">${l}</button>`).join('')}</div>
    <div class="vol-nav">
      <button type="button" data-step="1" aria-label="Período anterior">‹</button>
      <span>${esc(periodTitle(d))}</span>
      <button type="button" data-step="-1" aria-label="Próximo período" ${offset === 0 ? 'disabled' : ''}>›</button>
    </div>
    ${d.totals.length ? `<div class="vo-big"><b>${hm(multi ? perWeek : d.total.hours)}</b><span>${multi ? 'por semana' : unit === 'semana' ? 'na semana' : 'até agora'} · ${nf(d.total.sessions)} sessões · Strain ${nf(d.total.strain)}</span></div>
    <ul class="vo-sports">${(() => { const mx = Math.max(...d.totals.map((t) => t.hours), 0.01); return d.totals.map((t) => `<li>
      <span class="vo-l"><i class="dot s-${t.sport}"></i>${esc(t.label)}</span>
      <span class="vo-t"><i style="width:${(t.hours / mx) * 100}%;background:var(--${t.sport})"></i></span>
      <span class="vo-v"><b>${hm(multi ? t.perWeek : t.hours)}</b><small>${t.sessions} ${t.sessions === 1 ? 'sessão' : 'sessões'} · Strain ${nf(t.strain)}</small></span></li>`).join(''); })()}</ul>` : '<p class="empty">Sem treinos neste período.</p>'}
    ${zt ? `<h3 class="sub">Intensidade</h3>
      <div class="vo-int"><div><b>${easy}%</b><small>leve (até Z2)</small></div><div><b>${mid}%</b><small>média (Z3)</small></div><div><b>${hard}%</b><small>alta (Z4–Z5)</small></div></div>
      ${distBar({ low: easy, mid, high: hard })}
      <p class="note">Bike, corrida, natação e Hyrox, pelas zonas do seu Garmin. Referência de endurance: ~80% leve. O tempo em cada zona está em Zonas de treino.</p>` : ''}`;
  sec.querySelectorAll('[data-u]').forEach((b) => b.addEventListener('click', () => {
    unit = b.dataset.u; offset = 0; try { localStorage.setItem('rec.unit', unit); } catch {} volume(box, api);
  }));
  sec.querySelectorAll('.vol-nav button').forEach((b) => b.addEventListener('click', () => { offset = Math.max(0, offset + Number(b.dataset.step)); volume(box, api); }));
}

// barra de intensidade com marca dos 80%
export function distBar(d) {
  if (!d) return '';
  return `<div class="dist"><div class="dist-bar"><i class="d-low" style="flex:${d.low}"></i><i class="d-mid" style="flex:${d.mid}"></i><i class="d-high" style="flex:${d.high}"></i><em style="left:80%"></em></div>
    <div class="dist-leg"><span><i class="d-low"></i>Leve <b>${d.low}%</b></span><span><i class="d-mid"></i>Média <b>${d.mid}%</b></span><span><i class="d-high"></i>Alta <b>${d.high}%</b></span></div></div>`;
}

// ---------- Meu corpo está recuperando? ----------
let recOpen = null;
async function recovery(box, api) {
  const sec = box.querySelector('#recov'); if (!sec) return;
  let t;
  try { t = await longtrend(api, recWin); } catch (e) { sec.innerHTML = `<p class="empty">Não carregou: ${esc(e.message)}</p>`; return; }
  const sm = t.summary, days = t.days, dates = days.map((x) => x.date), need = t.sleepNeed;
  const pct = (v) => (v == null ? '' : v === 0 ? 'igual à' : `${Math.abs(v)}% ${v > 0 ? 'acima da' : 'abaixo da'}`);
  const cards = [
    { k: 'rec', title: 'REC', color: 'var(--rec-line)', val: sm.rec7 == null ? '–' : Math.round(sm.rec7), unitTxt: 'média 7 dias',
      txt: sm.rec7 == null || sm.recPrev7 == null ? '' : `${Math.round(sm.rec7 - sm.recPrev7) === 0 ? 'Igual' : `${Math.abs(Math.round(sm.rec7 - sm.recPrev7))} pontos ${sm.rec7 > sm.recPrev7 ? 'acima' : 'abaixo'}`} da semana anterior.`,
      draw: (w, big) => bandLine(w, { dates, values: days.map((x) => x.rec), color: 'rgba(255,255,255,.55)', min: 0, max: 100, height: big ? 120 : 44, axes: big,
        hbands: [[33.5, 66.5, 'rgba(255,255,255,.5)']], dots: (v) => zoneVar(v), yTicks: [33, 66], label: 'REC', tip: big ? (i) => row('REC', days[i].rec ?? '–') : null }) },
    { k: 'hrv', title: 'HRV', color: 'var(--hrv)', val: sm.hrv7 == null ? '–' : Math.round(sm.hrv7), unitTxt: 'ms, média 7 noites',
      txt: sm.hrvPct == null ? '' : `${pct(sm.hrvPct)} sua base (${nf(sm.hrvBase)} ms).${sm.hrvOut ? ` ${sm.hrvOut} de 7 noites abaixo da faixa normal.` : ''}`,
      draw: (w, big) => bandLine(w, { dates, values: days.map((x) => x.hrv), lo: days.map((x) => x.hrvLo), hi: days.map((x) => x.hrvHi), base: big ? days.map((x) => x.hrvBase) : null,
        color: 'var(--hrv)', height: big ? 120 : 44, axes: big, label: 'HRV', tip: big ? (i) => row('HRV', `${nf(days[i].hrv)} ms`) + row('Faixa normal', `${nf(days[i].hrvLo)}–${nf(days[i].hrvHi)}`) : null }) },
    { k: 'rhr', title: 'FC de repouso', color: 'var(--rhr)', val: sm.rhr7 == null ? '–' : nf(sm.rhr7), unitTxt: 'bpm, média 7 dias',
      txt: sm.rhrDiff == null ? '' : `${sm.rhrDiff === 0 ? 'Igual à' : `${nf(Math.abs(sm.rhrDiff), 1)} bpm ${sm.rhrDiff > 0 ? 'acima da' : 'abaixo da'}`} sua base (${nf(sm.rhrBase)} bpm).${sm.rhrOut ? ` ${sm.rhrOut} de 7 dias acima da faixa normal.` : ''}`,
      draw: (w, big) => bandLine(w, { dates, values: days.map((x) => x.rhr), lo: days.map((x) => x.rhrLo), hi: days.map((x) => x.rhrHi), base: big ? days.map((x) => x.rhrBase) : null,
        color: 'var(--rhr)', height: big ? 120 : 44, axes: big, label: 'FC de repouso', tip: big ? (i) => row('FC', `${nf(days[i].rhr)} bpm`) + row('Faixa normal', `${nf(days[i].rhrLo)}–${nf(days[i].rhrHi)}`) : null }) },
    { k: 'sleep', title: 'Sono', color: 'var(--sleep)', val: hm(sm.sleep7), unitTxt: 'média 7 noites',
      txt: `Sua necessidade: ${hm(need)}.${sm.sleepShort ? ` ${sm.sleepShort} de 7 noites com mais de 30 min a menos.` : ' Nenhuma noite curta na semana.'}`,
      draw: (w, big) => bandLine(w, { dates, values: days.map((x) => x.sleep), bars: true, color: 'var(--sleep)', min: 0, ref: need, refLabel: big ? hm(need) : '',
        barColor: (v) => (v < need - 0.5 ? 'color-mix(in srgb, var(--sleep) 45%, #000)' : 'var(--sleep)'), height: big ? 110 : 44, axes: big, label: 'Sono', yTicks: [4, 8], yFmt: (v) => `${nf(v)} h`,
        tip: big ? (i) => row('Sono', hm(days[i].sleep)) : null }) },
  ];
  sec.innerHTML = `
    <h2>Meu corpo está recuperando?</h2>
    ${t.verdict ? `<div class="verdict v-${t.verdict.level}">
      <p class="v-answer">${esc(t.verdict.answer)}</p>
      <p class="v-trend t-${t.verdict.trend}">${t.verdict.trend === 'melhorando' ? '↑' : t.verdict.trend === 'piorando' ? '↓' : '→'} ${esc(t.verdict.trendTxt)}</p>
      <p class="v-load">${esc(t.verdict.load)}</p>
      ${t.verdict.reasons.length ? `<ul class="v-sig">${t.verdict.reasons.map((g) => `<li class="${g.bad ? 'bad' : 'ok'}"><b>${g.bad ? '!' : '✓'}</b>${esc(g.txt)}</li>`).join('')}</ul>` : ''}
      <div class="v-meter" aria-hidden="true">${t.verdict.signals.map((g) => `<span class="vm vm-${g.state}">${esc(g.label)}</span>`).join('')}</div>
      <details class="explain v-how"><summary>Como é calculado</summary>
        <p>Usa os mesmos sinais do REC, cada um comparado com o <b>seu</b> normal: HRV (peso 2), sono (1,5), FC de repouso (1), respiração (0,7) e estresse do dia anterior (0,5).</p>
        <p>A resposta sai da média ponderada dos últimos 7 dias, com os dias mais recentes pesando mais. Faixas: recuperando bem, dentro do normal, um pouco abaixo, abaixo, não está recuperando. A tendência compara os últimos 3 dias com os 4 anteriores.</p>
        <p>A frase da carga cruza a recuperação com a Forma e com há quantos dias a Fadiga está acima do Fitness. Respiração e FC acima do normal juntas por 2 dias indicam padrão de início de doença.</p>
        <p>Atualiza a cada noite nova que chega da Garmin. Em modo sombra, os portões do plano continuam valendo.</p>
      </details>
    </div>` : ''}
    <p class="note">Faixa sombreada = o seu normal dos 60 dias anteriores a cada dia. Toque num cartão para ampliar.</p>
    <div class="rgrid">${cards.map((c) => `
      <button type="button" class="rcard${recOpen === c.k ? ' open' : ''}" data-k="${c.k}">
        <span class="rc-t"><i class="dot" style="background:${c.color}"></i>${c.title}</span>
        <span class="rc-v">${c.val}</span><small class="rc-u">${c.unitTxt}</small>
        <span class="rc-x">${c.txt}</span>
        <span class="rc-g"></span>
      </button>`).join('')}</div>
    <div class="rbig" ${recOpen ? '' : 'hidden'}><h3 class="sub" id="rbig-t"></h3><div class="chart-wrap" id="rbig-c"></div></div>
    ${winSeg(recWin, 'rw')}`;
  cards.forEach((c) => c.draw(sec.querySelector(`.rcard[data-k="${c.k}"] .rc-g`), false));
  const openBig = (k) => {
    const c = cards.find((x) => x.k === k), big = sec.querySelector('.rbig');
    if (!c) { big.hidden = true; return; }
    big.hidden = false; sec.querySelector('#rbig-t').textContent = c.title; c.draw(sec.querySelector('#rbig-c'), true);
  };
  if (recOpen) openBig(recOpen);
  sec.querySelectorAll('.rcard').forEach((b) => b.addEventListener('click', () => {
    recOpen = recOpen === b.dataset.k ? null : b.dataset.k;
    sec.querySelectorAll('.rcard').forEach((x) => x.classList.toggle('open', x.dataset.k === recOpen));
    openBig(recOpen);
  }));
  sec.querySelectorAll('[data-rw]').forEach((b) => b.addEventListener('click', () => { recWin = Number(b.dataset.rw); recovery(box, api); }));
}

// ---------- Previsões de prova (corrida) ----------
let pMonths = 3, pDist = 'd21';
const PD = [['d5', '5 km'], ['d10', '10 km'], ['d21', '21 km'], ['d42', '42 km']];
const tfmt = (m) => {
  if (m == null) return '–';
  const s = Math.round(m * 60), h = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
  return h ? `${h}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${mm}:${String(ss).padStart(2, '0')}`;
};
// diferença curta: "28 s", "1 min 05 s", "3 min"
const dfmt = (m) => { const s = Math.round(Math.abs(m) * 60); return s < 60 ? `${s} s` : s % 60 ? `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s` : `${s / 60} min`; };
// tempo digitado só com números (teclado numérico do iPhone): os 2 últimos são segundos, os 2 anteriores minutos,
// o resto horas. "2135" → 21:35; "15101" → 1:51:01. Com ":" também funciona.
const fmtDigits = (txt) => {
  const d = String(txt || '').replace(/\D/g, '').replace(/^0+(?=\d{3})/, '').slice(0, 6);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, -2)}:${d.slice(-2)}`;
  return `${d.slice(0, -4)}:${d.slice(-4, -2)}:${d.slice(-2)}`;
};
const parseT = (txt) => {
  const p = fmtDigits(txt).split(':').filter((x) => x !== '').map(Number);
  if (p.length < 2 || p.some((x) => !Number.isFinite(x)) || p.slice(1).some((x) => x >= 60)) return null;
  return p.length === 3 ? p[0] * 60 + p[1] + p[2] / 60 : p[0] + p[1] / 60;
};

export async function predictions(box, api) {
  const sec = box.querySelector('#pred');
  if (!sec) return;
  let p;
  try { p = await api(`/api/predictions?months=${pMonths}`); } catch (e) { sec.innerHTML = `<p class="empty">Previsões não carregaram: ${esc(e.message)}</p>`; return; }
  if (!p.current) {
    sec.innerHTML = `<h2>Previsões de prova</h2><p class="empty">Precisa de pelo menos 10 corridas ao ar livre (com FC) nas últimas 24 semanas. Hoje: ${p.runsInWindow}.</p>`;
    return;
  }
  const diff = (k) => {
    if (!p.fourWeeksAgo) return '';
    const dm = p.current[k] - p.fourWeeksAgo[k];
    if (Math.abs(dm) < 1 / 60) return '<span class="pd-d">igual</span>';
    return `<span class="pd-d ${dm < 0 ? 'up' : 'down'}">${dm < 0 ? '−' : '+'}${dfmt(dm)}</span>`;
  };
  sec.innerHTML = `
    <h2>Previsões de prova</h2>
    <div class="pd-grid" role="tablist" aria-label="Distância">
      ${PD.map(([k, l]) => `<button type="button" role="tab" data-k="${k}" aria-selected="${k === pDist}" class="pd">
        <small>${l}</small><b>${tfmt(p.current[k])}</b>${diff(k)}</button>`).join('')}
    </div>
    ${(() => {
      if (!p.fourWeeksAgo) return '';
      const dm = p.current[pDist] - p.fourWeeksAgo[pDist];
      const name = PD.find(([k]) => k === pDist)[1];
      if (Math.abs(dm) < 1 / 60) return `<p class="pd-head">${name}: igual a 4 semanas atrás.</p>`;
      return `<p class="pd-head ${dm < 0 ? 'up' : 'down'}">${dm < 0 ? '↑ Melhorando' : '↓ Piorando'}: ${name} ${dfmt(dm)} ${dm < 0 ? 'mais rápido' : 'mais lento'} que 4 semanas atrás.</p>`;
    })()}
    <div class="seg seg-sm" role="tablist" aria-label="Período das previsões">
      ${[[1, '1 mês'], [3, '3 meses'], [6, '6 meses']].map(([m, l]) => `<button role="tab" data-m="${m}" aria-selected="${m === pMonths}">${l}</button>`).join('')}
    </div>
    <div class="chart-wrap" id="ch-pred"></div>
    <p class="note">${p.runsInWindow} corridas ao ar livre nas últimas 24 semanas (esteira fica fora), percurso plano. Atualiza a cada corrida. No 70.3 a corrida vem depois de 90 km de bike.</p>
    <details class="explain">
      <summary>${p.calibrated ? 'Calibrado com o Strava. Ajustar de novo' : 'Ajustar com as previsões do Strava'}</summary>
      <p>Digite o que o Strava mostra hoje (Você → Progresso). O app guarda a diferença para cada distância e aplica dali em diante, então a tendência segue as suas corridas no mesmo nível do Strava.</p>
      <form class="pd-cal">
        ${PD.map(([k, l]) => `<label>${l}<input name="${k}" inputmode="numeric" placeholder="${k === 'd5' || k === 'd10' ? 'mm:ss' : 'h:mm:ss'}" autocomplete="off"></label>`).join('')}
        <button class="btn" type="submit">Salvar</button>
        ${p.calibrated ? '<button class="btn ghost" type="button" data-reset>Remover calibração</button>' : ''}
      </form>
      <p class="progress" id="pd-msg"></p>
    </details>`;

  sec.querySelectorAll('.pd').forEach((b) => b.addEventListener('click', () => { pDist = b.dataset.k; predictions(box, api); }));
  sec.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => { pMonths = Number(b.dataset.m); predictions(box, api); }));
  const form = sec.querySelector('.pd-cal'), msg = sec.querySelector('#pd-msg');
  // coloca os ":" sozinho enquanto digita
  form.querySelectorAll('input').forEach((i) => i.addEventListener('input', () => { i.value = fmtDigits(i.value); }));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {};
    for (const [k] of PD) { const t = parseT(form.elements[k].value); if (t) body[k] = t; }
    if (!Object.keys(body).length) { msg.textContent = 'Preencha pelo menos uma distância. Digite só os números: 2135 vira 21:35, 15101 vira 1:51:01.'; return; }
    try { await api('/api/predictions/calibrate', { method: 'POST', body: JSON.stringify(body) }); predictions(box, api); }
    catch (err) { msg.textContent = `Não salvou: ${err.message}`; }
  });
  sec.querySelector('[data-reset]')?.addEventListener('click', async () => {
    await api('/api/predictions/calibrate', { method: 'POST', body: '{}' }).catch(() => {});
    predictions(box, api);
  strainWeeks(box, api);
  });

  // gráfico: tempo invertido (para cima = mais rápido)
  const pts = p.series;
  lineChart(sec.querySelector('#ch-pred'), [{ name: PD.find(([k]) => k === pDist)[1], values: pts.map((x) => (x.times ? -x.times[pDist] : null)), cls: 'pred' }], {
    dates: pts.map((x) => x.date), label: 'Previsão', area: '--pred', yFmt: (v) => tfmt(-v),
    dots: pMonths > 1 ? () => 'var(--pred)' : null,
    tip: (i) => `<p>${pMonths > 1 ? 'Semana de ' : ''}${fmtDay(pts[i].date)}</p>` + row(PD.find(([k]) => k === pDist)[1], tfmt(pts[i].times?.[pDist])),
  });
}

// ---------- Strain semanal com faixa (como o Relative Effort do Strava) ----------
let swSel = null;
const SW_STATUS = {
  abaixo: { label: 'Abaixo da faixa', txt: 'Semana mais leve que o seu normal recente.' },
  dentro: { label: 'Dentro da faixa', txt: 'Carga parecida com as 3 semanas anteriores.' },
  acima: { label: 'Acima da faixa', txt: 'Semana mais pesada que o seu normal recente.' },
  bem_acima: { label: 'Bem acima da faixa', txt: 'Mais de 50% acima da média das 3 semanas anteriores.' },
};
async function strainWeeks(box, api) {
  const sec = box.querySelector('#sw');
  if (!sec) return;
  let r;
  try { r = await api('/api/strain-weeks?weeks=16'); } catch (e) { sec.innerHTML = `<p class="empty">Não carregou: ${esc(e.message)}</p>`; return; }
  const ws = r.weeks;
  const i = swSel == null ? ws.length - 1 : Math.min(swSel, ws.length - 1);
  const w = ws[i], st = SW_STATUS[w.status] ?? null;
  const end = (() => { const d = new Date(w.start + 'T12:00:00'); d.setDate(d.getDate() + 6); return d.toISOString().slice(0, 10); })();
  // escala das barras: o maior dia da semana ou um quinto do teto da faixa (semana leve não vira barra gigante)
  const maxDay = Math.max(1, ...w.days.map((v) => v ?? 0), w.hi / 5);
  const wd = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];
  const left = w.current && w.status !== 'acima' && w.status !== 'bem_acima' ? Math.max(0, w.hi - w.total) : null;

  sec.innerHTML = `
    <h2>Strain semanal</h2>
    <div class="sw-card sw-${w.status ?? 'none'}">
      <div class="sw-head">
        <span class="meta">${w.current ? 'Esta semana, ' : ''}${fmtDay(w.start)} – ${fmtDay(end)}</span>
        <b class="sw-total">${nf(w.total)}</b>
        ${st ? `<span class="sw-status">${st.label}</span>` : ''}
        <p class="sw-txt">${st ? st.txt : ''} Faixa: <b>${nf(w.lo)}–${nf(w.hi)}</b> (média das 3 semanas anteriores: ${nf(w.avg3)}).${left != null ? ` Até ${nf(w.hi)} fica dentro da faixa: faltam ${nf(left)}.` : ''}</p>
      </div>
      <div class="sw-days">${w.days.map((v, k) => `<div><span class="sw-bar" style="height:${v ? Math.max(4, (v / maxDay) * 100) : 0}%" title="${v ?? '–'}"></span><small>${wd[k]}</small></div>`).join('')}</div>
    </div>
    <h3 class="sub">Treinos da semana</h3>
    ${w.activities?.length ? `<ul class="sw-acts">${w.activities.map((a) => `<li>
        <span class="sw-a-day">${esc(new Date(a.date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric' }).replace(/\./g, ''))}</span>
        <span class="sw-a-name"><i class="dot s-${esc(a.sport)}"></i>${esc(a.label)}<small>${Math.round(a.min)} min${a.km >= 0.5 ? `, ${nf(a.km, 1)} km` : ''}</small></span>
        <b class="c-strain">${a.strain ?? '–'}</b></li>`).join('')}</ul>`
      : '<p class="empty">Nenhum treino nesta semana.</p>'}
    <div class="chart-wrap" id="ch-sw"></div>
    <p class="note">Toque num ponto para ver a semana e os treinos. A faixa sombreada é 0,8 a 1,3 vezes a média das 3 semanas anteriores: subir dentro dela é progressão gradual; acima dela, a carga cresceu rápido.</p>`;

  // gráfico: faixa (área entre lo e hi) + pontos semanais
  const svgW = 340, h = 120;
  const vals = ws.flatMap((x) => [x.total, x.hi]);
  const hiV = Math.max(...vals) * 1.08, x = (k) => 6 + (k / (ws.length - 1)) * (svgW - 40), y = (v) => h - (v / hiV) * h;
  const band = ws.map((q, k) => `${x(k).toFixed(1)},${y(q.hi).toFixed(1)}`).join(' ') + ' ' + ws.slice().reverse().map((q, k) => `${x(ws.length - 1 - k).toFixed(1)},${y(q.lo).toFixed(1)}`).join(' ');
  const ticks = [0, Math.round(ws.length / 3), Math.round((2 * ws.length) / 3), ws.length - 1];
  sec.querySelector('#ch-sw').innerHTML = `<svg viewBox="0 -8 ${svgW} ${h + 26}" class="chart sw-chart" role="img" aria-label="Strain semanal e faixa">
    <polygon points="${band}" class="sw-band"/>
    <line x1="${x(i)}" x2="${x(i)}" y1="-8" y2="${h}" class="sw-sel"/>
    ${ws.map((q, k) => `<circle cx="${x(k).toFixed(1)}" cy="${y(q.total).toFixed(1)}" r="${k === i ? 6 : 4.5}" class="sw-dot sw-${q.status ?? 'none'}${k === i ? ' on' : ''}" data-k="${k}"/>`).join('')}
    ${ticks.map((k) => `<text x="${x(k)}" y="${h + 16}" class="ax" text-anchor="middle">${fmtDay(ws[k].start)}</text>`).join('')}
    <text x="${svgW}" y="${y(Math.max(...ws.map((q) => q.total))) + 4}" class="ax" text-anchor="end">${nf(Math.max(...ws.map((q) => q.total)))}</text>
  </svg>`;
  sec.querySelectorAll('.sw-dot').forEach((c) => c.addEventListener('click', () => { swSel = Number(c.dataset.k); strainWeeks(box, api); }));
}
