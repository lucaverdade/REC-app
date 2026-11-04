// Processa os arquivos FIT pendentes: baixa pelo servidor, lê no navegador e devolve só o resultado.
import { loadLibs, fitFromZip, readFit } from './fit.js';
import { aerobic } from './aerobic.js';

let running = false;

/** Processa até `max` treinos. onEach({ i, total, item, result, error }) a cada treino. */
export async function processPending(api, { max = 3, onEach = () => {} } = {}) {
  if (running) return { done: 0, left: null, busy: true };
  running = true;
  let done = 0, left = 0;
  try {
    const p = await api(`/api/fit/pending?n=${max}`);
    left = p.left;
    if (!p.pending.length) return { done: 0, left };
    const libs = await loadLibs();
    for (const [i, item] of p.pending.entries()) {
      let result = null, error = null;
      try {
        const res = await api(`/api/fit/file?id=${item.id}`, { raw: true });
        const buf = new Uint8Array(await res.arrayBuffer());
        const fit = fitFromZip(buf, libs.unzipSync);
        if (!fit) throw new Error('arquivo sem .fit');
        const { recs } = readFit(fit, libs);
        result = aerobic(recs, { sport: item.sport, indoor: /indoor|virtual|treadmill|trainer/i.test(item.type ?? '') });
        await api('/api/fit/result', { method: 'POST', body: JSON.stringify({ id: item.id, status: result.basis ? 'ok' : 'sem_dados', ...result }) });
        done++; left--;
      } catch (e) {
        error = e.message;
        if (/429|limite/.test(error)) { onEach({ i, total: p.pending.length, item, error }); break; } // Garmin limitou: para por agora
        if (!/HTTP 5|502/.test(error)) await api('/api/fit/result', { method: 'POST', body: JSON.stringify({ id: item.id, status: 'erro' }) }).catch(() => {});
      }
      onEach({ i, total: p.pending.length, item, result, error });
    }
  } finally { running = false; }
  return { done, left };
}
