import { dayHeadline, type HeadlineIn } from '../src/headline.ts';
const base: HeadlineIn = { date: '2026-11-05', ready: 70, rec: 66, parts: [
  { key: 'corpo', z: 0.5, detail: 'REC 66' }, { key: 'carga', z: -1.2, detail: '1,42× a sua média de 4 semanas: bem mais pesada que o seu normal' },
  { key: 'ontem', z: -0.8, detail: 'Strain 140; seu treino típico é 85' }, { key: 'sono', z: -1.1, detail: 'dívida' }],
  trend: { dir: 'down', days: 3 }, planned: [{ label: 'Bike', strain: 120, chave: true }], target: 130, sleepH: 6.8, sleepBase: 7.4, debtH: 2.3,
  raceDays: 24, illness: false, hasWeekPlan: true };
let fail = 0; const ok = (c: boolean, m: string) => { if (!c) { fail++; console.log('FALHA', m); } };
const show = (lab: string, o: Partial<HeadlineIn>) => { const h = dayHeadline({ ...base, ...o })!; console.log(`· ${lab}\n  ${h.title}\n  ${h.why.join(' | ')}`); return h; };
// mesmo dia = mesma frase; dias diferentes variam
const titles = new Set<string>(); for (let d = 1; d <= 20; d++) titles.add(dayHeadline({ ...base, date: `2026-11-${String(d).padStart(2, '0')}`, ready: 50, planned: [{ label: 'Corrida', strain: 80 }] })!.title);
ok(titles.size >= 2, 'variação por data');
ok(dayHeadline(base)!.title === dayHeadline(base)!.title, 'determinístico');
const h1 = show('alta + chave', { ready: 88, parts: base.parts.map((p) => ({ ...p, z: 1 })), trend: { dir: 'up', days: 4 } });
ok(/chave|forte/.test(h1.title), 'alta+chave');
const h2 = show('baixa + treino', { ready: 32, planned: [{ label: 'Corrida', strain: 80 }] });
ok(h2.why.some((w) => /[Ss]emana pesada|[Cc]arga alta/.test(w)), 'porquê carga');
show('média + chave', { ready: 52 });
const h4 = show('folga', { ready: 45, planned: [], target: 20 });
ok(/[Ff]olga/.test(h4.title) && !h4.why.some((w) => /Meta/.test(w)), 'folga sem meta');
show('sem plano, muito baixa', { ready: 15, planned: [], hasWeekPlan: false });
ok(dayHeadline({ ...base, raceDays: 0 })!.title === 'Dia de prova.', 'prova');
ok(dayHeadline({ ...base, raceDays: 1 })!.title === 'Véspera da prova.', 'véspera');
ok(dayHeadline({ ...base, illness: true })!.why.length === 0, 'doença');
ok(dayHeadline({ ...base, ready: 32 })!.why.every((w) => !/\d/.test(w) || /^Meta/.test(w)), 'sem números no porquê');
ok(dayHeadline({ ...base, ready: null, rec: null }) === null, 'sem dados');
console.log(fail ? `headline: ${fail} falha(s)` : 'headline OK'); if (fail) process.exit(1);
