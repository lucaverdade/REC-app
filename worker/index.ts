// REC — Worker: API + rotina da manhã. Os arquivos do app (web/) são servidos como assets estáticos.
import { computeRec, type Contributor, type DailyInput } from '../src/rec.ts';
import { alerts, comment, contributors, type RecRow } from '../src/today.ts';
import { SPORT_LABEL, sportOf, type Sport } from '../src/sports.ts';
import { acwr, formZone, pmc } from '../src/load.ts';
import { DISTANCES, predictAll, vdotFromRun, vdotOn, type DistKey } from '../src/predict.ts';
import { bedtimeTarget, debtLevel, irregularNights, regularity, regularityScore, responseNeed, sleepDebt, sleepNeedTonight, type SleepNight } from '../src/sleep.ts';
import { HABITS, HABIT_KEYS, impact } from '../src/habits.ts';
import { hrvTrendNow } from '../src/hrvtrend.ts';
import { illnessAlert } from '../src/illness.ts';
import { ARACAJU, climatology, parseForecast, type HourRow } from '../src/weather.ts';
import { longTrend } from '../src/longtrend.ts';
import { dailySummary, recTrend } from '../src/daily.ts';
import { strainTargetV2 } from '../src/target.ts';
import { recoveryVerdict } from '../src/verdict.ts';
import { fetchActivities, fetchActivityFile, fetchDays, fetchHrZones, GarminError, hasKey, parseHrZones, type GarminActivity, type GarminDay } from './garmin.ts';
import SCHEMA from './schema.sql';

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  APP_TOKEN?: string;         // secret opcional: se existir, o app pede código
  GARMIN_API_KEY?: string;    // secret: chave pessoal da Garmin
  GARMIN_BASE_URL?: string;   // só para testes locais com servidor simulado
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
  for (const q of ['ALTER TABLE daily_metrics ADD COLUMN sleep_start TEXT', 'ALTER TABLE daily_metrics ADD COLUMN sleep_end TEXT', 'ALTER TABLE daily_metrics ADD COLUMN nap_h REAL', 'DROP TABLE IF EXISTS activity_fit', 'ALTER TABLE activities ADD COLUMN z_orig TEXT', 'ALTER TABLE activities ADD COLUMN z_src TEXT', 'ALTER TABLE activities ADD COLUMN name TEXT', 'ALTER TABLE activities ADD COLUMN kcal REAL', 'ALTER TABLE activities ADD COLUMN kcal_bmr REAL', 'ALTER TABLE activities ADD COLUMN elev REAL', 'ALTER TABLE activities ADD COLUMN speed REAL', 'ALTER TABLE activities ADD COLUMN maxspeed REAL', 'ALTER TABLE activities ADD COLUMN power REAL', 'ALTER TABLE activities ADD COLUMN te_ana REAL', 'ALTER TABLE activities ADD COLUMN cadence REAL']) {
    try { await env.DB.prepare(q).run(); } catch { /* já existe */ }
  }
  schemaReady = true;
}

async function writeDays(env: Env, days: GarminDay[]) {
  const st = env.DB.prepare(
    `INSERT INTO daily_metrics (date, hrv, rhr, sleep_h, sleep_score, resp, stress, sleep_start, sleep_end, nap_h, source, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'garmin_api', datetime('now'))
     ON CONFLICT(date) DO UPDATE SET
       hrv = COALESCE(excluded.hrv, hrv), rhr = COALESCE(excluded.rhr, rhr), sleep_h = COALESCE(excluded.sleep_h, sleep_h),
       sleep_score = COALESCE(excluded.sleep_score, sleep_score), resp = COALESCE(excluded.resp, resp),
       stress = COALESCE(excluded.stress, stress), sleep_start = COALESCE(excluded.sleep_start, sleep_start),
       sleep_end = COALESCE(excluded.sleep_end, sleep_end), nap_h = COALESCE(excluded.nap_h, nap_h),
       source = 'garmin_api', updated_at = datetime('now')`,
  );
  const useful = days.filter((d) => [d.hrv, d.rhr, d.sleep_h, d.resp, d.stress].some((v) => v !== null));
  if (useful.length) await env.DB.batch(useful.map((d) => st.bind(d.date, d.hrv, d.rhr, d.sleep_h, d.sleep_score, d.resp, d.stress, d.sleep_start, d.sleep_end, d.nap_h)));
  return useful.length;
}

