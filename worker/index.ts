// REC — Worker: API + rotina da manhã. Os arquivos do app (web/) são servidos como assets estáticos.
import { computeRec, type Contributor, type DailyInput } from '../src/rec.ts';
import { alerts, comment, contributors, type RecRow } from '../src/today.ts';
import { SPORT_LABEL, sportOf, type Sport } from '../src/sports.ts';
import { acwr, formZone, pmc, strainHR, ZONE_FALLBACK } from '../src/load.ts';
import { DISTANCES, predictAll, vdotFromRun, vdotOn, type DistKey } from '../src/predict.ts';
import { bedtimeTarget, debtLevel, irregularNights, regularity, regularityScore, responseNeed, sleepDebt, sleepNeedTonight, type SleepNight } from '../src/sleep.ts';
import { HABITS, HABIT_KEYS, impact } from '../src/habits.ts';
import { hrvTrendNow } from '../src/hrvtrend.ts';
import { illnessAlert } from '../src/illness.ts';
import { calibration, spearman } from '../src/calibration.ts';
import { cumulativeStress, loadFocus, trainingStatus, workoutInsights } from '../src/insights.ts';
import { ARACAJU, climatology, parseForecast, type HourRow } from '../src/weather.ts';
import { longTrend } from '../src/longtrend.ts';
import { dailySummary, recTrend } from '../src/daily.ts';
import { dayHeadline } from '../src/headline.ts';
import { strainTargetV2 } from '../src/target.ts';
import { readiness } from '../src/readiness.ts';
import { recoveryVerdict } from '../src/verdict.ts';
import { fetchActivities, fetchActivityFile, fetchFitnessAge, fetchIntraday, fetchDays, fetchHrZones, GarminError, hasKey, parseHrZones, type GarminActivity, type GarminDay } from './garmin.ts';
import SCHEMA from './schema.sql';

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  APP_TOKEN?: string;         // secret opcional: se existir, o app pede código
  GARMIN_API_KEY?: string;    // secret: chave pessoal da Garmin
  GARMIN_BASE_URL?: string;   // só para testes locais com servidor simulado
  GITHUB_TOKEN?: string;      // secret opcional: token do GitHub (só "Contents: read and write" no repositório) para publicar o relatório do treinador
  GITHUB_REPO?: string;       // padrão lucaverdade/REC-app
  GITHUB_BRANCH?: string;     // padrão main
  GITHUB_API?: string;        // só para testes locais
}

const RACE = { name: 'Ironman 70.3 Aracaju', date: '2026-11-29' };
const K: Contributor[] = ['hrv', 'rhr', 'sleep', 'resp', 'stress'];

// --- datas no fuso de Brasília (UTC−3, sem horário de verão) ---
const brtToday = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400_000);

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

// --- REC: recalcula os últimos `keep` dias usando 200 dias de histórico ---
async function recompute(env: Env, upTo: string, keep = 10) {
  const from = addDays(upTo, -200);
  const { results } = await env.DB.prepare(
    'SELECT date, hrv, rhr, sleep_h, resp, stress FROM daily_metrics WHERE date BETWEEN ?1 AND ?2 ORDER BY date',
  ).bind(from, upTo).all<DailyInput>();
  const recs = computeRec(results).filter((r) => r.date > addDays(upTo, -keep));
  const cols = ['date', 'rec', ...K.map((k) => 'z_' + k), ...K.map((k) => 'v_' + k), ...K.map((k) => 'b_' + k), 'computed_at'];
  const stmt = env.DB.prepare(
    `INSERT OR REPLACE INTO rec_daily (${cols.join(', ')}) VALUES (${cols.map((_, i) => '?' + (i + 1)).join(', ')})`,
  );
  const now = new Date().toISOString();
  if (!recs.length) return 0; // banco vazio: nada a gravar (D1 recusa lote vazio)
  await env.DB.batch(recs.map((r) => stmt.bind(r.date, r.rec, ...K.map((k) => r.z[k]), ...K.map((k) => r.value[k]), ...K.map((k) => r.base[k]), now)));
  return recs.length;
}

/** A noite de hoje já chegou? (HRV e sono da manhã atual) */
async function hasTonight(env: Env, date: string) {
  const r = await env.DB.prepare('SELECT hrv, sleep_h FROM daily_metrics WHERE date = ?1').bind(date).first<{ hrv: number | null; sleep_h: number | null }>();
  return !!r && r.hrv !== null && r.sleep_h !== null;
}

// --- banco: cria as tabelas sozinho no primeiro acesso (sem CLI) ---
let schemaReady = false;
async function ensureSchema(env: Env) {
  if (schemaReady) return;
  const stmts = SCHEMA.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
    .split(';').map((x) => x.trim()).filter(Boolean);
  await env.DB.batch(stmts.map((q) => env.DB.prepare(q)));
  // migrações de colunas (ignora "duplicate column" quando já existem)
  for (const q of ['ALTER TABLE daily_metrics ADD COLUMN sleep_start TEXT', 'ALTER TABLE daily_metrics ADD COLUMN sleep_end TEXT', 'ALTER TABLE daily_metrics ADD COLUMN nap_h REAL', 'DROP TABLE IF EXISTS activity_fit', 'ALTER TABLE daily_metrics ADD COLUMN spo2_avg REAL', 'ALTER TABLE daily_metrics ADD COLUMN spo2_low REAL', 'ALTER TABLE daily_metrics ADD COLUMN bb_wake REAL', 'ALTER TABLE daily_metrics ADD COLUMN bb_high REAL', 'ALTER TABLE activities ADD COLUMN z_orig TEXT', 'ALTER TABLE activities ADD COLUMN te_label TEXT', 'ALTER TABLE activities ADD COLUMN z_err TEXT', 'ALTER TABLE activities ADD COLUMN vo2 REAL', 'ALTER TABLE activities ADD COLUMN z_src TEXT', 'ALTER TABLE activities ADD COLUMN name TEXT', 'ALTER TABLE activities ADD COLUMN kcal REAL', 'ALTER TABLE activities ADD COLUMN kcal_bmr REAL', 'ALTER TABLE activities ADD COLUMN elev REAL', 'ALTER TABLE activities ADD COLUMN speed REAL', 'ALTER TABLE activities ADD COLUMN maxspeed REAL', 'ALTER TABLE activities ADD COLUMN power REAL', 'ALTER TABLE activities ADD COLUMN te_ana REAL', 'ALTER TABLE activities ADD COLUMN cadence REAL']) {
    try { await env.DB.prepare(q).run(); } catch { /* já existe */ }
  }
  try { await env.DB.prepare('ALTER TABLE activities ADD COLUMN trimp REAL').run(); } catch { /* já existe */ }
  // Strain v3: calcula a coluna trimp de todas as atividades uma vez
  const sv = await env.DB.prepare("SELECT value FROM settings WHERE key = 'strain_v'").first<{ value: string }>();
  if (sv?.value !== '3') {
    const { results } = await env.DB.prepare('SELECT id, min, avghr FROM activities').all<{ id: string; min: number | null; avghr: number | null }>();
    const up = env.DB.prepare('UPDATE activities SET trimp = ?2 WHERE id = ?1');
    for (let i = 0; i < results.length; i += 400) await env.DB.batch(results.slice(i, i + 400).map((r) => up.bind(r.id, strainHR(r.min, r.avghr))));
    await env.DB.prepare("INSERT INTO settings (key, value) VALUES ('strain_v', '3') ON CONFLICT(key) DO UPDATE SET value = '3'").run();
    await env.DB.prepare("INSERT INTO settings (key, value) VALUES ('data_ver', '1') ON CONFLICT(key) DO UPDATE SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT)").run();
  }
  schemaReady = true;
}

async function writeDays(env: Env, days: GarminDay[]) {
  const st = env.DB.prepare(
    `INSERT INTO daily_metrics (date, hrv, rhr, sleep_h, sleep_score, resp, stress, sleep_start, sleep_end, nap_h, spo2_avg, spo2_low, bb_wake, bb_high, source, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, 'garmin_api', datetime('now'))
     ON CONFLICT(date) DO UPDATE SET
       hrv = COALESCE(excluded.hrv, hrv), rhr = COALESCE(excluded.rhr, rhr), sleep_h = COALESCE(excluded.sleep_h, sleep_h),
       sleep_score = COALESCE(excluded.sleep_score, sleep_score), resp = COALESCE(excluded.resp, resp),
       stress = COALESCE(excluded.stress, stress), sleep_start = COALESCE(excluded.sleep_start, sleep_start),
       sleep_end = COALESCE(excluded.sleep_end, sleep_end), nap_h = COALESCE(excluded.nap_h, nap_h),
       spo2_avg = COALESCE(excluded.spo2_avg, spo2_avg), spo2_low = COALESCE(excluded.spo2_low, spo2_low),
       bb_wake = COALESCE(excluded.bb_wake, bb_wake), bb_high = COALESCE(excluded.bb_high, bb_high),
       source = 'garmin_api', updated_at = datetime('now')`,
  );
  const useful = days.filter((d) => [d.hrv, d.rhr, d.sleep_h, d.resp, d.stress].some((v) => v !== null));
  if (useful.length) await env.DB.batch(useful.map((d) => st.bind(d.date, d.hrv, d.rhr, d.sleep_h, d.sleep_score, d.resp, d.stress, d.sleep_start, d.sleep_end, d.nap_h, d.spo2_avg ?? null, d.spo2_low ?? null, d.bb_wake ?? null, d.bb_high ?? null)));
  // fases do sono (tabela própria: o JSON da noite)
  const withStages = days.filter((d) => d.stages);
  if (withStages.length) {
    await env.DB.prepare('CREATE TABLE IF NOT EXISTS sleep_stages (date TEXT PRIMARY KEY, body TEXT NOT NULL)').run();
    const ss = env.DB.prepare('INSERT OR REPLACE INTO sleep_stages (date, body) VALUES (?1, ?2)');
    await env.DB.batch(withStages.map((d) => ss.bind(d.date, JSON.stringify(d.stages))));
  }
  return useful.length;
}

async function writeActivities(env: Env, acts: GarminActivity[]) {
  // remove linhas do export do mesmo treino (mesma data, hora e tipo) para não duplicar
  const del = env.DB.prepare(`DELETE FROM activities WHERE date = ?1 AND time = ?2 AND type = ?3 AND id <> ?4`);
  // linhas do CSV (id não numérico) do mesmo treino com hora arredondada diferente: mesma data e tipo, ±20 min e duração ±3 min
  const delCsv = env.DB.prepare(`DELETE FROM activities WHERE date = ?1 AND type = ?2 AND id <> ?3 AND id GLOB '*[^0-9]*'
    AND abs(COALESCE(min, 0) - ?4) < 3 AND time IS NOT NULL
    AND abs((CAST(substr(time, 1, 2) AS INTEGER) * 60 + CAST(substr(time, 4, 2) AS INTEGER)) - ?5) <= 20`);
  const ex = env.DB.prepare(`UPDATE activities SET name = ?2, kcal = ?3, kcal_bmr = ?4, elev = ?5, speed = ?6, maxspeed = ?7, power = ?8, te_ana = ?9, cadence = ?10, te_label = ?11, vo2 = ?12 WHERE id = ?1`);
  const st = env.DB.prepare(
    `INSERT INTO activities (id, date, time, type, sport, min, km, avghr, maxhr, load, te_aer, rpe, feel, z1, z2, z3, z4, z5)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)
     ON CONFLICT(id) DO UPDATE SET date = excluded.date, time = excluded.time, type = excluded.type, sport = excluded.sport,
       min = excluded.min, km = excluded.km, avghr = excluded.avghr, maxhr = excluded.maxhr, load = excluded.load, te_aer = excluded.te_aer,
       rpe = excluded.rpe, feel = excluded.feel,
       -- zonas recalculadas pelo arquivo FIT (zonas atuais) não são sobrescritas pelas da Garmin
       z1 = CASE WHEN activities.z_src = 'fit' THEN activities.z1 ELSE excluded.z1 END,
       z2 = CASE WHEN activities.z_src = 'fit' THEN activities.z2 ELSE excluded.z2 END,
       z3 = CASE WHEN activities.z_src = 'fit' THEN activities.z3 ELSE excluded.z3 END,
       z4 = CASE WHEN activities.z_src = 'fit' THEN activities.z4 ELSE excluded.z4 END,
       z5 = CASE WHEN activities.z_src = 'fit' THEN activities.z5 ELSE excluded.z5 END`,
  );
  if (!acts.length) return 0;
  const trimpSt = env.DB.prepare('UPDATE activities SET trimp = ?2 WHERE id = ?1');
  await env.DB.batch(acts.flatMap((a) => [
    del.bind(a.date, a.time, a.type, a.id),
    delCsv.bind(a.date, a.type, a.id, a.min ?? 0, Number(a.time.slice(0, 2)) * 60 + Number(a.time.slice(3, 5))),
    st.bind(a.id, a.date, a.time, a.type, sportOf(a.type), a.min, a.km, a.avghr, a.maxhr, a.load, a.te_aer, a.rpe, a.feel, ...a.z),
    trimpSt.bind(a.id, strainHR(a.min, a.avghr)),
    ...(a.extra ? [ex.bind(a.id, a.extra.name, a.extra.kcal, a.extra.kcal_bmr, a.extra.elev, a.extra.speed, a.extra.maxspeed, a.extra.power, a.extra.te_ana, a.extra.cadence, a.extra.te_label, a.extra.vo2)] : []),
  ]));
  return acts.length;
}

const garminMsg = (e: unknown) =>
  e instanceof GarminError
    ? e.where === 'sem_chave' ? 'sem_chave'
      : e.status === 401 || e.status === 403 ? `chave recusada pela Garmin (${e.status}). Confira a chave ou se ela venceu.`
      : e.status === 429 ? 'limite de requisições da Garmin; tente em alguns minutos.'
      : e.message
    : e instanceof Error ? e.message.slice(0, 300) : 'erro';

async function morningRoutine(env: Env, trigger: 'cron' | 'manual' | 'open') {
  await ensureSchema(env);
  const today = brtToday();
  // com a noite já no banco, a rotina vira "leve": só busca as atividades de ontem e hoje (treinos do dia)
  const light = await hasTonight(env, today);
  let status = 'ok', detail = '', changed = false;
  try {
    if (!hasKey(env)) {
      status = 'sem_dados'; detail = 'garmin: sem_chave';
    } else if (light && trigger !== 'manual') {
      const na = await writeActivities(env, await fetchActivities(env, addDays(today, -1), today));
      detail = `garmin: atividades (${na})`; changed = na > 0;
    } else {
      const from = addDays(today, -2);
      const { days } = await fetchDays(env, from, today);
      const nd = await writeDays(env, days);
      const na = await writeActivities(env, await fetchActivities(env, from, today));
      detail = `garmin: ${nd} dias, ${na} atividades`; changed = nd > 0 || na > 0;
      await markFetched(env, 'days', from, addDays(today, -1)); await markFetched(env, 'acts', from, addDays(today, -1));
      if (!(await hasTonight(env, today))) status = 'sem_dados';
    }
    if (!(light && trigger !== 'manual')) detail += `; rec: ${await recompute(env, today)} dias`;
  } catch (e) {
    status = 'erro';
    detail = garminMsg(e);
  }
  await env.DB.prepare('INSERT INTO sync_log (trigger, status, detail) VALUES (?1, ?2, ?3)').bind(trigger, status, detail).run();
  return { status, detail, changed };
}

// --- diagnóstico: API x banco (export), campo a campo ---
const FIELDS: [keyof GarminDay, number][] = [['hrv', 1], ['rhr', 1], ['sleep_h', 0.05], ['sleep_score', 1], ['resp', 0.2], ['stress', 1]];

async function garminCheck(env: Env, days: number) {
  const to = addDays(brtToday(), -1), from = addDays(to, -(days - 1));
  const { days: api, raw, detail } = await fetchDays(env, from, to);
  const { results: db } = await env.DB.prepare('SELECT date, hrv, rhr, sleep_h, sleep_score, resp, stress FROM daily_metrics WHERE date BETWEEN ?1 AND ?2')
    .bind(from, to).all<Record<string, number | null>>();
  const byDate = new Map(db.map((r) => [r.date as unknown as string, r]));
  const fields = FIELDS.map(([f, tol]) => {
    let nApi = 0, nDb = 0, both = 0, equal = 0, sum = 0;
    for (const a of api) {
      const x = a[f] as number | null, y = byDate.get(a.date)?.[f] ?? null;
      if (x !== null) nApi++;
      if (y !== null) nDb++;
      if (x !== null && y !== null) { both++; const d = Math.abs(x - y); sum += d; if (d <= tol) equal++; }
    }
    return { field: f, api: nApi, banco: nDb, ambos: both, iguais: equal, difMedia: both ? +(sum / both).toFixed(3) : null };
  });
  const sample = api.slice(-3).map((a) => ({ date: a.date, api: a, banco: byDate.get(a.date) ?? null }));
  return { from, to, fields, raw, detail, sample };
}


// --- Strain: minutos por zona de FC × peso da zona (ver src/load.ts) ---
// Strain v3 (05/11): coluna trimp (FC média, escala do Strava, ver src/load.ts); sem FC, zonas × 0,2
const STRAIN_SQL = `CASE WHEN trimp IS NOT NULL THEN trimp
  WHEN z1 IS NULL AND z2 IS NULL AND z3 IS NULL AND z4 IS NULL AND z5 IS NULL THEN NULL
  ELSE ${ZONE_FALLBACK} * (0.5 * MAX(0, COALESCE(min,0) - (COALESCE(z1,0)+COALESCE(z2,0)+COALESCE(z3,0)+COALESCE(z4,0)+COALESCE(z5,0)))
     + COALESCE(z1,0)*1 + COALESCE(z2,0)*2 + COALESCE(z3,0)*3 + COALESCE(z4,0)*4 + COALESCE(z5,0)*5) END`;

const SPORTS: Sport[] = ['bike', 'corrida', 'natacao', 'hyrox', 'academia', 'outro'];
const mondayOf = (d: string) => addDays(d, -((new Date(d + 'T00:00:00Z').getUTCDay() + 6) % 7));
const r1 = (x: number | null | undefined) => (x == null ? null : Math.round(x * 10) / 10);

