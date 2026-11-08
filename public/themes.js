// PoorDown themes: how the game looks on this device. Each theme is a set of colours, fonts and a few
// drawing effects in themes.css, switched with <html data-theme="...">. The three sketch themes (Crayon,
// Chalkboard and Blueprint) also get hand-drawn outlines, scribbled colouring-in and paper grain. Those are
// drawn here as small SVG pictures in the theme's own ink colour and handed to the stylesheet as
// --sk-* custom properties. Load this file in <head>, so the saved theme is on before anything is drawn.
(function (root) {
  const KEY = 'boomtown.theme';
  const FONT = {
    bricolage: '"Bricolage Grotesque", system-ui, sans-serif',
    geist: 'Geist, "Helvetica Neue", Arial, sans-serif',
    hand: '"Patrick Hand", "Comic Sans MS", cursive',
    sketch: '"Cabin Sketch", "Patrick Hand", cursive',
    architect: '"Architects Daughter", "Patrick Hand", cursive',
  };
  // p = the colours and font used for the little preview in the picker.
  const THEMES = [
    { id: 'clean', group: 'Light', name: 'Clean', note: 'White, grey and black, with one road-sign green. The default.', scheme: 'light', meta: '#FFFFFF',
      p: { bg: '#FFFFFF', tile: '#FFFFFF', line: '#E5E7EB', text: '#0A0A0A', acc: '#0A0A0A', on: '#FFFFFF', font: FONT.geist } },
    { id: 'midnight', group: 'Dark', name: 'Midnight', note: 'Deep navy and brass. The original.', scheme: 'dark', meta: '#0A0F1E',
      p: { bg: '#0A0F1E', tile: '#151E35', line: '#2A3758', text: '#EDF0F8', acc: '#F1B94B', on: '#241600', font: FONT.bricolage } },
    { id: 'crayon', group: 'Hand-drawn', name: 'Crayon', note: 'Scribbled in wax crayon on drawing paper.', scheme: 'light', meta: '#F3EBDA',
      sketch: { ink: '#34303B', grain: '#8A6A3C', jitter: 2.6, width: 3.4, speck: 0.55, fill: 'scribble', primary: '#F6C343' },
      p: { bg: '#F3EBDA', tile: '#FFFCF4', line: '#34303B', text: '#2B2733', acc: '#F6C343', on: '#2B2733', font: FONT.sketch } },
    { id: 'chalk', group: 'Hand-drawn', name: 'Chalkboard', note: 'Chalk doodles on a classroom board.', scheme: 'dark', meta: '#1E2B24',
      sketch: { ink: '#F3F1E7', grain: '#FFFFFF', jitter: 2.8, width: 3.6, speck: 0.95, fill: 'scribble', primary: '#F4D35E', outline: true },
      p: { bg: '#1E2B24', tile: '#2A3B31', line: '#F3F1E7', text: '#F3F1E7', acc: '#F4D35E', on: '#1E2B24', font: FONT.sketch } },
    { id: 'blueprint', group: 'Hand-drawn', name: 'Blueprint', note: 'Drawn up by an architect in white pencil.', scheme: 'dark', meta: '#0D3B66',
      sketch: { ink: '#E8F3FF', grain: '', jitter: 0.9, width: 2, speck: 0, fill: 'hatch', primary: '#FFD66B' },
      p: { bg: '#0D3B66', tile: '#104A7E', line: '#E8F3FF', text: '#F2F8FF', acc: '#FFD66B', on: '#0D2A47', font: FONT.architect } },
    { id: 'daylight', group: 'Light', name: 'Daylight', note: 'Bright and clean, for a sunny room.', scheme: 'light', meta: '#EEF1F6',
      p: { bg: '#EEF1F6', tile: '#FFFFFF', line: '#C9D1DF', text: '#141B2D', acc: '#A35F00', on: '#FFFFFF', font: FONT.bricolage } },
    { id: 'classic', group: 'Light', name: 'Classic', note: 'The family board game on the kitchen table.', scheme: 'light', meta: '#CFE3CC',
      p: { bg: '#CFE3CC', tile: '#FBFAF3', line: '#1A1A1A', text: '#111111', acc: '#C8102E', on: '#FFFFFF', font: FONT.bricolage } },
    { id: 'neon', group: 'Dark', name: 'Neon', note: 'Glowing signs in a late-night arcade.', scheme: 'dark', meta: '#08050F',
      p: { bg: '#08050F', tile: '#130C24', line: '#FF4FB3', text: '#F6F0FF', acc: '#FF4FB3', on: '#1A0010', font: FONT.bricolage, glow: true } },
    { id: 'sunset', group: 'Dark', name: 'Sunset', note: 'Warm dusk tones, coral and amber.', scheme: 'dark', meta: '#281522',
      p: { bg: '#281522', tile: '#3B2030', line: '#704052', text: '#FFF0E8', acc: '#FF9A62', on: '#351708', font: FONT.bricolage } },
    { id: 'rose', group: 'Light', name: 'Rose', note: 'Soft blush, plum and berry accents.', scheme: 'light', meta: '#F5E8ED',
      p: { bg: '#F5E8ED', tile: '#FFF9FB', line: '#D9B9C7', text: '#352331', acc: '#A52D62', on: '#FFFFFF', font: FONT.bricolage } },
    { id: 'contrast', group: 'Dark', name: 'High contrast', note: 'Black, white and yellow. The easiest to read.', scheme: 'dark', meta: '#000000',
      p: { bg: '#000000', tile: '#000000', line: '#FFFFFF', text: '#FFFFFF', acc: '#FFE600', on: '#000000', font: FONT.bricolage } },
  ];
  const byId = {};
  THEMES.forEach((t) => { byId[t.id] = t; });

  // ------------------------------------------------------------ hand-drawn pictures
  function rng(seed) {
    let s = (seed * 2654435761) >>> 0 || 1;
    return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  }
  const n1 = (v) => (Math.round(v * 10) / 10).toString();
  const svgUrl = (svg) => `url("data:image/svg+xml,${encodeURIComponent(svg.replace(/\s+/g, ' '))}")`;
  const SVG = 'xmlns="http://www.w3.org/2000/svg"';
  // Grain: holes rubbed out of a stroke, the way wax crayon and chalk skip over paper.
  const grainFilter = (id, speck, seed) => (speck > 0
    ? `<filter id="${id}" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="1" seed="${seed}"/><feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 ${n1(-2.6 * speck)} 0 0 0 ${n1(1 + 1.4 * speck)}"/><feComposite in="SourceGraphic" operator="in"/></filter>`
    : '');
  // A wobbly line from (x1, y1) to (x2, y2), as smooth curves through a few nudged points.
  function wobblyLine(r, x1, y1, x2, y2, amt) {
    const pts = [];
    const n = 6;
    for (let k = 0; k <= n; k++) {
      const t = k / n, edge = k === 0 || k === n ? 0.5 : 1;
      pts.push([x1 + (x2 - x1) * t + (r() - 0.5) * 2 * amt * edge, y1 + (y2 - y1) * t + (r() - 0.5) * 2 * amt * edge]);
    }
    let d = `M${n1(pts[0][0])} ${n1(pts[0][1])}`;
    for (let k = 1; k < n; k++) {
      const mx = (pts[k][0] + pts[k + 1][0]) / 2, my = (pts[k][1] + pts[k + 1][1]) / 2;
      d += `Q${n1(pts[k][0])} ${n1(pts[k][1])} ${n1(mx)} ${n1(my)}`;
    }
    return d + `L${n1(pts[n][0])} ${n1(pts[n][1])}`;
  }
  // A rectangle drawn round twice by hand, used as a border-image (slice 14 of 100). The lines cross a
  // little at the corners, like a quick sketch.
  function roughBox(sk, seed) {
    const r = rng(seed), o = 7, e = 93, over = 3.5, a = sk.jitter;
    const pass = () => wobblyLine(r, o - over, o, e + over, o, a) + wobblyLine(r, e, o - over, e, e + over, a)
      + wobblyLine(r, e + over, e, o - over, e, a) + wobblyLine(r, o, e + over, o, o - over, a);
    return svgUrl(`<svg ${SVG} width="100" height="100" viewBox="0 0 100 100">${grainFilter('g', sk.speck, seed)}<g fill="none" stroke="${sk.ink}" stroke-linecap="round" stroke-linejoin="round"${sk.speck ? ' filter="url(#g)"' : ''}><path d="${pass()}" stroke-width="${sk.width}"/><path d="${pass()}" stroke-width="${n1(sk.width * 0.5)}" opacity=".75"/></g></svg>`);
  }
  // Colouring-in: slanted back-and-forth strokes across the box, the way a child shades with a crayon,
  // gone over twice. Used as a mask over a block of colour.
  function scribble(sk, seed, vertical) {
    const r = rng(seed);
    const W = vertical ? 40 : 100, H = vertical ? 100 : 40;
    const along = vertical ? H : W, across = vertical ? W : H;
    const pt = (a, b) => (vertical ? `${n1(b)} ${n1(a)}` : `${n1(a)} ${n1(b)}`);
    const pass = (start, fwd, back) => {
      let pos = start, up = true, d = `M${pt(pos, across + 4)}`;
      while (pos < along + 8) {
        pos += up ? fwd * (0.8 + r() * 0.4) : -back * (0.7 + r() * 0.6);
        d += `L${pt(pos, up ? -3 - r() * 4 : across + 3 + r() * 4)}`;
        up = !up;
      }
      return d;
    };
    const k = vertical ? 1.15 : 1;
    return svgUrl(`<svg ${SVG} viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${grainFilter('g', sk.speck * 0.8, seed + 7)}<g fill="none" stroke="#000" stroke-linecap="round" stroke-linejoin="round"${sk.speck ? ' filter="url(#g)"' : ''}><path d="${pass(-10, 15 * k, 8 * k)}" stroke-width="${n1(6.5 * k)}" opacity=".85"/><path d="${pass(-14, 17 * k, 10 * k)}" stroke-width="${n1(4.5 * k)}" opacity=".7"/></g></svg>`);
  }
  // Paper grain for the page behind everything.
  function paper(sk) {
    if (!sk.grain) return 'none';
    const c = sk.grain.replace('#', '');
    const [R, G, B] = [0, 2, 4].map((i) => n1(parseInt(c.slice(i, i + 2), 16) / 255));
    const k = sk.speck > 0.8 ? 0.5 : 0.42, off = sk.speck > 0.8 ? -0.2 : -0.17;
    return svgUrl(`<svg ${SVG} width="220" height="220"><filter id="p"><feTurbulence type="fractalNoise" baseFrequency=".75" numOctaves="3" stitchTiles="stitch"/><feColorMatrix type="matrix" values="0 0 0 0 ${R} 0 0 0 0 ${G} 0 0 0 0 ${B} ${k} 0 0 0 ${off}"/></filter><rect width="220" height="220" filter="url(#p)"/></svg>`);
  }
  const sketchCache = {};
  function sketchVars(t) {
    if (!t.sketch) return null;
    if (sketchCache[t.id]) return sketchCache[t.id];
    const sk = t.sketch;
    return (sketchCache[t.id] = {
      '--sk-box': roughBox(sk, 11), '--sk-box-2': roughBox(sk, 23), '--sk-box-3': roughBox(sk, 37),
      '--sk-box-acc': roughBox(Object.assign({}, sk, { ink: sk.primary }), 51),
      '--sk-fill': scribble(sk, 5, false), '--sk-fill-v': scribble(sk, 9, true), '--sk-paper': paper(sk),
    });
  }
  // Filters for the drawings on the board (flags, icons, tokens): a slight wobble, plus grain for the
  // crayon and chalk themes.
  const DEFS = `<svg ${SVG} width="0" height="0" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true" focusable="false">
    <filter id="bt-wobble" x="-8%" y="-8%" width="116%" height="116%"><feTurbulence type="fractalNoise" baseFrequency=".06" numOctaves="2" seed="4" result="w"/><feDisplacementMap in="SourceGraphic" in2="w" scale="2.4" xChannelSelector="R" yChannelSelector="G"/></filter>
    <filter id="bt-crayon" x="-8%" y="-8%" width="116%" height="116%"><feTurbulence type="fractalNoise" baseFrequency=".06" numOctaves="2" seed="4" result="w"/><feDisplacementMap in="SourceGraphic" in2="w" scale="2.2" xChannelSelector="R" yChannelSelector="G" result="d"/><feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="1" seed="9" result="g"/><feColorMatrix in="g" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -1.7 0 0 0 1.75" result="m"/><feComposite in="d" in2="m" operator="in"/></filter>
    <filter id="bt-chalk" x="-8%" y="-8%" width="116%" height="116%"><feTurbulence type="fractalNoise" baseFrequency=".06" numOctaves="2" seed="4" result="w"/><feDisplacementMap in="SourceGraphic" in2="w" scale="2.2" xChannelSelector="R" yChannelSelector="G" result="d"/><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="1" seed="3" result="g"/><feColorMatrix in="g" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -2.4 0 0 0 2.05" result="m"/><feComposite in="d" in2="m" operator="in"/></filter>
  </svg>`;
  function addDefs() {
    if (!document.body || document.getElementById('bt-wobble')) return;
    const box = document.createElement('div');
    box.innerHTML = DEFS;
    document.body.appendChild(box.firstElementChild);
  }

  // ------------------------------------------------------------ choosing a theme
  const store = {
    get() { try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; } },
    set(v) { try { localStorage.setItem(KEY, v); } catch (e) { /* private mode: the theme lasts until the page closes */ } },
  };
  let current = 'clean';
  function apply(id, opts) {
    const t = byId[id] || byId.clean;
    current = t.id;
    const html = document.documentElement;
    html.setAttribute('data-theme', t.id);
    html.setAttribute('data-scheme', t.scheme);
    if (t.sketch) html.setAttribute('data-sketch', t.sketch.fill); else html.removeAttribute('data-sketch');
    const vars = sketchVars(t) || {};
    for (const k of ['--sk-box', '--sk-box-2', '--sk-box-3', '--sk-box-acc', '--sk-fill', '--sk-fill-v', '--sk-paper']) {
      if (vars[k]) html.style.setProperty(k, vars[k]); else html.style.removeProperty(k);
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t.meta);
    if (!(opts && opts.keep)) store.set(t.id);
    if (document.body) addDefs();
    try { root.dispatchEvent(new CustomEvent('boomtown:theme', { detail: { id: t.id, theme: t } })); } catch (e) {}
    return t;
  }
  // Ocean and Forest were folded into the themes they resembled most.
  const RENAMED = { ocean: 'blueprint', forest: 'chalk' };
  const saved = RENAMED[store.get()] || store.get();
  const prefersContrast = (() => { try { return root.matchMedia('(prefers-contrast: more)').matches; } catch (e) { return false; } })();
  // Clean became the default look; everyone is moved onto it once, and can pick any other theme afterwards.
  const MOVED = 'boomtown.theme.clean';
  let movedAlready = false;
  try { movedAlready = !!localStorage.getItem(MOVED); localStorage.setItem(MOVED, '1'); } catch (e) { movedAlready = true; }
  const start = prefersContrast && !saved ? 'contrast' : !movedAlready ? 'clean' : byId[saved] ? saved : 'clean';
  apply(start, { keep: movedAlready });
  if (!document.body) document.addEventListener('DOMContentLoaded', addDefs, { once: true });

  // ------------------------------------------------------------ the picker
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function previewHTML(t) {
    const p = t.p, v = sketchVars(t);
    const outline = v && t.sketch.outline;
    const box = v ? `border-image-source:${v[outline ? '--sk-box-acc' : '--sk-box']};${outline ? `color:${p.acc};` : ''}` : '';
    const styl = `--p-bg:${p.bg};--p-tile:${p.tile};--p-line:${p.line};--p-text:${p.text};--p-acc:${p.acc};--p-on:${p.on};font-family:${p.font};${v && v['--sk-paper'] !== 'none' ? `background-image:${v['--sk-paper']};` : ''}`;
    const tiles = ['#F062A5', '#4FB3FF', '#9BD34B'].map((c, i) => `<i class="${v ? 'sk' : ''}" style="--c:${c};${v ? `border-image-source:${v[['--sk-box', '--sk-box-2', '--sk-box-3'][i]]};` : ''}"></i>`).join('');
    const fill = v && t.sketch.fill === 'scribble' ? `-webkit-mask-image:${v['--sk-fill']};mask-image:${v['--sk-fill']};${outline ? 'opacity:.26;' : ''}` : '';
    return `<span class="th-prev${p.glow ? ' glow' : ''}${v ? ' sk' : ''}" aria-hidden="true" style="${esc(styl)}">
      <span class="th-row">${tiles}</span>
      <span class="th-aa">Aa</span>
      <span class="th-btn" style="${esc(box)}"><span class="th-btn-fill" style="${esc(fill)}"></span><span class="th-btn-t">Roll</span></span>
    </span>`;
  }
  let openNow = null;
  function openPicker(opts) {
    if (openNow) return openNow;
    opts = opts || {};
    const wrap = document.createElement('div');
    wrap.className = 'th-modal';
    wrap.innerHTML = `<div class="th-sheet" role="dialog" aria-modal="true" aria-labelledby="thTitle" aria-describedby="thNote">
      <div class="th-h"><h2 id="thTitle">Theme</h2><p id="thNote">Changes how the game looks on this device. Everyone else keeps their own.</p></div>
      <fieldset class="th-groups"><legend class="th-sr">Choose a theme</legend>
        ${['Light', 'Dark', 'Hand-drawn'].map((g) => `<div class="th-group" role="presentation"><h3 class="th-gh">${g}</h3><div class="th-grid">${THEMES.filter((t) => t.group === g).map((t) => `<label class="th-opt"><input type="radio" name="bt-theme" value="${t.id}"${t.id === current ? ' checked' : ''}>${previewHTML(t)}<span class="th-txt"><b>${esc(t.name)}</b><span>${esc(t.note)}</span></span></label>`).join('')}</div></div>`).join('')}
      </fieldset>
      <div class="th-f"><button type="button" class="btn primary" data-th="done">Done</button></div>
    </div>`;
    document.body.appendChild(wrap);
    document.documentElement.classList.add('th-open');
    const returnTo = opts.returnTo || document.activeElement;
    wrap.addEventListener('change', (e) => {
      if (e.target.name !== 'bt-theme') return;
      apply(e.target.value);
      if (opts.onChange) opts.onChange(current);
    });
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key !== 'Tab') return; // keep keyboard focus inside the picker
      const checked = wrap.querySelector('input:checked') || wrap.querySelector('input');
      const items = [checked, wrap.querySelector('[data-th=done]')];
      const at = document.activeElement;
      const i = items.indexOf(at.name === 'bt-theme' ? checked : at);
      e.preventDefault();
      items[(i + (e.shiftKey ? items.length - 1 : 1)) % items.length].focus();
    };
    document.addEventListener('keydown', onKey);
    wrap.addEventListener('click', (e) => {
      if (e.target === wrap || e.target.closest('[data-th=done]')) close();
    });
    function close() {
      document.removeEventListener('keydown', onKey);
      document.documentElement.classList.remove('th-open');
      wrap.remove();
      openNow = null;
      if (returnTo && document.contains(returnTo) && returnTo.getClientRects().length) returnTo.focus({ preventScroll: true });
      if (opts.onClose) opts.onClose(current);
    }
    requestAnimationFrame(() => { const c = wrap.querySelector('input:checked'); if (c) c.focus({ preventScroll: true }); });
    openNow = { close };
    return openNow;
  }

  root.BoomThemes = {
    list: THEMES, apply, openPicker,
    get current() { return current; },
    get theme() { return byId[current]; },
  };
})(window);
