// Servidor que imita a Garmin Personal API a partir dos CSVs locais (só para teste).
// Uso: node test/mock-garmin.ts  (porta 9999) e GARMIN_BASE_URL=http://127.0.0.1:9999 no .dev.vars
// Os formatos seguem os nomes usados pelo Garmin Connect; a conferência real é a tela de diagnóstico.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';

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
      dailySleepDTO: { calendarDate: d, sleepTimeSeconds: Math.round(num(r.sleep_h)! * 3600), averageRespirationValue: num(r.resp), sleepScores: { overall: { value: num(r.sleep_score) } } },
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
