// Aba Tendências: períodos de calendário (semana seg–dom, mês, 3 e 6 meses, 1 ano) com navegação.
import { barChart, fmtDay, lineChart, nf } from './charts.js';

const UNITS = [['semana', 'Semana'], ['mes', 'Mês'], ['3m', '3 meses'], ['6m', '6 meses'], ['ano', '1 ano']];
const SPORTS = ['bike', 'corrida', 'natacao', 'hyrox', 'academia', 'outro'];
const SPORT_LABEL = { bike: 'Bike', corrida: 'Corrida', natacao: 'Natação', hyrox: 'Hyrox', academia: 'Academia', outro: 'Outro' };
export const FORM_ZONES = [
  { max: -30, key: 'risco', label: 'Sobrecarga' },
  { max: -10, key: 'produtivo', label: 'Carregado (produtivo)' },
  { max: 5, key: 'neutro', label: 'Equilibrado' },
  { max: 20, key: 'descansado', label: 'Descansado' },
  { max: Infinity, key: 'perdendo', label: 'Destreinando' },
];
export const zoneOfPct = (p) => (p == null ? null : FORM_ZONES.find((z) => p < z.max));

let unit = 'semana', offset = 0;
try { unit = localStorage.getItem('rec.unit') || 'semana'; if (!UNITS.some(([u]) => u === unit)) unit = 'semana'; } catch {}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const signed = (v, d = 0) => (v == null ? '–' : (v > 0 ? '+' : v < 0 ? '−' : '') + nf(Math.abs(v), d));
const zoneVar = (r) => (r == null ? null : r <= 33 ? 'var(--rec-red)' : r <= 66 ? 'var(--rec-yellow)' : 'var(--rec-green)');
const hm = (h) => { if (h == null) return '–'; const m = Math.round(h * 60); return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`; };
const legend = (keys) => `<div class="legend">${keys.map((k) => `<span><i class="dot s-${k}"></i>${SPORT_LABEL[k]}</span>`).join('')}</div>`;
const row = (k, v) => `<div><span>${k}</span><b>${v}</b></div>`;

function periodTitle(d) {
  const o = { day: 'numeric', month: 'short' };
  const a = new Date(d.start + 'T12:00:00'), b = new Date(d.end + 'T12:00:00');
  if (d.unit === 'mes') { const t = a.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }); return t.charAt(0).toUpperCase() + t.slice(1); }
  const yr = a.getFullYear() !== b.getFullYear() || b.getFullYear() !== new Date().getFullYear();
  const f = (x) => x.toLocaleDateString('pt-BR', yr ? { ...o, year: 'numeric' } : o).replace(/\./g, '');
  const prefix = d.unit === 'semana' && d.offset === 0 ? 'Esta semana, ' : '';
  return `${prefix}${f(a)} – ${f(b)}`;
}

export async function renderTrends(screen, api) {
  document.documentElement.style.setProperty('--rec', 'var(--text-3)');
  screen.innerHTML = `
    <header class="top"><h1>Tendências</h1></header>
    <div class="seg" role="tablist" aria-label="Período">
      ${UNITS.map(([u, l]) => `<button role="tab" data-u="${u}" aria-selected="${u === unit}">${l}</button>`).join('')}
    </div>
    <div class="vol-nav">
      <button type="button" data-step="1" aria-label="Período anterior">‹</button>
      <span id="tr-title"></span>
      <button type="button" data-step="-1" aria-label="Próximo período">›</button>
    </div>
    <div id="tr-body"><p class="empty">Carregando…</p></div>`;
  const seg = screen.querySelector('.seg');
  seg.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    unit = b.dataset.u; offset = 0;
    try { localStorage.setItem('rec.unit', unit); } catch {}
    seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    body(screen, api);
  }));
  screen.querySelectorAll('.vol-nav button').forEach((b) => b.addEventListener('click', () => {
    offset = Math.max(0, offset + Number(b.dataset.step)); body(screen, api);
  }));
  await body(screen, api);
}

async function body(screen, api) {
  const box = screen.querySelector('#tr-body');
  screen.querySelector('.vol-nav [data-step="-1"]').disabled = offset === 0;
  let d;
  try { d = await api(`/api/trends?unit=${unit}&offset=${offset}`); }
  catch (e) { if (e.message !== '401') box.innerHTML = `<p class="empty">Não carregou: ${esc(e.message)}</p>`; return; }
  screen.querySelector('#tr-title').textContent = periodTitle(d);

  const s = d.series, dates = s.map((x) => x.date), now = d.now, dl = now.delta;
  const zone = zoneOfPct(now.formPct);
  const lastLabel = d.last === d.end ? fmtDay(d.end) : 'hoje';
  const multi = d.weeks > 1.01;
  const head = (i) => `<p>${fmtDay(dates[i])}</p>`;

  box.innerHTML = `
    <section class="block">
      <div class="trio">
        <div><span class="big c-fit">${nf(now.fitness)}</span><span class="lab">Fitness</span><span class="delta">${dl ? signed(dl.fitness) : ''}</span></div>
        <div><span class="big c-fat">${nf(now.fatigue)}</span><span class="lab">Fadiga</span><span class="delta">${dl ? signed(dl.fatigue) : ''}</span></div>
        <div><span class="big z-${zone?.key ?? 'neutro'}">${signed(now.formPct)}%</span><span class="lab">Forma</span><span class="delta">${dl?.formPct != null ? `${signed(dl.formPct)} pts` : ''}</span></div>
      </div>
      <p class="note">${zone ? `<b class="z-${zone.key}">${zone.label}</b> em ${esc(lastLabel)}. ` : ''}Embaixo de cada número, quanto mudou no período.</p>
      <details class="explain">
        <summary>O que significa</summary>
        <p><b>Strain</b> é a carga de cada treino: minutos em cada zona de FC do Garmin × peso da zona (Z1 vale 1, Z5 vale 5; abaixo da Z1, 0,5). Cresce com a duração e com a intensidade, e cai para o mesmo treino quando você fica mais condicionado (a FC fica mais baixa).</p>
        <p><b>Fitness</b> é a média do seu Strain dos últimos 42 dias, com mais peso para os dias recentes. A cada dia ele anda 1/42 (2,4%) na direção do Strain do dia: um treino maior que a média sobe o Fitness, um dia de folga desce ~2,4%. Por isso oscila alguns pontos de um dia para o outro e só mostra tendência ao longo de semanas.</p>
        <p><b>Fadiga</b> é a mesma conta com 7 dias. Sobe rápido depois de dias pesados e cai rápido com descanso.</p>
        <p><b>Forma</b> = (Fitness − Fadiga de ontem) ÷ Fitness, em %. É como você acorda, antes do treino do dia. Faixas de referência (Joe Friel, adaptadas pelo intervals.icu): abaixo de −30% sobrecarga; −30% a −10% carregado, a faixa produtiva de um bloco de treino; −10% a +5% equilibrado; +5% a +20% descansado (o que um polimento busca); acima de +20% destreinando. A Forma não diz se você está recuperado hoje: isso é o REC. Ela mede o equilíbrio entre a carga recente e a das últimas semanas.</p>
        <p>Método do TrainingPeaks e do Strava (modelo de Banister). Compare você com você mesmo; a escala é diferente da deles.</p>
      </details>
      <div class="chart-wrap" id="ch-pmc"></div>
      <h3 class="sub">Forma (%)</h3>
      <div class="chart-wrap" id="ch-form"></div>
    </section>

    <section class="block">
      <h2>Strain ${d.daily ? 'por dia' : 'por semana'}</h2>
      <div class="chart-wrap" id="ch-strain"></div>
      <p class="note">Razão aguda/crônica em ${esc(lastLabel)}: <b>${nf(now.acwr, 2)}</b> (Strain dos últimos 7 dias ÷ média semanal de 4 semanas; 0,8–1,4 é a faixa usual).</p>
    </section>

    <section class="block">
      <h2>Volume</h2>
      <ul class="acts sports">
        <li class="head"><span>Modalidade</span><span>Horas</span><span>${multi ? '/semana' : 'Strain'}</span><span>${multi ? 'Strain' : 'Sessões'}</span></li>
        ${d.totals.map((t) => `<li><span><i class="dot s-${t.sport}"></i>${esc(t.label)}</span><span>${hm(t.hours)}</span><span>${multi ? hm(t.perWeek) : nf(t.strain)}</span><span>${multi ? nf(t.strain) : t.sessions}</span></li>`).join('')
          || '<li><span class="empty">Sem treinos neste período.</span></li>'}
        ${d.totals.length ? `<li class="total"><span>Total</span><span>${hm(d.total.hours)}</span><span>${multi ? hm(d.total.hours / d.weeks) : nf(d.total.strain)}</span><span>${multi ? nf(d.total.strain) : d.total.sessions}</span></li>` : ''}
      </ul>
      ${multi ? `<p class="note">${nf(d.total.sessions)} sessões em ${nf(d.weeks, 1)} semanas.</p>` : ''}
    </section>

    <section class="block">
      <h2>Recuperação</h2>
      <h3 class="sub">REC</h3>
      <div class="chart-wrap" id="ch-rec"></div>
      <h3 class="sub"><i class="dot" style="background:var(--hrv)"></i>HRV e base</h3>
      <div class="chart-wrap" id="ch-hrv"></div>
      <h3 class="sub"><i class="dot" style="background:var(--rhr)"></i>FC de repouso e base</h3>
      <div class="chart-wrap" id="ch-rhr"></div>
      <h3 class="sub"><i class="dot" style="background:var(--sleep)"></i>Sono</h3>
      <div class="chart-wrap" id="ch-sleep"></div>
    </section>`;

  lineChart(box.querySelector('#ch-pmc'), [
    { name: 'Fitness', values: s.map((x) => x.fitness), cls: 'fit', label: true },
    { name: 'Fadiga', values: s.map((x) => x.fatigue), cls: 'fat', label: true },
  ], { dates, label: 'Fitness e fadiga', area: '--fitness', tip: (i) => head(i) + row('Fitness', nf(s[i].fitness)) + row('Fadiga', nf(s[i].fatigue)) });

  barChart(box.querySelector('#ch-form'), s.map((x) => x.formPct), {
    dates, height: 80, label: 'Forma em %', yFmt: (v) => `${nf(v)}%`,
    barClass: (i, v) => `bar zb-${zoneOfPct(v)?.key ?? 'neutro'}`,
    tip: (i) => head(i) + row('Forma', s[i].formPct == null ? '–' : `${signed(s[i].formPct)}%`) + (s[i].formPct == null ? '' : row('', zoneOfPct(s[i].formPct).label)),
  });

  const bars = d.bars;
  const barHead = (i) => `<p>${d.daily ? fmtDay(bars[i].start) : `Semana de ${fmtDay(bars[i].start)}`}</p>`;
  const strainTot = (b) => SPORTS.reduce((a, k) => a + (b.strain[k] ?? 0), 0);
  barChart(box.querySelector('#ch-strain'), bars.map((b) => strainTot(b) || null), {
    dates: bars.map((b) => b.start), label: 'Strain', fill: '--strain',
    tip: (i) => barHead(i) + SPORTS.filter((k) => bars[i].strain[k]).map((k) => row(`<i class="dot s-${k}"></i>${SPORT_LABEL[k]}`, nf(bars[i].strain[k]))).join('')
      + row('Total', nf(SPORTS.reduce((a, k) => a + (bars[i].strain[k] ?? 0), 0))),
  });
  lineChart(box.querySelector('#ch-rec'), [{ name: 'REC', values: s.map((x) => x.rec), cls: 'recl' }], { area: '--rec-line',
    dates, range: [0, 100], bands: [[33.5, 66.5]], dots: (i, v) => zoneVar(v), label: 'REC',
    tip: (i) => head(i) + row('REC', s[i].rec ?? '–'),
  });
  lineChart(box.querySelector('#ch-hrv'), [
    { name: 'HRV', values: s.map((x) => x.hrv), cls: 'hrv', label: true },
    { name: 'base', values: s.map((x) => x.hrvBase), cls: 'base', label: true },
  ], { dates, label: 'HRV', area: '--hrv', tip: (i) => head(i) + row('HRV', `${nf(s[i].hrv)} ms`) + row('Base', `${nf(s[i].hrvBase)} ms`) });
  lineChart(box.querySelector('#ch-rhr'), [
    { name: 'FC', values: s.map((x) => x.rhr), cls: 'rhr', label: true },
    { name: 'base', values: s.map((x) => x.rhrBase), cls: 'base', label: true },
  ], { dates, label: 'FC de repouso', area: '--rhr', tip: (i) => head(i) + row('FC', `${nf(s[i].rhr)} bpm`) + row('Base', `${nf(s[i].rhrBase)} bpm`) });
  barChart(box.querySelector('#ch-sleep'), s.map((x) => x.sleep), {
    dates, label: 'Sono', refs: [{ v: 7.5, label: '7,5 h' }], yFmt: (v) => `${nf(v)} h`, fill: '--sleep',
    tip: (i) => head(i) + row('Sono', hm(s[i].sleep)),
  });
}