/** Strain diário contínuo (0 em dia sem treino). */
async function dailyLoads(env: Env, from: string, to: string) {
  const { results } = await env.DB.prepare(`SELECT date, SUM(COALESCE(${STRAIN_SQL}, 0)) load FROM activities WHERE date BETWEEN ?1 AND ?2 GROUP BY date`)
    .bind(from, to).all<{ date: string; load: number }>();
  const m = new Map(results.map((r) => [r.date, r.load]));
  const out: { date: string; load: number }[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push({ date: d, load: m.get(d) ?? 0 });
  return out;
}

// Prontidão de um dia qualquer (mesma conta da aba Hoje): REC do dia + carga, véspera e sono até a véspera
async function readyOn(env: Env, date: string, rec?: number | null) {
  if (rec === undefined) rec = (await env.DB.prepare('SELECT rec FROM rec_daily WHERE date = ?1').bind(date).first<{ rec: number | null }>())?.rec ?? null;
  const ls = (await dailyLoads(env, addDays(date, -400), addDays(date, -1))).map((x) => x.load);
  const { results: nights } = await env.DB.prepare('SELECT date, sleep_h, nap_h, sleep_start, sleep_end FROM daily_metrics WHERE date BETWEEN ?1 AND ?2 ORDER BY date').bind(addDays(date, -140), date).all<SleepNight>();
  const need = (await sleepBase(env, brtToday())).hours;
  const dh: number[] = [];
  for (let x = addDays(date, -120); x < date; x = addDays(x, 1)) { const v = sleepDebt(nights, need, x); if (v != null) dh.push(v); }
  return readiness(rec, ls, sleepDebt(nights, need, date), dh);
}

// --- calibração contínua (04/11): backtest de 12 meses de REC e Prontidão + concordância com "como me sinto" ---
// Roda sob pedido (/api/backtest) e sozinho uma vez por mês (cron); o resultado de cada mês fica em settings.calib_log.
type CalibSnap = { month: string; at: string; days: number; rec: { mean: number; sd: number; zones: number[] }; ready: { mean: number; sd: number; zones: number[]; caps: number };
  corr: number | null; feel: { n: number; rhoRec: number | null; rhoReady: number | null } };
async function backtest(env: Env): Promise<CalibSnap> {
  const today = brtToday(), from = addDays(today, -365);
  const loads = await dailyLoads(env, addDays(from, -400), today);
  const li = new Map(loads.map((x, i) => [x.date, i]));
  const L = loads.map((x) => x.load);
  const { results: recs } = await env.DB.prepare('SELECT date, rec FROM rec_daily WHERE date BETWEEN ?1 AND ?2 AND rec IS NOT NULL ORDER BY date').bind(from, today).all<{ date: string; rec: number }>();
  const { results: nights } = await env.DB.prepare('SELECT date, sleep_h, nap_h, sleep_start, sleep_end FROM daily_metrics WHERE date BETWEEN ?1 AND ?2 ORDER BY date').bind(addDays(from, -140), today).all<SleepNight>();
  const need = (await sleepBase(env, today)).hours;
  const debt = new Map<string, number | null>();
  for (let x = addDays(from, -120); x <= today; x = addDays(x, 1)) debt.set(x, sleepDebt(nights, need, x));
  const { results: feels } = await env.DB.prepare('SELECT date, value FROM feel_notes WHERE date BETWEEN ?1 AND ?2').bind(from, today).all<{ date: string; value: number }>();
  const feelBy = new Map(feels.map((f) => [f.date, f.value]));
  const R: number[] = [], P: number[] = [], fr: [number, number, number][] = []; let caps = 0;
  for (const { date, rec } of recs) {
    const i = li.get(date); if (i == null) continue;
    const dh: number[] = []; for (let x = addDays(date, -120); x < date; x = addDays(x, 1)) { const v = debt.get(x); if (v != null) dh.push(v); }
    const r = readiness(rec, L, debt.get(date) ?? null, dh, undefined, i - 1);
    if (r.score == null) continue;
    R.push(rec); P.push(r.score); if (r.cap) caps++;
    const f = feelBy.get(date); if (f != null) fr.push([rec, r.score, f]);
  }
  const mean = (x: number[]) => (x.length ? x.reduce((a, b) => a + b, 0) / x.length : 0);
  const sd = (x: number[]) => { const m = mean(x); return Math.sqrt(mean(x.map((v) => (v - m) ** 2))); };
  const zones = (x: number[]) => [x.filter((v) => v <= 33).length, x.filter((v) => v > 33 && v <= 66).length, x.filter((v) => v > 66).length];
  const r1x = (v: number) => Math.round(v * 10) / 10, r2 = (v: number | null) => (v == null ? null : Math.round(v * 100) / 100);
  const pear = (a: number[], b: number[]) => { if (a.length < 3) return null; const ma = mean(a), mb = mean(b); let n = 0, da = 0, db = 0; for (let k = 0; k < a.length; k++) { n += (a[k] - ma) * (b[k] - mb); da += (a[k] - ma) ** 2; db += (b[k] - mb) ** 2; } return da && db ? n / Math.sqrt(da * db) : null; };
  return {
    month: today.slice(0, 7), at: today, days: R.length,
    rec: { mean: r1x(mean(R)), sd: r1x(sd(R)), zones: zones(R) },
    ready: { mean: r1x(mean(P)), sd: r1x(sd(P)), zones: zones(P), caps },
    corr: r2(pear(R, P)),
    feel: { n: fr.length, rhoRec: r2(spearman(fr.map((x) => x[0]), fr.map((x) => x[2]))), rhoReady: r2(spearman(fr.map((x) => x[1]), fr.map((x) => x[2]))) },
  };
}
async function monthlyCalib(env: Env, force = false) {
  const log = (await getSetting<CalibSnap[]>(env, 'calib_log')) ?? [];
  const month = brtToday().slice(0, 7);
  if (!force && log.some((x) => x.month === month)) return log;
  const snap = await backtest(env);
  const next = [...log.filter((x) => x.month !== month), snap].slice(-24);
  await setSetting(env, 'calib_log', next);
  return next;
}

// --- semana da prova (04/11): reta final — noites, sono, taper e Prontidão; aparece a partir de 28 dias ---
async function finalStretch(env: Env, today: string, projection: { raceDay?: { formPct: number | null } | null; end?: { formPct: number | null } | null } | null) {
  const days = daysBetween(today, RACE.date);
  if (days > 28 || days < 0) return null;
  const { results: nights } = await env.DB.prepare('SELECT date, sleep_h, nap_h, sleep_start, sleep_end FROM daily_metrics WHERE date BETWEEN ?1 AND ?2 ORDER BY date').bind(addDays(today, -140), today).all<SleepNight>();
  const need = (await sleepBase(env, today)).hours;
  const last7 = nights.filter((n) => n.date > addDays(today, -7) && n.sleep_h != null).map((n) => n.sleep_h as number);
  const loads = await dailyLoads(env, addDays(today, -41), today);
  const sum = (a: { load: number }[]) => a.reduce((x, y) => x + y.load, 0);
  const wk = sum(loads.slice(-7)), prior = [1, 2, 3, 4].map((k) => sum(loads.slice(-7 * (k + 1), -7 * k)));
  const peak = Math.max(...prior, 1), avg4 = prior.reduce((a, b) => a + b, 0) / 4;
  const ready: { date: string; v: number | null }[] = [];
  for (let k = 6; k >= 0; k--) { const d = addDays(today, -k); ready.push({ date: d, v: (await readyOn(env, d)).score }); }
  const fp = projection?.raceDay?.formPct ?? null; // só quando o plano publicado chega até a prova
  return {
    nights: days, // noites até a prova, contando a de hoje
    sleep7: last7.length ? Math.round((last7.reduce((a, b) => a + b, 0) / last7.length) * 100) / 100 : null, sleepBase: need,
    debt: (() => { const v = sleepDebt(nights, need, today); return v == null ? null : Math.round(v * 100) / 100; })(),
    strain7: Math.round(wk), strainAvg4: Math.round(avg4), strainPeak: Math.round(peak),
    vsAvg: avg4 > 1 ? Math.round((wk / avg4 - 1) * 100) : null, vsPeak: Math.round((wk / peak - 1) * 100),
    ready: ready.map((x) => ({ date: x.date, v: x.v == null ? null : Math.round(x.v) })),
    formRace: fp == null ? null : Math.round(fp), formIdeal: [5, 20],
  };
}

// --- relatório da prova (04/11): etapas e transições do dia × plano; dias até REC e HRV voltarem à base ---
async function raceReport(env: Env, req: Request, date: string) {
  const { results: acts } = await env.DB.prepare(`SELECT id, time, type, sport, name, min, km, avghr, maxhr, ${STRAIN_SQL} strain FROM activities WHERE date = ?1 ORDER BY time`).bind(date)
    .all<{ id: string; time: string | null; type: string; sport: Sport; name: string | null; min: number; km: number | null; avghr: number | null; maxhr: number | null; strain: number | null }>();
  const toMin = (t: string | null) => (t ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : null);
  const multi = acts.find((a) => a.type === 'multi_sport') ?? null;
  const legs = acts.filter((a) => a !== multi && ['natacao', 'bike', 'corrida'].includes(a.sport));
  const pace = (a: (typeof legs)[number]) => {
    if (!a.km || !a.min) return null;
    if (a.sport === 'natacao') { const s = (a.min * 60) / (a.km * 10); return `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')} /100 m`; }
    if (a.sport === 'bike') return `${(a.km / (a.min / 60)).toFixed(1).replace('.', ',')} km/h`;
    const s = (a.min * 60) / a.km; return `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')} /km`;
  };
  const items: { kind: 'leg' | 'trans'; label: string; min: number; km?: number | null; pace?: string | null; avghr?: number | null; strain?: number | null; id?: string; sport?: Sport }[] = [];
  legs.forEach((a, i) => {
    if (i > 0) {
      const p = legs[i - 1], end = (toMin(p.time) ?? 0) + p.min, st = toMin(a.time);
      if (st != null && st - end >= 0 && st - end <= 30) items.push({ kind: 'trans', label: `T${i}`, min: Math.round((st - end) * 10) / 10 });
    }
    items.push({ kind: 'leg', label: SPORT_LABEL[a.sport], sport: a.sport, id: a.id, min: Math.round(a.min * 10) / 10, km: a.km, pace: pace(a), avghr: a.avghr, strain: a.strain == null ? null : Math.round(a.strain) });
  });
  const total = multi ? multi.min : (() => { const f = legs[0], l = legs[legs.length - 1]; return f && l && toMin(f.time) != null && toMin(l.time) != null ? (toMin(l.time) as number) + l.min - (toMin(f.time) as number) : items.reduce((a, x) => a + x.min, 0); })();
  let plan: any = null;
  try { const r = await env.ASSETS.fetch(new Request(new URL('/plan/prova.json', req.url))); if (r.ok) plan = await r.json(); } catch {}
  // volta à base: REC ≥ média dos 30 dias antes da prova; HRV ≥ base do próprio dia
  const { results: rd } = await env.DB.prepare('SELECT date, rec, v_hrv, b_hrv FROM rec_daily WHERE date BETWEEN ?1 AND ?2 ORDER BY date').bind(addDays(date, -30), addDays(date, 21)).all<{ date: string; rec: number | null; v_hrv: number | null; b_hrv: number | null }>();
  const pre = rd.filter((x) => x.date < date && x.rec != null).map((x) => x.rec as number);
  const recBase = pre.length ? pre.reduce((a, b) => a + b, 0) / pre.length : null;
  const after = rd.filter((x) => x.date > date);
  const firstOk = (f: (x: (typeof rd)[number]) => boolean) => { const x = after.find(f); return x ? daysBetween(date, x.date) : null; };
  return {
    date, total: Math.round(total * 10) / 10, official: !!multi, items, targets: plan?.pace ?? null,
    recovery: {
      recBase: recBase == null ? null : Math.round(recBase), daysRec: recBase == null ? null : firstOk((x) => x.rec != null && x.rec >= recBase),
      daysHrv: firstOk((x) => x.v_hrv != null && x.b_hrv != null && x.v_hrv >= x.b_hrv), daysSince: Math.max(0, daysBetween(date, brtToday())),
      series: after.slice(0, 14).map((x) => ({ date: x.date, rec: x.rec == null ? null : Math.round(x.rec) })),
    },
  };
}

// --- zonas de treino (04/11, estilo Strava): % do tempo em cada zona de FC no período, por modalidade, × período anterior ---
async function hrZonesCached(env: Env) {
  type Z = Record<string, { floors: number[]; max: number | null }>;
  const c = await getSetting<{ day: string; zones: Z | null }>(env, 'hr_zones');
  if (c && c.day === brtToday()) return c.zones;
  let zones: Z | null = c?.zones ?? null;
  if (hasKey(env)) { try { const z = parseHrZones(await fetchHrZones(env)); if (Object.keys(z).length) zones = z; } catch { /* fica o último conhecido */ } }
  await setSetting(env, 'hr_zones', { day: brtToday(), zones });
  return zones;
}
async function zonesDist(env: Env, sport: string, days: number) {
  const today = brtToday(), from = addDays(today, -(days - 1)), pFrom = addDays(from, -days), pTo = addDays(from, -1);
  const sp = ['corrida', 'bike', 'natacao'].includes(sport) ? sport : null;
  const q = `SELECT SUM(MAX(0, COALESCE(min,0) - (COALESCE(z1,0)+COALESCE(z2,0)+COALESCE(z3,0)+COALESCE(z4,0)+COALESCE(z5,0)))) b,
    SUM(COALESCE(z1,0)) z1, SUM(COALESCE(z2,0)) z2, SUM(COALESCE(z3,0)) z3, SUM(COALESCE(z4,0)) z4, SUM(COALESCE(z5,0)) z5, COUNT(*) n
    FROM activities WHERE date BETWEEN ?1 AND ?2 AND (z1 IS NOT NULL OR z2 IS NOT NULL OR z3 IS NOT NULL OR z4 IS NOT NULL OR z5 IS NOT NULL)
    AND ${sp ? 'sport = ?3' : "sport IN ('corrida','bike','natacao','hyrox')"}`;
  const run = async (a: string, b: string) => {
    const st = env.DB.prepare(q); const r = await (sp ? st.bind(a, b, sp) : st.bind(a, b)).first<Record<string, number | null>>();
    const mins = ['b', 'z1', 'z2', 'z3', 'z4', 'z5'].map((k) => r?.[k] ?? 0), tot = mins.reduce((x, y) => x + y, 0);
    return { mins: mins.map((m) => Math.round(m)), total: Math.round(tot), n: r?.n ?? 0, pct: mins.map((m) => (tot ? Math.round((m / tot) * 1000) / 10 : 0)) };
  };
  const cur = await run(from, today), prev = await run(pFrom, pTo);
  const zones = await hrZonesCached(env);
  const zk = sp ?? 'default', z = zones?.[zk] ?? zones?.default ?? null;
  const ranges = z ? [`< ${z.floors[0]}`, `${z.floors[0]}–${z.floors[1] - 1}`, `${z.floors[1]}–${z.floors[2] - 1}`, `${z.floors[2]}–${z.floors[3] - 1}`, `${z.floors[3]}–${z.floors[4] - 1}`, `≥ ${z.floors[4]}`] : null;
  return { sport: sp ?? 'todas', days, from, to: today, cur, prev, ranges };
}

// --- séries para Corpo e Treino → Evolução (04/11) ---
/** Prontidão de cada dia num intervalo, numa passada só (mesma conta da aba Hoje). */
async function readinessSeries(env: Env, from: string, to: string) {
  const loads = await dailyLoads(env, addDays(from, -400), to);
  const li = new Map(loads.map((x, i) => [x.date, i]));
  const { results: recs } = await env.DB.prepare('SELECT date, rec FROM rec_daily WHERE date BETWEEN ?1 AND ?2 ORDER BY date').bind(from, to).all<{ date: string; rec: number | null }>();
  const { results: nights } = await env.DB.prepare('SELECT date, sleep_h, nap_h, sleep_start, sleep_end FROM daily_metrics WHERE date BETWEEN ?1 AND ?2 ORDER BY date').bind(addDays(from, -140), to).all<SleepNight>();
  const need = (await sleepBase(env, brtToday())).hours;
  const debt = new Map<string, number | null>();
  for (let x = addDays(from, -120); x <= to; x = addDays(x, 1)) debt.set(x, sleepDebt(nights, need, x));
  const recBy = new Map(recs.map((r) => [r.date, r.rec]));
  const L = loads.map((x) => x.load); // um vetor só: a Prontidão de cada dia usa até a véspera (sem copiar)
  const out: { date: string; rec: number | null; ready: number | null; strain: number }[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const i = li.get(d) ?? -1, rec = recBy.get(d) ?? null;
    let ready: number | null = null;
    if (rec != null && i >= 0) {
      const dh: number[] = []; for (let x = addDays(d, -120); x < d; x = addDays(x, 1)) { const v = debt.get(x); if (v != null) dh.push(v); }
      ready = readiness(rec, L, debt.get(d) ?? null, dh, undefined, i - 1).score;
    }
    out.push({ date: d, rec: rec == null ? null : Math.round(rec), ready: ready == null ? null : Math.round(ready), strain: i >= 0 ? Math.round(loads[i].load) : 0 });
  }
  return out;
}

/** Calendário do mês: Strain e modalidades por dia, Prontidão e REC. */
async function monthPayload(env: Env, ym: string) {
  const from = `${ym}-01`, last = new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5)), 0)).toISOString().slice(0, 10);
  const today = brtToday(), to = last > today ? today : last;
  const { results: acts } = await env.DB.prepare(`SELECT date, sport, min, ${STRAIN_SQL} strain FROM activities WHERE date BETWEEN ?1 AND ?2 ORDER BY time`).bind(from, last).all<{ date: string; sport: Sport; min: number | null; strain: number | null }>();
  const series = to >= from ? await readinessSeries(env, from, to) : [];
  const sb = new Map(series.map((x) => [x.date, x]));
  const days = [];
  for (let d = from; d <= last; d = addDays(d, 1)) {
    const a = acts.filter((x) => x.date === d);
    const s = sb.get(d);
    days.push({ date: d, future: d > today, strain: Math.round(a.reduce((x, y) => x + (y.strain ?? 0), 0)), min: Math.round(a.reduce((x, y) => x + (y.min ?? 0), 0)),
      sports: [...new Set(a.map((x) => x.sport))], rec: s?.rec ?? null, ready: s?.ready ?? null });
  }
  const done = days.filter((x) => !x.future);
  return { ym, days, total: { strain: done.reduce((a, x) => a + x.strain, 0), hours: Math.round(done.reduce((a, x) => a + x.min, 0) / 6) / 10, days: done.filter((x) => x.strain > 0).length } };
}

/** Noite em detalhe: fases, FC, horários e comparação com as 14 noites anteriores. */
async function sleepPayload(env: Env, date: string) {
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS sleep_stages (date TEXT PRIMARY KEY, body TEXT NOT NULL)').run();
  const st = await env.DB.prepare('SELECT body FROM sleep_stages WHERE date = ?1').bind(date).first<{ body: string }>();
  const m = await env.DB.prepare('SELECT sleep_h, sleep_score, sleep_start, sleep_end, nap_h, resp FROM daily_metrics WHERE date = ?1').bind(date).first<Record<string, any>>();
  const r = await env.DB.prepare('SELECT v_hrv, b_hrv, v_rhr, b_rhr FROM rec_daily WHERE date = ?1').bind(date).first<Record<string, number | null>>();
  const { results: prev } = await env.DB.prepare('SELECT d.date, d.sleep_h, s.body FROM daily_metrics d LEFT JOIN sleep_stages s ON s.date = d.date WHERE d.date BETWEEN ?1 AND ?2 AND d.sleep_h IS NOT NULL').bind(addDays(date, -14), addDays(date, -1)).all<{ date: string; sleep_h: number; body: string | null }>();
  const mean = (x: number[]) => (x.length ? x.reduce((a, b) => a + b, 0) / x.length : null);
  const stg = prev.map((p) => (p.body ? JSON.parse(p.body) : null)).filter(Boolean);
  const avgStage = (k: string) => { const v = stg.map((x: any) => x[k]).filter((y: any) => typeof y === 'number'); return v.length >= 3 ? Math.round(mean(v)!) : null; };
  return {
    date, need: (await sleepBase(env, brtToday())).hours,
    night: m ? { h: m.sleep_h, score: m.sleep_score, start: m.sleep_start, end: m.sleep_end, nap: m.nap_h, resp: m.resp } : null,
    stages: st ? JSON.parse(st.body) : null,
    hrv: r ? { v: r.v_hrv, base: r.b_hrv } : null, rhr: r ? { v: r.v_rhr, base: r.b_rhr } : null,
    avg14: { h: mean(prev.map((p) => p.sleep_h)), deep: avgStage('deep'), light: avgStage('light'), rem: avgStage('rem'), awake: avgStage('awake'), n: prev.length },
  };
}

