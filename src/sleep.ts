// Sono: necessidade pessoal, dívida, necessidade de hoje e regularidade.
//
// Método (03/11), baseado no que Oura e Whoop publicam:
// - Necessidade pessoal (Oura): média das últimas 90 noites, sem as 10% mais curtas e as 10% mais longas
//   (sono da noite + cochilos). Limitada entre 6 h 30 e 9 h.
// - Dívida (Oura): últimos 14 dias, noites recentes pesam mais (meia-vida de 7 dias), cochilos contam;
//   noites acima da necessidade pagam a dívida; nunca abaixo de zero.
//   Faixas da Oura: nenhuma (0), baixa (< 2 h), moderada (2–5 h), alta (> 5 h).
// - Necessidade de hoje à noite (Whoop): necessidade pessoal + parte da dívida (¼, até +30 min)
//   + treino do dia (Strain acima de 100, até +30 min) − cochilo de hoje.
// O REC continua usando a necessidade fixa de 7,5 h da especificação v1.1.

export const REC_NEED_H = 7.5;

export interface SleepNight { date: string; sleep_h: number | null; nap_h?: number | null; sleep_start?: string | null; sleep_end?: string | null }

const total = (n: SleepNight) => (n.sleep_h ?? 0) + (n.nap_h ?? 0);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400_000);

/** Necessidade pessoal (h) a partir das noites dos últimos 90 dias. */
export function personalNeed(nights: SleepNight[]): number {
  const xs = nights.filter((n) => n.sleep_h != null).slice(-90).map(total).sort((a, b) => a - b);
  if (xs.length < 14) return REC_NEED_H;
  const lo = Math.floor(xs.length * 0.1), hi = Math.ceil(xs.length * 0.9);
  const core = xs.slice(lo, hi);
  const mean = core.reduce((a, b) => a + b, 0) / core.length;
  return Math.min(9, Math.max(6.5, mean));
}

/** Dívida (h) ao acordar em `day`: 14 dias, recentes pesam mais. */
export function sleepDebt(nights: SleepNight[], need: number, day: string): number | null {
  const w = nights.filter((n) => n.sleep_h != null && n.date <= day && daysBetween(n.date, day) < 14);
  if (w.length < 5) return null;
  let debt = 0;
  for (const n of w) debt += 0.5 ** (daysBetween(n.date, day) / 7) * (need - total(n));
  return Math.max(0, debt);
}

export function debtLevel(debt: number | null) {
  if (debt == null) return null;
  if (debt < 1 / 6) return { key: 'nenhuma', label: 'nenhuma' };
  if (debt < 2) return { key: 'baixa', label: 'baixa' };
  if (debt <= 5) return { key: 'moderada', label: 'moderada' };
  return { key: 'alta', label: 'alta' };
}

/**
 * Meta da próxima noite (dinâmica): base pela sua resposta de HRV
 * + carga (Forma "em bloco de treino" ou "muito cansado": +30 min; nessas semanas seu HRV rende mais com 8–8,5 h)
 * + dívida (¼ da dívida, até +30 min) + treino do dia (Strain acima de 100, até +30 min) − cochilo de hoje.
 * Os acréscimos somam no máximo +1 h.
 */
export function sleepNeedTonight(need: number, debt: number | null, strainToday: number | null, napToday: number | null, heavyLoad = false) {
  let fromLoad = heavyLoad ? 0.5 : 0;
  let fromDebt = Math.min(0.5, (debt ?? 0) / 4);
  let fromStrain = Math.min(0.5, Math.max(0, ((strainToday ?? 0) - 25) / 100)); // Strain v3 (escala Strava): +30 min a partir de ~75
  const add = fromLoad + fromDebt + fromStrain;
  if (add > 1) { const k = 1 / add; fromLoad *= k; fromDebt *= k; fromStrain *= k; }
  const nap = Math.min(napToday ?? 0, need);
  return { total: Math.max(0, need + fromLoad + fromDebt + fromStrain - nap), base: need, fromLoad, fromDebt, fromStrain, nap };
}

/**
 * Base de sono pela SUA resposta (refeita todo mês): a partir de quantas horas o HRV da noite chega ao seu platô.
 * - HRV de cada noite contra a sua base dos 60 dias anteriores (em %, escala log); últimas 180 noites;
 * - platô = HRV médio das noites com 7 h 30 ou mais;
 * - para cada duração t (6 h 30 a 8 h 30, de 15 em 15 min): HRV médio das noites entre t − 30 min e t + 30 min;
 * - base = menor t cujo HRV médio fica a até 1,5 ponto do platô; limitada entre 7 h e 8 h 30.
 * Testado em janelas de 180 dias terminando em jul–nov/2026: estável (7 h 30 desde out/2026).
 * Com menos de 90 noites (ou 30 noites ≥ 7 h 30), fica 7 h 30.
 */
