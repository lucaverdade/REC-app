// Sono: dívida, necessidade do dia e regularidade de horários.
//
// Regras do app (provisórias, revisar quando houver notas matinais suficientes — ver Estudo_Metrica_Recovery.md §8):
// - Base: 7,5 h por noite (a mesma necessidade usada no REC).
// - Dívida (7 noites) = Σ (7,5 h − sono da noite − cochilo do dia anterior), com sono acima da base
//   pagando a dívida e o total nunca abaixo de zero. Cochilos contam (como no Whoop); o REC não usa cochilos.
// - Necessidade de hoje = 7,5 h + ¼ da dívida (máx. +1 h) + carga de ontem (Strain acima de 100 soma até +30 min).
//   O Whoop também soma dívida e esforço do dia à necessidade; os pesos dele não são públicos.
// - Regularidade: desvio-padrão (min) dos horários de deitar e de acordar nas últimas 14 noites.

export const BASE_NEED_H = 7.5;

export interface SleepNight { date: string; sleep_h: number | null; nap_h?: number | null; sleep_start?: string | null; sleep_end?: string | null }

/** Dívida de sono (h) ao acordar no último dia da lista (usa as 7 noites mais recentes). */
export function sleepDebt(nights: SleepNight[]): number | null {
  const last7 = nights.slice(-7).filter((n) => n.sleep_h != null);
  if (last7.length < 4) return null;
  let debt = 0;
  for (const n of last7) {
    const got = Math.min(n.sleep_h as number, 9.5) + (n.nap_h ?? 0);
    debt = Math.max(0, debt + (BASE_NEED_H - got));
  }
  return debt;
}

/** Necessidade de sono para a próxima noite. */
export function sleepNeed(debt: number | null, strainToday: number | null) {
  const fromDebt = Math.min(1, (debt ?? 0) / 4);
  const fromStrain = Math.min(0.5, Math.max(0, ((strainToday ?? 0) - 100) / 400));
  return { total: BASE_NEED_H + fromDebt + fromStrain, base: BASE_NEED_H, fromDebt, fromStrain };
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
  return {
    nights: w.length,
    bedtime: toClock(bed.mean), bedSd: Math.round(bed.sd),
    wake: toClock(wake.mean), wakeSd: Math.round(wake.sd),
  };
}
