// Clima de Aracaju no dia da prova (F4), via Open-Meteo (gratuito, sem chave).
// Até 16 dias antes: previsão hora a hora. Antes disso: o que costuma fazer (29/11 ± 7 dias, últimos 10 anos).
export const ARACAJU = { lat: -10.9472, lon: -37.0731, tz: 'America/Maceio' };
export const HOURS = [5, 6, 7, 8, 9, 10, 11, 12, 13];

export interface HourRow { h: number; temp: number | null; feels?: number | null; hum: number | null; wind: number | null; rain: number | null; uv?: number | null }

const r0 = (x: number | null | undefined) => (x == null || Number.isNaN(x) ? null : Math.round(x));
const avg = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);

/** Previsão: resposta do /v1/forecast (hourly) → linhas das 5 às 13 h do dia da prova. */
export function parseForecast(j: any, day: string): HourRow[] {
  const h = j?.hourly; if (!h?.time) return [];
  const out: HourRow[] = [];
  h.time.forEach((t: string, i: number) => {
    if (!t.startsWith(day)) return;
    const hour = Number(t.slice(11, 13));
    if (!HOURS.includes(hour)) return;
    out.push({ h: hour, temp: r0(h.temperature_2m?.[i]), feels: r0(h.apparent_temperature?.[i]), hum: r0(h.relative_humidity_2m?.[i]),
      wind: r0(h.wind_speed_10m?.[i]), rain: r0(h.precipitation_probability?.[i]), uv: h.uv_index?.[i] == null ? null : Math.round(h.uv_index[i] * 10) / 10 });
  });
  return out;
}

/** Histórico: várias respostas do /v1/archive (hourly) → média por hora e % de horas com chuva (≥ 0,2 mm). */
export function climatology(responses: any[]): HourRow[] {
  const acc = new Map<number, { t: number[]; hu: number[]; w: number[]; r: number[] }>();
  for (const j of responses) {
    const h = j?.hourly; if (!h?.time) continue;
    h.time.forEach((t: string, i: number) => {
      const hour = Number(t.slice(11, 13));
      if (!HOURS.includes(hour)) return;
      const a = acc.get(hour) ?? { t: [], hu: [], w: [], r: [] };
      if (h.temperature_2m?.[i] != null) a.t.push(h.temperature_2m[i]);
      if (h.relative_humidity_2m?.[i] != null) a.hu.push(h.relative_humidity_2m[i]);
      if (h.wind_speed_10m?.[i] != null) a.w.push(h.wind_speed_10m[i]);
      if (h.precipitation?.[i] != null) a.r.push(h.precipitation[i] >= 0.2 ? 100 : 0);
      acc.set(hour, a);
    });
  }
  return HOURS.filter((x) => acc.has(x)).map((x) => { const a = acc.get(x)!; return { h: x, temp: r0(avg(a.t)), hum: r0(avg(a.hu)), wind: r0(avg(a.w)), rain: r0(avg(a.r)) }; });
}
