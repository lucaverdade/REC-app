// Leitura do arquivo FIT no navegador (o servidor só repassa o arquivo da Garmin).
// As bibliotecas (SDK oficial da Garmin e fflate) vêm do jsDelivr e só carregam quando há arquivo para ler.
const FITSDK = 'https://cdn.jsdelivr.net/npm/@garmin/fitsdk@21.221.0/src/index.js';
const FFLATE = 'https://cdn.jsdelivr.net/npm/fflate@0.8.3/esm/browser.js';
let libs = null;
export async function loadLibs() {
  if (!libs) { const [f, z] = await Promise.all([import(FITSDK), import(FFLATE)]); libs = { Decoder: f.Decoder, Stream: f.Stream, unzipSync: z.unzipSync }; }
  return libs;
}

/** ZIP (ou .fit puro) → bytes do .fit */
export function fitFromZip(buf, unzipSync) {
  if (buf[0] === 0x50 && buf[1] === 0x4b) { // "PK"
    const files = unzipSync(buf);
    const name = Object.keys(files).find((k) => k.toLowerCase().endsWith('.fit')) ?? Object.keys(files)[0];
    return name ? files[name] : null;
  }
  return buf.length > 12 && String.fromCharCode(buf[8], buf[9], buf[10], buf[11]) === '.FIT' ? buf : null;
}

/** .fit → amostras por segundo (FC, velocidade m/s, potência W) */
export function readFit(bytes, { Decoder, Stream }) {
  const dec = new Decoder(Stream.fromByteArray(bytes));
  const { messages, errors } = dec.read({ convertDateTimesToDates: true, mergeHeartRates: true });
  const recs = (messages.recordMesgs ?? []).filter((m) => m.timestamp).map((m) => ({
    t: new Date(m.timestamp).getTime() / 1000,
    hr: typeof m.heartRate === 'number' ? m.heartRate : null,
    speed: typeof m.enhancedSpeed === 'number' ? m.enhancedSpeed : typeof m.speed === 'number' ? m.speed : null,
    power: typeof m.power === 'number' ? m.power : null,
  }));
  return { recs, sport: messages.sessionMesgs?.[0]?.sport ?? null, errors: errors?.length ?? 0 };
}
