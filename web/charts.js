// Gráficos em SVG puro, finos, cinza e branco. Toque/arraste mostra o valor do dia.
const NS = 'http://www.w3.org/2000/svg';
const W = 340; // largura lógica; o SVG escala para a tela

const fmtDay = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }).replace('.', '');
const nf = (v, d = 0) => (v == null ? '–' : v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }));
export { fmtDay, nf };

function niceRange(vals, { zero = false, pad = 0.08 } = {}) {
  const xs = vals.filter((v) => v != null && Number.isFinite(v));
  if (!xs.length) return [0, 1];
  let lo = Math.min(...xs), hi = Math.max(...xs);
  if (zero) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
  if (lo === hi) { lo -= 1; hi += 1; }
  const p = (hi - lo) * pad;
  return [zero && lo >= 0 ? 0 : lo - p, hi + p];
}

function el(tag, attrs = {}, parent) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}

/** Eixo X: 3–4 rótulos de data. */
function xLabels(svg, dates, x, h) {
  const n = dates.length, idx = n <= 7 ? dates.map((_, i) => i) : [0, Math.round((n - 1) / 3), Math.round((2 * (n - 1)) / 3), n - 1];
  const fmt = n <= 7 ? (d) => new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'narrow' }) : fmtDay;
  for (const i of [...new Set(idx)]) {
    const t = el('text', { x: x(i), y: h + 14, class: 'ax', 'text-anchor': i === 0 && n > 7 ? 'start' : i === n - 1 && n > 7 ? 'end' : 'middle' }, svg);
    t.textContent = fmt(dates[i]);
  }
}

function niceStep(span, target = 3) {
  const raw = span / target, mag = 10 ** Math.floor(Math.log10(raw)), f = raw / mag;
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * mag;
}

/** Linhas de grade em valores redondos (0, 50, 100…), rótulo à direita. */
function yGrid(svg, lo, hi, y, fmt) {
  const step = niceStep(hi - lo);
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) {
    const r = Math.round(v * 1000) / 1000;
    if (y(r) < 4 || y(r) > y(lo) - 4) continue;
    el('line', { x1: 0, x2: W - 30, y1: y(r), y2: y(r), class: r === 0 ? 'zero' : 'grid' }, svg);
    const t = el('text', { x: W, y: y(r) + 3, class: 'ax', 'text-anchor': 'end' }, svg);
    t.textContent = fmt(r);
  }
}

/** Camada de toque: linha vertical + caixinha com os valores do dia. */
function hover(wrap, svg, n, x, h, rowsFor) {
  const rule = el('line', { y1: 0, y2: h, class: 'rule', visibility: 'hidden' }, svg);
  const tip = document.createElement('div');
  tip.className = 'tip'; tip.hidden = true; wrap.appendChild(tip);
  const hit = el('rect', { x: 0, y: 0, width: W, height: h, fill: 'transparent' }, svg);
  const show = (ev) => {
    const box = svg.getBoundingClientRect();
    const px = ((ev.clientX - box.left) / box.width) * W;
    let i = 0, best = Infinity;
    for (let k = 0; k < n; k++) { const d = Math.abs(x(k) - px); if (d < best) { best = d; i = k; } }
    rule.setAttribute('x1', x(i)); rule.setAttribute('x2', x(i)); rule.setAttribute('visibility', 'visible');
    tip.innerHTML = rowsFor(i); tip.hidden = false;
    const left = (x(i) / W) * box.width;
    tip.style.left = `${Math.min(Math.max(left - tip.offsetWidth / 2, 0), box.width - tip.offsetWidth)}px`;
  };
  const hide = () => { rule.setAttribute('visibility', 'hidden'); tip.hidden = true; };
  hit.addEventListener('pointerdown', show);
  hit.addEventListener('pointermove', show);
  hit.addEventListener('pointerleave', hide);
  hit.style.touchAction = 'pan-y';
}

/**
 * Linhas. series: [{ name, values, cls: 'l1'|'l2'|'base', label?: true }]
 * opts: { dates, height, yFmt, zero, tip(i) -> html, dots?: (i) => cor | null }
 */
