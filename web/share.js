// Cartão do treino para postar (story 9:16). Abre ao tocar num treino.
// v2 (04/11): escolher quais números aparecem (guardado no aparelho) e "Salvar imagem" (PNG 1080×1920
// desenhado em canvas; no iPhone abre a folha de compartilhar: salvar em Fotos, Instagram, WhatsApp).
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = (v, d = 0) => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const ZN = ['<Z1', 'Z1', 'Z2', 'Z3', 'Z4', 'Z5'];
const recKey = (r) => (r == null ? null : r <= 33 ? 'red' : r <= 66 ? 'yellow' : 'green');
const MAX = 6;

function dur(m) {
  const s = Math.round(m * 60), h = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
  return h ? `${h}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${mm}:${String(ss).padStart(2, '0')}`;
}
const mmss = (p) => { const s = Math.round(p * 60); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

/** Todos os números possíveis deste treino (os que existem). */
function allStats(a) {
  const out = [{ key: 'dur', k: 'Duração', v: dur(a.min) }];
  if (a.km >= 0.3) out.push({ key: 'dist', k: 'Distância', v: a.sport === 'natacao' ? nf(a.km * 1000) : nf(a.km, 2), u: a.sport === 'natacao' ? 'm' : 'km' });
  if (a.km >= 0.3 && a.min) {
    if (a.sport === 'corrida') out.push({ key: 'pace', k: 'Ritmo médio', v: mmss(a.min / a.km), u: '/km' });
    else if (a.sport === 'natacao') out.push({ key: 'pace', k: 'Ritmo médio', v: mmss(a.min / (a.km * 10)), u: '/100 m' });
    else if (a.sport === 'bike') out.push({ key: 'pace', k: 'Velocidade média', v: nf(a.km / (a.min / 60), 1), u: 'km/h' });
  }
  if (a.kcal != null) out.push({ key: 'kcal', k: a.kcalActive ? 'Calorias ativas' : 'Calorias', v: nf(a.kcal), u: 'kcal' });
  if (a.avghr) out.push({ key: 'hr', k: 'FC média', v: String(Math.round(a.avghr)), u: 'bpm' });
  if (a.maxhr) out.push({ key: 'maxhr', k: 'FC máxima', v: String(Math.round(a.maxhr)), u: 'bpm' });
  if (a.power) out.push({ key: 'power', k: 'Potência média', v: String(a.power), u: 'W' });
  if (a.elev >= 5 && !a.indoor) out.push({ key: 'elev', k: 'Subida', v: nf(a.elev), u: 'm' });
  if (a.cadence) out.push({ key: 'cad', k: 'Cadência', v: String(a.cadence), u: a.sport === 'corrida' ? 'ppm' : a.sport === 'bike' ? 'rpm' : 'braç./min' });
  if (a.teAer != null) out.push({ key: 'te', k: 'Efeito aeróbico', v: nf(a.teAer, 1), u: a.teAna != null ? `anaeróbico ${nf(a.teAna, 1)}` : '' });
  if (a.rpe != null) out.push({ key: 'rpe', k: 'Esforço (RPE)', v: nf(a.rpe), u: '/10' });
  return out;
}
const DEFAULT = ['dur', 'dist', 'pace', 'kcal', 'hr', 'power', 'elev', 'cad'];
const BLOCKS = [['ring', 'Anel do Strain'], ['zones', 'Zonas de FC'], ['foot', 'REC da manhã e Forma']];

function loadPrefs() {
  try { const p = JSON.parse(localStorage.getItem('rec.share') || 'null'); if (p && Array.isArray(p.stats)) return p; } catch {}
  return { stats: DEFAULT, ring: true, zones: true, foot: true };
}
const savePrefs = (p) => { try { localStorage.setItem('rec.share', JSON.stringify(p)); } catch {} };

/** Números escolhidos, na ordem da preferência; completa até 6 com os padrões se faltar. */
function pick(all, prefs) {
  const by = new Map(all.map((s) => [s.key, s]));
  const chosen = prefs.stats.map((k) => by.get(k)).filter(Boolean);
  return chosen.slice(0, MAX);
}

function cardHtml(a, prefs) {
  const date = new Date(a.date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '');
  const stats = pick(allStats(a), prefs);
  const z = a.zones, zt = z ? z.reduce((x, y) => x + y, 0) || 1 : 1;
  const used = z ? z.map((m, i) => ({ i, m })).filter((x) => x.m > 0) : [];
  const R = 52, C = 2 * Math.PI * R;
  const frac = a.strainVsDay != null ? Math.min(1, a.strainVsDay / 2) : 0.5;
  const title = a.name && a.name.toLowerCase() !== a.label.toLowerCase() ? a.name : a.label;
  const rel = a.strainVsDay == null ? '' : a.strainVsDay >= 1.05 ? `${nf(a.strainVsDay, 1)}× o seu dia médio` : a.strainVsDay >= 0.95 ? 'Igual ao seu dia médio' : `${Math.round(a.strainVsDay * 100)}% do seu dia médio`;
  return `
    <article class="share" style="--c: var(--${esc(a.sport)})">
      <header class="sh-top"><span class="sh-brand">REC</span><span>${esc(date)} · ${esc(a.time ?? '')}</span></header>
      <div class="sh-hero">
        <p class="sh-sport"><i></i>${esc(a.label)}${a.indoor ? ' · indoor' : ''}</p>
        <h1 class="sh-title">${esc(title)}</h1>
      </div>
      ${prefs.ring && a.strain != null ? `<div class="sh-strain">
        <svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="${R}" class="sh-track"/>
          <circle cx="60" cy="60" r="${R}" class="sh-arc" stroke-dasharray="${(C * frac).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 60 60)"/></svg>
        <div class="sh-sv"><b>${a.strain}</b><span>Strain</span></div>
        ${rel ? `<p class="sh-rel">${rel}</p>` : ''}
      </div>` : !prefs.ring && a.strain != null ? `<p class="sh-strain-line"><b>${a.strain}</b> Strain${rel ? ` · ${rel}` : ''}</p>` : ''}
      <div class="sh-grid">${stats.map((s) => `<div><span>${esc(s.k)}</span><b>${esc(s.v)}${s.u ? `<small>${esc(s.u)}</small>` : ''}</b></div>`).join('')}</div>
      ${prefs.zones && used.length ? `<div class="sh-zones">
        <div class="sh-zbar">${used.map((x) => `<i class="zc-${x.i}" style="flex:${x.m}"></i>`).join('')}</div>
        <ul>${used.filter((x) => x.m / zt >= 0.04).map((x) => `<li><i class="zc-${x.i}"></i>${esc(ZN[x.i])} <b>${x.m}′</b></li>`).join('')}</ul>
      </div>` : ''}
      ${prefs.foot && (a.rec != null || a.form != null) ? `<footer class="sh-foot">
        ${a.rec != null ? `<span><i style="background:var(--rec-${recKey(a.rec)})"></i>REC da manhã <b>${a.rec}</b></span>` : '<span></span>'}
        ${a.form != null ? `<span>Forma <b>${a.form > 0 ? '+' : a.form < 0 ? '−' : ''}${Math.abs(a.form)}%</b></span>` : ''}
      </footer>` : ''}
    </article>`;
}

function editorHtml(a, prefs) {
  const all = allStats(a);
  const on = new Set(prefs.stats);
  const n = all.filter((s) => on.has(s.key)).length;
  return `
    <section class="sh-edit">
      <h2>Números no cartão <span class="h2-num">${n} de ${MAX}</span></h2>
      <div class="sh-opts">${all.map((s) => `<button type="button" class="hb" data-stat="${s.key}" aria-pressed="${on.has(s.key)}" ${!on.has(s.key) && n >= MAX ? 'disabled' : ''}>${esc(s.k)}</button>`).join('')}</div>
      <h2>Blocos</h2>
      <div class="sh-opts">${BLOCKS.map(([k, l]) => `<button type="button" class="hb" data-block="${k}" aria-pressed="${!!prefs[k]}">${l}</button>`).join('')}</div>
      <p class="note">A escolha vale para todos os cartões e fica guardada neste aparelho. Números que o treino não tem (ex.: potência sem medidor) não aparecem.</p>
    </section>`;
}

export async function renderShare(screen, api, id) {
  document.body.classList.add('is-share');
  screen.innerHTML = '<p class="empty">Carregando…</p>';
  let a;
  try { a = await api(`/api/activity?id=${encodeURIComponent(id)}`); } catch (e) { screen.innerHTML = `<p class="empty">Não carregou: ${esc(e.message)}</p>`; return; }
  let prefs = loadPrefs(), editing = false;
  const paint = () => {
    screen.innerHTML = `
      <div class="sh-wrap">
        <button type="button" class="sh-close" aria-label="Fechar">×</button>
        ${cardHtml(a, prefs)}
      </div>
      <div class="sh-actions">
        <button type="button" class="btn" id="sh-save">Salvar imagem</button>
        <button type="button" class="btn ghost" id="sh-edit">${editing ? 'Pronto' : 'Escolher números'}</button>
      </div>
      <p class="sh-msg" aria-live="polite"></p>
      ${editing ? editorHtml(a, prefs) : ''}`;
    screen.querySelector('.sh-close').addEventListener('click', () => { if (history.length > 1) history.back(); else location.hash = '#hoje'; });
    screen.querySelector('#sh-edit').addEventListener('click', () => { editing = !editing; paint(); if (editing) screen.querySelector('.sh-edit')?.scrollIntoView({ behavior: 'smooth' }); });
    screen.querySelectorAll('[data-stat]').forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.stat;
      prefs = { ...prefs, stats: prefs.stats.includes(k) ? prefs.stats.filter((x) => x !== k) : [...prefs.stats, k] };
      // tira das preferências o que este treino não tem só da contagem; a lista guardada continua valendo para os outros
      savePrefs(prefs); const y = window.scrollY; paint(); window.scrollTo(0, y);
    }));
    screen.querySelectorAll('[data-block]').forEach((b) => b.addEventListener('click', () => {
      prefs = { ...prefs, [b.dataset.block]: !prefs[b.dataset.block] }; savePrefs(prefs); const y = window.scrollY; paint(); window.scrollTo(0, y);
    }));
    screen.querySelector('#sh-save').addEventListener('click', async (ev) => {
      const btn = ev.currentTarget, msg = screen.querySelector('.sh-msg');
      btn.disabled = true; msg.textContent = 'Gerando a imagem…';
      try {
        const blob = await drawPng(a, prefs);
        const file = new File([blob], `rec-${a.date}-${a.sport}.png`, { type: 'image/png' });
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file] }).catch((e) => { if (e.name !== 'AbortError') throw e; });
          msg.textContent = '';
        } else {
          const url = URL.createObjectURL(blob);
          const link = Object.assign(document.createElement('a'), { href: url, download: file.name });
          document.body.appendChild(link); link.click(); link.remove();
          setTimeout(() => URL.revokeObjectURL(url), 5000);
          msg.textContent = 'Imagem baixada.';
        }
      } catch (e) { msg.textContent = `Não gerou: ${e.message}`; }
      btn.disabled = false;
    });
  };
  paint();
}

