// Prontidão: regras básicas (sem REC → traço; o corpo manda; ontem pesado limita; carga leve ajuda)
import { readiness, phiInv } from '../src/readiness.ts';
import { phi } from '../src/rec.ts';
const ok = (c: boolean, m: string) => { if (!c) { console.error('FALHOU:', m); process.exit(1); } };
ok(Math.abs(phi(phiInv(0.72)) - 0.72) < 1e-5, 'phiInv');
const steady = Array.from({ length: 300 }, (_, i) => (i % 7 === 6 ? 0 : 100 + (i % 3) * 20));
ok(readiness(null, steady, 1).score === null, 'sem REC → traço');
const base = readiness(60, steady, 1, Array(60).fill(1)).score!;
ok(Math.abs(base - 60) < 12, `semana normal fica perto do REC (${base})`);
const heavy = [...steady.slice(0, -7), 300, 280, 300, 250, 320, 300, 400];
const h = readiness(80, heavy, 1, Array(60).fill(1));
ok(h.score! <= 60, `ontem muito pesado limita a 60 (${h.score})`);
const light = [...steady.slice(0, -7), 0, 0, 30, 0, 0, 20, 0];
ok(readiness(30, light, 0, Array(60).fill(2)).score! <= 45, 'REC baixo + semana leve: no máximo REC + 15');
console.log('OK: prontidão');
// Strain v3 (escala do Strava): bike de 2 h 50 com FC média 141 ≈ 113 no Strava; Hyrox 41 min FC 150 ≈ 53
import { strainHR } from '../src/load.ts';
const sb = strainHR(170.3, 141), sh = strainHR(41.3, 150);
ok(sb! > 100 && sb! < 135, `Strain v3 bike longa (${sb})`);
ok(sh! > 35 && sh! < 60, `Strain v3 Hyrox (${sh})`);
ok(strainHR(60, null) === null, 'sem FC → null');
console.log('OK: Strain v3');
