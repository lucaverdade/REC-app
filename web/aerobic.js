// Base aeróbica a partir do arquivo FIT (segundo a segundo). Versão 2 (03/11): só compara o que é comparável.
//
// Desacoplamento (Friel/TrainingPeaks "Pa:HR"): dentro do MESMO treino, compara a 1ª metade com a 2ª
// (sem os 10 primeiros minutos). Bike, pneu, rolo e percurso são os mesmos nas duas metades, então
// as diferenças entre dias não entram. O que ainda pode atrapalhar dentro do treino, e como é tratado:
//   - Bike na rua sem potência: vento e subida mudam a velocidade → NÃO calcula (só com potência).
//   - Bike no rolo: velocidade do rolo é estável dentro do treino → calcula (potência, se houver).
//   - Corrida na esteira: velocidade do relógio não é confiável → NÃO calcula.
//   - Corrida na rua: se as duas metades têm subida muito diferente → NÃO calcula.
//   - Paradas: só entram amostras em movimento.
//   - Calor subindo ao longo do treino: não dá para separar; está na explicação da tela.
// Eficiência entre treinos diferentes (ritmo ÷ FC): só com potência na bike; velocidade varia demais entre dias.
/** @typedef {{ t: number, hr: number|null, speed: number|null, power: number|null, alt?: number|null }} Rec */

export const VERSION = 2;
const WARMUP_S = 600;
const mean = (xs, f) => xs.reduce((a, r) => a + f(r), 0) / xs.length;

// subida acumulada (m), com amostras a cada ~10 s e ruído < 1 m ignorado
function ascent(xs) {
  let up = 0, last = null;
  for (let i = 0; i < xs.length; i += 10) {
    const a = xs[i].alt; if (a == null) continue;
    if (last != null && a - last >= 1) up += a - last;
    if (last == null || Math.abs(a - last) >= 1) last = a;
  }
  return up;
}

/**
 * @param {Rec[]} recs
 * @param {{ sport?: 'bike'|'corrida', indoor?: boolean, minMinutes?: number }} opts
 */
export function aerobic(recs, opts = {}) {
  const base = { version: VERSION, basis: null, minutes: 0, ef: null, ef1: null, ef2: null, decoupling: null, hr: null, hr1: null, hr2: null, reason: null };
  const ok = recs.filter((r) => r.hr != null && r.hr > 60);
  if (ok.length < 60) return { ...base, reason: 'sem FC no arquivo' };
  const t0 = ok[0].t;
  const minutes = Math.round((ok[ok.length - 1].t - t0) / 60);
  const hr = Math.round(mean(ok, (r) => r.hr));
  const hasPower = ok.filter((r) => r.power != null && r.power > 0).length > ok.length * 0.6;
  const hasSpeed = ok.filter((r) => r.speed != null && r.speed > 0.5).length > ok.length * 0.6;
  const res = { ...base, minutes, hr };

  // o que dá para comparar
  let basis = null;
  if (opts.sport === 'bike') {
    if (hasPower) basis = 'power';
    else if (opts.indoor && hasSpeed) basis = 'speed';
    else return { ...res, reason: 'bike na rua sem potência: vento e subidas mudam a velocidade' };
  } else if (opts.sport === 'corrida') {
    if (opts.indoor) return { ...res, reason: 'esteira: a velocidade do relógio não é confiável' };
    if (!hasSpeed) return { ...res, reason: 'sem velocidade no arquivo' };
    basis = 'speed';
  } else basis = hasPower ? 'power' : hasSpeed ? 'speed' : null;
  if (!basis) return { ...res, reason: 'sem velocidade ou potência no arquivo' };

  const out = (r) => (basis === 'power' ? r.power : r.speed != null ? r.speed * 60 : null);
  const moving = ok.filter((r) => { const v = out(r); return v != null && (basis === 'power' ? v > 0 : v > 30); });
  if (moving.length < 60) return { ...res, basis, reason: 'pouco tempo em movimento' };
  const ef = (xs) => (xs.length < 30 ? null : mean(xs, out) / mean(xs, (r) => r.hr));
  const r3 = (x) => (x == null ? null : Math.round(x * 1000) / 1000);
  const efAll = ef(moving);
  const body = moving.filter((r) => r.t - t0 >= WARMUP_S);
  if (!body.length || (body[body.length - 1].t - body[0].t) / 60 < (opts.minMinutes ?? 40))
    return { ...res, basis, ef: r3(efAll), reason: 'curto demais para comparar as metades' };
  const mid = (body[0].t + body[body.length - 1].t) / 2;
  const h1 = body.filter((r) => r.t < mid), h2 = body.filter((r) => r.t >= mid);

  // corrida na rua: metades com subida muito diferente não se comparam
  if (opts.sport === 'corrida' && !opts.indoor) {
    const a1 = ascent(h1), a2 = ascent(h2);
    if (Math.abs(a1 - a2) > Math.max(20, 0.25 * Math.max(a1, a2))) return { ...res, basis, ef: r3(efAll), reason: `subida diferente nas metades (${Math.round(a1)} m × ${Math.round(a2)} m)` };
  }
  const ef1 = ef(h1), ef2 = ef(h2);
  if (!ef1 || !ef2) return { ...res, basis, ef: r3(efAll), reason: 'dados insuficientes' };
  return {
    ...res, basis, ef: r3(efAll), ef1: r3(ef1), ef2: r3(ef2),
    decoupling: Math.round(((ef1 - ef2) / ef1) * 1000) / 10,
    hr1: Math.round(mean(h1, (r) => r.hr)), hr2: Math.round(mean(h2, (r) => r.hr)),
  };
}
