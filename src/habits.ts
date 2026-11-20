// Diário de hábitos (E1) e impacto no REC (E2).
// Marca-se à noite, no dia do hábito; o efeito é lido no REC da manhã seguinte.
// group 'dia': o que aconteceu no dia (marca no próprio dia). group 'cuidado' (20/11): o que fez pela recuperação no dia. group 'noite': como foi a noite (marca na manhã seguinte,
// na tela do dia em que acordou; fica gravado no dia anterior, porque a noite pertence a ele e o efeito é no REC desta manhã).
export const HABITS = [
  { key: 'alcool', label: 'Álcool', group: 'dia' },
  { key: 'cafeina', label: 'Cafeína depois das 16 h', group: 'dia' },
  { key: 'jantar', label: 'Jantar tarde', group: 'dia' },
  { key: 'jantar_pesado', label: 'Jantar pesado', group: 'dia' },
  { key: 'liquido', label: 'Muito líquido à noite', group: 'dia' },
  { key: 'tela', label: 'Celular até tarde', group: 'dia' },
  { key: 'treino_noite', label: 'Treino à noite', group: 'dia' },
  { key: 'cochilo', label: 'Cochilo longo', group: 'dia' },
  { key: 'estresse', label: 'Estresse alto', group: 'dia' },
  { key: 'viagem', label: 'Viagem', group: 'dia' },
  { key: 'calor', label: 'Calor', group: 'dia' },
  { key: 'doente', label: 'Doente', group: 'dia' },
  { key: 'trabalho_longo', label: 'Dia longo de trabalho', group: 'dia' },
  { key: 'sentado', label: 'Muito tempo sentado', group: 'dia' },
  { key: 'pouca_agua', label: 'Bebi pouca água', group: 'dia' },
  { key: 'comi_pouco', label: 'Comi pouco', group: 'dia' },
  { key: 'doce', label: 'Muito doce', group: 'dia' },
  { key: 'saida', label: 'Saí à noite', group: 'dia' },
  { key: 'dor', label: 'Dor muscular', group: 'dia' },
  { key: 'remedio', label: 'Tomei remédio', group: 'dia' },
  { key: 'alongamento', label: 'Alongamento ou mobilidade', group: 'cuidado' },
  { key: 'massagem', label: 'Massagem ou liberação', group: 'cuidado' },
  { key: 'banho_gelado', label: 'Banho gelado', group: 'cuidado' },
  { key: 'sauna', label: 'Sauna ou banho quente', group: 'cuidado' },
  { key: 'respiracao', label: 'Respiração ou meditação', group: 'cuidado' },
  { key: 'cochilo_curto', label: 'Cochilo curto', group: 'cuidado' },
  { key: 'sol_manha', label: 'Sol de manhã', group: 'cuidado' },
  { key: 'sem_tela', label: 'Sem tela antes de dormir', group: 'cuidado' },
  { key: 'demorei', label: 'Demorei para pegar no sono', group: 'noite' },
  { key: 'xixi', label: 'Acordei para fazer xixi', group: 'noite' },
  { key: 'acordei', label: 'Acordei várias vezes', group: 'noite' },
  { key: 'barulho', label: 'Barulho ou luz', group: 'noite' },
  { key: 'quarto_quente', label: 'Quarto quente', group: 'noite' },
  { key: 'fora', label: 'Dormi fora de casa', group: 'noite' },
  { key: 'despertador', label: 'Despertador cedo', group: 'noite' },
  { key: 'dormi_tarde', label: 'Dormi tarde', group: 'noite' },
  { key: 'acordei_cedo', label: 'Acordei antes da hora', group: 'noite' },
  { key: 'sono_agitado', label: 'Sono agitado ou sonhos', group: 'noite' },
  { key: 'sede', label: 'Acordei com sede', group: 'noite' },
  { key: 'dor_noite', label: 'Dor ou desconforto', group: 'noite' },
  { key: 'quarto_frio', label: 'Quarto frio', group: 'noite' },
  { key: 'dormi_bem', label: 'Dormi direto', group: 'noite' },
] as const;
export const NIGHT_KEYS = new Set<string>(HABITS.filter((h) => h.group === 'noite').map((h) => h.key));
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
