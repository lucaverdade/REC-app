// Carga de treino: Fitness, Fadiga, Forma (modelo de Banister, como TrainingPeaks/Strava) e Strain.
// Entrada: carga diária do Garmin (soma das atividades do dia, baseada em EPOC).
// Ver docs/Estudo_Carga_Treino.md.

export const FITNESS_DAYS = 42;
export const FATIGUE_DAYS = 7;

export interface PmcDay {
  date: string;
  load: number;     // carga do dia
  fitness: number;  // CTL: média ponderada de 42 dias
  fatigue: number;  // ATL: média ponderada de 7 dias
  form: number;     // TSB: fitness − fadiga de ONTEM (forma ao acordar, antes do treino do dia)
}

/** `daily` precisa ser contínuo (um item por dia, carga 0 em dia sem treino), em ordem. */
export function pmc(daily: { date: string; load: number }[]): PmcDay[] {
  let ctl = 0, atl = 0;
  return daily.map(({ date, load }) => {
    const form = ctl - atl;
    ctl += (load - ctl) / FITNESS_DAYS;
    atl += (load - atl) / FATIGUE_DAYS;
    return { date, load, fitness: ctl, fatigue: atl, form };
  });
}

/** Carga de um "dia pesado típico": percentil 95 dos dias com treino. */
export function hardDay(loads: number[]): number | null {
  const xs = loads.filter((x) => x > 0).sort((a, b) => a - b);
  if (xs.length < 20) return null;
  const pos = 0.95 * (xs.length - 1), lo = Math.floor(pos);
  return xs[lo] + (xs[Math.min(lo + 1, xs.length - 1)] - xs[lo]) * (pos - lo);
}

/** Strain: % de um dia pesado típico (100 = dia pesado; pode passar de 100). */
export const strain = (load: number, hard: number | null) => (hard ? Math.round((load / hard) * 100) : null);

/** Ritmo de subida: variação do Fitness em 7 dias, em % do Fitness de 7 dias atrás. */
export function ramp(days: PmcDay[]): { abs: number; pct: number } | null {
  if (days.length < 8) return null;
  const now = days[days.length - 1].fitness, before = days[days.length - 8].fitness;
  return { abs: now - before, pct: before > 0 ? ((now - before) / before) * 100 : 0 };
}

/** Razão aguda/crônica no estilo Garmin: soma de 7 dias ÷ média semanal de 28 dias. */
export function acwr(loads: number[]): number | null {
  if (loads.length < 28) return null;
  const s7 = loads.slice(-7).reduce((a, b) => a + b, 0);
  const s28 = loads.slice(-28).reduce((a, b) => a + b, 0) / 4;
  return s28 > 0 ? s7 / s28 : null;
}
