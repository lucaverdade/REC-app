// REC — Worker: API + rotina da manhã. Os arquivos do app (web/) são servidos como assets estáticos.
import { computeRec, type Contributor, type DailyInput } from '../src/rec.ts';
import { alerts, comment, contributors, type RecRow } from '../src/today.ts';
import { SPORT_LABEL, sportOf, type Sport } from '../src/sports.ts';
import { acwr, formZone, pmc } from '../src/load.ts';
import { fetchActivities, fetchDays, fetchHrZones, GarminError, hasKey, type GarminActivity, type GarminDay } from './garmin.ts';
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
  schemaReady = true;
}

async function writeDays(env: Env, days: GarminDay[]) {
  const st = env.DB.prepare(
    `INSERT INTO daily_metrics (date, hrv, rhr, sleep_h, sleep_score, resp, stress, source, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'garmin_api', datetime('now'))
     ON CONFLICT(date) DO UPDATE SET
       hrv = COALESCE(excluded.hrv, hrv), rhr = COALESCE(excluded.rhr, rhr), sleep_h = COALESCE(excluded.sleep_h, sleep_h),
       sleep_score = COALESCE(excluded.sleep_score, sleep_score), resp = COALESCE(excluded.resp, resp),
       stress = COALESCE(excluded.stress, stress), source = 'garmin_api', updated_at = datetime('now')`,
  );
  const useful = days.filter((d) => [d.hrv, d.rhr, d.sleep_h, d.resp, d.stress].some((v) => v !== null));
  if (useful.length) await env.DB.batch(useful.map((d) => st.bind(d.date, d.hrv, d.rhr, d.sleep_h, d.sleep_score, d.resp, d.stress)));
  return useful.length;
}

