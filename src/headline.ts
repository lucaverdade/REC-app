// Frase do dia (05/11, v2): título + porquê, com variações. Substitui o quadro fixo REC × Forma.
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
const hm = (h: number) => { const m = Math.round(h * 60); return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`; };

type Band = 'muito_baixa' | 'baixa' | 'media' | 'boa' | 'alta';
type Sit = 'chave' | 'treino' | 'folga' | 'sem_plano';
const band = (v: number): Band => (v <= 20 ? 'muito_baixa' : v <= 40 ? 'baixa' : v <= 60 ? 'media' : v <= 80 ? 'boa' : 'alta');

const TITLES: Record<Band, Record<Sit, string[]>> = {
  alta: {
    chave: ['Dia certo para a sessão-chave.', 'Pronto para o treino forte de hoje.', 'Corpo pronto: a sessão-chave cai num bom dia.'],
    treino: ['Dia para treinar forte.', 'Pronto para render hoje.', 'Corpo pronto para carga.'],
    folga: ['Pronto, mas hoje é folga no plano.', 'Bem recuperado num dia de folga.', 'Folga com o corpo descansado.'],
    sem_plano: ['Dia para treinar forte.', 'Corpo pronto para carga.'],
  },
  boa: {
    chave: ['Bom dia para a sessão-chave.', 'Dá para fazer a sessão-chave como planejada.', 'Corpo em ordem para o treino forte.'],
    treino: ['Treino como planejado.', 'Dia bom de treino.', 'Corpo em ordem para o plano de hoje.'],
    folga: ['Folga no plano; o corpo está em ordem.', 'Dia de folga com a recuperação em dia.'],
    sem_plano: ['Dia bom de treino.', 'Treino normal, com espaço para um pouco mais.'],
  },
  media: {
    chave: ['Sessão-chave possível, segurando o começo.', 'Sessão-chave possível, sem forçar além do plano.', 'Faça a chave, mas sem extras.'],
    treino: ['Treino normal, sem extra.', 'Dia de treino moderado.', 'Plano de hoje sem acrescentar volume.'],
    folga: ['Folga em boa hora.', 'Dia de folga ajuda a subir a Prontidão.'],
    sem_plano: ['Treino moderado hoje.', 'Dia de treino normal, sem extra.'],
  },
  baixa: {
    chave: ['Sessão-chave arriscada hoje.', 'Prontidão baixa para a sessão-chave.', 'Vale mover a sessão-chave se der.'],
    treino: ['Treino leve hoje.', 'Dia de ir mais devagar.', 'Treino só na parte leve do plano.'],
    folga: ['Folga em boa hora.', 'Dia de folga bem-vindo.'],
    sem_plano: ['Treino leve hoje.', 'Dia de tirar o pé.'],
  },
  muito_baixa: {
    chave: ['Prontidão muito baixa para a sessão-chave.', 'Hoje não é dia de sessão-chave.'],
    treino: ['Foco em recuperação hoje.', 'Corpo pedindo um dia leve ou folga.', 'Dia de recuperar.'],
    folga: ['Folga no dia certo.', 'Folga necessária hoje.'],
    sem_plano: ['Foco em recuperação hoje.', 'Dia de recuperar.'],
  },
};

// porquê: a parte que mais pesou (negativa) ou mais ajudou (positiva)
function reason(p: HeadlineIn['parts'][number], i: HeadlineIn, seed: string): string | null {
  const neg = (p.z ?? 0) < 0;
  if (p.key === 'corpo') {
    if (i.rec == null) return null;
    return neg ? pick([`O corpo acordou abaixo do normal (REC ${i.rec}).`, `REC ${i.rec}: HRV, FC de repouso ou sono fora da sua base.`], seed)
      : pick([`O corpo acordou bem (REC ${i.rec}).`, `REC ${i.rec}: sinais da noite acima da sua base.`], seed);
  }
  if (p.key === 'carga') {
    const m = /^([\d,]+)×/.exec(p.detail), x = m ? m[1] : null;
    return neg ? (x ? pick([`Semana pesada: carga de 7 dias em ${x}× a média de 4 semanas.`, `Últimos 7 dias acima do seu normal (${x}× a média de 4 semanas).`], seed) : 'Últimos 7 dias acima do seu normal.')
      : (x ? pick([`Semana mais leve: ${x}× a média de 4 semanas.`, `Últimos 7 dias abaixo do seu normal (${x}× a média de 4 semanas).`], seed) : 'Semana mais leve que o normal.');
  }
  if (p.key === 'ontem') {
    if (/descanso/.test(p.detail)) return neg ? null : pick(['Ontem foi descanso.', 'Vem de um dia de descanso.'], seed);
    const m = /Strain (\d+); seu treino típico é (\d+)/.exec(p.detail);
    return neg ? (m ? `Ontem foi pesado: Strain ${m[1]} (seu típico é ${m[2]}).` : 'Ontem foi pesado.') : (m ? (+m[1] < 15 ? `Ontem quase sem treino (Strain ${m[1]}).` : `Ontem foi leve: Strain ${m[1]}.`) : null);
  }
  if (p.key === 'sono') {
    if (neg && i.debtH != null && i.debtH >= 1 / 6) return pick([`Dívida de sono de ${hm(i.debtH)} em 14 dias.`, `Sono atrasado: ${hm(i.debtH)} de dívida nas duas últimas semanas.`], seed);
    return neg ? 'Sono acumulado abaixo do seu normal.' : pick(['Sono em dia nas últimas duas semanas.', 'Sem dívida de sono acumulada.'], seed);
  }
  return null;
}

export function dayHeadline(i: HeadlineIn): { title: string; why: string[] } | null {
  const seed = i.date;
  // casos especiais
  if (i.raceDays === 0) return { title: 'Dia de prova.', why: [i.ready != null ? `Prontidão ${Math.round(i.ready)}%.` : 'Bora, Aracaju.'] };
  if (i.raceDays === 1) return { title: 'Véspera da prova.', why: [i.sleepBase ? `Meta de sono hoje: a sua base de ${hm(i.sleepBase)} ou mais.` : 'Noite de sono é a prioridade.'].filter(Boolean) };
  if (i.illness) return { title: pick(['Sinais de que o corpo está brigando com algo.', 'Padrão de início de doença nos seus sinais.'], seed), why: [] }; // o alerta logo abaixo já diz quais sinais
  const v = i.ready ?? null;
  if (v == null) return i.rec == null ? null : { title: 'Prontidão ainda incompleta.', why: [`REC ${i.rec}.`] };

  const key = i.planned.some((p) => p.chave), hasPlan = i.planned.length > 0;
  const planStrain = i.planned.reduce((a, p) => a + (p.strain ?? 0), 0);
  const sit: Sit = key ? 'chave' : hasPlan ? 'treino' : i.hasWeekPlan ? 'folga' : 'sem_plano';
  const title = pick(TITLES[band(v)][sit], seed + sit);

  const why: string[] = [];
  const parts = i.parts.filter((p) => p.z != null);
  const worst = [...parts].sort((a, b) => (a.z as number) - (b.z as number))[0];
  const best = [...parts].sort((a, b) => (b.z as number) - (a.z as number))[0];
  // nas faixas baixas explica o que pesou; nas altas, o que ajudou; no meio, o que mais destoou
  const main = v <= 40 ? worst : v > 60 ? best : (Math.abs(worst?.z ?? 0) >= Math.abs(best?.z ?? 0) ? worst : best);
  if (main && Math.abs(main.z as number) >= 0.4) { const r = reason(main, i, seed + 'r'); if (r) why.push(r); }
  // segunda razão quando também pesa bastante (só para baixo)
  const second = parts.filter((p) => p !== main && (p.z as number) <= -1).sort((a, b) => (a.z as number) - (b.z as number))[0];
  if (second) { const r = reason(second, i, seed + 's'); if (r) why.push(r); }
  // no máximo 3 linhas: até 2 motivos, a direção do REC só se sobrar espaço, e a meta
  if (why.length < 2 && i.trend && i.trend.dir !== 'flat' && i.trend.days >= 2) why.push(i.trend.dir === 'up' ? `REC subindo há ${i.trend.days} dias.` : `REC caindo há ${i.trend.days} dias.`);
  if (i.target != null && sit !== 'folga') why.push(`Meta de Strain do dia: ${i.target}${planStrain ? ` (plano: ${planStrain})` : ''}.`);
  return { title, why };
}
