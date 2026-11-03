// Profile photo picker. Choose a picture, drag and zoom it inside a circle, and get back a small square JPEG
// as a data URL (about 6 to 12 KB), ready to store and send. Works with a mouse, touch (drag and pinch)
// and the keyboard. BoomPhoto.pick() must be called from a click or tap so the browser lets it open the file chooser.
(function (root) {
  const OUT = 128;          // pixels per side of the saved picture
  const MAX_CHARS = 24000;  // the online server refuses anything bigger
  const SRC_MAX = 1400;     // big phone photos are scaled down to this before cropping

  function chooseFile() {
    return new Promise((resolve) => {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = 'image/*';
      inp.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
      document.body.appendChild(inp);
      let done = false;
      const finish = (f) => { if (done) return; done = true; inp.remove(); resolve(f || null); };
      inp.addEventListener('change', () => finish(inp.files && inp.files[0]));
      inp.addEventListener('cancel', () => finish(null));
      inp.click();
    });
  }
  function loadImage(file) {
    return new Promise((resolve, reject) => {
      if (!file || !/^image\//.test(file.type || 'image/')) { reject(new Error('not an image')); return; }
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('unreadable')); };
      img.src = url;
    });
  }
  function shrink(img, max) {
    const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    const k = Math.min(1, max / Math.max(w, h));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * k));
    c.height = Math.max(1, Math.round(h * k));
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, c.width, c.height);
    return c;
  }

  function cropDialog(src, opts) {
    return new Promise((resolve) => {
      const wrap = document.createElement('div');
      wrap.className = 'pp-modal';
      wrap.innerHTML = `<div class="pp-sheet" role="dialog" aria-modal="true" aria-labelledby="ppTitle">
        <div class="pp-h"><b id="ppTitle">Your photo</b><span id="ppHint">Drag to move it. Pinch or use the slider to zoom. With a keyboard, use the arrow keys to move it and plus or minus to zoom.</span></div>
        <div class="pp-stage" tabindex="0" role="application" aria-label="Photo position" aria-describedby="ppHint"><canvas></canvas><div class="pp-ring"></div></div>
        <label class="pp-zoom"><span aria-hidden="true">−</span><input type="range" min="1" max="4" step="0.01" value="1" aria-label="Zoom"><span aria-hidden="true">+</span></label>
        <div class="pp-f">
          <button type="button" class="btn ghost" data-pp="other">Choose another</button>
          <span class="pp-sp"></span>
          <button type="button" class="btn" data-pp="cancel">Cancel</button>
          <button type="button" class="btn primary" data-pp="ok">Use photo</button>
        </div>
      </div>`;
      if (opts.color) wrap.style.setProperty('--pp-ring', opts.color);
      document.body.appendChild(wrap);
      document.documentElement.classList.add('pp-open');
      const stage = wrap.querySelector('.pp-stage'), cv = stage.querySelector('canvas'), ctx = cv.getContext('2d');
      const range = wrap.querySelector('input[type=range]');
      const w = src.width, h = src.height;
      let S = 0, base = 1, z = 1, ox = 0, oy = 0;
      const scale = () => base * z;
      const clamp = () => {
        const sc = scale();
        ox = Math.min(0, Math.max(S - w * sc, ox));
        oy = Math.min(0, Math.max(S - h * sc, oy));
      };
      const draw = () => {
        const dpr = Math.min(3, window.devicePixelRatio || 1);
        if (cv.width !== Math.round(S * dpr)) { cv.width = cv.height = Math.round(S * dpr); }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, S, S);
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(src, ox, oy, w * scale(), h * scale());
      };
      const measure = () => {
        const old = S, cx = old ? (S / 2 - ox) / scale() : w / 2, cy = old ? (S / 2 - oy) / scale() : h / 2;
        S = stage.clientWidth || 280;
        base = Math.max(S / w, S / h);
        ox = S / 2 - cx * scale(); oy = S / 2 - cy * scale();
        clamp(); draw();
      };
      const zoomTo = (nz, px, py) => {
        nz = Math.max(1, Math.min(4, nz));
        const ix = (px - ox) / scale(), iy = (py - oy) / scale();
        z = nz;
        ox = px - ix * scale(); oy = py - iy * scale();
        clamp(); draw();
        range.value = String(z);
      };
      const pts = new Map();
      let pinch = null;
      const local = (e) => { const r = stage.getBoundingClientRect(); return { x: (e.clientX - r.left) * (S / r.width), y: (e.clientY - r.top) * (S / r.height) }; };
      const pinchInfo = () => {
        const [a, b] = [...pts.values()];
        return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      };
      stage.addEventListener('pointerdown', (e) => {
        stage.setPointerCapture(e.pointerId);
        pts.set(e.pointerId, local(e));
        if (pts.size === 2) pinch = Object.assign(pinchInfo(), { z });
        e.preventDefault();
      });
      stage.addEventListener('pointermove', (e) => {
        if (!pts.has(e.pointerId)) return;
        const prev = pts.get(e.pointerId), now = local(e);
        pts.set(e.pointerId, now);
        if (pts.size === 1) { ox += now.x - prev.x; oy += now.y - prev.y; clamp(); draw(); }
        else if (pts.size === 2 && pinch) {
          const p = pinchInfo();
          zoomTo(pinch.z * (p.d / pinch.d), p.x, p.y);
          ox += p.x - pinch.x; oy += p.y - pinch.y; clamp(); draw();
          pinch.x = p.x; pinch.y = p.y;
        }
      });
      const lift = (e) => { pts.delete(e.pointerId); pinch = pts.size === 2 ? Object.assign(pinchInfo(), { z }) : null; };
      stage.addEventListener('pointerup', lift);
      stage.addEventListener('pointercancel', lift);
      stage.addEventListener('wheel', (e) => { e.preventDefault(); const p = local(e); zoomTo(z * Math.exp(-e.deltaY * 0.0015), p.x, p.y); }, { passive: false });
      stage.addEventListener('keydown', (e) => {
        const step = 10, k = e.key;
        if (k === 'ArrowLeft') ox += step; else if (k === 'ArrowRight') ox -= step;
        else if (k === 'ArrowUp') oy += step; else if (k === 'ArrowDown') oy -= step;
        else if (k === '+' || k === '=') return zoomTo(z * 1.1, S / 2, S / 2);
        else if (k === '-' || k === '_') return zoomTo(z / 1.1, S / 2, S / 2);
        else return;
        e.preventDefault(); clamp(); draw();
      });
      range.addEventListener('input', () => zoomTo(parseFloat(range.value), S / 2, S / 2));
      const onResize = () => measure();
      window.addEventListener('resize', onResize);
      const returnTo = document.activeElement;
      const onKey = (e) => {
        if (e.key === 'Escape') { e.preventDefault(); close(null); return; }
        if (e.key !== 'Tab') return; // keep keyboard focus inside the picker
        const items = [...wrap.querySelectorAll('button, input, [tabindex="0"]')].filter((x) => !x.disabled);
        const first = items[0], last = items[items.length - 1], at = document.activeElement;
        if (!wrap.contains(at)) { e.preventDefault(); first.focus(); }
        else if (e.shiftKey && at === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && at === last) { e.preventDefault(); first.focus(); }
      };
      document.addEventListener('keydown', onKey);
      function close(result) {
        window.removeEventListener('resize', onResize);
        document.removeEventListener('keydown', onKey);
        document.documentElement.classList.remove('pp-open');
        wrap.remove();
        if (returnTo && document.contains(returnTo) && returnTo.getClientRects().length) returnTo.focus({ preventScroll: true });
        resolve(result);
      }
      function exportPhoto() {
        const sc = scale(), sx = -ox / sc, sy = -oy / sc, side = S / sc;
        // Two steps down to 128 px keeps the result smooth on browsers with plain bilinear scaling.
        const mid = document.createElement('canvas'); mid.width = mid.height = OUT * 4;
        const m = mid.getContext('2d'); m.imageSmoothingQuality = 'high';
        m.fillStyle = '#fff'; m.fillRect(0, 0, mid.width, mid.height);
        m.drawImage(src, sx, sy, side, side, 0, 0, mid.width, mid.height);
        const out = document.createElement('canvas'); out.width = out.height = OUT;
        const g = out.getContext('2d'); g.imageSmoothingQuality = 'high';
        g.drawImage(mid, 0, 0, OUT, OUT);
        let q = 0.86, url = out.toDataURL('image/jpeg', q);
        while (url.length > MAX_CHARS && q > 0.35) { q -= 0.12; url = out.toDataURL('image/jpeg', q); }
        return url.length <= MAX_CHARS && /^data:image\/jpeg;base64,/.test(url) ? url : null;
      }
      wrap.addEventListener('click', (e) => {
        const b = e.target.closest('[data-pp]'); if (!b) return;
        const a = b.dataset.pp;
        if (a === 'cancel') close(null);
        else if (a === 'ok') close(exportPhoto());
        else if (a === 'other') close({ again: chooseFile() }); // opened right here, inside the tap
      });
      requestAnimationFrame(() => { measure(); stage.focus({ preventScroll: true }); });
    });
  }

  async function pick(opts) {
    opts = opts || {};
    let file = await chooseFile();
    for (;;) {
      if (!file) return null;
      let img;
      try { img = await loadImage(file); } catch (e) {
        if (opts.onError) opts.onError('That picture could not be opened. Try a JPG or PNG photo.');
        return null;
      }
      const res = await cropDialog(shrink(img, SRC_MAX), opts);
      if (res && res.again) { file = await res.again; continue; }
      return res;
    }
  }
  // An image of the right kind and size, or '' (also used by the server to check what it is sent).
  const valid = (v) => (typeof v === 'string' && v.length <= MAX_CHARS && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v) ? v : '');

  root.BoomPhoto = { pick, valid, MAX_CHARS };
})(typeof window !== 'undefined' ? window : globalThis);
