// Calibração sob pedido: refaz a conferência do mês no servidor e imprime o resumo.
// Uso: npm run backtest -- https://endereco-do-app   (sem argumento usa o servidor local de teste)
const base = process.argv[2] || 'http://127.0.0.1:8787';
const r = await fetch(`${base}/api/backtest`, { method: 'POST' });
if (!r.ok) { console.error('Falhou:', r.status, await r.text()); process.exit(1); }
const { log } = await r.json();
const x = log[log.length - 1];
console.log(`Mês ${x.month} · ${x.days} dias`);
console.log(`REC        média ${x.rec.mean}  DP ${x.rec.sd}  zonas ${x.rec.zones.join('/')}`);
console.log(`Prontidão  média ${x.ready.mean}  DP ${x.ready.sd}  zonas ${x.ready.zones.join('/')}  tetos ${x.ready.caps}`);
console.log(`Correlação REC × Prontidão ${x.corr}`);
console.log(`Como me sinto (${x.feel.n} dias): REC ${x.feel.rhoRec} · Prontidão ${x.feel.rhoReady}`);