async function writeActivities(env: Env, acts: GarminActivity[]) {
  // remove linhas do export do mesmo treino (mesma data, hora e tipo) para não duplicar
  const del = env.DB.prepare(`DELETE FROM activities WHERE date = ?1 AND time = ?2 AND type = ?3 AND id <> ?4`);
  const st = env.DB.prepare(
    `INSERT OR REPLACE INTO activities (id, date, time, type, sport, min, km, avghr, maxhr, load, te_aer, rpe, feel, z1, z2, z3, z4, z5)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)`,
  );
  if (!acts.length) return 0;
  await env.DB.batch(acts.flatMap((a) => [
    del.bind(a.date, a.time, a.type, a.id),
    st.bind(a.id, a.date, a.time, a.type, sportOf(a.type), a.min, a.km, a.avghr, a.maxhr, a.load, a.te_aer, a.rpe, a.feel, ...a.z),
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
  // a rotina agendada só trabalha enquanto a noite de hoje não chegou
  if (trigger === 'cron' && (await hasTonight(env, today))) return { status: 'ja_atualizado', detail: '' };
  let status = 'ok', detail = '';
  try {
    if (!hasKey(env)) {
      status = 'sem_dados'; detail = 'garmin: sem_chave';
    } else {
      const from = addDays(today, -2);
      const { days } = await fetchDays(env, from, today);
      const nd = await writeDays(env, days);
      const na = await writeActivities(env, await fetchActivities(env, from, today));
      detail = `garmin: ${nd} dias, ${na} atividades`;
      if (!(await hasTonight(env, today))) status = 'sem_dados';
    }
    detail += `; rec: ${await recompute(env, today)} dias`;
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
interface PlanSession { modalidade: string; titulo?: string; minutos?: number; zona?: string; detalhe?: string; chave?: boolean }
interface Plan { semana: string; fase?: string; notas?: string; dias?: Record<string, PlanSession[]> }

async function readPlan(env: Env, req: Request, monday: string): Promise<Plan | null> {
  try {
    const r = await env.ASSETS.fetch(new Request(new URL(`/plan/${monday}.json`, req.url)));
    if (!r.ok) return null;
    const p = (await r.json()) as Plan;
    return p && typeof p === 'object' ? p : null;
  } catch { return null; }
}

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

  let plannedMin = 0, doneMin = 0, strainTot = 0;
  const days = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(monday, i);
    const ex = acts.filter((a) => a.date === date).map((a) => {
      const z = [a.z1, a.z2, a.z3, a.z4, a.z5].map((v: number | null) => v ?? 0);
      const inZ = z.reduce((x: number, y: number) => x + y, 0);
      const hasZ = [a.z1, a.z2, a.z3, a.z4, a.z5].some((v) => v != null);
      doneMin += a.min ?? 0; strainTot += a.strain ?? 0;
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
      const hit = ex.find((e) => !e.matched && e.sport === sport);
      let status: 'feito' | 'parcial' | 'nao_feito' | 'previsto';
      if (hit) { hit.matched = true; status = !p.minutos || (hit.min ?? 0) >= p.minutos * 0.8 ? 'feito' : 'parcial'; }
      else status = date < today ? 'nao_feito' : 'previsto';
      return { ...p, sport, label: SPORT_LABEL[sport], status, activityId: hit?.id ?? null };
    });
    const rec = recBy.get(date) ?? null, recNext = recBy.get(addDays(date, 1)) ?? null;
    days.push({ date, isToday: date === today, future: date > today, rec, recNext, planned, executed: ex });
  }
  const r1 = (x: number) => Math.round(x * 10) / 10;
  return {
    monday, sunday, offset,
    plan: plan ? { fase: plan.fase ?? null, notas: plan.notas ?? null } : null,
    summary: { plannedHours: plan ? r1(plannedMin / 60) : null, doneHours: r1(doneMin / 60), strain: Math.round(strainTot) },
    days,
  };
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

async function todayPayload(env: Env, date: string) {
  await ensureSchema(env);
  const { results } = await env.DB.prepare('SELECT * FROM rec_daily WHERE date BETWEEN ?1 AND ?2 ORDER BY date')
    .bind(addDays(date, -7), date).all<RecDb>();
  const rows = results.map(toRow);
  const today = rows.find((r) => r.date === date) ?? null;
  const hist = rows.filter((r) => r.date < date);
  const yesterday = hist.find((r) => r.date === addDays(date, -1));

  const acts = await env.DB.prepare(`SELECT time, type, sport, min, km, avghr, maxhr, rpe, z1, z2, z3, z4, z5, ${STRAIN_SQL} strain FROM activities WHERE date = ?1 ORDER BY time`)
    .bind(date).all<{ time: string; type: string; sport: Sport; min: number; km: number; avghr: number; maxhr: number | null; rpe: number | null; strain: number | null; z1: number | null; z2: number | null; z3: number | null; z4: number | null; z5: number | null }>();
  const feel = await env.DB.prepare('SELECT value FROM feel_notes WHERE date = ?1').bind(date).first<{ value: number }>();
  const lastSync = await env.DB.prepare('SELECT at, status, detail FROM sync_log ORDER BY id DESC LIMIT 1').first();
  const ln = await loadOn(env, date);

  const empty: RecRow = { date, rec: null, z: {} as RecRow['z'], value: {} as RecRow['value'], base: {} as RecRow['base'] };
  for (const k of K) { empty.z[k] = null; empty.value[k] = null; empty.base[k] = null; }
  const t = today ?? empty;

  return {
    date,
    rec: t.rec === null ? null : Math.round(t.rec),
    contributors: contributors(t),
    comment: comment(t, hist),
    alerts: [...alerts(t, yesterday), ...(await loadAlerts(env, date))],
    week: [...hist, t].slice(-7).map((r) => ({ date: r.date, rec: r.rec === null ? null : Math.round(r.rec) })),
    activities: acts.results.map((a) => {
      const z = [a.z1, a.z2, a.z3, a.z4, a.z5];
      const has = z.some((v) => v != null), inZ = z.reduce<number>((x, v) => x + (v ?? 0), 0);
      return {
        time: a.time, type: a.type, sport: a.sport, label: SPORT_LABEL[a.sport], min: a.min, km: a.km, avghr: a.avghr, maxhr: a.maxhr, rpe: a.rpe,
        strain: a.strain == null ? null : Math.round(a.strain),
        zones: has ? [Math.max(0, (a.min ?? 0) - inZ), ...z.map((v) => v ?? 0)].map((m) => Math.round(m)) : null,
      };
    }),
    feel: feel?.value ?? null,
    load: ln,
    isToday: date === brtToday(),
    race: { ...RACE, days: daysBetween(date, RACE.date) },
    // app busca sozinho ao abrir quando a noite de hoje ainda não está no banco
    needsSync: date === brtToday() && !(await hasTonight(env, date)),
    // menos de 30 noites com HRV: o REC ainda não tem base; o app aponta para "Puxar histórico"
    needsHistory: ((await env.DB.prepare('SELECT COUNT(*) n FROM daily_metrics WHERE hrv IS NOT NULL').first<{ n: number }>())?.n ?? 0) < 30,
    shadowMode: true, // primeiras 6–8 semanas: REC não decide treino
    lastSync,
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
      return json(await todayPayload(env, isDate(d) ? d : brtToday()));
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
    if (url.pathname === '/api/refresh' && req.method === 'POST') {
      const auto = url.searchParams.get('auto') === '1';
      return json(await morningRoutine(env, auto ? 'open' : 'manual'));
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
