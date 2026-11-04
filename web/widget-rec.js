// REC — widget para o iPhone (app Scriptable, gratuito).
// Como instalar: Scriptable → + → cole este código → nome "REC". Na tela inicial: segure → + → Scriptable →
// widget pequeno ou médio → toque nele → Script: REC.
// Troque o endereço abaixo pelo endereço do seu app (o mesmo que abre no Safari). Não precisa de chave.
const APP = 'https://SEU-APP.workers.dev';

const STOPS = ['#e2614f', '#d98aa6', '#b3a7e6', '#86c3f2', '#74e6ff'].map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));
function readyColor(v) {
  if (v == null) return new Color('#6b6d75');
  const x = Math.max(0, Math.min(100, v)) / 25, i = Math.min(3, Math.floor(x)), k = x - i;
  const c = STOPS[i].map((a, j) => Math.round(a + (STOPS[i + 1][j] - a) * k));
  return new Color('#' + c.map((n) => n.toString(16).padStart(2, '0')).join(''));
}

function ring(value, color, dim) {
  const S = 220, W = 18, dc = new DrawContext();
  dc.size = new Size(S, S); dc.opaque = false; dc.respectScreenScale = true;
  const r = (S - W) / 2, cx = S / 2, cy = S / 2;
  const arc = (from, to, col) => {
    const p = new Path(); const steps = Math.max(2, Math.ceil((to - from) * 120));
    for (let s = 0; s <= steps; s++) {
      const a = -Math.PI / 2 + 2 * Math.PI * (from + (to - from) * (s / steps));
      const pt = new Point(cx + r * Math.cos(a), cy + r * Math.sin(a));
      if (s === 0) p.move(pt); else p.addLine(pt);
    }
    dc.addPath(p); dc.setStrokeColor(col); dc.setLineWidth(W); dc.strokePath();
  };
  arc(0, 1, new Color('#24252a'));
  if (value != null) arc(0, Math.max(0.01, value / 100), dim ? new Color(color.hex, 0.38) : color);
  dc.setTextAlignedCenter(); dc.setFont(Font.lightSystemFont(66)); dc.setTextColor(dim ? new Color('#ffffff', 0.45) : color);
  dc.drawTextInRect(value == null ? '–' : `${value}`, new Rect(0, S / 2 - 46, S, 80));
  dc.setFont(Font.systemFont(20)); dc.setTextColor(new Color('#9a9ca3'));
  dc.drawTextInRect('%', new Rect(0, S / 2 + 30, S, 30));
  return dc.getImage();
}

async function main() {
  let d = null;
  try { d = await new Request(`${APP}/api/widget`).loadJSON(); } catch (e) { d = null; }
  const w = new ListWidget();
  w.backgroundColor = new Color('#000000');
  w.url = APP;
  w.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000);
  if (!d || d.error) { const t = w.addText('REC: sem conexão'); t.textColor = new Color('#9a9ca3'); t.font = Font.systemFont(13); return w; }

  const wait = d.ready == null && d.readyPrev != null;
  const v = d.ready ?? d.readyPrev, col = readyColor(v);
  const small = config.widgetFamily === 'small' || !config.runsInWidget;
  const row = w.addStack(); row.centerAlignContent();
  const left = row.addStack(); left.layoutVertically(); left.centerAlignContent();
  const img = left.addImage(ring(v, col, wait)); img.imageSize = new Size(small ? 92 : 104, small ? 92 : 104);
  const lab = left.addText(wait ? 'Prontidão (ontem)' : 'Prontidão'); lab.font = Font.mediumSystemFont(11); lab.textColor = new Color('#9a9ca3');

  if (!small) {
    row.addSpacer(16);
    const right = row.addStack(); right.layoutVertically();
    const line = (k, val) => { const s = right.addStack(); const a = s.addText(k + '  '); a.font = Font.systemFont(12); a.textColor = new Color('#9a9ca3'); const b = s.addText(val); b.font = Font.semiboldSystemFont(12); b.textColor = Color.white(); right.addSpacer(3); };
    line('REC', d.rec == null ? '–' : String(d.rec));
    if (d.form != null) line('Forma', `${d.form > 0 ? '+' : ''}${d.form}% · ${d.formLabel ?? ''}`);
    line('Strain', `${d.strain}${d.target ? ` de ${d.target}` : ''}`);
    if (d.planned?.length) line('Treino', d.planned.map((p) => `${p.label}${p.min ? ` ${p.min}′` : ''}`).join(' + '));
    if (d.bedtime) line('Deitar até', d.bedtime);
    if (d.race != null && d.race >= 0) line('Aracaju', d.race === 0 ? 'hoje' : `${d.race} dias`);
  }
  return w;
}

const widget = await main();
if (config.runsInWidget) Script.setWidget(widget); else await widget.presentMedium();
Script.complete();
