// Resumo da semana (G1): números da semana + texto do chat de treino, se publicado.
import { nf } from './charts.js';
import { distBar } from './trends.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hm = (h) => { if (h == null) return '–'; const m = Math.round(h * 60); return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`; };
const BAND = { abaixo: 'abaixo da faixa', dentro: 'dentro da faixa', acima: 'acima da faixa' };

// texto simples do chat de treino: parágrafos, **negrito** e listas com "- "
function md(t) {
  return t.split(/\n{2,}/).map((p) => {
    const lines = p.split('\n');
    if (lines.every((l) => l.trim().startsWith('- '))) return `<ul>${lines.map((l) => `<li>${inline(l.trim().slice(2))}</li>`).join('')}</ul>`;
    if (p.startsWith('#')) return `<p><b>${inline(p.replace(/^#+\s*/, ''))}</b></p>`;
    return `<p>${lines.map(inline).join('<br>')}</p>`;
  }).join('');
}
const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');

export function reviewHtml(r, { closable = false, dist = true } = {}) {
  const d = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }).replace('.', '');
  const hrvPct = r.hrv != null && r.hrvBase ? Math.round(((r.hrv - r.hrvBase) / r.hrvBase) * 100) : null;
  const rhrD = r.rhr != null && r.rhrBase != null ? Math.round((r.rhr - r.rhrBase) * 10) / 10 : null;
  const sl = r.sleep != null && r.sleepNeed != null ? Math.round((r.sleep - r.sleepNeed) * 60) : null;
  return `
    <section class="review" aria-label="Resumo da semana">
      <div class="rv-head"><span>Resumo da semana · ${d(r.monday)} – ${d(r.sunday)}</span>${closable ? '<button type="button" class="rv-close" aria-label="Fechar">×</button>' : ''}</div>
      <div class="rv-grid">
        <div><b>${hm(r.hours)}</b><small>${r.sessions} sessões</small></div>
        <div><b class="c-strain">${nf(r.strain)}</b><small>Strain${r.band ? `, ${BAND[r.band.status]} (${r.band.lo}–${r.band.hi})` : ''}</small></div>
        <div><b>${r.rec == null ? '–' : Math.round(r.rec)}</b><small>REC médio</small></div>
        <div><b>${r.hrv == null ? '–' : Math.round(r.hrv)}</b><small>HRV médio${hrvPct != null ? `, ${hrvPct > 0 ? '+' : hrvPct < 0 ? '−' : ''}${Math.abs(hrvPct)}% da base` : ''}</small></div>
        <div><b>${r.rhr == null ? '–' : nf(r.rhr, 1)}</b><small>FC repouso${rhrD != null ? `, ${rhrD > 0 ? '+' : rhrD < 0 ? '−' : ''}${nf(Math.abs(rhrD), 1)} da base` : ''}</small></div>
        <div><b>${hm(r.sleep)}</b><small>Sono médio${sl != null ? `, ${sl >= 0 ? '+' : '−'}${Math.abs(sl)} min da necessidade` : ''}</small></div>
      </div>
      ${r.sports?.length ? `<p class="rv-sports">${r.sports.map((s) => `<span><i class="dot s-${s.sport}"></i>${esc(s.label)} ${hm(s.hours)}</span>`).join('')}</p>` : ''}
      ${dist && r.dist ? distBar(r.dist) : ''}
      ${r.text ? `<div class="rv-text">${md(r.text)}</div>` : ''}
    </section>`;
}
