// REC — Worker: API + rotina da manhã. Os arquivos do app (web/) são servidos como assets estáticos.
import { computeRec, type Contributor, type DailyInput } from '../src/rec.ts';
import { alerts, comment, contributors, type RecRow } from '../src/today.ts';
import { SPORT_LABEL, type Sport } from '../src/sports.ts';
import { fetchRecentDays } from './garmin.ts';

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  APP_TOKEN: string;          // secret: acesso ao app (provisório até a passkey/Face ID)
  GARMIN_API_KEY?: string;    // secret: chave pessoal da Garmin
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

async function morningRoutine(env: Env, trigger: 'cron' | 'manual') {
  const today = brtToday();
  let status = 'ok', detail = '';
  try {
    const g = await fetchRecentDays(env, addDays(today, -3));
    if (g.status === 'ok') {
      const st = env.DB.prepare(
        `INSERT INTO daily_metrics (date, hrv, rhr, sleep_h, sleep_score, resp, stress, source, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'garmin_api', datetime('now'))
         ON CONFLICT(date) DO UPDATE SET
           hrv = COALESCE(excluded.hrv, hrv), rhr = COALESCE(excluded.rhr, rhr), sleep_h = COALESCE(excluded.sleep_h, sleep_h),
           sleep_score = COALESCE(excluded.sleep_score, sleep_score), resp = COALESCE(excluded.resp, resp),
           stress = COALESCE(excluded.stress, stress), source = 'garmin_api', updated_at = datetime('now')`,
      );
      if (g.days.length) await env.DB.batch(g.days.map((d) => st.bind(d.date, d.hrv ?? null, d.rhr ?? null, d.sleep_h ?? null, d.sleep_score ?? null, d.resp ?? null, d.stress ?? null)));
      detail = `garmin: ${g.days.length} dias`;
    } else {
      status = 'sem_dados';
      detail = `garmin: ${g.status}`;
    }
    detail += `; rec: ${await recompute(env, today)} dias`;
  } catch (e) {
    status = 'erro';
    detail = e instanceof Error ? e.message.slice(0, 300) : 'erro';
  }
  await env.DB.prepare('INSERT INTO sync_log (trigger, status, detail) VALUES (?1, ?2, ?3)').bind(trigger, status, detail).run();
  return { status, detail };
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
      return json(await morningRoutine(env, 'manual'));
    }
    return json({ error: 'nao_encontrado' }, 404);
  },

  async scheduled(_c: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(morningRoutine(env, 'cron'));
  },
} satisfies ExportedHandler<Env>;
