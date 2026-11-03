// Aba Treino: semana (seg–dom) planejada × executada, com o REC do dia seguinte.
import { nf } from './charts.js';

let offset = 0;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hm = (min) => { if (min == null) return '–'; const m = Math.round(min); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`; };
const zoneVar = (r) => (r == null ? 'var(--line)' : r <= 33 ? 'var(--rec-red)' : r <= 66 ? 'var(--rec-yellow)' : 'var(--rec-green)');
const day = (iso, o) => new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', o).replace(/\./g, '');
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const STATUS = {
  feito: { icon: '●', label: 'Feito' },
  parcial: { icon: '◐', label: 'Parcial' },
  nao_feito: { icon: '○', label: 'Não feito' },
  previsto: { icon: '◌', label: 'Previsto' },
};

function zoneBar(z) {
  if (!z) return '';
  const tot = z.reduce((a, b) => a + b, 0);
  if (!tot) return '';
  return `<span class="zbar" aria-hidden="true">${z.map((m, i) => (m ? `<i class="zc-${i}" style="width:${(m / tot) * 100}%"></i>` : '')).join('')}</span>`;
}

function exHtml(e) {
  const bits = [hm(e.min)];
  if (e.km >= 0.5) bits.push(`${nf(e.km, 1)} km`);
  if (e.avghr) bits.push(`${Math.round(e.avghr)} bpm`);
  if (e.rpe != null) bits.push(`RPE ${nf(e.rpe)}`);
  return `<li class="ex">
    <div class="ex-top"><span><i class="dot s-${esc(e.sport)}"></i>${esc(e.label)} <span class="meta">${esc(e.time)}</span></span>
      <span class="strain-chip">${e.strain ?? '–'}</span></div>
    <div class="ex-meta">${bits.join(', ')}</div>
    ${zoneBar(e.zones)}
  </li>`;
}

export async function renderTrain(screen, api) {
  document.documentElement.style.setProperty('--rec', 'var(--text-3)');
  screen.innerHTML = `
    <header class="top"><h1>Treino</h1></header>
    <div class="vol-nav">
      <button type="button" data-step="1" aria-label="Semana anterior">‹</button>
      <span id="wk-title"></span>
      <button type="button" data-step="-1" aria-label="Próxima semana">›</button>
    </div>
    <div id="wk-body"><p class="empty">Carregando…</p></div>`;
  screen.querySelectorAll('.vol-nav button').forEach((b) => b.addEventListener('click', () => {
    offset = Math.max(0, offset + Number(b.dataset.step)); body(screen, api);
  }));
  await body(screen, api);
}

async function body(screen, api) {
  const box = screen.querySelector('#wk-body');
  screen.querySelector('.vol-nav [data-step="-1"]').disabled = offset === 0;
  let w;
  try { w = await api(`/api/week?offset=${offset}`); }
  catch (e) { if (e.message !== '401') box.innerHTML = `<p class="empty">Não carregou: ${esc(e.message)}</p>`; return; }
  screen.querySelector('#wk-title').textContent =
    `${offset === 0 ? 'Esta semana, ' : ''}${day(w.monday, { day: 'numeric', month: 'short' })} – ${day(w.sunday, { day: 'numeric', month: 'short' })}`;

  const sm = w.summary;
  box.innerHTML = `
    <div class="trio wk-sum">
      <div><span class="big">${sm.plannedHours == null ? '–' : nf(sm.plannedHours, 1)}</span><span class="lab">Horas planejadas</span></div>
      <div><span class="big">${nf(sm.doneHours, 1)}</span><span class="lab">Horas feitas</span></div>
      <div><span class="big c-strain">${nf(sm.strain)}</span><span class="lab">Strain</span></div>
    </div>
    ${w.plan ? `<p class="note">${w.plan.fase ? `<b>${esc(w.plan.fase)}</b>. ` : ''}${esc(w.plan.notas ?? '')}</p>`
      : '<p class="note">Plano desta semana ainda não publicado. Aparecem só os treinos feitos.</p>'}
    <ol class="days">
      ${w.days.map((d) => {
        const extra = d.executed.filter((e) => !e.matched);
        const matchedBy = new Map(d.executed.filter((e) => e.matched).map((e) => [e.id, e]));
        const dRec = d.rec != null && d.recNext != null ? d.recNext - d.rec : null;
        return `<li class="day${d.isToday ? ' is-today' : ''}${d.future ? ' is-future' : ''}">
          <div class="day-head">
            <span class="day-name">${cap(day(d.date, { weekday: 'long' }))} <span class="meta">${day(d.date, { day: 'numeric', month: 'short' })}</span></span>
            ${d.rec != null ? `<span class="rec-chip"><i style="background:${zoneVar(d.rec)}"></i>REC ${d.rec}</span>` : ''}
          </div>
          ${d.planned.length ? `<ul class="plan">${d.planned.map((p) => {
            const e = p.activityId ? matchedBy.get(p.activityId) : null;
            return `<li class="pl st-${p.status}">
              <div class="pl-top"><span><span class="st-icon" title="${STATUS[p.status].label}">${STATUS[p.status].icon}</span><i class="dot s-${esc(p.sport)}"></i>${esc(p.titulo || p.label)}${p.chave ? ' <span class="key">chave</span>' : ''}</span>
                <span class="meta">${p.minutos ? hm(p.minutos) : ''}${p.zona ? `, ${esc(p.zona)}` : ''}</span></div>
              ${p.detalhe ? `<div class="ex-meta">${esc(p.detalhe)}</div>` : ''}
              ${e ? `<ul class="acts-in">${exHtml(e)}</ul>` : ''}
            </li>`;
          }).join('')}</ul>` : ''}
          ${extra.length ? `<ul class="acts-in">${extra.map(exHtml).join('')}</ul>` : ''}
          ${!d.planned.length && !extra.length ? `<p class="empty small">${d.future ? 'Nada planejado.' : 'Sem treino.'}</p>` : ''}
          ${dRec != null && d.executed.length ? `<p class="next-rec">REC no dia seguinte: <b style="color:${zoneVar(d.recNext)}">${d.recNext}</b> (${dRec > 0 ? '+' : dRec < 0 ? '−' : ''}${Math.abs(dRec)})</p>` : ''}
        </li>`;
      }).join('')}
    </ol>
    <p class="note">Strain de cada treino no círculo à direita. A barra mostra o tempo em cada zona de FC, do cinza (abaixo da Z1) ao laranja escuro (Z5).</p>`;
}
