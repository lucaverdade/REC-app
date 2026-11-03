// Monta o conteúdo da aba Hoje: contribuintes, comentário por regras e avisos.
// Textos sempre ligados aos números do dia; sem conselho genérico.
import { WEIGHTS, type Contributor } from './rec.ts';

export interface RecRow {
  date: string;
  rec: number | null;
  z: Record<Contributor, number | null>;
  value: Record<Contributor, number | null>;
  base: Record<Contributor, number | null>;
}

export interface ContributorView {
  key: Contributor;
  label: string;
  value: string | null;
  base: string | null;
  z: number | null;
  /** efeito no score: peso × z (positivo puxa para cima) */
  pull: number | null;
}

export interface Alert { kind: 'saude' | 'doenca' | 'vermelho' | 'hrv98'; text: string }

const fmt = (v: number | null, d = 0) =>
  v === null ? null : v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });

const META: Record<Contributor, { label: string; show: (v: number | null) => string | null }> = {
  hrv: { label: 'HRV', show: (v) => (v === null ? null : `${fmt(v)} ms`) },
  rhr: { label: 'FC de repouso', show: (v) => (v === null ? null : `${fmt(v)} bpm`) },
  sleep: { label: 'Sono', show: (v) => (v === null ? null : hm(v)) },
  resp: { label: 'Respiração', show: (v) => (v === null ? null : `${fmt(v, 1)} rpm`) },
  stress: { label: 'Estresse de ontem', show: (v) => (v === null ? null : fmt(v)) },
};

function hm(h: number) {
  const t = Math.round(h * 60);
  return `${Math.floor(t / 60)}\u00a0h\u00a0${String(t % 60).padStart(2, '0')}`;
}

export function contributors(r: RecRow): ContributorView[] {
  return (Object.keys(WEIGHTS) as Contributor[]).map((k) => ({
    key: k,
    label: META[k].label,
    value: META[k].show(r.value[k]),
    base: META[k].show(r.base[k]),
    z: r.z[k],
    pull: r.z[k] === null ? null : WEIGHTS[k] * (r.z[k] as number),
  }));
}

/** Comentário diário montado por regras. `history` = dias anteriores, mais recente por último. */
export function comment(today: RecRow, history: RecRow[]): string {
  if (today.rec === null) {
    if (today.value.hrv === null && today.value.sleep === null) return 'Sem sono e HRV da noite. O REC aparece quando o relógio sincronizar.';
    if (today.value.hrv === null) return 'Sem HRV da noite. O REC aparece quando o dado chegar.';
    if (today.value.sleep === null) return 'Sem sono registrado. O REC aparece quando o dado chegar.';
    return 'Ainda não há histórico suficiente para calcular o REC.';
  }
  const cs = contributors(today).filter((c) => c.pull !== null);
  const up = [...cs].sort((a, b) => b.pull! - a.pull!)[0];
  const down = [...cs].sort((a, b) => a.pull! - b.pull!)[0];
  const parts: string[] = [];

  if (down && down.pull! <= -0.5) parts.push(`${down.label} puxou para baixo: ${down.value}${baseTxt(down)}.`);
  if (up && up.pull! >= 0.5) parts.push(`${up.label} puxou para cima: ${up.value}${baseTxt(up)}.`);
  if (!parts.length) parts.push('Todas as entradas perto da sua base.');

  const last7 = history.slice(-7).map((h) => h.rec).filter((v): v is number => v !== null);
  if (last7.length >= 4) {
    const avg = last7.reduce((s, v) => s + v, 0) / last7.length;
    const diff = Math.round(today.rec) - Math.round(avg);
    if (Math.abs(diff) >= 8) parts.push(`${Math.abs(diff)} pontos ${diff > 0 ? 'acima' : 'abaixo'} da média dos últimos 7 dias (${Math.round(avg)}).`);
  }
  return parts.join(' ');
}

const baseTxt = (c: ContributorView) =>
  c.key === 'sleep' ? ` (necessidade ${c.base})` : c.base ? ` (base ${c.base})` : '';

/** Avisos independentes do score. */
export function alerts(today: RecRow, yesterday: RecRow | undefined): Alert[] {
  const a: Alert[] = [];
  const z = today.z;
  if (z.hrv !== null && z.rhr !== null && z.hrv <= -2 && z.rhr <= -1.5)
    a.push({ kind: 'saude', text: 'HRV muito abaixo e FC de repouso alta na mesma manhã.' });
  if (z.resp !== null && z.rhr !== null && z.resp <= -1 && z.rhr <= -1)
    a.push({ kind: 'doenca', text: 'Respiração e FC de repouso acima do seu normal juntas: possível sinal de doença.' });
  if (yesterday && today.rec !== null && yesterday.rec !== null && Math.round(today.rec) <= 33 && Math.round(yesterday.rec) <= 33)
    a.push({ kind: 'vermelho', text: 'REC no vermelho pelo segundo dia seguido.' });
  const h0 = today.value.hrv, h1 = yesterday?.value.hrv ?? null;
  if (h0 !== null && h1 !== null && h0 < 98 && h1 < 98)
    a.push({ kind: 'hrv98', text: 'HRV abaixo de 98 em duas noites: pela regra do plano, a sessão de calor de hoje cai para 30 min.' });
  return a;
}
