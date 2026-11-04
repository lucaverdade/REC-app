// Leituras inspiradas nos grandes apps (04/11), todas por regras e com dados que o REC já tem.

// ---------- I2 · Status de treino (estilo Garmin Training Status) ----------
// Cruza: Fitness em 4 semanas (%), razão aguda/crônica, Forma (%) e tendência do HRV (A2).
export const STATUS = {
  sobrecarga: { label: 'Sobrecarga', txt: 'Carga recente bem acima do costume, com o corpo dando sinal. Risco de acumular cansaço demais.' },
  nao_produtivo: { label: 'Carga sem resposta', txt: 'Treinando no ritmo de costume, mas o HRV e a recuperação da semana mostram fadiga: o corpo não está absorvendo bem a carga.' },
  produtivo: { label: 'Produtivo', txt: 'Fitness subindo e corpo respondendo bem: a carga está virando condicionamento.' },
  pico: { label: 'Pico', txt: 'Descansado e com o Fitness preservado: o ponto que se busca antes de uma prova.' },
  recuperando: { label: 'Recuperando', txt: 'Semana mais leve que o costume: o cansaço está saindo.' },
  mantendo: { label: 'Mantendo', txt: 'Fitness estável: a carga atual mantém o condicionamento.' },
  caindo: { label: 'Perdendo forma', txt: 'Fitness caindo há semanas com carga baixa.' },
} as const;
export type StatusKey = keyof typeof STATUS;

// Coerência (04/11): "corpo cansado" só conta com DUAS confirmações independentes —
// tendência do HRV (fadiga ou risco) E resposta de recuperação dos 7 dias (um pouco abaixo, abaixo ou não recuperando).
// Assim o status não diz "Produtivo/Mantendo" quando a aba Corpo diz que o corpo não está absorvendo.
export function trainingStatus(i: { fitness4w: number | null; acwr: number | null; formPct: number | null; hrvCls: string | null; recovery?: string | null }) {
  const f = i.fitness4w ?? 0, r = i.acwr ?? 1, form = i.formPct ?? 0;
  const hrvTired = i.hrvCls === 'fadiga' || i.hrvCls === 'risco';
  const recLow = i.recovery === 'atencao' || i.recovery === 'abaixo' || i.recovery === 'ruim';
  const tired = hrvTired && (i.recovery == null || recLow);
  let k: StatusKey;
  if (r > 1.5 || (form < -30 && tired)) k = 'sobrecarga';
  else if (form >= 5 && f >= -5 && !tired) k = 'pico';
  else if (tired && r >= 0.8) k = 'nao_produtivo';
  else if (tired) k = 'recuperando';
  else if (f >= 5) k = 'produtivo';
  else if (r < 0.8 && f > -10) k = 'recuperando';
  else if (f <= -5) k = 'caindo';
  else k = 'mantendo';
  // por quê, com os números (para a resposta citar os sinais de apoio)
  const why = [
    i.fitness4w == null ? null : `Fitness ${f > 0 ? '+' : f < 0 ? '−' : ''}${Math.abs(f)}% em 4 semanas`,
    i.acwr == null ? null : `carga da semana ${String(Math.round(r * 10) / 10).replace('.', ',')}× o costume`,
    hrvTired ? `HRV em ${i.hrvCls === 'risco' ? 'risco de má adaptação' : 'fadiga acumulada'}` : i.hrvCls ? 'HRV no normal' : null,
    i.recovery ? (recLow ? 'recuperação da semana abaixo do normal' : 'recuperação da semana no normal') : null,
  ].filter(Boolean).join(', ');
  return { key: k, ...STATUS[k], why, inputs: i };
}

// ---------- I1 · Foco da carga (estilo Garmin Load Focus) ----------
// Strain das últimas 4 semanas dividido por tipo: aeróbico leve (abaixo da Z1 a Z2), aeróbico forte (Z3–Z4), anaeróbico (Z5).
// Faixas de referência para endurance em fase de construção (adaptadas do Garmin para Strain por zonas).
export const FOCUS_REF = { low: [55, 75], high: [20, 40], ana: [3, 12] } as const;
export function loadFocus(acts: { min: number | null; z: (number | null)[] }[]) {
  let low = 0, high = 0, ana = 0;
  for (const a of acts) {
    const z = a.z.map((v) => v ?? 0); const inZ = z.reduce((x, y) => x + y, 0);
    low += 0.5 * Math.max(0, (a.min ?? 0) - inZ) + z[0] + 2 * z[1];
    high += 3 * z[2] + 4 * z[3];
    ana += 5 * z[4];
  }
  const tot = low + high + ana;
  if (!tot) return null;
  const pct = { low: Math.round((low / tot) * 100), high: Math.round((high / tot) * 100), ana: Math.round((ana / tot) * 100) };
  const st = (k: keyof typeof FOCUS_REF) => (pct[k] < FOCUS_REF[k][0] ? 'falta' : pct[k] > FOCUS_REF[k][1] ? 'sobra' : 'ok');
  const status = { low: st('low'), high: st('high'), ana: st('ana') };
  const names = { low: 'aeróbico leve', high: 'aeróbico forte', ana: 'anaeróbico' };
  const falta = (Object.keys(status) as (keyof typeof status)[]).filter((k) => status[k] === 'falta');
  const sobra = (Object.keys(status) as (keyof typeof status)[]).filter((k) => status[k] === 'sobra');
  const txt = !falta.length && !sobra.length ? 'Equilibrado: as três partes dentro da faixa de referência.'
    : `${falta.length ? `Falta ${falta.map((k) => names[k]).join(' e ')}` : ''}${falta.length && sobra.length ? '; ' : ''}${sobra.length ? `sobra ${sobra.map((k) => names[k]).join(' e ')}` : ''}.`;
  return { strain: { low: Math.round(low), high: Math.round(high), ana: Math.round(ana) }, pct, status, ref: FOCUS_REF, txt: txt.charAt(0).toUpperCase() + txt.slice(1) };
}

