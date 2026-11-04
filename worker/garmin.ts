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
  sleep_start: string | null; sleep_end: string | null; // horário local "AAAA-MM-DDTHH:MM"
  nap_h: number | null; // cochilos do dia (h)
  spo2_avg?: number | null; spo2_low?: number | null; // SpO2 da noite (%), se o relógio mede no sono
  bb_wake?: number | null; bb_high?: number | null;   // Body Battery ao acordar e máximo do dia
}

export interface GarminActivity {
  id: string; date: string; time: string; type: string;
  min: number | null; km: number | null; avghr: number | null; maxhr: number | null;
  load: number | null; te_aer: number | null; rpe: number | null; feel: number | null;
  z: (number | null)[]; // minutos nas zonas 1–5
  extra?: { name: string | null; te_label: string | null; vo2: number | null; kcal: number | null; kcal_bmr: number | null; elev: number | null; speed: number | null; maxspeed: number | null; power: number | null; te_ana: number | null; cadence: number | null };
}

export class GarminError extends Error {
  status: number; where: string;
  constructor(status: number, where: string) { super(`Garmin ${status} em ${where}`); this.status = status; this.where = where; }
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
    // os campos "Local" vêm em milissegundos já no horário local (tratados como se fossem UTC)
    nap_h: (() => { const v = first(dto.napTimeSeconds); return v == null ? null : v / 3600; })(),
    sleep_start: localStamp(dto.sleepStartTimestampLocal),
    sleep_end: localStamp(dto.sleepEndTimestampLocal),
    spo2_avg: first(dto.averageSpO2Value, dto.averageSpo2Value, j?.spo2SleepSummary?.averageSPO2, j?.wellnessSpO2SleepSummaryDTO?.averageSpo2) ?? findNum(j?.spo2SleepSummary ?? dto.spo2SleepSummary, (k) => /avg|average/i.test(k)),
    spo2_low: first(dto.lowestSpO2Value, dto.lowestSpo2Value, j?.spo2SleepSummary?.lowestSPO2, j?.wellnessSpO2SleepSummaryDTO?.lowestSpo2) ?? findNum(j?.spo2SleepSummary ?? dto.spo2SleepSummary, (k) => /low|min/i.test(k)),
  };
}

function localStamp(v: unknown): string | null {
  const ms = n(v);
  return ms == null ? null : new Date(ms).toISOString().slice(0, 16);
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

/** Procura um número em `obj` (um nível de profundidade) cuja chave passe no teste. */
export function findNum(obj: any, test: (key: string) => boolean): number | null {
  if (!obj || typeof obj !== 'object') return null;
  for (const [k, v] of Object.entries(obj)) if (test(k) && n(v) !== null) return v as number;
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object' && !Array.isArray(v))
      for (const [k2, v2] of Object.entries(v)) if (test(`${k}.${k2}`) && n(v2) !== null) return v2 as number;
  }
  return null;
}

type Summary = { rhr: number | null; stress: number | null; resp: number | null; spo2_avg: number | null; spo2_low: number | null; bb_wake: number | null; bb_high: number | null };
export function parseDailySummaries(j: any): Map<string, Summary> {
  const m = new Map<string, Summary>();
  for (const s of arr(j, 'data', 'dailySummaries')) {
    const d = dateOf(s); if (!d) continue;
    // v2: FC de repouso em data.heartRate, estresse em data.stress, respiração em data.respiration
    const rhr = first(s.restingHeartRate, s.restingHeartRateValue) ?? findNum(s.heartRate, (k) => /resting/i.test(k));
    const st = first(s.averageStressLevel, s.avgStressLevel) ?? findNum(s.stress, (k) => /^(avg|average)/i.test(k) && /stress|level/i.test(k));
    const resp = findNum(s.respiration, (k) => /sleep/i.test(k) && /avg|average/i.test(k));
    const spo2_avg = first(s.averageSpo2, s.averageSpO2) ?? findNum(s.spo2 ?? s.pulseOx, (k) => /avg|average/i.test(k));
    const spo2_low = first(s.lowestSpo2, s.lowestSpO2) ?? findNum(s.spo2 ?? s.pulseOx, (k) => /low|min/i.test(k));
    const bb_wake = first(s.bodyBatteryAtWakeTime) ?? findNum(s.bodyBattery, (k) => /wake/i.test(k));
    const bb_high = first(s.bodyBatteryHighestValue) ?? findNum(s.bodyBattery, (k) => /high|max/i.test(k));
    m.set(d, { rhr, stress: st !== null && st >= 0 ? st : null, resp, spo2_avg, spo2_low, bb_wake, bb_high });
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
    extra: {
      name: typeof a.activityName === 'string' ? a.activityName.slice(0, 80) : null,
      // benefício principal segundo a Garmin (ex.: AEROBIC_BASE, TEMPO, LACTATE_THRESHOLD, VO2MAX, ANAEROBIC_CAPACITY, RECOVERY)
      te_label: typeof a.trainingEffectLabel === 'string' ? a.trainingEffectLabel.slice(0, 40)
        : typeof a.aerobicTrainingEffectMessage === 'string' ? a.aerobicTrainingEffectMessage.slice(0, 40) : null,
      kcal: first(a.calories), kcal_bmr: first(a.bmrCalories),
      vo2: first(a.vO2MaxValue, a.vO2MaxPreciseValue),
      elev: first(a.elevationGain), speed: first(a.averageSpeed), maxspeed: first(a.maxSpeed),
      power: first(a.avgPower, a.averagePower), te_ana: first(a.anaerobicTrainingEffect),
      cadence: first(a.averageRunningCadenceInStepsPerMinute, a.averageBikingCadenceInRevPerMinute, a.averageSwimCadenceInStrokesPerMinute),
    },
  };
}

