// Aba Tendências: Forma (Fitness/Fadiga), carga, Strain e recuperação.
import { barChart, fmtDay, lineChart, nf } from './charts.js';

const RANGES = [[7, '7 d'], [30, '30 d'], [90, '90 d'], [365, '1 ano']];
let current = 7;
try { current = Number(localStorage.getItem('rec.range')) || 7; } catch {}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const signed = (v, d = 0) => (v == null ? '–' : (v > 0 ? '+' : v < 0 ? '−' : '') + nf(Math.abs(v), d));
const zoneVar = (r) => (r == null ? null : r <= 33 ? 'var(--rec-red)' : r <= 66 ? 'var(--rec-yellow)' : 'var(--rec-green)');
const hm = (h) => { if (h == null) return '–'; const m = Math.round(h * 60); return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`; };

export async function renderTrends(screen, api) {
  document.documentElement.style.setProperty('--rec', 'var(--text-3)');
  screen.innerHTML = `
    <header class="top"><h1>Tendências</h1></header>
    <div class="seg" role="tablist" aria-label="Período">
      ${RANGES.map(([d, l]) => `<button role="tab" data-d="${d}" aria-selected="${d === current}">${l}</button>`).join('')}
    </div>
    <div id="tr-body"><p class="empty">Carregando…</p></div>`;
  screen.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => {
    current = Number(b.dataset.d);
    try { localStorage.setItem('rec.range', String(current)); } catch {}
    screen.querySelectorAll('.seg button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    body(screen, api);
  }));
  await body(screen, api);
}

async function body(screen, api) {
  const box = screen.querySelector('#tr-body');
  let d;
  try { d = await api(`/api/trends?days=${current}`); }
  catch (e) { if (e.message !== '401') box.innerHTML = `<p class="empty">Não carregou: ${esc(e.message)}</p>`; return; }
  const s = d.series, dates = s.map((x) => x.date), now = d.now;
  const formRead = now.form == null ? '' : now.form <= -20 ? 'Muito carregado agora.' : now.form < -5 ? 'Carregado: fadiga acima do fitness.' : now.form <= 5 ? 'Equilibrado.' : now.form <= 25 ? 'Descansado.' : 'Muito descansado: fitness tende a cair se durar.';

  box.innerHTML = `
    <section class="block">
      <div class="trio">
        <div><span class="big">${nf(now.fitness)}</span><span class="lab">Fitness</span></div>
        <div><span class="big">${nf(now.fatigue)}</span><span class="lab">Fadiga</span></div>
        <div><span class="big">${signed(now.form)}</span><span class="lab">Forma</span></div>
      </div>
      <p class="note">${esc(formRead)}${now.ramp ? ` Fitness ${signed(now.ramp.pct, 1)}% em 7 dias.` : ''}</p>
      <details class="explain">
        <summary>O que significa</summary>
        <p><b>Fitness</b> é a média da sua carga dos últimos 42 dias, com mais peso para os dias recentes. Sobe devagar quando você treina com constância e cai devagar quando para. É o seu condicionamento acumulado.</p>
        <p><b>Fadiga</b> é a mesma conta com 7 dias. Sobe rápido depois de dias pesados e cai rápido com descanso.</p>
        <p><b>Forma</b> = Fitness − Fadiga de ontem, ou seja, como você acorda antes do treino do dia. Negativa: você está carregando mais do que está acostumado (normal em bloco de treino). Perto de zero: equilíbrio. Positiva: descansado; é o que um polimento faz antes da prova.</p>
        <p><b>Ritmo</b> é quanto o Fitness mudou em 7 dias. Subidas rápidas e longas aumentam o risco de excesso.</p>
        <p>Método do TrainingPeaks e do Strava (modelo de Banister), aplicado à carga do Garmin. Os números absolutos não se comparam com os do TrainingPeaks, porque a escala da carga é outra; compare você com você mesmo.</p>
      </details>
      <div class="chart-wrap" id="ch-pmc"></div>
      <h3 class="sub">Forma</h3>
      <div class="chart-wrap" id="ch-form"></div>
    </section>

    <section class="block">
      <h2>Carga ${d.weekly ? 'por semana' : 'por dia'}</h2>
      <div class="chart-wrap" id="ch-load"></div>
      <p class="note">Razão aguda/crônica: <b>${nf(now.acwr, 2)}</b> (faixa do Garmin: 0,8–1,4).</p>
      <ul class="acts sports">
        <li class="head"><span>Modalidade</span><span>Horas</span><span>Carga</span><span>Sessões</span></li>
        ${d.sports.map((x) => `<li><span>${esc(x.label)}</span><span>${hm(x.hours)}</span><span>${nf(x.load)}</span><span>${x.sessions}</span></li>`).join('') || '<li><span class="empty">Sem treinos no período.</span></li>'}
      </ul>
      <p class="note">A carga do Garmin pesa intensidade: 1 h de Hyrox vale cerca de 8 h de bike em Z2. Por isso as horas ficam ao lado.</p>
    </section>

    <section class="block">
      <h2>Strain</h2>
      <p class="note">Quanto cada dia pesou em relação a um dia pesado seu. A linha tracejada é 100 (carga ${nf(now.hard)} no Garmin).</p>
      <div class="chart-wrap" id="ch-strain"></div>
    </section>

    <section class="block">
      <h2>REC</h2>
      <div class="chart-wrap" id="ch-rec"></div>
      <h3 class="sub">HRV e base</h3>
      <div class="chart-wrap" id="ch-hrv"></div>
      <h3 class="sub">FC de repouso e base</h3>
      <div class="chart-wrap" id="ch-rhr"></div>
      <h3 class="sub">Sono</h3>
      <div class="chart-wrap" id="ch-sleep"></div>
    </section>`;

  const row = (k, v) => `<div><span>${k}</span><b>${v}</b></div>`;
  const head = (i) => `<p>${fmtDay(dates[i])}</p>`;

  lineChart(box.querySelector('#ch-pmc'), [
    { name: 'Fitness', values: s.map((x) => x.fitness), cls: 'l1', label: true },
    { name: 'Fadiga', values: s.map((x) => x.fatigue), cls: 'l2', label: true },
  ], { dates, label: 'Fitness e fadiga', tip: (i) => head(i) + row('Fitness', nf(s[i].fitness)) + row('Fadiga', nf(s[i].fatigue)) });

  barChart(box.querySelector('#ch-form'), s.map((x) => x.form), {
    dates, height: 70, label: 'Forma', tip: (i) => head(i) + row('Forma', signed(s[i].form)),
  });

  const bars = d.bars;
  barChart(box.querySelector('#ch-load'), bars.map((b) => b.load), {
    dates: bars.map((b) => b.start), highlightLast: true, label: 'Carga',
    tip: (i) => `<p>${d.weekly ? 'Semana de ' : ''}${fmtDay(bars[i].start)}</p>` + row('Carga', nf(bars[i].load)) + row('Horas', hm(bars[i].hours)),
  });

  barChart(box.querySelector('#ch-strain'), s.map((x) => x.strain), {
    dates, label: 'Strain', refs: [{ v: 100, label: '100' }],
    tip: (i) => head(i) + row('Strain', nf(s[i].strain)) + row('Carga', nf(s[i].load)),
  });

  lineChart(box.querySelector('#ch-rec'), [{ name: 'REC', values: s.map((x) => x.rec), cls: 'l3' }], {
    dates, range: [0, 100], bands: [[33.5, 66.5]], dots: (i, v) => zoneVar(v), label: 'REC',
    tip: (i) => head(i) + row('REC', s[i].rec ?? '–'),
  });
  lineChart(box.querySelector('#ch-hrv'), [
    { name: 'HRV', values: s.map((x) => x.hrv), cls: 'l1', label: true },
    { name: 'base', values: s.map((x) => x.hrvBase), cls: 'base', label: true },
  ], { dates, label: 'HRV', yFmt: (v) => nf(v), tip: (i) => head(i) + row('HRV', `${nf(s[i].hrv)} ms`) + row('Base', `${nf(s[i].hrvBase)} ms`) });
  lineChart(box.querySelector('#ch-rhr'), [
    { name: 'FC', values: s.map((x) => x.rhr), cls: 'l1', label: true },
    { name: 'base', values: s.map((x) => x.rhrBase), cls: 'base', label: true },
  ], { dates, label: 'FC de repouso', tip: (i) => head(i) + row('FC', `${nf(s[i].rhr)} bpm`) + row('Base', `${nf(s[i].rhrBase)} bpm`) });
  barChart(box.querySelector('#ch-sleep'), s.map((x) => x.sleep), {
    dates, label: 'Sono', refs: [{ v: 7.5, label: '7,5 h' }], yFmt: (v) => `${nf(v)} h`,
    tip: (i) => head(i) + row('Sono', hm(s[i].sleep)),
  });
}
