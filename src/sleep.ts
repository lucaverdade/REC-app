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

/** Necessidade para a próxima noite. */
export function sleepNeedTonight(need: number, debt: number | null, strainToday: number | null, napToday: number | null) {
  const fromDebt = Math.min(0.5, (debt ?? 0) / 4);
  const fromStrain = Math.min(0.5, Math.max(0, ((strainToday ?? 0) - 100) / 400));
  const nap = Math.min(napToday ?? 0, need);
  return { total: Math.max(0, need + fromDebt + fromStrain - nap), base: need, fromDebt, fromStrain, nap };
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
