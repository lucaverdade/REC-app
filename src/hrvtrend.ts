// Tendência do HRV (A2), método HRV4Training (Plews/Altini):
// - média de 7 dias do ln(HRV) contra a faixa normal = média dos 60 dias anteriores ± 0,5 desvio-padrão;
// - CV de 7 dias (variação do HRV na semana, %) contra o seu CV típico (mediana dos últimos 60 dias).
// Classes: acima da faixa → adaptando bem; dentro → estável;
// abaixo + CV subindo → risco de má adaptação; abaixo + CV estável ou caindo → fadiga acumulada.
export interface HrvDay { date: string; hrv: number | null }

const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
const sd = (v: number[]) => { const m = mean(v); return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, v.length - 1)); };
const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };

export const CLASSES = {
  acima: 'Adaptando bem',
  estavel: 'Estável',
  fadiga: 'Fadiga acumulada',
  risco: 'Risco de má adaptação',
} as const;
export type HrvClass = keyof typeof CLASSES;

/** Um ponto por dia (com dias contínuos, mais antigo primeiro). */
export function hrvTrend(days: HrvDay[]) {
  const out: { date: string; mean7: number | null; lo: number | null; hi: number | null; cv7: number | null; cvTyp: number | null; cls: HrvClass | null }[] = [];
  const cvHist: number[] = [];
  days.forEach((d, i) => {
    const w7 = days.slice(Math.max(0, i - 6), i + 1).map((x) => x.hrv).filter((v): v is number => v != null && v > 0);
    const w60 = days.slice(Math.max(0, i - 60), i).map((x) => x.hrv).filter((v): v is number => v != null && v > 0);
    if (w7.length < 4 || w60.length < 30) { out.push({ date: d.date, mean7: null, lo: null, hi: null, cv7: null, cvTyp: null, cls: null }); return; }
    const m7 = mean(w7.map(Math.log)), l60 = w60.map(Math.log), m60 = mean(l60), s60 = sd(l60);
    const cv7 = (sd(w7) / mean(w7)) * 100;
    const cvTyp = cvHist.length >= 14 ? median(cvHist.slice(-60)) : null;
    cvHist.push(cv7);
    const lo = m60 - 0.5 * s60, hi = m60 + 0.5 * s60;
    const cv7ago = out[i - 7]?.cv7 ?? null;
    const cvUp = (cvTyp != null && cv7 > cvTyp * 1.25) || (cv7ago != null && cv7 > cv7ago * 1.25);
    const cls: HrvClass = m7 > hi ? 'acima' : m7 >= lo ? 'estavel' : cvUp ? 'risco' : 'fadiga';
    out.push({ date: d.date, mean7: Math.exp(m7), lo: Math.exp(lo), hi: Math.exp(hi), cv7, cvTyp, cls });
  });
  return out;
}

/** Resumo do último dia, com quantos dias seguidos na mesma classe. */
export function hrvTrendNow(days: HrvDay[]) {
  const s = hrvTrend(days);
  const last = s[s.length - 1];
  if (!last?.cls) return null;
  let run = 0;
  for (let i = s.length - 1; i >= 0 && s[i].cls === last.cls; i--) run++;
  const r = (x: number | null) => (x == null ? null : Math.round(x));
  return {
    cls: last.cls, label: CLASSES[last.cls], days: run,
    mean7: r(last.mean7), lo: r(last.lo), hi: r(last.hi),
    cv7: last.cv7 == null ? null : Math.round(last.cv7 * 10) / 10, cvTyp: last.cvTyp == null ? null : Math.round(last.cvTyp * 10) / 10,
    series: s.slice(-60).map((x) => ({ date: x.date, mean7: r(x.mean7), lo: r(x.lo), hi: r(x.hi), cv7: x.cv7 == null ? null : Math.round(x.cv7 * 10) / 10, cls: x.cls })),
  };
}
