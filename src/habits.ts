// Diário de hábitos (E1) e impacto no REC (E2).
// Marca-se à noite, no dia do hábito; o efeito é lido no REC da manhã seguinte.
export const HABITS = [
  { key: 'alcool', label: 'Álcool' },
  { key: 'cafeina', label: 'Cafeína depois das 16 h' },
  { key: 'jantar', label: 'Jantar tarde' },
  { key: 'tela', label: 'Tela tarde' },
  { key: 'calor', label: 'Calor' },
  { key: 'viagem', label: 'Viagem' },
  { key: 'estresse', label: 'Estresse alto' },
  { key: 'doente', label: 'Doente' },
] as const;
export const HABIT_KEYS = new Set<string>(HABITS.map((h) => h.key));
export const MIN_DAYS = 5;

const mean = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
const r1 = (x: number | null) => (x == null ? null : Math.round(x * 10) / 10);

export interface ImpactRow { key: string; label: string; with: { n: number; avg: number | null }; without: { n: number; avg: number | null }; diff: number | null; ready: boolean; auto?: boolean }

/** Compara o REC "com" × "sem" a partir de pares (dia → REC lido). */
export function impact(key: string, label: string, pairs: { flag: boolean; rec: number | null }[], auto = false): ImpactRow {
  const w = pairs.filter((p) => p.flag && p.rec != null).map((p) => p.rec as number);
  const wo = pairs.filter((p) => !p.flag && p.rec != null).map((p) => p.rec as number);
  const aw = mean(w), awo = mean(wo);
  return {
    key, label, auto,
    with: { n: w.length, avg: r1(aw) }, without: { n: wo.length, avg: r1(awo) },
    diff: aw != null && awo != null ? Math.round(aw - awo) : null,
    ready: w.length >= MIN_DAYS && wo.length >= MIN_DAYS,
  };
}
