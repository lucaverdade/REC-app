// Alerta de possível início de doença (A6). Usa os z do REC (negativo = pior que o seu normal):
// respiração, FC de repouso, HRV e estresse. Um dia é "suspeito" com 2+ sinais em z ≤ −1,
// sendo pelo menos um deles respiração ou FC de repouso.
// Alerta: 2 dias seguidos suspeitos; ou hoje suspeito + você marcou "Doente" no diário (ontem ou hoje).
type Z = { resp: number | null; rhr: number | null; hrv: number | null; stress: number | null };
const LABEL: Record<keyof Z, string> = { resp: 'respiração', rhr: 'FC de repouso', hrv: 'HRV', stress: 'estresse' };

const signals = (z: Z) => (Object.keys(LABEL) as (keyof Z)[]).filter((k) => z[k] != null && (z[k] as number) <= -1);
const suspect = (z: Z) => { const s = signals(z); return s.length >= 2 && (s.includes('resp') || s.includes('rhr')); };

export function illnessAlert(today: Z | null, yesterday: Z | null, sickTagged: boolean) {
  if (!today || !suspect(today)) return null;
  const both = yesterday != null && suspect(yesterday);
  if (!both && !sickTagged) return null;
  const s = signals(today).map((k) => LABEL[k]);
  const list = s.length > 1 ? `${s.slice(0, -1).join(', ')} e ${s[s.length - 1]}` : s[0];
  return {
    kind: 'doenca',
    text: both
      ? `${list[0].toUpperCase() + list.slice(1)} fora do seu normal há 2 dias seguidos: padrão comum no início de doença.`
      : `${list[0].toUpperCase() + list.slice(1)} fora do seu normal hoje, e você marcou "Doente".`,
  };
}
