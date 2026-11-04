// Detalhe de um treino: números, para que serviu (efeito de treino da Garmin + zonas), carga e efeito no REC.
import { allStats } from './share.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = (v, d = 0) => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const ZN = ['Abaixo da Z1', 'Z1', 'Z2', 'Z3', 'Z4', 'Z5'];
const recKey = (r) => (r == null ? null : r <= 33 ? 'red' : r <= 66 ? 'yellow' : 'green');

// benefício principal (nomes da Garmin) → o que o treino desenvolve
const BENEFIT = {
  RECOVERY: ['Recuperação', 'Esforço bem leve: ajuda o corpo a circular sem somar cansaço.'],
  AEROBIC_BASE: ['Base aeróbica', 'Desenvolve resistência e o uso de gordura como combustível. É o grosso do treino de um 70.3.'],
  TEMPO: ['Ritmo (tempo)', 'Treina sustentar um esforço moderado a forte por mais tempo, perto do ritmo de prova de um 70.3.'],
  LACTATE_THRESHOLD: ['Limiar', 'Aumenta o ritmo que você aguenta por muito tempo sem acumular lactato.'],
  VO2MAX: ['VO2máx', 'Aumenta a capacidade aeróbica máxima: esforços de poucos minutos bem fortes.'],
  ANAEROBIC_CAPACITY: ['Capacidade anaeróbica', 'Esforços curtos acima do limiar (tiros, estações de Hyrox): tolerância a acidez e potência.'],
  SPEED: ['Velocidade', 'Tiros curtos e máximos: força e coordenação em alta velocidade.'],
  NO_BENEFIT: ['Sem benefício de treino', 'Pouco estímulo para mudar o condicionamento.'],
};
function benefitKey(label) {
  if (!label) return null;
  let k = String(label).toUpperCase().replace(/^(IMPROVING|MAINTAINING|HIGHLY_IMPROVING|IMPACTING|OVERREACHING)_/, '').replace(/_\d+$/, '');
  if (k === 'ANAEROBIC') k = 'ANAEROBIC_CAPACITY';
  if (k === 'THRESHOLD') k = 'LACTATE_THRESHOLD';
  return BENEFIT[k] ? k : null;
}
// sem o rótulo da Garmin: pela distribuição das zonas
function benefitFromZones(z, min) {
  if (!z) return null;
  const t = z.reduce((a, b) => a + b, 0) || 1, p = z.map((m) => m / t);
  if (p[5] >= 0.08) return 'VO2MAX';
  if (p[4] >= 0.2) return 'LACTATE_THRESHOLD';
  if (p[3] >= 0.3) return 'TEMPO';
  if ((min ?? 0) < 40 && p[0] + p[1] >= 0.8) return 'RECOVERY';
  return 'AEROBIC_BASE';
}
// escala do efeito de treino (Garmin, 0–5)
const TE = (v) => (v == null ? null : v < 1 ? 'Sem efeito' : v < 2 ? 'Efeito pequeno' : v < 3 ? 'Mantém' : v < 4 ? 'Melhora' : v < 5 ? 'Melhora muito' : 'Excessivo');

function teBar(label, v) {
  if (v == null) return '';
  return `<div class="te-row"><div class="te-top"><span>${label}</span><b>${nf(v, 1)}</b><em>${TE(v)}</em></div>
    <div class="te-bar"><i style="width:${Math.min(100, (v / 5) * 100)}%"></i>${[1, 2, 3, 4].map((x) => `<s style="left:${x * 20}%"></s>`).join('')}</div></div>`;
}

