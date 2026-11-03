// Meta de Strain do dia v2: usa o dia, a semana e a tendência (03/11).
//
// 1) Base = Fitness (seu Strain médio por dia nas últimas 6 semanas).
// 2) Recuperação: REC de hoje (verde 1,4 · amarelo 1,0 · vermelho 0,5)
//    × resposta dos últimos 7 dias (bem 1,1 · normal 1,0 · um pouco abaixo 0,9 · abaixo 0,8 · não recuperando 0,65).
// 3) Carga recente: Forma muito cansado 0,75 / descansado 1,15; Fadiga subiu ≥ 15% em 3 dias 0,9;
//    razão aguda/crônica > 1,3 → 0,85, < 0,8 → 1,1; ontem pesado (≥ 1,8 × Fitness) → 0,85.
// 4) Semana: teto da faixa semanal (1,3 × média das 3 semanas anteriores) − o que já foi feito na semana.
//    O que sobra é dividido pelos dias que faltam (com folga de 1,8× para dias fortes) e limita a meta.
// O plano do treinador não muda a meta; o app só compara (sessão acima ou abaixo da meta).

export interface TargetIn {
  fitness: number | null;
  fatigueNow: number | null; fatigue3dAgo: number | null;
  acwr: number | null;
  recToday: number | null;
  verdictLevel: string | null;     // bom | normal | atencao | abaixo | ruim
  zoneKey: string | null;          // faixa da Forma
  weekHi: number | null;           // teto da faixa semanal
  weekDoneBefore: number;          // Strain da semana até ontem
  daysLeft: number;                // dias que faltam na semana, contando hoje (1–7)
  yesterdayStrain: number | null;
  plannedToday: number | null;
}

export interface Factor { k: string; label: string; f: number }

const VERDICT_F: Record<string, number> = { bom: 1.1, normal: 1.0, atencao: 0.9, abaixo: 0.8, ruim: 0.65 };

export function strainTargetV2(i: TargetIn) {
  if (!i.fitness || i.recToday == null) return null;
  const factors: Factor[] = [];
  const add = (k: string, label: string, f: number) => { if (Math.abs(f - 1) > 0.001) factors.push({ k, label, f }); };

  const recF = i.recToday <= 33 ? 0.5 : i.recToday <= 66 ? 1.0 : 1.4;
  add('rec', i.recToday <= 33 ? 'REC vermelho hoje' : i.recToday <= 66 ? 'REC amarelo hoje' : 'REC verde hoje', recF);
  if (i.verdictLevel && VERDICT_F[i.verdictLevel] != null)
    add('rec7', { bom: 'Recuperação da semana boa', normal: '', atencao: 'Recuperação da semana um pouco abaixo', abaixo: 'Recuperação da semana abaixo', ruim: 'Semana sem recuperar' }[i.verdictLevel] ?? '', VERDICT_F[i.verdictLevel]);
  if (i.zoneKey === 'risco') add('forma', 'Forma: muito cansado', 0.75);
  if (i.zoneKey === 'descansado' || i.zoneKey === 'perdendo') add('forma', 'Forma: descansado', 1.15);
  if (i.fatigueNow != null && i.fatigue3dAgo && i.fatigueNow >= i.fatigue3dAgo * 1.15) add('fad', 'Fadiga subiu nos últimos 3 dias', 0.9);
  if (i.acwr != null && i.acwr > 1.3) add('acwr', 'Carga da semana acima do costume', 0.85);
  if (i.acwr != null && i.acwr < 0.8) add('acwr', 'Carga da semana abaixo do costume', 1.1);
  if (i.yesterdayStrain != null && i.yesterdayStrain >= 1.8 * i.fitness) add('ontem', 'Ontem foi pesado', 0.85);

  const raw = i.fitness * factors.reduce((a, x) => a * x.f, 1);

  // limite da semana
  let weekRoom: number | null = null, weekCap: number | null = null;
  if (i.weekHi) {
    weekRoom = Math.max(0, i.weekHi - i.weekDoneBefore);
    weekCap = (weekRoom / Math.max(1, i.daysLeft)) * 1.8;
  }
  let target = raw, limitedByWeek = false;
  if (weekCap != null && weekCap < raw) { target = Math.max(weekCap, i.fitness * 0.3); limitedByWeek = true; }
  target = Math.round(target);

  const plan = i.plannedToday;
  const planNote = plan == null ? null : plan > target * 1.2 ? 'acima' : plan < target * 0.6 ? 'abaixo' : 'dentro';

  return {
    target, base: Math.round(i.fitness), raw: Math.round(raw),
    factors: factors.filter((x) => x.label).map((x) => ({ ...x, f: Math.round(x.f * 100) / 100 })),
    week: i.weekHi ? { hi: Math.round(i.weekHi), doneBefore: Math.round(i.weekDoneBefore), room: Math.round(weekRoom!), daysLeft: i.daysLeft, limited: limitedByWeek } : null,
    plan, planNote,
  };
}
