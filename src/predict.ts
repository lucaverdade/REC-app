// Previsões de prova de corrida (5 km, 10 km, 21 km, 42 km).
//
// Regras copiadas do Strava (Performance Predictions): só corridas ao ar livre (sem esteira),
// janela móvel de 24 semanas, pelo menos 10 corridas válidas, peso maior para as recentes,
// cada distância calculada para percurso plano; atualiza a cada corrida.
// O modelo do Strava é fechado (aprendizado de máquina); aqui o motor é aberto:
//  1. cada corrida vira uma estimativa de VO2máx a partir do pace e da FC média
//     (custo de O2 de Daniels-Gilbert; %FC de reserva ≈ %VO2 de reserva, Swain);
//  2. média ponderada pela idade (meia-vida de 6 semanas) da metade melhor das estimativas;
//  3. tempo de prova pela curva de Daniels de % do VO2máx sustentável × duração;
//  4. fator de calibração por distância (opcional): previsão do Strava ÷ previsão do modelo num dia.

export interface Run { date: string; km: number; min: number; avghr: number }

export const DISTANCES = [
  { key: 'd5', label: '5 km', m: 5000 },
  { key: 'd10', label: '10 km', m: 10000 },
  { key: 'd21', label: '21 km', m: 21097.5 },
  { key: 'd42', label: '42 km', m: 42195 },
] as const;
export type DistKey = (typeof DISTANCES)[number]['key'];

const vo2Cost = (vMetersPerMin: number) => -4.6 + 0.182258 * vMetersPerMin + 0.000104 * vMetersPerMin ** 2;
const sustainable = (tMin: number) => 0.8 + 0.1894393 * Math.exp(-0.012778 * tMin) + 0.2989558 * Math.exp(-0.1932605 * tMin);

/** VO2máx estimado de uma corrida; null se a intensidade for baixa demais para ser informativa. */
export function vdotFromRun(r: Run, restHr: number, maxHr: number): number | null {
  const hrr = (r.avghr - restHr) / (maxHr - restHr);
  if (!(hrr >= 0.6 && hrr <= 1) || r.km < 2 || r.min <= 0) return null;
  const v = (r.km * 1000) / r.min;
  return 3.5 + (vo2Cost(v) - 3.5) / hrr;
}

/** Tempo (min) para a distância com esse VO2máx (busca binária). */
export function raceMinutes(vdot: number, meters: number): number {
  let lo = 5, hi = 600;
  for (let i = 0; i < 60; i++) {
    const t = (lo + hi) / 2;
    if (vo2Cost(meters / t) > vdot * sustainable(t)) lo = t; else hi = t;
  }
  return (lo + hi) / 2;
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400_000);

/** VO2máx efetivo no dia (janela de 24 semanas), ou null se houver poucas corridas. */
export function vdotOn(day: string, runs: { date: string; vdot: number }[]): { vdot: number; n: number } | null {
  const w = runs.filter((r) => r.date <= day && daysBetween(r.date, day) < 168);
  if (w.length < 10) return null;
  const sorted = [...w].map((r) => r.vdot).sort((a, b) => a - b);
  const med = sorted[Math.floor(sorted.length / 2)];
  const top = w.filter((r) => r.vdot >= med);
  let num = 0, den = 0;
  for (const r of top) { const wt = 0.5 ** (daysBetween(r.date, day) / 42); num += r.vdot * wt; den += wt; }
  return { vdot: num / den, n: w.length };
}

export function predictAll(vdot: number, factors: Partial<Record<DistKey, number>> = {}) {
  return Object.fromEntries(DISTANCES.map((d) => [d.key, raceMinutes(vdot, d.m) * (factors[d.key] ?? 1)])) as Record<DistKey, number>;
}