// ---------- I5 · Estresse acumulado (estilo Oura Cumulative Stress, 31 dias) ----------
// Média dos z do REC em 31 dias (negativo = pior que o seu normal) + noites irregulares + Fadiga acima do Fitness.
export function cumulativeStress(i: {
  z: { hrv: (number | null)[]; rhr: (number | null)[]; sleep: (number | null)[]; stress: (number | null)[] };
  irregularPct: number | null; irregularPctBefore: number | null; fatigueAboveDays: number;
}) {
  const m = (v: (number | null)[]) => { const x = v.filter((y): y is number => y != null); return x.length >= 10 ? x.reduce((a, b) => a + b, 0) / x.length : null; };
  const rows = [
    { k: 'hrv', label: 'HRV', w: 2, v: m(i.z.hrv) },
    { k: 'sleep', label: 'Sono', w: 1.5, v: m(i.z.sleep) },
    { k: 'stress', label: 'Estresse do dia (Garmin)', w: 1.5, v: m(i.z.stress) },
    { k: 'rhr', label: 'FC de repouso', w: 1, v: m(i.z.rhr) },
  ].map((r) => ({ ...r, load: r.v == null ? null : Math.max(0, -r.v) }));
  // regularidade: aumento de noites irregulares contra os 90 dias anteriores (10 pontos % ≈ 0,3)
  const reg = i.irregularPct != null && i.irregularPctBefore != null ? Math.max(0, (i.irregularPct - i.irregularPctBefore) / 33) : null;
  const carga = Math.min(1, i.fatigueAboveDays / 21) * 0.6; // Fadiga acima do Fitness em boa parte do mês
  const all = [...rows.map((r) => ({ w: r.w, x: r.load })), { w: 0.5, x: reg }, { w: 0.5, x: carga }].filter((r) => r.x != null) as { w: number; x: number }[];
  if (all.length < 3) return null;
  const score = all.reduce((a, r) => a + r.w * r.x, 0) / all.reduce((a, r) => a + r.w, 0);
  const level = score < 0.15 ? 'baixo' : score < 0.4 ? 'moderado' : 'alto';
  const st = (x: number | null) => (x == null ? 'sem' : x >= 0.4 ? 'pesando' : x >= 0.15 ? 'atencao' : 'ok');
  return {
    level, label: { baixo: 'Baixo', moderado: 'Moderado', alto: 'Alto' }[level], score: Math.round(score * 100) / 100,
    contributors: [
      ...rows.map((r) => ({ k: r.k, label: r.label, state: st(r.load), z: r.v == null ? null : Math.round(r.v * 100) / 100 })),
      { k: 'reg', label: 'Regularidade do sono', state: st(reg), z: null, pct: i.irregularPct },
      { k: 'carga', label: 'Carga (Fadiga acima do Fitness)', state: st(carga), z: null, days: i.fatigueAboveDays },
    ],
  };
}

// ---------- I3 · Resumo do treino em frases (comparando com treinos parecidos) ----------
export interface Past { id: string; date: string; type?: string | null; min: number; km: number | null; avghr: number | null; strain: number | null }
export function workoutInsights(a: Past & { sport: string; label: string }, past: Past[]) {
  const out: string[] = [];
  const d = (iso: string) => { const [y, m, dd] = iso.split('-'); return `${dd}/${m}`; };
  const lbl = a.label.toLowerCase();
  const prev = past.filter((p) => p.id !== a.id && p.date < a.date);
  // maior Strain da modalidade em 6 semanas
  const six = prev.filter((p) => p.date >= addDays(a.date, -42));
  if (a.strain != null && six.length >= 3 && six.every((p) => (p.strain ?? 0) < a.strain!)) out.push(`Seu maior Strain em ${lbl} nas últimas 6 semanas.`);
  // mais longo desde…
  const longer = prev.filter((p) => p.min >= a.min).sort((x, y) => (x.date < y.date ? 1 : -1))[0];
  if (prev.length >= 5 && a.min >= 45) {
    if (!longer) out.push(`Seu ${lbl} mais longo do histórico.`);
    else if (longer.date < addDays(a.date, -28)) out.push(`Seu ${lbl} mais longo desde ${d(longer.date)}.`);
  }
  // FC média contra treinos do mesmo tipo (rua × indoor) e duração parecida (±25%) nos últimos 90 dias.
  // Sem comparar ritmo: vento, subida e calor mudam demais entre dias.
  const indoor = (t?: string | null) => /indoor|virtual|treadmill|trainer|pool|lap/i.test(t ?? '');
  const sim = prev.filter((p) => p.date >= addDays(a.date, -90) && Math.abs(p.min - a.min) <= a.min * 0.25 && p.avghr && indoor(p.type) === indoor(a.type));
  if (a.avghr && sim.length >= 3) {
    const hr = sim.reduce((s, p) => s + (p.avghr as number), 0) / sim.length, dHr = Math.round(a.avghr - hr);
    if (Math.abs(dHr) >= 5) out.push(`FC média ${Math.abs(dHr)} bpm ${dHr > 0 ? 'acima' : 'abaixo'} dos seus ${sim.length} treinos de ${lbl} parecidos nos últimos 90 dias.`);
  }
  return out.slice(0, 3);
}
function addDays(d: string, n: number) { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }
