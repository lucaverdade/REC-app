// Recalcular o tempo em zona dos treinos antigos com as zonas ATUAIS do Garmin (por modalidade).
// O servidor repassa o arquivo FIT; o navegador lê a FC segundo a segundo e devolve só os minutos por zona.
import { loadLibs, fitFromZip, readFit } from './fit.js';

/** Minutos em Z1–Z5 (abaixo da Z1 fica de fora: o app calcula como duração − soma das zonas). */
export function minutesInZones(recs, floors) {
  const z = [0, 0, 0, 0, 0];
  for (let i = 1; i < recs.length; i++) {
    const hr = recs[i].hr; if (hr == null) continue;
    const dt = Math.min(10, Math.max(0, recs[i].t - recs[i - 1].t));
    let k = -1; for (let j = 4; j >= 0; j--) if (hr >= floors[j]) { k = j; break; }
    if (k >= 0) z[k] += dt;
  }
  return z.map((s) => Math.round((s / 60) * 100) / 100);
}

let running = false;
export async function recalcHistory(api, { onEach = () => {}, batch = 5 } = {}) {
  if (running) return { busy: true };
  running = true;
  let done = 0, stop = null;
  try {
    const { zones } = await api('/api/zones/current');
    const libs = await loadLibs();
    for (;;) {
      const p = await api(`/api/zones/pending?n=${batch}`);
      if (!p.pending.length) break;
      for (const item of p.pending) {
        const floors = (zones[item.sport] ?? zones.default)?.floors;
        try {
          if (!floors) throw new Error('sem zonas para essa modalidade');
          const res = await api(`/api/fit/file?id=${item.id}`, { raw: true });
          const fit = fitFromZip(new Uint8Array(await res.arrayBuffer()), libs.unzipSync);
          const recs = fit ? readFit(fit, libs).recs.filter((r) => r.hr != null) : [];
          const z = recs.length >= 60 ? minutesInZones(recs, floors) : null;
          await api('/api/zones/result', { method: 'POST', body: JSON.stringify({ id: item.id, z }) });
          done++; onEach({ item, z, left: p.left - done });
        } catch (e) {
          if (/429|limite/.test(e.message)) { stop = 'A Garmin limitou as chamadas. Toque de novo em alguns minutos: continua de onde parou.'; break; }
          await api('/api/zones/result', { method: 'POST', body: JSON.stringify({ id: item.id, z: null }) }).catch(() => {});
          onEach({ item, error: e.message });
        }
      }
      if (stop) break;
    }
  } finally { running = false; }
  return { done, stop };
}