export function lineChart(wrap, series, opts) {
  const h = opts.height ?? 120, n = opts.dates.length;
  const [lo, hi] = opts.range ?? niceRange(series.flatMap((s) => s.values), { zero: opts.zero });
  const x = (i) => (n === 1 ? W / 2 : (i / (n - 1)) * (W - 34) + 2);
  const y = (v) => h - ((v - lo) / (hi - lo)) * h;
  const svg = el('svg', { viewBox: `0 -6 ${W} ${h + 24}`, class: 'chart', role: 'img', 'aria-label': opts.label ?? '' });
  yGrid(svg, lo, hi, y, opts.yFmt ?? ((v) => nf(v)));
  if (opts.zero) el('line', { x1: 0, x2: W, y1: y(0), y2: y(0), class: 'zero' }, svg);
  for (const b of opts.bands ?? []) el('rect', { x: 0, width: W, y: y(b[1]), height: Math.max(0, y(b[0]) - y(b[1])), class: 'band' }, svg);

  for (const s of series) {
    let d = '', pen = false;
    s.values.forEach((v, i) => {
      if (v == null) { pen = false; return; }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`; pen = true;
    });
    el('path', { d, class: `ln ${s.cls ?? 'l1'}` }, svg);
    if (opts.dots) s.values.forEach((v, i) => { if (v != null) { const c = opts.dots(i, v); if (c) el('circle', { cx: x(i), cy: y(v), r: n > 60 ? 2 : 3.5, style: `fill:${c}` }, svg); } });
    // rótulo direto no fim da linha
    if (s.label) {
      let i = s.values.length - 1; while (i > 0 && s.values[i] == null) i--;
      if (s.values[i] != null) { const t = el('text', { x: x(i) + 4, y: y(s.values[i]) + 4, class: `dl ${s.cls ?? 'l1'}` }, svg); t.textContent = s.name; }
    }
  }
  xLabels(svg, opts.dates, x, h);
  wrap.appendChild(svg);
  if (opts.tip) hover(wrap, svg, n, x, h, opts.tip);
}

/** Barras de uma série (valores ≥ 0, ou ± com zero). */
export function barChart(wrap, values, opts) {
  const h = opts.height ?? 110, n = values.length;
  const [lo, hi] = niceRange(values, { zero: true, pad: 0.1 });
  const slot = (W - 34) / n, bw = Math.max(2, Math.min(18, slot - 2));
  const x = (i) => i * slot + slot / 2 + 2;
  const y = (v) => h - ((v - lo) / (hi - lo)) * h;
  const svg = el('svg', { viewBox: `0 -6 ${W} ${h + 24}`, class: 'chart', role: 'img', 'aria-label': opts.label ?? '' });
  yGrid(svg, lo, hi, y, opts.yFmt ?? ((v) => nf(v)));
  el('line', { x1: 0, x2: W, y1: y(0), y2: y(0), class: 'zero' }, svg);
  values.forEach((v, i) => {
    if (v == null || v === 0) return;
    const top = Math.min(y(v), y(0)), ht = Math.abs(y(v) - y(0));
    const r = Math.min(2, bw / 2, ht / 2);
    el('rect', { x: x(i) - bw / 2, y: top, width: bw, height: Math.max(ht, 1), rx: r, class: v < 0 ? 'bar neg' : `bar${opts.highlightLast && i === n - 1 ? ' hl' : ''}` }, svg);
  });
  for (const ref of opts.refs ?? []) {
    el('line', { x1: 0, x2: W - 34, y1: y(ref.v), y2: y(ref.v), class: 'ref' }, svg);
    const t = el('text', { x: W, y: y(ref.v) + 3, class: 'ax ref-l', 'text-anchor': 'end' }, svg); t.textContent = ref.label;
  }
  xLabels(svg, opts.dates, x, h);
  wrap.appendChild(svg);
  if (opts.tip) hover(wrap, svg, n, x, h, opts.tip);
}
