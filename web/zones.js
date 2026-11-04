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
/** Lê um treino e devolve os minutos por zona (ou lança erro com a etapa que falhou). */
async function readOne(api, libs, item, floors) {
  if (!floors) throw new Error('sem zonas para essa modalidade');
  let res;
  try { res = await api(`/api/fit/file?id=${item.id}`, { raw: true }); } catch (e) { throw new Error(`download: ${e.message}`); }
  const buf = new Uint8Array(await res.arrayBuffer());
  let fit;
  try { fit = fitFromZip(buf, libs.unzipSync); } catch (e) { throw new Error(`zip: ${e.message}`); }
  if (!fit) throw new Error(`arquivo sem .fit (${buf.length} bytes)`);
  let all;
  try { all = readFit(fit, libs).recs; } catch (e) { throw new Error(`leitura do FIT: ${e.message}`); }
  const recs = all.filter((r) => r.hr != null);
  return { z: recs.length >= 60 ? minutesInZones(recs, floors) : null, samples: all.length, withHr: recs.length, bytes: buf.length };
}

/** Diagnóstico: zonas atuais + 1 treino pendente, etapa por etapa. */
export async function testOne(api) {
  const steps = [];
  const { zones } = await api('/api/zones/current'); steps.push(`zonas: ${Object.keys(zones).join(', ')}`);
  const p = await api('/api/zones/pending?n=1');
  const ST = { pendente: 'pendentes', fit: 'recalculados', sem_fc: 'sem FC', sem_arquivo: 'sem arquivo', erro: 'com erro', sem_id: 'sem id da Garmin (rode Completar treinos)' };
  steps.push('treinos do último ano: ' + Object.entries(p.states ?? {}).map(([k, n]) => `${n} ${ST[k] ?? k}`).join(', '));
  if (!p.pending.length) return steps;
  const item = p.pending[0];
  const libs = await loadLibs(); steps.push('bibliotecas do FIT: ok');
  const floors = (zones[item.sport] ?? zones.default)?.floors;
  const r = await readOne(api, libs, item, floors);
  steps.push(`${item.date} ${item.sport}: arquivo ${Math.round(r.bytes / 1024)} KB, ${r.samples} amostras, ${r.withHr} com FC`);
  steps.push(r.z ? `zonas (min): ${r.z.map((m) => Math.round(m)).join(' / ')}` : 'sem FC suficiente no arquivo');
  return steps;
}

export async function recalcHistory(api, { onEach = () => {}, batch = 5 } = {}) {
  if (running) return { busy: true };
  running = true;
  let done = 0, noHr = 0, stop = null, found = null;
  const errors = {};
  try {
    const { zones } = await api('/api/zones/current');
    const libs = await loadLibs();
    for (;;) {
      const p = await api(`/api/zones/pending?n=${batch}`);
      if (found == null) found = p.left;
      if (!p.pending.length) break;
      for (const item of p.pending) {
        try {
          const r = await readOne(api, libs, item, (zones[item.sport] ?? zones.default)?.floors);
          await api('/api/zones/result', { method: 'POST', body: JSON.stringify({ id: item.id, z: r.z }) });
          if (r.z) done++; else noHr++;
          onEach({ item, z: r.z, left: p.left - done - noHr });
        } catch (e) {
          if (/429|limite/.test(e.message)) { stop = 'A Garmin limitou as chamadas. Toque de novo em alguns minutos: continua de onde parou.'; break; }
          errors[e.message] = (errors[e.message] ?? 0) + 1;
          // marca como erro (com o motivo) para não ficar em loop; "Desfazer" libera de novo
          await api('/api/zones/result', { method: 'POST', body: JSON.stringify({ id: item.id, z: null, error: e.message }) }).catch(() => {});
          onEach({ item, error: e.message });
        }
      }
      if (stop) break;
    }
  } finally { running = false; }
  return { done, noHr, stop, found, errors };
}
