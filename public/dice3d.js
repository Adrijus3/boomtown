/* Boomtown 3D dice: two rounded cubes rendered with three.js (r128), lit by a key light, a warm rim
   light and a soft fill, casting shadows onto the board. Falls back to null when WebGL is unavailable. */
(function (root) {
  'use strict';
  // BoxGeometry material groups are +x, -x, +y, -y, +z, -z. Opposite faces add up to 7.
  const FACES = [3, 4, 1, 6, 2, 5];
  const NORMAL = { 3: [1, 0, 0], 4: [-1, 0, 0], 1: [0, 1, 0], 6: [0, -1, 0], 2: [0, 0, 1], 5: [0, 0, -1] };
  const A = 0.27, B = 0.73, M = 0.5;
  const PIPS = {
    1: [[M, M]],
    2: [[A, A], [B, B]],
    3: [[A, A], [M, M], [B, B]],
    4: [[A, A], [B, A], [A, B], [B, B]],
    5: [[A, A], [B, A], [M, M], [A, B], [B, B]],
    6: [[A, 0.25], [B, 0.25], [A, M], [B, M], [A, 0.75], [B, 0.75]],
  };
  const RADIUS = 0.15;

  function supported() {
    if (!root.THREE) return false;
    try {
      const c = document.createElement('canvas');
      return !!(c.getContext('webgl2') || c.getContext('webgl'));
    } catch (e) { return false; }
  }

  function faceTexture(THREE, value) {
    const s = 512, c = document.createElement('canvas');
    c.width = c.height = s;
    const g = c.getContext('2d');
    const base = g.createLinearGradient(0, 0, s, s);
    base.addColorStop(0, '#FFFFFF');
    base.addColorStop(1, '#EEF1F6');
    g.fillStyle = base;
    g.fillRect(0, 0, s, s);
    for (const [x, y] of PIPS[value]) {
      const r = s * (value === 1 ? 0.12 : 0.082), cx = x * s, cy = y * s;
      // Recessed pip: dark cup, lighter lower lip catching the light.
      g.fillStyle = 'rgba(255,255,255,0.9)';
      g.beginPath(); g.arc(cx + r * 0.06, cy + r * 0.1, r * 1.06, 0, Math.PI * 2); g.fill();
      const cup = g.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r);
      cup.addColorStop(0, value === 1 ? '#E0283C' : '#3A4362');
      cup.addColorStop(1, value === 1 ? '#8E0F1E' : '#0B0F1A');
      g.fillStyle = cup;
      g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = 8;
    return tex;
  }

  // A subdivided box whose edges are pushed out from an inner box, giving smoothly rounded edges.
  function roundedBox(THREE, size, radius, seg) {
    const geo = new THREE.BoxGeometry(size, size, size, seg, seg, seg);
    const pos = geo.attributes.position, nor = geo.attributes.normal;
    const inner = size / 2 - radius;
    const v = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      c.set(Math.max(-inner, Math.min(inner, v.x)), Math.max(-inner, Math.min(inner, v.y)), Math.max(-inner, Math.min(inner, v.z)));
      n.subVectors(v, c);
      if (n.lengthSq() < 1e-12) n.fromBufferAttribute(nor, i);
      n.normalize();
      v.copy(c).addScaledVector(n, radius);
      pos.setXYZ(i, v.x, v.y, v.z);
      nor.setXYZ(i, n.x, n.y, n.z);
    }
    pos.needsUpdate = true;
    nor.needsUpdate = true;
    return geo;
  }

  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  const easeOutQuart = (t) => 1 - Math.pow(1 - t, 4);
  function settle(t) { // height factor 1 → 0 with decaying hops
    const n1 = 7.5625, d1 = 2.75;
    let x = t, y;
    if (x < 1 / d1) y = n1 * x * x;
    else if (x < 2 / d1) { x -= 1.5 / d1; y = n1 * x * x + 0.75; }
    else if (x < 2.5 / d1) { x -= 2.25 / d1; y = n1 * x * x + 0.9375; }
    else { x -= 2.625 / d1; y = n1 * x * x + 0.984375; }
    return 1 - y;
  }

  function create(canvas, host) {
    if (!supported()) return null;
    const THREE = root.THREE;
    let renderer;
    const lowPower = (root.navigator.hardwareConcurrency || 8) <= 6 || (root.navigator.deviceMemory || 8) <= 6 || (root.matchMedia && root.matchMedia('(max-width: 1600px)').matches);
    try { renderer = new THREE.WebGLRenderer({ canvas, antialias: !lowPower, alpha: true, powerPreference: 'low-power' }); }
    catch (e) { return null; }
    renderer.setPixelRatio(Math.min(lowPower ? 1.35 : 1.75, root.devicePixelRatio || 1));
    renderer.setClearColor(0x000000, 0);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(24, 2, 0.1, 80);
    scene.add(new THREE.HemisphereLight(0xE6EDFF, 0x0E1630, 0.8));
    const key = new THREE.DirectionalLight(0xFFFFFF, 1.3);
    key.position.set(-2.4, 6.5, 3.4);
    key.castShadow = true;
    key.shadow.mapSize.set(lowPower ? 512 : 768, lowPower ? 512 : 768);
    Object.assign(key.shadow.camera, { left: -4, right: 4, top: 3, bottom: -3, near: 1, far: 16 });
    key.shadow.radius = 5;
    key.shadow.bias = -0.0006;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xF1B94B, 0.55);
    rim.position.set(3.6, 2.4, -3.2);
    scene.add(rim);
    const fill = new THREE.DirectionalLight(0x9DB8FF, 0.3);
    fill.position.set(3.2, 1.6, 4.2);
    scene.add(fill);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(24, 14), new THREE.ShadowMaterial({ opacity: 0.45 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const geo = roundedBox(THREE, 1, RADIUS, lowPower ? 16 : 20);
    const mats = FACES.map((v) => new THREE.MeshPhysicalMaterial({ map: faceTexture(THREE, v), roughness: 0.32, metalness: 0, clearcoat: 0.75, clearcoatRoughness: 0.16 }));
    const UP = new THREE.Vector3(0, 1, 0);
    const dice = [0, 1].map((k) => {
      const mesh = new THREE.Mesh(geo, mats);
      mesh.castShadow = true;
      scene.add(mesh);
      return { mesh, restX: k ? 0.8 : -0.8, yaw: k ? -0.5 : 0.42 };
    });
    const m4 = new THREE.Matrix4();
    // Height of the lowest point for an orientation, so a tumbling die never sinks into the board.
    function halfHeight(q) {
      m4.makeRotationFromQuaternion(q);
      const e = m4.elements;
      return (0.5 - RADIUS) * (Math.abs(e[1]) + Math.abs(e[5]) + Math.abs(e[9])) + RADIUS;
    }
    function orient(v, yaw) {
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(...NORMAL[v]), UP);
      return new THREE.Quaternion().setFromAxisAngle(UP, yaw).multiply(q);
    }

    let raf = 0, alive = true;
    const draw = () => { if (alive) renderer.render(scene, camera); };
    function resize() {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      const half = THREE.MathUtils.degToRad(camera.fov) / 2;
      const dist = Math.max(4.3 / 2 / (Math.tan(half) * camera.aspect), 2.1 / 2 / Math.tan(half));
      const dir = new THREE.Vector3(0, 0.9, 0.42).normalize();
      camera.position.copy(dir.multiplyScalar(dist)).add(new THREE.Vector3(0, 0.3, 0));
      camera.lookAt(0, 0.3, 0);
      camera.updateProjectionMatrix();
      draw();
    }
    const ro = root.ResizeObserver ? new ResizeObserver(resize) : null;
    if (ro) ro.observe(host || canvas);

    function set(values) {
      cancelAnimationFrame(raf);
      dice.forEach((d, k) => {
        d.mesh.quaternion.copy(orient(values[k], d.yaw));
        d.mesh.position.set(d.restX, halfHeight(d.mesh.quaternion), 0);
      });
      resize();
    }

    function roll(values, ms) {
      cancelAnimationFrame(raf);
      const reduce = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduce || !alive) { set(values); return Promise.resolve(); }
      const plans = dice.map((d, k) => {
        const yaw = (k ? -1 : 1) * (0.3 + Math.random() * 0.35);
        const axis = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.4, Math.random() - 0.5 + 0.9).normalize();
        return {
          d, yaw,
          q0: d.mesh.quaternion.clone(),
          q1: orient(values[k], yaw),
          axis,
          turns: 1.6 + Math.random() * 0.9,
          from: new THREE.Vector3(-3.1 - k * 0.35, 0, 0.55 + Math.random() * 0.3),
          to: new THREE.Vector3(d.restX + (Math.random() - 0.5) * 0.12, 0, (Math.random() - 0.5) * 0.22),
          lift: 1.5 + Math.random() * 0.5,
          delay: k * 0.07,
        };
      });
      const qs = new THREE.Quaternion(), qa = new THREE.Quaternion();
      return new Promise((resolve) => {
        const t0 = performance.now();
        const frame = (now) => {
          let busy = false;
          for (const p of plans) {
            const u = Math.max(0, Math.min(1, (now - t0) / ms - p.delay));
            if (u < 1) busy = true;
            const e = easeOutCubic(u), er = easeOutQuart(u);
            qa.copy(p.q0).slerp(p.q1, er);
            qs.setFromAxisAngle(p.axis, (1 - er) * p.turns * Math.PI * 2);
            p.d.mesh.quaternion.copy(qs).multiply(qa);
            const x = p.from.x + (p.to.x - p.from.x) * e, z = p.from.z + (p.to.z - p.from.z) * e;
            p.d.mesh.position.set(x, halfHeight(p.d.mesh.quaternion) + p.lift * settle(u), z);
            if (u >= 1) { p.d.yaw = p.yaw; p.d.mesh.quaternion.copy(p.q1); p.d.mesh.position.set(p.to.x, halfHeight(p.q1), p.to.z); }
          }
          draw();
          if (busy && alive) raf = requestAnimationFrame(frame);
          else resolve();
        };
        raf = requestAnimationFrame(frame);
      });
    }

    function dispose() {
      alive = false;
      cancelAnimationFrame(raf);
      if (ro) ro.disconnect();
      geo.dispose();
      mats.forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
      renderer.dispose();
      if (renderer.forceContextLoss) renderer.forceContextLoss();
    }

    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); alive = false; if (host) host.classList.remove('gl'); });
    set([5, 3]);
    return { set, roll, resize, dispose };
  }

  root.BoomDice = { create, supported };
})(typeof window !== 'undefined' ? window : globalThis);
