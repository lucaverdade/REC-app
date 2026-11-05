// Aba Treino (repaginada 03/11): resumo da semana, faixa com os 7 dias e um dia por vez.
// Cada sessão: nome grande, duração e zona, Strain previsto → feito. Detalhes ficam recolhidos.
import { nf } from './charts.js';
import { distBar, renderEvolution } from './trends.js';
import { reviewHtml } from './review.js';
import { cardHead, readyColor, heroRing, animateRings, countUp } from './ui.js';

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

// três visões (04/11): Semana (planejado × feito), Mês (calendário) e Evolução (tudo de treino em cartões)
let mode = (() => { try { return localStorage.getItem('rec.trmode') || 'semana'; } catch { return 'semana'; } })();
let monthOff = 0;
export async function renderTrain(screen, api) {
  document.documentElement.style.setProperty('--rec', 'var(--text-3)');
  screen.innerHTML = `
    <header class="top"><h1>Treino</h1></header>
    <div class="seg tr-mode" role="tablist">${[['semana', 'Semana'], ['mes', 'Mês'], ['evolucao', 'Evolução']].map(([k, l]) => `<button role="tab" data-mode="${k}" aria-selected="${k === mode}">${l}</button>`).join('')}</div>
    <div id="tr-body"></div>`;
  screen.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => {
    mode = b.dataset.mode; try { localStorage.setItem('rec.trmode', mode); } catch {}
    screen.querySelectorAll('[data-mode]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    show(screen, api);
  }));
  await show(screen, api);
}
async function show(screen, api) {
  const box = screen.querySelector('#tr-body');
  if (mode === 'evolucao') return renderEvolution(box, api);
  if (mode === 'mes') return monthView(box, api);
  box.innerHTML = `
    <div class="vol-nav">
      <button type="button" data-step="1" aria-label="Semana anterior">‹</button>
      <span id="wk-title"></span>
      <button type="button" data-step="-1" aria-label="Próxima semana">›</button>
    </div>
    <div id="wk-body"><p class="empty">Carregando…</p></div>`;
  box.querySelectorAll('.vol-nav button').forEach((b) => b.addEventListener('click', () => {
    offset = Math.max(0, offset + Number(b.dataset.step)); picked = null; body(screen, api);
  }));
  await body(screen, api);
}

// calendário do mês: cor = modalidade principal, tamanho do círculo = Strain; toque abre a semana do dia
async function monthView(box, api) {
  const now = new Date(Date.now() - 3 * 3600e3), dt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthOff, 1));
  const ym = dt.toISOString().slice(0, 7);
  box.innerHTML = `<div class="vol-nav"><button type="button" data-ms="1" aria-label="Mês anterior">‹</button><span>${cap(dt.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }))}</span><button type="button" data-ms="-1" aria-label="Próximo mês" ${monthOff === 0 ? 'disabled' : ''}>›</button></div><section class="card" id="mo"><p class="empty">Carregando…</p></section>`;
  box.querySelectorAll('[data-ms]').forEach((b) => b.addEventListener('click', () => { monthOff = Math.max(0, monthOff + Number(b.dataset.ms)); monthView(box, api); }));
  let d; try { d = await api(`/api/month?ym=${ym}`); } catch (e) { box.querySelector('#mo').innerHTML = `<p class="empty">Não carregou: ${esc(e.message)}</p>`; return; }
  const max = Math.max(150, ...d.days.map((x) => x.strain));
  const lead = (new Date(d.days[0].date + 'T12:00:00Z').getUTCDay() + 6) % 7;
  const PRI = ['bike', 'corrida', 'natacao', 'hyrox', 'academia', 'outro'];
  const today = now.toISOString().slice(0, 10);
  box.querySelector('#mo').innerHTML = `
    <div class="mo-sum"><div><b>${nf(d.total.hours, 1)} h</b><small>treino</small></div><div><b>${nf(d.total.strain)}</b><small>Strain</small></div><div><b>${d.total.days}</b><small>dias com treino</small></div></div>
    <div class="mo-grid">${['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map((w) => `<span class="mo-w">${w}</span>`).join('')}${'<span></span>'.repeat(lead)}${d.days.map((x) => {
      const sp = PRI.find((p) => x.sports.includes(p)), size = x.strain ? 10 + Math.round((Math.min(x.strain, max) / max) * 22) : 0;
      return `<button type="button" class="mo-d${x.date === today ? ' is-today' : ''}${x.future ? ' fut' : ''}" data-date="${x.date}" ${x.future ? 'disabled' : ''}>
        <span class="mo-n">${Number(x.date.slice(8))}</span>
        ${size ? `<i class="mo-c" style="width:min(${size}px, 78%);background:var(--${sp ?? 'outro'})"></i>` : '<i class="mo-c empty"></i>'}
        ${x.ready != null ? `<em style="background:${readyColor(x.ready)}"></em>` : ''}</button>`;
    }).join('')}</div>
    <p class="mo-leg"><span><i style="background:var(--bike)"></i>Bike</span><span><i style="background:var(--corrida)"></i>Corrida</span><span><i style="background:var(--natacao)"></i>Natação</span><span><i style="background:var(--hyrox)"></i>Hyrox</span><span class="mo-leg-r"><em></em>Prontidão</span></p>
    <p class="note">Círculo maior = mais Strain no dia. O tracinho embaixo tem a cor da Prontidão da manhã. Toque num dia para abrir a semana.</p>`;
  box.querySelectorAll('.mo-d[data-date]').forEach((b) => b.addEventListener('click', () => {
    const dd = b.dataset.date, mon = (iso) => { const t = new Date(iso + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7)); return t; };
    offset = Math.max(0, Math.round((mon(today) - mon(dd)) / (7 * 864e5))); picked = dd; mode = 'semana';
    try { localStorage.setItem('rec.trmode', mode); } catch {}
    const scr = box.closest('.page') ?? box.parentElement; renderTrain(scr, api);
  }));
}