// --- relatório para o chat de treino (04/11): Markdown com o estado do corpo e da carga, publicado no GitHub ---
// Arquivos: relatorio/ultimo.md (sempre o mais recente) e relatorio/AAAA-MM-DD.md (histórico). Sai sozinho quando a
// noite chega e de novo às 20 h (com o treino do dia). Só números e fatos; quem decide o treino é o chat de treino.
const fx = (v: number | null | undefined, d = 0) => (v == null ? '–' : (Math.round(v * 10 ** d) / 10 ** d).toString().replace('.', ','));
const hmx = (h: number | null | undefined) => { if (h == null) return '–'; const m = Math.round(h * 60); return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`; };
const sgn = (v: number | null | undefined) => (v == null ? '–' : `${v > 0 ? '+' : ''}${fx(v)}`);
async function coachReport(env: Env, req: Request) {
  const today = brtToday(), from = addDays(today, -13);
  const d = await todayPayload(env, today, req);
  const li = await loadInsightsPayload(env).catch(() => null);
  const st31 = await stress31Payload(env).catch(() => null);
  const series = await readinessSeries(env, from, today);
  const { results: rd } = await env.DB.prepare('SELECT date, v_hrv, b_hrv, v_rhr, b_rhr FROM rec_daily WHERE date BETWEEN ?1 AND ?2').bind(from, today).all<{ date: string } & Record<string, any>>();
  const { results: dm } = await env.DB.prepare('SELECT date, sleep_h, hrv, rhr FROM daily_metrics WHERE date BETWEEN ?1 AND ?2').bind(from, today).all<{ date: string } & Record<string, any>>();
  const { results: acts } = await env.DB.prepare(`SELECT date, sport, min, rpe, ${STRAIN_SQL} strain FROM activities WHERE date BETWEEN ?1 AND ?2 ORDER BY date, time`).bind(from, today).all<Record<string, any>>();
  const { results: feels } = await env.DB.prepare('SELECT date, value FROM feel_notes WHERE date BETWEEN ?1 AND ?2').bind(from, today).all<{ date: string; value: number }>();
  const { results: tags } = await env.DB.prepare('SELECT date, tag FROM habit_tags WHERE date BETWEEN ?1 AND ?2').bind(from, today).all<{ date: string; tag: string }>();
  const wk = await weekPayload(env, req, 0);
  const lbl = new Map<string, string>(HABITS.map((h) => [h.key, h.label]));
  const by = <T extends { date: string }>(xs: T[]) => new Map(xs.map((x) => [x.date, x]));
  const rdB = by(rd), dmB = by(dm), fB = by(feels);
  const r = d.ready, L: string[] = [];
  const sig = (k: string) => d.contributors?.find((c: any) => c.key === k);
  L.push(`# REC · relatório para o treinador · ${today}`, '');
  L.push(`Gerado ${new Date(Date.now() - 3 * 3600e3).toISOString().slice(11, 16)} (Brasília). Prova: ${RACE.name} em ${d.race.days} dias (${RACE.date}).`, '');
  L.push('## Hoje (manhã)', '');
  L.push(`- **Prontidão:** ${r?.score == null ? '– (noite ainda não chegou' + (d.readyPrev != null ? `; ontem ${Math.round(d.readyPrev)}%` : '') + ')' : `${Math.round(r.score)}%`}${r?.cap ? ` — ${r.cap}` : ''}`);
  if (r?.parts) for (const p of r.parts) L.push(`  - ${p.label}: ${p.detail}${p.z != null ? ` (z ${sgn(Math.round(p.z * 10) / 10)})` : ''}`);
  L.push(`- **REC:** ${d.rec ?? '–'}${d.day?.trend ? ` (${d.day.trend.txt})` : ''}`);
  for (const k of ['hrv', 'rhr', 'sleep', 'resp', 'stress']) { const c = sig(k); if (c) L.push(`  - ${c.label}: ${c.value ?? '–'}${c.base != null ? ` (base ${c.base})` : ''}`); }
  L.push(`- **Sono:** ${hmx(d.sleep?.night?.hours)} (base ${hmx(d.sleep?.personalNeed)}); dívida 14 dias ${hmx(d.sleep?.debt)}${d.sleep?.regularityScore != null ? `; regularidade ${d.sleep.regularityScore}/100` : ''}`);
  L.push(`- **Carga:** Fitness ${fx(d.load?.fitness)}, Fadiga ${fx(d.load?.fatigue)}, Forma ${sgn(d.load?.formPct)}% (${d.load?.zone?.label ?? '–'}); Strain hoje até agora ${d.load?.strain ?? 0}${d.day?.target ? `; meta do dia ${d.day.target.target}` : ''}`);
  if (li?.status) L.push(`- **Status de treino:** ${li.status.label} — ${li.status.txt}${li.status.hrv ? ` (HRV 7 noites: ${li.status.hrv})` : ''}`);
  if (st31) L.push(`- **Estresse acumulado 31 dias:** ${st31.label ?? '–'}`);
  for (const a of d.alerts ?? []) L.push(`- **Alerta:** ${a.text}`);
  if (d.feel != null) L.push(`- **Como me sinto hoje:** ${d.feel}/10`);
  L.push('');
  L.push('## Últimos 14 dias', '');
  L.push('| Dia | Pront. | REC | HRV (base) | FC rep. (base) | Sono | Strain | Treinos | Sinto | Diário |');
  L.push('|---|---|---|---|---|---|---|---|---|---|');
  for (const x of [...series].reverse()) {
    const q = rdB.get(x.date), m = dmB.get(x.date), a = acts.filter((y) => y.date === x.date);
    const wd = new Date(x.date + 'T12:00:00Z').toLocaleDateString('pt-BR', { weekday: 'short', timeZone: 'UTC' }).replace('.', '');
    L.push(`| ${wd} ${x.date.slice(8)}/${x.date.slice(5, 7)} | ${x.ready ?? '–'} | ${x.rec ?? '–'} | ${fx(q?.v_hrv ?? m?.hrv)} (${fx(q?.b_hrv)}) | ${fx(q?.v_rhr ?? m?.rhr)} (${fx(q?.b_rhr, 1)}) | ${hmx(m?.sleep_h)} | ${x.strain || 0} | ${a.map((y) => `${SPORT_LABEL[y.sport as Sport]} ${Math.round(y.min ?? 0)}′${y.rpe ? ` RPE ${y.rpe}` : ''}`).join(', ') || '–'} | ${fB.get(x.date)?.value ?? '–'} | ${tags.filter((t) => t.date === x.date).map((t) => lbl.get(t.tag) ?? t.tag).join(', ') || '–'} |`);
  }
  L.push('');
  L.push(`## Semana atual (${wk.monday} a ${wk.sunday})`, '');
  L.push(`Strain ${wk.summary.strain}${wk.summary.plannedStrain != null ? ` de ${wk.summary.plannedStrain} previsto` : ''}; ${fx(wk.summary.doneHours, 1)} h${wk.summary.plannedHours != null ? ` de ${fx(wk.summary.plannedHours, 1)} h` : ''}${wk.summary.dist ? `; intensidade leve ${wk.summary.dist.low}% · média ${wk.summary.dist.mid}% · alta ${wk.summary.dist.high}%` : ''}${wk.plan?.fase ? `. Fase: ${wk.plan.fase}` : ''}`, '');
  const ST: Record<string, string> = { feito: 'feito', parcial: 'parcial', nao_feito: 'não feito', previsto: 'previsto' };
  for (const day of wk.days) {
    const items = [...day.planned.map((p: any) => `${p.titulo || p.label}${p.minutos ? ` ${p.minutos}′` : ''}: ${ST[p.status]}${p.doneStrain != null ? ` (Strain ${p.doneStrain}${p.plannedStrain != null ? ` de ${p.plannedStrain}` : ''})` : ''}`),
      ...day.executed.filter((e: any) => !e.matched).map((e: any) => `${e.label} ${Math.round(e.min ?? 0)}′ fora do plano (Strain ${e.strain ?? '–'})`)];
    if (items.length) L.push(`- ${day.date.slice(8)}/${day.date.slice(5, 7)}: ${items.join('; ')}`);
  }
  L.push('', '---', 'Prontidão = REC (55%) + carga de 7 dias × média de 4 semanas (20%) + treino de ontem (10%) + dívida de sono (15%), tudo contra o normal do Luca; fixa desde a manhã. REC = HRV, FC de repouso, sono, respiração e estresse do dia anterior contra as bases. Strain (v3, desde 05/11) = minutos × FC média em escala exponencial, na mesma régua do Relative Effort do Strava (um Strain 50 do REC ≈ um Relative Effort 50).');
  return L.join('\n') + '\n';
}
async function ghPut(env: Env, path: string, text: string, msg: string) {
  const repo = env.GITHUB_REPO || 'lucaverdade/REC-app', branch = env.GITHUB_BRANCH || 'main', base = env.GITHUB_API || 'https://api.github.com';
  const h = { authorization: `Bearer ${env.GITHUB_TOKEN}`, accept: 'application/vnd.github+json', 'user-agent': 'rec-app', 'content-type': 'application/json' };
  const cur = await fetch(`${base}/repos/${repo}/contents/${path}?ref=${branch}`, { headers: h });
  const sha = cur.ok ? ((await cur.json()) as { sha?: string }).sha : undefined;
  const bytes = new TextEncoder().encode(text); let bin = ''; for (const b of bytes) bin += String.fromCharCode(b);
  const r = await fetch(`${base}/repos/${repo}/contents/${path}`, { method: 'PUT', headers: h, body: JSON.stringify({ message: msg, content: btoa(bin), branch, ...(sha ? { sha } : {}) }) });
  if (!r.ok) throw new Error(`GitHub ${r.status}`); // sem detalhes: nunca registrar token nem resposta
}
async function publishCoach(env: Env, req: Request, when: string) {
  if (!env.GITHUB_TOKEN) return { ok: false, error: 'sem_token' };
  const today = brtToday(), md = await coachReport(env, req);
  await ghPut(env, 'relatorio/ultimo.md', md, `relatório REC ${today} (${when})`);
  await ghPut(env, `relatorio/${today}.md`, md, `relatório REC ${today} (${when})`);
  const sent = (await getSetting<Record<string, string>>(env, 'coach_sent')) ?? {};
  await setSetting(env, 'coach_sent', { ...sent, [when]: today, last: new Date().toISOString() });
  return { ok: true };
}
/** Cron: manhã (assim que a noite chega) e 20 h. Cada um uma vez por dia. */
async function coachCron(env: Env) {
  if (!env.GITHUB_TOKEN) return;
  const today = brtToday(), hour = new Date(Date.now() - 3 * 3600e3).getUTCHours();
  const sent = (await getSetting<Record<string, string>>(env, 'coach_sent')) ?? {};
  const req = new Request('https://rec.internal/');
  if (sent.manha !== today && (await hasTonight(env, today))) await publishCoach(env, req, 'manha');
  else if (sent.noite !== today && hour >= 20) await publishCoach(env, req, 'noite');
}

/** Fitness/Fadiga/Forma e Strain de um dia (aba Hoje). */
async function loadOn(env: Env, date: string) {
  const loads = await dailyLoads(env, addDays(date, -400), date);
  const p = pmc(loads);
  const t = p[p.length - 1];
  const z = formZone(t.formPct);
  return {
    strain: Math.round(t.load), fitness: Math.round(t.fitness), fatigue: Math.round(t.fatigue),
    form: Math.round(t.form), formPct: t.formPct == null ? null : Math.round(t.formPct),
    zone: z && { key: z.key, label: z.label },
    week: p.slice(-7).map((d) => ({ date: d.date, formPct: d.formPct == null ? null : Math.round(d.formPct) })),
    // Fitness/Fadiga: últimas 4 semanas e variação em 7 dias
    trend: p.slice(-28).map((d) => ({ date: d.date, fitness: Math.round(d.fitness * 10) / 10, fatigue: Math.round(d.fatigue * 10) / 10 })),
    delta7: p.length > 7 ? { fitness: Math.round(t.fitness - p[p.length - 8].fitness), fatigue: Math.round(t.fatigue - p[p.length - 8].fatigue) } : null,
    fatigueVsYesterday: p.length > 1 ? Math.round(t.fatigue - p[p.length - 2].fatigue) : null,
    // Fitness como tendência: um ponto por semana (5 semanas) e variação em 4 semanas
    fitnessWeekly: [28, 21, 14, 7, 0].filter((k) => p.length > k).map((k) => Math.round(p[p.length - 1 - k].fitness * 10) / 10),
    fitness4w: p.length > 28 && p[p.length - 29].fitness > 1 ? Math.round(((t.fitness - p[p.length - 29].fitness) / p[p.length - 29].fitness) * 100) : null,
    // entradas da meta de Strain v2 (tudo até ONTEM: o dia de hoje ainda está acontecendo)
    tgt: (() => {
      const y = p[p.length - 2], y3 = p[p.length - 5];
      const mon = mondayOf(date);
      const byDate = new Map(loads.map((x) => [x.date, x.load]));
      const sumRange = (a: string, b: string) => { let s2 = 0; for (let d = a; d <= b; d = addDays(d, 1)) s2 += byDate.get(d) ?? 0; return s2; };
      const prev3 = [1, 2, 3].map((k) => sumRange(addDays(mon, -7 * k), addDays(mon, -7 * k + 6)));
      const avg3 = prev3.reduce((a, b) => a + b, 0) / 3;
      const dow = (new Date(date + 'T00:00:00Z').getUTCDay() + 6) % 7;
      return {
        fitness: y?.fitness ?? null, fatigueNow: y?.fatigue ?? null, fatigue3dAgo: y3?.fatigue ?? null,
        acwr: acwr(loads.slice(0, -1).map((x) => x.load)),
        weekHi: avg3 > 0 ? avg3 * 1.3 : null, weekDoneBefore: dow > 0 ? sumRange(mon, addDays(date, -1)) : 0, daysLeft: 7 - dow,
        yesterdayStrain: y?.load ?? null,
      };
    })(),
  };
}

// --- períodos de calendário: semana (seg–dom), mês, 3 e 6 meses, 1 ano; offset = quantos para trás ---
type Unit = 'semana' | 'mes' | '3m' | '6m' | 'ano';
function periodRange(unit: Unit, offset: number, today: string) {
  if (unit === 'semana') { const s = addDays(mondayOf(today), -7 * offset); return { start: s, end: addDays(s, 6) }; }
  if (unit === 'mes') {
    const t = new Date(today + 'T00:00:00Z');
    const m = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - offset, 1));
    return { start: m.toISOString().slice(0, 10), end: new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 0)).toISOString().slice(0, 10) };
  }
  const weeks = unit === '3m' ? 13 : unit === '6m' ? 26 : 52;
  const end = addDays(mondayOf(today), 6 - 7 * weeks * offset);
  return { start: addDays(end, -(7 * weeks - 1)), end };
}

async function trendsPayload(env: Env, unit: Unit, offset: number) {
  const today = brtToday();
  const { start, end } = periodRange(unit, offset, today);
  const last = end > today ? today : end;
  const loads = await dailyLoads(env, addDays(start, -400), last);
  const p = pmc(loads);
  const byDate = new Map(p.map((d) => [d.date, d]));
  const before = byDate.get(addDays(start, -1));
  const t = byDate.get(last)!;

  const { results: rec } = await env.DB.prepare(
    'SELECT date, rec, v_hrv, b_hrv, v_rhr, b_rhr, v_sleep FROM rec_daily WHERE date BETWEEN ?1 AND ?2',
  ).bind(start, last).all<Record<string, number | null>>();
  const recBy = new Map(rec.map((r) => [r.date as unknown as string, r]));

  const { results: acts } = await env.DB.prepare(
    `SELECT date, sport, COALESCE(min, 0) min, COALESCE(${STRAIN_SQL}, 0) strain FROM activities WHERE date BETWEEN ?1 AND ?2`,
  ).bind(start, last).all<{ date: string; sport: Sport; min: number; strain: number }>();

  // tempo em zonas no período (só atividades com zonas registradas); "abaixo" = tempo abaixo da Z1
  const zq = await env.DB.prepare(`SELECT SUM(COALESCE(z1,0)) z1, SUM(COALESCE(z2,0)) z2, SUM(COALESCE(z3,0)) z3, SUM(COALESCE(z4,0)) z4, SUM(COALESCE(z5,0)) z5,
      SUM(MAX(0, COALESCE(min,0) - COALESCE(z1,0) - COALESCE(z2,0) - COALESCE(z3,0) - COALESCE(z4,0) - COALESCE(z5,0))) z0
    FROM activities WHERE date BETWEEN ?1 AND ?2 AND (z1 IS NOT NULL OR z2 IS NOT NULL OR z3 IS NOT NULL) AND sport <> 'academia'`)
    .bind(start, last).first<Record<string, number | null>>();
  const zoneMin = [0, 1, 2, 3, 4, 5].map((i) => zq?.[`z${i}`] ?? 0);

  // barras: por dia na semana e no mês; por semana (segunda) nos demais
  const daily = unit === 'semana' || unit === 'mes';
  const keys: string[] = [];
  if (daily) for (let d = start; d <= end; d = addDays(d, 1)) keys.push(d);
  else for (let d = mondayOf(start); d <= end; d = addDays(d, 7)) keys.push(d);
  const buckets = new Map(keys.map((k) => [k, { start: k, strain: {} as Record<string, number>, hours: {} as Record<string, number> }]));
  const tot = new Map<Sport, { min: number; strain: number; n: number }>();
  for (const a of acts) {
    const b = buckets.get(daily ? a.date : mondayOf(a.date));
    if (b) { b.strain[a.sport] = (b.strain[a.sport] ?? 0) + a.strain; b.hours[a.sport] = (b.hours[a.sport] ?? 0) + a.min / 60; }
    const x = tot.get(a.sport) ?? { min: 0, strain: 0, n: 0 };
    x.min += a.min; x.strain += a.strain; x.n++;
    tot.set(a.sport, x);
  }
  const weeks = Math.max(1, (daysBetween(start, last) + 1) / 7);
  const totals = SPORTS.filter((s) => tot.has(s)).map((s) => {
    const x = tot.get(s)!;
    return { sport: s, label: SPORT_LABEL[s], hours: r1(x.min / 60), perWeek: r1(x.min / 60 / weeks), strain: Math.round(x.strain), sessions: x.n };
  });
  const round = (o: Record<string, number>, f: (v: number) => number | null) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, f(v)]));
  const z = formZone(t.formPct);

  return {
    unit, offset, start, end, last, daily, weeks: r1(weeks),
    now: {
      fitness: r1(t.fitness), fatigue: r1(t.fatigue), form: r1(t.form), formPct: r1(t.formPct),
      zone: z && { key: z.key, label: z.label },
      delta: before && { fitness: r1(t.fitness - before.fitness), fatigue: r1(t.fatigue - before.fatigue), formPct: t.formPct != null && before.formPct != null ? r1(t.formPct - before.formPct) : null },
      acwr: r1(acwr(loads.map((x) => x.load))),
    },
    series: (() => {
      const out = [];
      for (let d = start; d <= end; d = addDays(d, 1)) {
        const q = d <= last ? byDate.get(d) : undefined, r = recBy.get(d);
        out.push({
          date: d, strain: q ? Math.round(q.load) : null,
          fitness: r1(q?.fitness), fatigue: r1(q?.fatigue), formPct: r1(q?.formPct),
          rec: r?.rec == null ? null : Math.round(r.rec as number),
          hrv: r?.v_hrv ?? null, hrvBase: r1(r?.b_hrv), rhr: r?.v_rhr ?? null, rhrBase: r1(r?.b_rhr), sleep: r1(r?.v_sleep),
        });
      }
      return out;
    })(),
    bars: [...buckets.values()].map((b) => ({ start: b.start, strain: round(b.strain, Math.round), hours: round(b.hours, r1) })),
    totals,
    zones: zoneMin.map((m, i) => ({ zone: i, hours: r1(m / 60) })),
    total: { hours: r1(totals.reduce((a, x) => a + (x.hours ?? 0), 0)), strain: totals.reduce((a, x) => a + x.strain, 0), sessions: totals.reduce((a, x) => a + x.sessions, 0) },
  };
}


// --- aba Treino: semana (seg–dom) planejada × executada ---
interface PlanSession { modalidade: string; titulo?: string; minutos?: number; zona?: string; detalhe?: string; chave?: boolean; strain?: number; esforco?: number } // esforco = Strain previsto na escala v3 (Relative Effort do Strava)
interface Plan { semana: string; fase?: string; notas?: string; dias?: Record<string, PlanSession[]> }

