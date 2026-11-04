// Aba Tendências: períodos de calendário (semana seg–dom, mês, 3 e 6 meses, 1 ano) com navegação.
import { fmtDay, lineChart, nf } from './charts.js';
import { projHtml, heatHtml } from './race.js';
import { ICON } from './ui.js';

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

// Tendências em 3 abas (04/11): cada aba responde uma pergunta; os blocos ficam fechados e abrem ao tocar.
const TABS = [
  { k: 'carga', l: 'Carga', q: 'Estou treinando no ritmo certo?', secs: [
    ['year', 'O ano em quadradinhos', 'Um quadrado por dia: REC, Strain ou sono', (b, a) => yearSec(b, a)],
    ['sw', 'Strain semanal', 'Quanto treinei por semana, contra a sua faixa', (b, a) => strainWeeks(b, a)],
    ['evo', 'Estou evoluindo?', 'Fitness, Fadiga e Forma', (b, a) => evolve(b, a)],
    ['vol', 'Como treinei?', 'Horas, modalidades e intensidade', (b, a) => volume(b, a)],
    ['focus', 'Foco da carga', 'Leve, forte ou anaeróbico nas últimas 4 semanas', (b, a) => focusSec(b, a)],
  ] },
  { k: 'corpo', l: 'Corpo', q: 'Meu corpo está recuperando?', secs: [
    ['recov', 'Recuperação', 'REC, HRV, FC de repouso e sono contra o seu normal', (b, a) => recovery(b, a)],
    ['hrvt', 'Tendência do HRV', 'Adaptando bem ou acumulando fadiga', (b, a) => hrvTrendSec(b, a)],
    ['habs', 'O que mexe no meu REC', 'Hábitos do diário e horário de sono', (b, a) => habits(b, a)],
    ['stress31', 'Estresse acumulado', 'O último mês contra o seu normal', (b, a) => stressSec(b, a)],
    ['fage', 'Idade fitness e VO2máx', 'Números da Garmin', (b, a) => fageSec(b, a)],
    ['calib', 'O REC acerta?', 'REC × "como me sinto"', (b, a) => calibSec(b, a)],
  ] },
];
const SEC_IC = {"year": ["clock", "var(--accent)"], "sw": ["bolt", "var(--strain)"], "evo": ["trend", "var(--fitness)"], "vol": ["stopwatch", "var(--text-2)"], "focus": ["flame", "#ff8a5c"], "recov": ["heart", "var(--rec-green)"], "hrvt": ["heart", "var(--hrv)"], "habs": ["book", "var(--accent)"], "stress31": ["moon", "var(--warn)"], "fage": ["run", "var(--pred)"], "calib": ["smile", "var(--accent)"]};
let tab = (() => { try { return localStorage.getItem('rec.ttab') || 'carga'; } catch { return 'carga'; } })();

export async function renderTrends(screen, api) {
  document.documentElement.style.setProperty('--rec', 'var(--text-3)');
  if (!TABS.some((t) => t.k === tab)) tab = 'carga';
  const T = TABS.find((t) => t.k === tab);
  screen.innerHTML = `
    <header class="top"><h1>Tendências</h1></header>
    <div class="seg ttabs" role="tablist">${TABS.map((t) => `<button role="tab" data-tab="${t.k}" aria-selected="${t.k === tab}">${t.l}</button>`).join('')}</div>
    <section class="t-answer card" aria-live="polite"><span class="t-q">${esc(T.q)}<button type="button" class="info-btn" aria-label="Por quê" aria-expanded="false" hidden>i</button></span><p id="t-ans">…</p><div class="card-info" id="t-more" hidden></div></section>
    ${T.secs.map(([id, title, sub], i) => `
      <details class="tsec" data-sec="${id}" ${i === 0 ? 'open' : ''}>
        <summary><i class="ts-ic" style="--ic:${SEC_IC[id]?.[1] ?? 'var(--text-2)'}">${ICON[SEC_IC[id]?.[0]] ?? ''}</i><span><b>${title}</b><small>${sub}</small></span></summary>
        <section class="block" id="${id}"></section>
      </details>`).join('')}
`;
  screen.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => {
    tab = b.dataset.tab; try { localStorage.setItem('rec.ttab', tab); } catch {} renderTrends(screen, api); window.scrollTo(0, 0);
  }));
  // cada bloco carrega quando abre pela primeira vez
  const done = new Set();
  const load = (det) => { const id = det.dataset.sec; if (done.has(id)) return; done.add(id); T.secs.find((x) => x[0] === id)[3](screen, api); };
  screen.querySelectorAll('.tsec').forEach((det) => { if (det.open) load(det); det.addEventListener('toggle', () => det.open && load(det)); });
  answer(screen, api, tab);
}

