// Aba Treino (repaginada 03/11): resumo da semana, faixa com os 7 dias e um dia por vez.
// Cada sessão: nome grande, duração e zona, Strain previsto → feito. Detalhes ficam recolhidos.
import { nf } from './charts.js';
import { distBar } from './trends.js';
import { reviewHtml } from './review.js';

let offset = 0;
let picked = null; // data escolhida na faixa da semana
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hm = (min) => { if (min == null) return '–'; const m = Math.round(min); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`; };
const zoneVar = (r) => (r == null ? 'var(--line)' : r <= 33 ? 'var(--rec-red)' : r <= 66 ? 'var(--rec-yellow)' : 'var(--rec-green)');
const day = (iso, o) => new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', o).replace(/\./g, '');
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const STATUS = { feito: 'Feito', parcial: 'Parcial', nao_feito: 'Não feito', previsto: 'Previsto' };
const ZN = ['Abaixo da Z1', 'Z1', 'Z2', 'Z3', 'Z4', 'Z5'];

function zoneBar(z) {
  if (!z) return '';
  const tot = z.reduce((a, b) => a + b, 0);
  if (!tot) return '';
  const used = z.map((m, i) => ({ i, m })).filter((x) => x.m > 0);
  return `<span class="zbar" aria-hidden="true">${used.map((x) => `<i class="zc-${x.i}" style="width:${(x.m / tot) * 100}%"></i>`).join('')}</span>
    <ul class="ac-zlist">${used.map((x) => `<li><i class="zc-${x.i}"></i>${ZN[x.i]} <b>${x.m} min</b></li>`).join('')}</ul>`;
}

// uma sessão: planejada (com ou sem o feito) ou só feita
function sessionCard({ sport, title, sub, status, key, planned, done, detail, ex }) {
  const pct = planned && done != null ? Math.round((done / planned) * 100) : null;
  const cls = pct == null ? '' : pct >= 80 && pct <= 120 ? 'ok' : pct < 80 ? 'low' : 'high';
  const facts = ex ? [ex.km >= 0.5 ? `${nf(ex.km, 1)} km` : null, ex.avghr ? `FC média ${Math.round(ex.avghr)}` : null, ex.rpe != null ? `RPE ${nf(ex.rpe)}` : null].filter(Boolean) : [];
  return `<li class="ss s-${esc(sport)}-bar">
    <div class="ss-top">
      <div class="ss-name"><b>${esc(title)}</b>${key ? '<span class="key">chave</span>' : ''}<span class="ss-sub">${sub}</span></div>
      ${status ? `<span class="ss-st st-${status}">${STATUS[status]}</span>` : ''}
    </div>
    <div class="ss-strain">
      ${planned != null ? `<div><span class="lab">Previsto</span><span class="num">${planned}</span></div>` : ''}
      ${done != null ? `<div><span class="lab">Feito</span><span class="num c-strain">${done}</span></div>` : ''}
      ${pct != null ? `<div><span class="lab">do previsto</span><span class="num pct ${cls}">${pct}%</span></div>` : ''}
    </div>
    ${ex?.zones || facts.length || detail ? `<details class="ss-more"><summary>Detalhes</summary>
      ${facts.length ? `<p class="ss-facts">${facts.join(' · ')}</p>` : ''}
      ${ex?.zones ? zoneBar(ex.zones) : ''}
      ${detail ? `<p class="ss-detail">${esc(detail)}</p>` : ''}
    </details>` : ''}
    ${ex?.id ? `<a class="ss-open" href="#atv/${encodeURIComponent(ex.id)}">Ver treino ›</a>` : ''}
  </li>`;
}

function dayHtml(d) {
  const matchedBy = new Map(d.executed.filter((e) => e.matched).map((e) => [e.id, e]));
  const extra = d.executed.filter((e) => !e.matched);
  const cards = [
    ...d.planned.map((p) => {
      const e = p.activityId ? matchedBy.get(p.activityId) : null;
      return sessionCard({
        sport: p.sport, title: p.titulo || p.label, key: p.chave,
        sub: `${p.label}${p.minutos ? ` · ${hm(p.minutos)}` : ''}${p.zona ? ` · ${esc(p.zona)}` : ''}${e && e.min ? ` · feito ${hm(e.min)}` : ''}`,
        status: p.status, planned: p.plannedStrain, done: p.doneStrain, detail: p.detalhe, ex: e,
      });
    }),
    ...extra.map((e) => sessionCard({ sport: e.sport, title: e.label, sub: `${esc(e.time)} · ${hm(e.min)}`, status: 'feito', planned: null, done: e.strain, ex: e })),
  ];
  const dRec = d.rec != null && d.recNext != null ? d.recNext - d.rec : null;
  return `
    <div class="td-head">
      <h2>${cap(day(d.date, { weekday: 'long', day: 'numeric', month: 'long' }))}</h2>
      ${d.rec != null ? `<span class="rec-chip"><i style="background:${zoneVar(d.rec)}"></i>REC ${d.rec}</span>` : ''}
    </div>
    ${cards.length ? `<ul class="sessions">${cards.join('')}</ul>` : `<p class="empty">${d.future ? 'Nada planejado.' : 'Sem treino.'}</p>`}
    ${dRec != null && d.executed.length ? `<p class="next-rec">REC no dia seguinte <b style="color:${zoneVar(d.recNext)}">${d.recNext}</b> <span>(${dRec > 0 ? '+' : dRec < 0 ? '−' : ''}${Math.abs(dRec)})</span></p>` : ''}`;
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
    offset = Math.max(0, offset + Number(b.dataset.step)); picked = null; body(screen, api);
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
    `${offset === 0 ? 'Esta semana · ' : ''}${day(w.monday, { day: 'numeric', month: 'short' })} – ${day(w.sunday, { day: 'numeric', month: 'short' })}`;
  if (!picked || !w.days.some((d) => d.date === picked)) picked = (w.days.find((d) => d.isToday) ?? w.days[0]).date;

  const sm = w.summary;
  const pct = sm.plannedStrain ? Math.min(100, (sm.strain / sm.plannedStrain) * 100) : null;
  box.innerHTML = `
    <section class="wk-card">
      <div class="wk-main">
        <div><span class="num c-strain">${nf(sm.strain)}</span>${sm.plannedStrain != null ? `<span class="of">de ${nf(sm.plannedStrain)}</span>` : ''}<span class="lab">Strain da semana</span></div>
        <div class="wk-h"><span class="num">${nf(sm.doneHours, 1)}</span>${sm.plannedHours != null ? `<span class="of">de ${nf(sm.plannedHours, 1)} h</span>` : '<span class="of">h</span>'}<span class="lab">Horas</span></div>
      </div>
      ${pct != null ? `<span class="wk-bar"><i style="width:${pct}%"></i></span>` : ''}
      ${sm.dist ? `<div class="wk-dist">${distBar(sm.dist)}</div>` : ''}
      ${w.plan?.fase ? `<p class="wk-fase">${esc(w.plan.fase)}</p>` : ''}
      ${w.plan?.notas ? `<details class="ss-more"><summary>Nota da semana</summary><p class="ss-detail">${esc(w.plan.notas)}</p></details>` : ''}
      ${!w.plan ? '<p class="wk-fase">Plano desta semana ainda não publicado.</p>' : ''}
    </section>

    <div id="wk-review"></div>

    <ol class="wk-strip" role="tablist" aria-label="Dias da semana">
      ${w.days.map((d) => {
        // uma bolinha por sessão: cheia = feita, vazada = prevista ou não feita
        const dots = [...d.planned.map((p) => ({ s: p.sport, done: p.status === 'feito' || p.status === 'parcial' })),
          ...d.executed.filter((e) => !e.matched).map((e) => ({ s: e.sport, done: true }))];
        return `<li><button type="button" role="tab" data-date="${d.date}" aria-selected="${d.date === picked}" class="wd${d.isToday ? ' is-today' : ''}">
          <span class="wd-n">${day(d.date, { weekday: 'narrow' })}</span>
          <span class="wd-d">${day(d.date, { day: 'numeric' })}</span>
          <span class="wd-dots">${dots.slice(0, 3).map((x) => `<i class="dot ${x.done ? `s-${x.s}` : `open c-${x.s}`}"></i>`).join('') || '<i class="dot none"></i>'}</span>
        </button></li>`;
      }).join('')}
    </ol>

    <section class="td" id="td">${dayHtml(w.days.find((d) => d.date === picked))}</section>

    <details class="ss-more how"><summary>Como funciona</summary>
      <p class="ss-detail">Strain previsto: minutos planejados × o seu Strain por minuto típico em treinos parecidos (mesma modalidade e zona) dos últimos 120 dias; sem 3 treinos parecidos, vale o do plano ou minutos × peso da zona. Entre 80% e 120% do previsto está no alvo. Bolinha cheia no dia: tudo feito; vazada: falta algo.</p>
    </details>`;

  // resumo da semana: semanas passadas, e a atual a partir de domingo
  if (offset > 0 || new Date().getDay() === 0) {
    api(`/api/review?monday=${w.monday}`).then((r) => { const el = box.querySelector('#wk-review'); if (el && r.sessions) el.innerHTML = reviewHtml(r, { dist: false }); }).catch(() => {});
  }

  box.querySelectorAll('.wd').forEach((b) => b.addEventListener('click', () => {
    picked = b.dataset.date;
    box.querySelectorAll('.wd').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    box.querySelector('#td').innerHTML = dayHtml(w.days.find((d) => d.date === picked));
  }));
}