async function readPlan(env: Env, req: Request, monday: string): Promise<Plan | null> {
  try {
    const r = await env.ASSETS.fetch(new Request(new URL(`/plan/${monday}.json`, req.url)));
    if (!r.ok) return null;
    const p = (await r.json()) as Plan;
    return p && typeof p === 'object' ? p : null;
  } catch { return null; }
}

/**
 * Strain previsto de uma sessão planejada (03/11, v2: pelo histórico).
 * 1) Minutos × seu Strain por minuto típico (mediana) em sessões da mesma modalidade e mesma
 *    zona predominante nos últimos 120 dias (zona predominante: onde ficou mais tempo; abaixo da Z1 conta como Z1).
 *    "Z1–Z2" junta as sessões de Z1 e Z2. Precisa de 3+ sessões parecidas.
 *    O histórico vence o "strain" escrito no plano: em 03/11 o plano previa 60–72 para bike/natação leves
 *    e o feito costuma ficar em 30–40 (medido nas suas sessões).
 * 2) Sem histórico suficiente: o "strain" do plano, se houver.
 * 3) Senão: minutos × Strain/min típico da zona (v3: Z1 0,15 … Z5 1,8; sem zona = Z2).
 */
type Rates = Map<string, number[]>;
async function strainRates(env: Env, today: string): Promise<Rates> {
  const { results } = await env.DB.prepare(
    `SELECT sport, min, z1, z2, z3, z4, z5, ${STRAIN_SQL} strain FROM activities
     WHERE date BETWEEN ?1 AND ?2 AND min >= 10 AND (z1 IS NOT NULL OR z2 IS NOT NULL OR z3 IS NOT NULL)`,
  ).bind(addDays(today, -120), addDays(today, -1)).all<{ sport: Sport; min: number; z1: number | null; z2: number | null; z3: number | null; z4: number | null; z5: number | null; strain: number | null }>();
  const m: Rates = new Map();
  for (const a of results) {
    if (a.strain == null || !a.min) continue;
    const z = [a.z1, a.z2, a.z3, a.z4, a.z5].map((v) => v ?? 0);
    const below = Math.max(0, a.min - z.reduce((x, y) => x + y, 0));
    const cls = [z[0] + below, z[1], z[2], z[3], z[4]];
    const k = cls.indexOf(Math.max(...cls)) + 1;
    const key = `${a.sport}:${k}`;
    if (!m.has(key)) m.set(key, []);
    m.get(key)!.push(a.strain / a.min);
  }
  return m;
}
const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
function plannedStrainEst(p: PlanSession, rates?: Rates): { v: number | null; src: 'plano' | 'historico' | 'zona' | null; n?: number } {
  if (!p.minutos) return typeof p.esforco === 'number' ? { v: Math.round(p.esforco), src: 'plano' } : { v: null, src: null };
  const zs = [...String(p.zona ?? '').matchAll(/[1-5]/g)].map((m) => Number(m[0]));
  const sport = normSport(p.modalidade);
  if (rates) {
    const ks = zs.length ? [...new Set(zs.length === 2 ? range(zs[0], zs[1]) : zs)] : [2];
    const pool = ks.flatMap((k) => rates.get(`${sport}:${k}`) ?? []);
    if (pool.length >= 3) return { v: Math.round(p.minutos * median(pool)), src: 'historico', n: pool.length };
  }
  // "esforco" do plano (escala v3/Strava) vale; o "strain" antigo ficou fora (escala v1, 4–5× maior)
  if (typeof p.esforco === 'number') return { v: Math.round(p.esforco), src: 'plano' };
  // sem histórico daquela zona: Strain/min mediano da modalidade (qualquer zona) × fator da zona (Z2 = 1); sem nada, tabela fixa
  const F = [0.6, 1, 1.6, 2.4, 3.2], fz = zs.length ? zs.reduce((a, b) => a + F[b - 1], 0) / zs.length : 1;
  const all = rates ? [1, 2, 3, 4, 5].flatMap((k) => rates.get(`${sport}:${k}`) ?? []) : [];
  if (all.length >= 5) return { v: Math.round(p.minutos * median(all) * fz), src: 'zona' };
  const PER = [0.15, 0.3, 0.6, 1.1, 1.8], w = zs.length ? zs.reduce((a, b) => a + PER[b - 1], 0) / zs.length : PER[1];
  return { v: Math.round(p.minutos * w), src: 'zona' };
}
const range = (a: number, b: number) => { const lo = Math.min(a, b), hi = Math.max(a, b); return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i); };

const normSport = (m: string): Sport => {
  const k = (m || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (k.startsWith('bike') || k.startsWith('cicl') || k.startsWith('pedal')) return 'bike';
  if (k.startsWith('corr') || k.startsWith('run')) return 'corrida';
  if (k.startsWith('nat') || k.startsWith('swim')) return 'natacao';
  if (k.startsWith('hyrox') || k.startsWith('cardio')) return 'hyrox';
  if (k.startsWith('acad') || k.startsWith('forc') || k.startsWith('gym')) return 'academia';
  return 'outro';
};

async function weekPayload(env: Env, req: Request, offset: number) {
  const today = brtToday();
  const monday = addDays(mondayOf(today), -7 * offset), sunday = addDays(monday, 6);
  const { results: acts } = await env.DB.prepare(
    `SELECT id, date, time, sport, min, km, avghr, maxhr, rpe, z1, z2, z3, z4, z5, ${STRAIN_SQL} strain
     FROM activities WHERE date BETWEEN ?1 AND ?2 ORDER BY date, time`,
  ).bind(monday, sunday).all<Record<string, any>>();
  const { results: recs } = await env.DB.prepare('SELECT date, rec FROM rec_daily WHERE date BETWEEN ?1 AND ?2')
    .bind(monday, addDays(sunday, 1)).all<{ date: string; rec: number | null }>();
  const recBy = new Map(recs.map((r) => [r.date, r.rec == null ? null : Math.round(r.rec)]));
  const plan = await readPlan(env, req, monday);
  const rates = await strainRates(env, today);

  let plannedMin = 0, doneMin = 0, strainTot = 0, plannedStrainTot = 0;
  const dist = { low: 0, mid: 0, high: 0 };
  const days = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(monday, i);
    const ex = acts.filter((a) => a.date === date).map((a) => {
      const z = [a.z1, a.z2, a.z3, a.z4, a.z5].map((v: number | null) => v ?? 0);
      const inZ = z.reduce((x: number, y: number) => x + y, 0);
      const hasZ = [a.z1, a.z2, a.z3, a.z4, a.z5].some((v) => v != null);
      doneMin += a.min ?? 0; strainTot += a.strain ?? 0;
      if (hasZ && a.sport !== 'academia') { dist.low += Math.max(0, (a.min ?? 0) - inZ) + z[0] + z[1]; dist.mid += z[2]; dist.high += z[3] + z[4]; }
      return {
        id: a.id, time: a.time, sport: a.sport as Sport, label: SPORT_LABEL[a.sport as Sport], min: a.min, km: a.km, avghr: a.avghr, maxhr: a.maxhr,
        rpe: a.rpe, strain: a.strain == null ? null : Math.round(a.strain),
        zones: hasZ ? [Math.max(0, (a.min ?? 0) - inZ), ...z].map((m) => Math.round(m)) : null,
        matched: false,
      };
    });
    const planned = (plan?.dias?.[date] ?? []).map((p) => {
      const sport = normSport(p.modalidade);
      plannedMin += p.minutos ?? 0;
      const est = plannedStrainEst(p, rates), ps = est.v; plannedStrainTot += ps ?? 0;
      const hit = ex.find((e) => !e.matched && e.sport === sport);
      let status: 'feito' | 'parcial' | 'nao_feito' | 'previsto';
      if (hit) { hit.matched = true; status = !p.minutos || (hit.min ?? 0) >= p.minutos * 0.8 ? 'feito' : 'parcial'; }
      else status = date < today ? 'nao_feito' : 'previsto';
      return { ...p, sport, label: SPORT_LABEL[sport], status, activityId: hit?.id ?? null, plannedStrain: ps, plannedStrainSrc: est.src, doneStrain: hit?.strain ?? null };
    });
    const rec = recBy.get(date) ?? null, recNext = recBy.get(addDays(date, 1)) ?? null;
    days.push({ date, isToday: date === today, future: date > today, rec, recNext, planned, executed: ex });
  }
  const r1 = (x: number) => Math.round(x * 10) / 10;
  return {
    monday, sunday, offset,
    plan: plan ? { fase: plan.fase ?? null, notas: plan.notas ?? null } : null,
    summary: { plannedHours: plan ? r1(plannedMin / 60) : null, doneHours: r1(doneMin / 60), strain: Math.round(strainTot), plannedStrain: plan ? Math.round(plannedStrainTot) : null,
      dist: (() => { const t = dist.low + dist.mid + dist.high; return t ? { low: Math.round((dist.low / t) * 100), mid: Math.round((dist.mid / t) * 100), high: Math.round((dist.high / t) * 100) } : null; })() },
    days,
  };
}


// --- previsões de prova (corrida) ---
async function getSetting<T>(env: Env, key: string): Promise<T | null> {
  const r = await env.DB.prepare('SELECT value FROM settings WHERE key = ?1').bind(key).first<{ value: string }>();
  try { return r ? (JSON.parse(r.value) as T) : null; } catch { return null; }
}
async function setSetting(env: Env, key: string, value: unknown) {
  await env.DB.prepare(`INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`)
    .bind(key, JSON.stringify(value)).run();
}

/** Corridas ao ar livre com VO2máx estimado, desde `from`. */
async function runVdots(env: Env, from: string, to: string) {
  const { results: runs } = await env.DB.prepare(
    `SELECT date, km, min, avghr FROM activities
     WHERE type IN ('running', 'track_running', 'trail_running') AND km >= 2 AND avghr IS NOT NULL AND date BETWEEN ?1 AND ?2 ORDER BY date`,
  ).bind(from, to).all<{ date: string; km: number; min: number; avghr: number }>();
  // FC máxima de corrida: segunda maior dos últimos 12 meses (evita pico isolado do sensor)
  const { results: mx } = await env.DB.prepare(
    `SELECT maxhr FROM activities WHERE sport = 'corrida' AND maxhr IS NOT NULL AND date BETWEEN ?1 AND ?2 ORDER BY maxhr DESC LIMIT 2`,
  ).bind(addDays(to, -365), to).all<{ maxhr: number }>();
  const maxHr = mx.length ? mx[mx.length - 1].maxhr : 190;
  // FC de repouso: mediana de 30 dias até a data da corrida
  const { results: rh } = await env.DB.prepare('SELECT date, rhr FROM daily_metrics WHERE rhr IS NOT NULL AND date BETWEEN ?1 AND ?2 ORDER BY date')
    .bind(addDays(from, -30), to).all<{ date: string; rhr: number }>();
  const restOn = (d: string) => {
    const xs = rh.filter((r) => r.date <= d && daysBetween(r.date, d) < 30).map((r) => r.rhr).sort((a, b) => a - b);
    return xs.length ? xs[Math.floor(xs.length / 2)] : 45;
  };
  const out: { date: string; vdot: number }[] = [];
  for (const r of runs) { const v = vdotFromRun(r, restOn(r.date), maxHr); if (v != null) out.push({ date: r.date, vdot: v }); }
  return { runs: out, maxHr };
}

async function predictionsPayload(env: Env, months: number) {
  const today = brtToday();
  const start = addDays(today, -Math.round(months * 30.4));
  const { runs, maxHr } = await runVdots(env, addDays(start, -170), today);
  const factors = (await getSetting<Partial<Record<DistKey, number>>>(env, 'pred_factors')) ?? {};
  const daily: { date: string; times: Record<DistKey, number> | null }[] = [];
  for (let d = start; d <= today; d = addDays(d, 1)) {
    const v = vdotOn(d, runs);
    daily.push({ date: d, times: v ? predictAll(v.vdot, factors) : null });
  }
  // 1 mês: diário; 3 e 6 meses: mediana semanal (como o Strava)
  let series = daily;
  if (months > 1) {
    const weeks = new Map<string, typeof daily>();
    for (const x of daily) { const k = mondayOf(x.date); weeks.set(k, [...(weeks.get(k) ?? []), x]); }
    series = [...weeks.entries()].map(([k, xs]) => {
      const ok = xs.filter((x) => x.times);
      if (!ok.length) return { date: k, times: null };
      const med = (key: DistKey) => { const v = ok.map((x) => x.times![key]).sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; };
      return { date: k, times: Object.fromEntries(DISTANCES.map((dd) => [dd.key, med(dd.key)])) as Record<DistKey, number> };
    });
  }
  const now = vdotOn(today, runs);
  const ago = vdotOn(addDays(today, -28), runs);
  const lastRun = runs.length ? runs[runs.length - 1].date : null;
  return {
    months, today, maxHr, lastRun,
    runsInWindow: now?.n ?? runs.filter((r) => daysBetween(r.date, today) < 168).length,
    calibrated: Object.keys(factors).length > 0,
    current: now ? predictAll(now.vdot, factors) : null,
    fourWeeksAgo: ago ? predictAll(ago.vdot, factors) : null,
    series,
  };
}


// --- Forma projetada até a prova ---
// Fitness/Fadiga continuam pelo modelo de Banister usando o Strain previsto do plano publicado
// (sessões ainda não feitas de hoje + dias seguintes). Só projeta até onde há plano publicado.
async function formProjection(env: Env, req: Request, today: string) {
  const loads = await dailyLoads(env, addDays(today, -400), today);
  const rates = await strainRates(env, today);
  const plans = new Map<string, Plan | null>();
  const planFor = async (d: string) => { const m = mondayOf(d); if (!plans.has(m)) plans.set(m, await readPlan(env, req, m)); return plans.get(m); };
  // hoje: feito + sessões planejadas de modalidades que ainda não apareceram
  const { results: doneToday } = await env.DB.prepare('SELECT sport FROM activities WHERE date = ?1').bind(today).all<{ sport: Sport }>();
  const left = [...doneToday.map((a) => a.sport)];
  let planUntil: string | null = null;
  const t0 = await planFor(today);
  if (t0) planUntil = addDays(mondayOf(today), 6);
  for (const p of t0?.dias?.[today] ?? []) {
    const sp = normSport(p.modalidade), i = left.indexOf(sp);
    if (i >= 0) { left.splice(i, 1); continue; }
    loads[loads.length - 1].load += plannedStrainEst(p, rates).v ?? 0;
  }
  // dias seguintes até a véspera da prova
  for (let d = addDays(today, 1); d <= RACE.date; d = addDays(d, 1)) {
    const pl = await planFor(d);
    if (!pl) break;
    planUntil = addDays(mondayOf(d), 6);
    loads.push({ date: d, load: d === RACE.date ? 0 : (pl.dias?.[d] ?? []).reduce((a, p) => a + (plannedStrainEst(p, rates).v ?? 0), 0) });
  }
  // a manhã seguinte ao último dia projetado também tem Forma definida
  const lastLoad = loads[loads.length - 1].date;
  if (lastLoad < RACE.date) loads.push({ date: addDays(lastLoad, 1), load: 0 });
  const p = pmc(loads);
  const series = p.filter((x) => x.date >= addDays(today, -14)).map((x) => ({
    date: x.date, formPct: x.formPct == null ? null : Math.round(x.formPct), projected: x.date > today,
    fitness: Math.round(x.fitness), fatigue: Math.round(x.fatigue),
  }));
  const last = series[series.length - 1];
  const race = series.find((x) => x.date === RACE.date) ?? null;
  return {
    planUntil, series,
    end: last && { date: last.date, formPct: last.formPct, zone: formZone(last.formPct) && { key: formZone(last.formPct)!.key, label: formZone(last.formPct)!.label } },
    raceDay: race && { formPct: race.formPct, zone: formZone(race.formPct) && { key: formZone(race.formPct)!.key, label: formZone(race.formPct)!.label } },
  };
}

// --- modo prova ---
interface RaceItem { id: string; texto: string; done: boolean }
const slug = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

async function racePayload(env: Env, req: Request) {
  const today = brtToday();
  let plan: any = null;
  try { const r = await env.ASSETS.fetch(new Request(new URL('/plan/prova.json', req.url))); if (r.ok) plan = await r.json(); } catch {}
  // checklist escrito pelo Luca no app (sem itens padrão)
  const items = (await getSetting<RaceItem[]>(env, 'race_items')) ?? [];
  const ln = await loadOn(env, today);
  const rec = await env.DB.prepare('SELECT rec FROM rec_daily WHERE date = ?1').bind(today).first<{ rec: number | null }>();
  const pred = await (async () => {
    const { runs } = await runVdots(env, addDays(today, -170), today);
    const v = vdotOn(today, runs);
    if (!v) return null;
    const f = (await getSetting<Partial<Record<DistKey, number>>>(env, 'pred_factors')) ?? {};
    return predictAll(v.vdot, f).d21;
  })();
  const projection = await formProjection(env, req, today);
  const heat = await heatPayload(env, req);
  return {
    projection, heat,
    final: await finalStretch(env, today, projection as any),
    taper: Array.isArray(plan?.taper) ? plan.taper : null,
    race: { ...RACE, days: daysBetween(today, RACE.date), raceWeek: daysBetween(today, RACE.date) <= 6 && daysBetween(today, RACE.date) >= -1 },
    today: { rec: rec?.rec == null ? null : Math.round(rec.rec), ready: rec?.rec == null ? null : Math.round((await readyOn(env, today, rec.rec)).score ?? 0) || null, formPct: ln.formPct, zone: ln.zone },
    halfPrediction: pred,
    items,
    carbo: Array.isArray(plan?.carbo) ? plan.carbo : null,
    pace: plan?.pace ?? null,
    notas: plan?.notas ?? null,
  };
}


// --- Strain semanal com faixa (estilo Relative Effort do Strava) ---
// Faixa da semana = média das 3 semanas anteriores × 0,8 a 1,3 (razão aguda/crônica; "sweet spot" de Gabbett).
async function strainWeeksPayload(env: Env, weeks: number) {
  const today = brtToday();
  const thisMon = mondayOf(today);
  const first = addDays(thisMon, -7 * (weeks + 3 - 1));
  const loads = await dailyLoads(env, first, addDays(thisMon, 6) > today ? today : addDays(thisMon, 6));
  const byDate = new Map(loads.map((x) => [x.date, x.load]));
  const all: { start: string; days: (number | null)[]; total: number }[] = [];
  for (let i = 0; i < weeks + 3; i++) {
    const start = addDays(first, 7 * i);
    const days = [0, 1, 2, 3, 4, 5, 6].map((k) => { const d = addDays(start, k); return d > today ? null : Math.round(byDate.get(d) ?? 0); });
    all.push({ start, days, total: days.reduce<number>((a, v) => a + (v ?? 0), 0) });
  }
  const { results: acts } = await env.DB.prepare(
    `SELECT date, time, sport, min, km, ${STRAIN_SQL} strain FROM activities WHERE date BETWEEN ?1 AND ?2 ORDER BY date, time`,
  ).bind(all[3].start, today).all<{ date: string; time: string; sport: Sport; min: number; km: number; strain: number | null }>();
  const out = all.slice(3).map((w, i) => {
    const prev = all.slice(i, i + 3);
    const avg = prev.reduce((a, x) => a + x.total, 0) / 3;
    const lo = Math.round(avg * 0.8), hi = Math.round(avg * 1.3);
    const ratio = avg > 0 ? w.total / avg : null;
    const status = !avg ? null : w.total < lo ? 'abaixo' : w.total <= hi ? 'dentro' : ratio! <= 1.5 ? 'acima' : 'bem_acima';
    const end = addDays(w.start, 6);
    const activities = acts.filter((a) => a.date >= w.start && a.date <= end)
      .map((a) => ({ date: a.date, time: a.time, sport: a.sport, label: SPORT_LABEL[a.sport], min: a.min, km: a.km, strain: a.strain == null ? null : Math.round(a.strain) }));
    return { ...w, avg3: Math.round(avg), lo, hi, ratio: ratio == null ? null : Math.round(ratio * 100) / 100, status, current: w.start === thisMon, activities };
  });
  return { today, weeks: out };
}

