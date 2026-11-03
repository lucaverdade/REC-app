// Resposta para "Meu corpo está recuperando?" — regras simples e transparentes, sem IA.
// Sinais (últimos 7 dias contra o normal dos 60 dias anteriores):
//  HRV:  média ≥ 5% abaixo da base, ou 3+ noites abaixo da faixa normal
//  FC:   média ≥ 2 bpm acima da base, ou 3+ dias acima da faixa normal
//  Sono: média < necessidade − 30 min, ou 3+ noites com 30 min a menos
//  REC:  média abaixo de 40
// Carga: faixa da Forma e dias seguidos com Fadiga acima do Fitness.

export interface VerdictInput {
  hrvPct: number | null; hrvOut: number; rhrDiff: number | null; rhrOut: number;
  sleep7: number | null; sleepShort: number; sleepNeed: number; rec7: number | null;
  zoneKey: string | null; fatigueAboveDays: number;
}

export function recoveryVerdict(v: VerdictInput) {
  const signals = [
    { k: 'hrv', label: 'HRV', bad: (v.hrvPct != null && v.hrvPct <= -5) || v.hrvOut >= 3,
      ok: 'dentro do normal', off: v.hrvPct != null && v.hrvPct <= -5 ? `${Math.abs(v.hrvPct)}% abaixo da base` : `${v.hrvOut} noites abaixo do normal` },
    { k: 'rhr', label: 'FC de repouso', bad: (v.rhrDiff != null && v.rhrDiff >= 2) || v.rhrOut >= 3,
      ok: 'dentro do normal', off: v.rhrDiff != null && v.rhrDiff >= 2 ? `${v.rhrDiff.toFixed(1).replace('.', ',')} bpm acima da base` : `${v.rhrOut} dias acima do normal` },
    { k: 'sleep', label: 'Sono', bad: (v.sleep7 != null && v.sleep7 < v.sleepNeed - 0.5) || v.sleepShort >= 3,
      ok: 'suficiente', off: v.sleepShort >= 3 ? `${v.sleepShort} noites curtas` : 'abaixo da necessidade' },
    { k: 'rec', label: 'REC', bad: v.rec7 != null && v.rec7 < 40, ok: 'média ok', off: `média ${Math.round(v.rec7 ?? 0)}` },
  ];
  const bad = signals.filter((s) => s.bad);
  const n = bad.length;
  const level = n === 0 ? 'bom' : n === 1 ? 'atencao' : n === 2 ? 'abaixo' : 'ruim';
  const answer = n === 0 ? 'Sim, está recuperando bem.'
    : n === 1 ? `Sim, com um ponto de atenção: ${bad[0].label.toLowerCase()}.`
    : n === 2 ? `Parcialmente: ${bad[0].label} e ${bad[1].label.toLowerCase()} fora do seu normal.`
    : `Não totalmente: ${n} de 4 sinais fora do seu normal.`;

  const loaded = v.zoneKey === 'risco' || v.zoneKey === 'produtivo';
  const days = v.fatigueAboveDays;
  let load: string;
  if (v.zoneKey === 'risco') load = 'Carga: fadiga muito acima do Fitness (faixa "muito cansado").';
  else if (loaded && n >= 2) load = `Carga: fadiga acima do Fitness há ${days} ${days === 1 ? 'dia' : 'dias'}, e o corpo não está acompanhando. A carga recente está acima do que você está absorvendo.`;
  else if (loaded) load = `Carga: bloco de treino (fadiga acima do Fitness há ${days} ${days === 1 ? 'dia' : 'dias'}) com o corpo respondendo bem. A carga está sendo absorvida.`;
  else if (n >= 2) load = 'Carga: equilibrada ou leve, então os sinais vêm de fora do treino (sono, estresse ou início de doença).';
  else load = 'Carga: equilibrada ou leve, e o corpo acompanha.';

  return { level, answer, load, signals: signals.map((s) => ({ k: s.k, label: s.label, bad: s.bad, txt: s.bad ? s.off : s.ok })) };
}