async function writeActivities(env: Env, acts: GarminActivity[]) {
  // remove linhas do export do mesmo treino (mesma data, hora e tipo) para não duplicar
  const del = env.DB.prepare(`DELETE FROM activities WHERE date = ?1 AND time = ?2 AND type = ?3 AND id <> ?4`);
  const ex = env.DB.prepare(`UPDATE activities SET name = ?2, kcal = ?3, kcal_bmr = ?4, elev = ?5, speed = ?6, maxspeed = ?7, power = ?8, te_ana = ?9, cadence = ?10 WHERE id = ?1`);
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
  await env.DB.batch(acts.flatMap((a) => [
    del.bind(a.date, a.time, a.type, a.id),
    st.bind(a.id, a.date, a.time, a.type, sportOf(a.type), a.min, a.km, a.avghr, a.maxhr, a.load, a.te_aer, a.rpe, a.feel, ...a.z),
    ...(a.extra ? [ex.bind(a.id, a.extra.name, a.extra.kcal, a.extra.kcal_bmr, a.extra.elev, a.extra.speed, a.extra.maxspeed, a.extra.power, a.extra.te_ana, a.extra.cadence)] : []),
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
  let status = 'ok', detail = '';
  try {
    if (!hasKey(env)) {
      status = 'sem_dados'; detail = 'garmin: sem_chave';
    } else if (light && trigger !== 'manual') {
      const na = await writeActivities(env, await fetchActivities(env, addDays(today, -1), today));
      detail = `garmin: atividades (${na})`;
    } else {
      const from = addDays(today, -2);
      const { days } = await fetchDays(env, from, today);
      const nd = await writeDays(env, days);
      const na = await writeActivities(env, await fetchActivities(env, from, today));
      detail = `garmin: ${nd} dias, ${na} atividades`;
      if (!(await hasTonight(env, today))) status = 'sem_dados';
    }
    if (!(light && trigger !== 'manual')) detail += `; rec: ${await recompute(env, today)} dias`;
  } catch (e) {
    status = 'erro';
    detail = garminMsg(e);
  }
  await env.DB.prepare('INSERT INTO sync_log (trigger, status, detail) VALUES (?1, ?2, ?3)').bind(trigger, status, detail).run();
  return { status, detail };
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
const STRAIN_SQL = `CASE WHEN z1 IS NULL AND z2 IS NULL AND z3 IS NULL AND z4 IS NULL AND z5 IS NULL THEN NULL
  ELSE 0.5 * MAX(0, COALESCE(min,0) - (COALESCE(z1,0)+COALESCE(z2,0)+COALESCE(z3,0)+COALESCE(z4,0)+COALESCE(z5,0)))
     + COALESCE(z1,0)*1 + COALESCE(z2,0)*2 + COALESCE(z3,0)*3 + COALESCE(z4,0)*4 + COALESCE(z5,0)*5 END`;

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
interface PlanSession { modalidade: string; titulo?: string; minutos?: number; zona?: string; detalhe?: string; chave?: boolean; strain?: number }
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
 * 3) Senão: minutos × peso médio da zona (Z1 = 1 … Z5 = 5; sem zona = 2).
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
  if (!p.minutos) return typeof p.strain === 'number' ? { v: Math.round(p.strain), src: 'plano' } : { v: null, src: null };
  const zs = [...String(p.zona ?? '').matchAll(/[1-5]/g)].map((m) => Number(m[0]));
  const sport = normSport(p.modalidade);
  if (rates) {
    const ks = zs.length ? [...new Set(zs.length === 2 ? range(zs[0], zs[1]) : zs)] : [2];
    const pool = ks.flatMap((k) => rates.get(`${sport}:${k}`) ?? []);
    if (pool.length >= 3) return { v: Math.round(p.minutos * median(pool)), src: 'historico', n: pool.length };
  }
  if (typeof p.strain === 'number') return { v: Math.round(p.strain), src: 'plano' };
  const w = zs.length ? zs.reduce((a, b) => a + b, 0) / zs.length : 2;
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
  return {
    projection,
    race: { ...RACE, days: daysBetween(today, RACE.date), raceWeek: daysBetween(today, RACE.date) <= 6 && daysBetween(today, RACE.date) >= -1 },
    today: { rec: rec?.rec == null ? null : Math.round(rec.rec), formPct: ln.formPct, zone: ln.zone },
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
  const planned = await (async () => {
    if (!req) return [] as { label: string; sport: Sport; titulo: string | null; minutos: number | null; zona: string | null; strain: number | null; strainSrc: string | null }[];
    const plan = await readPlan(env, req, mondayOf(date));
    const rates = await strainRates(env, date);
    return (plan?.dias?.[date] ?? []).map((p) => { const sp = normSport(p.modalidade); const e = plannedStrainEst(p, rates); return { label: SPORT_LABEL[sp], sport: sp, titulo: p.titulo ?? null, minutos: p.minutos ?? null, zona: p.zona ?? null, strain: e.v, strainSrc: e.src }; });
  })();
  const verdict7 = await (async () => {
    const { results: zr } = await env.DB.prepare('SELECT date, z_hrv, z_rhr, z_sleep, z_resp, z_stress FROM rec_daily WHERE date BETWEEN ?1 AND ?2 ORDER BY date')
      .bind(addDays(date, -6), date).all<Record<string, number | null>>();
    return recoveryVerdict(zr.map((r) => ({ date: r.date as unknown as string, z: { hrv: r.z_hrv, rhr: r.z_rhr, sleep: r.z_sleep, resp: r.z_resp, stress: r.z_stress }, raw: {} })),
      { zoneKey: ln.zone?.key ?? null, fatigueAboveDays: 0, hrvBase: null, rhrBase: null, sleepNeed: 7.5 });
  })();
  const { results: nights } = await env.DB.prepare('SELECT date, sleep_h, nap_h, sleep_start, sleep_end FROM daily_metrics WHERE date BETWEEN ?1 AND ?2 ORDER BY date')
    .bind(addDays(date, -95), date).all<SleepNight>();
  const sb = await sleepBase(env, date);
  const need = sb.hours;
  const heavy = ln.zone?.key === 'produtivo' || ln.zone?.key === 'risco';
  const debt = sleepDebt(nights, need, date);
  const lastNight = nights.find((n) => n.date === date) ?? null;
  const yesterdayNap = nights.find((n) => n.date === addDays(date, -1))?.nap_h ?? null;

  const empty: RecRow = { date, rec: null, z: {} as RecRow['z'], value: {} as RecRow['value'], base: {} as RecRow['base'] };
  for (const k of K) { empty.z[k] = null; empty.value[k] = null; empty.base[k] = null; }
  const t = today ?? empty;

  // aviso de sincronização (só no dia de hoje): falha, noite que não chegou ou busca automática parada
  const minsSinceSync = lastSync?.at ? Math.round((Date.now() - Date.parse(String(lastSync.at).replace(' ', 'T') + 'Z')) / 60000) : null;
  const syncIssue = await (async () => {
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
  })();

  return {
    date,
    rec: t.rec === null ? null : Math.round(t.rec),
    contributors: contributors(t),
    comment: comment(t, hist),
    alerts: [
      ...(await (async () => {
        const sick = (await env.DB.prepare("SELECT 1 x FROM habit_tags WHERE tag = 'doente' AND date BETWEEN ?1 AND ?2").bind(addDays(date, -1), date).first()) != null;
        const zz = (r: RecRow | undefined | null) => (r ? { resp: r.z.resp, rhr: r.z.rhr, hrv: r.z.hrv, stress: r.z.stress } : null);
        const a = illnessAlert(today ? zz(t) : null, zz(yesterday), sick);
        return a ? [a] : [];
      })()),
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
    day: (() => {
      const recR = t.rec == null ? null : Math.round(t.rec);
      return {
        summary: dailySummary(recR, ln.zone?.key ?? null),
        trend: recTrend([...hist, t].slice(-7).map((r) => ({ date: r.date, rec: r.rec == null ? null : Math.round(r.rec) }))),
        target: strainTargetV2({
          ...ln.tgt, recToday: recR, verdictLevel: verdict7?.level ?? null, zoneKey: ln.zone?.key ?? null,
          plannedToday: planned.length ? planned.reduce((a, x) => a + (x.strain ?? 0), 0) : null,
        }),
      };
    })(),
    planned,
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
async function activityPayload(env: Env, id: string) {
  await ensureSchema(env);
  const a = await env.DB.prepare(`SELECT *, ${STRAIN_SQL} strain FROM activities WHERE id = ?1`).bind(id).first<Record<string, any>>();
  if (!a) return null;
  const rec = await env.DB.prepare('SELECT rec FROM rec_daily WHERE date = ?1').bind(a.date).first<{ rec: number | null }>();
  const ln = await loadOn(env, a.date);
  const z = [a.z1, a.z2, a.z3, a.z4, a.z5];
  const has = z.some((v) => v != null), inZ = z.reduce((x: number, v: number | null) => x + (v ?? 0), 0);
  const active = a.kcal != null ? (a.kcal_bmr != null ? a.kcal - a.kcal_bmr : a.kcal) : null;
  return {
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
    form: ln.formPct, formZone: ln.zone && { key: ln.zone.key, label: ln.zone.label },
  };
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

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    if (!authorized(req, env)) return json({ error: 'nao_autorizado' }, 401);
    await ensureSchema(env);

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
      const a = await activityPayload(env, url.searchParams.get('id') ?? '');
      return a ? json(a) : json({ error: 'nao_encontrado' }, 404);
    }
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
      return json({ pending: results, left: left?.n ?? 0, done: done?.n ?? 0 });
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
      if (!z) { await env.DB.prepare("UPDATE activities SET z_src = 'sem_fc' WHERE id = ?1").bind(id).run(); return json({ ok: true, skipped: true }); }
      // guarda as zonas originais da Garmin (para desfazer) e grava as recalculadas
      await env.DB.prepare(`UPDATE activities SET z_orig = COALESCE(z_orig, json_array(z1, z2, z3, z4, z5)), z1 = ?2, z2 = ?3, z3 = ?4, z4 = ?5, z5 = ?6, z_src = 'fit' WHERE id = ?1`)
        .bind(id, ...z.map((v) => Math.round(v * 100) / 100)).run();
      return json({ ok: true });
    }
    if (url.pathname === '/api/zones/undo' && req.method === 'POST') {
      await env.DB.prepare(`UPDATE activities SET z1 = json_extract(z_orig, '$[0]'), z2 = json_extract(z_orig, '$[1]'), z3 = json_extract(z_orig, '$[2]'), z4 = json_extract(z_orig, '$[3]'), z5 = json_extract(z_orig, '$[4]'), z_src = NULL, z_orig = NULL WHERE z_orig IS NOT NULL`).run();
      await env.DB.prepare(`UPDATE activities SET z_src = NULL WHERE z_src IN ('sem_arquivo', 'sem_fc')`).run();
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
        return json({ from, to, dias: nd, atividades: na });
      } catch (e) { return json({ error: garminMsg(e) }, 502); }
    }
    if (url.pathname === '/api/recompute' && req.method === 'POST') {
      const to = url.searchParams.get('to');
      const keep = Math.min(Math.max(Number(url.searchParams.get('keep')) || 10, 1), 60);
      return json({ dias: await recompute(env, isDate(to) ? to : brtToday(), keep) });
    }
    return json({ error: 'nao_encontrado' }, 404);
  },

  async scheduled(_c: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(morningRoutine(env, 'cron'));
  },
} satisfies ExportedHandler<Env>;