// --- avisos de carga (fato, sem conselho) ---
async function loadAlerts(env: Env, date: string) {
  const out: { kind: string; text: string }[] = [];
  const loads = await dailyLoads(env, addDays(date, -60), addDays(date, -1)); // até ontem: o dia de hoje ainda está acontecendo
  const r = acwr(loads.map((x) => x.load));
  if (r != null && r > 1.4) out.push({ kind: 'carga', text: `Strain dos últimos 7 dias ${Math.round((r - 1) * 100)}% acima da sua média semanal de 4 semanas (razão ${r.toFixed(2).replace('.', ',')}; faixa usual 0,8–1,4).` });
  if (r != null && r < 0.8 && loads.slice(-28).some((x) => x.load > 0)) out.push({ kind: 'carga', text: `Strain dos últimos 7 dias ${Math.round((1 - r) * 100)}% abaixo da sua média semanal de 4 semanas (razão ${r.toFixed(2).replace('.', ',')}).` });

  // corrida: semana atual (seg até hoje) contra a média das 4 semanas completas anteriores
  const mon = mondayOf(date);
  const run = await env.DB.prepare(`SELECT
      SUM(CASE WHEN date >= ?1 THEN COALESCE(km,0) ELSE 0 END) now,
      SUM(CASE WHEN date < ?1 THEN COALESCE(km,0) ELSE 0 END) / 4.0 avg4
    FROM activities WHERE sport = 'corrida' AND date BETWEEN ?2 AND ?3`).bind(mon, addDays(mon, -28), date).first<{ now: number | null; avg4: number | null }>();
  if (run?.avg4 && run.now && run.now > run.avg4 * 1.15)
    out.push({ kind: 'corrida', text: `Corrida desta semana: ${run.now.toFixed(1).replace('.', ',')} km, ${Math.round((run.now / run.avg4 - 1) * 100)}% acima da média das últimas 4 semanas (${run.avg4.toFixed(1).replace('.', ',')} km).` });
  return out;
}

// --- leitura ---
type RecDb = Record<string, number | string | null>;
const toRow = (d: RecDb): RecRow => ({
  date: d.date as string,
  rec: d.rec as number | null,
  z: Object.fromEntries(K.map((k) => [k, d['z_' + k]])) as RecRow['z'],
  value: Object.fromEntries(K.map((k) => [k, d['v_' + k]])) as RecRow['value'],
  base: Object.fromEntries(K.map((k) => [k, d['b_' + k]])) as RecRow['base'],
});

async function todayPayload(env: Env, date: string, req?: Request) {
  await ensureSchema(env);
  const { results } = await env.DB.prepare('SELECT * FROM rec_daily WHERE date BETWEEN ?1 AND ?2 ORDER BY date')
    .bind(addDays(date, -7), date).all<RecDb>();
  const rows = results.map(toRow);
  const today = rows.find((r) => r.date === date) ?? null;
  const hist = rows.filter((r) => r.date < date);
  const yesterday = hist.find((r) => r.date === addDays(date, -1));

  const acts = await env.DB.prepare(`SELECT id, time, type, sport, min, km, avghr, maxhr, rpe, z1, z2, z3, z4, z5, ${STRAIN_SQL} strain FROM activities WHERE date = ?1 ORDER BY time`)
    .bind(date).all<{ id: string; time: string; type: string; sport: Sport; min: number; km: number; avghr: number; maxhr: number | null; rpe: number | null; strain: number | null; z1: number | null; z2: number | null; z3: number | null; z4: number | null; z5: number | null }>();
  const feel = await env.DB.prepare('SELECT value FROM feel_notes WHERE date = ?1').bind(date).first<{ value: number }>();
  const { results: tagRows } = await env.DB.prepare('SELECT tag FROM habit_tags WHERE date = ?1').bind(date).all<{ tag: string }>();
  const lastSync = await env.DB.prepare('SELECT at, status, detail FROM sync_log ORDER BY id DESC LIMIT 1').first();
  const ln = await loadOn(env, date);
  const phase = req ? (await readPlan(env, req, mondayOf(date)))?.fase ?? null : null;
  const tomorrow = req ? await (async () => {
    const t = addDays(date, 1), pl = await readPlan(env, req, mondayOf(t));
    if (!pl) return null;
    const rates = await strainRates(env, date);
    return { date: t, sessions: (pl.dias?.[t] ?? []).map((p) => { const sp = normSport(p.modalidade); return { label: SPORT_LABEL[sp], sport: sp, titulo: p.titulo ?? null, minutos: p.minutos ?? null, zona: p.zona ?? null, chave: !!p.chave, strain: plannedStrainEst(p, rates).v }; }) };
  })() : null;
  let hasWeekPlan = false;
  const planned = await (async () => {
    if (!req) return [] as { label: string; sport: Sport; titulo: string | null; minutos: number | null; zona: string | null; chave: boolean; strain: number | null; strainSrc: string | null }[];
    const plan = await readPlan(env, req, mondayOf(date));
    hasWeekPlan = !!plan?.dias;
    const rates = await strainRates(env, date);
    return (plan?.dias?.[date] ?? []).map((p) => { const sp = normSport(p.modalidade); const e = plannedStrainEst(p, rates); return { label: SPORT_LABEL[sp], sport: sp, titulo: p.titulo ?? null, minutos: p.minutos ?? null, zona: p.zona ?? null, chave: !!p.chave, strain: e.v, strainSrc: e.src }; });
  })();
  const verdict7 = await (async () => {
    const { results: zr } = await env.DB.prepare('SELECT date, z_hrv, z_rhr, z_sleep, z_resp, z_stress FROM rec_daily WHERE date BETWEEN ?1 AND ?2 ORDER BY date')
      .bind(addDays(date, -6), date).all<Record<string, number | null>>();
    return recoveryVerdict(zr.map((r) => ({ date: r.date as unknown as string, z: { hrv: r.z_hrv, rhr: r.z_rhr, sleep: r.z_sleep, resp: r.z_resp, stress: r.z_stress }, raw: {} })),
      { zoneKey: ln.zone?.key ?? null, fatigueAboveDays: 0, hrvBase: null, rhrBase: null, sleepNeed: 7.5 });
  })();
  const { results: nights } = await env.DB.prepare('SELECT date, sleep_h, nap_h, sleep_start, sleep_end FROM daily_metrics WHERE date BETWEEN ?1 AND ?2 ORDER BY date')
    .bind(addDays(date, -140), date).all<SleepNight>();
  const sb = await sleepBase(env, date);
  const need = sb.hours;
  const heavy = ln.zone?.key === 'produtivo' || ln.zone?.key === 'risco';
  const debt = sleepDebt(nights, need, date);
  const lastNight = nights.find((n) => n.date === date) ?? null;
  const yesterdayNap = nights.find((n) => n.date === addDays(date, -1))?.nap_h ?? null;

  const empty: RecRow = { date, rec: null, z: {} as RecRow['z'], value: {} as RecRow['value'], base: {} as RecRow['base'] };
  for (const k of K) { empty.z[k] = null; empty.value[k] = null; empty.base[k] = null; }
  const t = today ?? empty;
  const ready = await readyOn(env, date, t.rec);
  const illA = await (async () => {
    const sick = (await env.DB.prepare("SELECT 1 x FROM habit_tags WHERE tag = 'doente' AND date BETWEEN ?1 AND ?2").bind(addDays(date, -1), date).first()) != null;
    const zz = (r: RecRow | undefined | null) => (r ? { resp: r.z.resp, rhr: r.z.rhr, hrv: r.z.hrv, stress: r.z.stress } : null);
    return illnessAlert(today ? zz(t) : null, zz(yesterday), sick);
  })();
  const illnessNow = illA != null;

  const minsSinceSync = lastSync?.at ? Math.round((Date.now() - Date.parse(String(lastSync.at).replace(' ', 'T') + 'Z')) / 60000) : null;
  const syncIssue = await syncIssueOf(env, date, lastSync, minsSinceSync);

  return {
    date,
    rec: t.rec === null ? null : Math.round(t.rec),
    contributors: contributors(t),
    comment: comment(t, hist),
    alerts: [
      ...(illA ? [illA] : []),
      ...alerts(t, yesterday), ...(await loadAlerts(env, date)),
    ],
    hrvTrend: await (async () => { const h = await hrvTrendOn(env, date); return h && { cls: h.cls, label: h.label, days: h.days, mean7: h.mean7, lo: h.lo, hi: h.hi }; })(),
    week: [...hist, t].slice(-7).map((r) => ({ date: r.date, rec: r.rec === null ? null : Math.round(r.rec) })),
    activities: acts.results.map((a) => {
      const z = [a.z1, a.z2, a.z3, a.z4, a.z5];
      const has = z.some((v) => v != null), inZ = z.reduce<number>((x, v) => x + (v ?? 0), 0);
      return {
        id: a.id, time: a.time, type: a.type, sport: a.sport, label: SPORT_LABEL[a.sport], min: a.min, km: a.km, avghr: a.avghr, maxhr: a.maxhr, rpe: a.rpe,
        strain: a.strain == null ? null : Math.round(a.strain),
        zones: has ? [Math.max(0, (a.min ?? 0) - inZ), ...z.map((v) => v ?? 0)].map((m) => Math.round(m)) : null,
      };
    }),
    feel: feel?.value ?? null,
    habits: { defs: HABITS, on: tagRows.map((t) => t.tag) },
    load: ln,
    ready,
    // manhã sem a noite: Prontidão de ontem, apagada na tela
    readyPrev: ready.score == null && date === brtToday() ? (await readyOn(env, addDays(date, -1))).score : null,
    day: (() => {
      const recR = t.rec == null ? null : Math.round(t.rec);
      const trend = recTrend([...hist, t].slice(-7).map((r) => ({ date: r.date, rec: r.rec == null ? null : Math.round(r.rec) })));
      const target = strainTargetV2({
        ...ln.tgt, recToday: ready.score == null ? recR : Math.round(ready.score), verdictLevel: verdict7?.level ?? null, zoneKey: ln.zone?.key ?? null,
        plannedToday: planned.length ? planned.reduce((a, x) => a + (x.strain ?? 0), 0) : null,
      });
      const hl = dayHeadline({
        date, ready: ready.score, rec: recR, parts: ready.parts, trend, planned, target: target?.target ?? null,
        sleepH: lastNight?.sleep_h ?? null, sleepBase: sb.hours, debtH: debt, raceDays: daysBetween(date, RACE.date),
        illness: illnessNow, hasWeekPlan,
      });
      return { summary: hl?.title ?? dailySummary(recR, ln.zone?.key ?? null), why: hl?.why ?? [], trend, target };
    })(),
    planned,
    phase, tomorrow,
    sleep: {
      night: lastNight && { hours: lastNight.sleep_h, start: lastNight.sleep_start?.slice(11) ?? null, end: lastNight.sleep_end?.slice(11) ?? null },
      napYesterday: yesterdayNap,
      debt: debt == null ? null : Math.round(debt * 100) / 100,
      level: debtLevel(debt),
      personalNeed: Math.round(need * 100) / 100,
      base: { hours: sb.hours, month: sb.month, n: sb.n, fallback: sb.fallback, below7: sb.below7, above7: sb.above7 },
      need: sleepNeedTonight(need, debt, ln.strain, lastNight?.nap_h ?? null, heavy),
      regularity: regularity(nights),
      regularityScore: regularityScore(regularity(nights)),
      bedtime: bedtimeTarget(nights, sleepNeedTonight(need, debt, ln.strain, lastNight?.nap_h ?? null, heavy).total, addDays(date, 1)),
    },
    isToday: date === brtToday(),
    race: { ...RACE, days: daysBetween(date, RACE.date), raceWeek: daysBetween(date, RACE.date) <= 6 && daysBetween(date, RACE.date) >= -1 },
    // app busca sozinho ao abrir quando a noite de hoje ainda não está no banco
    needsSync: date === brtToday() && !(await hasTonight(env, date)),
    // menos de 30 noites com HRV: o REC ainda não tem base; o app aponta para "Puxar histórico"
    needsHistory: ((await env.DB.prepare('SELECT COUNT(*) n FROM daily_metrics WHERE hrv IS NOT NULL').first<{ n: number }>())?.n ?? 0) < 30,
    shadowMode: true, // primeiras 6–8 semanas: REC não decide treino
    lastSync,
    minsSinceSync,
    syncIssue,
  };
}

// --- clima de Aracaju no dia da prova (F4) ---
async function weatherPayload(env: Env) {
  const today = brtToday();
  const days = daysBetween(today, RACE.date);
  const mode = days <= 15 ? 'previsao' : 'historico';
  type Cache = { at: number; mode: string; rows: HourRow[]; years?: number };
  const c = await getSetting<Cache>(env, 'weather');
  const ttl = mode === 'previsao' ? 3 * 3600e3 : 30 * 86400e3;
  if (c && c.mode === mode && Date.now() - c.at < ttl && c.rows.length) return { mode, days, rows: c.rows, years: c.years ?? null, cached: true, availableFrom: addDays(RACE.date, -15) };
  const q = `latitude=${ARACAJU.lat}&longitude=${ARACAJU.lon}&timezone=${encodeURIComponent(ARACAJU.tz)}`;
  let rows: HourRow[] = [], years: number | undefined;
  try {
    if (mode === 'previsao') {
      const r = await fetch(`https://api.open-meteo.com/v1/forecast?${q}&hourly=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation_probability,wind_speed_10m,uv_index&start_date=${RACE.date}&end_date=${RACE.date}`);
      if (r.ok) rows = parseForecast(await r.json(), RACE.date);
    } else {
      const y0 = Number(today.slice(0, 4)) - 1, md = RACE.date.slice(5);
      const yrs = Array.from({ length: 10 }, (_, i) => y0 - i);
      const res = await Promise.all(yrs.map(async (y) => {
        const mid = `${y}-${md}`;
        const r = await fetch(`https://archive-api.open-meteo.com/v1/archive?${q}&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation&start_date=${addDays(mid, -7)}&end_date=${addDays(mid, 7)}`);
        return r.ok ? r.json() : null;
      }));
      const ok = res.filter(Boolean);
      rows = climatology(ok); years = ok.length;
    }
  } catch { /* sem rede: devolve o cache antigo, se houver */ }
  if (!rows.length) return c ? { mode: c.mode, days, rows: c.rows, years: c.years ?? null, cached: true, stale: true, availableFrom: addDays(RACE.date, -15) } : { mode, days, rows: [], error: 'sem_resposta', availableFrom: addDays(RACE.date, -15) };
  await setSetting(env, 'weather', { at: Date.now(), mode, rows, years });
  return { mode, days, rows, years: years ?? null, cached: false, availableFrom: addDays(RACE.date, -15) };
}

// --- base de sono pela resposta do HRV (refeita uma vez por mês, guardada em settings) ---
type SleepBase = { month: string; hours: number; n: number; fallback: boolean; below7: number | null; above7: number | null };
async function sleepBase(env: Env, date: string): Promise<SleepBase> {
  const month = date.slice(0, 7);
  const c = await getSetting<SleepBase>(env, 'sleep_base');
  if (c && c.month === month) return c;
  const to = `${month}-01`, from = addDays(to, -260);
  const { results } = await env.DB.prepare('SELECT date, hrv, sleep_h FROM daily_metrics WHERE date >= ?1 AND date < ?2').bind(from, to).all<{ date: string; hrv: number | null; sleep_h: number | null }>();
  const m = new Map(results.map((r) => [r.date, r]));
  const rows = [];
  for (let d = from; d < to; d = addDays(d, 1)) rows.push(m.get(d) ?? { date: d, hrv: null, sleep_h: null });
  const r = responseNeed(rows);
  const out = { month, ...r };
  await setSetting(env, 'sleep_base', out);
  return out;
}

// --- um treino, para o cartão de compartilhar ---
async function activityPayload(env: Env, id: string, req?: Request) {
  await ensureSchema(env);
  const a = await env.DB.prepare(`SELECT *, ${STRAIN_SQL} strain FROM activities WHERE id = ?1`).bind(id).first<Record<string, any>>();
  if (!a) return null;
  const rec = await env.DB.prepare('SELECT rec FROM rec_daily WHERE date = ?1').bind(a.date).first<{ rec: number | null }>();
  const recNext = await env.DB.prepare('SELECT rec FROM rec_daily WHERE date = ?1').bind(addDays(a.date, 1)).first<{ rec: number | null }>();
  const ln = await loadOn(env, a.date);
  // sessão do plano daquele dia, mesma modalidade
  const plan = req ? await (async () => {
    const pl = await readPlan(env, req, mondayOf(a.date));
    const p = (pl?.dias?.[a.date] ?? []).find((x) => normSport(x.modalidade) === a.sport);
    if (!p) return null;
    const rates = await strainRates(env, a.date);
    return { titulo: p.titulo ?? null, minutos: p.minutos ?? null, zona: p.zona ?? null, detalhe: p.detalhe ?? null, strain: plannedStrainEst(p, rates).v };
  })() : null;
  const z = [a.z1, a.z2, a.z3, a.z4, a.z5];
  const has = z.some((v) => v != null), inZ = z.reduce((x: number, v: number | null) => x + (v ?? 0), 0);
  const active = a.kcal != null ? (a.kcal_bmr != null ? a.kcal - a.kcal_bmr : a.kcal) : null;
  const { results: past } = await env.DB.prepare(`SELECT id, date, type, min, km, avghr, ${STRAIN_SQL} strain FROM activities WHERE sport = ?1 AND date BETWEEN ?2 AND ?3 AND min >= 10`)
    .bind(a.sport, addDays(a.date, -365), a.date).all<{ id: string; date: string; type: string | null; min: number; km: number | null; avghr: number | null; strain: number | null }>();
  const insights = workoutInsights({ id: a.id, date: a.date, type: a.type, min: a.min ?? 0, km: a.km, avghr: a.avghr, strain: a.strain, sport: a.sport, label: SPORT_LABEL[a.sport as Sport] }, past);
  return {
    insights,
    id: a.id, date: a.date, time: a.time, type: a.type, sport: a.sport as Sport, label: SPORT_LABEL[a.sport as Sport], name: a.name ?? null,
    indoor: /indoor|virtual|treadmill|trainer|pool/i.test(a.type ?? ''),
    min: a.min, km: a.km, avghr: a.avghr, maxhr: a.maxhr, rpe: a.rpe,
    kcal: active == null ? null : Math.round(active), kcalActive: a.kcal_bmr != null,
    elev: a.elev == null ? null : Math.round(a.elev), speed: a.speed, maxspeed: a.maxspeed, power: a.power == null ? null : Math.round(a.power),
    cadence: a.cadence == null ? null : Math.round(a.cadence), teAer: a.te_aer, teAna: a.te_ana,
    strain: a.strain == null ? null : Math.round(a.strain),
    strainVsDay: ln.fitness ? Math.round((a.strain ?? 0) / ln.fitness * 100) / 100 : null,
    zones: has ? [Math.max(0, (a.min ?? 0) - inZ), ...z.map((v) => v ?? 0)].map((m) => Math.round(m)) : null,
    rec: rec?.rec == null ? null : Math.round(rec.rec),
    ready: rec?.rec == null ? null : (await readyOn(env, a.date, rec.rec)).score,
    recNext: recNext?.rec == null ? null : Math.round(recNext.rec),
    form: ln.formPct, formZone: ln.zone && { key: ln.zone.key, label: ln.zone.label },
    garminLoad: a.load == null ? null : Math.round(a.load), teLabel: a.te_label ?? null,
    fitness: ln.fitness, plan,
  };
}