// ---------- imagem 1080×1920 desenhada em canvas (mesmo conteúdo do cartão) ----------
async function drawPng(a, prefs) {
  const W = 1080, H = 1920, P = 84;
  const cv = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const g = cv.getContext('2d');
  const css = getComputedStyle(document.documentElement);
  const v = (n, f) => (css.getPropertyValue(n).trim() || f);
  const sport = v(`--${a.sport}`, '#888'), bg = v('--bg', '#000'), text = v('--text', '#f2f2f4'), t2 = v('--text-2', '#9a9aa1'), strain = v('--strain', '#2ad4e8'), line = v('--line', '#262629');
  const FONT = '-apple-system, "SF Pro Display", system-ui, "Segoe UI", Roboto, sans-serif';
  const font = (w, s) => `${w} ${s}px ${FONT}`;
  if (document.fonts?.ready) await document.fonts.ready;

  // fundo: brilho da cor da modalidade no topo
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  const grad = g.createRadialGradient(W / 2, 0, 0, W / 2, 0, H * 0.75);
  grad.addColorStop(0, withAlpha(sport, 0.42)); grad.addColorStop(1, withAlpha(sport, 0));
  g.fillStyle = grad; g.fillRect(0, 0, W, H);

  // topo
  g.textBaseline = 'alphabetic';
  g.fillStyle = text; g.font = font(700, 40);
  spaced(g, 'REC', P, 140, 10);
  const date = new Date(a.date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '');
  g.fillStyle = t2; g.font = font(400, 34); g.textAlign = 'right'; g.fillText(`${date} · ${a.time ?? ''}`, W - P, 140); g.textAlign = 'left';

  // modalidade e título
  let y = 270;
  g.fillStyle = sport; g.beginPath(); g.arc(P + 12, y - 13, 12, 0, 2 * Math.PI); g.fill();
  g.font = font(600, 38); spaced(g, `${a.label}${a.indoor ? ' · indoor' : ''}`.toUpperCase(), P + 40, y, 3);
  const title = a.name && a.name.toLowerCase() !== a.label.toLowerCase() ? a.name : a.label;
  g.fillStyle = text; g.font = font(600, 92);
  y += 110;
  for (const ln of wrap(g, title, W - 2 * P).slice(0, 2)) { g.fillText(ln, P, y); y += 104; }

  // anel do Strain
  const rel = a.strainVsDay == null ? '' : a.strainVsDay >= 1.05 ? `${nf(a.strainVsDay, 1)}× o seu dia médio` : a.strainVsDay >= 0.95 ? 'Igual ao seu dia médio' : `${Math.round(a.strainVsDay * 100)}% do seu dia médio`;
  if (prefs.ring && a.strain != null) {
    const cx = W / 2, cy = y + 250, r = 230, frac = a.strainVsDay != null ? Math.min(1, a.strainVsDay / 2) : 0.5;
    g.lineWidth = 38; g.lineCap = 'round';
    g.strokeStyle = withAlpha(strain, 0.15); g.beginPath(); g.arc(cx, cy, r, 0, 2 * Math.PI); g.stroke();
    g.save(); g.shadowColor = withAlpha(strain, 0.6); g.shadowBlur = 40;
    g.strokeStyle = strain; g.beginPath(); g.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + frac * 2 * Math.PI); g.stroke(); g.restore();
    g.textAlign = 'center'; g.fillStyle = text; g.font = font(200, 200); g.fillText(String(a.strain), cx, cy + 50);
    g.fillStyle = strain; g.font = font(500, 38); spaced(g, 'STRAIN', cx, cy + 120, 8, true);
    if (rel) { g.fillStyle = t2; g.font = font(400, 38); g.fillText(rel, cx, cy + r + 90); }
    g.textAlign = 'left';
    y = cy + r + (rel ? 160 : 100);
  } else if (a.strain != null) {
    y += 40; g.fillStyle = strain; g.font = font(300, 72); g.fillText(String(a.strain), P, y);
    const w = g.measureText(String(a.strain)).width; g.fillStyle = t2; g.font = font(400, 38); g.fillText(` Strain${rel ? ` · ${rel}` : ''}`, P + w + 8, y);
    y += 90;
  }

  // números
  const stats = pick(allStats(a), prefs);
  const colW = (W - 2 * P) / 2, rowH = 190;
  stats.forEach((s, i) => {
    const x = P + (i % 2) * colW, yy = y + Math.floor(i / 2) * rowH;
    g.fillStyle = t2; g.font = font(400, 36); g.fillText(s.k, x, yy + 40);
    g.fillStyle = text; g.font = font(300, 100); g.fillText(s.v, x, yy + 145);
    if (s.u) { const w = g.measureText(s.v).width; g.fillStyle = t2; g.font = font(400, 38); g.fillText(s.u, x + w + 14, yy + 145); }
  });
  y += Math.ceil(stats.length / 2) * rowH + 20;

  // zonas (perto do rodapé)
  const z = a.zones;
  const footY = prefs.foot && (a.rec != null || a.form != null) ? H - 110 : H;
  if (prefs.zones && z) {
    const tot = z.reduce((p, q) => p + q, 0) || 1, used = z.map((m, i) => ({ i, m })).filter((x) => x.m > 0);
    const zy = Math.max(y, footY - 230), gap = 8; let x = P;
    const bw = W - 2 * P - gap * (used.length - 1);
    const zc = (i) => v(['--zc0', '--zc1', '--zc2', '--zc3', '--zc4', '--zc5'][i], ['#4a4a50', '#8a9bb0', '#4c9dff', '#2fbf8f', '#ff9f43', '#ff5f6d'][i]);
    used.forEach((u) => { const w = (u.m / tot) * bw; g.fillStyle = zoneColor(u.i, zc); roundRect(g, x, zy, Math.max(4, w), 34, 8); g.fill(); x += w + gap; });
    let lx = P; g.font = font(400, 34);
    used.filter((u) => u.m / tot >= 0.04).forEach((u) => {
      g.fillStyle = zoneColor(u.i, zc); roundRect(g, lx, zy + 76, 22, 22, 5); g.fill();
      const lab = `${ZN[u.i]} `, val = `${u.m}′`;
      g.fillStyle = t2; g.fillText(lab, lx + 34, zy + 98); const w1 = g.measureText(lab).width;
      g.fillStyle = text; g.font = font(600, 34); g.fillText(val, lx + 34 + w1, zy + 98); const w2 = g.measureText(val).width;
      g.font = font(400, 34); lx += 34 + w1 + w2 + 40;
    });
  }

  // rodapé
  if (footY < H) {
    g.strokeStyle = line; g.lineWidth = 2; g.beginPath(); g.moveTo(P, footY - 50); g.lineTo(W - P, footY - 50); g.stroke();
    g.font = font(400, 38);
    if (a.rec != null) {
      g.fillStyle = v(`--rec-${recKey(a.rec)}`, '#aaa'); g.beginPath(); g.arc(P + 11, footY + 8 - 13, 11, 0, 2 * Math.PI); g.fill();
      g.fillStyle = t2; g.fillText('REC da manhã ', P + 36, footY + 8); const w = g.measureText('REC da manhã ').width;
      g.fillStyle = text; g.font = font(600, 38); g.fillText(String(a.rec), P + 36 + w, footY + 8); g.font = font(400, 38);
    }
    if (a.form != null) {
      const val = `${a.form > 0 ? '+' : a.form < 0 ? '−' : ''}${Math.abs(a.form)}%`;
      g.font = font(600, 38); const wv = g.measureText(val).width; g.fillStyle = text; g.textAlign = 'right'; g.fillText(val, W - P, footY + 8);
      g.font = font(400, 38); g.fillStyle = t2; g.fillText('Forma ', W - P - wv, footY + 8); g.textAlign = 'left';
    }
  }
  return new Promise((ok, no) => cv.toBlob((b) => (b ? ok(b) : no(new Error('canvas vazio'))), 'image/png'));
}

