// Garmin Connect Personal API (somente leitura).
// Endpoints conforme o cliente oficial: github.com/garmin/connect-personal-api-python
// A chave fica no secret GARMIN_API_KEY do Worker. Nunca logar chave nem token.
//
// Formato das respostas: a Garmin não publica os campos fora do Swagger. Os parsers abaixo
// são defensivos (procuram os nomes usados pelo Garmin Connect) e a tela de diagnóstico
// compara o resultado com o export para confirmar cada campo.

const BASE = 'https://personal.connectapi.garmin.com';
const TOKEN_PATH = '/personalapitoken-service/personal-api/personal-api-key/token';

export interface GarminEnv { GARMIN_API_KEY?: string; GARMIN_BASE_URL?: string }

export interface GarminDay {
  date: string;
  hrv: number | null; rhr: number | null; sleep_h: number | null; sleep_score: number | null;
  resp: number | null; stress: number | null;
}

export interface GarminActivity {
  id: string; date: string; time: string; type: string;
  min: number | null; km: number | null; avghr: number | null; maxhr: number | null;
  load: number | null; te_aer: number | null; rpe: number | null; feel: number | null;
  z: (number | null)[]; // minutos nas zonas 1–5
}

export class GarminError extends Error {
  constructor(public status: number, public where: string) { super(`Garmin ${status} em ${where}`); }
}

// ---------- token (cache só em memória do isolate; renova 1 h antes de vencer) ----------
let cached: { token: string; exp: number } | null = null;

async function token(env: GarminEnv): Promise<string> {
  if (!env.GARMIN_API_KEY) throw new GarminError(0, 'sem_chave');
  const now = Date.now() / 1000;
  if (cached && cached.exp - now > 3600) return cached.token;
  const r = await fetch((env.GARMIN_BASE_URL ?? BASE) + TOKEN_PATH, { method: 'POST', headers: { Accept: '*/*', Authorization: `ApiKey ${env.GARMIN_API_KEY}` } });
  if (!r.ok) throw new GarminError(r.status, 'token');
  const t = (await r.text()).trim();
  let exp = now + 23 * 3600;
  try { exp = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp ?? exp; } catch {}
  cached = { token: t, exp };
  return t;
}

async function get(env: GarminEnv, path: string, params?: Record<string, string | number>): Promise<any> {
  const qs = params ? '?' + new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])) : '';
  const call = async () => fetch((env.GARMIN_BASE_URL ?? BASE) + path + qs, { headers: { Accept: 'application/json', Authorization: `Bearer ${await token(env)}` } });
  let r = await call();
  if (r.status === 401) { cached = null; r = await call(); } // token vencido: troca e tenta uma vez
  if (!r.ok) throw new GarminError(r.status, path.split('/').slice(0, 3).join('/'));
  const txt = await r.text();
  return txt ? JSON.parse(txt) : null;
}

// ---------- utilidades ----------
const n = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const first = (...vs: unknown[]) => { for (const v of vs) { const x = n(v); if (x !== null) return x; } return null; };
const arr = (j: any, ...keys: string[]): any[] => {
  if (Array.isArray(j)) return j;
  for (const k of keys) if (Array.isArray(j?.[k])) return j[k];
  return [];
};
const dateOf = (o: any): string | null => {
  const d = o?.calendarDate ?? o?.date ?? o?.summaryDate;
  return typeof d === 'string' ? d.slice(0, 10) : null;
};
export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = new Date(from + 'T00:00:00Z'); d.toISOString().slice(0, 10) <= to; d.setUTCDate(d.getUTCDate() + 1)) out.push(d.toISOString().slice(0, 10));
  return out;
}

// ---------- parsers (exportados para teste) ----------
export function parseSleep(j: any) {
  const dto = j?.dailySleepDTO ?? j ?? {};
  const secs = first(dto.sleepTimeSeconds, dto.sleepTimeInSeconds);
  return {
    date: dateOf(dto),
    sleep_h: secs === null ? null : secs / 3600,
    sleep_score: first(dto.sleepScores?.overall?.value, dto.overallSleepScore?.value, dto.sleepScore),
    resp: first(dto.averageRespirationValue, dto.avgRespirationValue, j?.averageRespirationValue),
    rhr: first(j?.restingHeartRate, dto.restingHeartRate),
    hrv: first(j?.avgOvernightHrv, dto.avgOvernightHrv),
  };
}

export function parseHrvRange(j: any): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of arr(j, 'hrvSummaries', 'data')) {
    const d = dateOf(s); const v = first(s.lastNightAvg, s.lastNightAverage, s.hrvSummary?.lastNightAvg);
    if (d && v !== null) m.set(d, v);
  }
  return m;
}

export function parseStressRange(j: any): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of arr(j, 'data', 'values')) {
    const d = dateOf(s); const v = first(s.values?.overallStressLevel, s.overallStressLevel, s.averageStressLevel, s.values?.averageStressLevel);
    if (d && v !== null && v >= 0) m.set(d, v);
  }
  return m;
}