// --- aclimatação ao calor (F3) ---
// Sessão no calor = treino feito que (a) o plano marcou como calor ("calor": true, título "Calor …" ou "cobre o calor"),
// ou (b) foi na rua com temperatura média ≥ 28 °C em Brasília durante o treino (Open-Meteo, cache de 6 h).
const BSB = { lat: -15.79, lon: -47.88 };
async function bsbTemps(env: Env): Promise<Record<string, number> | null> {
  type C = { at: number; t: Record<string, number> };
  const c = await getSetting<C>(env, 'bsb_temp');
  if (c && Date.now() - c.at < 6 * 3600e3) return c.t;
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${BSB.lat}&longitude=${BSB.lon}&hourly=temperature_2m&past_days=31&forecast_days=1&timezone=America%2FSao_Paulo`);
    if (!r.ok) return c?.t ?? null;
    const j = await r.json<any>();
    const t: Record<string, number> = {};
    (j?.hourly?.time ?? []).forEach((k: string, i: number) => { const v = j.hourly.temperature_2m?.[i]; if (typeof v === 'number') t[k.slice(0, 13)] = v; });
    await setSetting(env, 'bsb_temp', { at: Date.now(), t });
    return t;
  } catch { return c?.t ?? null; }
}
async function heatPayload(env: Env, req: Request) {
  const today = brtToday(), from = addDays(today, -20);
  const { results: acts } = await env.DB.prepare(`SELECT id, date, time, type, sport, min FROM activities WHERE date BETWEEN ?1 AND ?2 AND min >= 20 ORDER BY date, time`)
    .bind(from, today).all<{ id: string; date: string; time: string | null; type: string; sport: Sport; min: number }>();
  const plans = new Map<string, Plan | null>();
  const planFor = async (d: string) => { const m = mondayOf(d); if (!plans.has(m)) plans.set(m, await readPlan(env, req, m)); return plans.get(m); };
  const temps = await bsbTemps(env);
  const out: { date: string; sport: Sport; label: string; min: number; why: string; temp: number | null }[] = [];
  for (const a of acts) {
    const pl = (await planFor(a.date))?.dias?.[a.date] ?? [];
    const heatPlan = pl.find((p) => normSport(p.modalidade) === a.sport && ((p as any).calor === true || /^calor\b/i.test(p.titulo ?? '') || /cobre o calor/i.test(p.detalhe ?? '')));
    let temp: number | null = null;
    if (temps && a.time && !/indoor|virtual|treadmill|trainer|pool|lap_swim/i.test(a.type)) {
      const h0 = Number(a.time.slice(0, 2)), h1 = Math.min(23, Math.floor(h0 + (Number(a.time.slice(3, 5)) + a.min) / 60));
      const vs: number[] = []; for (let h = h0; h <= h1; h++) { const v = temps[`${a.date}T${String(h).padStart(2, '0')}`]; if (v != null) vs.push(v); }
      if (vs.length) temp = Math.round((vs.reduce((x, y) => x + y, 0) / vs.length) * 10) / 10;
    }
    const hot = temp != null && temp >= 28;
    if (heatPlan || hot) out.push({ date: a.date, sport: a.sport, label: SPORT_LABEL[a.sport], min: Math.round(a.min), why: heatPlan ? (heatPlan.titulo ?? 'sessão de calor do plano') : `rua a ${String(temp).replace('.', ',')} °C`, temp });
  }
  const last14 = out.filter((x) => x.date >= addDays(today, -13));
  const last = out[out.length - 1];
  return {
    sessions: last14.reverse(), count14: last14.length, minutes14: last14.reduce((a, x) => a + x.min, 0),
    daysSince: last ? daysBetween(last.date, today) : null, weather: !!temps,
  };
}

async function verdictOn(env: Env, date: string, zoneKey: string | null) {
  const { results: zr } = await env.DB.prepare('SELECT date, z_hrv, z_rhr, z_sleep, z_resp, z_stress FROM rec_daily WHERE date BETWEEN ?1 AND ?2 ORDER BY date')
    .bind(addDays(date, -6), date).all<Record<string, number | null>>();
  return recoveryVerdict(zr.map((r) => ({ date: r.date as unknown as string, z: { hrv: r.z_hrv, rhr: r.z_rhr, sleep: r.z_sleep, resp: r.z_resp, stress: r.z_stress }, raw: {} })),
    { zoneKey, fatigueAboveDays: 0, hrvBase: null, rhrBase: null, sleepNeed: 7.5 });
}

// --- I1 + I2: foco da carga e status de treino ---
async function loadInsightsPayload(env: Env) {
  const today = brtToday();
  const ln = await loadOn(env, today);
  const h = await hrvTrendOn(env, today);
  const v7 = await verdictOn(env, today, ln.zone?.key ?? null);
  const status = trainingStatus({ fitness4w: ln.fitness4w, acwr: ln.tgt.acwr, formPct: ln.formPct, hrvCls: h?.cls ?? null, recovery: v7?.level ?? null });
  const { results } = await env.DB.prepare(`SELECT min, z1, z2, z3, z4, z5 FROM activities WHERE date BETWEEN ?1 AND ?2 AND sport <> 'academia'`)
    .bind(addDays(today, -27), today).all<{ min: number | null; z1: number | null; z2: number | null; z3: number | null; z4: number | null; z5: number | null }>();
  const focus = loadFocus(results.map((r) => ({ min: r.min, z: [r.z1, r.z2, r.z3, r.z4, r.z5] })));
  return { status: { ...status, hrv: h ? h.label : null }, focus };
}

// --- I5: estresse acumulado em 31 dias ---
async function stress31Payload(env: Env) {
  const today = brtToday(), from = addDays(today, -30);
  const { results: z } = await env.DB.prepare('SELECT z_hrv, z_rhr, z_sleep, z_stress FROM rec_daily WHERE date BETWEEN ?1 AND ?2').bind(from, today)
    .all<{ z_hrv: number | null; z_rhr: number | null; z_sleep: number | null; z_stress: number | null }>();
  const { results: nights } = await env.DB.prepare('SELECT date, sleep_h, sleep_start, sleep_end FROM daily_metrics WHERE date BETWEEN ?1 AND ?2 ORDER BY date')
    .bind(addDays(today, -140), today).all<SleepNight>();
  const irr = irregularNights(nights);
  const pct = (xs: { irregular: boolean }[]) => (xs.length >= 10 ? Math.round((xs.filter((x) => x.irregular).length / xs.length) * 100) : null);
  const loads = await dailyLoads(env, addDays(today, -400), today);
  const p = pmc(loads).filter((d) => d.date >= from);
  const r = cumulativeStress({
    z: { hrv: z.map((x) => x.z_hrv), rhr: z.map((x) => x.z_rhr), sleep: z.map((x) => x.z_sleep), stress: z.map((x) => x.z_stress) },
    irregularPct: pct(irr.filter((x) => x.date >= from)), irregularPctBefore: pct(irr.filter((x) => x.date < from && x.date >= addDays(from, -90))),
    fatigueAboveDays: p.filter((d) => d.fatigue > d.fitness).length,
  });
  return r;
}

// --- diagnóstico da tela Garmin (04/11): o que tem, o que falta e a ordem para completar ---
// "fetched" guarda os intervalos já pedidos à API: um dia sem dado que a Garmin não tem não vira pendência eterna.
const HISTORY_FROM = '2025-05-01';
type Ranges = [string, string][];
async function markFetched(env: Env, kind: 'days' | 'acts', from: string, to: string) {
  const f = (await getSetting<{ days?: Ranges; acts?: Ranges }>(env, 'fetched')) ?? {};
  const all = [...(f[kind] ?? []), [from, to] as [string, string]].sort((a, b) => a[0].localeCompare(b[0]));
  const out: Ranges = [];
  for (const r of all) {
    const last = out[out.length - 1];
    if (last && r[0] <= addDays(last[1], 1)) { if (r[1] > last[1]) last[1] = r[1]; } else out.push([r[0], r[1]]);
  }
  f[kind] = out; await setSetting(env, 'fetched', f);
}
const inRanges = (d: string, rs: Ranges) => rs.some(([a, b]) => d >= a && d <= b);
function windows(dates: string[], len: number, today: string): Ranges {
  const out: Ranges = [];
  for (const d of [...dates].sort()) {
    if (out.length && d <= out[out.length - 1][1]) continue;
    const end = addDays(d, len - 1);
    out.push([d, end > today ? today : end]);
  }
  return out;
}
async function diagPayload(env: Env) {
  await ensureSchema(env);
  const today = brtToday(), yest = addDays(today, -1);
  const fetched = (await getSetting<{ days?: Ranges; acts?: Ranges }>(env, 'fetched')) ?? {};
  const fd = fetched.days ?? [], fa = fetched.acts ?? [];
  const last = await env.DB.prepare('SELECT at, status, detail FROM sync_log ORDER BY id DESC LIMIT 1').first<{ at: string; status: string; detail: string }>();
  const okSync = await env.DB.prepare("SELECT at FROM sync_log WHERE status != 'erro' ORDER BY id DESC LIMIT 1").first<{ at: string }>();
  const mins = (at?: string) => (at ? Math.round((Date.now() - Date.parse(at.replace(' ', 'T') + 'Z')) / 60000) : null);

  const t = await env.DB.prepare('SELECT hrv, rhr, sleep_h, resp FROM daily_metrics WHERE date = ?1').bind(today).first<Record<string, number | null>>();
  const y = await env.DB.prepare('SELECT stress FROM daily_metrics WHERE date = ?1').bind(yest).first<{ stress: number | null }>();
  const noite = { hrv: t?.hrv != null, rhr: t?.rhr != null, sleep: t?.sleep_h != null, resp: t?.resp != null, stress: y?.stress != null };

  // dias: sem linha nenhuma e ainda não pedidos à API (até ontem)
  const { results: dr } = await env.DB.prepare('SELECT date, sleep_h, sleep_start FROM daily_metrics WHERE date >= ?1').bind(HISTORY_FROM).all<{ date: string; sleep_h: number | null; sleep_start: string | null }>();
  const have = new Set(dr.map((r) => r.date));
  const missDays: string[] = [];
  for (let d = HISTORY_FROM; d <= yest; d = addDays(d, 1)) if (!have.has(d) && !inRanges(d, fd)) missDays.push(d);
  const lastHole: string[] = []; // dias sem dado mesmo depois de pedir (relógio fora do pulso etc.), últimos 120
  for (let d = addDays(today, -120); d <= yest; d = addDays(d, 1)) if (!have.has(d) && inRanges(d, fd)) lastHole.push(d);
  // horários de sono (só vêm pela API): últimos 90 dias com sono e sem horário, ainda não pedidos
  const from90 = addDays(today, -89);
  const missTimes = dr.filter((r) => r.date >= from90 && r.date <= yest && r.sleep_h != null && !r.sleep_start && !inRanges(r.date, fd)).map((r) => r.date);

  // treinos: linhas do arquivo inicial (sem id da Garmin) no último ano, ainda não pedidas
  const from365 = addDays(today, -365);
  const { results: ar } = await env.DB.prepare("SELECT date FROM activities WHERE date >= ?1 AND id GLOB '*[^0-9]*'").bind(from365).all<{ date: string }>();
  const missActs = ar.map((r) => r.date).filter((d) => !inRanges(d, fa));
  const actsTotal = await env.DB.prepare('SELECT COUNT(*) n FROM activities WHERE date >= ?1').bind(from365).first<{ n: number }>();

  // zonas
  const { results: zs } = await env.DB.prepare(`SELECT CASE WHEN id GLOB '*[^0-9]*' THEN 'sem_id' ELSE COALESCE(z_src, 'pendente') END s, COUNT(*) n FROM activities WHERE sport IN ('bike','corrida','natacao','hyrox') AND date >= ?1 AND date < '2026-11-03' GROUP BY 1`).bind(from365).all<{ s: string; n: number }>();
  const { results: ze } = await env.DB.prepare("SELECT z_err e, COUNT(*) n FROM activities WHERE z_src = 'erro' GROUP BY 1 ORDER BY 2 DESC LIMIT 3").all<{ e: string; n: number }>();

  // REC: dias com HRV e sono que nunca passaram pelo cálculo
  const { results: rr } = await env.DB.prepare(`SELECT d.date FROM daily_metrics d LEFT JOIN rec_daily r ON r.date = d.date
    WHERE d.date >= '2025-09-15' AND d.date <= ?1 AND d.hrv IS NOT NULL AND d.sleep_h IS NOT NULL AND r.date IS NULL ORDER BY d.date`).bind(today).all<{ date: string }>();
  const recTo = windows(rr.map((r) => r.date), 60, today).map((w) => w[1]);

  const intr = await env.DB.prepare('SELECT MAX(date) d FROM intraday').first<{ d: string | null }>();
  const fage = await getSetting<{ fitnessAge: number | null; error?: string; month: string }>(env, 'fitness_age');
  const sb = await getSetting<{ month: string; hours: number; fallback: boolean }>(env, 'sleep_base');
  const counts = await env.DB.prepare(`SELECT COUNT(*) n, MIN(date) first, SUM(hrv IS NOT NULL) hrv FROM daily_metrics`).first<{ n: number; first: string; hrv: number }>();
  const recs = await env.DB.prepare('SELECT COUNT(*) n FROM rec_daily WHERE rec IS NOT NULL').first<{ n: number }>();

  return {
    hoje: today, hasKey: hasKey(env),
    sync: { at: last?.at ?? null, status: last?.status ?? null, detail: last?.detail ?? null, mins: mins(last?.at), okMins: mins(okSync?.at) },
    noite,
    dias: { n: counts?.n ?? 0, first: counts?.first ?? null, hrv: counts?.hrv ?? 0, falta: missDays.length, janelas: windows(missDays, 14, yest), buracos: lastHole.length },
    horarios: { falta: missTimes.length, janelas: windows(missTimes, 14, yest) },
    treinos: { total: actsTotal?.n ?? 0, falta: missActs.length, janelas: windows(missActs, 31, today) },
    zonas: { states: Object.fromEntries(zs.map((x) => [x.s, x.n])), erros: ze },
    rec: { n: recs?.n ?? 0, falta: rr.length, ate: recTo },
    extras: { linhaDoTempo: intr?.d ?? null, idadeFitness: fage ?? null, baseSono: sb ?? null },
  };
}

// --- I6: idade fitness (Garmin, cache mensal) e VO2máx das atividades ---
async function fitnessAgePayload(env: Env) {
  const today = brtToday();
  type FA = { month: string; fitnessAge: number | null; chronologicalAge: number | null; achievable: number | null; error?: string; at?: number };
  let fa = await getSetting<FA>(env, 'fitness_age');
  if (!fa || fa.month !== today.slice(0, 7) || (fa.error && Date.now() - (fa.at ?? 0) > 864e5)) {
    try { fa = { month: today.slice(0, 7), ...(await fetchFitnessAge(env, today)) }; }
    catch (e) { fa = { month: today.slice(0, 7), fitnessAge: null, chronologicalAge: null, achievable: null, error: garminMsg(e), at: Date.now() }; }
    await setSetting(env, 'fitness_age', fa);
  }
  const { results } = await env.DB.prepare(`SELECT date, sport, vo2 FROM activities WHERE vo2 IS NOT NULL AND date >= ?1 ORDER BY date`).bind(addDays(today, -365)).all<{ date: string; sport: Sport; vo2: number }>();
  const series = (sp: Sport) => results.filter((r) => r.sport === sp).map((r) => ({ date: r.date, vo2: r.vo2 }));
  return { fitnessAge: fa, vo2: { corrida: series('corrida'), bike: series('bike') } };
}

// --- linha do tempo do dia: sono, treinos e curvas de FC/estresse (Garmin, guardadas por dia) ---
async function timelinePayload(env: Env, date: string) {
  const today = brtToday();
  type C = { at: number; hr: [number, number][]; stress: [number, number][] | null };
  const row = await env.DB.prepare('SELECT at, body FROM intraday WHERE date = ?1').bind(date).first<{ at: number; body: string }>();
  let c: C | null = row ? { at: row.at, ...JSON.parse(row.body) } : null;
  const stale = !c || (date >= addDays(today, -1) && Date.now() - c.at > 30 * 60e3);
  let error: string | null = null;
  if (stale && hasKey(env)) {
    try {
      const f = await fetchIntraday(env, date);
      // reduz para médias de 5 min, em minutos do dia (horário de Brasília)
      const bin = (v: [number, number][]) => {
        const m = new Map<number, number[]>();
        for (const [ts, val] of v) { const min = Math.floor((ts / 60000 - 180) - Date.parse(date + 'T00:00:00Z') / 60000); if (min < 0 || min >= 1440) continue; const k = Math.floor(min / 5) * 5; (m.get(k) ?? m.set(k, []).get(k)!).push(val); }
        return [...m].sort((a, b) => a[0] - b[0]).map(([k, xs]) => [k, Math.round(xs.reduce((a, b) => a + b, 0) / xs.length)] as [number, number]);
      };
      c = { at: Date.now(), hr: bin(f.hr), stress: f.stress ? bin(f.stress) : null };
      if (c.hr.length || c.stress) await env.DB.prepare('INSERT OR REPLACE INTO intraday (date, at, body) VALUES (?1, ?2, ?3)').bind(date, c.at, JSON.stringify({ hr: c.hr, stress: c.stress })).run();
    } catch (e) { error = garminMsg(e); }
  }
  const mins = (stamp: string | null | undefined, day: string) => { if (!stamp) return null; const t = Date.parse(stamp.replace(' ', 'T') + 'Z'), d0 = Date.parse(day + 'T00:00:00Z'); return Math.round((t - d0) / 60000); };
  const { results: nights } = await env.DB.prepare('SELECT date, sleep_start, sleep_end FROM daily_metrics WHERE date IN (?1, ?2)').bind(date, addDays(date, 1)).all<{ date: string; sleep_start: string | null; sleep_end: string | null }>();
  const sleep = nights.map((n) => ({ start: Math.max(0, mins(n.sleep_start, date) ?? -1), end: Math.min(1440, mins(n.sleep_end, date) ?? -1) })).filter((b) => b.end > 0 && b.start < 1440 && b.end > b.start);
  const { results: acts } = await env.DB.prepare('SELECT id, time, sport, min FROM activities WHERE date = ?1 ORDER BY time').bind(date).all<{ id: string; time: string | null; sport: Sport; min: number | null }>();
  const workouts = acts.filter((a) => a.time).map((a) => ({ id: a.id, start: Number(a.time!.slice(0, 2)) * 60 + Number(a.time!.slice(3, 5)), dur: Math.round(a.min ?? 0), sport: a.sport, label: SPORT_LABEL[a.sport] }));
  return { date, hr: c?.hr ?? [], stress: c?.stress ?? null, sleep, workouts, error, isToday: date === today };
}

// --- tendência do HRV (A2) ---
async function hrvTrendOn(env: Env, date: string) {
  const from = addDays(date, -140);
  const { results } = await env.DB.prepare('SELECT date, hrv FROM daily_metrics WHERE date BETWEEN ?1 AND ?2').bind(from, date).all<{ date: string; hrv: number | null }>();
  const m = new Map(results.map((r) => [r.date, r.hrv]));
  const days = [];
  for (let d = from; d <= date; d = addDays(d, 1)) days.push({ date: d, hrv: m.get(d) ?? null });
  return hrvTrendNow(days);
}

// --- resumo da semana (G1) ---
async function reviewPayload(env: Env, req: Request, monday: string) {
  const sunday = addDays(monday, 6), today = brtToday();
  const end = sunday > today ? today : sunday;
  const { results: acts } = await env.DB.prepare(
    `SELECT sport, min, z1, z2, z3, z4, z5, ${STRAIN_SQL} strain FROM activities WHERE date BETWEEN ?1 AND ?2`,
  ).bind(monday, end).all<{ sport: Sport; min: number | null; z1: number | null; z2: number | null; z3: number | null; z4: number | null; z5: number | null; strain: number | null }>();
  const bySport = new Map<Sport, { hours: number; n: number }>();
  let strain = 0, hours = 0; const dist = { low: 0, mid: 0, high: 0 };
  for (const a of acts) {
    hours += (a.min ?? 0) / 60; strain += a.strain ?? 0;
    const b = bySport.get(a.sport) ?? { hours: 0, n: 0 }; b.hours += (a.min ?? 0) / 60; b.n++; bySport.set(a.sport, b);
    if (a.sport !== 'academia' && [a.z1, a.z2, a.z3, a.z4, a.z5].some((v) => v != null)) {
      const z = [a.z1, a.z2, a.z3, a.z4, a.z5].map((v) => v ?? 0), inZ = z.reduce((x, y) => x + y, 0);
      dist.low += Math.max(0, (a.min ?? 0) - inZ) + z[0] + z[1]; dist.mid += z[2]; dist.high += z[3] + z[4];
    }
  }
  const prev = await Promise.all([1, 2, 3].map(async (k) => (await dailyLoads(env, addDays(monday, -7 * k), addDays(monday, -7 * k + 6))).reduce((a, x) => a + x.load, 0)));
  const avg3 = prev.reduce((a, b) => a + b, 0) / 3;
  const { results: rd } = await env.DB.prepare('SELECT rec, v_hrv, b_hrv, v_rhr, b_rhr FROM rec_daily WHERE date BETWEEN ?1 AND ?2').bind(monday, end)
    .all<{ rec: number | null; v_hrv: number | null; b_hrv: number | null; v_rhr: number | null; b_rhr: number | null }>();
  const mean = (v: (number | null)[]) => { const x = v.filter((y): y is number => y != null); return x.length ? x.reduce((a, b) => a + b, 0) / x.length : null; };
  const { results: nights } = await env.DB.prepare('SELECT date, sleep_h, nap_h FROM daily_metrics WHERE date BETWEEN ?1 AND ?2 ORDER BY date').bind(addDays(monday, -95), end).all<SleepNight>();
  const need = (await sleepBase(env, end)).hours;
  const wk = nights.filter((n) => n.date >= monday);
  const dt = dist.low + dist.mid + dist.high;
  let text: string | null = null;
  try { const r = await env.ASSETS.fetch(new Request(new URL(`/plan/resumo-${monday}.md`, req.url))); if (r.ok) { const t = (await r.text()).trim(); if (t && !t.startsWith('<')) text = t.slice(0, 4000); } } catch {}
  const r1 = (x: number | null) => (x == null ? null : Math.round(x * 10) / 10);
  return {
    monday, sunday, complete: sunday < today || (sunday === today),
    hours: r1(hours), sessions: acts.length, strain: Math.round(strain),
    band: avg3 > 0 ? { lo: Math.round(avg3 * 0.8), hi: Math.round(avg3 * 1.3), status: strain < avg3 * 0.8 ? 'abaixo' : strain <= avg3 * 1.3 ? 'dentro' : 'acima' } : null,
    sports: [...bySport.entries()].map(([k, v]) => ({ sport: k, label: SPORT_LABEL[k], hours: r1(v.hours), n: v.n })).sort((a, b) => (b.hours ?? 0) - (a.hours ?? 0)),
    dist: dt ? { low: Math.round((dist.low / dt) * 100), mid: Math.round((dist.mid / dt) * 100), high: Math.round((dist.high / dt) * 100) } : null,
    rec: r1(mean(rd.map((x) => x.rec))),
    hrv: r1(mean(rd.map((x) => x.v_hrv))), hrvBase: r1(mean(rd.map((x) => x.b_hrv))),
    rhr: r1(mean(rd.map((x) => x.v_rhr))), rhrBase: r1(mean(rd.map((x) => x.b_rhr))),
    sleep: r1(mean(wk.map((n) => n.sleep_h))), sleepNeed: r1(need),
    text,
    highlights: await (async () => {
      // destaques da semana (04/11): melhor dia, pior noite, treino mais pesado, Prontidão × semana anterior
      const ser = await readinessSeries(env, addDays(monday, -7), end);
      const cur = ser.filter((x) => x.date >= monday && x.ready != null), prv = ser.filter((x) => x.date < monday && x.ready != null);
      const best = cur.length ? cur.reduce((a, b) => ((b.ready as number) > (a.ready as number) ? b : a)) : null;
      const nn = wk.filter((n) => n.sleep_h != null);
      const worst = nn.length ? nn.reduce((a, b) => ((b.sleep_h as number) < (a.sleep_h as number) ? b : a)) : null;
      const top = await env.DB.prepare(`SELECT id, date, sport, name, min, ${STRAIN_SQL} strain FROM activities WHERE date BETWEEN ?1 AND ?2 ORDER BY strain DESC LIMIT 1`).bind(monday, end).first<{ id: string; date: string; sport: Sport; name: string | null; min: number; strain: number | null }>();
      return {
        best: best && { date: best.date, ready: best.ready },
        worstNight: worst && { date: worst.date, h: r1(worst.sleep_h) },
        heaviest: top && top.strain != null ? { id: top.id, date: top.date, sport: top.sport, label: top.name || SPORT_LABEL[top.sport], min: Math.round(top.min ?? 0), strain: Math.round(top.strain) } : null,
        ready: cur.length ? Math.round(mean(cur.map((x) => x.ready))!) : null, readyPrev: prv.length ? Math.round(mean(prv.map((x) => x.ready))!) : null,
        days: ser.filter((x) => x.date >= monday).map((x) => ({ date: x.date, ready: x.ready, strain: x.strain })),
      };
    })(),
  };
}

// --- O que mexe no meu REC (E2 + C2) ---
async function habitsPayload(env: Env) {
  await ensureSchema(env);
  const today = brtToday();
  const from = addDays(today, -180);
  const { results: recs } = await env.DB.prepare('SELECT date, rec FROM rec_daily WHERE date BETWEEN ?1 AND ?2').bind(from, today).all<{ date: string; rec: number | null }>();
  const recBy = new Map(recs.map((r) => [r.date, r.rec]));
  const { results: tags } = await env.DB.prepare('SELECT date, tag FROM habit_tags WHERE date >= ?1').bind(from).all<{ date: string; tag: string }>();
  const first = tags.reduce<string | null>((a, t) => (a == null || t.date < a ? t.date : a), null);
  const rows = [];
  if (first) {
    // dias desde o primeiro uso do diário até ontem; o REC lido é o da manhã seguinte
    const days: string[] = [];
    for (let d = first; d < today; d = addDays(d, 1)) days.push(d);
    const has = new Set(tags.map((t) => `${t.date}|${t.tag}`));
    for (const h of HABITS) rows.push(impact(h.key, h.label, days.map((d) => ({ flag: has.has(`${d}|${h.key}`), rec: recBy.get(addDays(d, 1)) ?? null }))));
  }
  // horário de sono irregular (automático, sem marcar): a noite que termina no dia D afeta o REC de D
  const { results: nights } = await env.DB.prepare('SELECT date, sleep_h, sleep_start, sleep_end FROM daily_metrics WHERE date BETWEEN ?1 AND ?2 ORDER BY date')
    .bind(addDays(from, -20), today).all<SleepNight>();
  const irr = irregularNights(nights).filter((x) => x.date >= from);
  const auto = impact('irregular', 'Horário de sono irregular (± 1 h do seu normal)', irr.map((x) => ({ flag: x.irregular, rec: recBy.get(x.date) ?? null })), true);
  const marked = rows.filter((r) => r.with.n > 0);
  return {
    since: first, minDays: 5,
    rows: [...marked.sort((a, b) => (b.ready ? 1 : 0) - (a.ready ? 1 : 0) || Math.abs(b.diff ?? 0) - Math.abs(a.diff ?? 0)), auto],
    unmarked: rows.filter((r) => r.with.n === 0).map((r) => r.label),
  };
}

// --- roteamento ---
function authorized(req: Request, env: Env) {
  // tolera espaço ou quebra de linha colados junto com o código no painel
  const expected = (env.APP_TOKEN ?? '').trim();
  if (!expected) return true; // sem APP_TOKEN cadastrado: app aberto (decisão do Luca, 03/11)
  const got = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  return got === expected;
}
const isDate = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

async function syncIssueOf(env: Env, date: string, lastSync: Record<string, unknown> | null, minsSinceSync: number | null) {
    if (date !== brtToday()) return null;
    const hhmm = (at: unknown) => { const d = new Date(Date.parse(String(at).replace(' ', 'T') + 'Z') - 3 * 3600e3); return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`; };
    const hour = new Date(Date.now() - 3 * 3600e3).getUTCHours();
    if (!lastSync) return { kind: 'nunca', text: 'O servidor ainda não buscou dados na Garmin.' };
    const when = hhmm(lastSync.at);
    if (lastSync.status === 'erro') return { kind: 'erro', text: `A última busca na Garmin falhou (${when}): ${String(lastSync.detail ?? '').slice(0, 160)}` };
    if (String(lastSync.detail ?? '').includes('sem_chave')) return { kind: 'erro', text: 'A chave da Garmin não está cadastrada no servidor.' };
    if (!(await hasTonight(env, date)) && hour >= 11) return { kind: 'noite', text: `A noite de hoje ainda não veio da Garmin (última busca às ${when}). O relógio precisa sincronizar com o Garmin Connect.` };
    if (minsSinceSync != null && minsSinceSync > 90 && hour >= 5) return { kind: 'parado', text: `Última busca na Garmin há ${minsSinceSync >= 120 ? Math.floor(minsSinceSync / 60) + ' h' : minsSinceSync + ' min'} (às ${when}). A busca automática pode ter parado.` };
    return null;
  }

