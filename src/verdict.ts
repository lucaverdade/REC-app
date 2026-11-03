// Resposta para "Meu corpo está recuperando?" — regras com pesos, sem IA.
//
// Base: os mesmos z-scores do REC (cada sinal contra o SEU normal; positivo = melhor):
//   HRV (peso 2), sono (1,5), FC de repouso (1), respiração (0,7), estresse do dia anterior (0,5).
// 1) Nível: média ponderada dos z nos últimos 7 dias, dias recentes pesam mais (meia-vida 3 dias).
//      ≥ +0,30 recuperando bem · −0,20 a +0,30 dentro do normal · −0,50 a −0,20 um pouco abaixo
//      −0,90 a −0,50 abaixo do normal · < −0,90 não está recuperando
// 2) Tendência: média dos últimos 3 dias contra os 4 anteriores (±0,30 = melhorando / piorando).
// 3) O que mais pesou: o sinal com maior contribuição negativa (peso × z) e o que mais ajudou.
// 4) Carga: cruza o nível com a faixa da Forma e os dias com Fadiga acima do Fitness.
// 5) Padrão de doença: respiração e FC de repouso acima do normal juntas (z ≤ −1 nos 2 últimos dias).
// Recalculado a cada noite nova: a janela de 7 dias anda junto e a tendência mostra a direção.

export type Key = 'hrv' | 'rhr' | 'sleep' | 'resp' | 'stress';
export const W: Record<Key, number> = { hrv: 2, sleep: 1.5, rhr: 1, resp: 0.7, stress: 0.5 };
const LABEL: Record<Key, string> = { hrv: 'HRV', sleep: 'Sono', rhr: 'FC de repouso', resp: 'Respiração', stress: 'Estresse' };

export interface DayZ { date: string; z: Partial<Record<Key, number | null>>; raw: { hrv?: number | null; rhr?: number | null; sleep?: number | null } }
export interface Ctx { zoneKey: string | null; fatigueAboveDays: number; hrvBase: number | null; rhrBase: number | null; sleepNeed: number }

