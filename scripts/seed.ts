// Gera data/seed.sql a partir do export Garmin (CSVs em data/, fora do git).
// Uso: node scripts/seed.ts  →  depois: npm run db:seed:local (ou :remote)
import { readFileSync, writeFileSync } from 'node:fs';
import { computeRec, type DailyInput } from '../src/rec.ts';
import { sportOf } from '../src/sports.ts';

function readCsv(path: string) {
  const [header, ...lines] = readFileSync(path, 'utf8').trim().split(/\r?\n/);
  const cols = header.split(',');
  return lines.map((l) => {
    const v = l.split(',');
    return Object.fromEntries(cols.map((c, i) => [c, v[i] ?? '']));
  });
}
const num = (s: string) => (s === '' || s === undefined ? null : Number(s));
const sql = (v: unknown) =>
  v === null || v === undefined || (typeof v === 'number' && !Number.isFinite(v))
    ? 'NULL'
    : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`;

const out: string[] = [];

// --- métricas diárias ---
const daily = readCsv('data/daily_metrics.csv');
const dcols = ['hrv', 'rhr', 'sleep_h', 'sleep_score', 'resp', 'stress', 'sleep_hr', 'acute', 'chronic', 'acwr'];
for (const r of daily) {
  const date = r.date.slice(0, 10);
  out.push(`INSERT OR REPLACE INTO daily_metrics (date, ${dcols.join(', ')}, source) VALUES (${[
    sql(date), ...dcols.map((c) => sql(num(r[c]))), sql('export'),
  ].join(', ')});`);
}

// --- atividades (zonas: ms → min; RPE: 0–100 → 0–10) ---
const acts = readCsv('data/activities.csv');
for (const a of acts) {
  const date = a.date.slice(0, 10);
  const z = (k: string) => { const v = num(a[k]); return v === null ? null : +(v / 60000).toFixed(2); };
  const rpe = num(a.rpe);
  out.push(`INSERT OR REPLACE INTO activities (id, date, time, type, sport, min, km, avghr, maxhr, load, te_aer, rpe, feel, z1, z2, z3, z4, z5) VALUES (${[
    sql(`${date}T${a.time}_${a.type}`), sql(date), sql(a.time), sql(a.type), sql(sportOf(a.type)),
    sql(num(a.min)), sql(num(a.km)), sql(num(a.avghr)), sql(num(a.maxhr)), sql(num(a.load)), sql(num(a.te_aer)),
    sql(rpe === null ? null : rpe / 10), sql(num(a.feel)), ...['z1', 'z2', 'z3', 'z4', 'z5'].map((k) => sql(z(k))),
  ].join(', ')});`);
}

// --- REC histórico ---
const rows: DailyInput[] = daily.map((r) => ({
  date: r.date.slice(0, 10), hrv: num(r.hrv), rhr: num(r.rhr), sleep_h: num(r.sleep_h), resp: num(r.resp), stress: num(r.stress),
}));
const K = ['hrv', 'rhr', 'sleep', 'resp', 'stress'] as const;
for (const r of computeRec(rows)) {
  out.push(`INSERT OR REPLACE INTO rec_daily (date, rec, ${K.map((k) => 'z_' + k).join(', ')}, ${K.map((k) => 'v_' + k).join(', ')}, ${K.map((k) => 'b_' + k).join(', ')}) VALUES (${[
    sql(r.date), sql(r.rec), ...K.map((k) => sql(r.z[k])), ...K.map((k) => sql(r.value[k])), ...K.map((k) => sql(r.base[k])),
  ].join(', ')});`);
}

writeFileSync('data/seed.sql', out.join('\n') + '\n');
console.log(`seed.sql: ${daily.length} dias, ${acts.length} atividades`);
