// Servidor que imita a Garmin Personal API a partir dos CSVs locais (só para teste).
// Uso: node test/mock-garmin.ts  (porta 9999) e GARMIN_BASE_URL=http://127.0.0.1:9999 no .dev.vars
// Os formatos seguem os nomes usados pelo Garmin Connect; a conferência real é a tela de diagnóstico.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { zipSync } from 'fflate';
import { makeFit } from './fitgen.ts';

function csv(path: string) {
  const [h, ...ls] = readFileSync(path, 'utf8').trim().split(/\r?\n/);
  const c = h.split(',');
  return ls.map((l) => Object.fromEntries(l.split(',').map((v, i) => [c[i], v])));
}
const num = (s: string) => (s === '' || s === undefined ? null : Number(s));
const daily = new Map(csv('data/daily_metrics.csv').map((r) => [r.date.slice(0, 10), r]));
const acts = csv('data/activities.csv');

const range = (a: string, b: string) => {
  const out: string[] = [];
  for (let d = new Date(a + 'T00:00:00Z'); d.toISOString().slice(0, 10) <= b; d.setUTCDate(d.getUTCDate() + 1)) out.push(d.toISOString().slice(0, 10));
  return out;
};
let calls = 0;

createServer((req, res) => {
  calls++;
  const u = new URL(req.url!, 'http://x');
  const send = (code: number, body: unknown) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(typeof body === 'string' ? body : JSON.stringify(body)); };
  if (u.pathname.endsWith('/personal-api-key/token')) {
    if (!req.headers.authorization?.startsWith('ApiKey ')) return send(401, '');
    const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 86400 })).toString('base64url');
    return send(200, `h.${payload}.s`);
  }
  if (!req.headers.authorization?.startsWith('Bearer h.')) return send(401, { error: 'token' });

  let m;
  if ((m = u.pathname.match(/^\/download-service\/files\/activity\/(\d+)$/))) {
    const id = Number(m[1]), mins = 40 + (id % 60), drift = ((id % 9) + 1) / 100;
    const zip = zipSync({ [`${id}_ACTIVITY.fit`]: makeFit(mins, drift) });
    res.writeHead(200, { 'content-type': 'application/zip' }); return res.end(Buffer.from(zip));
  }
  if (u.pathname === '/wellness-service/wellness/dailyHeartRate') {
    const d = u.searchParams.get('date')!, t0 = Date.parse(d + 'T03:00:00Z'), v: [number, number][] = [];
    for (let m = 0; m < 1440; m += 2) { const h = m / 60; const base = h < 6.3 || h > 22.5 ? 44 : h > 7.3 && h < 8.5 ? 150 : h > 18 && h < 19 ? 135 : 68; v.push([t0 + m * 60000, Math.round(base + 6 * Math.sin(m / 37))]); }
    return send(200, { calendarDate: d, restingHeartRate: 44, heartRateValues: v });
  }
  if ((m = u.pathname.match(/^\/wellness-service\/wellness\/dailyStress\/(.+)$/))) {
    const t0 = Date.parse(m[1] + 'T03:00:00Z'), v: [number, number][] = [];
    for (let k = 0; k < 1440; k += 3) { const h = k / 60; v.push([t0 + k * 60000, h < 6.3 || h > 22.5 ? 10 : h > 7.3 && h < 8.5 ? -2 : Math.round(30 + 25 * Math.abs(Math.sin(k / 90)))]); }
    return send(200, { calendarDate: m[1], stressValuesArray: v });
  }
  if (u.pathname.startsWith('/biometric-service/heartRateZones'))
    return send(200, [
      { sport: 'DEFAULT', trainingMethod: 'HR_RESERVE', zone1Floor: 118, zone2Floor: 132, zone3Floor: 146, zone4Floor: 160, zone5Floor: 174, maxHeartRateUsed: 190, restingHeartRateUsed: 42 },
      { sport: 'CYCLING', trainingMethod: 'HR_RESERVE', zone1Floor: 115, zone2Floor: 128, zone3Floor: 142, zone4Floor: 155, zone5Floor: 169, maxHeartRateUsed: 185, restingHeartRateUsed: 42 },
    ]);
  if ((m = u.pathname.match(/^\/hrv-service\/hrv\/daily\/(.+)\/(.+)$/)))
    return send(200, { hrvSummaries: range(m[1], m[2]).filter((d) => num(daily.get(d)?.hrv)).map((d) => ({ calendarDate: d, lastNightAvg: num(daily.get(d)!.hrv), weeklyAvg: 100, status: 'BALANCED' })) });
  if ((m = u.pathname.match(/^\/usersummary-service\/stats\/stress\/daily\/(.+)\/(.+)$/)))
    return send(200, range(m[1], m[2]).filter((d) => num(daily.get(d)?.stress) !== null).map((d) => ({ calendarDate: d, values: { overallStressLevel: num(daily.get(d)!.stress), highStressDuration: 0 } })));
  if (u.pathname === '/usersummary-service/v2/dailysummaries')
    return send(200, { data: range(u.searchParams.get('startDate')!, u.searchParams.get('endDate')!).map((d) => ({ calendarDate: d, restingHeartRate: num(daily.get(d)?.rhr ?? ''), averageStressLevel: num(daily.get(d)?.stress ?? '') })) });
  if (u.pathname === '/sleep-service/sleep/dailySleep') {
    const d = u.searchParams.get('date')!, r = daily.get(d);
    if (!r || num(r.sleep_h) === null) return send(200, { dailySleepDTO: { calendarDate: d } });
    return send(200, {
      dailySleepDTO: {
        calendarDate: d, sleepTimeSeconds: Math.round(num(r.sleep_h)! * 3600), napTimeSeconds: d.endsWith('1') ? 1500 : 0, averageRespirationValue: num(r.resp), sleepScores: { overall: { value: num(r.sleep_score) } },
        // horários simulados: acorda ~05:40–06:20, dorme o necessário antes
        sleepEndTimestampLocal: Date.parse(d + 'T06:00:00Z') + ((d.charCodeAt(9) % 5) - 2) * 10 * 60000,
        sleepStartTimestampLocal: Date.parse(d + 'T06:00:00Z') + ((d.charCodeAt(9) % 5) - 2) * 10 * 60000 - Math.round(num(r.sleep_h)! * 3600000) - 20 * 60000,
      },
      restingHeartRate: num(r.rhr), avgOvernightHrv: num(r.hrv),
    });
  }
  if (u.pathname === '/activitylist-service/activities/search/activities') {
    const a = u.searchParams.get('startDate')!, b = u.searchParams.get('endDate')!;
    const start = Number(u.searchParams.get('start')), limit = Number(u.searchParams.get('limit'));
    const list = acts.filter((x) => x.date.slice(0, 10) >= a && x.date.slice(0, 10) <= b).map((x, i) => ({
      activityId: 1e9 + i + Number(x.date.slice(0, 10).replace(/-/g, '')), startTimeLocal: `${x.date.slice(0, 10)} ${x.time}:00`,
      activityType: { typeKey: x.type }, duration: num(x.min)! * 60, distance: num(x.km)! * 1000,
      averageHR: num(x.avghr), maxHR: num(x.maxhr), activityTrainingLoad: num(x.load), aerobicTrainingEffect: num(x.te_aer),
      directWorkoutRpe: num(x.rpe), directWorkoutFeel: num(x.feel),
      ...Object.fromEntries([1, 2, 3, 4, 5].map((z) => [`hrTimeInZone_${z}`, num(x['z' + z]) === null ? null : num(x['z' + z])! / 1000])),
    }));
    return send(200, list.slice(start, start + limit));
  }
  send(404, { error: 'nao_simulado', path: u.pathname });
}).listen(9999, '127.0.0.1', () => console.log('mock garmin em :9999'));

process.on('SIGTERM', () => { console.log('chamadas:', calls); process.exit(0); });
