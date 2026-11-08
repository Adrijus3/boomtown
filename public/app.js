(function () {
  'use strict';
  const { Game, BOARD, GROUPS, GROUP_TILES, fmt } = window.Boomtown;

  // ------------------------------------------------------------ helpers
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const initial = (n) => (String(n || '?').trim()[0] || '?').toUpperCase();
  document.documentElement.lang = document.documentElement.lang || 'en-GB'; // British English for screen readers
  // Lighter effects only for slow devices (few processor cores and little memory, such as a basic
  // classroom Chromebook), not for every laptop-sized screen.
  const CORES = navigator.hardwareConcurrency || 8, MEMORY = navigator.deviceMemory || 8;
  const PERF_LITE = CORES <= 2 || MEMORY <= 2 || (CORES <= 4 && MEMORY <= 4);
  if (PERF_LITE) document.documentElement.classList.add('performance-lite');
  const PROF_KEY = 'boomtown.online.v1';
  const store = {
    get(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* storage unavailable */ } },
  };
  // The latest signed copy of the room this player is seated in, so the game can come back after a server update.
  const SNAP_KEY = 'boomtown.snap.v1';
  const COLORS = ['#F5B83D', '#FF7A59', '#F062A5', '#A78BFA', '#4FB3FF', '#2CC7B0', '#9BD34B', '#E3E8F4'];
  const SPEED = {
    relaxed: { step: 150, dice: 1300, card: 500, jump: 560 },
    normal: { step: 110, dice: 1050, card: 350, jump: 480 },
    fast: { step: 65, dice: 700, card: 220, jump: 380 },
  };

  const ICON = {
    palette: '<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.8-.8 1.8-1.7 0-.5-.2-.9-.5-1.2s-.5-.8-.5-1.2c0-1 .8-1.7 1.7-1.7H16a5 5 0 0 0 5-5c0-4-4-7.2-9-7.2z"/><circle cx="7.5" cy="11.5" r="1.3"/><circle cx="10.5" cy="7.3" r="1.3"/><circle cx="15" cy="7.6" r="1.3"/>',
    start: '<path d="M4 12h15"/><path d="m13 5 7 7-7 7"/>',
    plane: '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
    bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
    drop: '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>',
    question: '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
    gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5"/>',
    umbrella: '<path d="M22 12a10 10 0 0 0-20 0z"/><path d="M12 12v7a2 2 0 0 0 4 0"/><path d="M12 2v1"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    receipt: '<path d="M6 2h12v20l-3-2-3 2-3-2-3 2z"/><path d="M9 7h6M9 11h6M9 15h4"/>',
    gem: '<path d="M6 3h12l4 6-10 12L2 9z"/><path d="M2 9h20"/><path d="m12 21-4-12 4-6 4 6-4 12"/>',
    dice: '<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8.5" cy="8.5" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.3" fill="currentColor"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    gavel: '<path d="m14 13-7.5 7.5a2.1 2.1 0 0 1-3-3L11 10"/><path d="m16 16 6-6"/><path d="m8 8 6-6"/><path d="m9 7 8 8"/><path d="m21 11-8-8"/>',
    swap: '<path d="M7 4 3 8l4 4"/><path d="M3 8h14"/><path d="m17 20 4-4-4-4"/><path d="M21 16H7"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    bot: '<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 8V4"/><circle cx="9" cy="14" r="1.2" fill="currentColor"/><circle cx="15" cy="14" r="1.2" fill="currentColor"/>',
    volume: '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/>',
    mute: '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="m22 9-6 6M16 9l6 6"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
    exit: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>',
    crown: '<path d="m2 18 2.5-11 5 5L12 5l2.5 7 5-5L22 18z"/><path d="M4 21h16"/>',
    house: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/>',
    flag: '<path d="M4 22V4"/><path d="M4 4h13l-2.5 4L17 12H4"/>',
    camera: '<path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h1.8l1.6-2.2h6.2L16.7 6h1.8A2.5 2.5 0 0 1 21 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z"/><circle cx="12" cy="13" r="3.6"/>',
    warn: '<path d="M10.3 3.9 2.4 17.6A2 2 0 0 0 4.1 20.6h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9.5v4.5M12 17.2h.01"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
    zoomin: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4M11 8v6M8 11h6"/>',
    zoomout: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4M8 11h6"/>',
  };
  const icon = (n, cls) => `<svg class="ic ${cls || ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n]}</svg>`;
  const MARK = '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="3" y="17" width="10" height="20" rx="2" style="fill:var(--brass)" opacity=".5"/><rect x="15" y="5" width="11" height="32" rx="2" style="fill:var(--brass)"/><rect x="28" y="12" width="9" height="25" rx="2" style="fill:var(--brass)" opacity=".78"/><g style="fill:var(--ink)"><rect x="18" y="10" width="2" height="3"/><rect x="21.5" y="10" width="2" height="3"/><rect x="18" y="16" width="2" height="3"/><rect x="21.5" y="16" width="2" height="3"/><rect x="18" y="22" width="2" height="3"/><rect x="21.5" y="22" width="2" height="3"/><rect x="18" y="29" width="5.5" height="8"/></g></svg>';
  const WORDMARK = `<span class="brand">${MARK}<span class="wordmark">Poor<em>Down</em></span></span>`;

  // ------------------------------------------------------------ sound
  const Sound = {
    ctx: null, on: true, last: {},
    ensure() {
      if (!this.on) return null;
      try {
        if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (this.ctx.state === 'suspended') this.ctx.resume();
      } catch (e) { this.ctx = null; }
      return this.ctx;
    },
    throttle(k, ms) { const n = Date.now(); if (this.last[k] && n - this.last[k] < ms) return false; this.last[k] = n; return true; },
    tone(f, d, type, v, at) {
      const c = this.ensure(); if (!c || c.state !== 'running') return;
      const t = c.currentTime + (at || 0);
      const o = c.createOscillator(), g = c.createGain();
      o.type = type || 'sine'; o.frequency.setValueAtTime(f, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(v || 0.05, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g).connect(c.destination); o.start(t); o.stop(t + d + 0.03);
    },
    click(at, v) {
      const c = this.ensure(); if (!c || c.state !== 'running') return;
      if (!this.buf) {
        this.buf = c.createBuffer(1, c.sampleRate * 0.04, c.sampleRate);
        const d = this.buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
      }
      const s = c.createBufferSource(), g = c.createGain(), f = c.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = 1800 + Math.random() * 1400;
      g.gain.value = v || 0.25; s.buffer = this.buf;
      s.connect(f).connect(g).connect(c.destination); s.start(c.currentTime + (at || 0));
    },
    dice() { for (let k = 0; k < 7; k++) this.click(k * 0.075 + Math.random() * 0.03, 0.3 - k * 0.03); },
    step() { this.tone(560 + Math.random() * 90, 0.05, 'sine', 0.018); },
    whoosh(ms) {
      const c = this.ensure(); if (!c || c.state !== 'running') return;
      const dur = Math.min(2.4, Math.max(0.3, ms / 1000));
      const len = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(), t = c.currentTime;
      f.type = 'bandpass'; f.Q.value = 1.2;
      f.frequency.setValueAtTime(380, t); f.frequency.exponentialRampToValueAtTime(1400, t + dur * 0.45); f.frequency.exponentialRampToValueAtTime(420, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + dur * 0.35); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.buffer = buf; src.connect(f).connect(g).connect(c.destination); src.start(t); src.stop(t + dur + 0.05);
    },
    land() { this.click(0, 0.18); this.tone(330, 0.09, 'sine', 0.025); },
    coin() { if (!this.throttle('coin', 140)) return; this.tone(988, 0.09, 'triangle', 0.045); this.tone(1319, 0.18, 'triangle', 0.04, 0.07); },
    pay() { if (!this.throttle('pay', 140)) return; this.tone(392, 0.12, 'triangle', 0.04); this.tone(262, 0.2, 'triangle', 0.035, 0.08); },
    build() { this.tone(196, 0.07, 'square', 0.022); this.tone(392, 0.1, 'triangle', 0.04, 0.05); },
    card() { this.tone(660, 0.08, 'sine', 0.035); this.tone(990, 0.14, 'sine', 0.035, 0.07); },
    bid() { this.tone(740, 0.06, 'square', 0.02); },
    tick() { this.tone(1046, 0.05, 'square', 0.018); },
    turn() { this.tone(523, 0.08, 'sine', 0.03); this.tone(784, 0.14, 'sine', 0.03, 0.08); },
    jail() { this.tone(220, 0.25, 'sawtooth', 0.025); this.tone(147, 0.4, 'sawtooth', 0.025, 0.15); },
    win() { [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.4, 'triangle', 0.045, i * 0.11)); },
  };

  // ------------------------------------------------------------ rules form definition
  const RULES = [
    { group: 'Room' },
    { key: 'maxPlayers', type: 'select', label: 'Maximum players', desc: 'How many seats this room has.', options: [2, 3, 4, 5, 6, 7, 8].map((n) => [n, `${n} players`]) },
    { key: 'private', type: 'toggle', label: 'Private room', desc: 'Hidden from the open rooms list. Only people with the link can join.' },
    { group: 'Money' },
    { key: 'startingCash', type: 'select', label: 'Starting cash', desc: 'What every player begins with.', options: [[1000, '£1,000'], [1500, '£1,500'], [2000, '£2,000'], [2500, '£2,500'], [3000, '£3,000']] },
    { key: 'salary', type: 'select', label: 'Salary at Start', desc: 'Paid each time you pass Start.', options: [[100, '£100'], [150, '£150'], [200, '£200'], [300, '£300'], [400, '£400']] },
    { key: 'doubleOnStart', type: 'toggle', label: 'Double salary on Start', desc: 'Land exactly on Start to collect twice the salary.' },
    { key: 'vacationCash', type: 'toggle', label: 'Free Parking jackpot', desc: 'Half of every tax, fine and bail goes into a jackpot on Free Parking, up to £200. Whoever lands there collects it.' },
    { group: 'Property' },
    { key: 'auctions', type: 'toggle', label: 'Auctions', desc: 'A property nobody buys goes to the highest bidder.' },
    { key: 'doubleRentSet', type: 'toggle', label: 'Double rent on full sets', desc: 'Own a whole region to charge twice the base rent on empty lots.' },
    { key: 'mortgages', type: 'toggle', label: 'Mortgages', desc: 'Borrow half a property’s price. Pay it back with 10% interest.' },
    { key: 'evenBuild', type: 'toggle', label: 'Even build', desc: 'Houses go up and come down evenly across a region.' },
    { key: 'limitedBuildings', type: 'toggle', label: 'Housing shortage', desc: 'The bank holds only 32 houses and 12 hotels.' },
    { key: 'noRentInPrison', type: 'toggle', label: 'No rent from Prison', desc: 'Owners serving time collect nothing.' },
    { group: 'Pace' },
    { key: 'rollTimer', type: 'select', label: 'Roll timer', desc: 'How long each player has to roll the dice. When it runs out, the dice are rolled for them.', options: [[0, 'Off'], [30, '30 seconds'], [60, '1 minute'], [90, '1½ minutes'], [120, '2 minutes']] },
    { key: 'turnTimer', type: 'select', label: 'Turn timer', desc: 'After rolling, how long to buy, build, trade and end the turn. When it runs out, the turn is finished and nothing is bought.', options: [[0, 'Off'], [60, '1 minute'], [120, '2 minutes'], [180, '3 minutes'], [300, '5 minutes']] },
    { key: 'bail', type: 'select', label: 'Prison bail', desc: 'What it costs to walk out early.', options: [[50, '£50'], [100, '£100'], [150, '£150']] },
    { key: 'botSpeed', type: 'select', label: 'Game speed', desc: 'How fast tokens move and bots decide.', options: [['relaxed', 'Relaxed'], ['normal', 'Normal'], ['fast', 'Fast']] },
    { key: 'randomOrder', type: 'toggle', label: 'Shuffle turn order', desc: 'Randomise who goes first.' },
  ];

  // ------------------------------------------------------------ state
  const prof = Object.assign({ token: '', name: '', color: COLORS[0], sound: true, avatar: '' }, store.get(PROF_KEY) || {});
  const saveProf = () => store.set(PROF_KEY, prof);
  Sound.on = prof.sound !== false;
  let screen = 'home';
  let me = null;          // my client id
  let room = null;        // latest room view from the server
  let game = null;        // read-only Game built from server state
  let meta = null;        // per-message extras: my seat, timers, away list
  let wantRoom = (location.pathname.match(/^\/room\/([a-z0-9]{3,12})/i) || [])[1] || null;
  let ui = freshUI();
  let dice3d = null; // WebGL dice; null means the CSS dice are used
  function freshUI() {
    return {
      busy: false, gq: [], gid: -1, offset: 0, clock: null, clockAt: 0, displayPos: {}, toCell: {}, tileEls: [], tokenEls: {}, tokenXY: {}, moving: {}, moneyShown: {}, spin: [[0, 0], [0, 0]],
      view: null, tab: 'portfolio', modal: null, draft: null, renderQueued: false, lastHTML: {}, lastTurn: null,
      autoRoll: false, autoRollTurn: null,
    };
  }
  const myPid = () => (meta && meta.me != null ? meta.me : null);
  const amHost = () => room && room.hostId === me;
  const speed = () => SPEED[(room && room.settings.botSpeed) || 'normal'] || SPEED.normal;
  const pname = (id) => { const p = game && game.player(id); return p ? p.name : ''; };
  const turnOf = (p) => (p.id === myPid() ? 'Your turn' : `${p.name}${/s$/i.test(p.name) ? '’' : '’s'} turn`);
  function tokenText(p) {
    const list = game ? game.s.players : (room ? room.seats : []);
    const first = initial(p.name);
    if (list.filter((x) => initial(x.name) === first).length < 2) return first;
    const num = String(p.name).match(/(\d+)\s*$/);
    if (num) return num[1].slice(-2);
    const letters = String(p.name).replace(/[^\p{L}]/gu, '');
    return (letters.slice(0, 2) || first).replace(/^./, (c) => c.toUpperCase());
  }
  // A player's or seat's photo, if they picked one. In a game, player ids are seat numbers.
  const avatarOf = (p) => (!p ? '' : p.avatar || (p.id != null && room && room.seats && room.seats[p.id] && !room.seats[p.id].bot ? room.seats[p.id].avatar || '' : ''));
  const glowFor = (p) => p.id === myPid(); // the danger glow is shown to the player about to roll
  // A photo replaces the letter wherever a player's dot is drawn, ringed in their colour.
  const imgHTML = (src) => `<img src="${esc(src)}" alt="" draggable="false" decoding="async">`;
  const dotHTML = (p, cls) => { const src = avatarOf(p); return `<span class="pdot ${src ? 'has-img' : ''} ${cls || ''}" style="--pc:${p.color}">${src ? imgHTML(src) : esc(tokenText(p))}</span>`; };
  const faceKey = (p) => avatarOf(p) || `t:${tokenText(p)}`;
  const tokenFaceHTML = (p) => { const src = avatarOf(p); return `<div class="tk ${src ? 'has-img' : ''}">${src ? imgHTML(src) : esc(tokenText(p))}</div>`; };
  const whoFace = (x) => { const src = avatarOf(x); return src ? imgHTML(src) : esc(tokenText(x)); };
  const groupColor = (i) => (BOARD[i].group ? GROUPS[BOARD[i].group].color : BOARD[i].type === 'airport' ? '#9AA6C4' : '#7CC8FF');
  const serverNow = () => Date.now() + ui.offset;

  // ------------------------------------------------------------ network
  const net = {
    ws: null, open: false, backoff: 600,
    connect() {
      const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
      this.ws = ws;
      ws.onopen = () => {
        this.open = true; this.backoff = 600;
        $('#netbar').hidden = true;
        this.raw({ type: 'hello', token: prof.token, name: prof.name, color: prof.color, avatar: prof.avatar || '' });
        if (wantRoom) this.raw({ type: 'join', room: wantRoom });
        else this.raw({ type: 'rooms' });
      };
      ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch (err) { return; } onMessage(m); };
      ws.onclose = () => {
        if (this.ws !== ws) return;
        this.open = false;
        $('#netbar').hidden = false;
        setTimeout(() => this.connect(), this.backoff);
        this.backoff = Math.min(8000, this.backoff * 1.8);
      };
    },
    raw(m) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(m)); },
    send(m) { if (this.open) this.raw(m); else toast('You are offline. Reconnecting…'); },
  };
  const act = (a, extra) => { Sound.ensure(); net.send(Object.assign({ type: 'action', a }, extra || {})); };

  function onMessage(m) {
    switch (m.type) {
      case 'welcome':
        me = m.clientId;
        if (prof.token !== m.token) { prof.token = m.token; saveProf(); }
        // The game was updated while this tab was open (phones keep tabs asleep for days). Load the new
        // files once; the room link and saved seat bring the player straight back to their game.
        if (m.build && window.BOOMTOWN_BUILD !== m.build) {
          let tried = '';
          try { tried = sessionStorage.getItem('boomtown.reloadFor') || ''; } catch (e) {}
          if (tried !== m.build) {
            try { sessionStorage.setItem('boomtown.reloadFor', m.build); } catch (e) {}
            toast('Updating to the latest version…');
            setTimeout(() => location.reload(), 400);
          }
        }
        break;
      case 'rooms': renderRoomList(m.rooms); break;
      case 'room': onRoom(m.room); break;
      // The turn clock is applied as soon as it arrives; game updates wait for their animations to play.
      case 'game': setClock(m.meta.turn, m.meta.now); ui.gq.push(m); pumpGame(); break;
      case 'timer': setClock(m.turn, m.now); break;
      case 'error': {
        // After a server update the room is gone from memory; hand back our copy so it can be rebuilt.
        const snap = m.code === 'noroom' ? store.get(SNAP_KEY) : null;
        if (snap && wantRoom && snap.room === wantRoom && Date.now() - snap.at < 12 * 3600e3) {
          net.send({ type: 'restore', data: snap.data, sig: snap.sig });
          toast('The server was updated. Bringing your game back…');
          break;
        }
        toast(esc(m.message));
        if (m.code === 'noroom' || m.code === 'norestore') { if (m.code === 'norestore') store.del(SNAP_KEY); wantRoom = null; goHome(); }
        break;
      }
      case 'snap':
        if (room && m.room === room.id) store.set(SNAP_KEY, { room: m.room, data: m.data, sig: m.sig, at: Date.now() });
        break;
      case 'notice': toast(esc(m.message)); break;
      case 'left': break;
    }
  }

  // ------------------------------------------------------------ screens
  document.title = 'PoorDown';
  function show(name) {
    screen = name;
    for (const id of ['home', 'room', 'game']) $('#' + id).hidden = id !== name;
    if (name !== 'game') { const vb = $('#voteBar'); if (vb) vb.remove(); }
    $('#app').scrollTop = 0; window.scrollTo(0, 0);
    if (name === 'home') drawRosette($('#homeRosette'), { rings: 3, alpha: 0.13 });
  }
  function goHome() {
    if (room) net.send({ type: 'leave' });
    room = null; game = null; meta = null; wantRoom = null;
    ui = freshUI();
    if (location.pathname !== '/') history.pushState(null, '', '/');
    show('home');
    renderHome();
    net.raw({ type: 'rooms' });
  }
  function onRoom(r) {
    const first = !room || room.id !== r.id;
    if (r.status === 'over') { const snap = store.get(SNAP_KEY); if (snap && snap.room === r.id) store.del(SNAP_KEY); }
    room = r;
    wantRoom = r.id;
    if (location.pathname !== `/room/${r.id}`) history.pushState(null, '', `/room/${r.id}`);
    if (r.status === 'waiting') {
      if (screen !== 'room') { game = null; meta = null; ui = freshUI(); closeModal(); show('room'); }
      renderRoom();
    } else if (screen === 'game') {
      scheduleRender();
    }
    renderVote();
    document.title = `PoorDown · room ${r.id}`;
  }
  window.addEventListener('popstate', () => {
    const id = (location.pathname.match(/^\/room\/([a-z0-9]{3,12})/i) || [])[1];
    if (!id && room) goHome();
    else if (id && (!room || room.id !== id)) { wantRoom = id; net.send({ type: 'join', room: id }); }
  });

  // ------------------------------------------------------------ home
  function renderHome() {
    $('#nick').value = prof.name || '';
    $('#homePalette').innerHTML = COLORS.map((c) => `<button type="button" data-c="${c}" style="--pc:${c}" class="${c === prof.color ? 'on' : ''}" aria-label="Use this colour" aria-pressed="${c === prof.color}"></button>`).join('');
    renderHomePhoto();
  }
  function renderHomePhoto() {
    const ph = $('#homePhoto'); if (!ph) return;
    ph.style.setProperty('--pc', prof.color);
    ph.classList.toggle('has-img', !!prof.avatar);
    ph.innerHTML = prof.avatar ? imgHTML(prof.avatar) : esc(initial(($('#nick') && $('#nick').value) || prof.name || '?'));
    $('#photoBtn').innerHTML = `${icon('camera')} ${prof.avatar ? 'Change photo' : 'Add a photo'}`;
    $('#photoDel').hidden = !prof.avatar;
  }
  // The photo picker opens from a tap. The picture is saved on this device and sent to the server.
  function pickPhoto() {
    if (!window.BoomPhoto) return;
    const sn = $('#seatName');
    if (sn && sn.value.trim()) { prof.name = sn.value.trim().slice(0, 18); saveProf(); }
    window.BoomPhoto.pick({ color: prof.color, onError: (msg) => toast(esc(msg)) }).then((url) => { if (url) setPhoto(url); });
  }
  function setPhoto(url) {
    prof.avatar = url || '';
    saveProf();
    net.send({ type: 'profile', avatar: prof.avatar });
    renderHomePhoto();
    if (room && screen === 'room') renderRoom();
  }
  const photoCtl = () => `<button class="btn sm" type="button" data-act="photo">${icon('camera')} ${prof.avatar ? 'Change photo' : 'Add a photo'}</button>${prof.avatar ? '<button class="link" type="button" data-act="nophoto">Remove photo</button>' : ''}`;
  function renderRoomList(list) {
    const el = $('#roomList');
    if (!list.length) { el.innerHTML = '<div class="empty"><b>No open rooms right now</b>Press Play now to open one, then share the link with friends.</div>'; return; }
    el.innerHTML = list.map((r) => `<div class="room-item">
      <div><div class="code">${esc(r.id)}</div><div class="sub">${esc(r.host || 'Host')}’s room · ${r.players} of ${r.max} seats${r.bots ? ` · ${r.bots} bot${r.bots > 1 ? 's' : ''}` : ''}</div></div>
      <span class="tag ${r.status === 'waiting' ? 'good' : ''}">${r.status === 'waiting' ? 'Waiting' : `Round ${r.round}`}</span>
      <button class="btn sm" data-join="${esc(r.id)}">${r.status === 'waiting' ? 'Join' : 'Watch'}</button></div>`).join('');
  }
  function readNick() {
    const n = $('#nick').value.trim().slice(0, 18);
    if (!n) { $('#nick').focus(); toast('Pick a nickname first.'); return null; }
    prof.name = n; saveProf();
    return n;
  }
  function bindHome() {
    $('#homeForm').addEventListener('submit', (e) => { e.preventDefault(); Sound.ensure(); const n = readNick(); if (n) net.send({ type: 'quick', name: n }); });
    $('#privateBtn').addEventListener('click', () => { Sound.ensure(); const n = readNick(); if (n) net.send({ type: 'create', private: true, name: n }); });
    $('#homePalette').addEventListener('click', (e) => { const b = e.target.closest('[data-c]'); if (!b) return; prof.color = b.dataset.c; saveProf(); renderHome(); net.send({ type: 'profile', color: prof.color }); });
    $('#nick').addEventListener('change', () => { const n = $('#nick').value.trim(); if (n) { prof.name = n.slice(0, 18); saveProf(); net.send({ type: 'profile', name: prof.name }); } });
    $('#nick').addEventListener('input', () => { if (!prof.avatar) renderHomePhoto(); });
    $('#photoBtn').addEventListener('click', pickPhoto);
    $('#photoDel').addEventListener('click', () => setPhoto(''));
    $('#refreshRooms').addEventListener('click', () => net.send({ type: 'rooms' }));
    $('#roomList').addEventListener('click', (e) => { const b = e.target.closest('[data-join]'); if (!b) return; const n = $('#nick').value.trim(); if (n) { prof.name = n; saveProf(); net.send({ type: 'profile', name: n }); } wantRoom = b.dataset.join; net.send({ type: 'join', room: wantRoom }); });
    $('#codeForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const code = $('#codeIn').value.trim().toLowerCase().replace(/^.*\/room\//, '').replace(/[^a-z0-9]/g, '');
      if (!code) return;
      const n = $('#nick').value.trim(); if (n) { prof.name = n; saveProf(); net.send({ type: 'profile', name: n }); }
      wantRoom = code; net.send({ type: 'join', room: code });
    });
  }

  // Seats whose player is offline. Someone who opens the room link on a new device (so has no saved seat)
  // can take theirs back with one tap.
  function rejoinHTML() {
    if (!room || !room.seats) return '';
    const inGame = room.status !== 'waiting' && game;
    const list = room.seats.map((st, i) => ({ st, i })).filter(({ st, i }) => !st.bot && !st.online && !(inGame && game.player(i) && game.player(i).bankrupt));
    if (!list.length) return '';
    return `<div class="rejoin" role="group" aria-labelledby="rejoinH"><span id="rejoinH" class="rejoin-h">Playing on a new device? Pick your seat to carry on.</span><span class="rejoin-btns">${list.map(({ st, i }) => `<button type="button" class="btn sm" data-rejoin="${i}"><span class="mini-dot" style="--pc:${st.color}" aria-hidden="true"></span>That's me: ${esc(st.name)}</button>`).join('')}</span></div>`;
  }
  // ------------------------------------------------------------ waiting room
  function renderRoom() {
    const r = room, host = amHost();
    const mySeat = r.seats.findIndex((s) => !s.bot && s.clientId === me);
    $('#shareLink').value = `${location.origin}/room/${r.id}`;
    $('#seatCount').textContent = `${r.seats.length} of ${r.settings.maxPlayers} seats${r.watchers ? ` · ${r.watchers} watching` : ''}`;
    const rows = r.seats.map((s, i) => `<li class="seat-row ${i === mySeat ? 'me' : ''}">
        ${i === mySeat ? `<button type="button" class="seat-face" data-act="photo" aria-label="${prof.avatar ? 'Change' : 'Add'} your photo">${dotHTML(s)}<span class="sw-cam" aria-hidden="true">${icon('camera')}</span></button>` : dotHTML(s)}
        <span class="who-name"><span class="nm">${esc(s.name)}</span>${s.bot ? '<span class="tag">Bot</span>' : `<span class="online-dot ${s.online ? '' : 'off'}" title="${s.online ? 'Online' : 'Offline'}"></span>`}${s.clientId && s.clientId === r.hostId ? `<span class="tag warn">${icon('crown')} Host</span>` : ''}${i === mySeat ? '<span class="tag you">You</span>' : ''}</span>
        ${host && i !== mySeat ? `<button class="icon-btn" data-kick="${i}" aria-label="Remove ${esc(s.name)}">${icon('x')}</button>` : '<span></span>'}
      </li>`);
    for (let k = r.seats.length; k < r.settings.maxPlayers; k++) rows.push(`<li class="seat-row empty"><span class="pdot">${k + 1}</span><span>Open seat</span><span></span></li>`);
    $('#roomSeats').innerHTML = rows.join('');
    const full = r.seats.length >= r.settings.maxPlayers;
    let ctl = '';
    if (mySeat < 0) {
      const taken = r.seats.map((s) => s.color);
      ctl = rejoinHTML() + (full ? '<span class="muted">All seats are taken. You can watch the game.</span>'
        : `<form class="seat-form" id="seatForm" autocomplete="off">
          <div class="photo-row"><span class="photo-prev ${prof.avatar ? 'has-img' : ''}" style="--pc:${prof.color}" aria-hidden="true">${prof.avatar ? imgHTML(prof.avatar) : esc(initial(prof.name || '?'))}</span>
            <div class="photo-txt"><div class="field-label">Profile photo</div><div class="photo-btns">${photoCtl()}</div></div></div>
          <label class="field-label" for="seatName">Your nickname</label>
          <input class="text-in" id="seatName" maxlength="18" value="${esc(prof.name)}" required>
          <div class="palette">${COLORS.map((c) => `<button type="button" data-seatc="${c}" style="--pc:${c}" class="${c === prof.color ? 'on' : taken.includes(c) ? 'taken' : ''}" ${taken.includes(c) ? 'disabled' : ''} aria-label="Use this colour"></button>`).join('')}</div>
          <div class="row"><button class="btn primary" type="submit">Join the game</button></div></form>`);
    } else {
      const taken = r.seats.filter((s, i) => i !== mySeat).map((s) => s.color);
      ctl = `<div class="palette">${COLORS.map((c) => `<button type="button" data-color="${c}" style="--pc:${c}" class="${c === r.seats[mySeat].color ? 'on' : taken.includes(c) ? 'taken' : ''}" ${taken.includes(c) ? 'disabled' : ''} aria-label="Switch to this colour"></button>`).join('')}</div>
        <span class="photo-btns seat-photo">${photoCtl()}</span>
        <button class="btn sm ghost" data-act="unseat">Give up my seat</button>`;
    }
    if (host) ctl += `<button class="btn sm" data-act="addBot" ${full ? 'disabled' : ''}>${icon('bot')} Add a bot</button>`;
    const seatCtl = $('#seatControls');
    if (!seatCtl.contains(document.activeElement) || document.activeElement.tagName !== 'INPUT') seatCtl.innerHTML = ctl;
    $('#rulesHint').textContent = host ? 'You are the host' : `Set by ${r.hostName || 'the host'}`;
    $('#roomRules').innerHTML = RULES.map((rule) => {
      if (rule.group) return `<div class="rgroup eyebrow">${rule.group}</div>`;
      const v = r.settings[rule.key], dis = host ? '' : 'disabled';
      const c = rule.type === 'toggle'
        ? `<label class="switch"><input type="checkbox" id="rule-${rule.key}" data-rule="${rule.key}" ${v ? 'checked' : ''} ${dis} aria-label="${esc(rule.label)}"><span></span></label>`
        : `<select class="select" id="rule-${rule.key}" data-rule="${rule.key}" ${dis} aria-label="${esc(rule.label)}">${rule.options.map(([val, lab]) => `<option value="${val}" ${String(val) === String(v) ? 'selected' : ''}>${lab}</option>`).join('')}</select>`;
      return `<div class="rule ${rule.type === 'toggle' ? 'flip' : 'pick'}"><div><div class="rl">${rule.label}</div><div class="rd">${rule.desc}</div></div>${c}</div>`;
    }).join('');
    $('#roomCta').classList.toggle('is-host', host);
    $('#roomCta').innerHTML = host
      ? `<button class="btn primary xl" data-act="start" ${r.seats.length < 2 ? 'disabled' : ''}>Start game</button><span class="room-cta-note">${r.seats.length < 2 ? 'You need at least two players. Share the link or add a bot.' : 'Everyone seated will play. People who join later can watch.'}</span>`
      : `<span class="room-cta-note">${icon('eye')} Waiting for ${esc(r.hostName || 'the host')} to start the game.</span>`;
  }
  function bindRoom() {
    const sec = $('#room');
    sec.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act],[data-kick],[data-color],[data-seatc]');
      if (!b) return;
      Sound.ensure();
      if (b.dataset.kick != null) return net.send({ type: 'kick', seat: +b.dataset.kick });
      if (b.dataset.color) { prof.color = b.dataset.color; saveProf(); return net.send({ type: 'profile', color: prof.color }); }
      if (b.dataset.seatc) { prof.color = b.dataset.seatc; saveProf(); $$('[data-seatc]').forEach((x) => x.classList.toggle('on', x === b)); return; }
      const a = b.dataset.act;
      if (a === 'photo') return pickPhoto();
      if (a === 'nophoto') return setPhoto('');
      if (a === 'unseat' || a === 'addBot' || a === 'start') net.send({ type: a });
    });
    sec.addEventListener('submit', (e) => {
      if (e.target.id !== 'seatForm') return;
      e.preventDefault();
      const n = $('#seatName').value.trim().slice(0, 18);
      if (!n) return;
      prof.name = n; saveProf();
      net.send({ type: 'seat', name: n, color: prof.color });
    });
    $('#roomRules').addEventListener('change', (e) => {
      const el = e.target.closest('[data-rule]'); if (!el) return;
      net.send({ type: 'setting', key: el.dataset.rule, value: el.type === 'checkbox' ? el.checked : el.value });
    });
    $('#copyLink').addEventListener('click', () => copyLink());
    $('#leaveRoom').addEventListener('click', goHome);
  }
  function copyLink() {
    const url = `${location.origin}/room/${room ? room.id : ''}`;
    const done = () => toast('Room link copied. Send it to your friends.');
    const fallback = () => { const i = $('#shareLink'); i.focus(); i.select(); toast('Select the link and copy it.'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, fallback); else fallback();
  }

  // ------------------------------------------------------------ game messages & animation
  async function pumpGame() {
    if (ui.busy) return;
    const mine = ui;
    mine.busy = true;
    scheduleRender();
    try {
      while (mine.gq.length && ui === mine) {
        const m = mine.gq.shift();
        const fresh = m.gid !== mine.gid || !game, before = fresh ? null : propSnapshot();
        if (fresh) setupGame(m);
        else applyGame(m);
        for (const ev of m.events) quickEvent(ev);
        render();
        if (before) tileFx(before);
        const flows = moneyFlows(m.events.filter((ev) => ev.type === 'money'));
        flyMoney(flows);
        cardFx(flows);
        for (const ev of m.events) { if (ui !== mine) break; await playEvent(ev); }
        syncPositions();
      }
    } catch (err) { console.error(err); }
    mine.busy = false;
    if (ui === mine) scheduleRender();
  }
  function applyGame(m) {
    game = new Game(m.state);
    meta = m.meta;
  }
  function setClock(turn, now) {
    if (now < ui.clockAt) return;
    ui.clock = turn || null;
    ui.clockAt = now;
    ui.offset = now - Date.now();
  }
  function setupGame(m) {
    closeModal();
    applyGame(m);
    ui.gid = m.gid;
    ui.lastHTML = {};
    for (const p of game.s.players) ui.displayPos[p.id] = p.pos;
    if (game.s.pending) ui.displayPos[game.s.pending.pid] = game.s.pending.to;
    if (ui.view == null) ui.view = myPid() != null ? myPid() : game.cur.id;
    if (screen !== 'game') show('game');
    buildBoard();
    setDice(game.s.turn.dice || [5, 3], true);
    requestAnimationFrame(() => { positionTokens(true); drawRosette($('#rosette'), { rings: 4, alpha: 0.1 }); });
    if (game.s.over && !m.events.length) setTimeout(() => openModal('over'), 300);
  }
  function syncPositions() {
    if (!game) return;
    for (const p of game.s.players) ui.displayPos[p.id] = p.pos;
    if (game.s.pending) ui.displayPos[game.s.pending.pid] = game.s.pending.to;
  }
  function quickEvent(ev) {
    switch (ev.type) {
      case 'money': moneyFx(ev); if (ev.delta > 0) Sound.coin(); else Sound.pay(); break;
      case 'build': Sound.build(); break;
      case 'bid': Sound.bid(); break;
      case 'turn': if (ev.pid === myPid()) { Sound.turn(); ui.view = ev.pid; } break;
      case 'bankrupt': toast(`<b>${esc(pname(ev.pid))}</b> is out of the game.`); break;
      case 'trade': {
        const tr = game.findTrade(ev.id); if (!tr) break;
        if (ev.kind === 'new' && tr.to === myPid()) Sound.card();
        if ((ev.kind === 'accepted' || ev.kind === 'declined') && tr.from === myPid()) toast(`<b>${esc(pname(tr.to))}</b> ${ev.kind} your trade.`);
        break;
      }
    }
  }
  async function playEvent(ev) {
    switch (ev.type) {
      case 'dice': await rollDice(ev.dice); break;
      case 'move': await walk(ev); break;
      case 'teleport': await teleport(ev.pid, ev.to); break;
      case 'card': await showCard(ev); break;
      case 'over': await sleep(400); Sound.win(); openModal('over'); celebrate(); break;
    }
  }
  const reduceMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function tileCenter(i) { const t = ui.tileEls[i]; return { x: t.offsetLeft + t.offsetWidth / 2, y: t.offsetTop + t.offsetHeight / 2 }; }
  const walkMs = (n) => Math.max(380, Math.min(2400, n * speed().step));
  async function walk(ev) {
    if (ev.jump) {
      // A jump (Go to Prison) glides round the edge of the board through the corners, the shorter way,
      // never straight across the middle.
      const fwd = (ev.to - ev.from + 40) % 40, dir = fwd < 20 ? 1 : -1, n = dir > 0 ? fwd : 40 - fwd;
      const corners = [];
      for (let k = 1, pos = ev.from; k < n; k++) { pos = (pos + dir + 40) % 40; if (pos % 10 === 0) corners.push(tileCenter(pos)); }
      return travel(ev.pid, ev.to, corners, speed().jump * (1 + corners.length * 0.6), false);
    }
    const n = Math.abs(ev.steps), dir = ev.steps < 0 ? -1 : 1;
    const via = [];
    let pos = ev.from;
    if (BOARD[ev.from].type === 'jail') via.push(tileCenter(ev.from)); // step out of the cell first
    for (let k = 0; k < n - 1; k++) { pos = (pos + dir + 40) % 40; via.push(tileCenter(pos)); }
    await travel(ev.pid, ev.to, via, walkMs(n), false);
  }
  // Glides a token along tile centres in one eased motion, trailed by fading afterimages.
  async function travel(pid, to, via, ms, jump) {
    const el = ui.tokenEls[pid];
    const start = ui.tokenXY[pid] || (ui.tileEls[ui.displayPos[pid]] ? tileCenter(ui.displayPos[pid]) : null);
    ui.moving[pid] = true;
    ui.displayPos[pid] = to;
    positionTokens();
    const end = ui.tokenXY[pid];
    const done = () => { delete ui.moving[pid]; if (el) el.style.transition = ''; };
    if (!el || !start || !end || reduceMotion()) { done(); return; }
    const pts = [start].concat(via, [end]);
    if (jump) pts.splice(1, 0, { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 });
    const dist = [0];
    for (let k = 1; k < pts.length; k++) dist.push(dist[k - 1] + Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y));
    const total = dist[dist.length - 1];
    if (total < 1) { done(); return; }
    const lift = jump ? 1.25 : 1.1;
    const frames = pts.map((p, k) => ({ transform: `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) scale(${k === 0 ? start.s || 1 : k === pts.length - 1 ? end.s || 1 : lift})`, offset: dist[k] / total }));
    const easing = jump ? 'cubic-bezier(.55,0,.25,1)' : 'cubic-bezier(.42,0,.28,1)';
    const ghosts = [];
    [0.18, 0.07].forEach((op, g) => {
      const gh = document.createElement('div');
      gh.className = 'token ghost';
      gh.style.setProperty('--pc', el.style.getPropertyValue('--pc'));
      gh.style.opacity = op;
      gh.innerHTML = el.innerHTML;
      el.parentNode.insertBefore(gh, el);
      gh.animate(frames, { duration: ms, delay: (g + 1) * 20, easing, fill: 'both' });
      ghosts.push(gh);
    });
    Sound.whoosh(ms);
    if (jump) camOut(); else camFollow(pts, dist, total, ms, easing);
    const anim = el.animate(frames, { duration: ms, easing });
    try { await anim.finished; } catch (e) { /* interrupted */ }
    done();
    Sound.land();
    if (!jump) camOut(450);
    setTimeout(() => ghosts.forEach((g) => g.remove()), 5 * 26 + 60);
  }
  async function teleport(pid, to) {
    // a teleport to Prison is always "go to Prison": aim for the token's place in the cell from the start,
    // rather than landing outside and shuffling in when the new state arrives
    if (BOARD[to].type === 'jail') ui.toCell[pid] = true;
    // round the edge of the board via the corners (the shorter way), never straight across the middle
    const p = game.player(pid), from = ui.displayPos[pid] != null ? ui.displayPos[pid] : p ? p.pos : to;
    if (from !== to) { await walk({ jump: true, pid, from, to }); if (to === 10) Sound.jail(); return; }
    await travel(pid, to, [], speed().jump, true);
    if (to === 10) Sound.jail();
  }
  const FACE_ROT = { 1: [0, 0], 2: [90, 0], 3: [0, -90], 4: [0, 90], 5: [-90, 0], 6: [0, -180] };
  const PIPS = { 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };
  const TILT = [-22, 28];
  const LIGHT = (() => { const v = [-0.3, -0.85, 0.42], l = Math.hypot(...v); return v.map((x) => x / l); })();
  const NORMALS = { 1: [0, 0, 1], 6: [0, 0, -1], 3: [1, 0, 0], 4: [-1, 0, 0], 5: [0, -1, 0], 2: [0, 1, 0] };
  const rad = (deg) => (deg * Math.PI) / 180;
  const rotX = (a, v) => { const c = Math.cos(a), s = Math.sin(a); return [v[0], c * v[1] - s * v[2], s * v[1] + c * v[2]]; };
  const rotY = (a, v) => { const c = Math.cos(a), s = Math.sin(a); return [c * v[0] + s * v[2], v[1], -s * v[0] + c * v[2]]; };
  // Light each face from above-left for the cube's final orientation, so it reads as a solid object.
  function shadeCube(cube, ax, ay) {
    for (const f of [1, 2, 3, 4, 5, 6]) {
      const n = rotX(rad(TILT[0]), rotY(rad(TILT[1]), rotX(rad(ax), rotY(rad(ay), NORMALS[f]))));
      const dot = n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2];
      const el = cube.querySelector('.f' + f);
      if (el) el.style.setProperty('--lit', (0.6 + 0.48 * Math.max(0, dot)).toFixed(3));
    }
  }
  function setDice(d, instant) {
    if (dice3d) { dice3d.set(d); return; }
    $$('#dice .cube').forEach((cube, k) => {
      const [rx, ry] = FACE_ROT[d[k]];
      if (!instant) { ui.spin[k][0] += k ? 2 : 3; ui.spin[k][1] += k ? 3 : 2; }
      cube.classList.toggle('instant', !!instant);
      cube.style.transform = `rotateX(${rx + 360 * ui.spin[k][0]}deg) rotateY(${ry + 360 * ui.spin[k][1]}deg)`;
      shadeCube(cube, rx, ry);
    });
  }
  async function rollDice(d) {
    camOut();
    const ms = speed().dice, wrap = $('#dice');
    if (!wrap) return;
    if (dice3d) { Sound.dice(); await dice3d.roll(d, ms); return; }
    wrap.style.setProperty('--rollms', ms + 'ms');
    Sound.dice();
    $$('.die-wrap', wrap).forEach((w, k) => { w.classList.remove('roll'); void w.offsetWidth; w.style.setProperty('--lag', k * 60 + 'ms'); w.classList.add('roll'); });
    setDice(d);
    await sleep(ms + 60);
  }
  function showCard() {
    camOut();
    Sound.card();
    render();
    const first = $('#cFeed div');
    if (first) { first.classList.remove('flash'); void first.offsetWidth; first.classList.add('flash'); }
    return sleep(speed().card);
  }

  // ------------------------------------------------------------ timers shown on screen
  const fmtClock = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  // The clock for the turn on screen: one to roll, then one to finish the turn. Hidden for bots and auctions.
  const curClock = () => { const T = ui.clock; return T && game && !game.s.over && !game.cur.bot && T.n === game.s.turn.n ? T : null; };
  const clockLeft = (T) => (T ? Math.max(0, T.deadline != null ? T.deadline - serverNow() : T.left) : 0);
  const lowAt = (T) => Math.min(30000, T.total / 3);
  function clockLabel() {
    const T = curClock();
    if (!T) return 'Now';
    return T.expired ? 'Time' : fmtClock(clockLeft(T));
  }
  setInterval(() => {
    if (screen !== 'game' || !game || !meta) return;
    syncAutoRoll();
    const ring = $('#timerRing'), clock = $('#turnClock'), badge = $('#nowBadge');
    const T = curClock(), on = !!T;
    if (ring) ring.hidden = !on;
    if (clock) clock.hidden = !on;
    if (!on && badge) badge.textContent = 'Now';
    if (on) {
      const left = clockLeft(T), low = left <= lowAt(T), paused = T.deadline == null && !T.expired;
      const what = T.seg === 'roll' ? 'to roll' : 'to finish the turn';
      if (ring) {
        ring.classList.toggle('low', low);
        ring.querySelector('.fg').style.strokeDashoffset = String(56.5 * (1 - Math.max(0, Math.min(1, left / T.total))));
        ring.setAttribute('aria-label', `${fmtClock(left)} left ${what}`);
      }
      if (clock) { clock.textContent = T.expired ? "Time's up" : fmtClock(left); clock.title = `Time left ${what}`; clock.classList.toggle('low', low); clock.classList.toggle('paused', paused); }
      if (badge) badge.textContent = T.expired ? 'Time' : fmtClock(left);
      if (game.cur.id === myPid() && !T.expired) {
        const key = `${T.n}:${T.seg}`;
        const w = ui.tw && ui.tw.key === key ? ui.tw : (ui.tw = { key, warned: false, beep: 0 });
        if (low && left > 0 && !w.warned) { w.warned = true; toast(`You have <b>${Math.round(lowAt(T) / 1000)} seconds</b> left ${T.seg === 'roll' ? 'to roll the dice' : 'to finish your turn'}.`); }
        const secs = Math.ceil(left / 1000);
        if (!paused && secs > 0 && secs <= 10 && w.beep !== secs) { w.beep = secs; Sound.tick(); }
      }
    }
    tickVote();
    const A = meta.auction;
    const bar = $('#auctionBar'), secs = $('#auctionSecs');
    if (A && bar) {
      const left = A.deadline - serverNow();
      const fraction = Math.max(0, Math.min(1, left / A.span));
      const remaining = Math.max(0, Math.ceil(left / 1000));
      bar.style.transform = `scaleX(${fraction})`;
      const auctionBox = $('#auctionBox');
      const countdown = $('#auctionCountdown');
      const urgency = remaining <= 5 ? 'critical' : remaining <= 10 ? 'urgent' : 'normal';
      if (auctionBox && auctionBox.dataset.urgency !== urgency) auctionBox.dataset.urgency = urgency;
      if (countdown) countdown.classList.toggle('is-critical', urgency === 'critical');
      if (secs) secs.textContent = remaining + 's';
    }
  }, 200);

  // ------------------------------------------------------------ board
  // ------------------------------------------------------------ token faces
  function syncTokenFaces() {
    for (const p of game.s.players) {
      const el = ui.tokenEls[p.id], key = faceKey(p);
      if (el && el.dataset.face !== key) { el.dataset.face = key; el.innerHTML = tokenFaceHTML(p); }
    }
  }

  // ------------------------------------------------------------ follow-cam (phone-sized boards)
  // While a token walks, the board zooms in to frame the walk, then eases back out. It always zooms out
  // before dice, cards and auctions, which sit in the middle of the board.
  const cam = { on: false, t: 0, t2: 0, anim: null, last: '' };
  // ---- pinch to zoom (phones): two fingers zoom the board up to 3×, one finger pans while zoomed, and the
  // magnifier button zooms in on your token or back out. The board camera stands down while you're zoomed.
  const CAMERA_FOLLOW = false;
  const zoom = { s: 1, x: 0, y: 0, pts: new Map(), g: null, moved: false };
  const zoomable = () => { const b = $('#board'); return !!b && b.clientWidth > 0 && b.clientWidth < 600; };
  function applyZoom(animate) {
    const b = $('#board');
    if (!b) return;
    const W = b.clientWidth, H = b.clientHeight;
    zoom.s = Math.max(1, Math.min(3, zoom.s));
    if (zoom.s < 1.04) { zoom.s = 1; zoom.x = 0; zoom.y = 0; }
    zoom.x = Math.min(0, Math.max(W - W * zoom.s, zoom.x));
    zoom.y = Math.min(0, Math.max(H - H * zoom.s, zoom.y));
    const on = zoom.s > 1;
    if (on && cam.on) { cam.on = false; if (cam.anim) { cam.anim.cancel(); cam.anim = null; } clearTimeout(cam.t); clearTimeout(cam.t2); }
    b.style.transformOrigin = '0 0';
    b.style.transition = animate ? 'transform .32s cubic-bezier(.3,.7,.3,1)' : 'none';
    b.style.transform = on ? `translate(${zoom.x.toFixed(1)}px, ${zoom.y.toFixed(1)}px) scale(${zoom.s.toFixed(3)})` : '';
    b.classList.toggle('zoomed', on);
    // our own pinch handling replaces the browser's page zoom over the board (page scrolling still works)
    b.style.touchAction = zoomable() ? (on ? 'none' : 'pan-y') : '';
    if (b.parentElement) b.parentElement.classList.toggle('cam-clip', on || cam.on);
    placeZoomBtn();
  }
  function placeZoomBtn() {
    const b = $('#board'), stage = b && b.parentElement;
    if (!stage) return;
    let btn = $('#zoomBtn');
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button'; btn.id = 'zoomBtn'; btn.className = 'zoom-btn';
      stage.appendChild(btn);
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (zoom.s > 1) { zoom.s = 1; applyZoom(true); return; }
        const me = myPid(), at = me != null && ui.tokenXY[me] ? ui.tokenXY[me] : { x: b.clientWidth / 2, y: b.clientHeight / 2 };
        zoom.s = 2.2; zoom.x = b.clientWidth / 2 - at.x * zoom.s; zoom.y = b.clientHeight / 2 - at.y * zoom.s;
        applyZoom(true);
      });
    }
    const show = zoomable() && screen === 'game';
    btn.hidden = !show;
    if (!show) return;
    btn.innerHTML = icon(zoom.s > 1 ? 'zoomout' : 'zoomin');
    btn.setAttribute('aria-label', zoom.s > 1 ? 'Zoom out' : 'Zoom in on the board');
    btn.style.left = `${b.offsetLeft + b.offsetWidth - 38}px`;
    btn.style.top = `${b.offsetTop + b.offsetHeight - 38}px`;
  }
  function bindZoom() {
    const b = $('#board');
    const origin = () => { const r = b.parentElement.getBoundingClientRect(); return { x: r.left + b.offsetLeft, y: r.top + b.offsetTop }; };
    const mid = () => { const a = [...zoom.pts.values()]; return { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2, d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1 }; };
    b.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch' || !zoomable()) return;
      zoom.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (zoom.pts.size === 2) { const m = mid(); zoom.g = { kind: 'pinch', m, s: zoom.s, x: zoom.x, y: zoom.y }; }
      else if (zoom.pts.size === 1) { zoom.g = { kind: 'pan', sx: e.clientX, sy: e.clientY, x: zoom.x, y: zoom.y, live: false }; zoom.moved = false; }
    });
    b.addEventListener('pointermove', (e) => {
      if (!zoom.pts.has(e.pointerId)) return;
      zoom.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const g = zoom.g;
      if (!g) return;
      if (g.kind === 'pinch' && zoom.pts.size >= 2) {
        const m = mid(), O = origin();
        const cx = (g.m.x - O.x - g.x) / g.s, cy = (g.m.y - O.y - g.y) / g.s; // board point that was under the fingers
        zoom.s = Math.max(1, Math.min(3, g.s * (m.d / g.m.d)));
        zoom.x = m.x - O.x - cx * zoom.s; zoom.y = m.y - O.y - cy * zoom.s;
        zoom.moved = true;
        applyZoom(false);
      } else if (g.kind === 'pan' && zoom.s > 1) {
        const dx = e.clientX - g.sx, dy = e.clientY - g.sy;
        if (!g.live && Math.hypot(dx, dy) < 7) return;
        g.live = true; zoom.moved = true;
        zoom.x = g.x + dx; zoom.y = g.y + dy;
        applyZoom(false);
      }
    });
    const up = (e) => {
      if (!zoom.pts.delete(e.pointerId)) return;
      if (zoom.pts.size === 1 && zoom.g && zoom.g.kind === 'pinch') { const [p] = zoom.pts.values(); zoom.g = { kind: 'pan', sx: p.x, sy: p.y, x: zoom.x, y: zoom.y, live: true }; }
      else if (!zoom.pts.size) { zoom.g = null; if (zoom.s < 1.04) applyZoom(true); }
    };
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    // a drag or pinch shouldn't also count as a tap on a tile
    b.addEventListener('click', (e) => { if (zoom.moved) { zoom.moved = false; e.stopPropagation(); e.preventDefault(); } }, true);
    window.addEventListener('resize', () => { if (!zoomable()) zoom.s = 1; applyZoom(false); });
  }
  function camReset() {
    const board = $('#board');
    clearTimeout(cam.t); clearTimeout(cam.t2); cam.on = false;
    if (cam.anim) { cam.anim.cancel(); cam.anim = null; }
    if (board) { board.style.transform = ''; board.style.transition = ''; board.classList.remove('cam'); if (board.parentElement) board.parentElement.classList.remove('cam-clip'); }
  }
  // The camera rides along with the token on the same path and timing, so the token stays near the middle
  // of the screen (or as near as the board's edges allow).
  function camFollow(pts, dist, total, ms, easing) {
    const board = $('#board');
    // The follow-the-token camera is switched off: the board stays still on every screen size.
    if (CAMERA_FOLLOW !== true || !board || board.clientWidth >= 600 || reduceMotion() || PERF_LITE || total < 1 || zoom.s > 1) return;
    const W = board.clientWidth, H = board.clientHeight, s = 1.7;
    const at = (p) => {
      const tx = Math.min(0, Math.max(W - W * s, W / 2 - p.x * s)), ty = Math.min(0, Math.max(H - H * s, H / 2 - p.y * s));
      return `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px) scale(${s})`;
    };
    const pointAt = (q) => {
      const want = q * total;
      for (let k = 1; k < pts.length; k++) {
        if (dist[k] >= want) { const f = (want - dist[k - 1]) / ((dist[k] - dist[k - 1]) || 1); return { x: pts[k - 1].x + (pts[k].x - pts[k - 1].x) * f, y: pts[k - 1].y + (pts[k].y - pts[k - 1].y) * f }; }
      }
      return pts[pts.length - 1];
    };
    const q = Math.min(0.45, 320 / ms); // zooming in takes about a third of a second
    const kf = [{ transform: cam.on && cam.last ? cam.last : 'translate(0px, 0px) scale(1)', offset: 0 }, { transform: at(pointAt(q)), offset: q }];
    for (let k = 1; k < pts.length; k++) { const o = dist[k] / total; if (o > q) kf.push({ transform: at(pts[k]), offset: o }); }
    clearTimeout(cam.t); clearTimeout(cam.t2);
    if (cam.anim) cam.anim.cancel();
    board.style.transition = 'none';
    board.parentElement.classList.add('cam-clip');
    board.classList.add('cam');
    cam.last = kf[kf.length - 1].transform;
    cam.anim = board.animate(kf, { duration: ms, easing, fill: 'forwards' });
    cam.on = true;
  }
  function camOut(delay) {
    const board = $('#board');
    if (!board || !cam.on) return;
    clearTimeout(cam.t);
    cam.t = setTimeout(() => {
      cam.on = false;
      board.style.transition = 'none';
      board.style.transform = cam.last || '';
      if (cam.anim) { cam.anim.cancel(); cam.anim = null; }
      void board.offsetWidth;
      board.style.transition = '';
      board.style.transform = '';
      clearTimeout(cam.t2);
      cam.t2 = setTimeout(() => { if (!cam.on) { board.classList.remove('cam'); if (board.parentElement) board.parentElement.classList.remove('cam-clip'); } }, 600);
    }, delay || 0);
  }

  // ------------------------------------------------------------ money you can see move
  // A payment arrives as −amount for the payer, then +amount for each receiver. A −amount with nobody after it
  // went to the bank, and a +amount on its own came from the bank. The bank is the middle of the board.
  function moneyFlows(evs) {
    const out = [];
    for (let k = 0; k < evs.length; k++) {
      const e = evs[k];
      if (!e.delta) continue;
      if (e.delta > 0) { out.push({ from: null, to: e.pid, amt: e.delta }); continue; }
      let left = -e.delta;
      const recv = [];
      while (k + 1 < evs.length && evs[k + 1].delta > 0 && evs[k + 1].pid !== e.pid && evs[k + 1].delta <= left) { k++; recv.push(evs[k]); left -= evs[k].delta; }
      if (recv.length) recv.forEach((r) => out.push({ from: e.pid, to: r.pid, amt: r.delta }));
      else out.push({ from: e.pid, to: null, amt: -e.delta });
    }
    return out;
  }
  function flyMoney(flows) {
    const board = $('#board');
    if (!flows.length || !board || !board.offsetParent || !game || reduceMotion()) return;
    const bank = { x: board.clientWidth / 2, y: board.clientHeight / 2 };
    const at = (pid) => { if (pid == null) return bank; const p = game.player(pid); return p && !p.bankrupt && ui.tokenXY[pid] ? ui.tokenXY[pid] : bank; };
    flows.slice(0, 8).forEach((f, n) => {
      const a = at(f.from), b = at(f.to);
      if (Math.hypot(b.x - a.x, b.y - a.y) < 1) return;
      const delay = n * 170, coins = f.amt < 25 ? 1 : f.amt < 100 ? 2 : f.amt < 300 ? 3 : f.amt < 800 ? 4 : f.amt < 1500 ? 5 : 6;
      const dur = Math.round(Math.min(950, 520 + Math.hypot(b.x - a.x, b.y - a.y) * 0.8));
      if (f.from != null) boardFloat(board, a, `−${fmt(f.amt)}`, 'down', delay);
      for (let c = 0; c < coins; c++) coinFlight(board, a, b, dur, delay + c * 75, c);
      if (f.to != null) boardFloat(board, b, `+${fmt(f.amt)}`, 'up', delay + dur + (coins - 1) * 75 - 80);
    });
  }
  // ---- small "what just changed" effects
  function propSnapshot() {
    const o = {};
    for (const k of Object.keys(game.s.props)) { const pr = game.s.props[k]; o[k] = [pr.owner, pr.houses, pr.mortgaged]; }
    return o;
  }
  // A tile that changes hands gets a sweep in the new owner's colour; new buildings make it glow;
  // mortgaging or paying one off gives it a quick flash.
  function tileFx(before) {
    if (reduceMotion()) return;
    for (const k of Object.keys(game.s.props)) {
      const pr = game.s.props[k], was = before[k], el = ui.tileEls[+k];
      if (!was || !el) continue;
      let cls = '';
      if (was[0] !== pr.owner) cls = pr.owner != null ? 'fx-owned' : 'fx-freed';
      else if (pr.houses > was[1]) cls = 'fx-built';
      else if (pr.houses < was[1]) cls = 'fx-sold';
      else if (was[2] !== pr.mortgaged) cls = 'fx-mortgage';
      if (!cls) continue;
      const owner = pr.owner != null ? game.player(pr.owner) : null;
      if (owner) el.style.setProperty('--fx', owner.color);
      const old = el.querySelector(':scope > .tfx'); if (old) old.remove();
      const fx = document.createElement('i');
      fx.className = `tfx ${cls}`;
      fx.setAttribute('aria-hidden', 'true');
      el.appendChild(fx);
      setTimeout(() => fx.remove(), 1400);
    }
  }
  // The payer's card flashes red and the receiver's green, so you can see who paid whom at a glance.
  function cardFx(flows) {
    if (reduceMotion() || !flows.length) return;
    const flash = (pid, cls) => {
      const el = document.querySelector(`.pcard[data-pid="${pid}"]`);
      if (!el) return;
      el.classList.remove('fx-pay', 'fx-get'); void el.offsetWidth; el.classList.add(cls);
      clearTimeout(el._fxT); el._fxT = setTimeout(() => el.classList.remove(cls), 1300);
    };
    flows.slice(0, 8).forEach((f) => { if (f.from != null) flash(f.from, 'fx-pay'); if (f.to != null) setTimeout(() => flash(f.to, 'fx-get'), 450); });
  }
  function coinFlight(board, a, b, dur, delay, c) {
    const el = document.createElement('div');
    el.className = 'coin';
    board.appendChild(el);
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
    const W2 = board.clientWidth / 2, H2 = board.clientHeight / 2, mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    let px = -dy / d, py = dx / d;
    if ((W2 - mx) * px + (H2 - my) * py < 0) { px = -px; py = -py; } // bend towards the middle of the board
    const bend = Math.min(board.clientWidth * 0.16, 18 + d * 0.28) * (c % 2 ? 0.78 : 1.1);
    const qx = mx + px * bend + (c - 1.5) * 2.5, qy = my + py * bend;
    const frames = [];
    for (let k = 0; k <= 14; k++) {
      const t = k / 14, u = 1 - t;
      const x = u * u * a.x + 2 * u * t * qx + t * t * b.x, y = u * u * a.y + 2 * u * t * qy + t * t * b.y;
      const sc = 0.55 + Math.sin(Math.PI * t) * 0.5 + t * 0.2;
      frames.push({ transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${sc.toFixed(2)})`, opacity: k === 0 ? 0 : t > 0.9 ? Math.max(0, (1 - t) * 10) : 1, offset: t });
    }
    const an = el.animate(frames, { duration: dur, delay, easing: 'cubic-bezier(.4,.05,.3,1)', fill: 'both' });
    const end = () => el.remove();
    an.finished.then(end, end);
  }
  function boardFloat(board, p, text, cls, delay) {
    const el = document.createElement('div');
    el.className = `bfloat ${cls}`;
    el.textContent = text;
    board.appendChild(el);
    const base = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px) translate(-50%, -50%)`;
    const an = el.animate([
      { transform: `${base} translateY(-30%)`, opacity: 0 },
      { transform: `${base} translateY(-115%)`, opacity: 1, offset: 0.18 },
      { transform: `${base} translateY(-115%)`, opacity: 1, offset: 0.62 },
      { transform: `${base} translateY(-195%)`, opacity: 0 },
    ], { duration: 1500, delay: Math.max(0, delay), easing: 'ease-out', fill: 'both' });
    const end = () => el.remove();
    an.finished.then(end, end);
  }

  // ------------------------------------------------------------ danger glow
  // Before you roll, tiles 2 to 12 spaces ahead that would cost you money glow red, brighter the more
  // they cost. Each tile is exactly one dice total away, so utility rent is known exactly.
  const rollOdds = (d) => (6 - Math.abs(d - 7)) / 36;
  function landingCost(p, i, d) {
    const t = BOARD[i], pr = game.s.props[i];
    if (t.type === 'tax') return t.amount || 0;
    if (!pr || pr.owner == null || pr.owner === p.id || pr.mortgaged) return 0;
    const o = game.player(pr.owner);
    if (!o || o.bankrupt || (game.st.noRentInPrison && o.jail)) return 0;
    return game.rentFor(i, null, d);
  }
  function dangerMap() {
    const s = game.s, p = game.cur;
    if (!p || s.over || s.turn.phase !== 'roll' || p.jail || ui.busy || !glowFor(p)) return null;
    let m = null;
    for (let d = 2; d <= 12; d++) {
      const i = (p.pos + d) % 40, cost = landingCost(p, i, d);
      if (cost <= 0 || (cost < 50 && cost < p.money * 0.25)) continue;
      const level = cost >= p.money ? 1 : Math.max(0.22, Math.min(1, cost / Math.max(250, p.money * 0.6)));
      (m || (m = {}))[i] = { cost, odds: rollOdds(d), level };
    }
    return m;
  }
  function dangerNote(i) {
    const dz = ui.danger && ui.danger[i];
    if (!dz) return '';
    const pct = Math.max(1, Math.round(dz.odds * 100));
    return `<div class="tt-danger">${icon('warn')}<span>Land here on this roll and you pay <b class="num">${fmt(dz.cost)}</b>. About a ${pct}% chance.</span></div>`;
  }

  function gridPos(i) {
    if (i <= 10) return [1, i + 1];
    if (i < 20) return [i - 9, 11];
    if (i <= 30) return [11, 31 - i];
    return [41 - i, 1];
  }
  function side(i) { if (i % 10 === 0) return 'corner'; if (i < 10) return 'top'; if (i < 20) return 'right'; if (i < 30) return 'bottom'; return 'left'; }
  function tileInner(t, i) {
    const st = game.st, A = window.BoomArt;
    const art = (k) => `<span class="tic">${A[k]}</span>`;
    switch (t.type) {
      case 'prop': return `<div class="band"></div><div class="body"><span class="flag">${A.flags[t.group]}</span><div class="tname ${t.name.length > 8 ? 'long' : ''}">${esc(t.name)}</div><div class="tprice">${fmt(t.price)}</div></div>`;
      case 'airport': return `<div class="band"></div><div class="body">${art('airport')}<div class="tname long">${esc(t.name)}</div><div class="tprice">${fmt(t.price)}</div></div>`;
      case 'utility': return `<div class="band"></div><div class="body">${art(i === 12 ? 'power' : 'water')}<div class="tname long">${esc(t.name)}</div><div class="tprice">${fmt(t.price)}</div></div>`;
      case 'chance': return `<div class="body">${art('surprise')}<div class="tname">Surprise</div></div>`;
      case 'chest': return `<div class="body">${art('treasure')}<div class="tname">Treasure</div></div>`;
      case 'tax': return `<div class="body">${art(t.amount >= 200 ? 'incomeTax' : 'luxuryTax')}<div class="tname">${esc(t.name)}</div><div class="tprice">${fmt(t.amount)}</div></div>`;
      case 'start': return `<div class="corner"><span class="cbig">${A.start}</span><div class="tname">Start</div><div class="sub">Collect ${fmt(st.salary)}</div></div>`;
      case 'jail': return `<div class="jail-corner"><div class="visit">Just visiting</div><div class="cell">${A.jailWall}</div></div>`;
      case 'vacation': return `<div class="corner"><span class="cbig">${A.vacation}</span><div class="tname">Free Parking</div><div class="sub" id="potLabel">${st.vacationCash ? 'Jackpot' : 'Free stop'}</div></div>`;
      case 'gotojail': return `<div class="corner"><span class="cbig">${A.gotojail}</span><div class="tname">Go to Prison</div></div>`;
    }
    return '';
  }
  function buildBoard() {
    const board = $('#board');
    board.innerHTML = '';
    ui.tileEls = [];
    BOARD.forEach((t, i) => {
      const el = document.createElement('div');
      const [r, c] = gridPos(i);
      el.className = `tile ${t.type} t-${side(i)}`;
      el.style.gridArea = `${r} / ${c}`;
      if (t.group) el.style.setProperty('--g', GROUPS[t.group].color);
      el.dataset.i = i;
      el.tabIndex = 0;
      el.setAttribute('role', 'button');
      el.setAttribute('aria-label', t.name);
      el.innerHTML = tileInner(t, i);
      board.appendChild(el);
      ui.tileEls[i] = el;
    });
    const tip = document.createElement('div');
    tip.className = 'tile-tip';
    tip.id = 'tileTip';
    tip.hidden = true;
    board.appendChild(tip);
    const bars = document.createElement('div');
    bars.className = 'jail-bars';
    bars.id = 'jailBars';
    bars.innerHTML = `${window.BoomArt.jailBars}<span class="plate">Prison</span>`;
    board.appendChild(bars);
    const center = document.createElement('div');
    center.className = 'center';
    center.innerHTML = `<canvas class="rosette" id="rosette" aria-hidden="true"></canvas>
      <div class="center-inner">
        <div class="cmeta" id="cMeta"></div>
        <div class="turnline" id="cTurn"></div>
        <div class="dice" id="dice"><canvas class="dice-gl" id="diceGL" aria-hidden="true"></canvas>${[0, 1].map(() => `<div class="die-wrap"><div class="die-shadow"></div><div class="die-toss"><div class="die"><div class="cube">${[1, 2, 3, 4, 5, 6].map((f) => `<div class="core c${f}"></div>`).join('')}${[1, 2, 3, 4, 5, 6].map((f) => `<div class="face f${f}">${PIPS[f].map((p) => `<i class="p${p}"></i>`).join('')}</div>`).join('')}</div></div></div></div>`).join('')}</div>
        <div class="actions" id="cActions"></div>
        <div class="feed" id="cFeed" aria-live="polite"></div>
      </div>
      <div class="auction" id="auctionBox" hidden></div>
      <div class="overlay" id="overlay" hidden></div>`;
    board.appendChild(center);
    camReset(); zoom.s = 1; applyZoom(false);
    ui.tokenEls = {};
    for (const p of game.s.players) {
      const el = document.createElement('div');
      el.className = 'token';
      el.style.setProperty('--pc', p.color);
      el.innerHTML = tokenFaceHTML(p);
      el.dataset.face = faceKey(p);
      board.appendChild(el);
      ui.tokenEls[p.id] = el;
    }
    if (dice3d) { dice3d.dispose(); dice3d = null; }
    try { dice3d = window.BoomDice ? window.BoomDice.create($('#diceGL'), $('#dice')) : null; } catch (e) { dice3d = null; }
    $('#dice').classList.toggle('gl', !!dice3d);
  }
  function layoutJailBars() {
    const bars = $('#jailBars'), board = $('#board'), tile = ui.tileEls[10];
    const cell = tile && tile.querySelector('.cell');
    if (!bars || !board || !cell) return;
    // Measured inside the board (offsets, not screen rectangles), so the camera zoom and the board's
    // border can't shift the bars off the cell.
    let x = 0, y = 0;
    for (let el = cell; el && el !== board; el = el.offsetParent) { x += el.offsetLeft + (el !== cell ? el.clientLeft : 0); y += el.offsetTop + (el !== cell ? el.clientTop : 0); }
    bars.style.left = `${x}px`;
    bars.style.top = `${y}px`;
    bars.style.width = `${cell.offsetWidth}px`;
    bars.style.height = `${cell.offsetHeight}px`;
  }
  function positionTokens(instant) {
    if (!game || !ui.tileEls.length) return;
    layoutJailBars();
    const groups = {};
    const where = (p) => (ui.displayPos[p.id] != null ? ui.displayPos[p.id] : p.pos);
    for (const id of Object.keys(ui.toCell)) { const q = game.player(+id); if (!q || q.jail || where(q) !== 10) delete ui.toCell[id]; }
    const inCell = (p) => (p.jail || ui.toCell[p.id]) && where(p) === 10;
    for (const p of game.s.players) {
      if (p.bankrupt) continue;
      const k = where(p) + (inCell(p) ? ':cell' : '');
      (groups[k] = groups[k] || []).push(p);
    }
    const cur = !game.s.over ? game.cur : null;
    for (const p of game.s.players) {
      const el = ui.tokenEls[p.id]; if (!el) continue;
      if (p.bankrupt) { el.hidden = true; continue; }
      el.hidden = false;
      const pos = where(p), tile = ui.tileEls[pos];
      const w = tile.offsetWidth, h = tile.offsetHeight;
      let x = tile.offsetLeft + w / 2, y = tile.offsetTop + h / 2;
      // Every square holds its token in the middle, Prison aside (in the cell, or just visiting outside it).
      if (pos === 10) {
        if (inCell(p)) { x = tile.offsetLeft + w * 0.33; y = tile.offsetTop + h * 0.745; }
        else { x = tile.offsetLeft + w * 0.83; y = tile.offsetTop + h * 0.64; }
      }
      const list = groups[pos + (inCell(p) ? ':cell' : '')] || [p];
      const n = list.length, k = list.indexOf(p);
      let sc = 1;
      if (n > 1) {
        // Players sharing a square sit in a tidy grid (e.g. 3 + 2 for five), centred in the square, and
        // shrink a little when the square is too small for them all, so nobody covers anybody else.
        const tk = el.offsetWidth || Math.min(w, h) * 0.4;
        const areaW = pos === 10 ? w * (inCell(p) ? 0.56 : 0.3) : w - 6;
        const areaH = pos === 10 ? h * (inCell(p) ? 0.4 : 0.6) : h - 6;
        let best = null;
        for (let cols = 1; cols <= n; cols++) {
          const rows = Math.ceil(n / cols), cell = Math.min(areaW / cols, areaH / rows);
          if (!best || cell > best.cell + 0.5) best = { cols, rows, cell };
        }
        sc = Math.max(0.55, Math.min(1, best.cell / (tk * 1.06)));
        const step = Math.min(best.cell, tk * sc * 1.1);
        const row = Math.floor(k / best.cols), col = k % best.cols;
        const inRow = row === best.rows - 1 ? n - row * best.cols : best.cols;
        x += (col - (inRow - 1) / 2) * step;
        y += (row - (best.rows - 1) / 2) * step;
      }
      const halfToken = ((el.offsetWidth || 0) * sc) / 2;
      x = Math.max(tile.offsetLeft + Math.min(w / 2, halfToken + 2), Math.min(tile.offsetLeft + w - Math.min(w / 2, halfToken + 2), x));
      y = Math.max(tile.offsetTop + Math.min(h / 2, halfToken + 2), Math.min(tile.offsetTop + h - Math.min(h / 2, halfToken + 2), y));
      x = Math.round(x); y = Math.round(y);
      ui.tokenXY[p.id] = { x, y, s: sc };
      el.style.transition = instant || ui.moving[p.id] ? 'none' : '';
      el.style.transform = `translate(${x}px, ${y}px)${sc < 1 ? ` scale(${sc.toFixed(3)})` : ''}`;
      el.classList.toggle('current', !!cur && cur.id === p.id);
      el.classList.toggle('jailed', inCell(p));
      if (instant && !ui.moving[p.id]) { void el.offsetWidth; el.style.transition = ''; }
    }
  }
  function updateTiles() {
    const s = game.s;
    const target = s.turn.phase === 'buy' || s.turn.phase === 'auction' ? (s.auction ? s.auction.tile : game.cur.pos) : -1;
    const danger = ui.danger = dangerMap();
    syncTokenFaces();
    BOARD.forEach((t, i) => {
      const el = ui.tileEls[i];
      el.classList.toggle('target', i === target);
      const dz = danger && danger[i];
      el.classList.toggle('danger', !!dz);
      if (dz) el.style.setProperty('--dz', dz.level.toFixed(2)); else el.style.removeProperty('--dz');
      const pr = s.props[i];
      if (!pr) return;
      const owner = pr.owner != null ? game.player(pr.owner) : null;
      el.classList.toggle('owned', !!owner);
      el.classList.toggle('mortgaged', !!pr.mortgaged);
      if (owner) el.style.setProperty('--own', owner.color); else el.style.removeProperty('--own');
      const price = $('.tprice', el);
      if (price) {
        const shortMoney = (n) => (n >= 1000 ? `£${(n / 1000).toFixed(n % 1000 ? 1 : 0).replace(/\.0$/, '')}k` : fmt(n));
        const label = !owner ? fmt(t.price) : pr.mortgaged ? 'lock' : shortMoney(game.rentFor(i, null, 7));
        const key = (owner ? `${owner.id}:${tokenText(owner)}:${owner.color}` : '-') + '|' + label;
        if (price.dataset.v !== key) {
          price.dataset.v = key;
          (ui.dirtyTiles = ui.dirtyTiles || new Set()).add(i);
          const body = label === 'lock' ? `${icon('lock')}<span class="rt">Mortgaged</span>` : `<span class="rt">${t.type === 'prop' ? `Rent ${label}` : label}</span>`;
          price.innerHTML = owner ? body : label;
        }
        price.title = '';
      }
      el.dataset.owner = owner ? owner.id : '';
      const band = $('.band', el);
      if (band) {
        const bkey = owner ? `${owner.id}:${tokenText(owner)}:${pr.houses}:${pr.mortgaged ? 1 : 0}` : '-';
        if (band.dataset.h !== bkey) {
          band.dataset.h = bkey;
          const houses = buildingsHTML(pr.houses);
          band.classList.toggle('has-b', !!(owner && pr.houses));
          band.innerHTML = !owner ? '' : pr.houses ? houses : `<b class="own-mark">${esc(tokenText(owner))}</b>`;
          (ui.dirtyTiles = ui.dirtyTiles || new Set()).add(i);
        }
      }
      el.setAttribute('aria-label', `${t.name}${owner ? `, owned by ${owner.name}` : ', for sale'}`);
    });
    const pot = $('#potLabel');
    if (pot && game.st.vacationCash) pot.innerHTML = `<span class="pot">${fmt(s.pot)}</span>`;
    // Only the tiles whose badge or buildings changed are measured again (resizing refits them all).
    if (ui.dirtyTiles && ui.dirtyTiles.size) { const only = ui.dirtyTiles; ui.dirtyTiles = null; fitBadges(only); }
  }
  // Green houses and a red hotel, drawn rather than boxes.
  function buildingsHTML(n) {
    const A = window.BoomArt;
    if (!n) return '';
    if (n === 5) return `<span class="bld" title="Hotel">${A.hotelGlyph}</span>`;
    return `<span class="bld" title="${n} house${n > 1 ? 's' : ''}">${A.houseGlyph}${n > 1 ? `<span class="bx"><i>×</i>${n}</span>` : ''}</span>`;
  }
  // Hover card for a tile: who owns it, their cash and the rent; their other properties get outlined.
  function tileTipHTML(i) {
    const t = BOARD[i], pr = game.s.props[i], st = game.st;
    if (!pr) {
      const sub = { tax: `Pay ${fmt(t.amount || 0)}`, chance: 'Draw a Surprise card', chest: 'Open a Treasure card', start: `Collect ${fmt(st.salary)} when you pass`, jail: `Just visiting · bail ${fmt(st.bail)}`, gotojail: 'Go straight to Prison', vacation: st.vacationCash ? `Jackpot ${fmt(game.s.pot)}` : 'Free parking' }[t.type] || '';
      return `<b>${esc(t.name)}</b>${sub ? `<span class="muted">${esc(sub)}</span>` : ''}`;
    }
    const owner = pr.owner != null ? game.player(pr.owner) : null;
    const head = `<div class="tt-place">${emblemHTML(i, 'xs')}<b>${esc(t.name)}</b><span class="muted">${esc(placeLabel(i))}</span></div>`;
    if (!owner) return `${head}<div class="tt-row"><span class="tag warn">For sale</span><b class="num">${fmt(t.price)}</b></div>`;
    const houses = pr.houses ? `<span class="tt-build">· ${buildingsHTML(pr.houses)}${pr.houses === 5 ? ' Hotel' : ''}</span>` : '';
    const rent = pr.mortgaged ? 'Mortgaged, so no rent is due' : `Rent <b class="num">${fmt(game.rentFor(i, null, 7))}</b>${t.type === 'utility' ? ' on a roll of 7' : ''}${houses}`;
    return `${head}<div class="tt-owner">${dotHTML(owner)}<b>${esc(owner.name)}</b><span class="num">${fmt(owner.money)}</span></div><div class="tt-rent">${rent}</div>`;
  }
  function showTip(i) {
    const tip = $('#tileTip'), tile = ui.tileEls[i], board = $('#board');
    if (!tip || !tile || !game) return;
    tip.innerHTML = tileTipHTML(i) + dangerNote(i);
    tip.hidden = false;
    const bw = board.clientWidth, bh = board.clientHeight, tw = tip.offsetWidth, th = tip.offsetHeight;
    const x = tile.offsetLeft, y = tile.offsetTop, w = tile.offsetWidth, h = tile.offsetHeight, sd = side(i);
    let left, top;
    if (sd === 'left') { left = x + w + 8; top = y + h / 2 - th / 2; }
    else if (sd === 'right') { left = x - tw - 8; top = y + h / 2 - th / 2; }
    else if (sd === 'bottom' || i === 20 || i === 30) { left = x + w / 2 - tw / 2; top = y - th - 8; }
    else { left = x + w / 2 - tw / 2; top = y + h + 8; }
    tip.style.left = `${Math.round(Math.max(6, Math.min(bw - tw - 6, left)))}px`;
    tip.style.top = `${Math.round(Math.max(6, Math.min(bh - th - 6, top)))}px`;
    const pr = game.s.props[i], own = pr && pr.owner != null ? pr.owner : null;
    ui.tileEls.forEach((el, k) => { const q = game.s.props[k]; el.classList.toggle('peer', own != null && k !== i && !!q && q.owner === own); });
  }
  function hideTip() {
    const tip = $('#tileTip');
    if (tip) tip.hidden = true;
    ui.tileEls.forEach((el) => el.classList.remove('peer'));
  }
  // Each price or owner badge must sit inside its tile. Tighten it step by step until it does.
  const FIT_STEPS = ['fit-snug', 'fit-tight', 'fit-dot', 'fit-min'];
  function badgeOverflows(el, pill) {
    const q = el.getBoundingClientRect(), pad = 2;
    const out = (n) => { if (!n) return false; const r = n.getBoundingClientRect(); return r.width > 0 && (r.left < q.left + pad - 0.5 || r.right > q.right - pad + 0.5 || r.bottom > q.bottom - pad + 0.5 || r.top < q.top - 0.5); };
    const vert = (n) => { if (!n) return false; const r = n.getBoundingClientRect(); return r.height > 0 && (r.bottom > q.bottom + 0.5 || r.top < q.top - 0.5); };
    const body = el.querySelector('.body');
    const nmEl = el.querySelector('.tname');
    return out(pill) || (!!nmEl && nmEl.scrollHeight > nmEl.clientHeight + 1) || vert(nmEl) || vert(el.querySelector('.tic')) || vert(el.querySelector('.flag')) || (!!body && body.scrollHeight > body.clientHeight + 1);
  }
  // A long one-word name that is wider than its tile gets a slightly smaller size instead of breaking.
  function fitName(el) {
    const nm = el.querySelector('.tname'), body = el.querySelector('.body');
    if (!nm || !body) return;
    nm.style.fontSize = '';
    if (!nm.offsetWidth) return;
    const cs = getComputedStyle(body);
    const avail = body.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 1;
    const need = Math.max(nm.scrollWidth, nm.offsetWidth);
    let size = parseFloat(getComputedStyle(nm).fontSize) || 8;
    // Narrow tiles: the longest word must fit across.
    if (need > avail) {
      size = Math.max(4.5, Math.floor((size * avail / need) * 2) / 2);
      nm.style.setProperty('font-size', `${size}px`, 'important');
    }
    // Short side tiles: a name that wraps to two lines must still fit top to bottom.
    for (let k = 0; k < 10 && size > 4.5 && (body.scrollHeight > body.clientHeight + 1 || nm.scrollHeight > nm.clientHeight + 1); k++) {
      size -= 0.5;
      nm.style.setProperty('font-size', `${size}px`, 'important');
    }
  }
  // Scale the single price badge to the inner width of its tile instead of letting
  // the label clip or hiding the price when the board gets smaller.
  function fitPrice(el, pill) {
    if (!pill) return;
    pill.style.fontSize = '';
    const body = el.querySelector('.body');
    if (!body || !body.clientWidth) return;
    const cs = getComputedStyle(body);
    const available = Math.max(12, body.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 3);
    const needed = pill.scrollWidth;
    if (needed <= available + 0.5) return;
    const current = parseFloat(getComputedStyle(pill).fontSize) || 8;
    pill.style.fontSize = `${Math.max(5, current * available / needed * 0.96)}px`;
  }
  function fitBadges(only) {
    if (!game || !ui.tileEls.length) return;
    const board = $('#board');
    const compactBoard = board && board.clientWidth <= 612;
    BOARD.forEach((t, i) => {
      if (only && !only.has(i)) return;
      const el = ui.tileEls[i];
      if (!el || !el.querySelector('.body')) return;
      const pill = el.querySelector('.tprice');
      const keepTilePrice = ['prop', 'airport', 'utility'].includes(t.type);
      // Purchase price and rent are essential board information: compress these badges,
      // but never switch them to the dot/hide states at any board size.
      // On a phone-sized board the little flag or icon gives way first, so the name has room.
      const steps = keepTilePrice
        ? (compactBoard ? ['fit-snug', 'fit-min'] : ['fit-snug', 'fit-tight'])
        : (compactBoard ? ['fit-snug', 'fit-dot', 'fit-min'] : FIT_STEPS);
      el.classList.remove(...FIT_STEPS);
      fitName(el);
      fitPrice(el, pill);
      for (const step of steps) {
        if (!badgeOverflows(el, pill)) break;
        el.classList.add(step);
        fitPrice(el, pill);
      }
      fitName(el); // the steps above can change the tile's layout, so size the name again
      fitPrice(el, pill);
    });
  }

  // ------------------------------------------------------------ rendering
  function scheduleRender() {
    if (ui.renderQueued) return;
    ui.renderQueued = true;
    requestAnimationFrame(() => { ui.renderQueued = false; render(); });
  }
  function syncWaves(root) {
    const d = `${-Math.round(performance.now() % 3800)}ms`;
    root.querySelectorAll('.flag.wave').forEach((f) => f.style.setProperty('--wave-delay', d));
  }
  function setHTML(el, key, html) {
    if (!el || ui.lastHTML[key] === html) return;
    ui.lastHTML[key] = html;
    el.innerHTML = html;
    if (html.indexOf('wave') >= 0) syncWaves(el);
  }
  function render() {
    if (!game || screen !== 'game') return;
    renderPlayers();
    updateTiles();
    renderCenter();
    renderAuction();
    renderSide();
    if (ui.modal && ui.modal.kind === 'tile') renderTileModal();
    checkTradeLock();
    if (ui.modal && ui.modal.kind === 'deal') renderDealBar();
    renderOfferDock();
    if (ui.modal && ui.modal.kind === 'over') renderOverModal();
    positionTokens();
    renderVote();
  }
  function cardChip(deck) {
    const chance = deck === 'chance';
    return `<span class="cardchip ${chance ? 'chance' : 'chest'}">${window.BoomArt[chance ? 'surprise' : 'treasure']}${chance ? 'Surprise' : 'Treasure'}</span>`;
  }

  // ------------------------------------------------------------ flags, postcards & deals
  const ONLINE = true;
  const BotAI = window.Boomtown.Bot;
  const viewerPid = () => { const m = myPid(); return m != null && game.player(m) && !game.player(m).bankrupt ? m : null; };
  const placeLabel = (i) => (BOARD[i].group ? GROUPS[BOARD[i].group].name : BOARD[i].type === 'airport' ? 'Airport' : 'Utility');
  function emblemHTML(i, cls) {
    const t = BOARD[i], A = window.BoomArt;
    if (t.group) return `<span class="flag ${cls || ''}">${A.flags[t.group]}</span>`;
    const k = t.type === 'airport' ? 'airport' : i === 12 ? 'power' : 'water';
    return `<span class="emblem ${cls || ''}">${A[k]}</span>`;
  }
  function setNote(i, who) {
    const t = BOARD[i];
    if (!t.group) return '';
    const tiles = GROUP_TILES[t.group], owners = tiles.map((k) => game.s.props[k].owner);
    const mine = who != null ? owners.filter((o) => o === who).length : 0;
    if (mine) return `You own ${mine} of ${tiles.length}`;
    const counts = {};
    owners.forEach((o) => { if (o != null) counts[o] = (counts[o] || 0) + 1; });
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    if (top) return `${pname(+top[0])} owns ${top[1]} of ${tiles.length}`;
    return `${tiles.length} cities to collect`;
  }
  function postcardHTML(i, who) {
    const t = BOARD[i];
    const note = setNote(i, who);
    const rent = t.type === 'prop' ? `Rent ${fmt(t.rent[0])} · ${fmt(t.rent[1])} with a house` : t.type === 'airport' ? 'Rent $25 to $200' : 'Rent 4× or 10× the dice';
    const longName = t.name.length > 14;
    return `<div class="postcard" style="--g:${groupColor(i)}" data-a="details" data-i="${i}" role="button" tabindex="0" aria-label="${esc(t.name)} details">${emblemHTML(i, 'big wave')}
      <div class="pc-text"><div class="pc-country">${esc(placeLabel(i))}${note ? `<span class="pc-note"> · ${esc(note)}</span>` : ''}</div><div class="pc-city ${longName ? 'long' : ''}">${esc(t.name)}</div><div class="pc-meta">${rent}</div></div>
      <div class="pc-price">${fmt(t.price)}</div></div>`;
  }
  function miniDeed(i, o) {
    o = o || {};
    const t = BOARD[i], pr = game.s.props[i], tag = o.side ? 'button' : 'span';
    const attrs = o.side ? `type="button" data-card="${o.side}" data-i="${i}" aria-pressed="${!!o.on}" ${o.locked ? 'disabled' : ''}` : '';
    return `<${tag} class="deedcard ${o.on ? 'on' : ''} ${o.locked ? 'locked' : ''} ${o.small ? 'small' : ''}" ${attrs} style="--g:${groupColor(i)}" title="${esc(o.title || t.name)}">
      <span class="dc-band"></span>${emblemHTML(i)}
      <span class="dc-name">${esc(t.name)}</span>
      <span class="dc-sub">${fmt(t.price)}${pr && pr.mortgaged ? ' · mortgaged' : ''}</span>
      ${o.badge ? `<span class="dc-badge ${o.badgeCls || ''}">${o.badge}</span>` : ''}
      ${o.on ? `<span class="dc-check">${icon('check')}</span>` : ''}</${tag}>`;
  }
  function sideHTML(sd) {
    const items = sd.props.map((i) => miniDeed(i, { small: true }));
    if (sd.money) items.push(`<span class="cashchip">${fmt(sd.money)}</span>`);
    if (sd.pardons) items.push(`<span class="cashchip pardon">${icon('key')} Pardon ×${sd.pardons}</span>`);
    return items.length ? items.join('') : '<span class="muted">Nothing</span>';
  }

  // ---- deal builder
  const dealSpec = () => { const d = ui.draft; return { from: d.from, to: d.to, give: d.give, get: d.get }; };
  const isEmpty = (x) => !x.money && !x.props.length && !x.pardons;
  function afterOwner(d, k) { return d.get.props.includes(k) ? d.from : d.give.props.includes(k) ? d.to : game.s.props[k].owner; }
  function completesFor(d, i, who) {
    const g = BOARD[i].group;
    return !!g && !game.ownsSet(who, g) && GROUP_TILES[g].every((k) => afterOwner(d, k) === who);
  }
  function dealVerdict(d) {
    const spec = dealSpec(), to = game.player(d.to), from = game.player(d.from);
    if (isEmpty(spec.give) && isEmpty(spec.get)) return { cls: '', text: 'Tap cities on either side to build a deal.', pos: 50 };
    const dl = BotAI.tradeDeltas(game, spec);
    const span = Math.max(150, Math.abs(dl.mine) + Math.abs(dl.theirs));
    const mt = meterMath(d), pos = Math.max(3, Math.min(97, 50 + (mt.e / mt.R) * 50));
    if (to.bot) {
      if (to.money - spec.get.money < 60) return { cls: 'bad', text: `${to.name} can't spare that much cash.`, pos, fix: spec.get.money - Math.max(0, to.money - 60), fixLabel: 'Ask for less' };
      const c = BotAI.fairCash(game, spec);
      if (BotAI.evaluateTrade(game, spec)) {
        if (c > -10) return { cls: 'good', text: `${to.name} would accept this.`, pos };
        const label = spec.give.money >= -c ? `Pay ${fmt(-c)} less` : spec.give.money ? 'Best price for you' : `Ask for ${fmt(-c)}`;
        return { cls: 'good', text: `${to.name} would accept this.`, pos, fix: c, fixLabel: label };
      }
      const room = from.money - spec.give.money + spec.get.money;
      if (c > 0 && c <= room) return { cls: 'warn', text: `${to.name} wants about ${fmt(c)} more.`, pos, fix: c, fixLabel: `Add ${fmt(c)}` };
      return { cls: 'bad', text: `${to.name} won't go for this.`, pos };
    }
    const diff = dl.theirs - dl.mine;
    if (Math.abs(diff) <= span * 0.15) return { cls: 'good', text: 'Looks like a fair deal.', pos };
    const half = Math.round(Math.abs(diff) / 2 / 10) * 10;
    return diff > 0 ? { cls: 'warn', text: `Good for you. ${to.name} may say no.`, pos, fix: half, fixLabel: 'Even it out' }
      : { cls: 'warn', text: `Generous to ${to.name}.`, pos, fix: -half, fixLabel: 'Even it out' };
  }
  function applyFix(fix) {
    const d = ui.draft, from = game.player(d.from), to = game.player(d.to);
    if (fix > 0) {
      const cut = Math.min(d.get.money, fix);
      d.get.money -= cut;
      d.give.money = Math.min(from.money, d.give.money + (fix - cut));
    } else if (fix < 0) {
      let x = -fix;
      const cut = Math.min(d.give.money, x);
      d.give.money -= cut; x -= cut;
      d.get.money = Math.min(Math.max(0, to.money - (to.bot ? 60 : 0)), d.get.money + x);
    }
  }
  // Online, trading pauses for whoever is taking their turn, so offers don't interrupt play.
  function turnLocked() { const v = viewerPid(); return ONLINE && !!game && !game.s.over && v != null && game.cur && game.cur.id === v; }
  const TURN_LOCK_MSG = 'Trading opens again once your turn is over.';
  // If your turn starts while you're building a trade, the trade is put aside (only that one) and
  // handed back once your turn is over.
  function checkTradeLock() {
    if (!game || game.s.over) { ui.savedDraft = null; ui.wasLocked = false; return; }
    const locked = turnLocked();
    if (locked && ui.modal && ui.modal.kind === 'deal' && ui.draft) {
      const d = ui.draft;
      if (!isEmpty(d.give) || !isEmpty(d.get)) {
        ui.savedDraft = JSON.parse(JSON.stringify(d));
        closeModal();
        toast("It's your turn, so your trade is saved. You can finish it after your turn.");
      } else closeModal();
    }
    if (!locked && ui.wasLocked && ui.savedDraft && !(ui.modal && ui.modal.kind === 'deal')) {
      toast('Your turn is over. Your saved trade is ready.', { action: 'Open trade', onAction: () => openDeal({ resume: true }) });
    }
    ui.wasLocked = locked;
  }
  // The saved trade, cleaned up for whatever changed meanwhile (sold cities, spent cash, players out).
  function takeSavedDraft() {
    const d = ui.savedDraft;
    ui.savedDraft = null;
    if (!d || !game) return null;
    const from = game.player(d.from), to = game.player(d.to);
    if (!from || !to || from.bankrupt || to.bankrupt || d.from !== viewerPid()) return null;
    const fix = (sd, p) => ({
      money: Math.max(0, Math.min(p.money, sd.money || 0)),
      props: (sd.props || []).filter((i) => game.tradable(p.id, i)),
      pardons: Math.max(0, Math.min(p.pardons.length, sd.pardons || 0)),
    });
    const tr = d.counterOf != null ? game.findTrade(d.counterOf) : null;
    const out = { from: d.from, to: d.to, give: fix(d.give, from), get: fix(d.get, to), counterOf: tr && tr.status === 'pending' ? d.counterOf : null };
    return isEmpty(out.give) && isEmpty(out.get) ? null : out;
  }
  function openDeal(preset) {
    preset = preset || {};
    if (!game || game.s.over) return;
    if (turnLocked()) { toast(TURN_LOCK_MSG); return; }
    const plain = preset.resume || (!preset.counterOf && !preset.give && !preset.get && (preset.to == null || (ui.savedDraft && preset.to === ui.savedDraft.to)));
    const saved = ui.savedDraft && plain ? takeSavedDraft() : null;
    if (saved) { ui.draft = saved; $('#modal').innerHTML = ''; openModal('deal'); return; }
    const from = preset.from != null ? preset.from : viewerPid();
    if (from == null) return;
    const others = game.alive().filter((p) => p.id !== from);
    if (!others.length) return;
    const to = preset.to != null && others.some((p) => p.id === preset.to) ? preset.to : others[0].id;
    const side = (x) => ({ money: (x && x.money) || 0, props: ((x && x.props) || []).slice(), pardons: (x && x.pardons) || 0 });
    ui.draft = { from, to, give: side(preset.give), get: side(preset.get), counterOf: preset.counterOf || null };
    $('#modal').innerHTML = '';
    if (preset.fair) { const v = dealVerdict(ui.draft); if (v.fix && v.cls !== 'good') applyFix(v.fix); }
    openModal('deal');
  }
  function dealBarHTML() {
    const d = ui.draft, to = game.player(d.to), v = dealVerdict(d);
    const err = turnLocked() ? TURN_LOCK_MSG : game.validateTrade(dealSpec());
    const empty = isEmpty(d.give) && isEmpty(d.get) && !turnLocked();
    return `<div class="deal-sum"><div class="ds-col"><span class="eyebrow">You give</span><div class="ds-items">${sideHTML(d.give)}</div></div>
        <span class="ds-arrow">${icon('swap')}</span>
        <div class="ds-col"><span class="eyebrow">You get</span><div class="ds-items">${sideHTML(d.get)}</div></div></div>
      <div class="meter ${v.cls}"><div class="meter-track" role="slider" tabindex="0" aria-label="Balance the deal with cash" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(v.pos)}" aria-valuetext="${esc(cashText(d))}" title="Drag to balance the deal with cash"><span class="meter-mid"></span><i style="left:${v.pos.toFixed(1)}%"></i></div>
        <div class="meter-labels"><span>Better for ${esc(to.name)}</span><span>Better for you</span></div></div>
      <div class="deal-actions"><span class="verdict ${v.cls}">${esc(v.text)}</span>
        ${v.fix ? `<button class="btn" type="button" data-fix="${v.fix}">${esc(v.fixLabel)}</button>` : ''}
        <button class="btn primary lg" type="button" id="dealSend" ${err ? 'disabled' : ''}>${icon('swap')} Send offer</button></div>
      ${err && !empty ? `<div class="err">${esc(err)}</div>` : ''}`;
  }
  function renderDealModal() {
    const d = ui.draft;
    if (!d || !game.player(d.from) || !game.player(d.to)) return closeModal();
    const from = game.player(d.from), to = game.player(d.to);
    const sheet = $('#modal .sheet'), scroll = sheet ? sheet.scrollTop : 0, decks = $$('#modal .deck').map((e) => e.scrollTop);
    const humans = game.alive().filter((p) => !p.bot);
    const fromRow = !ONLINE && humans.length > 1 ? `<div class="deal-row"><span class="eyebrow">Offer from</span><div class="tb-to">${humans.map((p) => `<button type="button" data-from="${p.id}" class="${p.id === d.from ? 'on' : ''}" style="--pc:${p.color}">${dotHTML(p)}${esc(p.name)}</button>`).join('')}</div></div>` : '';
    const side = (p, key) => {
      const sd = d[key], receiver = key === 'give' ? d.to : d.from;
      const cards = game.ownedBy(p.id).sort((a, b) => a - b).map((i) => {
        const ok = game.tradable(p.id, i), on = sd.props.includes(i);
        const trial = { from: d.from, to: d.to, give: { props: d.give.props.slice() }, get: { props: d.get.props.slice() } };
        if (!on) trial[key].props.push(i);
        let badge = '', badgeCls = '';
        if (completesFor(trial, i, receiver)) {
          badge = receiver === d.from ? 'Completes your set' : `Completes ${game.player(receiver).name}'s set`;
          badgeCls = receiver === d.from ? 'good' : 'warn';
        }
        return miniDeed(i, { side: key, on, locked: !ok, badge, badgeCls, title: ok ? `${on ? 'Remove' : 'Add'} ${BOARD[i].name}` : 'Sell the buildings in this country before trading it' });
      }).join('');
      const chips = [50, 100, 250].map((n) => `<button type="button" class="chipbtn" data-cash="${key}" data-add="${n}">+${fmt(n)}</button>`).join('')
        + `<button type="button" class="chipbtn" data-cash="${key}" data-set="max">All ${fmt(p.money)}</button>`
        + (sd.money ? `<button type="button" class="chipbtn" data-cash="${key}" data-set="0">Clear</button>` : '');
      return `<section class="tt-side">
        <header class="tt-h">${dotHTML(p)}<div><b>${key === 'give' ? 'You give' : `${esc(p.name)} gives`}</b><span class="muted">${fmt(p.money)} cash · ${game.ownedBy(p.id).length} ${game.ownedBy(p.id).length === 1 ? 'property' : 'properties'}</span></div></header>
        <div class="tt-cash"><div class="cash-in"><span aria-hidden="true">£</span><input type="number" inputmode="numeric" id="deal-${key}-cash" data-money="${key}" min="0" max="${p.money}" step="10" value="${sd.money}" aria-label="Cash ${key === 'give' ? 'you give' : `${p.name} gives`}"></div><div class="chips">${chips}</div></div>
        <div class="deck">${cards || '<span class="muted deck-empty">No properties yet</span>'}</div>
        ${p.pardons.length ? `<div class="owner-line"><span class="muted">Pardon cards</span><span class="stepper"><button type="button" class="icon-btn" data-pard="${key}" data-d="-1" aria-label="Fewer">${icon('minus')}</button><b>${sd.pardons}</b><button type="button" class="icon-btn" data-pard="${key}" data-d="1" aria-label="More">${icon('plus')}</button></span></div>` : ''}
      </section>`;
    };
    setModal(`<div class="sheet deal" role="dialog" aria-modal="true" aria-label="Trade">
      <div class="sheet-h"><h2>${d.counterOf ? 'Counter-offer' : 'Trade'}</h2><button class="icon-btn" data-close aria-label="Close">${icon('x')}</button></div>
      <div class="sheet-b">${fromRow}
        <div class="deal-row"><span class="eyebrow">Trade with</span><div class="tb-to">${game.alive().filter((p) => p.id !== d.from).map((p) => `<button type="button" data-to="${p.id}" class="${p.id === d.to ? 'on' : ''}" style="--pc:${p.color}">${dotHTML(p)}${esc(p.name)}${p.bot ? ' <span class="tag">Bot</span>' : ''}</button>`).join('')}</div></div>
        <div class="tt">${side(from, 'give')}<div class="tt-mid" aria-hidden="true">${icon('swap')}</div>${side(to, 'get')}</div>
      </div>
      <div class="deal-bar" id="dealBar">${dealBarHTML()}</div>
    </div>`);
    const sh = $('#modal .sheet'); if (sh) sh.scrollTop = scroll;
    $$('#modal .deck').forEach((e, k) => { if (decks[k]) e.scrollTop = decks[k]; });
  }
  // ---- draggable balance meter: sliding the knob sets how much cash changes hands
  function cashText(d) {
    const net = d.give.money - d.get.money;
    return net > 0 ? `You add ${fmt(net)}` : net < 0 ? `${game.player(d.to).name} adds ${fmt(-net)}` : 'No cash';
  }
  function cashRange() {
    const d = ui.draft, from = game.player(d.from), to = game.player(d.to);
    return { lo: -Math.max(0, to.money - (to.bot ? 60 : 0)), hi: from.money };
  }
  function setNetCash(c) {
    const d = ui.draft;
    d.give.money = c > 0 ? c : 0;
    d.get.money = c < 0 ? -c : 0;
  }
  // The meter is linear in cash: e is the cash you'd have to add to reach the fair point (bots: the least
  // they'd accept; people: an even split), so e > 0 means the deal favours you. Half the track is R pounds.
  // Each £1 you add lowers e by exactly £1, so a drag maps straight onto a cash amount.
  function meterMath(d) {
    const spec = { from: d.from, to: d.to, give: d.give, get: d.get }, to = game.player(d.to);
    const dl = BotAI.tradeDeltas(game, spec);
    const e = to.bot ? Math.max(26 - dl.mine, (0.75 * dl.theirs - dl.mine) / 1.75) : (dl.theirs - dl.mine) / 2;
    const worth = d.give.props.concat(d.get.props).reduce((a, i) => a + BOARD[i].price, 0) + 55 * (d.give.pardons + d.get.pardons);
    return { e, R: Math.max(100, Math.round(worth * 0.6)) };
  }
  // the cash amount (in £10 steps) that puts the knob nearest to `target` (0-100)
  function cashForPos(target) {
    const d = ui.draft, { lo, hi } = cashRange(), mt = meterMath(d);
    const want = ((target - 50) / 50) * mt.R, net = d.give.money - d.get.money + (mt.e - want);
    return Math.max(Math.ceil(lo / 10) * 10, Math.min(Math.floor(hi / 10) * 10, Math.round(net / 10) * 10));
  }
  function syncCashInputs() {
    const d = ui.draft;
    ['give', 'get'].forEach((k) => { const el = $(`#deal-${k}-cash`); if (el && document.activeElement !== el) el.value = d[k].money; });
  }
  function meterTo(clientX) {
    const tr = $('#dealBar .meter-track');
    if (!tr || !ui.draft) return;
    const r = tr.getBoundingClientRect();
    const target = Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100));
    const c = cashForPos(target), d = ui.draft;
    if (c === d.give.money - d.get.money && !(d.give.money && d.get.money)) return;
    setNetCash(c);
    syncCashInputs();
    renderDealBar();
  }
  function meterStep(dir) {
    // right = better for you = £10 less from you (or £10 more from them)
    const d = ui.draft, { lo, hi } = cashRange();
    const n = Math.max(lo, Math.min(hi, d.give.money - d.get.money - dir * 10));
    if (n === d.give.money - d.get.money) return;
    setNetCash(n); syncCashInputs(); renderDealBar();
  }
  function renderDealBar() { const b = $('#dealBar'); if (b && ui.draft) { b.innerHTML = dealBarHTML(); ui.lastHTML.modal = $('#modal').innerHTML; } }
  function sendDeal() {
    const d = ui.draft;
    if (!d) return;
    const err = game.validateTrade(dealSpec());
    if (err) { toast(esc(err)); return; }
    if (ONLINE) {
      if (d.counterOf) act('reject', { id: d.counterOf });
      act('trade', { to: d.to, give: d.give, get: d.get });
    } else {
      if (d.counterOf) game.declineTrade(d.counterOf);
      const res = game.proposeTrade(dealSpec());
      if (res.error) { toast(esc(res.error)); return; }
    }
    const name = pname(d.to);
    closeModal();
    ui.tab = 'trades';
    toast(`Offer sent to <b>${esc(name)}</b>.`);
    if (!ONLINE) after();
  }

  // ---- incoming offers
  const isMyOffer = (tr) => (ONLINE ? tr.to === myPid() : !game.player(tr.to).bot);
  function offerCardHTML(tr, count) {
    const a = game.player(tr.from), b = game.player(tr.to);
    if (isMyOffer(tr)) {
      const dl = BotAI.tradeDeltas(game, tr);
      const span = Math.max(150, Math.abs(dl.mine) + Math.abs(dl.theirs)), diff = dl.mine - dl.theirs;
      const v = Math.abs(diff) <= span * 0.15 ? ['', 'About even'] : diff > 0 ? ['good', 'Good for you'] : ['bad', 'Costly for you'];
      const err = game.validateTrade(tr);
      const sub = [!ONLINE && game.alive().filter((p) => !p.bot).length > 1 ? `For ${esc(b.name)}` : 'New offer', count > 1 ? `1 of ${count}` : ''].filter(Boolean).join(' · ');
      return `<div class="offer-card in">
        <div class="od-h">${dotHTML(a)}<div><b>${esc(a.name)} wants to trade</b><span class="muted">${sub}</span></div><span class="tag ${v[0]}">${v[1]}</span></div>
        <div class="od-cols"><div><span class="eyebrow">You get</span><div class="ds-items">${sideHTML(tr.give)}</div></div><div><span class="eyebrow">You give</span><div class="ds-items">${sideHTML(tr.get)}</div></div></div>
        ${err ? `<div class="err">${esc(err)}</div>` : ''}
        <div class="od-actions"><button type="button" class="btn primary" data-offer="accept" data-id="${tr.id}" ${err ? 'disabled' : ''}>${icon('check')} Accept</button><button type="button" class="btn" data-offer="counter" data-id="${tr.id}">Counter</button><button type="button" class="btn ghost" data-offer="reject" data-id="${tr.id}">Decline</button></div>
      </div>`;
    }
    return `<div class="offer-card out">
      <div class="od-h">${dotHTML(b)}<div><b>Your offer to ${esc(b.name)}</b><span class="muted">Waiting for an answer<span class="dots"></span></span></div><span class="tag warn">Pending</span></div>
      <div class="od-cols"><div><span class="eyebrow">${!ONLINE && !/^you$/i.test(a.name.trim()) ? `${esc(a.name)} gives` : 'You give'}</span><div class="ds-items">${sideHTML(tr.give)}</div></div><div><span class="eyebrow">${!ONLINE && !/^you$/i.test(a.name.trim()) ? `${esc(a.name)} gets` : 'You get'}</span><div class="ds-items">${sideHTML(tr.get)}</div></div></div>
      <div class="od-actions"><button type="button" class="btn ghost" data-offer="withdraw" data-id="${tr.id}">Withdraw offer</button></div>
    </div>`;
  }
  function renderOfferDock() {
    const dock = $('#offerDock');
    if (!dock) return;
    const offers = !game || game.s.over ? [] : game.s.trades.filter((t) => t.status === 'pending' && isMyOffer(t));
    if (!offers.length || turnLocked() || (ui.modal && ui.modal.kind === 'deal')) { dock.hidden = true; ui.lastHTML.dock = ''; return; }
    dock.hidden = false;
    setHTML(dock, 'dock', offerCardHTML(offers[0], offers.length));
  }
  function offerAction(kind, id) {
    const tr = game.findTrade(id);
    if (!tr || tr.status !== 'pending') return;
    Sound.ensure();
    if (kind === 'withdraw') { if (ONLINE) act('withdraw', { id }); else { game.cancelTrade(id); after(); } return; }
    if (kind === 'counter') return openDeal({ from: tr.to, to: tr.from, give: tr.get, get: tr.give, counterOf: id });
    if (ONLINE) act(kind === 'accept' ? 'accept' : 'reject', { id });
    else {
      if (kind === 'accept') { if (!game.acceptTrade(id)) toast('That trade is no longer possible.'); }
      else game.declineTrade(id);
      after();
    }
  }

  // ---- suggested deals for the viewer
  function suggestionsHTML() {
    const v = viewerPid();
    if (v == null || game.s.over) return '';
    const out = [];
    for (const g of Object.keys(GROUP_TILES)) {
      const tiles = GROUP_TILES[g], own = (k) => game.s.props[k].owner;
      const mine = tiles.filter((k) => own(k) === v), missing = tiles.filter((k) => own(k) !== v);
      if (mine.length && missing.length === 1) {
        const k = missing[0], o = own(k);
        if (o != null && !game.player(o).bankrupt && game.tradable(o, k)) out.push({ kind: 'get', i: k, who: o, title: `Get ${BOARD[k].name} to complete ${GROUPS[g].name}`, sub: `Owned by ${pname(o)}` });
      }
      for (const q of game.alive()) {
        if (q.id === v) continue;
        const theirs = tiles.filter((k) => own(k) === q.id), gap = tiles.filter((k) => own(k) !== q.id);
        if (theirs.length && gap.length === 1 && own(gap[0]) === v && game.tradable(v, gap[0])) out.push({ kind: 'give', i: gap[0], who: q.id, title: `${q.name} needs ${BOARD[gap[0]].name}`, sub: `It completes ${GROUPS[g].name} for them. Name your price.` });
      }
    }
    if (!out.length) return '';
    return out.slice(0, 3).map((x) => `<button type="button" class="suggest" data-suggest="${x.kind}:${x.i}:${x.who}" style="--g:${groupColor(x.i)}">${emblemHTML(x.i)}<span><b>${esc(x.title)}</b><span class="muted">${esc(x.sub)}</span></span>${icon('swap')}</button>`).join('');
  }
  function dealWithBtn(p) {
    const v = viewerPid();
    if (v == null || p.id === v || p.bankrupt || game.s.over) return '';
    return `<button type="button" class="btn sm" data-dealwith="${p.id}">${icon('swap')} Trade</button>`;
  }
  function offerHTML(i, owner) {
    const v = viewerPid();
    if (!owner || v == null || owner.id === v || owner.bankrupt || game.s.over) return '';
    const ok = game.tradable(owner.id, i);
    return `<div class="manage one"><button type="button" class="btn primary lg" data-deal="${i}" ${ok ? '' : 'disabled'}>${icon('swap')} Make ${esc(owner.name)} an offer</button>${ok ? '' : '<div class="why">They have buildings in this region and must sell them before trading it.</div>'}</div>`;
  }

  // ---- auctions: bid, auto-bid up to a cap, or pass
  // Your controls in an auction: three quick raises, each showing the price you would bid, and Pass.
  function bidderHTML(p, a, st) {
    const lead = a.bidder === p.id;
    let ctl;
    if (st.passed) ctl = '<span class="auction-status">You passed on this one</span>';
    else if (lead) ctl = `<span class="auction-status winning">You're winning at ${fmt(a.high)}</span><button type="button" class="btn ghost pass-btn" data-pass="${p.id}">Pass</button>`;
    else {
      ctl = [10, 50, 100].map((step, k) => {
        const amt = a.high + step;
        return `<button type="button" class="btn bid-btn ${k ? '' : 'primary'}" data-bid="${p.id}" data-amt="${amt}" ${amt > p.money ? 'disabled' : ''} aria-label="Bid ${fmt(amt)}"><b>${fmt(amt)}</b><small>+${fmt(step)}</small></button>`;
      }).join('') + `<button type="button" class="btn ghost pass-btn" data-pass="${p.id}">Pass</button>`;
    }
    return `<div class="bidder"><div class="bidder-profile">${dotHTML(p)}<span><b>${esc(p.name)}</b><br><span class="muted num">${fmt(p.money)}</span></span></div><div class="bidder-actions ${lead || st.passed ? 'is-status' : ''}">${ctl}</div></div>`;
  }

  function bindDeals() {
    const modal = $('#modal');
    modal.addEventListener('click', (e) => {
      const dl = e.target.closest('[data-deal]');
      if (dl) { const i = +dl.dataset.deal, o = game.s.props[i].owner; return openDeal({ to: o, get: { props: [i] }, fair: true }); }
      if (!ui.modal || ui.modal.kind !== 'deal') return;
      const d = ui.draft;
      const card = e.target.closest('[data-card]');
      if (card) {
        const sd = d[card.dataset.card], i = +card.dataset.i;
        sd.props = sd.props.includes(i) ? sd.props.filter((x) => x !== i) : sd.props.concat(i);
        Sound.bid();
        return renderDealModal();
      }
      const cash = e.target.closest('[data-cash]');
      if (cash) {
        const key = cash.dataset.cash, owner = game.player(key === 'give' ? d.from : d.to);
        const v = cash.dataset.set === 'max' ? owner.money : cash.dataset.set != null ? +cash.dataset.set : d[key].money + +cash.dataset.add;
        d[key].money = Math.max(0, Math.min(owner.money, v));
        return renderDealModal();
      }
      const fx = e.target.closest('[data-fix]');
      if (fx) { applyFix(+fx.dataset.fix); return renderDealModal(); }
      const to = e.target.closest('[data-to]');
      if (to) { d.to = +to.dataset.to; d.get = { money: 0, props: [], pardons: 0 }; return renderDealModal(); }
      const fr = e.target.closest('[data-from]');
      if (fr) { return openDeal({ from: +fr.dataset.from }); }
      const pd = e.target.closest('[data-pard]');
      if (pd) {
        const sd = d[pd.dataset.pard], owner = game.player(pd.dataset.pard === 'give' ? d.from : d.to);
        sd.pardons = Math.max(0, Math.min(owner.pardons.length, sd.pardons + +pd.dataset.d));
        return renderDealModal();
      }
      if (e.target.closest('#dealSend')) sendDeal();
    });
    modal.addEventListener('pointerdown', (e) => {
      if (!ui.modal || ui.modal.kind !== 'deal' || !e.target.closest('.meter-track')) return;
      if (e.button != null && e.button > 0) return;
      e.preventDefault();
      ui.meterDrag = true;
      document.body.classList.add('meter-dragging');
      meterTo(e.clientX);
      const move = (ev) => { if (ui.meterDrag) meterTo(ev.clientX); };
      const up = () => {
        ui.meterDrag = false;
        document.body.classList.remove('meter-dragging');
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        if (ui.modal && ui.modal.kind === 'deal') { renderDealModal(); const t = $('#dealBar .meter-track'); if (t) t.focus({ preventScroll: true }); }
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    });
    modal.addEventListener('keydown', (e) => {
      if (!ui.modal || ui.modal.kind !== 'deal' || !e.target.closest('.meter-track')) return;
      const dir = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
      if (!dir) return;
      e.preventDefault();
      meterStep(dir);
      const t = $('#dealBar .meter-track'); if (t) t.focus({ preventScroll: true });
    });
    modal.addEventListener('input', (e) => {
      if (!ui.modal || ui.modal.kind !== 'deal') return;
      const el = e.target.closest('[data-money]');
      if (!el) return;
      const key = el.dataset.money, owner = game.player(key === 'give' ? ui.draft.from : ui.draft.to);
      ui.draft[key].money = Math.max(0, Math.min(owner.money, Math.floor(+el.value || 0)));
      renderDealBar();
    });
    document.addEventListener('click', (e) => {
      if (!game) return;
      const off = e.target.closest('[data-offer]');
      if (off) return offerAction(off.dataset.offer, +off.dataset.id);
      const sg = e.target.closest('[data-suggest]');
      if (sg) {
        const [kind, i, who] = sg.dataset.suggest.split(':');
        return openDeal(kind === 'get' ? { to: +who, get: { props: [+i] }, fair: true } : { to: +who, give: { props: [+i] }, fair: true });
      }
      const dw = e.target.closest('[data-dealwith]');
      if (dw) return openDeal({ to: +dw.dataset.dealwith });
    });
  }

  function partsHTML(parts) {
    return parts.map((x) => {
      if (Array.isArray(x)) return partsHTML(x);
      if (x == null) return '';
      if (typeof x !== 'object') return esc(x);
      if ('p' in x) { const p = game.player(x.p); return p ? `<b class="who" style="--pc:${p.color}">${esc(p.name)}</b>` : ''; }
      if ('t' in x) return `<span class="tl" style="--g:${groupColor(x.t)}">${emblemHTML(x.t, 'xs')}${esc(BOARD[x.t].name)}</span>`;
      if ('m' in x) return `<b class="amt">${fmt(x.m)}</b>`;
      if ('c' in x) return cardChip(x.c);
      return '';
    }).join('');
  }
  const isAway = (pid) => !!meta && meta.away.includes(pid);
  function renderPlayers() {
    const s = game.s, mine = myPid();
    const html = s.players.map((p, idx) => {
      const isTurn = !s.over && idx === s.turn.idx;
      const n = game.ownedBy(p.id).length;
      const chips = [];
      if (s.over && s.winner === p.id) chips.push(`<span class="tag warn">${icon('crown')} Winner</span>`);
      if (p.id === mine) chips.push('<span class="tag you">You</span>');
      if (!p.bot && !p.bankrupt && isAway(p.id)) chips.push('<span class="tag away">Away · autopilot</span>');
      if (p.jail) chips.push(`<span class="tag bad">In Prison · try ${Math.min(3, p.jailTurns + 1)} of 3</span>`);
      if (p.pardons.length) chips.push(`<span class="tag good">${icon('key')} Pardon ×${p.pardons.length}</span>`);
      return `<button title="Point at a player to light up their properties" class="pcard ${isTurn ? 'turn' : ''} ${p.bankrupt ? 'out' : ''} ${ui.view === p.id ? 'viewing' : ''}" data-pid="${p.id}" style="--pc:${p.color}" aria-label="Show ${esc(p.name)}'s portfolio">
        ${isTurn ? `<span class="now" id="nowBadge">${clockLabel()}</span>` : ''}
        ${dotHTML(p)}
        <span class="pmain"><span class="pname"><span class="nm">${esc(p.name)}</span>${p.bot ? '<span class="tag">Bot</span>' : ''}</span>
        <span class="pmeta">${p.bankrupt ? `Bankrupt in round ${p.outRound}` : `Worth ${fmt(game.netWorth(p.id))} · ${n} ${n === 1 ? 'property' : 'properties'}`}</span></span>
        <span class="pmoney" data-money="${p.id}">${p.bankrupt ? '—' : fmt(p.money)}</span>
        ${chips.length ? `<span class="pchips">${chips.join('')}</span>` : ''}
      </button>`;
    }).join('');
    setHTML($('#players'), 'players', html);
    countMoney();
    const b = s.bank, st = game.st;
    const houses = Object.values(s.props).reduce((a, pr) => a + (pr.houses > 0 && pr.houses < 5 ? pr.houses : 0), 0);
    const hotels = Object.values(s.props).filter((pr) => pr.houses === 5).length;
    setHTML($('#bankbox'), 'bank', `
      <div><div class="k">${st.limitedBuildings ? 'Houses left' : 'Houses built'}</div><div class="v">${st.limitedBuildings ? b.houses : houses}</div></div>
      <div><div class="k">${st.limitedBuildings ? 'Hotels left' : 'Hotels built'}</div><div class="v">${st.limitedBuildings ? b.hotels : hotels}</div></div>
      ${st.vacationCash ? `<div><div class="k">Free Parking</div><div class="v">${fmt(s.pot)}</div></div>` : ''}
      <div><div class="k">Round</div><div class="v">${s.round}${st.roundLimit ? ` / ${st.roundLimit}` : ''}</div></div>`);
    const myp = mine != null ? game.player(mine) : null;
    $('#resignBtn').hidden = !(myp && !myp.bankrupt && !s.over);
  }
  function syncAutoRoll() {
    if (!ui.autoRoll || screen !== 'game' || !game || game.s.over) return;
    const s = game.s, p = game.cur, t = s.turn, mine = myPid();
    if (p.id !== mine || !['roll', 'end'].includes(t.phase) || ui.busy || ui.modal) return;
    const action = t.phase;
    const key = `${t.n}:${action}:${t.doubles || 0}`;
    if (ui.autoRollTurn === key) return;
    ui.autoRollTurn = key;
    setTimeout(() => {
      if (!ui.autoRoll || screen !== 'game' || !game || game.s.over || ui.modal || ui.busy || game.cur.id !== myPid() || game.s.turn.phase !== action || `${game.s.turn.n}:${game.s.turn.phase}:${game.s.turn.doubles || 0}` !== key) {
        if (ui.autoRollTurn === key) ui.autoRollTurn = null;
        return;
      }
      doAction(action);
    }, 450);
  }
  function countMoney() {
    for (const p of game.s.players) {
      const to = p.bankrupt ? 0 : p.money, from = ui.moneyShown[p.id];
      if (from == null || p.bankrupt) { ui.moneyShown[p.id] = to; continue; }
      if (from === to) continue;
      ui.moneyShown[p.id] = to;
      const t0 = performance.now(), dur = 650;
      const step = (now) => {
        const el = document.querySelector(`[data-money="${p.id}"]`);
        if (!el || ui.moneyShown[p.id] !== to) return;
        const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
        el.textContent = fmt(from + (to - from) * e);
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
  }
  function renderCenter() {
    const s = game.s, st = game.st, p = game.cur, t = s.turn;
    const dots = s.players.filter((x) => !x.bankrupt).map((x) => {
      const idx = s.players.indexOf(x);
      return `<i class="${idx === t.idx && !s.over ? 'now' : idx < t.idx ? 'done' : ''}"></i>`;
    }).join('');
    setHTML($('#cMeta'), 'meta', `<span class="chip">Round <b>${s.round}</b>${st.roundLimit ? ` of <b>${st.roundLimit}</b>` : ''} <span class="rdots" aria-hidden="true">${dots}</span></span>${st.vacationCash ? `<span class="chip">${icon('umbrella')} Pot <b>${fmt(s.pot)}</b></span>` : ''}`);
    const turnHTML = s.over
      ? `${icon('crown')} <span>${esc(pname(s.winner))} wins</span>`
      : `${dotHTML(p)}<span>${esc(turnOf(p))}</span><svg class="ring" id="timerRing" viewBox="0 0 22 22" hidden><circle class="bg" cx="11" cy="11" r="9"/><circle class="fg" cx="11" cy="11" r="9" stroke-dasharray="56.5" stroke-dashoffset="0"/></svg><span class="turn-clock" id="turnClock" hidden></span>`;
    setHTML($('#cTurn'), 'turn', turnHTML);
    setHTML($('#cActions'), 'actions', actionsHTML());
    setHTML($('#cFeed'), 'feed', s.log.slice(-5).reverse().map((e) => `<div class="${e.parts.some((x) => x && typeof x === 'object' && 'c' in x) ? 'is-card' : ''}">${partsHTML(e.parts)}</div>`).join(''));
  }
  function actionsHTML() {
    const s = game.s, p = game.cur, t = s.turn, st = game.st, mine = myPid();
    if (s.over) {
      return `<div class="row"><button class="btn primary lg" data-a="results">${icon('crown')} See results</button>${amHost() ? '<button class="btn lg" data-a="restart">New game in this room</button>' : ''}</div>
        ${amHost() ? '' : `<div class="hint">${esc(room && room.hostName ? room.hostName : 'The host')} can start a new game in this room.</div>`}`;
    }
    if (p.id !== mine) {
      const verb = { roll: 'about to roll', moving: 'on the move', buy: 'deciding whether to buy', auction: 'running an auction', end: 'wrapping up', debt: 'raising cash' }[t.phase] || 'thinking';
      const watch = mine == null ? `<div class="watching">${icon('eye')} You are watching this game.</div>${rejoinHTML()}` : '';
      return `<div class="wait">${dotHTML(p)}<span><b>${esc(p.name)}</b> is ${verb}<span class="dots"></span></span></div>${!p.bot && isAway(p.id) ? '<div class="hint">They are disconnected. A bot plays for them shortly.</div>' : ''}${watch}`;
    }
    const dis = ui.busy ? 'disabled' : '';
    switch (t.phase) {
      case 'roll':
        if (p.jail) {
          return `<div class="note">${icon('lock')} In Prison · attempt ${p.jailTurns + 1} of 3</div>
            <div class="row roll-controls">
              <button class="btn primary lg" data-a="roll" ${dis}><span class="btn-art">${window.BoomArt.die}</span> Roll for doubles</button>
              <button class="btn lg ${ui.autoRoll ? 'active' : ''}" data-a="autoroll" aria-pressed="${ui.autoRoll}" title="Rolls the dice for you each turn, including prison rolls. It never buys, pays bail or ends your turn.">${ui.autoRoll ? 'Auto-roll: On' : 'Auto-roll: Off'}</button>
              <button class="btn" data-a="bail" ${dis || (p.money < st.bail ? 'disabled' : '')}>Pay ${fmt(st.bail)} bail</button>
              ${p.pardons.length ? `<button class="btn" data-a="pardon" ${dis}>${icon('key')} Use Pardon</button>` : ''}
            </div>`;
        }
        return `${t.again ? '<div class="note">Doubles! Roll again.</div>' : ''}
          <div class="row roll-controls"><button class="btn primary lg" data-a="roll" ${dis}><span class="btn-art">${window.BoomArt.die}</span> Roll the dice</button><button class="btn lg ${ui.autoRoll ? 'active' : ''}" data-a="autoroll" aria-pressed="${ui.autoRoll}" title="Rolls the dice for you each turn, including prison rolls. It never buys, pays bail or ends your turn.">${ui.autoRoll ? 'Auto-roll: On' : 'Auto-roll: Off'}</button></div>`;
      case 'moving': return '<div class="wait"><span>Moving<span class="dots"></span></span></div>';
      case 'buy': {
        const i = p.pos, tile = BOARD[i], short = tile.price - p.money;
        const metaTxt = tile.type === 'prop' ? `${GROUPS[tile.group].name} · rent from ${fmt(tile.rent[0])}` : tile.type === 'airport' ? `Airport · rent from ${fmt(25)}` : 'Utility · 4× dice roll';
        return `${postcardHTML(i, p.id)}
          <div class="row">
            <button class="btn primary lg" data-a="buy" ${dis || (short > 0 ? 'disabled' : '')}>Buy for ${fmt(tile.price)}</button>
            <button class="btn lg" data-a="decline" ${dis}>${st.auctions ? `${icon('gavel')} Auction` : 'Pass'}</button>
            <button class="btn ghost details-btn" data-a="details" data-i="${i}">Details</button>
          </div>
          ${short > 0 ? `<div class="hint warn">You need ${fmt(short)} more. Mortgage or sell from your portfolio to afford it.</div>` : ''}`;
      }
      case 'auction': return '';
      case 'end':
        return `<button class="btn primary lg" data-a="end" ${dis}>${icon('check')} End turn</button>
          <div class="hint">Build houses, mortgage or trade before you end your turn.</div>`;
      case 'debt': {
        const d = s.debt, to = d.to === 'each' ? 'the other players' : d.to == null ? 'the bank' : pname(d.to);
        const short = d.amount - p.money;
        return `<div class="debt-amt">You owe ${fmt(d.amount)}</div>
          <div class="hint">to ${esc(to)}. You have ${fmt(p.money)}. ${short > 0 ? `Sell buildings, mortgage or trade to raise ${fmt(short)}.` : 'You can pay now.'}</div>
          <div class="row">
            <button class="btn primary lg" data-a="pay" ${dis || (short > 0 ? 'disabled' : '')}>Pay ${fmt(d.amount)}</button>
            <button class="btn danger" data-a="bankrupt" ${dis}>${icon('flag')} Declare bankruptcy</button>
          </div>`;
      }
    }
    return '';
  }
  function renderAuction() {
    const box = $('#auctionBox'), a = game.s.auction, inner = $('.center-inner');
    if (!a || game.s.turn.phase !== 'auction') {
      box.hidden = true;
      ui.lastHTML.auction = '';
      if (inner) { inner.hidden = false; inner.style.visibility = ''; }
      return;
    }
    box.hidden = false;
    camOut();
    // Remove the normal turn/buy interface from layout while the auction owns the board centre.
    // visibility:hidden alone can leave its children participating in layout/overlapping on some browsers.
    if (inner) { inner.hidden = true; inner.style.visibility = ''; }
    const bidder = a.bidder != null ? game.player(a.bidder) : null;
    const mine = myPid(), p = mine != null ? game.player(mine) : null;
    const M = (meta && meta.auction) || {};
    setHTML(box, 'auction', `
      <div class="auction-h"><h3>${icon('gavel')} Auction</h3><span class="chip auction-countdown" id="auctionCountdown">Ends in <b id="auctionSecs" aria-live="off">${M.deadline ? `${Math.max(0, Math.ceil((M.deadline - serverNow()) / 1000))}s` : '–'}</b></span></div>
      <div class="auction-property"><span class="auction-property-label">${(a.lot || []).length > 1 ? 'BANKRUPTCY LOT · WINNER TAKES ALL' : 'PROPERTY VALUE'}</span>${postcardHTML(a.tile, mine)}${(a.lot || []).length > 1 ? `<div class="auction-lot">${a.lot.map((i) => `<span>${emblemHTML(i, 'xs')}${esc(BOARD[i].name)} <b>${fmt(BOARD[i].price)}</b></span>`).join('')}<span class="auction-lot-total">${esc(BOARD[a.lot[0]].group ? GROUPS[BOARD[a.lot[0]].group].name : BOARD[a.lot[0]].type === 'airport' ? 'Airports' : 'Utilities')}: ${a.lot.length} places, together ${fmt(a.lot.reduce((sum, i) => sum + BOARD[i].price, 0))}</span></div>` : ''}</div>
      <div class="auction-bid-summary">
        <div class="auction-bid-main"><span class="auction-bid-label">CURRENT HIGHEST BID:</span><span class="v">${fmt(a.high)}</span></div>
        <div class="auction-leader">${bidder ? `${dotHTML(bidder)}<span>Leading: <b class="who" style="--pc:${bidder.color}">${esc(bidder.id === mine ? 'You' : bidder.name)}</b></span>` : '<span>No bids yet</span>'}</div>
      </div>
      <div class="bar auction-bar"><i id="auctionBar"></i></div>
      ${p && !p.bankrupt ? `<div class="bidders">${bidderHTML(p, a, { passed: !!M.passed })}</div>` : ''}
      <div class="hint auction-note">The highest bid when the clock runs out wins. Pass to drop out.</div>`);
  }

  // ------------------------------------------------------------ side panel
  // One panel: offers, the selected player, their properties, deals to try, then activity.
  const isMyOutgoing = (tr) => (ONLINE ? tr.from === myPid() : !game.player(tr.from).bot);
  const canManageNow = (p) => !ui.busy && game.canManage(p.id) && (ONLINE ? p.id === myPid() : !p.bot);
  function renderSide() {
    const s = game.s;
    const inc = s.over ? '' : s.trades.filter((t) => t.status === 'pending' && isMyOffer(t)).map((t) => t.id).join(',');
    if (inc && inc !== ui.lastInc && inc.split(',').some((id) => !(ui.lastInc || '').split(',').includes(id))) {
      requestAnimationFrame(() => { const sb = $('#sidebody'); if (sb) sb.scrollTo({ top: 0, behavior: 'smooth' }); });
    }
    ui.lastInc = inc;
    setHTML($('#sidebody'), 'side', overviewHTML());
  }
  function overviewHTML() {
    const s = game.s, v = viewerPid();
    const p = game.player(ui.view) || (v != null ? game.player(v) : game.cur);
    let h = '';
    const pend = s.over ? [] : s.trades.filter((t) => t.status === 'pending');
    const inc = pend.filter(isMyOffer), out = pend.filter((t) => isMyOutgoing(t) && !isMyOffer(t));
    if (inc.length || out.length) {
      h += `<section class="ov-sec offers-sec"><h2>${inc.length ? 'Offers for you' : 'Your offers'}${inc.length ? ` <span class="badge">${inc.length}</span>` : ''}</h2>${inc.map((t) => offerCardHTML(t)).join('')}${out.map((t) => offerCardHTML(t)).join('')}</section>`;
    }
    h += playerBlockHTML(p, v);
    const n = game.ownedBy(p.id).length;
    h += `<section class="ov-sec"><h2>${p.id === v ? 'Your properties' : 'Properties'} <span class="muted">${n}</span>${canManageNow(p) && n ? '<span class="h4-hint">Tap + to build</span>' : ''}</h2>${propertiesHTML(p)}</section>`;
    h += `<section class="ov-sec"><h2>Activity</h2>${activityHTML()}</section>`;
    return h;
  }
  function playerBlockHTML(p, v) {
    const s = game.s;
    const who = s.players.map((x) => `<button type="button" data-view="${x.id}" class="${x.id === p.id ? 'on' : ''} ${x.bankrupt ? 'out' : ''} ${avatarOf(x) ? 'has-img' : ''}" style="--pc:${x.color}" aria-label="Show ${esc(x.name)}">${whoFace(x)}</button>`).join('');
    const isMe = p.id === v, tags = [];
    if (isMe && !/^you$/i.test(p.name.trim())) tags.push('<span class="tag you">You</span>');
    if (p.bot) tags.push('<span class="tag">Bot</span>');
    if (canManageNow(p)) tags.push('<span class="tag good">Your turn</span>');
    else if (!s.over && game.cur.id === p.id) tags.push('<span class="tag warn">Playing now</span>');
    if (p.jail) tags.push(`<span class="tag bad">In Prison · try ${Math.min(3, p.jailTurns + 1)} of 3</span>`);
    if (p.bankrupt) tags.push('<span class="tag bad">Bankrupt</span>');
    const canDeal = v != null && !p.bankrupt && !s.over && game.alive().length >= 2;
    const dealBtn = !canDeal ? '' : isMe
      ? `<button type="button" class="btn primary sm" data-a="newtrade">${icon('swap')} Trade</button>`
      : `<button type="button" class="btn primary sm" data-dealwith="${p.id}">${icon('swap')} Offer a deal</button>`;
    const photoBtn = isMe && !s.over ? `<button type="button" class="btn sm" data-a="photo" aria-label="${avatarOf(p) ? 'Change' : 'Add'} your photo">${icon('camera')} ${avatarOf(p) ? 'Photo' : 'Add photo'}</button>` : '';
    const me = v != null ? game.player(v) : null;
    const othersCanVote = s.players.some((x) => !x.bot && !x.bankrupt && x.id !== p.id && x.id !== v && room && room.seats[x.id] && room.seats[x.id].online);
    const kickable = p.bot || othersCanVote || isAway(p.id) || (meta && meta.idle && meta.idle.includes(p.id));
    const canKick = me && !me.bankrupt && !isMe && !p.bankrupt && !s.over && kickable && !(room && room.vote);
    const kick = canKick ? `<div class="ov-kick"><button type="button" class="btn sm ghost" data-a="kick" data-pid="${p.id}">${icon('x')} ${p.bot ? 'Remove bot' : 'Vote to remove'}</button><span class="muted">${p.bot ? 'Takes the bot out so the game goes faster.' : 'For someone who has left or stopped playing.'}</span></div>` : '';
    return `<section class="ov-sec ov-player">
      <div class="who-row" role="group" aria-label="Choose a player">${who}</div>
      <div class="ov-head"><div class="ov-name"><b>${esc(p.name)}</b><span class="ov-tags">${tags.join('')}</span></div><div class="ov-btns">${photoBtn}${dealBtn}</div></div>
      <div class="stats"><div class="stat"><div class="k">Cash</div><div class="v">${fmt(p.money)}</div></div>
      <div class="stat"><div class="k">Net worth</div><div class="v">${fmt(game.netWorth(p.id))}</div></div>
      <div class="stat"><div class="k">Pardons</div><div class="v">${p.pardons.length}</div></div></div>
      ${kick}
    </section>`;
  }
  function propertiesHTML(p) {
    const s = game.s, owned = game.ownedBy(p.id), manage = canManageNow(p);
    if (p.bankrupt) return `<div class="empty"><b>Out of the game</b>Went bankrupt in round ${p.outRound}.</div>`;
    if (!owned.length) return '<div class="empty"><b>No properties yet</b>Land on an unowned place, airport or utility to buy it.</div>';
    const sections = Object.keys(GROUP_TILES).map((g) => ({ key: g, name: GROUPS[g].name, color: GROUPS[g].color, tiles: GROUP_TILES[g] }));
    sections.push({ key: 'air', name: 'Airports', color: '#9AA6C4', tiles: [5, 15, 25, 35] }, { key: 'util', name: 'Utilities', color: '#7CC8FF', tiles: [12, 28] });
    let h = '';
    for (const sec of sections) {
      const have = sec.tiles.filter((i) => owned.includes(i));
      if (!have.length) continue;
      const flag = window.BoomArt.flags[sec.key] ? `<span class="flag sm">${window.BoomArt.flags[sec.key]}</span>` : '';
      h += `<div class="grp"><div class="grp-h" style="--g:${sec.color}"><i></i>${flag}<span>${sec.name}</span><span class="muted">${have.length} of ${sec.tiles.length}</span>${have.length === sec.tiles.length && GROUPS[sec.key] ? '<span class="tag good">Full set</span>' : ''}</div>`;
      for (const i of have) {
        const pr = s.props[i], t = BOARD[i];
        const pips = buildingsHTML(pr.houses);
        const rent = pr.mortgaged ? '<span class="tag bad">Mortgaged</span>' : `${fmt(game.rentFor(i, null, 7))}${t.type === 'utility' ? '*' : ''}`;
        let ctl = '';
        if (manage) {
          if (t.type === 'prop' && game.ownsSet(p.id, t.group)) {
            const sb = game.canSell(p.id, i), bb = game.canBuild(p.id, i);
            ctl += `<button class="icon-btn" data-m="sell" data-i="${i}" ${sb ? 'disabled' : ''} title="${esc(sb || `Sell a building for ${fmt(Math.floor(game.houseCost(i) / 2))}`)}" aria-label="Sell a building on ${esc(t.name)}">${icon('minus')}</button>`;
            ctl += `<button class="icon-btn" data-m="build" data-i="${i}" ${bb ? 'disabled' : ''} title="${esc(bb || `Build for ${fmt(game.houseCost(i))}`)}" aria-label="Build on ${esc(t.name)}">${icon('plus')}</button>`;
          }
          // Mortgage and Sell sit side by side at the same size: one keeps the property, the other gives it up.
          let pair = '';
          if (game.st.mortgages) {
            if (pr.mortgaged) { const r = game.canUnmortgage(p.id, i); pair += `<button class="btn sm" data-m="unmortgage" data-i="${i}" ${r ? 'disabled' : ''} title="${esc(r || `Pay ${fmt(game.unmortgageCost(i))}`)}">Redeem</button>`; }
            else { const r = game.canMortgage(p.id, i); pair += `<button class="btn sm" data-m="mortgage" data-i="${i}" ${r ? 'disabled' : ''} title="${esc(r || `Receive ${fmt(game.mortgageValue(i))}`)}">Mortgage</button>`; }
          }
          { const r = game.canSellProperty(p.id, i); pair += `<button class="btn sm sell-prop" data-sellprop="${i}" ${r ? 'disabled' : ''} title="${esc(r || `Sell to the bank for ${fmt(game.sellValue(i))}`)}">Sell</button>`; }
          ctl += `<span class="mpair">${pair}</span>`;
        }
        h += `<div class="prow"><button class="nm" data-open="${i}">${emblemHTML(i, 'xs')}<span>${esc(t.name)}</span></button><span class="meta"><span class="pips">${pips}</span>${rent}</span><span class="ctl">${ctl}</span></div>`;
      }
      h += '</div>';
    }
    if (owned.some((i) => BOARD[i].type === 'utility')) h += '<div class="hint" style="text-align:left">*Utility rent shown for an average roll of 7.</div>';
    return h;
  }
  function activityHTML() {
    let h = '', round = null;
    for (const e of game.s.log.slice(-50).reverse()) {
      if (e.r !== round) { round = e.r; h += `<div class="log-r">Round ${round}</div>`; }
      h += `<div class="log-e">${partsHTML(e.parts)}</div>`;
    }
    return h || '<div class="empty">Nothing has happened yet.</div>';
  }
  // Highlights one player's properties on the board and dims everything else.
  function focusOwner(pid) {
    const board = $('#board');
    if (!board || !game) return;
    if (pid == null || !game.player(pid)) {
      board.removeAttribute('data-focus');
      ui.tileEls.forEach((el) => el.classList.remove('focus'));
      return;
    }
    board.setAttribute('data-focus', String(pid));
    BOARD.forEach((t, i) => { const pr = game.s.props[i]; ui.tileEls[i].classList.toggle('focus', !!pr && pr.owner === pid); });
  }
  function flashOwner(pid) {
    focusOwner(pid);
    clearTimeout(ui.focusT);
    ui.focusT = setTimeout(() => focusOwner(null), 1800);
  }
  function portfolioHTML() {
    const s = game.s, mine = myPid();
    const p = game.player(ui.view) || game.cur;
    const who = s.players.map((x) => `<button data-view="${x.id}" class="${x.id === p.id ? 'on' : ''} ${x.bankrupt ? 'out' : ''} ${avatarOf(x) ? 'has-img' : ''}" style="--pc:${x.color}" aria-label="${esc(x.name)}">${whoFace(x)}</button>`).join('');
    const owned = game.ownedBy(p.id);
    const manage = p.id === mine && game.canManage(p.id) && !ui.busy;
    let h = `<div class="who-row">${who}</div>
      <div class="pf-head"><h3>${esc(p.id === mine ? 'Your portfolio' : p.name)}</h3>${dealWithBtn(p)}${p.bot ? '<span class="tag">Bot</span>' : manage ? '<span class="tag good">Your turn · manage freely</span>' : ''}</div>
      <div class="stats"><div class="stat"><div class="k">Cash</div><div class="v">${fmt(p.money)}</div></div>
      <div class="stat"><div class="k">Net worth</div><div class="v">${fmt(game.netWorth(p.id))}</div></div>
      <div class="stat"><div class="k">Pardons</div><div class="v">${p.pardons.length}</div></div></div>`;
    if (p.bankrupt) return h + `<div class="empty"><b>Out of the game</b>Went bankrupt in round ${p.outRound}.</div>`;
    if (!owned.length) return h + '<div class="empty"><b>No properties yet</b>Land on an unowned place, airport or utility to buy it.</div>';
    const sections = Object.keys(GROUP_TILES).map((g) => ({ key: g, name: GROUPS[g].name, color: GROUPS[g].color, tiles: GROUP_TILES[g] }));
    sections.push({ key: 'air', name: 'Airports', color: '#9AA6C4', tiles: [5, 15, 25, 35] }, { key: 'util', name: 'Utilities', color: '#7CC8FF', tiles: [12, 28] });
    for (const sec of sections) {
      const have = sec.tiles.filter((i) => owned.includes(i));
      if (!have.length) continue;
      h += `<div class="grp"><div class="grp-h" style="--g:${sec.color}"><i></i>${window.BoomArt.flags[sec.key] ? `<span class="flag sm">${window.BoomArt.flags[sec.key]}</span>` : ''}<span>${sec.name}</span><span class="muted">${have.length} of ${sec.tiles.length}</span>${have.length === sec.tiles.length && GROUPS[sec.key] ? '<span class="tag good">Full set</span>' : ''}</div>`;
      for (const i of have) {
        const pr = s.props[i], t = BOARD[i];
        const pips = buildingsHTML(pr.houses);
        const rent = pr.mortgaged ? '<span class="tag bad">Mortgaged</span>' : `${fmt(game.rentFor(i, null, 7))}${t.type === 'utility' ? '*' : ''}`;
        let ctl = '';
        if (manage) {
          if (t.type === 'prop' && game.ownsSet(p.id, t.group)) {
            const sb = game.canSell(p.id, i), bb = game.canBuild(p.id, i);
            ctl += `<button class="icon-btn" data-m="sell" data-i="${i}" ${sb ? 'disabled' : ''} title="${esc(sb || `Sell a building for ${fmt(Math.floor(game.houseCost(i) / 2))}`)}" aria-label="Sell a building on ${esc(t.name)}">${icon('minus')}</button>`;
            ctl += `<button class="icon-btn" data-m="build" data-i="${i}" ${bb ? 'disabled' : ''} title="${esc(bb || `Build for ${fmt(game.houseCost(i))}`)}" aria-label="Build on ${esc(t.name)}">${icon('plus')}</button>`;
          }
          // Mortgage and Sell sit side by side at the same size: one keeps the property, the other gives it up.
          let pair = '';
          if (game.st.mortgages) {
            if (pr.mortgaged) { const r = game.canUnmortgage(p.id, i); pair += `<button class="btn sm" data-m="unmortgage" data-i="${i}" ${r ? 'disabled' : ''} title="${esc(r || `Pay ${fmt(game.unmortgageCost(i))}`)}">Redeem</button>`; }
            else { const r = game.canMortgage(p.id, i); pair += `<button class="btn sm" data-m="mortgage" data-i="${i}" ${r ? 'disabled' : ''} title="${esc(r || `Receive ${fmt(game.mortgageValue(i))}`)}">Mortgage</button>`; }
          }
          { const r = game.canSellProperty(p.id, i); pair += `<button class="btn sm sell-prop" data-sellprop="${i}" ${r ? 'disabled' : ''} title="${esc(r || `Sell to the bank for ${fmt(game.sellValue(i))}`)}">Sell</button>`; }
          ctl += `<span class="mpair">${pair}</span>`;
        }
        h += `<div class="prow"><button class="nm" data-open="${i}">${emblemHTML(i, 'xs')}<span>${esc(t.name)}</span></button><span class="meta"><span class="pips">${pips}</span>${rent}</span><span class="ctl">${ctl}</span></div>`;
      }
      h += '</div>';
    }
    if (owned.some((i) => BOARD[i].type === 'utility')) h += '<div class="hint" style="text-align:left">*Utility rent shown for an average roll of 7.</div>';
    return h;
  }
  function sideItems(sd) {
    return `<div class="items">${sideHTML(sd)}</div>`;
  }
  const giveLabel = (p) => (p.id === myPid() ? 'You give' : `${p.name} gives`);
  function tradeCard(tr) {
    const a = game.player(tr.from), b = game.player(tr.to), mine = myPid();
    const status = { pending: 'Pending', accepted: 'Accepted', declined: 'Declined', cancelled: 'Withdrawn', invalid: 'Fell through' }[tr.status];
    const cls = { pending: 'warn', accepted: 'good', declined: 'bad', cancelled: '', invalid: 'bad' }[tr.status];
    let actions = '';
    if (tr.status === 'pending' && !game.s.over) {
      const err = game.validateTrade(tr);
      if (b.id === mine) actions += `<button class="btn primary sm" data-tr="accept" data-id="${tr.id}" ${err ? 'disabled' : ''}>${icon('check')} Accept</button><button class="btn sm" data-tr="reject" data-id="${tr.id}">Decline</button>`;
      else actions += `<span class="muted">Waiting for ${esc(b.name)}<span class="dots"></span></span>`;
      if (a.id === mine) actions += `<button class="btn ghost sm" data-tr="withdraw" data-id="${tr.id}">Withdraw</button>`;
      if (err) actions += `<span class="why">${esc(err)}</span>`;
    }
    return `<div class="trade ${tr.status === 'pending' ? '' : 'done'}">
      <div class="trade-h"><span class="ps"><span class="mini-dot" style="--pc:${a.color}"></span><b>${esc(a.name)}</b> ${icon('swap')} <span class="mini-dot" style="--pc:${b.color}"></span><b>${esc(b.name)}</b></span><span class="tag ${cls}">${status}</span></div>
      <div class="trade-cols"><div><div class="lbl">${esc(giveLabel(a))}</div>${sideItems(tr.give)}</div><div><div class="lbl">${esc(giveLabel(b))}</div>${sideItems(tr.get)}</div></div>
      ${actions ? `<div class="row">${actions}</div>` : ''}</div>`;
  }
  function tradesHTML() {
    const mine = myPid(), p = mine != null ? game.player(mine) : null;
    const canTrade = p && !p.bankrupt && !game.s.over && game.alive().length >= 2 && !turnLocked();
    const pend = game.s.trades.filter((t) => t.status === 'pending').reverse();
    const done = game.s.trades.filter((t) => t.status !== 'pending').slice(-8).reverse();
    let h = `<button class="btn primary" data-a="newtrade" style="width:100%" ${canTrade ? '' : 'disabled'}>${icon('swap')} ${ui.savedDraft ? 'Resume trade' : 'Trade'}</button>${turnLocked() ? `<p class="muted trade-lock">${icon('dice')} ${TURN_LOCK_MSG}</p>` : suggestionsHTML()}`;
    if (!pend.length && !done.length) return h + '<div class="empty"><b>No trades yet</b>Swap properties, cash and Pardon cards with anyone between your turns. Bots also make offers when they need one city to finish a set.</div>';
    if (pend.length) h += '<div class="log-r" style="margin-top:16px">Open offers</div>' + pend.map(tradeCard).join('');
    if (done.length) h += '<div class="log-r" style="margin-top:16px">Recent</div>' + done.map(tradeCard).join('');
    return h;
  }
  function logHTML() {
    let h = '', round = null;
    for (const e of game.s.log.slice(-150).reverse()) {
      if (e.r !== round) { round = e.r; h += `<div class="log-r">Round ${round}</div>`; }
      h += `<div class="log-e">${partsHTML(e.parts)}</div>`;
    }
    return h || '<div class="empty">Nothing has happened yet.</div>';
  }

  // ------------------------------------------------------------ modals
  // ------------------------------------------------------------ dialogs and the keyboard
  // While a dialog is open, Tab and Shift+Tab wrap around inside it; closing it puts focus back where it was.
  let modalReturn = null;
  const focusables = (box) => [...box.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
    .filter((x) => !x.disabled && !x.closest('[hidden]') && x.getClientRects().length && getComputedStyle(x).visibility !== 'hidden');
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab' || document.querySelector('.pp-modal')) return; // the photo picker keeps its own focus
    const box = $('#modal');
    if (!box || box.hidden) return;
    const items = focusables(box);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1], at = document.activeElement;
    if (!box.contains(at)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
    else if (e.shiftKey && at === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && at === last) { e.preventDefault(); first.focus(); }
  }, true);
  function restoreFocus() {
    const r = modalReturn;
    modalReturn = null;
    if (r && document.contains(r) && r.getClientRects().length) r.focus({ preventScroll: true });
  }
  function openModal(kind, data) {
    if ($('#modal').hidden) modalReturn = document.activeElement;
    ui.modal = Object.assign({ kind }, data || {});
    ui.lastHTML.modal = '';
    $('#modal').hidden = false;
    if (kind === 'tile') renderTileModal();
    else if (kind === 'trade') renderTradeModal();
    else if (kind === 'deal') renderDealModal();
    else if (kind === 'over') renderOverModal();
    else if (kind === 'rules') renderRulesModal();
    else if (kind === 'confirm') renderConfirmModal();
    requestAnimationFrame(() => { const f = $('#modal [data-autofocus]') || $('#modal button'); if (f) f.focus({ preventScroll: true }); });
  }
  function closeModal() {
    ui.modal = null;
    const m = $('#modal');
    m.hidden = true; m.innerHTML = '';
    ui.lastHTML.modal = '';
    scheduleRender();
    restoreFocus();
  }
  function setModal(html) {
    if (ui.lastHTML.modal === html) return;
    ui.lastHTML.modal = html;
    // re-drawing the sheet that's already open (e.g. tapping a card in a trade) shouldn't replay its entrance
    const m = $('#modal'), key = (html.match(/aria-label="([^"]*)"/) || [])[1] || '';
    m.classList.toggle('calm', !!m.firstElementChild && ui.modalKey === key);
    ui.modalKey = key;
    m.innerHTML = html;
    if (html.indexOf('wave') >= 0) syncWaves($('#modal'));
  }
  function renderTileModal() {
    const i = ui.modal.i, t = BOARD[i], s = game.s, pr = s.props[i], st = game.st, mine = myPid();
    const owner = pr && pr.owner != null ? game.player(pr.owner) : null;
    const close = `<button class="icon-btn" data-close aria-label="Close">${icon('x')}</button>`;
    if (!pr) {
      const desc = {
        start: `Collect ${fmt(st.salary)} every time you pass Start${st.doubleOnStart ? `, or ${fmt(st.salary * 2)} if you land on it exactly` : ''}.`,
        jail: `Landing here is just a visit. Prisoners can pay ${fmt(st.bail)} bail, use a Pardon card or try to roll doubles. After three failed tries, bail is paid automatically.${st.noRentInPrison ? ' Owners in Prison collect no rent.' : ''}`,
        vacation: st.vacationCash ? `Collect the jackpot: half of every tax, fine and bail, up to £200. It currently holds ${fmt(s.pot)}.` : 'Free parking. Nothing happens here.',
        gotojail: 'Go straight to Prison. You do not pass Start and do not collect your salary.',
        chance: 'Draw a Surprise card. It might move you, pay you or cost you.',
        chest: 'Open a Treasure card. Mostly good news, with the occasional bill.',
        tax: `Pay ${fmt(t.amount || 0)} to the bank${st.vacationCash ? ' (half goes into the Free Parking jackpot, up to £200)' : ''}.`,
      }[t.type] || '';
      const spaceContent = t.type === 'jail'
        ? `<div class="jail-info">
            <div class="jail-status"><span class="jail-status-icon">${icon('lock')}</span><span><b>Just visiting</b><small>Landing here is a free visit. Prisoners have three ways to get out.</small></span></div>
            <div class="jail-routes">
              <div class="jail-route"><span class="jail-route-icon">${icon('receipt')}</span><span><b>${fmt(st.bail)}</b><small>Pay bail to leave immediately</small></span></div>
              <div class="jail-route"><span class="jail-route-icon">${icon('gift')}</span><span><b>Pardon card</b><small>Use a card to leave Prison</small></span></div>
              <div class="jail-route"><span class="jail-route-icon">${icon('dice')}</span><span><b>Roll doubles</b><small>Try to roll a matching pair</small></span></div>
            </div>
            <p class="jail-reminder">Fail to roll doubles after three attempts and bail is paid automatically.</p>
            ${st.noRentInPrison ? `<div class="jail-rule">Players in Prison do not collect rent while detained.</div>` : ''}
          </div>`
        : `<p>${desc}</p>`;
      setModal(`<div class="sheet deed plain space-${t.type}" role="dialog" aria-modal="true" aria-label="${esc(t.name)}"><div class="deed-head"><div class="eyebrow">Board space</div><div class="deed-name">${esc(t.name)}</div>${close}</div><div class="sheet-b">${dangerNote(i)}${spaceContent}</div></div>`);
      return;
    }
    let table = '';
    const set = owner && t.group && game.ownsSet(owner.id, t.group);
    if (t.type === 'prop') {
      const rows = [['Rent', t.rent[0]]];
      if (st.doubleRentSet) rows.push(['Rent with full set', t.rent[0] * 2]);
      rows.push(['With 1 house', t.rent[1]], ['With 2 houses', t.rent[2]], ['With 3 houses', t.rent[3]], ['With 4 houses', t.rent[4]], ['With a hotel', t.rent[5]]);
      const onIdx = !owner || pr.mortgaged ? -1 : pr.houses > 0 ? pr.houses + (st.doubleRentSet ? 1 : 0) : set && st.doubleRentSet ? 1 : 0;
      table = rows.map(([k, v], r) => `<tr class="${r === onIdx ? 'on' : ''}"><td>${k}</td><td>${fmt(v)}</td></tr>`).join('');
    } else if (t.type === 'airport') {
      const n = owner ? [5, 15, 25, 35].filter((k) => s.props[k].owner === owner.id).length : 0;
      table = [1, 2, 3, 4].map((k) => `<tr class="${k === n && !pr.mortgaged ? 'on' : ''}"><td>Owner has ${k} airport${k > 1 ? 's' : ''}</td><td>${fmt(25 * Math.pow(2, k - 1))}</td></tr>`).join('');
    } else {
      const n = owner ? [12, 28].filter((k) => s.props[k].owner === owner.id).length : 0;
      table = `<tr class="${n === 1 && !pr.mortgaged ? 'on' : ''}"><td>Owner has one utility</td><td>4 × dice</td></tr><tr class="${n === 2 && !pr.mortgaged ? 'on' : ''}"><td>Owner has both</td><td>10 × dice</td></tr>`;
    }
    const facts = [['Price', fmt(t.price)]];
    if (t.type === 'prop') facts.push(['Each house', fmt(game.houseCost(i))]);
    facts.push(['Mortgage value', fmt(game.mortgageValue(i))], ['To redeem', fmt(game.unmortgageCost(i))]);
    if (t.type !== 'prop') facts.push(['Sell to bank', fmt(game.sellValue(i))]);
    let manage = '';
    if (owner && owner.id === mine && !owner.bankrupt) {
      const btn = (m, label, reason) => `<button class="btn ${reason ? '' : 'primary'}" data-m="${m}" data-i="${i}" ${reason || ui.busy ? 'disabled' : ''} title="${esc(reason)}">${label}</button>`;
      const parts = [], reasons = [];
      if (t.type === 'prop') {
        const b = game.canBuild(owner.id, i);
        parts.push(btn('build', `${icon('house')} ${pr.houses === 4 ? 'Build hotel' : 'Build house'} · ${fmt(game.houseCost(i))}`, b));
        parts.push(btn('sell', `${icon('minus')} Sell building · +${fmt(Math.floor(game.houseCost(i) / 2))}`, game.canSell(owner.id, i)));
        if (b) reasons.push(b);
      }
      if (st.mortgages) {
        if (pr.mortgaged) parts.push(btn('unmortgage', `Redeem · ${fmt(game.unmortgageCost(i))}`, game.canUnmortgage(owner.id, i)));
        else { const r = game.canMortgage(owner.id, i); parts.push(btn('mortgage', `Mortgage · +${fmt(game.mortgageValue(i))}`, r)); if (r && !reasons.includes(r)) reasons.push(r); }
      }
      { const r = game.canSellProperty(owner.id, i); parts.push(`<button class="btn ${r ? '' : 'primary'} sell-prop" data-sellprop="${i}" ${r || ui.busy ? 'disabled' : ''} title="${esc(r)}">Sell to bank · +${fmt(game.sellValue(i))}</button>`); }
      if (!game.canManage(owner.id)) reasons.splice(0, reasons.length, 'You can manage your properties during your own turn.');
      manage = `<div class="manage">${parts.join('')}${reasons.length ? `<div class="why">${esc(reasons[0])}</div>` : ''}</div>`;
    }
    const country = t.group ? GROUPS[t.group].name : t.type === 'airport' ? 'Airport' : 'Utility';
    setModal(`<div class="sheet deed" style="--g:${groupColor(i)}" role="dialog" aria-modal="true" aria-label="${esc(t.name)}">
      <div class="deed-head has-flag">${emblemHTML(i, 'big wave')}<div><div class="eyebrow">${esc(country)}</div><div class="deed-name">${esc(t.name)}</div></div>${close}</div>
      <div class="sheet-b">${dangerNote(i)}
        <div class="owner-line">${owner ? `${dotHTML(owner)}<span>Owned by <b>${esc(owner.id === mine ? 'you' : owner.name)}</b></span>${pr.mortgaged ? '<span class="tag bad">Mortgaged</span>' : ''}${set ? '<span class="tag good">Full set</span>' : ''}${pr.houses ? `<span class="tag">${pr.houses === 5 ? 'Hotel' : `${pr.houses} house${pr.houses > 1 ? 's' : ''}`}</span>` : ''}` : `<span class="tag warn">For sale</span><span class="muted">Land here to buy it for ${fmt(t.price)}.</span>`}</div>
        <table class="rent"><tbody>${table}</tbody></table>
        <dl class="facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
        ${manage}${offerHTML(i, owner)}
      </div></div>`);
  }
  function newDraft(to) {
    const mine = myPid();
    const others = game.alive().filter((p) => p.id !== mine);
    return { to: to != null ? to : others[0].id, give: { money: 0, props: [], pardons: 0 }, get: { money: 0, props: [], pardons: 0 } };
  }
  function draftSpec() { const d = ui.draft; return { from: myPid(), to: d.to, give: d.give, get: d.get }; }
  function renderTradeModal() {
    const d = ui.draft, from = game.player(myPid()), to = game.player(d.to);
    const col = (p, sd, key) => {
      const owned = game.ownedBy(p.id).sort((a, b) => a - b);
      return `<div class="tb-col"><h3>${dotHTML(p)} ${esc(giveLabel(p))}</h3>
        <div class="money-in"><label class="eyebrow" for="tb-${key}-money">Cash · has ${fmt(p.money)}</label>
          <div class="top"><input type="number" id="tb-${key}-money" data-money="${key}" min="0" max="${p.money}" step="10" value="${sd.money}"></div>
          <input type="range" id="tb-${key}-range" data-range="${key}" min="0" max="${p.money}" step="10" value="${sd.money}" aria-label="${esc(p.name)} cash"></div>
        <div class="plist">${owned.length ? owned.map((i) => {
          const ok = game.tradable(p.id, i), on = sd.props.includes(i);
          return `<label class="pcheck ${ok ? '' : 'locked'}" style="--g:${groupColor(i)}" title="${ok ? '' : 'Sell the buildings in this set before trading it'}"><input type="checkbox" data-prop="${key}" value="${i}" ${on ? 'checked' : ''} ${ok ? '' : 'disabled'}><i></i><span class="nm">${esc(BOARD[i].name)}${game.s.props[i].mortgaged ? ' · mortgaged' : ''}</span><span class="pr">${fmt(BOARD[i].price)}</span></label>`;
        }).join('') : '<span class="muted">No properties</span>'}</div>
        ${p.pardons.length ? `<div class="owner-line"><span class="muted">Pardon cards</span><span class="stepper"><button class="icon-btn" data-pard="${key}" data-d="-1" aria-label="Fewer Pardon cards">${icon('minus')}</button><b>${sd.pardons}</b><button class="icon-btn" data-pard="${key}" data-d="1" aria-label="More Pardon cards">${icon('plus')}</button></span></div>` : ''}
      </div>`;
    };
    const err = game.validateTrade(draftSpec());
    setModal(`<div class="sheet wide" role="dialog" aria-modal="true" aria-label="Propose a trade">
      <div class="sheet-h"><h2>Propose a trade</h2><button class="icon-btn" data-close aria-label="Close">${icon('x')}</button></div>
      <div class="sheet-b">
        <div><div class="eyebrow" style="margin-bottom:8px">Trade with</div><div class="tb-to">${game.alive().filter((p) => p.id !== from.id).map((p) => `<button data-to="${p.id}" class="${p.id === d.to ? 'on' : ''}" style="--pc:${p.color}">${dotHTML(p)}${esc(p.name)}${p.bot ? ' <span class="tag">Bot</span>' : ''}</button>`).join('')}</div></div>
        <div class="tb-cols">${col(from, d.give, 'give')}${col(to, d.get, 'get')}</div>
      </div>
      <div class="sheet-f"><span class="err" id="tbErr" style="margin-right:auto">${err && err !== 'Add something to the trade.' ? esc(err) : ''}</span><button class="btn" data-close>Cancel</button><button class="btn primary" id="tbSend" ${err ? 'disabled' : ''}>${icon('swap')} Send offer</button></div>
    </div>`);
  }
  function refreshTradeValidity() {
    const err = game.validateTrade(draftSpec());
    const e = $('#tbErr'); if (e) e.textContent = err && err !== 'Add something to the trade.' ? err : '';
    const b = $('#tbSend'); if (b) b.disabled = !!err;
  }
  function renderConfirmModal() {
    const m = ui.modal;
    setModal(`<div class="sheet" role="alertdialog" aria-modal="true" aria-label="${esc(m.title)}">
      <div class="sheet-h"><h2>${esc(m.title)}</h2><button class="icon-btn" data-close aria-label="Close">${icon('x')}</button></div>
      <div class="sheet-b"><p>${m.body}</p></div>
      <div class="sheet-f"><button class="btn" data-close data-autofocus>Keep playing</button><button class="btn ${m.danger ? 'danger' : 'primary'}" data-confirm>${esc(m.confirm)}</button></div></div>`);
  }
  function renderRulesModal() {
    const st = room ? room.settings : {};
    const yes = (b) => (b ? '<span class="tag good">On</span>' : '<span class="tag">Off</span>');
    const rows = RULES.filter((r) => r.key && r.key !== 'botSpeed' && r.key !== 'private').map((r) => {
      const v = st[r.key];
      const shown = r.type === 'toggle' ? yes(v) : `<b>${(r.options.find((o) => String(o[0]) === String(v)) || [0, v])[1]}</b>`;
      return `<div><span>${r.label}</span>${shown}</div>`;
    }).join('');
    setModal(`<div class="sheet wide" role="dialog" aria-modal="true" aria-label="How to play">
      <div class="sheet-h"><h2>How to play</h2><button class="icon-btn" data-close aria-label="Close">${icon('x')}</button></div>
      <div class="sheet-b">
        <ol class="guide">
          <li><b>Roll and move.</b> Doubles let you roll again, but three doubles in a row send you to Prison.</li>
          <li><b>Buy what you land on.</b> Pass on it and it ${st.auctions ? 'goes to auction for everyone to bid on' : 'stays with the bank'}.</li>
          <li><b>Collect rent.</b> Own every place in a region to ${st.doubleRentSet ? 'double the base rent and ' : ''}start building houses, then a hotel.</li>
          <li><b>Raise cash when you need it.</b> Sell buildings back at half price${st.mortgages ? ', mortgage property for half its value' : ''}, sell property to the bank, or trade.</li>
          <li><b>Win.</b> ${st.roundLimit ? `After round ${st.roundLimit}, the highest net worth wins. Or be the last one standing.` : 'Be the last player who is not bankrupt.'}</li>
        </ol>
        <div class="eyebrow">House rules for this room</div>
        <div class="rule-list">${rows}</div>
      </div></div>`);
  }
  function renderOverModal() {
    if (!game || !game.s.over) return;
    const s = game.s, st = game.standings(), w = game.player(s.winner);
    const reason = s.endReason === 'rounds' ? `Highest net worth after ${s.round} rounds.` : `Last player standing after ${s.round} rounds.`;
    const rows = st.map((p, k) => `<tr><td>${k + 1}</td><td><span class="mini-dot" style="--pc:${p.color}"></span> ${esc(p.name)}${p.id === myPid() ? ' (you)' : ''}</td><td class="r">${p.bankrupt ? `Out in round ${p.outRound}` : fmt(p.money)}</td><td class="r"><b>${p.bankrupt ? '—' : fmt(game.netWorth(p.id))}</b></td></tr>`).join('');
    setModal(`<div class="sheet wide" role="dialog" aria-modal="true" aria-label="Game over">
      <div class="sheet-h"><div class="winner">${dotHTML(w)}<div><div class="eyebrow">Game over</div><h2>${esc(w.id === myPid() ? 'You win!' : `${w.name} wins`)}</h2></div></div><button class="icon-btn" data-close aria-label="Close">${icon('x')}</button></div>
      <div class="sheet-b">${podiumHTML(st)}<p class="over-reason">${reason}</p>
        <div class="chart-wrap">${worthChart()}</div>
        <table class="standings"><thead><tr><th>#</th><th>Player</th><th class="r">Cash</th><th class="r">Net worth</th></tr></thead><tbody>${rows}</tbody></table>
      </div>
      <div class="sheet-f"><button class="btn" data-a="home">Leave room</button>${amHost() ? '<button class="btn primary" data-a="restart" data-autofocus>New game in this room</button>' : `<span class="muted">${esc(room && room.hostName ? room.hostName : 'The host')} can start a new game.</span>`}</div></div>`);
  }
  // 1st in the middle and highest, 2nd on the left, 3rd on the right; steps rise in one after another.
  function podiumHTML(st) {
    const top = st.slice(0, 3);
    if (top.length < 2) return '';
    const order = top.length === 2 ? [1, 0] : [1, 0, 2];
    const label = ['1st', '2nd', '3rd'];
    return `<div class="podium" aria-label="Podium">${order.map((k) => {
      const p = top[k];
      return `<div class="pod pod-${k + 1}" style="--pc:${p.color}; --d:${[0.55, 0.3, 0.05][k]}s">
        ${k === 0 ? `<span class="pod-crown" aria-hidden="true">${icon('crown')}</span>` : ''}
        ${dotHTML(p, 'pod-dot')}
        <b class="pod-name">${esc(p.name)}${p.id === myPid() ? ' (you)' : ''}</b>
        <span class="pod-worth">${p.bankrupt ? `Out in round ${p.outRound}` : fmt(game.netWorth(p.id))}</span>
        <div class="pod-step"><span>${label[k]}</span></div>
      </div>`;
    }).join('')}</div>`;
  }
  // A short burst of confetti in the players' colours when the game ends (lighter on slow devices).
  function celebrate() {
    if (reduceMotion() || !game) return;
    const cv = document.createElement('canvas');
    cv.className = 'confetti';
    cv.setAttribute('aria-hidden', 'true');
    document.body.appendChild(cv);
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = innerWidth, H = innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    const c = cv.getContext('2d'); c.scale(dpr, dpr);
    const w = game.player(game.s.winner);
    const cols = [w ? w.color : '#FFD166', ...game.s.players.map((p) => p.color), '#FFD166', '#FFFFFF'];
    const N = PERF_LITE ? 70 : 160;
    const bits = Array.from({ length: N }, (_, k) => {
      const side = k % 2 ? 1 : -1;
      return { x: side > 0 ? W * 0.1 : W * 0.9, y: H * 0.75, vx: side * (3 + Math.random() * 7), vy: -(9 + Math.random() * 9),
        r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3, s: 5 + Math.random() * 6, col: cols[k % cols.length] };
    });
    const t0 = performance.now();
    const frame = (t) => {
      const age = t - t0;
      c.clearRect(0, 0, W, H);
      c.globalAlpha = Math.max(0, Math.min(1, (3200 - age) / 700));
      for (const b of bits) {
        b.vy += 0.32; b.vx *= 0.985; b.x += b.vx; b.y += b.vy; b.r += b.vr;
        c.save(); c.translate(b.x, b.y); c.rotate(b.r); c.fillStyle = b.col; c.fillRect(-b.s / 2, -b.s / 4, b.s, b.s / 2); c.restore();
      }
      if (age < 3200) requestAnimationFrame(frame); else cv.remove();
    };
    requestAnimationFrame(frame);
  }
  function worthChart() {
    const hist = game.s.history;
    if (hist.length < 2) return '';
    const W = 700, H = 220, L = 54, R = 16, T = 14, Bm = 28;
    let max = 0;
    for (const h of hist) for (const v of Object.values(h.w)) max = Math.max(max, v);
    const step = max > 8000 ? 2000 : max > 4000 ? 1000 : 500;
    max = Math.max(step, Math.ceil(max / step) * step);
    const x = (k) => L + (k / (hist.length - 1)) * (W - L - R);
    const y = (v) => T + (1 - v / max) * (H - T - Bm);
    let g = '';
    for (let v = 0; v <= max; v += step) g += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${v >= 1000 ? `£${v / 1000}k` : `£${v}`}</text>`;
    const ticks = Math.min(6, hist.length - 1);
    for (let k = 0; k <= ticks; k++) { const idx = Math.round((k / ticks) * (hist.length - 1)); g += `<text x="${x(idx)}" y="${H - 8}" text-anchor="middle">${hist[idx].end ? 'End' : `R${hist[idx].r}`}</text>`; }
    const lines = game.s.players.map((p) => {
      const pts = hist.map((h, k) => `${x(k).toFixed(1)},${y(h.w[p.id] || 0).toFixed(1)}`).join(' ');
      const last = hist[hist.length - 1].w[p.id] || 0;
      return `<polyline points="${pts}" fill="none" stroke="${p.color}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" opacity="${p.bankrupt ? 0.45 : 1}"/><circle cx="${x(hist.length - 1)}" cy="${y(last)}" r="3.5" fill="${p.color}"/>`;
    }).join('');
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Net worth of each player by round">${g}${lines}</svg>`;
  }

  // ------------------------------------------------------------ input
  function doAction(a, el) {
    Sound.ensure();
    if (!game) return;
    switch (a) {
      case 'roll': case 'end': case 'buy': case 'decline':
        if (!ui.busy) act(a); return;
      case 'autoroll':
        ui.autoRoll = !ui.autoRoll;
        ui.autoRollTurn = null;
        render();
        if (ui.autoRoll) syncAutoRoll();
        return;
      case 'bail': case 'pardon': case 'pay': act(a); return;
      case 'details': openModal('tile', { i: +el.dataset.i }); return;
      case 'results': openModal('over'); return;
      case 'newtrade': openDeal(); return;
      case 'restart': closeModal(); net.send({ type: 'restart' }); return;
      case 'home': closeModal(); goHome(); return;
      case 'bankrupt': askBankrupt(); return;
      case 'photo': pickPhoto(); return;
      case 'kick': askKick(+el.dataset.pid); return;
    }
  }
  // ------------------------------------------------------------ vote to remove a player
  function askKick(pid) {
    const p = game.player(pid), mine = myPid();
    if (!p || mine == null || p.bankrupt) return;
    const others = game.s.players.filter((x) => !x.bot && !x.bankrupt && x.id !== pid && x.id !== mine && room && room.seats[x.id] && room.seats[x.id].online).length;
    openModal('confirm', {
      title: p.bot ? `Remove ${p.name}?` : `Vote to remove ${p.name}?`,
      body: `${others ? `The other ${others === 1 ? 'player gets' : `${others} players get`} 30 seconds to vote. If more than half of you agree, ${esc(p.name)} is out of the game.` : `You're the only one who can vote, so ${esc(p.name)} leaves the game straight away.`} Their properties are auctioned, a region at a time.`,
      confirm: others ? 'Start the vote' : 'Remove', danger: true,
      onConfirm: () => act('kick', { pid }),
    });
  }
  // The vote shows as a bar at the top of everyone's screen while it runs.
  function renderVote() {
    let bar = $('#voteBar');
    const V = room && room.vote;
    if (!V || !game || screen !== 'game' || !game.player(V.target)) { if (bar) bar.remove(); return; }
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'voteBar'; bar.className = 'vote-bar'; bar.setAttribute('role', 'status');
      bar.addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (b) act('vote', { yes: b.dataset.v === '1' }); });
      document.body.appendChild(bar);
    }
    const t = game.player(V.target), by = game.player(V.by), mine = myPid();
    const canVote = mine != null && V.voters.includes(mine);
    const voted = V.yes.includes(mine) ? 'yes' : V.no.includes(mine) ? 'no' : '';
    const head = mine === V.target ? 'The others are voting on whether to remove you from the game.'
      : `<b>${esc(by.id === mine ? 'You' : by.name)}</b> ${by.id === mine ? 'want' : 'wants'} to remove <b>${esc(t.name)}</b>${t.bot ? ' (bot)' : ''}.`;
    const ctl = !canVote ? '' : !voted
      ? '<button type="button" class="btn sm danger" data-v="1">Remove</button><button type="button" class="btn sm" data-v="0">Keep</button>'
      : `<span class="muted">You voted to ${voted === 'yes' ? 'remove' : 'keep'} them.</span><button type="button" class="link" data-v="${voted === 'yes' ? 0 : 1}">Change</button>`;
    const html = `<div class="vb-top">${dotHTML(t)}<span class="vb-txt"><span>${head}</span><span class="muted">${V.yes.length} of ${V.need} votes to remove<span aria-hidden="true"> · <span id="voteSecs"></span></span></span></span></div>${ctl ? `<div class="vb-ctl">${ctl}</div>` : ''}`;
    if (bar.dataset.h !== html) { bar.dataset.h = html; bar.innerHTML = html; }
    tickVote();
  }
  function tickVote() {
    const el = $('#voteSecs'), V = room && room.vote;
    if (el && V) el.textContent = `${Math.max(0, Math.ceil((V.deadline - serverNow()) / 1000))}s left`;
  }
  function askBankrupt() {
    const mine = myPid(); if (mine == null) return;
    const d = game.s.debt && game.s.debt.pid === mine ? game.s.debt : null;
    openModal('confirm', {
      title: 'Declare bankruptcy?',
      body: `You leave the game. Your properties are auctioned, a region at a time.${d && typeof d.to === 'number' ? ` Your cash and Pardon cards go to ${esc(pname(d.to))}.` : ''} You can keep watching. This can’t be undone.`,
      confirm: 'Declare bankruptcy', danger: true,
      onConfirm: () => act('bankrupt'),
    });
  }
  function confirmSellProp(i) {
    const t = BOARD[i];
    openModal('confirm', {
      title: `Sell ${t.name}?`,
      body: `The bank pays you ${fmt(game.sellValue(i))} and ${t.name} goes back on sale. Mortgaging instead gives you ${fmt(game.mortgageValue(i))} and you keep it.`,
      confirm: `Sell for ${fmt(game.sellValue(i))}`, danger: true,
      onConfirm: () => act('sellprop', { i }),
    });
  }
  function bindGame() {
    bindZoom();
    document.addEventListener('click', (e) => {
      const sp = e.target.closest('[data-sellprop]');
      if (sp && game && !sp.disabled) { e.stopPropagation(); confirmSellProp(+sp.dataset.sellprop); }
    }, true);
    $('#board').addEventListener('click', (e) => {
      const a = e.target.closest('[data-a]');
      if (a) return doAction(a.dataset.a, a);
      const bid = e.target.closest('[data-bid]');
      if (bid) return act('bid', { amount: +bid.dataset.amt });
      if (e.target.closest('[data-pass]')) return act('pass');
      if (e.target.closest('.center')) return;
      const t = e.target.closest('.tile');
      if (t) openModal('tile', { i: +t.dataset.i });
    });
    $('#board').addEventListener('pointerover', (e) => {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      const t = e.target.closest('.tile');
      if (t) showTip(+t.dataset.i); else hideTip();
    });
    $('#board').addEventListener('pointerleave', hideTip);
    $('#board').addEventListener('pointerdown', hideTip);
    $('#board').addEventListener('keydown', (e) => {
      const t = e.target.closest('.tile');
      if (t && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openModal('tile', { i: +t.dataset.i }); }
    });
    const hoverFocus = (e) => {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      const c = e.target.closest('[data-pid],[data-view]');
      focusOwner(c ? +(c.dataset.pid != null ? c.dataset.pid : c.dataset.view) : null);
    };
    for (const id of ['#players', '#sidebody']) {
      $(id).addEventListener('pointerover', hoverFocus);
      $(id).addEventListener('pointerleave', () => focusOwner(null));
    }
    $('#players').addEventListener('click', (e) => {
      const fc = e.target.closest('[data-pid]');
      if (fc && e.pointerType && e.pointerType !== 'mouse') flashOwner(+fc.dataset.pid);
    });
    $('#players').addEventListener('click', (e) => { const c = e.target.closest('[data-pid]'); if (c) { ui.view = +c.dataset.pid; ui.tab = 'portfolio'; render(); } });
    $('#tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) { ui.tab = b.dataset.tab; render(); } });
    $('#sidebody').addEventListener('click', (e) => {
      const v = e.target.closest('[data-view]'); if (v) { ui.view = +v.dataset.view; render(); return; }
      const o = e.target.closest('[data-open]'); if (o) { openModal('tile', { i: +o.dataset.open }); return; }
      const m = e.target.closest('[data-m]'); if (m) { act(m.dataset.m, { i: +m.dataset.i }); return; }
      const tr = e.target.closest('[data-tr]'); if (tr) { act(tr.dataset.tr, { id: +tr.dataset.id }); return; }
      const a = e.target.closest('[data-a]'); if (a) doAction(a.dataset.a, a);
    });
    $('#rulesBtn').innerHTML = icon('book');
    $('#copyBtn').innerHTML = icon('link');
    $('#leaveBtn').innerHTML = icon('exit');
    $('#soundBtn').addEventListener('click', () => { Sound.on = !Sound.on; prof.sound = Sound.on; saveProf(); paintSound(); if (Sound.on) Sound.turn(); });
    $('#rulesBtn').addEventListener('click', () => openModal('rules'));
    $('#copyBtn').addEventListener('click', copyLink);
    $('#leaveBtn').addEventListener('click', () => {
      const mine = myPid(), playing = game && !game.s.over && mine != null && !game.player(mine).bankrupt;
      if (!playing) return goHome();
      openModal('confirm', {
        title: 'Leave this game?', body: 'Your seat stays yours. While you are away, a bot plays your turns. Open the room link again to take back control.',
        confirm: 'Leave game', onConfirm: goHome,
      });
    });
    $('#resignBtn').addEventListener('click', askBankrupt);

    const modal = $('#modal');
    modal.addEventListener('click', (e) => {
      if (e.target === modal || e.target.closest('[data-close]')) return closeModal();
      if (!ui.modal) return;
      if (e.target.closest('[data-confirm]')) { const fn = ui.modal.onConfirm; closeModal(); if (fn) fn(); return; }
      const a = e.target.closest('[data-a]'); if (a) return doAction(a.dataset.a, a);
      const m = e.target.closest('[data-m]'); if (m) { act(m.dataset.m, { i: +m.dataset.i }); return; }
      if (ui.modal.kind === 'trade') {
        const d = ui.draft;
        const t = e.target.closest('[data-to]');
        if (t) { ui.draft = newDraft(+t.dataset.to); renderTradeModal(); return; }
        const pd = e.target.closest('[data-pard]');
        if (pd) {
          const sd = d[pd.dataset.pard], owner = game.player(pd.dataset.pard === 'give' ? myPid() : d.to);
          sd.pardons = Math.max(0, Math.min(owner.pardons.length, sd.pardons + +pd.dataset.d));
          renderTradeModal(); return;
        }
        if (e.target.closest('#tbSend')) {
          const err = game.validateTrade(draftSpec());
          if (err) { $('#tbErr').textContent = err; return; }
          act('trade', { to: d.to, give: d.give, get: d.get });
          closeModal(); ui.tab = 'trades';
          toast(`Offer sent to <b>${esc(pname(d.to))}</b>.`);
        }
      }
    });
    modal.addEventListener('input', (e) => {
      if (!ui.modal || ui.modal.kind !== 'trade') return;
      const d = ui.draft, el = e.target.closest('[data-money],[data-range]');
      if (!el) return;
      const key = el.dataset.money || el.dataset.range;
      const owner = game.player(key === 'give' ? myPid() : d.to);
      const v = Math.max(0, Math.min(owner.money, Math.floor(+el.value || 0)));
      d[key].money = v;
      const twin = el.dataset.money ? $(`#tb-${key}-range`) : $(`#tb-${key}-money`);
      if (twin) twin.value = v;
      refreshTradeValidity();
    });
    modal.addEventListener('change', (e) => {
      if (!ui.modal || ui.modal.kind !== 'trade') return;
      const c = e.target.closest('[data-prop]'); if (!c) return;
      const sd = ui.draft[c.dataset.prop], i = +c.value;
      if (c.checked) { if (!sd.props.includes(i)) sd.props.push(i); } else sd.props = sd.props.filter((x) => x !== i);
      refreshTradeValidity();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && ui.modal) { closeModal(); return; }
      if (screen !== 'game' || !game || ui.modal) return;
      if (e.target.closest && e.target.closest('input, select, textarea, button, [role=button]')) return;
      if (e.key !== ' ' && e.key !== 'Enter') return;
      const p = game.cur, ph = game.s.turn.phase;
      if (p.id !== myPid() || ui.busy || game.s.over) return;
      if (ph === 'roll' || ph === 'end') { e.preventDefault(); doAction(ph); }
    });
    let rt = null;
    const onResize = () => { clearTimeout(rt); rt = setTimeout(() => { positionTokens(true); fitBadges(); drawRosette($('#rosette'), { rings: 4, alpha: 0.1 }); }, 120); };
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => fitBadges());
    // A new theme changes fonts and edges, so tiles and tokens are measured again once its fonts are in.
    window.addEventListener('boomtown:theme', () => {
      drawRosette($('#homeRosette'), { rings: 3, alpha: 0.13 });
      onResize();
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(onResize);
    });
    window.addEventListener('resize', onResize);
    if (window.ResizeObserver) new ResizeObserver(onResize).observe($('#board'));
  }
  function paintSound() {
    $('#soundBtn').innerHTML = icon(Sound.on ? 'volume' : 'mute');
    $('#soundBtn').setAttribute('aria-label', Sound.on ? 'Mute sound' : 'Turn sound on');
  }

  // ------------------------------------------------------------ effects
  function moneyFx(ev) {
    const el = document.querySelector(`[data-money="${ev.pid}"]`);
    if (!el || !ev.delta) return;
    const r = el.getBoundingClientRect();
    if (!r.width) return;
    const f = document.createElement('div');
    f.className = `float ${ev.delta > 0 ? 'up' : 'down'}`;
    f.setAttribute('aria-hidden', 'true'); // a visual echo of the balance; the activity feed announces it
    f.textContent = `${ev.delta > 0 ? '+' : '−'}${fmt(Math.abs(ev.delta))}`;
    f.style.left = `${r.left + r.width / 2}px`;
    f.style.top = `${r.top - 4}px`;
    document.body.appendChild(f);
    setTimeout(() => f.remove(), 1300);
  }
  function toast(html, opts) {
    const box = $('#toasts');
    const el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    el.innerHTML = `<span>${html}</span>${opts && opts.action ? `<button class="btn sm">${esc(opts.action)}</button>` : ''}`;
    if (opts && opts.action) el.querySelector('button').onclick = () => { el.remove(); opts.onAction(); };
    box.appendChild(el);
    while (box.children.length > 3) box.firstElementChild.remove();
    setTimeout(() => el.remove(), 4800);
  }
  // The rosette behind the board and on the start screen, in the theme's colours. Sketch themes draw it
  // by hand: fewer, wobblier lines in several crayons or chalks.
  function drawRosette(canvas, opt) {
    if (!canvas) return;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    const css = getComputedStyle(document.documentElement);
    const inks = (css.getPropertyValue('--rosette-rgb').trim() || '241,185,75').split('|').map((s) => s.trim());
    const sketch = css.getPropertyValue('--rosette-sketch').trim() === '1';
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    const c = canvas.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    c.translate(w / 2, h / 2);
    c.lineCap = 'round'; c.lineJoin = 'round';
    const R = Math.min(w, h) * 0.47;
    const alpha = sketch ? opt.alpha * 1.7 : opt.alpha;
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    // One closed loop round the centre; in a sketch theme the radius drifts a little, like a hand.
    const loop = (radius) => {
      let wob = 0;
      c.beginPath();
      for (let s = 0; s <= 720; s++) {
        const th = (s / 720) * Math.PI * 2;
        if (sketch) wob += (rnd() - 0.5) * 0.005 - wob * 0.03;
        const rr = R * (radius(th) + wob);
        if (s) c.lineTo(Math.cos(th) * rr, Math.sin(th) * rr); else c.moveTo(Math.cos(th) * rr, Math.sin(th) * rr);
      }
      c.stroke();
    };
    const bands = [
      { r: 0.86, amp: 0.06, lobes: 24, copies: 14 }, { r: 0.66, amp: 0.05, lobes: 18, copies: 12 },
      { r: 0.42, amp: 0.07, lobes: 12, copies: 10 }, { r: 0.2, amp: 0.06, lobes: 8, copies: 8 },
    ].slice(0, opt.rings);
    bands.forEach((b, bi) => {
      const copies = sketch ? Math.ceil(b.copies / 3) : b.copies;
      c.lineWidth = sketch ? 1.4 : 0.7;
      c.strokeStyle = `rgba(${inks[bi % inks.length]},${alpha})`;
      for (let k = 0; k < copies; k++) {
        const ph = ((k / copies) * Math.PI * 2) / b.lobes;
        loop((th) => b.r + b.amp * Math.sin(b.lobes * (th + ph)) * Math.cos(th * 2 + k));
      }
    });
    c.strokeStyle = `rgba(${inks[0]},${alpha * 1.4})`;
    for (const f of [0.95, 0.955, 0.54, 0.545]) loop(() => f);
  }

  // ------------------------------------------------------------ boot
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-rejoin]');
    if (b) { Sound.ensure(); net.send({ type: 'rejoin', seat: Number(b.dataset.rejoin) }); }
  });
  // Theme buttons on the start screen, in the waiting room and in the game.
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-theme-btn]');
    if (b && window.BoomThemes) window.BoomThemes.openPicker({ returnTo: b });
  });
  $$('.brandslot').forEach((el) => { el.innerHTML = WORDMARK; });
  bindHome();
  bindRoom();
  bindGame();
  bindDeals();
  paintSound();
  renderHome();
  show(wantRoom ? 'room' : 'home');
  if (wantRoom) { $('#roomSeats').innerHTML = '<li class="seat-row empty"><span></span><span>Joining room…</span><span></span></li>'; }
  net.connect();
})();