async function body(screen, api) {
  const box = screen.querySelector('#wk-body'); if (!box) return;
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
    <section class="card wk-card">
      ${cardHead('bolt', offset === 0 ? 'Esta semana' : 'Semana', { color: 'var(--strain)', info: 'Strain previsto: minutos planejados × o seu Strain por minuto típico em treinos parecidos (mesma modalidade e zona) dos últimos 120 dias; sem 3 treinos parecidos, vale o do plano ou minutos × peso da zona. Entre 80% e 120% do previsto está no alvo. Na faixa de dias, bolinha cheia: feito; vazada: falta algo.' })}
      <div class="dhero wk-hero">${heroRing({ frac: sm.plannedStrain ? sm.strain / sm.plannedStrain : Math.min(1, sm.strain / 400), text: nf(sm.strain), count: sm.strain, color: 'var(--strain)', size: 'md',
        sub: `${sm.plannedStrain != null ? `de ${nf(sm.plannedStrain)} previsto · ` : ''}${nf(sm.doneHours, 1)}${sm.plannedHours != null ? ` de ${nf(sm.plannedHours, 1)}` : ''} h` })}</div>
      ${sm.dist ? `<div class="wk-dist">${distBar(sm.dist)}</div>` : ''}
      ${w.plan?.fase ? `<p class="wk-fase">${esc(w.plan.fase)}</p>` : ''}
      ${w.plan?.notas ? `<details class="ss-more"><summary>Nota da semana</summary><p class="ss-detail">${esc(w.plan.notas)}</p></details>` : ''}
      ${!w.plan ? '<p class="wk-fase">Plano desta semana ainda não publicado.</p>' : ''}
      <a class="b-link" href="#semana/${w.monday}">Revisão da semana ›</a>
    </section>

    <div id="wk-review"></div>

    <ol class="wk-strip" role="tablist" aria-label="Dias da semana">
      ${w.days.map((d) => {
        // anelzinho por dia: Strain feito contra o previsto, na cor da modalidade principal
        const pS = d.planned.reduce((a, p) => a + (p.plannedStrain ?? 0), 0), dS = d.executed.reduce((a, e) => a + (e.strain ?? 0), 0);
        const sp = (d.executed[0] ?? d.planned[0])?.sport, col = sp ? `var(--${sp}, var(--strain))` : 'var(--text-3)';
        const f = pS ? Math.min(1, dS / pS) : dS ? 1 : 0, C = 2 * Math.PI * 15;
        return `<li><button type="button" role="tab" data-date="${d.date}" aria-selected="${d.date === picked}" class="wd${d.isToday ? ' is-today' : ''}${d.future ? ' is-future' : ''}" aria-label="${day(d.date, { weekday: 'long', day: 'numeric' })}">
          <span class="wd-n">${day(d.date, { weekday: 'narrow' })}</span>
          <svg class="wd-ring" viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15" style="stroke:${pS || dS ? col : 'var(--line)'}" class="wr-t"/>
            ${f ? `<circle cx="18" cy="18" r="15" style="stroke:${col}" class="wr-a" stroke-dasharray="${(C * f).toFixed(1)} ${C.toFixed(1)}"/>` : ''}
            <text x="18" y="22.5" text-anchor="middle">${day(d.date, { day: 'numeric' })}</text></svg>
        </button></li>`;
      }).join('')}
    </ol>

    <section class="card td" id="td">${dayHtml(w.days.find((d) => d.date === picked))}</section>
`;

  // resumo da semana: semanas passadas, e a atual a partir de domingo
  if (offset > 0 || new Date().getDay() === 0) {
    api(`/api/review?monday=${w.monday}`).then((r) => { const el = box.querySelector('#wk-review'); if (el && r.sessions) el.innerHTML = reviewHtml(r, { dist: false }); }).catch(() => {});
  }

  box.querySelectorAll('.wd').forEach((b) => b.addEventListener('click', () => {
    picked = b.dataset.date;
    box.querySelectorAll('.wd').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    box.querySelector('#td').innerHTML = dayHtml(w.days.find((d) => d.date === picked));
  }));
  animateRings(box); countUp(box);
}