// --- cálculos prontos (03/11 → 04/11): respostas GET guardadas no D1 por "versão dos dados" ---
// Qualquer escrita (sincronização com dado novo, nota, diário, recálculo…) sobe a versão e invalida tudo.
// Campos que dependem do relógio (última busca, aviso de sincronização) são refeitos a cada abertura.
const CACHEABLE = new Set(['/api/today', '/api/longtrend', '/api/strain-weeks', '/api/week', '/api/trends', '/api/load-insights', '/api/stress31',
  '/api/habits', '/api/year', '/api/predictions', '/api/race', '/api/review', '/api/activity', '/api/hrvtrend', '/api/calibration', '/api/day', '/api/widget', '/api/race-report', '/api/zones-dist', '/api/ready-series', '/api/month', '/api/sleep']);
const CACHE_TTL = 30 * 60e3; // também expira em 30 min (plano novo publicado, virada de hora)
async function dataVer(env: Env) {
  const r = await env.DB.prepare("SELECT value FROM settings WHERE key = 'data_ver'").first<{ value: string }>();
  return Number(r?.value ?? 0);
}
async function bumpData(env: Env) {
  await env.DB.prepare(`INSERT INTO settings (key, value) VALUES ('data_ver', '1')
    ON CONFLICT(key) DO UPDATE SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT), updated_at = datetime('now')`).run();
}
async function liveToday(env: Env, date: string) {
  const lastSync = await env.DB.prepare('SELECT at, status, detail FROM sync_log ORDER BY id DESC LIMIT 1').first();
  const minsSinceSync = lastSync?.at ? Math.round((Date.now() - Date.parse(String(lastSync.at).replace(' ', 'T') + 'Z')) / 60000) : null;
  return { lastSync, minsSinceSync, syncIssue: await syncIssueOf(env, date, lastSync, minsSinceSync) };
}
async function cachedGet(env: Env, url: URL, compute: () => Promise<Response>): Promise<Response> {
  const key = `${url.pathname}?${url.searchParams.toString()}|${brtToday()}`;
  const ver = await dataVer(env);
  const hit = await env.DB.prepare('SELECT body, ver, at FROM api_cache WHERE key = ?1').bind(key).first<{ body: string; ver: number; at: number }>();
  let body: string | null = hit && hit.ver === ver && Date.now() - hit.at < CACHE_TTL ? hit.body : null;
  const fromCache = !!body;
  if (!body) {
    const res = await compute();
    if (res.status !== 200) return res;
    body = await res.text();
    await env.DB.prepare('INSERT OR REPLACE INTO api_cache (key, ver, at, body) VALUES (?1, ?2, ?3, ?4)').bind(key, ver, Date.now(), body).run();
  }
  if (url.pathname === '/api/today') {
    const d = JSON.parse(body);
    if (d.isToday) Object.assign(d, await liveToday(env, d.date));
    body = JSON.stringify(d);
  }
  return new Response(body, { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-rec-cache': fromCache ? 'hit' : 'miss' } });
}
/** Depois da rotina: deixa a aba Hoje e as Tendências principais calculadas. */
async function warm(env: Env) {
  const base = 'https://rec.internal';
  for (const path of ['/api/today', '/api/load-insights', '/api/longtrend?days=56', '/api/strain-weeks?weeks=16', '/api/race']) {
    const u = new URL(base + path);
    try { await cachedGet(env, u, () => handle(new Request(u), env)); } catch { /* aquecimento é opcional */ }
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    if (!authorized(req, env)) return json({ error: 'nao_autorizado' }, 401);
    await ensureSchema(env);
    if (req.method === 'GET' && CACHEABLE.has(url.pathname)) return cachedGet(env, url, () => handle(req, env));
    const res = await handle(req, env);
    if (req.method === 'POST' && res.status < 400) { await bumpData(env); if (url.pathname === '/api/refresh') await warm(env); }
    return res;
  },
  async scheduled(_c: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil((async () => { await ensureSchema(env); const r = await morningRoutine(env, 'cron'); if (r.changed) { await bumpData(env); await warm(env); } await monthlyCalib(env).catch(() => {}); await coachCron(env).catch(() => {}); })());
  },
} satisfies ExportedHandler<Env>;

async function handle(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === '/api/today' && req.method === 'GET') {
      const d = url.searchParams.get('date');
      return json(await todayPayload(env, isDate(d) ? d : brtToday(), req));
    }
    if (url.pathname === '/api/feel' && req.method === 'POST') {
      const body = await req.json<{ date?: string; value?: number }>().catch(() => ({}) as { date?: string; value?: number });
      const date = isDate(body.date ?? null) ? body.date! : brtToday();
      const v = Number(body.value);
      if (!Number.isInteger(v) || v < 1 || v > 10) return json({ error: 'valor_invalido' }, 400);
      await env.DB.prepare(`INSERT INTO feel_notes (date, value) VALUES (?1, ?2)
        ON CONFLICT(date) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`).bind(date, v).run();
      return json({ ok: true });
    }
    if (url.pathname === '/api/tags' && req.method === 'POST') {
      const body = await req.json<{ date?: string; tag?: string; on?: boolean }>().catch(() => ({}) as { date?: string; tag?: string; on?: boolean });
      const date = isDate(body.date ?? null) ? body.date! : brtToday();
      if (!body.tag || !HABIT_KEYS.has(body.tag)) return json({ error: 'tag_invalida' }, 400);
      if (body.on) await env.DB.prepare('INSERT OR IGNORE INTO habit_tags (date, tag) VALUES (?1, ?2)').bind(date, body.tag).run();
      else await env.DB.prepare('DELETE FROM habit_tags WHERE date = ?1 AND tag = ?2').bind(date, body.tag).run();
      const { results } = await env.DB.prepare('SELECT tag FROM habit_tags WHERE date = ?1').bind(date).all<{ tag: string }>();
      return json({ ok: true, on: results.map((r) => r.tag) });
    }
    if (url.pathname === '/api/habits' && req.method === 'GET') return json(await habitsPayload(env));
    if (url.pathname === '/api/weather' && req.method === 'GET') return json(await weatherPayload(env));
    if (url.pathname === '/api/activity' && req.method === 'GET') {
      const a = await activityPayload(env, url.searchParams.get('id') ?? '', req);
      return a ? json(a) : json({ error: 'nao_encontrado' }, 404);
    }
    if (url.pathname === '/api/timeline' && req.method === 'GET') {
      const d = url.searchParams.get('date');
      return json(await timelinePayload(env, isDate(d) ? d : brtToday()));
    }
    // o ano em quadradinhos: 53 semanas (segunda a domingo), um valor por dia
    if (url.pathname === '/api/year' && req.method === 'GET') {
      const today = brtToday(), from = addDays(mondayOf(today), -52 * 7);
      const loads = await dailyLoads(env, from, today);
      const { results: rd } = await env.DB.prepare('SELECT date, rec FROM rec_daily WHERE date BETWEEN ?1 AND ?2').bind(from, today).all<{ date: string; rec: number | null }>();
      const { results: dm } = await env.DB.prepare('SELECT date, sleep_h FROM daily_metrics WHERE date BETWEEN ?1 AND ?2').bind(from, today).all<{ date: string; sleep_h: number | null }>();
      const rec = new Map(rd.map((r) => [r.date, r.rec])), sl = new Map(dm.map((r) => [r.date, r.sleep_h]));
      const need = (await sleepBase(env, today)).hours;
      return json({ from, today, sleepNeed: need, days: loads.map((l) => ({ d: l.date, rec: rec.get(l.date) == null ? null : Math.round(rec.get(l.date) as number), strain: Math.round(l.load), sleep: sl.get(l.date) == null ? null : Math.round((sl.get(l.date) as number) * 10) / 10 })) });
    }
    if (url.pathname === '/api/day' && req.method === 'GET') {
      // um dia qualquer (ano em quadradinhos): as 3 métricas, os treinos e o que pode explicar o REC
      const date = url.searchParams.get('date');
      if (!isDate(date)) return json({ error: 'data_invalida' }, 400);
      const prev = addDays(date, -1);
      const r = await env.DB.prepare('SELECT * FROM rec_daily WHERE date = ?1').bind(date).first<Record<string, number | null>>();
      const m = await env.DB.prepare('SELECT sleep_h, sleep_start, sleep_end, nap_h FROM daily_metrics WHERE date = ?1').bind(date).first<{ sleep_h: number | null; sleep_start: string | null; sleep_end: string | null; nap_h: number | null }>();
      const { results: acts } = await env.DB.prepare(`SELECT id, sport, type, name, min, km, ${STRAIN_SQL} strain FROM activities WHERE date = ?1 ORDER BY time`).bind(date).all<{ id: string; sport: Sport; type: string; name: string | null; min: number; km: number | null; strain: number | null }>();
      const py = await env.DB.prepare(`SELECT SUM(COALESCE(${STRAIN_SQL}, 0)) s FROM activities WHERE date = ?1`).bind(prev).first<{ s: number | null }>();
      const { results: tags } = await env.DB.prepare('SELECT date, tag FROM habit_tags WHERE date IN (?1, ?2)').bind(date, prev).all<{ date: string; tag: string }>();
      const feel = await env.DB.prepare('SELECT value FROM feel_notes WHERE date = ?1').bind(date).first<{ value: number }>();
      const sb = await sleepBase(env, brtToday()); // base do mês atual (o cache guarda um mês só)
      const lbl = new Map<string, string>(HABITS.map((h) => [h.key, h.label]));
      const SIG: [string, string][] = [['hrv', 'HRV'], ['rhr', 'FC de repouso'], ['sleep', 'Sono'], ['resp', 'Respiração'], ['stress', 'Estresse do dia anterior']];
      const signals = r ? SIG.map(([k, l]) => ({ k, label: l, z: r[`z_${k}`] == null ? null : Math.round((r[`z_${k}`] as number) * 100) / 100, v: r[`v_${k}`], b: r[`b_${k}`] })) : [];
      return json({
        date, rec: r?.rec == null ? null : Math.round(r.rec), signals,
        strain: Math.round(acts.reduce((a, x) => a + (x.strain ?? 0), 0)), strainPrev: Math.round(py?.s ?? 0),
        sleep: m ? { h: m.sleep_h, start: m.sleep_start?.slice(11) ?? null, end: m.sleep_end?.slice(11) ?? null, nap: m.nap_h } : null, sleepBase: sb.hours,
        acts: acts.map((a) => ({ id: a.id, sport: a.sport, label: a.name || SPORT_LABEL[a.sport], min: Math.round(a.min ?? 0), km: a.km, strain: a.strain == null ? null : Math.round(a.strain) })),
        tags: tags.filter((t) => t.date === date).map((t) => lbl.get(t.tag) ?? t.tag),
        tagsPrev: tags.filter((t) => t.date === prev).map((t) => lbl.get(t.tag) ?? t.tag),
        feel: feel?.value ?? null,
      });
    }
    if (url.pathname === '/api/widget' && req.method === 'GET') {
      // widget do iPhone (Scriptable): só o essencial do Hoje
      const d = await todayPayload(env, brtToday(), req);
      const r = d.ready?.score == null ? null : Math.round(d.ready.score);
      return json({
        date: d.date, ready: r, readyPrev: d.readyPrev == null ? null : Math.round(d.readyPrev), rec: d.rec,
        form: d.load?.formPct ?? null, formLabel: d.load?.zone?.label ?? null,
        strain: d.load?.strain ?? 0, target: d.day?.target?.target ?? null,
        planned: (d.planned ?? []).map((p) => ({ sport: p.sport, label: p.titulo || p.label, min: p.minutos })),
        bedtime: d.sleep?.bedtime?.bedtime ?? null, race: d.race?.days ?? null,
      });
    }
    if (url.pathname === '/api/backtest') {
      // GET: histórico mensal; POST: refaz o mês agora
      const log = await monthlyCalib(env, req.method === 'POST');
      return json({ log });
    }
    if (url.pathname === '/api/race-report' && req.method === 'GET') {
      const date = url.searchParams.get('date') ?? RACE.date;
      if (!isDate(date)) return json({ error: 'data_invalida' }, 400);
      return json(await raceReport(env, req, date));
    }
    if (url.pathname === '/api/zones-dist' && req.method === 'GET') {
      const days = [7, 30, 90, 180, 365].includes(Number(url.searchParams.get('days'))) ? Number(url.searchParams.get('days')) : 30;
      return json(await zonesDist(env, url.searchParams.get('sport') ?? 'todas', days));
    }
    if (url.pathname === '/api/ready-series' && req.method === 'GET') {
      const days = Math.min(400, Math.max(7, Number(url.searchParams.get('days')) || 30)), to = brtToday();
      return json({ days: await readinessSeries(env, addDays(to, -(days - 1)), to) });
    }
    if (url.pathname === '/api/month' && req.method === 'GET') {
      const ym = url.searchParams.get('ym') ?? brtToday().slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(ym)) return json({ error: 'mes_invalido' }, 400);
      return json(await monthPayload(env, ym));
    }
    if (url.pathname === '/api/sleep' && req.method === 'GET') {
      const date = url.searchParams.get('date') ?? brtToday();
      if (!isDate(date)) return json({ error: 'data_invalida' }, 400);
      return json(await sleepPayload(env, date));
    }
    if (url.pathname === '/api/coach-report' && req.method === 'GET') {
      const sent = (await getSetting<Record<string, string>>(env, 'coach_sent')) ?? {};
      return json({ md: await coachReport(env, req), hasToken: !!env.GITHUB_TOKEN, sent });
    }
    if (url.pathname === '/api/coach-report' && req.method === 'POST') {
      try { return json(await publishCoach(env, req, 'manual')); } catch (e) { return json({ ok: false, error: e instanceof Error ? e.message : 'erro' }, 502); }
    }
    if (url.pathname === '/api/calibration' && req.method === 'GET') {
      const { results } = await env.DB.prepare(`SELECT f.date, f.value feel, r.rec, r.z_hrv, r.z_sleep, r.z_rhr, r.z_resp, r.z_stress
        FROM feel_notes f LEFT JOIN rec_daily r ON r.date = f.date ORDER BY f.date`).all<Record<string, any>>();
      const cal = calibration(results.map((r) => ({ date: r.date, feel: r.feel, rec: r.rec, z: { hrv: r.z_hrv, sleep: r.z_sleep, rhr: r.z_rhr, resp: r.z_resp, stress: r.z_stress } })));
      // Prontidão × "como me sinto" (calibração contínua, 04/11): refaz a Prontidão de cada dia com nota
      const withRec = results.filter((r) => r.rec != null);
      let readyRho: number | null = null, readyN = 0;
      if (withRec.length) {
        const first = withRec[0].date as string, last = withRec[withRec.length - 1].date as string;
        const loads = await dailyLoads(env, addDays(first, -400), last);
        const idx = new Map(loads.map((x, i) => [x.date, i]));
        const { results: nights } = await env.DB.prepare('SELECT date, sleep_h, nap_h, sleep_start, sleep_end FROM daily_metrics WHERE date BETWEEN ?1 AND ?2 ORDER BY date').bind(addDays(first, -140), last).all<SleepNight>();
        const need = (await sleepBase(env, brtToday())).hours;
        const pairs: [number, number][] = [];
        for (const r of withRec) {
          const i = idx.get(r.date as string); if (i == null) continue;
          const dh: number[] = []; for (let x = addDays(r.date, -120); x < r.date; x = addDays(x, 1)) { const v = sleepDebt(nights, need, x); if (v != null) dh.push(v); }
          const rd = readiness(r.rec, loads.slice(0, i).map((x) => x.load), sleepDebt(nights, need, r.date), dh);
          if (rd.score != null) pairs.push([rd.score, r.feel]);
        }
        readyN = pairs.length; readyRho = spearman(pairs.map((p) => p[0]), pairs.map((p) => p[1]));
      }
      return json({ ...cal, ready: { n: readyN, rho: readyRho == null ? null : Math.round(readyRho * 100) / 100 }, enough: cal.ready });
    }
    if (url.pathname === '/api/load-insights' && req.method === 'GET') return json(await loadInsightsPayload(env));
    if (url.pathname === '/api/stress31' && req.method === 'GET') return json(await stress31Payload(env));
    if (url.pathname === '/api/fitness-age' && req.method === 'GET') return json(await fitnessAgePayload(env));
    if (url.pathname === '/api/hrvtrend' && req.method === 'GET') return json(await hrvTrendOn(env, brtToday()));
    if (url.pathname === '/api/review' && req.method === 'GET') {
      const m = url.searchParams.get('monday');
      return json(await reviewPayload(env, req, isDate(m) ? mondayOf(m) : mondayOf(brtToday())));
    }
    if (url.pathname === '/api/refresh' && req.method === 'POST') {
      const auto = url.searchParams.get('auto') === '1';
      return json(await morningRoutine(env, auto ? 'open' : 'manual'));
    }

    if (url.pathname === '/api/predictions' && req.method === 'GET') {
      const m = Number(url.searchParams.get('months'));
      return json(await predictionsPayload(env, [1, 3, 6].includes(m) ? m : 3));
    }
    if (url.pathname === '/api/predictions/calibrate' && req.method === 'POST') {
      // corpo: { d5, d10, d21, d42 } em minutos (o que o Strava mostra hoje); {} apaga a calibração
      const body = await req.json<Partial<Record<DistKey, number>>>().catch(() => ({}) as Partial<Record<DistKey, number>>);
      const today = brtToday();
      const { runs } = await runVdots(env, addDays(today, -170), today);
      const v = vdotOn(today, runs);
      if (!v) return json({ error: 'poucas_corridas' }, 400);
      const raw = predictAll(v.vdot);
      const factors: Partial<Record<DistKey, number>> = {};
      for (const d of DISTANCES) {
        const t = Number(body[d.key]);
        if (Number.isFinite(t) && t > 0) factors[d.key] = Math.round((t / raw[d.key]) * 10000) / 10000;
      }
      await setSetting(env, 'pred_factors', factors);
      return json({ ok: true, factors });
    }
    if (url.pathname === '/api/race' && req.method === 'GET') return json(await racePayload(env, req));
    if (url.pathname === '/api/race/items' && req.method === 'POST') {
      // { action: 'add', texto } | { action: 'toggle', id, done } | { action: 'remove', id }
      const b = await req.json<{ action?: string; id?: string; texto?: string; done?: boolean }>().catch(() => ({}) as Record<string, never>);
      const items = (await getSetting<RaceItem[]>(env, 'race_items')) ?? [];
      if (b.action === 'add') {
        const texto = String(b.texto ?? '').trim().slice(0, 200);
        if (!texto) return json({ error: 'texto_vazio' }, 400);
        items.push({ id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, texto, done: false });
      } else if (b.action === 'toggle') {
        const it = items.find((x) => x.id === b.id); if (it) it.done = !!b.done;
      } else if (b.action === 'remove') {
        const i = items.findIndex((x) => x.id === b.id); if (i >= 0) items.splice(i, 1);
      } else return json({ error: 'acao_invalida' }, 400);
      await setSetting(env, 'race_items', items);
      return json({ items });
    }
    if (url.pathname === '/api/longtrend' && req.method === 'GET') {
      const end = url.searchParams.get('end');
      const days = Math.min(Math.max(Number(url.searchParams.get('days')) || 56, 28), 400);
      const e = isDate(end) && end <= brtToday() ? end : brtToday();
      const from = addDays(e, -(days - 1));
      const loads = await dailyLoads(env, addDays(from, -400), e);
      const { results: dm } = await env.DB.prepare('SELECT date, hrv, rhr, sleep_h, nap_h FROM daily_metrics WHERE date BETWEEN ?1 AND ?2 ORDER BY date')
        .bind(addDays(from, -130), e).all<{ date: string; hrv: number | null; rhr: number | null; sleep_h: number | null; nap_h: number | null }>();
      const { results: rc } = await env.DB.prepare('SELECT date, rec, z_hrv, z_rhr, z_sleep, z_resp, z_stress FROM rec_daily WHERE date BETWEEN ?1 AND ?2')
        .bind(addDays(from, -14), e).all<{ date: string; rec: number | null; z_hrv: number | null; z_rhr: number | null; z_sleep: number | null; z_resp: number | null; z_stress: number | null }>();
      return json(longTrend({ from, to: e, loads, metrics: dm, recs: rc, sleepNeed: (await sleepBase(env, e)).hours }));
    }
    if (url.pathname === '/api/strain-weeks' && req.method === 'GET') {
      const n = Math.min(Math.max(Number(url.searchParams.get('weeks')) || 16, 4), 52);
      return json(await strainWeeksPayload(env, n));
    }
    if (url.pathname === '/api/week' && req.method === 'GET') {
      const offset = Math.min(Math.max(Number(url.searchParams.get('offset')) || 0, 0), 156);
      return json(await weekPayload(env, req, offset));
    }
    if (url.pathname === '/api/trends' && req.method === 'GET') {
      const u = url.searchParams.get('unit');
      const unit = (['semana', 'mes', '3m', '6m', 'ano'] as const).find((x) => x === u) ?? 'semana';
      const offset = Math.min(Math.max(Number(url.searchParams.get('offset')) || 0, 0), 156);
      return json(await trendsPayload(env, unit, offset));
    }

    // --- Garmin: estado, diagnóstico e histórico ---
    if (url.pathname === '/api/garmin/status' && req.method === 'GET') {
      const agg = await env.DB.prepare(`SELECT COUNT(*) n, MIN(date) first, MAX(date) last,
          SUM(source = 'garmin_api') api, SUM(hrv IS NOT NULL) hrv FROM daily_metrics`).first();
      const recs = await env.DB.prepare('SELECT COUNT(*) n FROM rec_daily WHERE rec IS NOT NULL').first<{ n: number }>();
      const acts = await env.DB.prepare('SELECT COUNT(*) n, MIN(date) first, SUM(z1 IS NOT NULL OR z2 IS NOT NULL OR z3 IS NOT NULL) zonas FROM activities').first();
      const log = await env.DB.prepare('SELECT at, trigger, status, detail FROM sync_log ORDER BY id DESC LIMIT 5').all();
      return json({ hasKey: hasKey(env), dias: agg, recs: recs?.n ?? 0, atividades: acts, log: log.results, hoje: brtToday() });
    }
    if (url.pathname === '/api/diag' && req.method === 'GET') return json(await diagPayload(env));
    if (url.pathname === '/api/zones/retry' && req.method === 'POST') {
      await env.DB.prepare("UPDATE activities SET z_src = NULL, z_err = NULL WHERE z_src = 'erro'").run();
      return json({ ok: true });
    }
    if (url.pathname === '/api/garmin/check' && req.method === 'GET') {
      if (!hasKey(env)) return json({ error: 'sem_chave' }, 400);
      const days = Math.min(Math.max(Number(url.searchParams.get('days')) || 14, 3), 28);
      try { return json(await garminCheck(env, days)); } catch (e) { return json({ error: garminMsg(e) }, 502); }
    }
    // --- recalcular zonas do histórico com as zonas atuais (FC segundo a segundo do arquivo FIT, lido no navegador) ---
    if (url.pathname === '/api/zones/current' && req.method === 'GET') {
      if (!hasKey(env)) return json({ error: 'sem_chave' }, 400);
      try {
        const raw = await fetchHrZones(env);
        const z = parseHrZones(raw);
        if (!Object.keys(z).length) return json({ error: 'formato_desconhecido', keys: Array.isArray(raw) ? Object.keys(raw[0] ?? {}) : Object.keys(raw ?? {}) }, 422);
        return json({ zones: z });
      } catch (e) { return json({ error: garminMsg(e) }, 502); }
    }
    if (url.pathname === '/api/zones/pending' && req.method === 'GET') {
      await ensureSchema(env);
      const n = Math.min(20, Number(url.searchParams.get('n')) || 5);
      const where = `sport IN ('bike','corrida','natacao','hyrox') AND date >= ?1 AND date < '2026-11-03' AND id NOT GLOB '*[^0-9]*' AND z_src IS NULL`;
      const from = addDays(brtToday(), -365);
      const { results } = await env.DB.prepare(`SELECT id, date, type, sport, min FROM activities WHERE ${where} ORDER BY date DESC LIMIT ?2`).bind(from, n).all();
      const left = await env.DB.prepare(`SELECT COUNT(*) n FROM activities WHERE ${where}`).bind(from).first<{ n: number }>();
      const done = await env.DB.prepare(`SELECT COUNT(*) n FROM activities WHERE z_src = 'fit'`).first<{ n: number }>();
      const { results: st } = await env.DB.prepare(`SELECT CASE WHEN id GLOB '*[^0-9]*' THEN 'sem_id' ELSE COALESCE(z_src, 'pendente') END s, COUNT(*) n FROM activities WHERE sport IN ('bike','corrida','natacao','hyrox') AND date >= ?1 AND date < '2026-11-03' GROUP BY 1`).bind(from).all<{ s: string; n: number }>();
      return json({ pending: results, left: left?.n ?? 0, done: done?.n ?? 0, states: Object.fromEntries(st.map((x) => [x.s, x.n])) });
    }
    if (url.pathname === '/api/fit/file' && req.method === 'GET') {
      const id = url.searchParams.get('id') ?? '';
      try {
        const bytes = await fetchActivityFile(env, id);
        return new Response(bytes, { headers: { 'content-type': 'application/octet-stream', 'cache-control': 'no-store' } });
      } catch (e) {
        const st = e instanceof GarminError ? e.status : 500;
        if (st === 404) await env.DB.prepare("UPDATE activities SET z_src = 'sem_arquivo' WHERE id = ?1").bind(id).run();
        return json({ error: garminMsg(e), status: st }, st === 429 ? 429 : 502);
      }
    }
    if (url.pathname === '/api/zones/result' && req.method === 'POST') {
      const b = await req.json<any>().catch(() => ({}));
      const id = String(b.id ?? '');
      if (!/^\d+$/.test(id)) return json({ error: 'id_invalido' }, 400);
      const z = Array.isArray(b.z) && b.z.length === 5 && b.z.every((v: unknown) => typeof v === 'number' && v >= 0 && v < 2000) ? b.z as number[] : null;
      if (!z) {
        const err = typeof b.error === 'string' ? b.error.slice(0, 200) : null;
        await env.DB.prepare('UPDATE activities SET z_src = ?2, z_err = ?3 WHERE id = ?1').bind(id, err ? 'erro' : 'sem_fc', err).run();
        return json({ ok: true, skipped: true });
      }
      // guarda as zonas originais da Garmin (para desfazer) e grava as recalculadas
      await env.DB.prepare(`UPDATE activities SET z_orig = COALESCE(z_orig, json_array(z1, z2, z3, z4, z5)), z1 = ?2, z2 = ?3, z3 = ?4, z4 = ?5, z5 = ?6, z_src = 'fit' WHERE id = ?1`)
        .bind(id, ...z.map((v) => Math.round(v * 100) / 100)).run();
      return json({ ok: true });
    }
    if (url.pathname === '/api/zones/undo' && req.method === 'POST') {
      await env.DB.prepare(`UPDATE activities SET z1 = json_extract(z_orig, '$[0]'), z2 = json_extract(z_orig, '$[1]'), z3 = json_extract(z_orig, '$[2]'), z4 = json_extract(z_orig, '$[3]'), z5 = json_extract(z_orig, '$[4]'), z_src = NULL, z_orig = NULL WHERE z_orig IS NOT NULL`).run();
      await env.DB.prepare(`UPDATE activities SET z_src = NULL, z_err = NULL WHERE z_src IN ('sem_arquivo', 'sem_fc', 'erro')`).run();
      return json({ ok: true });
    }
    if (url.pathname === '/api/garmin/zones' && req.method === 'GET') {
      if (!hasKey(env)) return json({ error: 'sem_chave' }, 400);
      try { return json(await fetchHrZones(env)); } catch (e) { return json({ error: garminMsg(e) }, 502); }
    }
    if (url.pathname === '/api/garmin/backfill' && req.method === 'POST') {
      if (!hasKey(env)) return json({ error: 'sem_chave' }, 400);
      const from = url.searchParams.get('from'), to = url.searchParams.get('to');
      if (!isDate(from) || !isDate(to) || to < from || daysBetween(from, to) > 13) return json({ error: 'intervalo_invalido (máx. 14 dias)' }, 400);
      try {
        const { days } = await fetchDays(env, from, to);
        const nd = await writeDays(env, days);
        const na = await writeActivities(env, await fetchActivities(env, from, to));
        await markFetched(env, 'days', from, to); await markFetched(env, 'acts', from, to);
        return json({ from, to, dias: nd, atividades: na });
      } catch (e) { return json({ error: garminMsg(e) }, 502); }
    }
    // só atividades (sem métricas diárias): completa o histórico de treinos pela API, até 62 dias por chamada
    if (url.pathname === '/api/garmin/activities' && req.method === 'POST') {
      if (!hasKey(env)) return json({ error: 'sem_chave' }, 400);
      const from = url.searchParams.get('from'), to = url.searchParams.get('to');
      if (!isDate(from) || !isDate(to) || to < from || daysBetween(from, to) > 61) return json({ error: 'intervalo_invalido (máx. 62 dias)' }, 400);
      try {
        const na = await writeActivities(env, await fetchActivities(env, from, to));
        await markFetched(env, 'acts', from, to);
        const left = await env.DB.prepare("SELECT COUNT(*) n FROM activities WHERE date BETWEEN ?1 AND ?2 AND id GLOB '*[^0-9]*'").bind(from, to).first<{ n: number }>();
        return json({ from, to, atividades: na, semId: left?.n ?? 0 });
      } catch (e) { return json({ error: garminMsg(e) }, e instanceof GarminError && e.status === 429 ? 429 : 502); }
    }
    if (url.pathname === '/api/recompute' && req.method === 'POST') {
      const to = url.searchParams.get('to');
      const keep = Math.min(Math.max(Number(url.searchParams.get('keep')) || 10, 1), 60);
      return json({ dias: await recompute(env, isDate(to) ? to : brtToday(), keep) });
    }
    return json({ error: 'nao_encontrado' }, 404);
}
