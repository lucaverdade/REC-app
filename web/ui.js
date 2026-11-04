// Padrão visual (04/11): cartão único, cabeçalho com ícone, explicação atrás do ⓘ, números que contam.
const P = (d) => `<svg viewBox="0 0 24 24" class="ic" aria-hidden="true">${d}</svg>`;
export const ICON = {
  moon: P('<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>'),
  bolt: P('<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>'),
  clock: P('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  smile: P('<circle cx="12" cy="12" r="8.5"/><path d="M8.5 14.5c1.8 2 5.2 2 7 0M9 9.8h.01M15 9.8h.01"/>'),
  book: P('<path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H19v15H7.5A2.5 2.5 0 0 0 5 20.5z"/><path d="M5 20.5A2.5 2.5 0 0 1 7.5 18H19v3H7.5"/>'),
  trend: P('<path d="M4 17l5-5 4 3 7-8"/><path d="M15 7h5v5"/>'),
  flag: P('<path d="M6 21V4h11l-2.5 4L17 12H6"/>'),
  sun: P('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>'),
  cloud: P('<path d="M7 18h10a4 4 0 0 0 .4-8 6 6 0 0 0-11.5 1.6A3.2 3.2 0 0 0 7 18z"/>'),
  partly: P('<circle cx="8" cy="8" r="3"/><path d="M8 2.5v1.2M2.5 8h1.2M4.1 4.1l.9.9M12 4.1l-.8.8"/><path d="M9 19h8.5a3.5 3.5 0 0 0 .3-7 5 5 0 0 0-9.6 1.4A2.9 2.9 0 0 0 9 19z"/>'),
  rain: P('<path d="M7 15h10a4 4 0 0 0 .4-8 6 6 0 0 0-11.5 1.6A3.2 3.2 0 0 0 7 15z"/><path d="M9 18l-1 2.5M13 18l-1 2.5M17 18l-1 2.5"/>'),
  flame: P('<path d="M12 3c1 4 5 5.5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-3.5 2-5 .8 1.5 2 2 3 2-1-2.5-.5-5 0-7z"/>'),
  check: P('<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8.5 12.2l2.4 2.4 4.8-5"/>'),
  fork: P('<path d="M7 3v7a2 2 0 0 0 4 0V3M9 12v9M16.5 3C15 4 14.5 6 14.5 9v3.5H17V3zM17 12.5V21"/>'),
  route: P('<circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7"/>'),
  heart: P('<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/>'),
  swim: P('<path d="M3 17c2 0 2-1.5 4.5-1.5S9.5 17 12 17s2.5-1.5 4.5-1.5S19 17 21 17M3 12.5c2 0 2-1.5 4.5-1.5S9.5 12.5 12 12.5 14.5 11 16.5 11 19 12.5 21 12.5"/><circle cx="15" cy="6" r="1.8"/>'),
  bike: P('<circle cx="6" cy="16" r="3.5"/><circle cx="18" cy="16" r="3.5"/><path d="M6 16l4-7h5l3 7M10 9l3 7M14 6h2"/>'),
  run: P('<circle cx="14.5" cy="4.5" r="1.8"/><path d="M8 21l3-6 3 2v5M6.5 12l3.5-4 4 1 2 3 3 1"/>'),
  gel: P('<path d="M9 3h6l-1 3v12a2 2 0 0 1-4 0V6z"/><path d="M10 11h4"/>'),
  gear: P('<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/><circle cx="12" cy="12" r="6.5"/>'),
  stopwatch: P('<circle cx="12" cy="13" r="7.5"/><path d="M12 9v4l2.5 1.5M10 2.5h4"/>'),
};

/** Cabeçalho de cartão: ícone + título (+ valor à direita) (+ ⓘ que abre a explicação). */
export function cardHead(icon, title, { right = '', info = '', color = '' } = {}) {
  return `<header class="ch"${color ? ` style="--ic:${color}"` : ''}>${ICON[icon] ?? ''}<h2>${title}</h2>${right ? `<span class="ch-r">${right}</span>` : ''}${info ? '<button type="button" class="info-btn" aria-label="Como funciona" aria-expanded="false">i</button>' : ''}</header>${info ? `<div class="card-info" hidden>${info}</div>` : ''}`;
}

// ⓘ: abre e fecha a explicação do cartão (um único ouvinte para o app todo)
if (!window.__infoBound) {
  window.__infoBound = true;
  document.addEventListener('click', (e) => {
    const b = e.target.closest?.('.info-btn'); if (!b) return;
    const inf = b.closest('.card')?.querySelector('.card-info'); if (!inf) return;
    inf.hidden = !inf.hidden; b.setAttribute('aria-expanded', String(!inf.hidden));
  });
}

/** Números que contam até o valor (respeita "reduzir movimento"). Usa data-count="valor" e data-dec. */
export function countUp(root) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  root.querySelectorAll('[data-count]').forEach((el) => {
    const to = Number(el.dataset.count); if (!Number.isFinite(to)) return;
    const dec = Number(el.dataset.dec ?? 0), t0 = performance.now(), dur = 700;
    const fmt = (v) => v.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
    const step = (t) => { const k = Math.min(1, (t - t0) / dur), e = 1 - (1 - k) ** 3; el.textContent = fmt(to * e); if (k < 1) requestAnimationFrame(step); };
    el.textContent = fmt(0); requestAnimationFrame(step);
  });
}
