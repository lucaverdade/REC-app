// Base aeróbica a partir do arquivo FIT (segundo a segundo).
// B2 · Desacoplamento aeróbico (Friel/TrainingPeaks "Pa:HR"): eficiência (velocidade ou potência ÷ FC)
//   da 1ª metade × 2ª metade, sem os 10 primeiros minutos. (EF1 − EF2) ÷ EF1 × 100.
//   < 5% = base aeróbica boa para aquela duração. Só em treinos ≥ 60 min, ≥ 70% do tempo até a Z2.
// B3 · Eficiência (EF): velocidade (m/min) ÷ FC na corrida; potência ÷ FC na bike quando há potência,
//   senão velocidade ÷ FC (só comparável entre sessões parecidas: rolo × rua separados).
/** @typedef {{ t: number, hr: number|null, speed: number|null, power: number|null }} Rec */


const WARMUP_S = 600;

/** @param {Rec[]} recs */
export function aerobic(recs, opts = {}) {
  const ok = recs.filter((r) => r.hr != null && r.hr > 60);
  if (ok.length < 60) return { basis: null, minutes: 0, ef: null, ef1: null, ef2: null, decoupling: null, hr: null };
  const t0 = ok[0].t;
  const hasPower = ok.filter((r) => r.power != null && r.power > 0).length > ok.length * 0.6;
  const hasSpeed = ok.filter((r) => r.speed != null && r.speed > 0.5).length > ok.length * 0.6;
  const basis = hasPower ? 'power' : hasSpeed ? 'speed' : null;
  const minutes = (ok[ok.length - 1].t - t0) / 60;
  const meanHr = ok.reduce((a, r) => a + r.hr, 0) / ok.length;
  if (!basis) return { basis: null, minutes, ef: null, ef1: null, ef2: null, decoupling: null, hr: Math.round(meanHr) };
  // só amostras em movimento
  const out = (r) => (basis === 'power' ? r.power : r.speed != null ? r.speed * 60 : null);
  const moving = ok.filter((r) => { const v = out(r); return v != null && (basis === 'power' ? v > 0 : v > 30); });
  const ef = (xs) => {
    if (xs.length < 30) return null;
    const o = xs.reduce((a, r) => a + out(r), 0) / xs.length, h = xs.reduce((a, r) => a + r.hr, 0) / xs.length;
    return o / h;
  };
  const efAll = ef(moving);
  const body = moving.filter((r) => r.t - t0 >= WARMUP_S);
  let ef1 = null, ef2 = null, dec = null;
  if (body.length && (body[body.length - 1].t - body[0].t) / 60 >= (opts.minMinutes ?? 40)) {
    const mid = (body[0].t + body[body.length - 1].t) / 2;
    ef1 = ef(body.filter((r) => r.t < mid)); ef2 = ef(body.filter((r) => r.t >= mid));
    if (ef1 && ef2) dec = ((ef1 - ef2) / ef1) * 100;
  }
  const r3 = (x) => (x == null ? null : Math.round(x * 1000) / 1000);
  return { basis, minutes: Math.round(minutes), ef: r3(efAll), ef1: r3(ef1), ef2: r3(ef2), decoupling: dec == null ? null : Math.round(dec * 10) / 10, hr: Math.round(meanHr) };
}
