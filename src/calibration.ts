// Calibração do REC (spec: modo sombra nas primeiras 6–8 semanas). Compara o REC de cada manhã com a nota
// "como me sinto" (1–10) do mesmo dia. Com 40+ notas dá para ajustar pesos e limites com segurança.
export const TARGET_NOTES = 40;
const rank = (v: number[]) => { const idx = v.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]); const r = new Array(v.length);
  for (let i = 0; i < idx.length;) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2 + 1; i = j + 1; } return r; };
function pearson(a: number[], b: number[]) {
  const n = a.length, ma = a.reduce((x, y) => x + y, 0) / n, mb = b.reduce((x, y) => x + y, 0) / n;
  let num = 0, da = 0, db = 0; for (let i = 0; i < n; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return da && db ? num / Math.sqrt(da * db) : null;
}
export const spearman = (a: number[], b: number[]) => (a.length >= 5 ? pearson(rank(a), rank(b)) : null);

export function calibration(rows: { date: string; feel: number; rec: number | null; z: Record<string, number | null> }[]) {
  const ok = rows.filter((r) => r.rec != null);
  const r2 = (x: number | null) => (x == null ? null : Math.round(x * 100) / 100);
  const groups = [['Mal (1–4)', 1, 4], ['Normal (5–6)', 5, 6], ['Bem (7–10)', 7, 10]].map(([l, lo, hi]) => {
    const g = ok.filter((r) => r.feel >= (lo as number) && r.feel <= (hi as number));
    return { label: l as string, n: g.length, rec: g.length ? Math.round(g.reduce((a, r) => a + (r.rec as number), 0) / g.length) : null };
  });
  const signals = ['hrv', 'sleep', 'rhr', 'resp', 'stress'].map((k) => {
    const p = ok.filter((r) => r.z[k] != null);
    return { k, n: p.length, rho: r2(spearman(p.map((r) => r.z[k] as number), p.map((r) => r.feel))) };
  });
  return {
    notes: rows.length, withRec: ok.length, target: TARGET_NOTES, ready: ok.length >= TARGET_NOTES,
    rho: r2(spearman(ok.map((r) => r.rec as number), ok.map((r) => r.feel))),
    groups, signals,
  };
}
