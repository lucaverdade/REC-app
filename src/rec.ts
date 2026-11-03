// REC v1.1 — porte fiel de reference/rec_reference.py.
// Função pura: recebe a série diária e devolve z-scores e REC por dia.
// Sem dependências, roda no Worker (Cloudflare) e no Node.

export interface DailyInput {
  date: string; // AAAA-MM-DD (data da manhã)
  hrv?: number | null;
  rhr?: number | null;
  sleep_h?: number | null;
  resp?: number | null;
  stress?: number | null;
}

export type Contributor = 'hrv' | 'rhr' | 'sleep' | 'resp' | 'stress';

export interface RecResult {
  date: string;
  z: Record<Contributor, number | null>;
  /** valor bruto usado no dia (HRV em ms, FC em bpm, sono em h, resp em rpm, estresse de D−1) */
  value: Record<Contributor, number | null>;
  /** linha de base usada (HRV: média geométrica 120 d; FC: mediana 120 d; sono: necessidade) */
  base: Record<Contributor, number | null>;
  rec: number | null; // null = traço
}

export const WEIGHTS: Record<Contributor, number> = {
  hrv: 2.0,
  rhr: 1.0,
  sleep: 1.5,
  resp: 0.7,
  stress: 0.5,
};

const SLEEP_NEED_H = 7.5;

type Num = number | null;

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const clip = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// --- estatística no estilo pandas (ignora NaN, std com ddof=1) ---
function mean(xs: number[]) {
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}
function std(xs: number[]) {
  if (xs.length < 2) return NaN;
  const m = mean(xs);
  let s = 0;
  for (const x of xs) s += (x - m) * (x - m);
  return Math.sqrt(s / (xs.length - 1));
}
function median(xs: number[]) {
  const a = [...xs].sort((p, q) => p - q);
  const n = a.length;
  return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2;
}

/** z-score contra a janela dos `w` dias anteriores (shift(1).rolling(w, min_periods)). */
function rollingZ(
  x: Num[],
  w: number,
  minp: number,
  floor: number,
  opts: { med?: boolean; neg?: boolean } = {},
): { z: Num[]; base: Num[] } {
  const out: Num[] = new Array(x.length).fill(null);
  const bases: Num[] = new Array(x.length).fill(null);
  for (let i = 0; i < x.length; i++) {
    const xi = x[i];
    if (!isNum(xi)) continue;
    const win: number[] = [];
    for (let j = Math.max(0, i - w); j < i; j++) {
      const v = x[j];
      if (isNum(v)) win.push(v);
    }
    if (win.length < minp) continue;
    const sd = std(win);
    if (!Number.isFinite(sd)) continue;
    const base = opts.med ? median(win) : mean(win);
    let z = (xi - base) / Math.max(sd, floor);
    if (opts.neg) z = -z;
    out[i] = clip(z, -3, 3);
    bases[i] = base;
  }
  return { z: out, base: bases };
}

// --- Φ (CDF normal) com erf de alta precisão ---
function erf(x: number): number {
  const ax = Math.abs(x);
  let r: number;
  if (ax < 3) {
    // série de Taylor
    let term = ax, sum = ax;
    const x2 = ax * ax;
    for (let n = 1; n < 200; n++) {
      term *= -x2 / n;
      const add = term / (2 * n + 1);
      sum += add;
      if (Math.abs(add) < 1e-17 * Math.abs(sum)) break;
    }
    r = (2 / Math.sqrt(Math.PI)) * sum;
  } else {
    // fração continuada para erfc
    let f = 0;
    for (let n = 60; n >= 1; n--) f = (n / 2) / (ax + f);
    r = 1 - Math.exp(-ax * ax) / Math.sqrt(Math.PI) / (ax + f);
  }
  return x < 0 ? -r : r;
}
export const phi = (z: number) => 0.5 * (1 + erf(z / Math.SQRT2));

// --- utilidades de data ---
function addDays(iso: string, n: number) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Reindexa para dias contínuos (equivalente a df.asfreq('D')). */
function fillDays(rows: DailyInput[]): DailyInput[] {
  if (!rows.length) return [];
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const byDate = new Map(sorted.map((r) => [r.date, r]));
  const out: DailyInput[] = [];
  const last = sorted[sorted.length - 1].date;
  for (let d = sorted[0].date; d <= last; d = addDays(d, 1)) {
    out.push(byDate.get(d) ?? { date: d });
  }
  return out;
}

export function computeRec(rows: DailyInput[]): RecResult[] {
  const df = fillDays(rows);
  const pick = (k: keyof DailyInput, min: number): Num[] =>
    df.map((r) => {
      const v = r[k];
      return isNum(v) && v > min ? v : null;
    });

  const lnh = pick('hrv', 40).map((v) => (v === null ? null : Math.log(v)));
  const rhr = pick('rhr', 30);
  const resp = pick('resp', 8);
  const stressRaw = pick('stress', 0);
  const stressPrev: Num[] = df.map((_, i) => (i > 0 ? stressRaw[i - 1] : null));

  const rz = {
    hrv: rollingZ(lnh, 120, 30, 0.04),
    rhr: rollingZ(rhr, 120, 20, 1.0, { med: true, neg: true }),
    resp: rollingZ(resp, 60, 20, 0.4, { neg: true }),
    stress: rollingZ(stressPrev, 60, 20, 3.0, { neg: true }),
  };
  const sleep: Num[] = df.map((r) =>
    isNum(r.sleep_h) ? clip((Math.min(r.sleep_h, 9) - SLEEP_NEED_H) / 1.0, -3, 1.5) : null,
  );
  const Z: Record<Contributor, Num[]> = {
    hrv: rz.hrv.z, rhr: rz.rhr.z, sleep, resp: rz.resp.z, stress: rz.stress.z,
  };
  const V: Record<Contributor, Num[]> = {
    hrv: pick('hrv', 40), rhr, sleep: df.map((r) => (isNum(r.sleep_h) ? r.sleep_h : null)),
    resp, stress: stressPrev,
  };
  const B: Record<Contributor, Num[]> = {
    hrv: rz.hrv.base.map((b) => (b === null ? null : Math.exp(b))),
    rhr: rz.rhr.base,
    sleep: df.map(() => SLEEP_NEED_H),
    resp: rz.resp.base,
    stress: rz.stress.base,
  };

  const keys = Object.keys(WEIGHTS) as Contributor[];
  const wTotal = keys.reduce((s, k) => s + WEIGHTS[k], 0);

  return df.map((r, i) => {
    const z = {} as Record<Contributor, number | null>;
    const value = {} as Record<Contributor, number | null>;
    const base = {} as Record<Contributor, number | null>;
    let num = 0, wsum = 0;
    for (const k of keys) {
      const v = Z[k][i];
      z[k] = v;
      value[k] = V[k][i];
      base[k] = B[k][i];
      if (v !== null) {
        num += WEIGHTS[k] * v;
        wsum += WEIGHTS[k];
      }
    }
    const valid = wsum >= wTotal / 2 && z.hrv !== null && z.sleep !== null;
    return { date: r.date, z, value, base, rec: valid ? phi(num / wsum) * 100 : null };
  });
}

/** Zona por cor (sem rótulos em palavras no app). */
export function zone(rec: number | null): 'red' | 'yellow' | 'green' | null {
  if (rec === null) return null;
  const r = Math.round(rec);
  return r <= 33 ? 'red' : r <= 66 ? 'yellow' : 'green';
}
