// Prontidão (04/11): "quão pronto acordei para hoje". Fixa na manhã, como o REC.
//
// REC = o corpo (HRV, FC de repouso, sono da noite, respiração, estresse) — estilo Recovery do Whoop.
// Prontidão = REC + o que o REC não vê, sempre contra o SEU normal:
//   - carga de 7 dias: Strain dos últimos 7 dias ÷ sua média semanal de 28 dias (razão aguda/crônica),
//     comparada com a distribuição dessa razão nos seus últimos 180 dias;
//   - treino de ontem: Strain de ontem contra os seus dias de treino dos últimos 120 dias;
//   - sono acumulado: dívida de sono de 14 dias (já é relativa à sua necessidade).
// Cada parte vira um z (positivo = ajuda, negativo = pesa), média ponderada, 100 × Φ(z) — mesma conta do REC.
// Tetos: Prontidão ≤ REC + 15 (o corpo manda); ontem muito acima do seu treino típico (z ≥ 2) limita a Prontidão a 60 (como o "tempo de recuperação" da Garmin).
// Tudo usa dados até ONTEM (o treino de hoje só conta amanhã), então o número não muda ao longo do dia.
import { phi } from './rec.ts';

export const READY_WEIGHTS = { corpo: 0.55, carga: 0.2, ontem: 0.1, sono: 0.15 } as const;
const CLAMP = 2.5;
// a média ponderada de partes pouco correlacionadas encolhe a escala; K devolve a dispersão do REC (backtest de 12 meses)
export const SPREAD = 1.3;
const CAP_Z = 2;
const clamp = (z: number) => Math.max(-CLAMP, Math.min(CLAMP, z));

/** Inverso de Φ por bisseção (precisão de 1e-6, suficiente para 0–100 com uma casa). */
export function phiInv(p: number) {
  const q = Math.min(0.9999, Math.max(0.0001, p));
  let lo = -6, hi = 6;
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (phi(m) < q) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs: number[]) => { const m = mean(xs); return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1)); };

export interface ReadyPart { key: keyof typeof READY_WEIGHTS; label: string; z: number | null; detail: string; dir: 'up' | 'down' | 'flat' | null }
export interface Readiness { score: number | null; parts: ReadyPart[]; cap: string | null }

/**
 * @param rec REC de hoje (0–100) ou null
 * @param loads Strain diário contínuo até ONTEM (o último item é ontem), de preferência 220+ dias
 * @param debtH dívida de sono de 14 dias, em horas
 */
export function readiness(rec: number | null, loads: number[], debtH: number | null, debtHist: number[] = [], K = SPREAD): Readiness {
  const parts: ReadyPart[] = [];
  const dir = (z: number | null) => (z == null ? null : z > 0.25 ? 'up' : z < -0.25 ? 'down' : 'flat');

  // corpo
  const zBody = rec == null ? null : phiInv(rec / 100);
  parts.push({ key: 'corpo', label: 'Corpo (REC)', z: zBody, dir: dir(zBody), detail: rec == null ? 'sem REC hoje' : `REC ${Math.round(rec)}` });

  // carga de 7 dias × sua média de 4 semanas, contra o seu histórico dessa razão
  const ratioAt = (end: number) => {
    if (end < 27) return null;
    const acute = loads.slice(end - 6, end + 1).reduce((a, b) => a + b, 0);
    const chronic = loads.slice(end - 27, end + 1).reduce((a, b) => a + b, 0) / 4;
    return chronic > 1 ? acute / chronic : null;
  };
  const last = loads.length - 1;
  const ratio = ratioAt(last);
  const hist: number[] = [];
  for (let i = Math.max(27, last - 180); i < last; i++) { const r = ratioAt(i); if (r != null) hist.push(r); }
  let zLoad: number | null = null, loadTxt = 'sem histórico de carga';
  if (ratio != null && hist.length >= 30) {
    const s = sd(hist) || 0.2;
    zLoad = clamp(-(ratio - mean(hist)) / s);
    const word = zLoad <= -1 ? 'bem mais pesada que o seu normal' : zLoad <= -0.4 ? 'mais pesada que o seu normal' : zLoad >= 1 ? 'bem mais leve que o seu normal' : zLoad >= 0.4 ? 'mais leve que o seu normal' : 'no seu normal';
    loadTxt = `${ratio.toFixed(2).replace('.', ',')}× a sua média de 4 semanas: ${word}`;
  }
  parts.push({ key: 'carga', label: 'Carga de 7 dias', z: zLoad, dir: dir(zLoad), detail: loadTxt });

  // treino de ontem contra os seus dias de treino
  const y = last >= 0 ? loads[last] : null;
  const trainDays = loads.slice(Math.max(0, last - 120), last).filter((v) => v > 0);
  let zY: number | null = null, yTxt = 'sem dado';
  if (y != null && trainDays.length >= 15) {
    if (y <= 0) { zY = 0.5; yTxt = 'descanso'; }
    else {
      const m = mean(trainDays), s = sd(trainDays) || m * 0.5;
      zY = clamp(-(y - m) / s);
      yTxt = `Strain ${Math.round(y)}; seu treino típico é ${Math.round(m)}`;
    }
  }
  parts.push({ key: 'ontem', label: 'Treino de ontem', z: zY, dir: dir(zY), detail: yTxt });

  // sono acumulado: dívida de hoje contra a SUA dívida típica (120 dias); sem histórico, escala fixa (2 h ≈ 0)
  const zS = debtH == null ? null : debtHist.length >= 30 ? clamp(-(debtH - mean(debtHist)) / (sd(debtHist) || 1)) : clamp(0.8 - 0.4 * debtH);
  const hm = (h: number) => { const m = Math.round(h * 60); return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`; };
  parts.push({ key: 'sono', label: 'Sono acumulado', z: zS, dir: dir(zS), detail: debtH == null ? 'sem dado' : debtH < 1 / 6 ? 'sem dívida de sono' : `dívida de ${hm(debtH)} em 14 dias` });

  // sem o corpo não há Prontidão (mesma regra do REC: traço)
  if (zBody == null) return { score: null, parts, cap: null };
  let sw = 0, sz = 0;
  for (const p of parts) if (p.z != null) { sw += READY_WEIGHTS[p.key]; sz += READY_WEIGHTS[p.key] * p.z; }
  let score = 100 * phi((sz / sw) * K);
  let cap: string | null = null;
  if (zY != null && zY <= -CAP_Z && score > 60) { score = 60; cap = 'Ontem foi bem acima do seu treino típico: a Prontidão fica no máximo em 60.'; }
  // o corpo manda: carga leve e descanso podem somar no máximo 15 pontos ao REC (um REC baixo com semana leve
  // costuma ser doença ou estresse, não prontidão). Para baixo não há limite.
  if (rec != null && score > rec + 15) { score = rec + 15; cap = cap ?? 'Carga leve e descanso somam no máximo 15 pontos ao REC: o corpo manda.'; }
  return { score: Math.round(score * 10) / 10, parts, cap };
}
