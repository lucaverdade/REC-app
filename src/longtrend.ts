// Séries longas para Tendências: Fitness/Fadiga/Forma e recuperação com faixa normal.
// Faixa normal (por dia, com os dias ANTERIORES):
//  - HRV: média ± 1 desvio de ln(HRV) em 60 dias (o REC usa 120 d para a base; aqui a faixa é para leitura visual)
//  - FC de repouso: mediana ± 1 desvio em 60 dias (desvio mínimo 1 bpm)
//  - Sono: necessidade pessoal (ver sleep.ts)
import { formZone, pmc } from './load.ts';
import { personalNeed } from './sleep.ts';
import { recoveryVerdict } from './verdict.ts';

interface Metric { date: string; hrv: number | null; rhr: number | null; sleep_h: number | null; nap_h: number | null }
const r1 = (x: number | null | undefined) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10) / 10);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs: number[]) => { const m = mean(xs); return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1)); };
const median = (xs: number[]) => { const a = [...xs].sort((p, q) => p - q); const n = a.length; return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2; };
const avg = (xs: (number | null)[]) => { const v = xs.filter((x): x is number => x != null); return v.length ? mean(v) : null; };

export function longTrend(o: { from: string; to: string; loads: { date: string; load: number }[]; metrics: Metric[]; recs: { date: string; rec: number | null; z_hrv?: number | null; z_rhr?: number | null; z_sleep?: number | null; z_resp?: number | null; z_stress?: number | null }[] }) {
  const p = pmc(o.loads);
  const pBy = new Map(p.map((d) => [d.date, d]));
  const mIdx = new Map(o.metrics.map((m, i) => [m.date, i]));
  const recBy = new Map(o.recs.map((r) => [r.date, r.rec]));

  const days = [];
  for (let d = o.from; d <= o.to; d = new Date(Date.parse(d + 'T00:00:00Z') + 86400_000).toISOString().slice(0, 10)) {
    const q = pBy.get(d);
    const i = mIdx.get(d);
    const m = i == null ? null : o.metrics[i];
    // janela anterior de 60 dias
    const prev = o.metrics.filter((x) => x.date < d && Date.parse(d) - Date.parse(x.date) <= 60 * 86400_000);
    const lh = prev.map((x) => x.hrv).filter((v): v is number => v != null && v > 40).map(Math.log);
    const rh = prev.map((x) => x.rhr).filter((v): v is number => v != null && v > 30);
    let hrvBase = null, hrvLo = null, hrvHi = null, rhrBase = null, rhrLo = null, rhrHi = null;
    if (lh.length >= 20) { const mu = mean(lh), s = Math.max(sd(lh), 0.04); hrvBase = Math.exp(mu); hrvLo = Math.exp(mu - s); hrvHi = Math.exp(mu + s); }
    if (rh.length >= 20) { const md = median(rh), s = Math.max(sd(rh), 1); rhrBase = md; rhrLo = md - s; rhrHi = md + s; }
    days.push({
      date: d,
      fitness: r1(q?.fitness), fatigue: r1(q?.fatigue), formPct: r1(q?.formPct),
      rec: recBy.get(d) == null ? null : Math.round(recBy.get(d) as number),
      hrv: m?.hrv ?? null, hrvBase: r1(hrvBase), hrvLo: r1(hrvLo), hrvHi: r1(hrvHi),
      rhr: m?.rhr ?? null, rhrBase: r1(rhrBase), rhrLo: r1(rhrLo), rhrHi: r1(rhrHi),
      sleep: m?.sleep_h == null ? null : r1(m.sleep_h + (m.nap_h ?? 0)),
    });
  }
  const need = personalNeed(o.metrics.filter((m) => m.date <= o.to));
  const last = days[days.length - 1], last7 = days.slice(-7), prev7 = days.slice(-14, -7);
  const d28 = days.length > 28 ? days[days.length - 29] : days[0];

  // dias seguidos com fadiga acima do fitness (até o fim)
  let streak = 0;
  for (let k = days.length - 1; k >= 0 && days[k].fatigue != null && days[k].fitness != null && days[k].fatigue! > days[k].fitness!; k--) streak++;

  const hrv7 = avg(last7.map((x) => x.hrv)), hrvB = last.hrvBase;
  const rhr7 = avg(last7.map((x) => x.rhr)), rhrB = last.rhrBase;
  const outHrv = last7.filter((x) => x.hrv != null && x.hrvLo != null && x.hrv < x.hrvLo).length;
  const outRhr = last7.filter((x) => x.rhr != null && x.rhrHi != null && x.rhr > x.rhrHi).length;
  const z = formZone(last.formPct);

  const zBy = new Map(o.recs.map((r) => [r.date, r]));
  const verdict = recoveryVerdict(last7.map((d) => {
    const r = zBy.get(d.date);
    return { date: d.date, z: { hrv: r?.z_hrv ?? null, rhr: r?.z_rhr ?? null, sleep: r?.z_sleep ?? null, resp: r?.z_resp ?? null, stress: r?.z_stress ?? null }, raw: { hrv: d.hrv, rhr: d.rhr, sleep: d.sleep } };
  }), { zoneKey: z?.key ?? null, fatigueAboveDays: streak, hrvBase: hrvB, rhrBase: rhrB, sleepNeed: need });
  return {
    from: o.from, to: o.to, sleepNeed: r1(need), days, verdict,
    summary: {
      fitness: last.fitness, fatigue: last.fatigue, formPct: last.formPct, zone: z && { key: z.key, label: z.label },
      fitness4wPct: d28?.fitness ? Math.round(((last.fitness! - d28.fitness) / d28.fitness) * 100) : null,
      fatigueAboveDays: streak,
      rec7: r1(avg(last7.map((x) => x.rec))), recPrev7: r1(avg(prev7.map((x) => x.rec))),
      hrv7: r1(hrv7), hrvBase: hrvB, hrvPct: hrv7 != null && hrvB ? Math.round(((hrv7 - hrvB) / hrvB) * 100) : null, hrvOut: outHrv,
      rhr7: r1(rhr7), rhrBase: rhrB, rhrDiff: rhr7 != null && rhrB != null ? r1(rhr7 - rhrB) : null, rhrOut: outRhr,
      sleep7: r1(avg(last7.map((x) => x.sleep))), sleepShort: last7.filter((x) => x.sleep != null && x.sleep < need - 0.5).length,
    },
  };
}
