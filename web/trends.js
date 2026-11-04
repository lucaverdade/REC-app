// Aba Tendências: períodos de calendário (semana seg–dom, mês, 3 e 6 meses, 1 ano) com navegação.
import { fmtDay, lineChart, nf } from './charts.js';

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

export async function renderTrends(screen, api) {
  document.documentElement.style.setProperty('--rec', 'var(--text-3)');
  screen.innerHTML = `
    <header class="top"><h1>Tendências</h1></header>
    <section class="block" id="sw"></section>
    <section class="block" id="evo"></section>
    <section class="block" id="pred"></section>
    <section class="block" id="vol"></section>
    <section class="block" id="recov"></section>
    <section class="block" id="hrvt"></section>
    <section class="block" id="aero"></section>
    <section class="block" id="habs"></section>`;
  const box = screen;
  strainWeeks(box, api);
  evolve(box, api);
  predictions(box, api);
  volume(box, api);
  recovery(box, api);
  hrvTrendSec(box, api);
  aerobicSec(box, api);
  habits(box, api);
}

// ---------- Base aeróbica (versão simples, 03/11) ----------
// Pergunta: no treino longo e leve, a FC fica estável até o fim no mesmo ritmo?
const median = (v) => { const s = [...v].sort((a, b) => a - b), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
export const decShort = (d) => (d < 5 ? `FC estável (${nf(d, 1)}%)` : `FC subiu ${nf(d, 1)}%`);
async function aerobicSec(box, api) {
  const sec = box.querySelector('#aero');
  sec.innerHTML = '<h2>Base aeróbica</h2><p class="empty">Carregando…</p>';
  let d; try { d = await api('/api/aerobic'); } catch (e) { sec.querySelector('.empty').textContent = `Não carregou: ${e.message}`; return; }
  const dec = d.decoupling;
  const dfmt = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { day: 'numeric', month: 'numeric' });
  const hmin = (m) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${String(m % 60).padStart(2, '0')}` : ''}` : `${m} min`);
  const now = median(dec.slice(-4).map((x) => x.decoupling)), before = dec.length >= 8 ? median(dec.slice(-8, -4).map((x) => x.decoupling)) : null;
  let head;
  if (!d.done) head = 'Os arquivos dos treinos ainda não foram lidos. O app lê aos poucos quando você abre a aba Hoje.';
  else if (!dec.length) head = 'Ainda não há treino longo e leve que dê para comparar (60 min ou mais, quase todo até a Z2).';
  else head = `Nos seus treinos longos e leves, a FC subiu em média <b>${nf(now, 1)}%</b> do começo ao fim, no mesmo ritmo. ${now < 5 ? 'Abaixo de 5%: a base aguenta essa duração.' : 'Acima de 5%: essa duração ainda cansa.'}${before != null ? ` Nos 4 anteriores era ${nf(before, 1)}%.` : ''}`;
  const efs = d.ef, efA = efs.slice(-4).map((x) => x.ef), efB = efs.slice(-8, -4).map((x) => x.ef);
  const efCh = efB.length >= 4 ? Math.round(((median(efA) - median(efB)) / median(efB)) * 100) : null;
  sec.innerHTML = `
    <h2>Base aeróbica</h2>
    <p class="headline">${head}</p>
    ${dec.length ? `<ul class="acts">${dec.slice(-5).reverse().map((x) => `<li><span><i class="dot s-${x.sport}"></i>${dfmt(x.date)} · ${x.label} ${hmin(x.min)}${x.indoor ? (x.sport === 'bike' ? ' (rolo)' : ' (indoor)') : ''}</span><span class="meta ${x.decoupling < 5 ? 'c-good' : ''}">${decShort(x.decoupling)}</span></li>`).join('')}</ul>` : ''}
    ${d.skipped?.length ? (() => { const g = new Map(); d.skipped.forEach((x) => g.set(x.reason, [...(g.get(x.reason) ?? []), dfmt(x.date)])); return [...g].map(([r, ds]) => `<p class="note">Não comparados (${esc(r)}): ${ds.join(', ')}.</p>`).join(''); })() : ''}
    ${efCh != null ? `<p class="note">Bike com potência, treinos leves: ${efCh === 0 ? 'mesma' : `${efCh > 0 ? '+' : '−'}${Math.abs(efCh)}%`} potência por batimento nos últimos 4 contra os 4 anteriores.</p>` : ''}
    <details class="explain"><summary>Para que serve e o que é comparado</summary>
      <p>Num treino longo e leve no mesmo ritmo, a FC deveria ficar parecida do começo ao fim. Quando ela sobe sozinha na segunda metade, o corpo está se cansando para manter aquele ritmo. Abaixo de 5% de subida é sinal de que a base aguenta aquela duração; no 70.3 é o que decide se sobra perna para os 21 km.</p>
      <p>A comparação é <b>dentro do mesmo treino</b> (primeira metade × segunda, sem os 10 primeiros minutos). Bike, pneu, rolo e percurso são os mesmos nas duas metades, então diferenças entre dias não entram.</p>
      <p>Fica de fora o que atrapalha dentro do treino: bike na rua sem potência (vento e subidas mudam a velocidade), esteira (velocidade do relógio não é confiável) e corridas com subida muito diferente entre as metades. Paradas não contam. O calor subindo ao longo do treino também puxa a FC e não dá para separar: em dia quente o número sai mais alto.</p>
    </details>`;
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
const parseT = (txt) => {
  const p = String(txt || '').trim().split(':').map(Number);
  if (!p.length || p.some((x) => !Number.isFinite(x))) return null;
  return p.length === 3 ? p[0] * 60 + p[1] + p[2] / 60 : p.length === 2 ? p[0] + p[1] / 60 : null;
};

async function predictions(box, api) {
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
        ${PD.map(([k, l]) => `<label>${l}<input name="${k}" inputmode="numeric" placeholder="${k === 'd5' || k === 'd10' ? 'mm:ss' : 'h:mm:ss'}"></label>`).join('')}
        <button class="btn" type="submit">Salvar</button>
        ${p.calibrated ? '<button class="btn ghost" type="button" data-reset>Remover calibração</button>' : ''}
      </form>
      <p class="progress" id="pd-msg"></p>
    </details>`;

  sec.querySelectorAll('.pd').forEach((b) => b.addEventListener('click', () => { pDist = b.dataset.k; predictions(box, api); }));
  sec.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => { pMonths = Number(b.dataset.m); predictions(box, api); }));
  const form = sec.querySelector('.pd-cal'), msg = sec.querySelector('#pd-msg');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {};
    for (const [k] of PD) { const t = parseT(form.elements[k].value); if (t) body[k] = t; }
    if (!Object.keys(body).length) { msg.textContent = 'Preencha pelo menos uma distância (ex.: 22:30 ou 1:41:00).'; return; }
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