export function responseNeed(rows: { date: string; hrv: number | null; sleep_h: number | null }[]) {
  const ln = rows.map((r) => (r.hrv && r.hrv > 0 ? Math.log(r.hrv) : null));
  const pts: { s: number; h: number }[] = [];
  rows.forEach((r, i) => {
    if (ln[i] == null || r.sleep_h == null || r.sleep_h < 4 || r.sleep_h > 10.5) return;
    const prev = ln.slice(Math.max(0, i - 60), i).filter((v): v is number => v != null);
    if (prev.length < 30) return;
    const base = prev.reduce((a, b) => a + b, 0) / prev.length;
    pts.push({ s: r.sleep_h, h: (Math.exp((ln[i] as number) - base) - 1) * 100 });
  });
  const recent = pts.slice(-180);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const r1 = (x: number | null) => (x == null ? null : Math.round(x * 10) / 10);
  const below7 = r1(avg(recent.filter((p) => p.s < 7).map((p) => p.h))), above7 = r1(avg(recent.filter((p) => p.s >= 7).map((p) => p.h)));
  const long = recent.filter((p) => p.s >= 7.5).map((p) => p.h);
  if (recent.length < 90 || long.length < 30) return { hours: 7.5, n: recent.length, fallback: true, below7, above7 };
  const plateau = avg(long) as number;
  let hours = 8.5;
  for (let t = 6.5; t <= 8.5 + 1e-9; t += 0.25) {
    const w = recent.filter((p) => p.s >= t - 0.5 && p.s < t + 0.5).map((p) => p.h);
    if (w.length >= 8 && (avg(w) as number) >= plateau - 1.5) { hours = t; break; }
  }
  return { hours: Math.min(8.5, Math.max(7, Math.round(hours * 4) / 4)), n: recent.length, fallback: false, below7, above7 };
}

/** Minutos desde o meio-dia (para média de horários que cruzam a meia-noite). */
const minsFromNoon = (stamp: string) => {
  const h = Number(stamp.slice(11, 13)), m = Number(stamp.slice(14, 16));
  return ((h - 12 + 24) % 24) * 60 + m;
};
const toClock = (mFromNoon: number) => {
  const t = Math.round(mFromNoon + 12 * 60) % (24 * 60);
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};
const meanSd = (xs: number[]) => {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return { mean: m, sd: Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1)) };
};

/** Horário médio de deitar/acordar e variação (±min) nas últimas 14 noites. */
export function regularity(nights: SleepNight[]) {
  const w = nights.slice(-14).filter((n) => n.sleep_start && n.sleep_end);
  if (w.length < 5) return null;
  const bed = meanSd(w.map((n) => minsFromNoon(n.sleep_start as string)));
  const wake = meanSd(w.map((n) => minsFromNoon(n.sleep_end as string)));
  return { nights: w.length, bedtime: toClock(bed.mean), bedSd: Math.round(bed.sd), wake: toClock(wake.mean), wakeSd: Math.round(wake.sd) };
}

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
const isWeekend = (d: string) => { const w = new Date(d + 'T12:00:00Z').getUTCDay(); return w === 0 || w === 6; };

/**
 * Horário para deitar (C1): acordar típico − meta da noite − tempo acordado na cama − 15 min para pegar no sono.
 * Acordar típico = mediana das últimas 28 noites do mesmo tipo de dia (útil × fim de semana) do dia em que vai acordar;
 * tempo acordado = mediana de (janela do sono − horas dormidas) nas últimas 14 noites.
 */
export function bedtimeTarget(nights: SleepNight[], tonightH: number, wakeDay: string) {
  const withT = nights.filter((n) => n.sleep_start && n.sleep_end && n.sleep_h != null);
  if (withT.length < 5) return null;
  const same = withT.slice(-28).filter((n) => isWeekend(n.date) === isWeekend(wakeDay));
  const pool = same.length >= 4 ? same : withT.slice(-14);
  const wake = median(pool.map((n) => minsFromNoon(n.sleep_end as string)));
  const awake = median(withT.slice(-14).map((n) => {
    const win = (Date.parse((n.sleep_end as string).replace(' ', 'T') + 'Z') - Date.parse((n.sleep_start as string).replace(' ', 'T') + 'Z')) / 60000;
    return Math.max(0, Math.min(90, win - (n.sleep_h as number) * 60));
  }));
  const bed = wake - tonightH * 60 - awake - 15;
  return { bedtime: toClock(bed), wake: toClock(wake), awakeMin: Math.round(awake), latencyMin: 15, weekend: isWeekend(wakeDay) };
}

/** Nota de regularidade 0–100 (C2): 100 − 1,2 × média do desvio-padrão de deitar e acordar (min), 14 noites. */
export function regularityScore(r: { bedSd: number; wakeSd: number } | null) {
  if (!r) return null;
  return Math.max(0, Math.min(100, Math.round(100 - 1.2 * ((r.bedSd + r.wakeSd) / 2))));
}

/** Noites irregulares: deitar ou acordar > 60 min longe da mediana das 14 noites anteriores. */
export function irregularNights(nights: SleepNight[]) {
  const t = nights.filter((n) => n.sleep_start && n.sleep_end);
  const out: { date: string; irregular: boolean }[] = [];
  t.forEach((n, i) => {
    const prev = t.slice(Math.max(0, i - 14), i);
    if (prev.length < 7) return;
    const mb = median(prev.map((x) => minsFromNoon(x.sleep_start as string)));
    const mw = median(prev.map((x) => minsFromNoon(x.sleep_end as string)));
    const db = Math.abs(minsFromNoon(n.sleep_start as string) - mb), dw = Math.abs(minsFromNoon(n.sleep_end as string) - mw);
    out.push({ date: n.date, irregular: db > 60 || dw > 60 });
  });
  return out;
}
