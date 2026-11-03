// Strain (carga do treino), Fitness, Fadiga e Forma.
//
// Strain = TRIMP de Edwards: minutos em cada zona de FC do Garmin × peso da zona (Z1 = 1 … Z5 = 5),
// mais 0,5 por minuto abaixo da Z1 (rodagem regenerativa, academia), para não zerar treino leve.
// Cresce com a duração e com a intensidade. Substituiu a carga do Garmin (EPOC), que quase não cresce
// com a duração em Z2: a bike de 2 h 50 de 01/11 dava 127 no Garmin e 344 por zonas; um Hyrox de 41 min,
// 242 no Garmin e 118 por zonas.
//
// Fitness/Fadiga/Forma: modelo de Banister como no TrainingPeaks (42 e 7 dias).
// Forma em % do Fitness (como o intervals.icu), com faixas de Joe Friel.
// Ver docs/Estudo_Carga_Treino.md.

export const FITNESS_DAYS = 42;
export const FATIGUE_DAYS = 7;
export const ZONE_WEIGHTS = [1, 2, 3, 4, 5];

/** Strain de uma atividade a partir dos minutos por zona. null se o relógio não registrou zonas. */
export function strainOf(zoneMinutes: (number | null | undefined)[], totalMin: number | null = null): number | null {
  if (zoneMinutes.every((m) => m == null)) return null;
  const inZones = zoneMinutes.reduce<number>((a, m) => a + (m ?? 0), 0);
  const below = Math.max(0, (totalMin ?? 0) - inZones);
  return 0.5 * below + zoneMinutes.reduce<number>((acc, m, i) => acc + (m ?? 0) * ZONE_WEIGHTS[i], 0);
}

export interface PmcDay {
  date: string;
  load: number;     // Strain do dia (soma das atividades)
  fitness: number;  // média ponderada de 42 dias
  fatigue: number;  // média ponderada de 7 dias
  form: number;     // fitness − fadiga de ONTEM (como você acorda, antes do treino do dia)
  formPct: number | null; // forma ÷ fitness de ontem × 100
}

/** `daily` contínuo (um item por dia, 0 sem treino), em ordem. */
export function pmc(daily: { date: string; load: number }[]): PmcDay[] {
  let ctl = 0, atl = 0;
  return daily.map(({ date, load }) => {
    const form = ctl - atl;
    const formPct = ctl > 1 ? (form / ctl) * 100 : null;
    ctl += (load - ctl) / FITNESS_DAYS;
    atl += (load - atl) / FATIGUE_DAYS;
    return { date, load, fitness: ctl, fatigue: atl, form, formPct };
  });
}

/** Faixas da Forma em % do Fitness (Joe Friel, adaptadas pelo intervals.icu). */
export const FORM_ZONES = [
  { max: -30, key: 'risco', label: 'Risco alto' },
  { max: -10, key: 'produtivo', label: 'Treino produtivo' },
  { max: 5, key: 'neutro', label: 'Neutro' },
  { max: 20, key: 'descansado', label: 'Descansado' },
  { max: Infinity, key: 'perdendo', label: 'Perdendo forma' },
] as const;

export function formZone(pct: number | null) {
  if (pct == null) return null;
  return FORM_ZONES.find((z) => pct < z.max) ?? FORM_ZONES[FORM_ZONES.length - 1];
}

/** Razão aguda/crônica: soma de 7 dias ÷ média semanal de 28 dias. */
export function acwr(loads: number[]): number | null {
  if (loads.length < 28) return null;
  const s7 = loads.slice(-7).reduce((a, b) => a + b, 0);
  const s28 = loads.slice(-28).reduce((a, b) => a + b, 0) / 4;
  return s28 > 0 ? s7 / s28 : null;
}