const KEYS = Object.keys(W) as Key[];
const dayScore = (d: DayZ) => {
  let n = 0, w = 0;
  for (const k of KEYS) { const z = d.z[k]; if (z != null) { n += W[k] * z; w += W[k]; } }
  return w >= 2 ? n / w : null;
};
const wmean = (vals: (number | null)[], half = 3) => {
  let n = 0, w = 0;
  vals.forEach((v, i) => { if (v == null) return; const age = vals.length - 1 - i; const wt = 0.5 ** (age / half); n += v * wt; w += wt; });
  return w ? n / w : null;
};
const avg = (vals: (number | null)[]) => { const v = vals.filter((x): x is number => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
const hm = (h: number) => { const m = Math.round(Math.abs(h) * 60); return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : `${m} min`; };

const LEVELS = [
  { min: 0.3, key: 'bom', answer: 'Sim, está recuperando bem.' },
  { min: -0.2, key: 'normal', answer: 'Sim, recuperando dentro do seu normal.' },
  { min: -0.5, key: 'atencao', answer: 'Recuperação um pouco abaixo do seu normal.' },
  { min: -0.9, key: 'abaixo', answer: 'Recuperação abaixo do seu normal.' },
  { min: -Infinity, key: 'ruim', answer: 'Não, o corpo não está recuperando.' },
] as const;

/** `days`: últimos 7 dias (mais antigo primeiro), com os z do REC. */
export function recoveryVerdict(days: DayZ[], ctx: Ctx) {
  const last7 = days.slice(-7);
  const scores = last7.map(dayScore);
  const level = wmean(scores);
  if (level == null) return null;
  const lv = LEVELS.find((l) => level >= l.min)!;

  // tendência
  const recent = avg(scores.slice(-3)), before = avg(scores.slice(0, -3));
  const delta = recent != null && before != null ? recent - before : 0;
  const trend = delta >= 0.3 ? 'melhorando' : delta <= -0.3 ? 'piorando' : 'estavel';
  const trendTxt = trend === 'melhorando' ? 'Melhorando nos últimos 3 dias.' : trend === 'piorando' ? 'Piorando nos últimos 3 dias.' : 'Estável nos últimos 3 dias.';

  // contribuições por sinal (peso × z médio ponderado)
  const sig = KEYS.map((k) => {
    const zm = wmean(last7.map((d) => d.z[k] ?? null));
    const below = last7.filter((d) => (d.z[k] ?? 0) <= -0.5).length;
    return { k, label: LABEL[k], z: zm, pull: zm == null ? null : zm * W[k], below };
  });
  const worst = sig.filter((s) => s.pull != null && s.pull <= -0.4).sort((a, b) => a.pull! - b.pull!);
  const best = sig.filter((s) => s.pull != null && s.pull >= 0.4).sort((a, b) => b.pull! - a.pull!);

  // frases por sinal com os números da pessoa
  const hrv7 = avg(last7.map((d) => d.raw.hrv ?? null)), rhr7 = avg(last7.map((d) => d.raw.rhr ?? null)), sleep7 = avg(last7.map((d) => d.raw.sleep ?? null));
  const phrase = (k: Key, good: boolean): string => {
    const s = sig.find((x) => x.k === k)!;
    switch (k) {
      case 'hrv': {
        const pct = hrv7 != null && ctx.hrvBase ? Math.round(((hrv7 - ctx.hrvBase) / ctx.hrvBase) * 100) : null;
        return good ? `HRV acima da sua base${pct != null && pct > 0 ? ` (+${pct}%)` : ''}.` : `HRV abaixo da sua base${pct != null && pct < 0 ? ` (${pct}%)` : ''}, ${s.below} de 7 noites baixas.`;
      }
      case 'rhr': {
        const d = rhr7 != null && ctx.rhrBase != null ? rhr7 - ctx.rhrBase : null;
        return good ? 'FC de repouso abaixo da sua base.' : `FC de repouso ${d != null && d > 0 ? `${d.toFixed(1).replace('.', ',')} bpm ` : ''}acima da sua base, ${s.below} de 7 dias altos.`;
      }
      case 'sleep': {
        const gap = sleep7 != null ? sleep7 - ctx.sleepNeed : null;
        return good ? `Sono acima da necessidade${gap != null && gap > 0 ? ` (+${hm(gap)} por noite)` : ''}.` : `Sono ${gap != null && gap < 0 ? `${hm(gap)} abaixo da necessidade por noite` : 'abaixo da necessidade'}, ${s.below} noites curtas.`;
      }
      case 'resp': return good ? 'Respiração no sono abaixo do normal.' : 'Respiração no sono acima do seu normal.';
      case 'stress': return good ? 'Estresse do dia abaixo do normal.' : 'Estresse do dia acima do seu normal.';
    }
  };

  // padrão de doença
  const ill = last7.slice(-2).every((d) => (d.z.resp ?? 0) <= -1 && (d.z.rhr ?? 0) <= -1);

  // carga × recuperação
  const z = ctx.zoneKey, n = ctx.fatigueAboveDays;
  const dias = `${n} ${n === 1 ? 'dia' : 'dias'}`;
  const good = lv.key === 'bom' || lv.key === 'normal';
  let load: string;
  if (ill) load = 'Respiração e FC de repouso acima do normal juntas nos últimos 2 dias: padrão comum no início de doença, independente da carga.';
  else if (z === 'risco') load = good ? `Fadiga muito acima do Fitness, mas os sinais seguem no normal: o corpo está segurando a carga por enquanto.` : `Fadiga muito acima do Fitness e recuperação ${lv.key === 'atencao' ? 'caindo' : 'baixa'}: a carga está acima do que você está absorvendo.`;
  else if (z === 'produtivo') load = good ? `Bloco de treino (fadiga acima do Fitness há ${dias}) sendo absorvido: os sinais seguem no normal.`
    : lv.key === 'atencao' ? `Fadiga acima do Fitness há ${dias} e a recuperação começou a cair: a carga está no limite do que você absorve.`
    : `Fadiga acima do Fitness há ${dias} e recuperação baixa: a carga recente está acima do que você está absorvendo.`;
  else if (z === 'descansado' || z === 'perdendo') load = good ? 'Carga leve e corpo recuperado.' : `Carga leve, então a queda vem de fora do treino${worst[0] ? ` (o que mais pesou: ${worst[0].label.toLowerCase()})` : ''}.`;
  else load = good ? 'Carga equilibrada e corpo acompanhando.' : `Carga equilibrada, então a queda vem de fora do treino${worst[0] ? ` (o que mais pesou: ${worst[0].label.toLowerCase()})` : ''}.`;

  const reasons = [
    ...worst.slice(0, 2).map((s) => ({ k: s.k, bad: true, txt: phrase(s.k, false) })),
    ...best.slice(0, worst.length ? 1 : 2).map((s) => ({ k: s.k, bad: false, txt: phrase(s.k, true) })),
  ];

  return {
    level: lv.key, score: Math.round(level * 100) / 100, answer: lv.answer,
    trend, trendTxt, load, reasons,
    signals: sig.map((s) => ({ k: s.k, label: s.label, z: s.z == null ? null : Math.round(s.z * 100) / 100,
      state: s.z == null ? 'sem' : s.z <= -0.4 ? 'baixo' : s.z >= 0.4 ? 'alto' : 'normal' })),
  };
}