// resposta de uma frase no topo de cada aba
async function answer(screen, api, k) {
  const el = screen.querySelector('#t-ans'); if (!el) return;
  try {
    if (k === 'carga') {
      const [t, r, li] = await Promise.all([longtrend(api, evoWin), api('/api/strain-weeks?weeks=4'), loadInsights(api).catch(() => null)]);
      const sm = t.summary, z = zoneOfPct(sm.formPct), w = r.weeks[r.weeks.length - 1];
      const st = { abaixo: 'abaixo da sua faixa', dentro: 'dentro da sua faixa', acima: 'acima da sua faixa', bem_acima: 'bem acima da sua faixa' }[w.status];
      el.innerHTML = `${li?.status ? `<b class="st-${li.status.key}">${esc(li.status.label)}.</b> ${esc(li.status.txt)}${li.status.why ? `<small class="t-why">Por quê: ${esc(li.status.why)}.</small>` : ''}` : ''}<small class="t-why">${st ? `Semana ${st} (${nf(w.total)} de ${nf(w.lo)}–${nf(w.hi)}). ` : ''}${z ? `Forma <b class="z-${z.key}">${signed(sm.formPct)}%, ${z.label.toLowerCase()}</b>.` : ''}</small>`;
    } else if (k === 'corpo') {
      const [t, h, c] = await Promise.all([longtrend(api, recWin), api('/api/hrvtrend').catch(() => null), api('/api/stress31').catch(() => null)]);
      const sig = [h ? `HRV de 7 noites: ${h.label.toLowerCase()}` : null, c ? `estresse do mês: ${c.label.toLowerCase()}` : null].filter(Boolean).join(' · ');
      el.innerHTML = t.verdict ? `<b>${esc(t.verdict.answer)}</b> ${esc(t.verdict.trendTxt)}${sig ? `<small class="t-why">${esc(sig.charAt(0).toUpperCase() + sig.slice(1))}.</small>` : ''}` : 'Ainda sem dados suficientes.';
    } else {
      const d = await raceData(api);
      const pr = d.projection, end = pr?.raceDay ? { ...pr.raceDay, date: d.race.date } : pr?.end;
      const dd = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { day: 'numeric', month: 'numeric' });
      el.innerHTML = `Aracaju em <b>${d.race.days} dias</b>.${end?.formPct != null ? ` Forma prevista ${pr.raceDay ? 'no dia da prova' : `em ${dd(end.date)}`}: <b class="z-${end.zone?.key}">${signed(end.formPct)}%</b>, ${esc(end.zone?.label.toLowerCase() ?? '')}.` : ''}${d.halfPrediction ? ` Meia isolada hoje: <b>${tfmt(d.halfPrediction)}</b>.` : ''}`;
    }
  } catch { el.textContent = ''; }
  // o detalhe (por quê, faixa da semana, Forma) fica atrás do ⓘ: à vista só a resposta
  const more = screen.querySelector('#t-more'), why = [...el.querySelectorAll('.t-why')];
  if (more && why.length) {
    more.innerHTML = why.map((w) => `<p>${w.innerHTML}</p>`).join(''); why.forEach((w) => w.remove());
    screen.querySelector('.t-answer .info-btn').hidden = false;
  }
}
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
    <ul class="acts">${d.contributors.map((c) => `<li><span>${esc(c.label)}</span><span class="meta ${ST[c.state][1]}">${ST[c.state][0]}${c.k === 'reg' && c.pct != null ? ` · ${c.pct}% das noites irregulares` : ''}${c.k === 'carga' ? ` · ${c.days} de 31 dias` : ''}</span></li>`).join('')}</ul>
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
async function calibSec(box, api) {
  const sec = box.querySelector('#calib');
  sec.innerHTML = '<p class="empty">Carregando…</p>';
  let d; try { d = await api('/api/calibration'); } catch (e) { sec.innerHTML = `<p class="empty">Não carregou: ${esc(e.message)}</p>`; return; }
  const SN = { hrv: 'HRV', sleep: 'Sono', rhr: 'FC de repouso', resp: 'Respiração', stress: 'Estresse' };
  const pctDone = Math.min(100, Math.round((d.withRec / d.target) * 100));
  const read = d.rho == null ? '' : d.rho >= 0.5 ? 'o REC acompanha bem como você se sente' : d.rho >= 0.3 ? 'o REC acompanha em parte como você se sente' : d.rho >= 0.1 ? 'relação fraca entre o REC e como você se sente' : 'o REC ainda não acompanha como você se sente';
  sec.innerHTML = `
    <p class="headline">${d.withRec} de ${d.target} notas "como me sinto" com REC.${d.withRec >= 15 && d.rho != null ? ` Concordância ${nf(d.rho, 2)}: ${read}.` : ' Com 15 notas aparece a primeira leitura.'}</p>
    <div class="wk-bar"><i style="width:${pctDone}%"></i></div>
    ${d.withRec >= 15 ? `<ul class="acts">${d.groups.filter((g) => g.n).map((g) => `<li><span>Dias em que se sentiu ${esc(g.label.toLowerCase())}</span><span class="meta">REC médio <b>${g.rec}</b> · ${g.n} dias</span></li>`).join('')}</ul>
      <p class="note">Sinal que mais acompanha a sua nota: ${d.signals.filter((x) => x.rho != null).sort((a, b) => b.rho - a.rho).slice(0, 2).map((x) => `${SN[x.k]} (${nf(x.rho, 2)})`).join(', ') || '–'}.</p>` : ''}
    ${d.withRec >= 15 && d.ready?.rho != null ? `<p class="note">Prontidão × como me sinto: concordância <b>${nf(d.ready.rho, 2)}</b> (${d.ready.n} dias)${d.rho != null ? `; o REC sozinho: ${nf(d.rho, 2)}` : ''}. Se a Prontidão ficar abaixo do REC, os pesos da carga e do sono precisam de ajuste.</p>` : ''}
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
    if (o.area) svg += `<path d="${path(o.values)} L${x(n - 1)},${H} L0,${H} Z" style="fill:${o.color};opacity:.12"/>`;
    svg += `<path d="${path(o.values)}" class="bl-line" style="stroke:${o.color}"/>`;
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
  const yt = o.axes === false ? '' : yTicks.map((v) => `<text x="${W}" y="${y(v) + 3}" class="ax" text-anchor="end">${o.yFmt ? o.yFmt(v) : nf(v)}</text>`).join('');
  const xi = o.axes === false ? [] : [0, Math.round((n - 1) / 2), n - 1];
  const xt = xi.map((i, k) => `<text x="${x(i)}" y="${H + (o.strip ? 30 : 14)}" class="ax" text-anchor="${k === 0 ? 'start' : k === 2 ? 'end' : 'middle'}">${fmtDay(o.dates[i])}</text>`).join('');
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
    <div class="legend form-legend">${FORM_ZONES.map((f) => `<span><i class="dot" style="background:var(--z-${f.key})"></i>${f.label}</span>`).join('')}</div>
    ${winSeg(evoWin, 'ew')}
    <details class="explain">
      <summary>Como ler</summary>
      <p><b>Fitness</b> (área azul): quanto treino seu corpo está acostumado a fazer, a média do seu Strain nas últimas 6 semanas. Subindo devagar = você está aumentando a carga de forma sustentável.</p>
      <p><b>Fadiga</b> (linha rosa): a mesma conta para a última semana. Quando fica acima do Fitness, você está treinando mais que o seu normal.</p>
      <p><b>Faixa colorida</b> embaixo: a Forma de cada dia, (Fitness − Fadiga) ÷ Fitness. Âmbar é bloco de treino, cinza equilibrado, azul descansado; rosa é cansaço demais. Antes de uma prova, o objetivo é terminar no azul.</p>
      <p><b>Strain</b>: minutos em cada zona de FC × peso da zona (Z1 vale 1, Z5 vale 5). Método do TrainingPeaks e do Strava; compare você com você mesmo.</p>
    </details>`;
  const days = t.days;
  bandLine(sec.querySelector('#ch-evo'), {
    dates: days.map((x) => x.date), values: days.map((x) => x.fitness), color: 'var(--fitness)', area: true, height: 130, label: 'Fitness e fadiga',
    extra: [{ values: days.map((x) => x.fatigue), color: 'var(--fatigue)' }],
    strip: days.map((x) => (x.formPct == null ? null : `var(--z-${zoneOfPct(x.formPct).key})`)),
    tip: (i) => row('Fitness', nf(days[i].fitness)) + row('Fadiga', nf(days[i].fatigue)) + row('Forma', days[i].formPct == null ? '–' : `${signed(days[i].formPct)}%`),
  });
  sec.querySelectorAll('[data-ew]').forEach((b) => b.addEventListener('click', () => { evoWin = Number(b.dataset.ew); evolve(box, api); }));
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
    <p class="headline">${d.totals.length ? `${multi ? `${hm(perWeek)} por semana` : `${hm(d.total.hours)} ${unit === 'semana' ? 'na semana' : 'até agora'}`}, ${nf(d.total.sessions)} sessões.` : 'Sem treinos neste período.'}</p>
    ${d.totals.length ? `<ul class="acts sports">
      <li class="head"><span>Modalidade</span><span>Horas</span><span>${multi ? '/semana' : 'Sessões'}</span><span>Strain</span></li>
      ${d.totals.map((t) => `<li><span><i class="dot s-${t.sport}"></i>${esc(t.label)}</span><span>${hm(t.hours)}</span><span>${multi ? hm(t.perWeek) : t.sessions}</span><span>${nf(t.strain)}</span></li>`).join('')}
      <li class="total"><span>Total</span><span>${hm(d.total.hours)}</span><span>${multi ? hm(perWeek) : d.total.sessions}</span><span>${nf(d.total.strain)}</span></li>
    </ul>` : ''}
    ${zt ? `<h3 class="sub">Tempo em zonas</h3>
      <div class="zstack">${d.zones.map((z) => (z.hours ? `<i class="zc-${z.zone}" style="flex:${z.hours}"></i>` : '')).join('')}</div>
      <ul class="zlist">${d.zones.filter((z) => z.hours > 0).map((z) => `<li><i class="zc-${z.zone}"></i><span>${ZSHORT[z.zone]}</span><b>${hm(z.hours)}</b><em>${Math.round(((z.hours ?? 0) / zt) * 100)}%</em></li>`).join('')}</ul>
      <h3 class="sub">Intensidade (referência 80/20)</h3>
      ${distBar({ low: easy, mid, high: hard })}
      <p class="note">Bike, corrida, natação e Hyrox (academia fora). Zonas do seu Garmin. Leve = até Z2, média = Z3, alta = Z4 e Z5. Referência de endurance: ~80% leve e ~20% média + alta.</p>` : ''}`;
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