export function parseDailySummaries(j: any): Map<string, { rhr: number | null; stress: number | null }> {
  const m = new Map<string, { rhr: number | null; stress: number | null }>();
  for (const s of arr(j, 'data', 'dailySummaries')) {
    const d = dateOf(s); if (!d) continue;
    const st = first(s.averageStressLevel, s.avgStressLevel);
    m.set(d, { rhr: first(s.restingHeartRate, s.restingHeartRateValue), stress: st !== null && st >= 0 ? st : null });
  }
  return m;
}

export function parseActivity(a: any): GarminActivity | null {
  const start = String(a?.startTimeLocal ?? '');
  if (!a?.activityId || start.length < 16) return null;
  const sec = (k: string) => { const v = n(a[k]); return v === null ? null : +(v / 60).toFixed(2); };
  return {
    id: String(a.activityId),
    date: start.slice(0, 10), time: start.slice(11, 16),
    type: a.activityType?.typeKey ?? 'other',
    min: n(a.duration) === null ? null : +(a.duration / 60).toFixed(2),
    km: n(a.distance) === null ? null : +(a.distance / 1000).toFixed(2),
    avghr: first(a.averageHR), maxhr: first(a.maxHR),
    load: first(a.activityTrainingLoad), te_aer: first(a.aerobicTrainingEffect),
    rpe: (() => { const v = first(a.directWorkoutRpe, a.workoutRpe); return v === null ? null : v / 10; })(),
    feel: first(a.directWorkoutFeel, a.workoutFeel),
    z: [1, 2, 3, 4, 5].map((i) => sec(`hrTimeInZone_${i}`)),
  };
}

// ---------- busca combinada ----------
/** Métricas diárias de um intervalo (inclusive). ~3 chamadas de faixa + 1 de sono por dia. */
export async function fetchDays(env: GarminEnv, from: string, to: string): Promise<{ days: GarminDay[]; raw: Record<string, string[]> }> {
  const raw: Record<string, string[]> = {};
  // nomes dos campos (sem valores) para o diagnóstico
  const keysOf = (j: any): string[] => {
    if (j === null || typeof j !== 'object') return [String(j)];
    const top = Array.isArray(j) ? j[0] ?? {} : j;
    const out = Object.keys(top).slice(0, 30);
    for (const k of ['dailySleepDTO', 'hrvSummaries', 'data']) {
      const inner = Array.isArray(top[k]) ? top[k][0] : top[k];
      if (inner && typeof inner === 'object') out.push(...Object.keys(inner).slice(0, 40).map((x) => `${k}.${x}`));
    }
    if (top.values && typeof top.values === 'object') out.push(...Object.keys(top.values).map((x) => `values.${x}`));
    return out;
  };
  const safe = async (label: string, p: Promise<any>) => {
    try { const j = await p; raw[label] = keysOf(j); return j; } catch (e) { raw[label] = [`erro: ${(e as Error).message}`]; return null; }
  };

  const [hrvJ, stressJ, sumJ] = await Promise.all([
    safe('hrv', get(env, `/hrv-service/hrv/daily/${from}/${to}`)),
    safe('estresse', get(env, `/usersummary-service/stats/stress/daily/${from}/${to}`)),
    safe('resumo_diario', get(env, '/usersummary-service/v2/dailysummaries', { startDate: from, endDate: to })),
  ]);
  const hrv = parseHrvRange(hrvJ), stress = parseStressRange(stressJ), sum = parseDailySummaries(sumJ);

  const dates = eachDay(from, to);
  const sleeps = new Map<string, ReturnType<typeof parseSleep>>();
  // sono: um dia por chamada, em lotes de 5
  for (let i = 0; i < dates.length; i += 5) {
    const batch = dates.slice(i, i + 5);
    const res = await Promise.all(batch.map((d) => safe(i === 0 && d === batch[0] ? 'sono' : '_', get(env, '/sleep-service/sleep/dailySleep', { date: d }))));
    batch.forEach((d, k) => { if (res[k]) sleeps.set(d, parseSleep(res[k])); });
  }
  delete raw._;

  const days = dates.map((d): GarminDay => {
    const s = sleeps.get(d);
    return {
      date: d,
      hrv: hrv.get(d) ?? s?.hrv ?? null,
      rhr: sum.get(d)?.rhr ?? s?.rhr ?? null,
      sleep_h: s?.sleep_h ?? null,
      sleep_score: s?.sleep_score ?? null,
      resp: s?.resp ?? null,
      stress: stress.get(d) ?? sum.get(d)?.stress ?? null,
    };
  });
  return { days, raw };
}

/** Atividades com início entre as datas (inclusive), paginando de 100 em 100. */
export async function fetchActivities(env: GarminEnv, from: string, to: string): Promise<GarminActivity[]> {
  const out: GarminActivity[] = [];
  for (let start = 0; start < 1000; start += 100) {
    const j = await get(env, '/activitylist-service/activities/search/activities', { start, limit: 100, startDate: from, endDate: to });
    const list = arr(j, 'activityList', 'activities');
    for (const a of list) { const p = parseActivity(a); if (p) out.push(p); }
    if (list.length < 100) break;
  }
  return out;
}

export const hasKey = (env: GarminEnv) => !!env.GARMIN_API_KEY;
