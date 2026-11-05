// REC — desenho do widget (Scriptable). Baixado pelo script "REC" a cada atualização: mudanças aqui chegam sozinhas no iPhone.
// module.exports = async (APP, family) => ListWidget

const STOPS = ['#e2614f', '#d98aa6', '#b3a7e6', '#86c3f2', '#74e6ff'].map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));
const hex = (c) => '#' + c.map((n) => Math.round(n).toString(16).padStart(2, '0')).join('');
function rgb(v) {
  if (v == null) return [107, 109, 117];
  const x = Math.max(0, Math.min(100, v)) / 25, i = Math.min(3, Math.floor(x)), k = x - i;
  return STOPS[i].map((a, j) => a + (STOPS[i + 1][j] - a) * k);
}
const col = (c, a = 1) => new Color(hex(c), a);

// anel: trilho tingido, arco grosso com ponta redonda, número grande com % ao lado
function ring(v, c, dim, S) {
  const W = S * 0.1, dc = new DrawContext();
  dc.size = new Size(S, S); dc.opaque = false; dc.respectScreenScale = true;
  const r = (S - W) / 2 - 2, cx = S / 2, cy = S / 2;
  const arc = (to, colorAt) => {
    const steps = Math.max(2, Math.ceil(to * 160));
    for (let s = 0; s < steps; s++) {
      const a1 = -Math.PI / 2 + 2 * Math.PI * to * (s / steps), a2 = -Math.PI / 2 + 2 * Math.PI * to * ((s + 1) / steps);
      const p = new Path(); p.move(new Point(cx + r * Math.cos(a1), cy + r * Math.sin(a1))); p.addLine(new Point(cx + r * Math.cos(a2), cy + r * Math.sin(a2)));
      dc.addPath(p); dc.setStrokeColor(colorAt(s / steps)); dc.setLineWidth(W); dc.strokePath();
    }
    // pontas redondas
    for (const t of [0, to]) {
      const a = -Math.PI / 2 + 2 * Math.PI * t;
      dc.setFillColor(colorAt(t / to)); dc.fillEllipse(new Rect(cx + r * Math.cos(a) - W / 2, cy + r * Math.sin(a) - W / 2, W, W));
    }
  };
  arc(1, () => col(c, 0.16));
  // arco em degradê pela escala de cores, do 0 até o valor do dia (igual ao app)
  if (v != null) arc(Math.max(0.02, v / 100), (k) => col(rgb(v * k), dim ? 0.45 : 1));
  const txt = v == null ? '–' : String(v), fs = S * 0.34, w = txt.length * fs * 0.56;
  dc.setFont(Font.semiboldRoundedSystemFont(fs)); dc.setTextColor(dim ? new Color('#ffffff', 0.5) : Color.white());
  dc.drawText(txt, new Point(cx - (w + fs * 0.32) / 2, cy - fs * 0.62));
  if (v != null) { dc.setFont(Font.mediumRoundedSystemFont(fs * 0.36)); dc.setTextColor(col(c, dim ? 0.5 : 0.9)); dc.drawText('%', new Point(cx - (w + fs * 0.32) / 2 + w + 2, cy - fs * 0.05)); }
  return dc.getImage();
}

function centered(parent, build) { const s = parent.addStack(); s.addSpacer(); build(s); s.addSpacer(); return s; }
function label(stack, t, size, color, weight = 'semibold') {
  const x = stack.addText(t); x.font = weight === 'bold' ? Font.boldRoundedSystemFont(size) : weight === 'regular' ? Font.regularRoundedSystemFont(size) : Font.semiboldRoundedSystemFont(size);
  x.textColor = color; x.lineLimit = 1; x.minimumScaleFactor = 0.7; return x;
}

module.exports = async (APP, family) => {
  let d = null;
  try { d = await new Request(`${APP}/api/widget`).loadJSON(); } catch (e) { d = null; }
  const w = new ListWidget();
  w.url = APP; w.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000);
  if (!d || d.error) { w.backgroundColor = new Color('#0b0b0d'); label(w, 'REC: sem conexão', 13, new Color('#9a9ca3')); return w; }

  const wait = d.ready == null && d.readyPrev != null;
  const v = d.ready ?? d.readyPrev, c = rgb(v);
  // fundo: preto com um brilho da cor da Prontidão vindo de cima
  const g = new LinearGradient(); g.colors = [col(c, wait ? 0.14 : 0.32), new Color('#0b0b0d')]; g.locations = [0, 0.75]; w.backgroundGradient = g;
  const grey = new Color('#ffffff', 0.55), white = Color.white();

  if (family === 'small') {
    w.setPadding(12, 12, 12, 12);
    w.addSpacer();
    centered(w, (s) => { const im = s.addImage(ring(v, c, wait, 200)); im.imageSize = new Size(104, 104); });
    w.addSpacer(4);
    centered(w, (s) => label(s, wait ? 'ontem · esperando a noite' : `REC ${d.rec ?? '–'}`, 12, grey));
    w.addSpacer();
    return w;
  }

  // médio: anel à esquerda; à direita, três números e o treino do dia
  w.setPadding(14, 16, 14, 16);
  const row = w.addStack(); row.centerAlignContent();
  const left = row.addStack(); left.layoutVertically(); left.centerAlignContent();
  const im = left.addImage(ring(v, c, wait, 240)); im.imageSize = new Size(118, 118);
  if (wait) { left.addSpacer(2); const lb = left.addStack(); lb.size = new Size(118, 0); lb.addSpacer(); label(lb, 'ontem', 11, grey, 'regular'); lb.addSpacer(); }

  row.addSpacer(16);
  const right = row.addStack(); right.layoutVertically();
  const nums = right.addStack(); nums.spacing = 14;
  const cell = (k, val, sub) => { const s = nums.addStack(); s.layoutVertically(); label(s, k, 11, grey, 'regular'); label(s, val, 22, white, 'bold'); if (sub) label(s, sub, 10, grey, 'regular'); };
  cell('REC', d.rec == null ? '–' : String(d.rec), null);
  cell('Forma', d.form == null ? '–' : `${d.form > 0 ? '+' : d.form < 0 ? '−' : ''}${Math.abs(d.form)}%`, null);
  cell('Strain', String(d.strain ?? 0), d.target ? `meta ${d.target}` : null);
  right.addSpacer(12);
  // treino do dia: uma linha por sessão (até 2), com espaço
  const pl = d.planned ?? [];
  label(right, 'Treino de hoje', 11, grey, 'regular');
  right.addSpacer(2);
  if (!pl.length) label(right, 'Sem treino planejado', 13, white);
  for (const p of pl.slice(0, 2)) { const s = right.addStack(); label(s, `${p.label}${p.min ? ` · ${p.min} min` : ''}`, 13, white); right.addSpacer(1); }
  return w;
};