// ---------- busca combinada ----------
/** Métricas diárias de um intervalo (inclusive). ~3 chamadas de faixa + 1 de sono por dia. */
export async function fetchDays(env: GarminEnv, from: string, to: string): Promise<{ days: GarminDay[]; raw: Record<string, string[]>; detail: Record<string, unknown> }> {
  const raw: Record<string, string[]> = {};
  const detail: Record<string, unknown> = {};
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
  // diagnóstico: conteúdo dos blocos do resumo diário mais recente
  const lastSum = arr(sumJ, 'data').at(-1);
  if (lastSum) for (const k of ['heartRate', 'respiration', 'stress']) if (lastSum[k]) detail[k] = lastSum[k];

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
      nap_h: s?.nap_h ?? null,
      sleep_start: s?.sleep_start ?? null,
      sleep_end: s?.sleep_end ?? null,
      resp: sum.get(d)?.resp ?? s?.resp ?? null,
      stress: stress.get(d) ?? sum.get(d)?.stress ?? null,
      spo2_avg: s?.spo2_avg ?? sum.get(d)?.spo2_avg ?? null,
      spo2_low: s?.spo2_low ?? sum.get(d)?.spo2_low ?? null,
      bb_wake: sum.get(d)?.bb_wake ?? null,
      bb_high: sum.get(d)?.bb_high ?? null,
    };
  });
  return { days, raw, detail };
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

/** Arquivo original da atividade (ZIP com o .fit). */
export async function fetchActivityFile(env: GarminEnv, id: string): Promise<Uint8Array> {
  if (!/^\d+$/.test(id)) throw new GarminError(400, 'id_invalido');
  const call = async () => fetch((env.GARMIN_BASE_URL ?? BASE) + `/download-service/files/activity/${id}`,
    { headers: { Accept: 'application/zip, application/x-zip-compressed, application/octet-stream', Authorization: `Bearer ${await token(env)}` } });
  let r = await call();
  if (r.status === 401) { cached = null; r = await call(); }
  if (!r.ok) throw new GarminError(r.status, '/download-service/files');
  return new Uint8Array(await r.arrayBuffer());
}



/**
 * Zonas de FC por modalidade, como configuradas no Garmin. Formato do Garmin Connect: lista de
 * { sport: 'DEFAULT' | 'CYCLING' | 'RUNNING' | 'SWIMMING' | …, zone1Floor … zone5Floor, maxHeartRateUsed, restingHeartRateUsed, trainingMethod }.
 */
export function parseHrZones(j: any) {
  const list: any[] = Array.isArray(j) ? j : Array.isArray(j?.heartRateZones) ? j.heartRateZones : Array.isArray(j?.zones) ? j.zones : [];
  const out: Record<string, { floors: number[]; max: number | null; rest: number | null; method: string | null }> = {};
  const map: Record<string, string> = { DEFAULT: 'default', CYCLING: 'bike', RUNNING: 'corrida', SWIMMING: 'natacao', LAP_SWIMMING: 'natacao', OPEN_WATER_SWIMMING: 'natacao' };
  for (const z of list) {
    const floors = [1, 2, 3, 4, 5].map((i) => n(z?.[`zone${i}Floor`]));
    if (floors.some((f) => f == null)) continue;
    const key = map[String(z?.sport ?? 'DEFAULT').toUpperCase()] ?? null;
    if (!key || out[key]) continue;
    out[key] = { floors: floors as number[], max: n(z?.maxHeartRateUsed), rest: n(z?.restingHeartRateUsed), method: typeof z?.trainingMethod === 'string' ? z.trainingMethod : null };
  }
  return out;
}

/** Idade fitness da Garmin (bruto + campos principais, procurados pelo nome). */
export async function fetchFitnessAge(env: GarminEnv, date: string) {
  const j = await get(env, `/fitnessage-service/fitnessage/v2/${date}`);
  return {
    fitnessAge: first(j?.fitnessAge) ?? findNum(j, (k) => /^fitnessAge$/i.test(k)),
    chronologicalAge: first(j?.chronologicalAge) ?? findNum(j, (k) => /chronological/i.test(k)),
    achievable: first(j?.achievableFitnessAge) ?? findNum(j, (k) => /achievable/i.test(k)),
  };
}

/** Zonas de FC configuradas no Garmin (bruto). */
export async function fetchHrZones(env: GarminEnv): Promise<unknown> {
  return get(env, '/biometric-service/heartRateZones/v2');
}