export async function renderActivity(screen, api, id) {
  document.documentElement.style.setProperty('--rec', 'var(--text-3)');
  screen.innerHTML = '<header class="top"><h1>Treino</h1></header><p class="empty">Carregando…</p>';
  let a;
  try { a = await api(`/api/activity?id=${encodeURIComponent(id)}`); } catch (e) { screen.querySelector('.empty').textContent = `Não carregou: ${e.message}`; return; }
  const date = new Date(a.date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  const title = a.name && a.name.toLowerCase() !== a.label.toLowerCase() ? a.name : a.label;
  const bk = benefitKey(a.teLabel) ?? benefitFromZones(a.zones, a.min);
  const [bName, bTxt] = bk ? BENEFIT[bk] : [null, null];
  const fromGarmin = !!benefitKey(a.teLabel);
  const stats = allStats(a).filter((s) => s.key !== 'te'); // efeito de treino já aparece em "Para que serviu"
  const z = a.zones, zt = z ? z.reduce((x, y) => x + y, 0) || 1 : 1;
  const low = z ? Math.round(((z[0] + z[1] + z[2]) / zt) * 100) : null, high = z ? Math.round(((z[4] + z[5]) / zt) * 100) : null;
  const dRec = a.rec != null && a.recNext != null ? a.recNext - a.rec : null;
  const rel = a.strainVsDay == null ? '' : a.strainVsDay >= 1.05 ? `${nf(a.strainVsDay, 1)}× o seu dia médio` : a.strainVsDay >= 0.95 ? 'igual ao seu dia médio' : `${Math.round(a.strainVsDay * 100)}% do seu dia médio`;
  const sizeTxt = a.strainVsDay == null ? '' : a.strainVsDay < 0.5 ? 'Treino leve para o seu volume.' : a.strainVsDay < 1.25 ? 'Treino de tamanho normal para você.' : a.strainVsDay < 2 ? 'Treino pesado para o seu volume.' : 'Treino muito pesado para o seu volume.';

  screen.innerHTML = `
    <header class="top"><h1>Treino</h1><a class="foot-link" href="#" data-back>Voltar</a></header>
    <section class="ad-hero" style="--c: var(--${esc(a.sport)})">
      <p class="sh-sport"><i></i>${esc(a.label)}${a.indoor ? ' · indoor' : ''}</p>
      <h2 class="ad-title">${esc(title)}</h2>
      <p class="ad-date">${esc(date.charAt(0).toUpperCase() + date.slice(1))} · ${esc(a.time ?? '')}</p>
    </section>

    ${bName ? `<section class="ad-card ad-benefit">
      <span class="ad-lab">Para que serviu</span>
      <b>${esc(bName)}</b>
      <p>${esc(bTxt)}</p>
      ${teBar('Efeito aeróbico', a.teAer)}${teBar('Efeito anaeróbico', a.teAna)}
      ${z ? `<p class="ad-note">${low}% do tempo até a Z2${high ? `, ${high}% em Z4–Z5` : ''}.</p>` : ''}
      <p class="ad-src">${fromGarmin ? 'Benefício principal e efeito de treino calculados pela Garmin (0 a 5: 2 mantém, 3 melhora, 4 melhora muito).' : 'Benefício estimado pelas zonas de FC (a Garmin não mandou o rótulo deste treino).'}</p>
    </section>` : ''}

    <section class="ad-card">
      <span class="ad-lab">Carga</span>
      <div class="ad-load">
        ${a.strain != null ? `<div><b class="c-strain">${a.strain}</b><small>Strain${rel ? `, ${rel}` : ''}</small></div>` : ''}
        ${a.garminLoad != null ? `<div><b>${a.garminLoad}</b><small>Carga Garmin (EPOC)</small></div>` : ''}
      </div>
      ${sizeTxt ? `<p class="ad-note">${sizeTxt} Seu dia médio (Fitness) era ${a.fitness ?? '–'}.</p>` : ''}
      ${a.plan ? `<p class="ad-note">Plano: ${esc(a.plan.titulo ?? '')}${a.plan.minutos ? `, ${a.plan.minutos} min` : ''}${a.plan.zona ? ` ${esc(a.plan.zona)}` : ''}${a.plan.strain != null && a.strain != null ? ` · Strain previsto ${a.plan.strain}, feito ${a.strain} (${Math.round((a.strain / a.plan.strain) * 100)}%)` : ''}.</p>` : ''}
    </section>

    <section class="ad-card">
      <span class="ad-lab">Números</span>
      <div class="ad-grid">${stats.map((s) => `<div><span>${esc(s.k)}</span><b>${esc(s.v)}${s.u ? `<small>${esc(s.u)}</small>` : ''}</b></div>`).join('')}</div>
    </section>

    ${z ? `<section class="ad-card">
      <span class="ad-lab">Tempo em cada zona</span>
      <div class="sh-zbar">${z.map((m, i) => (m ? `<i class="zc-${i}" style="flex:${m}"></i>` : '')).join('')}</div>
      <ul class="ad-zones">${z.map((m, i) => (m ? `<li><i class="zc-${i}"></i><span>${ZN[i]}</span><b>${m} min</b><em>${Math.round((m / zt) * 100)}%</em></li>` : '')).join('')}</ul>
    </section>` : ''}

    ${a.rec != null || a.form != null ? `<section class="ad-card">
      <span class="ad-lab">Corpo</span>
      <div class="ad-load">
        ${a.rec != null ? `<div><b style="color:var(--rec-${recKey(a.rec)})">${a.rec}</b><small>REC da manhã</small></div>` : ''}
        ${a.recNext != null ? `<div><b style="color:var(--rec-${recKey(a.recNext)})">${a.recNext}</b><small>REC no dia seguinte${dRec != null ? ` (${dRec > 0 ? '+' : dRec < 0 ? '−' : ''}${Math.abs(dRec)})` : ''}</small></div>` : ''}
        ${a.form != null ? `<div><b class="z-${a.formZone?.key ?? 'neutro'}">${a.form > 0 ? '+' : a.form < 0 ? '−' : ''}${Math.abs(a.form)}%</b><small>Forma${a.formZone ? `, ${esc(a.formZone.label.toLowerCase())}` : ''}</small></div>` : ''}
      </div>
      ${a.recNext != null ? '<p class="ad-src">O REC do dia seguinte depende mais do sono e do resto do dia do que do treino.</p>' : ''}
    </section>` : ''}

    <a class="btn ghost ad-share" href="#card/${encodeURIComponent(a.id)}">Cartão para compartilhar</a>`;
  screen.querySelector('[data-back]').addEventListener('click', (e) => { e.preventDefault(); if (history.length > 1) history.back(); else location.hash = '#hoje'; });
}
