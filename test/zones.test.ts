// Lê um .fit sintético (zip) e confere o tempo em zona recalculado.
import { Decoder, Stream } from '@garmin/fitsdk';
import { zipSync, unzipSync } from 'fflate';
import { readFit, fitFromZip } from '../web/fit.js';
import { minutesInZones } from '../web/zones.js';
import { makeFit } from './fitgen.ts';

const { recs } = readFit(fitFromZip(zipSync({ 'a.fit': makeFit(60, 0.1) }), unzipSync)!, { Decoder, Stream });
const z = minutesInZones(recs, [120, 133, 140, 150, 170]);
const tot = z.reduce((a, b) => a + b, 0);
console.log({ n: recs.length, z, tot });
// FC 130 na 1ª metade (Z1) e sobe até ~143 no fim: tudo dentro de Z1–Z3, soma ≈ 60 min
if (Math.abs(tot - 60) > 0.5 || z[0] < 25 || z[3] > 0 || z[4] > 0) { console.error('FALHOU'); process.exit(1); }
console.log('OK: zonas recalculadas pelo FIT');
