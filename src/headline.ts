// Frase do dia (05/11, v3): título curto + uma linha de porquê sem números, com variações. Substitui o quadro fixo REC × Forma.
// Título: faixa da Prontidão × situação do dia (sessão-chave, treino normal, folga, sem plano), com 2–3 versões que
// alternam pela data (o mesmo dia sempre mostra a mesma frase). Porquê: a parte da Prontidão que mais puxou, a direção
// do REC e a meta de Strain. Casos especiais têm prioridade: prova, véspera, sinais de doença, noite que não chegou.
// Só fatos e a direção do treino; nada de conselho genérico.

export interface HeadlineIn {
  date: string;
  ready: number | null;
  rec: number | null;
  parts: { key: 'corpo' | 'carga' | 'ontem' | 'sono'; z: number | null; detail: string }[];
  trend: { dir: string; days: number } | null;
  planned: { strain: number | null; chave?: boolean; label: string }[];
  target: number | null;
  sleepH: number | null;
  sleepBase: number | null;
  debtH: number | null;
  raceDays: number;
  illness: boolean;
  hasWeekPlan: boolean; // existe plano para a semana (sem sessão hoje = folga)
}

const pick = <T>(xs: T[], seed: string) => { let h = 0; for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0; return xs[h % xs.length]; };

type Band = 'muito_baixa' | 'baixa' | 'media' | 'boa' | 'alta';
type Sit = 'chave' | 'treino' | 'folga' | 'sem_plano';
const band = (v: number): Band => (v <= 20 ? 'muito_baixa' : v <= 40 ? 'baixa' : v <= 60 ? 'media' : v <= 80 ? 'boa' : 'alta');

const TITLES: Record<Band, Record<Sit, string[]>> = {
  alta: {
    chave: ['Dia certo para o treino-chave.', 'Pode ir forte no treino-chave.', 'Pronto para o forte.'],
    treino: ['Dia de treinar forte.', 'Pode ir forte hoje.', 'Corpo pronto.'],
    folga: ['Folga com gás sobrando.', 'Descansado, e hoje é folga.'],
    sem_plano: ['Dia de treinar forte.', 'Pode ir forte hoje.'],
  },
  boa: {
    chave: ['Bom dia para o treino-chave.', 'Treino-chave liberado.', 'Treino-chave como planejado.'],
    treino: ['Siga o plano.', 'Bom dia de treino.', 'Treino como planejado.'],
    folga: ['Folga tranquila.', 'Folga com o corpo em ordem.'],
    sem_plano: ['Bom dia de treino.', 'Dá para treinar bem.'],
  },
  media: {
    chave: ['Treino-chave, sem forçar.', 'Treino-chave no controle.', 'Treino-chave, sem extras.'],
    treino: ['Treino normal, sem extra.', 'Dia moderado.', 'Só o plano, nada a mais.'],
    folga: ['Folga em boa hora.', 'Boa hora para folgar.'],
    sem_plano: ['Dia moderado.', 'Treino normal, sem extra.'],
  },
  baixa: {
    chave: ['Treino-chave arriscado hoje.', 'Melhor adiar o treino-chave.', 'Se der, mova o treino-chave.'],
    treino: ['Treino leve hoje.', 'Dia de tirar o pé.', 'Vá mais devagar hoje.'],
    folga: ['Folga em boa hora.', 'Folga bem-vinda.'],
    sem_plano: ['Treino leve hoje.', 'Dia de tirar o pé.'],
  },
  muito_baixa: {
    chave: ['Hoje não é dia de treino-chave.', 'Adie o treino-chave.'],
    treino: ['Dia de recuperar.', 'Leve ou folga.', 'Corpo pede descanso.'],
    folga: ['Folga no dia certo.', 'Folga necessária.'],
    sem_plano: ['Dia de recuperar.', 'Corpo pede descanso.'],
  },
};

// porquê em poucas palavras, sem números: um pedaço por parte da Prontidão
function bit(p: HeadlineIn['parts'][number], seed: string): string | null {
  const neg = (p.z ?? 0) < 0;
  if (p.key === 'corpo') return neg ? pick(['corpo abaixo do normal', 'noite abaixo do normal'], seed) : pick(['corpo descansado', 'noite boa'], seed);
  if (p.key === 'carga') return neg ? pick(['semana pesada', 'carga alta na semana'], seed) : pick(['semana leve', 'carga baixa na semana'], seed);
  if (p.key === 'ontem') return neg ? 'treino forte ontem' : /descanso/.test(p.detail) ? 'ontem foi descanso' : 'ontem foi leve';
  if (p.key === 'sono') return neg ? pick(['sono atrasado', 'sono em dívida'], seed) : 'sono em dia';
  return null;
}
const sentence = (xs: string[]) => { const t = xs.length > 1 ? `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}` : xs[0]; return t[0].toUpperCase() + t.slice(1) + '.'; };

export function dayHeadline(i: HeadlineIn): { title: string; why: string[] } | null {
  const seed = i.date;
  // casos especiais
  if (i.raceDays === 0) return { title: 'Dia de prova.', why: [] };
  if (i.raceDays === 1) return { title: 'Véspera da prova.', why: [] };
  if (i.illness) return { title: pick(['Corpo brigando com algo.', 'Sinais de doença.'], seed), why: [] }; // o alerta logo abaixo já diz quais sinais
  const v = i.ready ?? null;
  if (v == null) return i.rec == null ? null : { title: 'Dados de hoje incompletos.', why: [] };

  const key = i.planned.some((p) => p.chave), hasPlan = i.planned.length > 0;
  const sit: Sit = key ? 'chave' : hasPlan ? 'treino' : i.hasWeekPlan ? 'folga' : 'sem_plano';
  const title = pick(TITLES[band(v)][sit], seed + sit);

  // uma linha curta: o que mais puxou (para baixo nas faixas baixas, para cima nas altas) + mais um se também pesa
  const parts = i.parts.filter((p) => p.z != null);
  const worst = [...parts].sort((a, b) => (a.z as number) - (b.z as number))[0];
  const best = [...parts].sort((a, b) => (b.z as number) - (a.z as number))[0];
  const main = v <= 40 ? worst : v > 60 ? best : (Math.abs(worst?.z ?? 0) >= Math.abs(best?.z ?? 0) ? worst : best);
  const bits: string[] = [];
  if (main && Math.abs(main.z as number) >= 0.4) { const b = bit(main, seed + 'r'); if (b) bits.push(b); }
  const second = parts.filter((p) => p !== main && (p.z as number) <= -1 && (main?.z as number) < 0).sort((a, b) => (a.z as number) - (b.z as number))[0];
  if (second) { const b = bit(second, seed + 's'); if (b) bits.push(b); }
  if (bits.length < 2 && i.trend && i.trend.dir !== 'flat' && i.trend.days >= 3) bits.push(i.trend.dir === 'up' ? 'REC subindo' : 'REC em queda');
  const why = bits.length ? [sentence(bits)] : [];
  if (i.target != null && sit !== 'folga') why.push(`Meta de Strain: ${i.target}.`);
  return { title, why };
}
