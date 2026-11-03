// REC — Worker: API + rotina da manhã. Os arquivos do app (web/) são servidos como assets estáticos.
import { computeRec, type Contributor, type DailyInput } from '../src/rec.ts';
import { alerts, comment, contributors, type RecRow } from '../src/today.ts';
import { SPORT_LABEL, sportOf, type Sport } from '../src/sports.ts';
import { fetchActivities, fetchDays, GarminError, hasKey, type GarminActivity, type GarminDay } from './garmin.ts';
import SCHEMA from './schema.sql';

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  APP_TOKEN: string;          // secret: acesso ao app (provisório até a passkey/Face ID)
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
  const { days: api, raw } = await fetchDays(env, from, to);
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
  return { from, to, fields, raw, sample };
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

  const acts = await env.DB.prepare('SELECT time, type, sport, min, km, avghr, load, rpe FROM activities WHERE date = ?1 ORDER BY time')
    .bind(date).all<{ time: string; type: string; sport: Sport; min: number; km: number; avghr: number; load: number; rpe: number | null }>();
  const feel = await env.DB.prepare('SELECT value FROM feel_notes WHERE date = ?1').bind(date).first<{ value: number }>();
  const lastSync = await env.DB.prepare('SELECT at, status, detail FROM sync_log ORDER BY id DESC LIMIT 1').first();

  const empty: RecRow = { date, rec: null, z: {} as RecRow['z'], value: {} as RecRow['value'], base: {} as RecRow['base'] };
  for (const k of K) { empty.z[k] = null; empty.value[k] = null; empty.base[k] = null; }
  const t = today ?? empty;

  return {
    date,
    rec: t.rec === null ? null : Math.round(t.rec),
    contributors: contributors(t),
    comment: comment(t, hist),
    alerts: alerts(t, yesterday),
    week: [...hist, t].slice(-7).map((r) => ({ date: r.date, rec: r.rec === null ? null : Math.round(r.rec) })),
    activities: acts.results.map((a) => ({ ...a, label: SPORT_LABEL[a.sport] })),
    feel: feel?.value ?? null,
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
  const h = req.headers.get('authorization') ?? '';
  return !!env.APP_TOKEN && h === `Bearer ${env.APP_TOKEN}`;
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

    // --- Garmin: estado, diagnóstico e histórico ---
    if (url.pathname === '/api/garmin/status' && req.method === 'GET') {
      const agg = await env.DB.prepare(`SELECT COUNT(*) n, MIN(date) first, MAX(date) last,
          SUM(source = 'garmin_api') api, SUM(hrv IS NOT NULL) hrv FROM daily_metrics`).first();
      const recs = await env.DB.prepare('SELECT COUNT(*) n FROM rec_daily WHERE rec IS NOT NULL').first<{ n: number }>();
      const acts = await env.DB.prepare('SELECT COUNT(*) n, MIN(date) first FROM activities').first();
      const log = await env.DB.prepare('SELECT at, trigger, status, detail FROM sync_log ORDER BY id DESC LIMIT 5').all();
      return json({ hasKey: hasKey(env), dias: agg, recs: recs?.n ?? 0, atividades: acts, log: log.results, hoje: brtToday() });
    }
    if (url.pathname === '/api/garmin/check' && req.method === 'GET') {
      if (!hasKey(env)) return json({ error: 'sem_chave' }, 400);
      const days = Math.min(Math.max(Number(url.searchParams.get('days')) || 14, 3), 28);
      try { return json(await garminCheck(env, days)); } catch (e) { return json({ error: garminMsg(e) }, 502); }
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
