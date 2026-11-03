// Paridade TS x Python. Requer data/daily_metrics.csv e data/reference_out.json (fora do git).
import { readFileSync, existsSync } from 'node:fs';
import { computeRec, type DailyInput } from '../src/rec.ts';

const csvPath = 'data/daily_metrics.csv';
const refPath = 'data/reference_out.json';
if (!existsSync(csvPath) || !existsSync(refPath)) {
  console.log('SKIP: dados locais ausentes (rode scripts/dump_reference.py)');
  process.exit(0);
}

const [header, ...lines] = readFileSync(csvPath, 'utf8').trim().split(/\r?\n/);
const cols = header.split(',');
const num = (s: string | undefined) => (s === undefined || s === '' ? null : Number(s));
const rows: DailyInput[] = lines.map((l) => {
  const v = l.split(',');
  const g = (c: string) => v[cols.indexOf(c)];
  return { date: g('date').slice(0, 10), hrv: num(g('hrv')), rhr: num(g('rhr')),
           sleep_h: num(g('sleep_h')), resp: num(g('resp')), stress: num(g('stress')) };
});

const ts = computeRec(rows);
const ref: any[] = JSON.parse(readFileSync(refPath, 'utf8'));
if (ts.length !== ref.length) throw new Error(`tamanho difere: ${ts.length} vs ${ref.length}`);

let maxDiff = 0, worst = '', nRec = 0, mismatchNull = 0;
const fields: [string, (r: typeof ts[0]) => number | null][] = [
  ['REC', (r) => r.rec], ['z_hrv', (r) => r.z.hrv], ['z_rhr', (r) => r.z.rhr],
  ['z_sleep', (r) => r.z.sleep], ['z_resp', (r) => r.z.resp], ['z_stress', (r) => r.z.stress],
];
ts.forEach((r, i) => {
  const p = ref[i];
  if (p.date !== r.date) throw new Error(`data difere em ${i}: ${r.date} vs ${p.date}`);
  for (const [f, get] of fields) {
    const a = get(r), b = p[f];
    if ((a === null) !== (b === null)) { mismatchNull++; worst = `${r.date} ${f}: ${a} vs ${b}`; continue; }
    if (a !== null) { const d = Math.abs(a - b); if (d > maxDiff) { maxDiff = d; worst = `${r.date} ${f}`; } }
  }
  if (r.rec !== null) nRec++;
});

const last = ts[ts.length - 1];
console.log(`dias: ${ts.length} | com REC: ${nRec} | diferença máx: ${maxDiff.toExponential(2)} (${worst}) | nulos divergentes: ${mismatchNull}`);
console.log(`REC ${last.date}: ${last.rec?.toFixed(2)}`);
if (mismatchNull > 0 || maxDiff > 1e-9) { console.error('FALHOU'); process.exit(1); }
console.log('OK: paridade com a referência Python');
