// Telas novas (04/11): a noite em detalhe (#sono/<data>) e a revisão da semana (#semana/<segunda>).
import { nf } from './charts.js';
import { cardHead, readyColor, heroRing, animateRings, countUp } from './ui.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hm = (h) => { if (h == null) return '–'; const m = Math.round(h * 60); return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`; };
const mm = (min) => (min == null ? '–' : min >= 60 ? `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, '0')}` : `${Math.round(min)} min`);
const clock = (m) => { const x = ((Math.round(m) % 1440) + 1440) % 1440; return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`; };
const fmtDate = (iso, o) => { const t = new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', o).replace(/\./g, ''); return t.charAt(0).toUpperCase() + t.slice(1); };
const addIso = (iso, n) => { const t = new Date(iso + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };

// ---------- a noite em detalhe (estilo Oura) ----------
const ST = [
  { k: 'awake', l: 'Acordado', c: '#e8d9c4', row: 0 },
  { k: 'rem', l: 'REM', c: '#86c3f2', row: 1 },
  { k: 'light', l: 'Leve', c: '#8f86d9', row: 2 },
  { k: 'deep', l: 'Profundo', c: '#4b3fa8', row: 3 },
];
const LV = { 0: 3, 1: 2, 2: 1, 3: 0 }; // fase da Garmin → linha do gráfico

export async function renderSleep(screen, api, date) {
  document.documentElement.style.setProperty('--rec', 'var(--sleep)');
  const nav = (n) => { const d = addIso(date, n), today = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10); return d > today ? null : d; };
  screen.innerHTML = `<header class="top"><a class="back-link" href="#hoje">‹ Hoje</a></header><p class="empty">Carregando…</p>`;
  let d; try { d = await api(`/api/sleep?date=${date}`); } catch (e) { screen.querySelector('.empty').textContent = `Não carregou: ${e.message}`; return; }
  const n = d.night, s = d.stages, a = d.avg14, prev = nav(-1), next = nav(1);
  const start = n?.start ? Number(n.start.slice(11, 13)) * 60 + Number(n.start.slice(14, 16)) : null;
  const end = n?.end ? Number(n.end.slice(11, 13)) * 60 + Number(n.end.slice(14, 16)) : null;

  // hipnograma: 4 linhas (acordado em cima, profundo embaixo), blocos coloridos por fase
  let hyp = '';
  if (s?.levels?.length) {
    const t0 = s.levels[0][0], t1 = s.levels[s.levels.length - 1][1], W = 340, RH = 26, H = RH * 4;
    const X = (m) => ((m - t0) / (t1 - t0)) * W;
    const blocks = s.levels.map(([a1, b1, lv]) => { const r = LV[lv], c = ST[r]; return `<rect x="${X(a1).toFixed(1)}" y="${r * RH + 3}" width="${Math.max(1, X(b1) - X(a1)).toFixed(1)}" height="${RH - 6}" rx="3" style="fill:${c.c}"/>`; }).join('');
    const hrs = []; for (let h = Math.ceil(t0 / 60) * 60; h <= t1; h += 120) hrs.push(h);
    const ticks = hrs.map((h) => `<text x="${X(h).toFixed(1)}" y="${H + 14}" class="ax" text-anchor="middle">${clock(h).slice(0, 5)}</text>`).join('');
    const hr = s.hr?.length ? (() => {
      const vs = s.hr.map((p) => p[1]), lo = Math.min(...vs) - 2, hi = Math.max(...vs) + 2, HH = 60, Y = (v) => H + 28 + HH - ((v - lo) / (hi - lo)) * HH;
      const path = s.hr.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join('');
      const minI = vs.indexOf(Math.min(...vs));
      return `<path d="${path}" class="sl-hr"/><circle cx="${X(s.hr[minI][0]).toFixed(1)}" cy="${Y(vs[minI]).toFixed(1)}" r="3" class="sl-hr-min"/><text x="${X(s.hr[minI][0]).toFixed(1)}" y="${(Y(vs[minI]) + 14).toFixed(1)}" class="ax" text-anchor="middle">${vs[minI]} bpm</text>`;
    })() : '';
    hyp = `<svg viewBox="0 0 ${W} ${H + (s.hr?.length ? 108 : 20)}" class="chart sl-hyp" role="img" aria-label="Fases do sono">${ST.map((c, i) => `<line x1="0" x2="${W}" y1="${i * RH + RH / 2}" y2="${i * RH + RH / 2}" class="sl-gl"/>`).join('')}${blocks}${ticks}${hr}</svg>
      ${s.hr?.length ? '<p class="sl-cap">FC durante a noite (ponto = a mais baixa)</p>' : ''}`;
  }
  const tot = s ? (s.deep ?? 0) + (s.light ?? 0) + (s.rem ?? 0) : 0;
  const stageRows = s ? ST.map((c) => {
    const v = s[c.k], avg = a[c.k], pct = tot && c.k !== 'awake' ? Math.round((v / tot) * 100) : null;
    const diff = v != null && avg != null ? Math.round(v - avg) : null;
    return `<li><i style="background:${c.c}"></i><span>${c.l}</span><b>${mm(v)}</b><em>${pct != null ? `${pct}%` : ''}</em><small>${diff == null ? '' : diff === 0 ? 'igual às 14 noites' : `${diff > 0 ? '+' : '−'}${mm(Math.abs(diff))} vs. 14 noites`}</small></li>`;
  }).join('') : '';

  screen.innerHTML = `
    <header class="top"><a class="back-link" href="#hoje">‹ Hoje</a>
      <span class="sl-nav">${prev ? `<a href="#sono/${prev}" aria-label="Noite anterior">‹</a>` : ''}${next ? `<a href="#sono/${next}" aria-label="Noite seguinte">›</a>` : ''}</span></header>
    <section class="sl-hero">
      <p class="sl-date">Noite de ${esc(fmtDate(addIso(date, -1), { weekday: 'long', day: 'numeric', month: 'long' }).toLowerCase())} para ${esc(fmtDate(date, { weekday: 'long' }).toLowerCase())}</p>
      ${heroRing({ frac: n?.h && d.need ? n.h / d.need : 0, text: n?.h == null ? '–' : hm(n.h).replace(/ /g, ''), color: 'var(--sleep)', stops: ['#5d4fd1', '#9d8cff', '#cfc6ff'], size: 'md', empty: n?.h == null })}
      <p class="sl-meta">${start != null && end != null ? `${clock(start)} → ${clock(end)} · ` : ''}base ${hm(d.need)}${n?.score != null ? ` · score Garmin ${n.score}` : ''}${a.h != null ? ` · média de 14 noites ${hm(a.h)}` : ''}</p>
    </section>
    <section class="card" id="sl-tonight" hidden></section>
    <section class="card">${cardHead('moon', 'Fases', { color: 'var(--sleep)', info: 'Fases e FC da noite vindas da Garmin. A comparação usa as 14 noites anteriores com fases registradas.' })}
      ${s ? `${hyp}<ul class="sl-st">${stageRows}</ul>` : '<p class="empty">Sem fases desta noite. As fases passam a ser guardadas a partir de hoje; para noites antigas, Ajustes → Garmin → Avançado → Buscar de novo os últimos 90 dias.</p>'}
    </section>
    <section class="card">${cardHead('heart', 'Corpo durante a noite', { color: 'var(--hrv)' })}
      <div class="fs-grid fs-2">
        <div><small>HRV</small><b>${d.hrv?.v != null ? `${Math.round(d.hrv.v)} ms` : '–'}</b><em>${d.hrv?.base != null ? `base ${Math.round(d.hrv.base)} ms` : ''}</em></div>
        <div><small>FC de repouso</small><b>${d.rhr?.v != null ? `${Math.round(d.rhr.v)} bpm` : '–'}</b><em>${d.rhr?.base != null ? `base ${nf(d.rhr.base, 1)} bpm` : ''}</em></div>
        ${n?.resp != null ? `<div><small>Respiração</small><b>${nf(n.resp, 1)}</b><em>rpm</em></div>` : ''}
        ${n?.nap ? `<div><small>Cochilo do dia</small><b>${mm(n.nap * 60)}</b><em></em></div>` : ''}
      </div>
    </section>`;
  animateRings(screen);
  // noite de hoje: meta, horário de deitar, dívida e regularidade (vem do Hoje)
  const today = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
  if (date === today) api(`/api/today?date=${date}`).then((t) => {
    const box = screen.querySelector('#sl-tonight'), sl = t.sleep; if (!box || !sl) return;
    const ex = [sl.need.fromLoad >= 1 / 60 ? `carga +${Math.round(sl.need.fromLoad * 60)} min` : null, sl.need.fromDebt >= 1 / 60 ? `dívida +${Math.round(sl.need.fromDebt * 60)} min` : null,
      sl.need.fromStrain >= 1 / 60 ? `treino +${Math.round(sl.need.fromStrain * 60)} min` : null, sl.need.nap >= 1 / 60 ? `cochilo −${Math.round(sl.need.nap * 60)} min` : null].filter(Boolean);
    box.innerHTML = `${cardHead('clock', 'Hoje à noite', { color: 'var(--sleep)' })}
      <div class="fs-grid fs-2"><div><small>Meta</small><b>${hm(sl.need.total)}</b><em>base ${hm(sl.personalNeed)}${ex.length ? ` + ${ex.join(', ')}` : ''}</em></div>
        <div><small>Deitar até</small><b style="color:var(--sleep)">${sl.bedtime ? esc(sl.bedtime.bedtime) : '–'}</b><em>${sl.bedtime ? `para acordar ~${esc(sl.bedtime.wake)}` : ''}</em></div>
        <div><small>Dívida (14 dias)</small><b>${sl.debt == null ? '–' : sl.debt < 1 / 6 ? 'nenhuma' : hm(sl.debt)}</b><em>${sl.level && sl.level.key !== 'nenhuma' ? esc(sl.level.label) : ''}</em></div>
        <div><small>Regularidade</small><b>${sl.regularityScore ?? '–'}</b><em>${sl.regularity ? `deita ~${sl.regularity.bedtime}, acorda ~${sl.regularity.wake}` : ''}</em></div></div>`;
    box.hidden = false;
  }).catch(() => {});
}

// ---------- revisão da semana (tela própria) ----------
export async function renderWeekReview(screen, api, monday) {
  document.documentElement.style.setProperty('--rec', 'var(--text-3)');
  screen.innerHTML = `<header class="top"><a class="back-link" href="#treino">‹ Treino</a></header><p class="empty">Carregando…</p>`;
  let r; try { r = await api(`/api/review?monday=${monday}`); } catch (e) { screen.querySelector('.empty').textContent = `Não carregou: ${e.message}`; return; }
  const h = r.highlights ?? {};
  const dd = (iso) => fmtDate(iso, { weekday: 'short', day: 'numeric' });
  const delta = h.ready != null && h.readyPrev != null ? h.ready - h.readyPrev : null;
  const maxS = Math.max(100, ...(h.days ?? []).map((x) => x.strain));
  const prevM = addIso(monday, -7), nextM = addIso(monday, 7), today = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
  screen.innerHTML = `
    <header class="top"><a class="back-link" href="#treino">‹ Treino</a><span class="sl-nav"><a href="#semana/${prevM}" aria-label="Semana anterior">‹</a>${nextM <= today ? `<a href="#semana/${nextM}" aria-label="Próxima semana">›</a>` : ''}</span></header>
    <section class="sl-hero"><p class="sl-date">Semana de ${esc(fmtDate(monday, { day: 'numeric', month: 'long' }))} a ${esc(fmtDate(r.sunday, { day: 'numeric', month: 'long' }))}</p>
      <b class="sl-total" style="color:${h.ready != null ? readyColor(h.ready) : 'var(--text)'}">${h.ready ?? '–'}<small>%</small></b>
      <p class="sl-meta">Prontidão média${delta != null ? ` · ${delta === 0 ? 'igual à' : `${delta > 0 ? '+' : '−'}${Math.abs(delta)} pontos vs.`} semana anterior` : ''}</p></section>
    <section class="card">${cardHead('bolt', 'Dia a dia', { color: 'var(--strain)' })}
      <div class="wr-days">${(h.days ?? []).map((x) => `<div class="wr-d"><span class="wr-bar"><i style="height:${Math.max(3, (x.strain / maxS) * 100)}%"></i></span><b style="color:${x.ready != null ? readyColor(x.ready) : 'var(--text-3)'}">${x.ready ?? '–'}</b><small>${esc(fmtDate(x.date, { weekday: 'narrow' }))}</small></div>`).join('')}</div>
      <p class="sl-cap">Barra = Strain do dia · número = Prontidão da manhã</p></section>
    <div class="wr-hl">
      <section class="card wr-c"><small>Melhor dia</small><b style="color:${h.best ? readyColor(h.best.ready) : 'var(--text)'}">${h.best ? `${h.best.ready}%` : '–'}</b><em>${h.best ? esc(dd(h.best.date)) : ''}</em></section>
      <section class="card wr-c"><small>Pior noite</small><b style="color:var(--sleep)">${h.worstNight ? hm(h.worstNight.h) : '–'}</b><em>${h.worstNight ? esc(dd(h.worstNight.date)) : ''}</em></section>
      ${h.heaviest ? `<a class="card wr-c wr-wide" href="#atv/${encodeURIComponent(h.heaviest.id)}"><small>Treino mais pesado</small><b style="color:var(--strain)">${h.heaviest.strain}</b><em>${esc(h.heaviest.label)} · ${mm(h.heaviest.min)} · ${esc(dd(h.heaviest.date))} ›</em></a>` : ''}
    </div>
    <section class="card">${cardHead('stopwatch', 'Números da semana', { color: 'var(--text-2)' })}
      <div class="fs-grid fs-2">
        <div><small>Treino</small><b>${nf(r.hours, 1)} h</b><em>${r.sessions} sessões</em></div>
        <div><small>Strain</small><b>${nf(r.strain)}</b><em>${r.band ? `faixa ${nf(r.band.lo)}–${nf(r.band.hi)}` : ''}</em></div>
        <div><small>Sono médio</small><b>${hm(r.sleep)}</b><em>base ${hm(r.sleepNeed)}</em></div>
        <div><small>HRV médio</small><b>${r.hrv != null ? `${Math.round(r.hrv)} ms` : '–'}</b><em>${r.hrvBase != null ? `base ${Math.round(r.hrvBase)} ms` : ''}</em></div>
      </div>
      ${r.sports?.length ? `<p class="sl-cap">${r.sports.map((x) => `${esc(x.label)} ${nf(x.hours, 1)} h`).join(' · ')}</p>` : ''}
    </section>
    ${r.text ? `<section class="card">${cardHead('book', 'Do chat de treino', { color: 'var(--accent)' })}<div class="rv-text">${esc(r.text).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n{2,}/g, '<br><br>').replace(/\n/g, '<br>')}</div></section>` : ''}`;
}
