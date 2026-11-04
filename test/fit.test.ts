// Confere a leitura do FIT (zip → .fit → amostras) e o desacoplamento, com um arquivo sintético.
import { Decoder, Stream } from '@garmin/fitsdk';
import { zipSync, unzipSync } from 'fflate';
import { readFit, fitFromZip } from '../web/fit.js';
import { aerobic } from '../web/aerobic.js';
import { makeFit } from './fitgen.ts';

const zip = zipSync({ '123_ACTIVITY.fit': makeFit() });
const { recs, sport, errors } = readFit(fitFromZip(zip, unzipSync), { Decoder, Stream });
const a = aerobic(recs, { sport: 'bike', indoor: true });
const out = aerobic(recs, { sport: 'bike', indoor: false });
if (out.decoupling != null || !out.reason) { console.error('FALHOU: bike na rua sem potência deveria ficar de fora'); process.exit(1); }
console.log({ n: recs.length, sport, errors, ...a });
if (recs.length !== 5400 || a.decoupling == null || a.decoupling < 1 || a.decoupling > 5) { console.error('FALHOU'); process.exit(1); }
console.log('OK: leitura do FIT e desacoplamento');
