// .fit sintético para teste: velocidade constante, FC sobe `drift` na 2ª metade.
import { Encoder, Profile } from '@garmin/fitsdk';
export function makeFit(minutes = 90, drift = 0.05, startIso = '2026-11-01T09:00:00Z') {
  const enc = new Encoder();
  const start = new Date(startIso);
  enc.onMesg(Profile.MesgNum.FILE_ID, { manufacturer: 'development', product: 1, timeCreated: start, type: 'activity' });
  const n = minutes * 60;
  for (let i = 0; i < n; i++) {
    const frac = i / n;
    const hr = Math.round(130 * (1 + (frac > 0.5 ? drift * (frac - 0.5) * 2 : 0)));
    enc.onMesg(Profile.MesgNum.RECORD, { timestamp: new Date(start.getTime() + i * 1000), heartRate: hr, enhancedSpeed: 8.0 });
  }
  enc.onMesg(Profile.MesgNum.SESSION, { timestamp: new Date(start.getTime() + n * 1000), sport: 'cycling', totalElapsedTime: n });
  return enc.close();
}