// cores das zonas: lidas da folha de estilo (classes .zc-0 … .zc-5)
const zoneCache = {};
function zoneColor(i) {
  if (zoneCache[i]) return zoneCache[i];
  const el = document.createElement('i'); el.className = `zc-${i}`; el.style.display = 'none'; document.body.appendChild(el);
  const c = getComputedStyle(el).backgroundColor; el.remove();
  return (zoneCache[i] = c && c !== 'rgba(0, 0, 0, 0)' ? c : ['#4a4a50', '#8a9bb0', '#4c9dff', '#2fbf8f', '#ff9f43', '#ff5f6d'][i]);
}
function withAlpha(c, a) {
  const el = document.createElement('i'); el.style.color = c; document.body.appendChild(el);
  const rgb = getComputedStyle(el).color; el.remove();
  const m = rgb.match(/\d+(\.\d+)?/g) ?? ['128', '128', '128'];
  return `rgba(${m[0]}, ${m[1]}, ${m[2]}, ${a})`;
}
function spaced(g, s, x, y, sp, center = false) {
  const w = [...s].reduce((t, ch) => t + g.measureText(ch).width + sp, -sp);
  let cx = center ? x - w / 2 : x; const al = g.textAlign; g.textAlign = 'left';
  for (const ch of s) { g.fillText(ch, cx, y); cx += g.measureText(ch).width + sp; }
  g.textAlign = al;
}
function wrap(g, s, max) {
  const words = s.split(/\s+/), out = []; let cur = '';
  for (const w of words) { const t = cur ? `${cur} ${w}` : w; if (g.measureText(t).width > max && cur) { out.push(cur); cur = w; } else cur = t; }
  if (cur) out.push(cur);
  return out;
}
function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
