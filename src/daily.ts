// Resumo do dia (REC × Forma), direção do REC e meta de Strain. Regras combinadas com o Luca em 03/11.

export type RecZone = 'verde' | 'amarelo' | 'vermelho';
export const recZone = (rec: number | null): RecZone | null => (rec == null ? null : rec <= 33 ? 'vermelho' : rec <= 66 ? 'amarelo' : 'verde');
type FormGroup = 'livre' | 'bloco' | 'cansado';
const formGroup = (zoneKey: string | null): FormGroup => (zoneKey === 'risco' ? 'cansado' : zoneKey === 'produtivo' ? 'bloco' : 'livre');

const PHRASES: Record<RecZone, Record<FormGroup, string>> = {
  verde: {
    livre: 'Dia para treinar forte.',
    bloco: 'Corpo respondendo ao bloco: dá para treinar como planejado.',
    cansado: 'Recuperado, mas a carga acumulada está alta: forte só na sessão-chave.',
  },
  amarelo: {
    livre: 'Dia de treino normal, sem extra.',
    bloco: 'Treino moderado; o forte fica para quando o REC subir.',
    cansado: 'Treino leve hoje.',
  },
  vermelho: {
    livre: 'Foco em recuperação hoje.',
    bloco: 'Foco em recuperação hoje.',
    cansado: 'Corpo e carga pedem descanso hoje.',
  },
};

export function dailySummary(rec: number | null, zoneKey: string | null) {
  const z = recZone(rec);
  return z ? PHRASES[z][formGroup(zoneKey)] : null;
}

/** Direção do REC: dias seguidos subindo/caindo até hoje (diferença mínima de 2 pontos). */
export function recTrend(week: { date: string; rec: number | null }[]) {
  const v = week.map((w) => w.rec);
  const n = v.length;
  if (n < 2 || v[n - 1] == null) return null;
  let up = 0, down = 0;
  for (let i = n - 1; i > 0 && v[i] != null && v[i - 1] != null; i--) {
    const d = (v[i] as number) - (v[i - 1] as number);
    if (d >= 2 && down === 0) up++; else if (d <= -2 && up === 0) down++; else break;
  }
  if (up >= 1) return { dir: 'up', days: up, txt: up === 1 ? 'REC subiu desde ontem' : `REC subindo há ${up} dias` };
  if (down >= 1) return { dir: 'down', days: down, txt: down === 1 ? 'REC caiu desde ontem' : `REC caindo há ${down} dias` };
  return { dir: 'flat', days: 0, txt: 'REC estável' };
}

/** Meta de Strain do dia: dia médio (Fitness) × fator do REC, ajustado pela Forma. */
export function strainTarget(rec: number | null, zoneKey: string | null, fitness: number | null) {
  const z = recZone(rec);
  if (!z || !fitness) return null;
  let f = z === 'verde' ? 1.5 : z === 'amarelo' ? 1.0 : 0.5;
  if (zoneKey === 'risco') f *= 0.75;
  if (zoneKey === 'descansado') f *= 1.25;
  return Math.round(fitness * f);
}
