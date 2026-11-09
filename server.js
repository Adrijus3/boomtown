'use strict';
/* PoorDown online server: static files + WebSocket rooms. The server runs the rules engine for every
   room, so clients only send intentions ("roll", "bid 120") and receive the authoritative state. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { WebSocketServer } = require('ws');
const { Game, Bot, DEFAULT_SETTINGS } = require('./public/engine.js');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC = path.join(__dirname, 'public');
const AWAY_GRACE = 15000; // ms before a disconnected player's turn is played on autopilot
const MAX_ROOMS = 500;

// Must match the client's animation timings so the server waits while tokens move.
const SPEED = {
  relaxed: { step: 150, dice: 1300, bot: 1.5, card: 500, jump: 560, auction: 12000 },
  normal: { step: 110, dice: 1050, bot: 1, card: 350, jump: 480, auction: 10000 },
  fast: { step: 65, dice: 700, bot: 0.45, card: 220, jump: 380, auction: 7000 },
};
const COLORS = ['#F5B83D', '#FF7A59', '#F062A5', '#A78BFA', '#4FB3FF', '#2CC7B0', '#9BD34B', '#E3E8F4'];
const BOT_NAMES = ['Baroness Bly', 'Otto Vance', 'Mila Sterling', 'Rex Holloway', 'Juno Park', 'Kit Marlowe', 'Nova Reyes', 'Ivo Brandt', 'Zara Quill', 'Felix Dune', 'Opal Grant', 'Hugo Lake'];

const SETTING_RULES = {
  maxPlayers: [2, 3, 4, 5, 6, 7, 8],
  startingCash: [1000, 1500, 2000, 2500, 3000],
  startDeal: [-1, 0, 1, 2, 3],
  salary: [100, 150, 200, 300, 400],
  bail: [50, 100, 150],
  roundLimit: [25], // fixed: the game-length option was removed
  rollTimer: [0, 30, 60, 90, 120],
  turnTimer: [0, 60, 120, 180, 300],
  botSpeed: ['relaxed', 'normal', 'fast'],
};
const BOOL_SETTINGS = ['private', 'doubleOnStart', 'vacationCash', 'auctions', 'doubleRentSet', 'mortgages', 'evenBuild', 'limitedBuildings', 'noRentInPrison', 'randomOrder'];
// Rooms default to 25 rounds, richest player wins: about the length of a lesson, and in testing the
// leader after 25 rounds was the full-game winner 77% of the time. It's fixed, not a host option.
const ROOM_DEFAULTS = Object.assign({}, DEFAULT_SETTINGS, { maxPlayers: 6, private: false, rollTimer: 60, turnTimer: 120, roundLimit: 25 });
const ENGINE_KEYS = Object.keys(DEFAULT_SETTINGS);

// ------------------------------------------------------------ static files
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };
// Keep a content fingerprint per asset. A deployment changes BUILD so open tabs can
// detect updates, but unchanged files keep the same URL and remain cached in the browser.
const ASSET_VERSIONS = new Map();
const BUILD = (() => {
  const h = crypto.createHash('sha256');
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir).sort()) {
      const f = path.join(dir, name);
      if (fs.statSync(f).isDirectory()) walk(f);
      else if (/\.(js|css|html|svg|woff2)$/.test(name)) {
        const content = fs.readFileSync(f);
        const assetPath = '/' + path.relative(PUBLIC, f).split(path.sep).join('/');
        ASSET_VERSIONS.set(assetPath, crypto.createHash('sha256').update(content).digest('hex').slice(0, 12));
        h.update(name).update(content);
      }
    }
  };
  walk(PUBLIC);
  return h.digest('hex').slice(0, 12);
})();
const INDEX = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8')
  .replace(/((?:src|href)=")(\/[^"?]+\.(?:js|css))(?:\?[^"]*)?(")/g, (match, attr, assetPath, quote) =>
    `${attr}${assetPath}?v=${ASSET_VERSIONS.get(assetPath) || BUILD}${quote}`)
  .replace('<head>', `<head>\n<script>window.BOOMTOWN_BUILD = ${JSON.stringify(BUILD)};</script>`);
// Text files (scripts, styles, the page) are compressed once and kept in memory: about a third of the
// download on a first visit, which matters when a whole class joins on the same wifi.
const COMPRESSIBLE = /\.(js|css|html|svg|txt|webmanifest)$/;
const packed = new Map();
function pack(key, buf) {
  if (!packed.has(key)) {
    packed.set(key, {
      raw: buf,
      br: zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } }),
      gzip: zlib.gzipSync(buf, { level: 9 }),
    });
  }
  return packed.get(key);
}
function sendBody(req, res, status, headers, key, buf) {
  const accept = String(req.headers['accept-encoding'] || '');
  const out = Object.assign({ vary: 'Accept-Encoding' }, headers);
  let body = buf;
  if (buf.length > 1024) {
    const p = pack(key, buf);
    if (/\bbr\b/.test(accept)) { body = p.br; out['content-encoding'] = 'br'; }
    else if (/\bgzip\b/.test(accept)) { body = p.gzip; out['content-encoding'] = 'gzip'; }
  }
  out['content-length'] = body.length;
  res.writeHead(status, out);
  res.end(req.method === 'HEAD' ? undefined : body);
}
// Compress everything up front, so a first visitor never stalls the server mid-game.
(function warm(dir) {
  for (const name of fs.readdirSync(dir)) {
    const f = path.join(dir, name);
    if (fs.statSync(f).isDirectory()) warm(f);
    else if (COMPRESSIBLE.test(name)) { const b = fs.readFileSync(f); if (b.length > 1024) pack(f, b); }
  }
})(PUBLIC);
pack('/index.html', Buffer.from(INDEX));
const server = http.createServer((req, res) => {
  let p, versioned;
  try {
    const u = new URL(req.url, 'http://local');
    p = decodeURIComponent(u.pathname);
    versioned = u.searchParams.get('v') === ASSET_VERSIONS.get(p);
  } catch (e) { res.writeHead(400); return res.end(); }
  if (p === '/healthz') { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end('ok'); }
  if (p === '/' || p === '/index.html' || /^\/room\/[a-z0-9]{3,12}\/?$/i.test(p)) {
    return sendBody(req, res, 200, { 'content-type': TYPES['.html'], 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff' }, '/index.html', Buffer.from(INDEX));
  }
  const file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(404); return res.end('Not found'); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('Not found'); }
    const headers = {
      'content-type': TYPES[path.extname(file)] || 'application/octet-stream',
      // Files asked for with this build's fingerprint never change, so phones can keep them; anything
      // else is checked with the server every time.
      'cache-control': versioned ? 'public, max-age=31536000, immutable' : /\.woff2$/.test(file) ? 'public, max-age=86400' : 'no-cache',
      'x-content-type-options': 'nosniff',
    };
    if (COMPRESSIBLE.test(file)) return sendBody(req, res, 200, headers, file, buf);
    res.writeHead(200, headers);
    res.end(buf);
  });
});

// ------------------------------------------------------------ clients
const clientsByToken = new Map();
const clientsById = new Map();
const rooms = new Map();
const rid = (n) => crypto.randomBytes(16).toString('base64').replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, n);

function getClient(token) {
  if (typeof token === 'string' && token.length >= 16 && token.length <= 64 && clientsByToken.has(token)) return clientsByToken.get(token);
  const c = {
    id: rid(10),
    token: typeof token === 'string' && /^[a-z0-9]{16,64}$/i.test(token) ? token : rid(24) + rid(8),
    name: '', color: COLORS[0], avatar: '', sockets: new Set(), roomId: null,
  };
  clientsByToken.set(c.token, c);
  clientsById.set(c.id, c);
  return c;
}
const cleanName = (s) => String(s || '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 18);
// A profile photo: a small JPEG, PNG or WebP picture sent as a data URL, or '' for none.
const AVATAR_MAX = 24000;
const cleanAvatar = (v) => (typeof v === 'string' && v.length <= AVATAR_MAX && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v) ? v : '');
const send = (ws, msg) => { if (ws.readyState === 1) ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg)); };
function sendClient(c, msg) { const str = typeof msg === 'string' ? msg : JSON.stringify(msg); for (const ws of c.sockets) send(ws, str); }
const online = (room, clientId) => { const c = clientsById.get(clientId); return !!c && c.sockets.size > 0 && c.roomId === room.id; };
const members = (room) => [...room.members].map((id) => clientsById.get(id)).filter(Boolean);

// ------------------------------------------------------------ rooms
// ------------------------------------------------------------ games that survive restarts
// Rooms live in memory, so a restart or a redeploy would end every game. Instead the server keeps sending each
// seated player a signed copy of their room. When the server comes back and someone reopens the room link,
// their browser hands the copy back; the signature proves this server made it and nobody changed it, and the
// room is rebuilt. Players get their seats back by a hash of their private token, which never leaves their
// browser. If several players send copies at once, the newest one wins.
const SNAP_MAX_AGE = 12 * 3600 * 1000;
const SNAP_SECRET = (() => {
  if (process.env.SNAPSHOT_SECRET) return process.env.SNAPSHOT_SECRET;
  if (process.env.RENDER_SERVICE_ID) return `render:${process.env.RENDER_SERVICE_ID}`; // the same across deploys
  const f = path.join(__dirname, '.snapshot-secret');
  try { const v = fs.readFileSync(f, 'utf8').trim(); if (v) return v; } catch (e) { /* first run */ }
  const v = crypto.randomBytes(32).toString('hex');
  try { fs.writeFileSync(f, v); } catch (e) { /* read-only disk: copies only work until the next restart */ }
  return v;
})();
const sign = (data) => crypto.createHmac('sha256', SNAP_SECRET).update(data).digest('base64url');
const sameSig = (a, b) => typeof a === 'string' && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const seatKey = (token) => crypto.createHash('sha256').update(`seat:${token}`).digest('base64url').slice(0, 24);
const keyOfClient = (cid) => { const c = clientsById.get(cid); return c ? seatKey(c.token) : null; };

function snapshotOf(room) {
  const g = room.game;
  room.snapSeq = (room.snapSeq || 0) + 1;
  const state = g ? Object.assign({}, g.s, {
    log: g.s.log.slice(-80),
    trades: g.s.trades.filter((t) => t.status === 'pending').concat(g.s.trades.filter((t) => t.status !== 'pending').slice(-10)),
  }) : null;
  return JSON.stringify({
    v: 1, id: room.id, at: Date.now(), seq: room.snapSeq, status: room.status, gid: room.gid,
    settings: room.settings, host: keyOfClient(room.hostId) || room.hostKey || null,
    seats: room.seats.map((x) => ({ name: x.name, color: x.color, bot: !!x.bot, key: x.bot ? null : keyOfClient(x.clientId) || x.key || null })),
    state, chat: room.chat.slice(-20),
  });
}
function sendSnapshot(room) {
  clearTimeout(room.snapTimer); room.snapTimer = null;
  if (rooms.get(room.id) !== room || room.status === 'over' || !room.seats.some((x) => !x.bot)) return;
  const data = snapshotOf(room);
  const msg = JSON.stringify({ type: 'snap', room: room.id, data, sig: sign(data) });
  for (const c of members(room)) if (seatOf(room, c.id) >= 0) sendClient(c, msg);
}
const queueSnapshot = (room) => { if (!room.snapTimer) room.snapTimer = setTimeout(() => sendSnapshot(room), 1500); };

const restoring = new Map(); // room id -> { snap, waiters, timer }
function requestRestore(c, data, sig) {
  if (typeof data !== 'string' || data.length > 200000 || !sameSig(sig, sign(data))) return 'That saved game could not be checked, so it was not brought back.';
  let snap;
  try { snap = JSON.parse(data); } catch (e) { return 'That saved game could not be read.'; }
  if (!snap || snap.v !== 1 || typeof snap.id !== 'string' || !Array.isArray(snap.seats)) return 'That saved game could not be read.';
  if (Date.now() - snap.at > SNAP_MAX_AGE) return 'That game is too old to bring back.';
  const live = rooms.get(snap.id);
  if (live) { joinRoom(c, live); return null; }
  if (rooms.size >= MAX_ROOMS) return 'The server is full right now. Try again in a few minutes.';
  let r = restoring.get(snap.id);
  if (!r) { r = { snap, waiters: new Set(), timer: setTimeout(() => finishRestore(snap.id), 1200) }; restoring.set(snap.id, r); }
  else if (snap.gid > r.snap.gid || (snap.gid === r.snap.gid && snap.seq > r.snap.seq)) r.snap = snap;
  r.waiters.add(c);
  return null;
}
function finishRestore(id) {
  const r = restoring.get(id);
  restoring.delete(id);
  if (!r) return;
  let room = rooms.get(id);
  if (!room) {
    const s = r.snap, now = Date.now();
    room = {
      id, hostId: null, hostKey: s.host, status: s.status === 'playing' && s.state ? 'playing' : 'waiting', createdAt: now, emptySince: null,
      settings: Object.assign({}, ROOM_DEFAULTS, s.settings),
      // Seats whose players haven't come back yet hold a placeholder that always counts as offline.
      seats: s.seats.map((x, i) => (x.bot ? { clientId: null, bot: true, name: x.name, color: x.color } : { clientId: `gone:${i}`, bot: false, name: x.name, color: x.color, key: x.key })),
      members: new Set(), chat: Array.isArray(s.chat) ? s.chat : [],
      game: null, gid: s.gid || 0, events: [], pidClient: [], busyUntil: 0,
      timers: { move: null, bot: null, turn: null, auction: null }, tradeTimers: {},
      auction: null, turnT: null, awaySince: {}, idle: {}, snapSeq: s.seq,
    };
    if (room.status === 'playing') {
      const g = new Game(s.state);
      room.game = g;
      g.on((ev) => room.events.push(ev));
      evenStartCash(g);
      room.pidClient = room.seats.map((x) => (x.bot ? null : x.clientId));
      room.seats.forEach((x, i) => { if (!x.bot) room.awaySince[i] = now; });
      room.busyUntil = now + 400;
    }
    rooms.set(id, room);
    sysChat(room, 'The server was updated and this game was brought back. Everyone gets their seat back when they reconnect.');
  }
  for (const c of r.waiters) if (c.sockets.size) joinRoom(c, room);
  passHost(room);
  broadcastRoom(room);
  if (room.game) tick(room);
}
// A returning player takes back their own seat (and the host role, if it was theirs).
function claimSeat(room, c) {
  const key = seatKey(c.token);
  if (room.hostKey && room.hostKey === key) { room.hostId = c.id; room.hostKey = null; }
  const i = room.seats.findIndex((x) => !x.bot && x.key === key && String(x.clientId).startsWith('gone:'));
  if (i < 0) return false;
  room.seats[i].clientId = c.id;
  c.color = room.seats[i].color;
  if (room.game) { room.pidClient[i] = c.id; delete room.awaySince[i]; }
  return true;
}

function createRoom(host, isPrivate) {
  let id;
  do { id = rid(5); } while (id.length < 5 || rooms.has(id));
  const room = {
    id, hostId: host.id, status: 'waiting', createdAt: Date.now(), emptySince: null,
    settings: Object.assign({}, ROOM_DEFAULTS, { private: !!isPrivate }),
    seats: [], members: new Set(), chat: [],
    game: null, gid: 0, events: [], pidClient: [], busyUntil: 0,
    timers: { move: null, bot: null, turn: null, auction: null }, tradeTimers: {},
    auction: null, turnT: null, awaySince: {},
  };
  rooms.set(id, room);
  return room;
}
const speedOf = (room) => SPEED[room.settings.botSpeed] || SPEED.normal;
const seatOf = (room, clientId) => room.seats.findIndex((s) => !s.bot && s.clientId === clientId);
const pidOf = (room, clientId) => { if (!room.game) return null; const i = room.pidClient.indexOf(clientId); return i >= 0 ? i : null; };
const freeColor = (room) => COLORS.find((c) => !room.seats.some((s) => s.color === c)) || COLORS[0];

function sysChat(room, text) {
  const msg = { t: Date.now(), sys: true, text };
  room.chat.push(msg);
  if (room.chat.length > 80) room.chat.splice(0, room.chat.length - 80);
  for (const c of members(room)) sendClient(c, { type: 'chat', msg });
}

function roomView(room) {
  const host = clientsById.get(room.hostId);
  return {
    id: room.id, hostId: room.hostId, hostName: host ? host.name : '', status: room.status, gid: room.gid,
    settings: room.settings,
    seats: room.seats.map((s) => ({ name: s.name, color: s.color, bot: !!s.bot, clientId: s.bot ? null : s.clientId, online: s.bot || online(room, s.clientId), avatar: s.bot ? '' : (clientsById.get(s.clientId) || {}).avatar || '' })),
    watchers: members(room).filter((c) => seatOf(room, c.id) < 0).length,
    chat: room.chat.slice(-60),
    vote: voteView(room),
  };
}
function broadcastRoom(room) {
  const view = JSON.stringify({ type: 'room', room: roomView(room) });
  for (const c of members(room)) sendClient(c, view);
  queueSnapshot(room);
}

function listRooms() {
  return [...rooms.values()]
    .filter((r) => !r.settings.private && r.status !== 'over' && members(r).some((c) => c.sockets.size))
    .sort((a, b) => (a.status === 'waiting' ? 0 : 1) - (b.status === 'waiting' ? 0 : 1) || b.seats.length - a.seats.length)
    .slice(0, 40)
    .map((r) => {
      const host = clientsById.get(r.hostId);
      return { id: r.id, host: host ? host.name : '', players: r.seats.length, max: r.settings.maxPlayers, bots: r.seats.filter((s) => s.bot).length, status: r.status, round: r.game ? r.game.s.round : 0 };
    });
}

function joinRoom(c, room) {
  if (c.roomId && c.roomId !== room.id) leaveRoom(c, true);
  const fresh = !room.members.has(c.id);
  c.roomId = room.id;
  room.members.add(c.id);
  room.emptySince = null;
  if (claimSeat(room, c) && room.game) sysChat(room, `${room.seats[pidOf(room, c.id)].name} is back.`);
  const pid = pidOf(room, c.id);
  if (pid != null && room.awaySince[pid]) { delete room.awaySince[pid]; if (room.game) sysChat(room, `${c.name || 'A player'} is back.`); }
  if (fresh && room.status !== 'waiting' && pid == null && c.name) sysChat(room, `${c.name} is watching.`);
  // Joining a room that hasn't started puts you straight into a free seat (if we know your name and you
  // didn't just give your seat up). A full room, or a game already under way, means you watch.
  if (room.status === 'waiting' && c.name && c.watchOnly !== room.id && seatOf(room, c.id) < 0 && takeSeat(room, c)) {
    sysChat(room, `${c.name} took a seat.`);
  }
  broadcastRoom(room);
  if (room.game) { sendGame(room, c, []); automate(room); }
}

function leaveRoom(c, quiet) {
  const room = rooms.get(c.roomId);
  c.roomId = null;
  if (!room) return;
  room.members.delete(c.id);
  if (room.status === 'waiting') {
    const i = seatOf(room, c.id);
    if (i >= 0) room.seats.splice(i, 1);
  } else {
    const pid = pidOf(room, c.id);
    if (pid != null && !room.awaySince[pid]) room.awaySince[pid] = Date.now();
  }
  if (!quiet) sysChat(room, `${c.name || 'Someone'} left the room.`);
  passHost(room);
  if (!members(room).some((m) => m.sockets.size)) room.emptySince = Date.now();
  broadcastRoom(room);
  if (room.game) automate(room);
}

function passHost(room) {
  if (online(room, room.hostId)) return;
  const next = members(room).find((m) => m.sockets.size && seatOf(room, m.id) >= 0) || members(room).find((m) => m.sockets.size);
  if (next && next.id !== room.hostId) { room.hostId = next.id; sysChat(room, `${next.name || 'A player'} is now the host.`); }
}

function takeSeat(room, c) {
  if (room.status !== 'waiting' || seatOf(room, c.id) >= 0) return false;
  if (room.seats.length >= room.settings.maxPlayers) return false;
  const color = c.color && !room.seats.some((s) => s.color === c.color) ? c.color : freeColor(room);
  c.color = color;
  room.seats.push({ clientId: c.id, name: c.name || `Player ${room.seats.length + 1}`, color, bot: false });
  return true;
}

// ------------------------------------------------------------ the game loop
function startGame(room) {
  const g = Game.create(room.seats.map((s) => ({ name: s.name, color: s.color, bot: !!s.bot })), pick(room.settings, ENGINE_KEYS));
  clearTimers(room);
  room.game = g;
  room.gid++;
  room.status = 'playing';
  room.events = [];
  room.pidClient = room.seats.map((s) => (s.bot ? null : s.clientId));
  room.awaySince = {};
  room.idle = {};
  room.busyUntil = Date.now() + 400;
  for (let pid = 0; pid < room.pidClient.length; pid++) {
    if (room.pidClient[pid] && !online(room, room.pidClient[pid])) room.awaySince[pid] = Date.now();
  }
  g.on((ev) => room.events.push(ev));
  sysChat(room, 'The game has started. Good luck!');
  broadcastRoom(room);
  tick(room);
}
const pick = (o, keys) => keys.reduce((a, k) => ((a[k] = o[k]), a), {});

function animTime(events, sp) {
  let t = 0;
  for (const e of events) {
    if (e.type === 'dice') t += sp.dice + 60;
    else if (e.type === 'move') t += (e.jump ? sp.jump : Math.max(380, Math.min(2400, Math.abs(e.steps) * sp.step))) + 120;
    else if (e.type === 'teleport') t += sp.jump + 120;
    else if (e.type === 'card') t += sp.card;
    else if (e.type === 'over') t += 400;
  }
  return t;
}

// Collects engine events, schedules what happens next, then tells everyone.
function tick(room) {
  const g = room.game;
  if (!g) return;
  const events = room.events.splice(0).filter((e) => e.type !== 'log' && e.type !== 'phase');
  const now = Date.now();
  const dur = animTime(events, speedOf(room));
  room.busyUntil = Math.max(room.busyUntil, now) + (dur ? dur + 150 : 0);
  if (g.s.turn.phase === 'moving' && g.s.pending && !room.timers.move) {
    room.timers.move = setTimeout(() => {
      room.timers.move = null;
      if (room.game !== g) return;
      g.completeMove();
      tick(room);
    }, Math.max(30, room.busyUntil - now));
  }
  if (g.s.over && room.status === 'playing') {
    room.status = 'over';
    clearTimers(room);
    sysChat(room, `${g.player(g.s.winner).name} wins the game.`);
    broadcastRoom(room);
  } else automate(room);
  const stateStr = JSON.stringify(Object.assign({}, g.s, { log: g.s.log.slice(-150) }));
  const evStr = JSON.stringify(events);
  for (const c of members(room)) sendGame(room, c, null, stateStr, evStr);
  queueSnapshot(room);
}

function sendGame(room, c, events, stateStr, evStr) {
  const g = room.game;
  if (!g) return;
  stateStr = stateStr || JSON.stringify(Object.assign({}, g.s, { log: g.s.log.slice(-150) }));
  evStr = evStr || JSON.stringify(events || []);
  const meta = {
    now: Date.now(),
    me: pidOf(room, c.id),
    auction: room.auction ? (() => { const me = pidOf(room, c.id); return { deadline: room.auction.deadline, span: room.auction.span, passed: me != null && !!room.auction.passed[me] }; })() : null,
    turn: timerMeta(room),
    away: Object.keys(room.awaySince).map(Number),
    idle: Object.keys(room.idle || {}).map(Number),
  };
  sendClient(c, `{"type":"game","gid":${room.gid},"state":${stateStr},"events":${evStr},"meta":${JSON.stringify(meta)}}`);
}

function awayFor(room, pid) {
  const cid = room.pidClient[pid];
  if (!cid || online(room, cid)) return -1;
  if (!room.awaySince[pid]) room.awaySince[pid] = Date.now();
  return Date.now() - room.awaySince[pid];
}

// Schedules bots, autopilot, trade replies, auctions and the turn timer. Never changes the game directly.
function automate(room) {
  const g = room.game;
  clearTimeout(room.timers.bot); room.timers.bot = null;
  if (!g || g.s.over) return;
  const sp = speedOf(room), now = Date.now();
  const wait = Math.max(0, room.busyUntil - now);

  for (const tr of g.s.trades) {
    // nobody answers offers during their own turn, bots included: they wait until the turn is over
    if (tr.status !== 'pending' || !g.player(tr.to).bot || room.tradeTimers[tr.id] || g.cur.id === tr.to) continue;
    room.tradeTimers[tr.id] = setTimeout(() => {
      delete room.tradeTimers[tr.id];
      if (room.game !== g) return;
      const t = g.findTrade(tr.id);
      if (!t || t.status !== 'pending') return;
      if (g.cur.id === t.to) { automate(room); return; }
      if (Bot.evaluateTrade(g, t)) g.acceptTrade(t.id); else g.declineTrade(t.id);
      tick(room);
    }, 1500 * sp.bot + 400);
  }

  if (room.kickPending != null && applyKick(room)) return;
  const p = g.cur, ph = g.s.turn.phase;
  turnTimer(room);
  if (ph === 'moving') return;
  if (ph === 'auction') return startAuction(room);
  const expired = !p.bot && !!room.turnT && room.turnT.expired && room.turnT.key === turnKey(room);
  const away = p.bot ? -1 : awayFor(room, p.id);
  if (p.bot || away >= 0 || expired) {
    const base = expired ? 450 : { roll: 650, buy: 850, end: 600, debt: 900 }[ph] || 700;
    const extra = p.bot || expired ? 0 : Math.max(0, AWAY_GRACE - away);
    room.timers.bot = setTimeout(() => {
      room.timers.bot = null;
      if (room.game !== g || g.s.over) return;
      if (g.cur.id !== p.id || g.s.turn.phase !== ph || Date.now() < room.busyUntil - 40) return automate(room);
      if (!p.bot && !expired && awayFor(room, p.id) < AWAY_GRACE) return automate(room);
      if (expired && g.s.turn.phase === 'buy') g.decline();
      else {
        const n = g.s.turn.n;
        Bot.act(g, p.bot ? { deferTrade: true } : { force: true, autopilot: true });
        // a bot makes its trade offer once its turn is over, not during it
        if (p.bot && !g.s.over && g.s.turn.n !== n && !p.bankrupt) Bot.maybeProposeTrade(g, p);
      }
      tick(room);
    }, wait + base * sp.bot + extra);
    return;
  }
}

// Two clocks per turn: one to roll the dice, then one to buy, build, trade and end the turn. Each starts
// the moment its part of the turn begins and keeps running while dice roll and tokens move; only an auction
// pauses it. When a clock runs out, that part of the turn is played for the player.
const turnKey = (room) => `${room.gid}:${room.game.s.turn.n}`;
const segOf = (ph) => (ph === 'roll' ? 'roll' : ph === 'moving' || ph === 'buy' || ph === 'end' || ph === 'debt' ? 'end' : null);
function timerMeta(room) {
  const TT = room.turnT;
  if (!TT || !TT.seg) return null;
  const onRoll = TT.seg === 'roll', left = Math.max(0, Math.round(onRoll ? TT.roll : TT.end));
  return { n: TT.n, seg: TT.seg, total: onRoll ? TT.rollTotal : TT.endTotal, left, deadline: TT.runningSince != null ? TT.runningSince + left : null, expired: TT.expired };
}
function sendTimer(room) {
  const msg = JSON.stringify({ type: 'timer', now: Date.now(), turn: timerMeta(room) });
  for (const c of members(room)) sendClient(c, msg);
}
function turnTimer(room) {
  const g = room.game, p = g.cur, t = g.s.turn, now = Date.now();
  const rollMs = (room.settings.rollTimer || 0) * 1000, endMs = (room.settings.turnTimer || 0) * 1000;
  clearTimeout(room.timers.turn); room.timers.turn = null;
  if ((!rollMs && !endMs) || p.bot || g.s.over) { room.turnT = null; return; }
  const key = turnKey(room);
  if (!room.turnT || room.turnT.key !== key) {
    room.turnT = { key, n: t.n, pid: p.id, roll: rollMs, end: endMs, rollTotal: rollMs, endTotal: endMs, seg: null, runningSince: null, expired: false, fired: {} };
  }
  const TT = room.turnT;
  // Charge the time since the last check to whichever clock was running.
  if (TT.runningSince != null && TT.seg) {
    const used = now - TT.runningSince;
    if (TT.seg === 'roll') TT.roll = Math.max(0, TT.roll - used); else TT.end = Math.max(0, TT.end - used);
  }
  TT.runningSince = null;
  const seg = segOf(t.phase), budget = seg === 'roll' ? rollMs : seg === 'end' ? endMs : 0;
  TT.seg = seg && budget ? seg : null; // no clock for an auction, or for a part of the turn that's switched off
  TT.expired = false;
  if (!TT.seg) return;
  const left = seg === 'roll' ? TT.roll : TT.end;
  if (left <= 0) {
    TT.expired = true;
    if (!TT.fired[seg]) {
      TT.fired[seg] = true;
      (room.idle || (room.idle = {}))[p.id] = true;
      sysChat(room, seg === 'roll' ? `${p.name} ran out of time to roll, so the dice were rolled for them.` : `Time's up for ${p.name}. Their turn is being finished for them.`);
    }
    return;
  }
  TT.runningSince = now;
  room.timers.turn = setTimeout(() => {
    room.timers.turn = null;
    if (room.game !== g || g.s.over) return;
    turnTimer(room);
    if (room.turnT && room.turnT.expired) tick(room); else sendTimer(room);
  }, left + 20);
}

// Auctions: one fixed clock (10 seconds at normal speed) that bids never extend. The highest bid when
// it runs out wins. Passing is final for that auction, and the auction ends early once everyone except
// the leader is out (passed, away, or unable to afford the next bid).
// A bid in the last few seconds puts the clock back up to that many seconds, so nobody wins by bidding
// at the final moment: everyone else always gets a fair chance to answer.
const LATE_BID_MS = 5000;
function extendOnLateBid(room) {
  const A = room.auction;
  if (!A) return;
  const now = Date.now();
  if (A.deadline - now < LATE_BID_MS) A.deadline = now + LATE_BID_MS;
}
// Games started while later seats got £40 extra each are evened out once: everyone is topped up to the
// most anyone started with. Those games are recognised by their opening log line.
function evenStartCash(g) {
  const s = g.s;
  if (s.evened) return;
  const marked = (s.log || []).some((e) => (e.parts || []).some((x) => typeof x === 'string' && x.includes('£40 more than the one before')));
  if (!marked) return;
  s.evened = true;
  const n = s.players.length, parts = ['Starting cash evened out (everyone now started with the same): '];
  s.players.forEach((p, i) => {
    const add = 40 * (n - 1 - i);
    if (add <= 0 || p.bankrupt) return;
    p.money += add;
    if (parts.length > 1) parts.push(', ');
    parts.push({ p: p.id }, ' +', { m: add });
  });
  if (parts.length > 1) { parts.push('.'); g.log(parts); }
}
function startAuction(room) {
  if (room.auction) return;
  const g = room.game, sp = speedOf(room);
  const start = Math.max(Date.now(), room.busyUntil);
  room.auction = { deadline: start + sp.auction, span: sp.auction, next: {}, passed: {} };
  for (const p of g.alive()) if (p.bot) room.auction.next[p.id] = start + (700 + Math.random() * 1500) * sp.bot;
  room.timers.auction = setInterval(() => auctionTick(room, g), 200);
}
function stopAuction(room) { clearInterval(room.timers.auction); room.timers.auction = null; room.auction = null; }
function auctionTick(room, g) {
  if (room.game !== g || !g.s.auction || g.s.turn.phase !== 'auction') return stopAuction(room);
  const A = room.auction, now = Date.now(), sp = speedOf(room), a = g.s.auction;
  for (const p of g.alive()) {
    if (!p.bot || A.passed[p.id] || a.bidder === p.id || now < (A.next[p.id] || 0)) continue;
    A.next[p.id] = now + (600 + Math.random() * 1400) * sp.bot;
    const b = Bot.auctionBid(g, p);
    if (b == null) { A.passed[p.id] = true; continue; } // over its limit: the bot drops out
    if (g.bid(p.id, b)) { extendOnLateBid(room); tick(room); return; }
  }
  const stillIn = g.alive().filter((p) => p.id !== a.bidder && !A.passed[p.id] && p.money >= a.high + 10 && !(!p.bot && awayFor(room, p.id) >= 0));
  if (!stillIn.length) A.deadline = Math.min(A.deadline, now + 700);
  if (now >= A.deadline) { stopAuction(room); g.endAuction(); tick(room); }
}

function clearTimers(room) {
  clearTimeout(room.timers.move); clearTimeout(room.timers.bot); clearTimeout(room.timers.turn); clearInterval(room.timers.auction); clearTimeout(room.timers.deferred);
  clearTimeout(room.timers.vote); clearTimeout(room.timers.kick);
  room.timers = { move: null, bot: null, turn: null, auction: null, deferred: null, vote: null, kick: null };
  room.vote = null; room.kickPending = null;
  Object.values(room.tradeTimers).forEach(clearTimeout);
  room.tradeTimers = {};
  room.auction = null; room.turnT = null;
}

// ------------------------------------------------------------ vote to remove a player
// Anyone still in the game can call a vote to remove another player: a bot, or someone who left or isn't playing.
// The players who are connected, still in and not the one being voted on decide; more than half must say yes
// within 30 seconds. If you're the only one who can vote, it passes at once. The removed player's properties
// go back to the bank (or to the player they owe, if they were in debt) and the game carries on.
const VOTE_MS = 30000;
function voteView(room) {
  const V = room.vote;
  return V ? { target: V.target, by: V.by, yes: [...V.yes], no: [...V.no], voters: V.voters, need: V.need, deadline: V.deadline } : null;
}
function startKickVote(room, pid, target) {
  const g = room.game, t = g.player(target);
  if (room.vote) return 'A vote is already running. Wait for it to finish first.';
  if (room.kickPending != null) return 'Someone is already being removed.';
  if (!t || t.bankrupt) return 'That player is already out of the game.';
  if (target === pid) return 'To leave the game yourself, declare bankruptcy instead.';
  const voters = g.s.players.filter((p) => !p.bot && !p.bankrupt && p.id !== target && room.pidClient[p.id] && online(room, room.pidClient[p.id])).map((p) => p.id);
  if (!voters.includes(pid)) voters.push(pid);
  // A person who is here and playing can't be removed by one other player alone.
  if (!t.bot && voters.length < 2 && !awayOrIdle(room, target)) return `${t.name} is still here and playing. You can vote them out once they leave or let their turn time out, or when there's another player to vote with you.`;
  room.vote = { target, by: pid, yes: new Set([pid]), no: new Set(), voters, need: Math.floor(voters.length / 2) + 1, deadline: Date.now() + VOTE_MS };
  if (voters.length > 1) sysChat(room, `${g.player(pid).name} started a vote to remove ${t.name}${t.bot ? ' (a bot)' : ''}.`);
  room.timers.vote = setTimeout(() => endVote(room, false), VOTE_MS);
  return checkVote(room);
}
const awayOrIdle = (room, pid) => room.awaySince[pid] != null || !online(room, room.pidClient[pid]) || !!(room.idle && room.idle[pid]);
function castVote(room, pid, yes) {
  const V = room.vote;
  if (!V) return 'That vote has already finished.';
  if (!V.voters.includes(pid)) return "You can't vote on this one.";
  V.yes.delete(pid); V.no.delete(pid);
  (yes ? V.yes : V.no).add(pid);
  return checkVote(room);
}
function checkVote(room) {
  const V = room.vote;
  if (!V) return null;
  if (V.yes.size >= V.need) endVote(room, true);
  else if (V.voters.length - V.no.size < V.need) endVote(room, false);
  else broadcastRoom(room);
  return null;
}
function endVote(room, passed) {
  const V = room.vote;
  if (!V) return;
  clearTimeout(room.timers.vote); room.timers.vote = null;
  room.vote = null;
  const g = room.game, t = g && g.player(V.target);
  if (!g || g.s.over || !t || t.bankrupt) { broadcastRoom(room); return; }
  if (passed) {
    room.kickPending = V.target;
    sysChat(room, V.voters.length > 1 ? `The vote passed, so ${t.name} is out of the game.` : `${g.player(V.by).name} removed ${t.name} from the game.`);
  } else sysChat(room, `Not enough votes, so ${t.name} stays in the game.`);
  broadcastRoom(room);
  if (passed) automate(room);
}
// Takes the player out once nothing of theirs is mid-move or mid-auction; until then it retries.
function applyKick(room) {
  const g = room.game, pid = room.kickPending, p = g.player(pid);
  if (!p || p.bankrupt) { room.kickPending = null; return false; }
  const ph = g.s.turn.phase;
  if (g.cur.id === pid && (ph === 'moving' || ph === 'auction' || Date.now() < room.busyUntil - 40)) {
    clearTimeout(room.timers.kick);
    room.timers.kick = setTimeout(() => { if (room.game === g) automate(room); }, Math.max(300, room.busyUntil - Date.now() + 80));
    return false;
  }
  room.kickPending = null;
  const owes = g.s.debt && g.s.debt.pid === pid && typeof g.s.debt.to === 'number';
  g.log([{ p: pid }, owes ? ' was removed from the game by a vote.' : ' was removed from the game by a vote. Their properties go back to the bank.']);
  g.declareBankruptcy(pid, true);
  tick(room);
  return true;
}

// ------------------------------------------------------------ player actions
const int = (v) => (Number.isFinite(+v) ? Math.floor(+v) : NaN);
function cleanSide(x) {
  x = x && typeof x === 'object' ? x : {};
  return { money: Math.max(0, int(x.money) || 0), props: Array.isArray(x.props) ? x.props.slice(0, 40).map(int).filter((i) => i >= 0 && i < 40) : [], pardons: Math.max(0, int(x.pardons) || 0) };
}

function handleAction(room, c, msg) {
  const g = room.game;
  if (!g || room.status !== 'playing') return 'The game is not running.';
  const pid = pidOf(room, c.id);
  if (pid == null) return 'You are watching this game.';
  const me = g.player(pid);
  if (me.bankrupt) return 'You are out of this game.';
  const isCur = g.cur.id === pid;
  if (room.idle && msg.a !== 'kick' && msg.a !== 'vote') delete room.idle[pid];
  const settling = Date.now() < room.busyUntil - 300;
  if (settling && isCur && (msg.a === 'roll' || msg.a === 'end')) {
    // Tokens are still moving on screens; run the move as soon as they settle.
    clearTimeout(room.timers.deferred);
    room.timers.deferred = setTimeout(() => {
      room.timers.deferred = null;
      if (room.game === g && !g.s.over) { const err = handleAction(room, c, msg); if (err) sendClient(c, { type: 'error', message: err }); }
    }, room.busyUntil - Date.now() - 280);
    return null;
  }
  const i = int(msg.i);
  let ok = false;
  switch (msg.a) {
    case 'roll': ok = isCur && !settling && g.roll(); break;
    case 'buy': ok = isCur && g.buy(); break;
    case 'decline': ok = isCur && g.decline(); break;
    case 'end': ok = isCur && !settling && g.endTurn(); break;
    case 'bail': ok = isCur && g.payBail(); break;
    case 'pardon': ok = isCur && g.usePardon(); break;
    case 'pay': ok = isCur && g.payDebt(); break;
    case 'bankrupt': ok = g.declareBankruptcy(pid); break;
    case 'build': ok = g.build(pid, i); break;
    case 'sell': ok = g.sellHouse(pid, i); break;
    case 'mortgage': ok = g.mortgage(pid, i); break;
    case 'unmortgage': ok = g.unmortgage(pid, i); break;
    case 'sellprop': ok = g.sellProperty(pid, i); break;
    case 'bid': {
      if (room.auction && room.auction.passed[pid]) return 'You passed on this auction.';
      if (room.auction && Date.now() > room.auction.deadline) return 'Too late: the auction has closed.';
      ok = g.bid(pid, int(msg.amount));
      if (ok) extendOnLateBid(room);
      break;
    }
    case 'autobid': return 'Auto-bid has been replaced: bid with the +£10, +£50 and +£100 buttons.';
    case 'pass': {
      const A = room.auction;
      if (!A || !g.s.auction) return 'There is no auction running.';
      A.passed[pid] = true;
      ok = true; break;
    }
    case 'trade': {
      if (g.cur.id === pid) return 'Trading opens again once your turn is over.';
      const res = g.proposeTrade({ from: pid, to: int(msg.to), give: cleanSide(msg.give), get: cleanSide(msg.get) });
      if (res.error) return res.error;
      ok = true; break;
    }
    case 'accept': { if (g.cur.id === pid) return 'Finish your turn first, then answer the offer.'; const tr = g.findTrade(int(msg.id)); ok = !!tr && tr.to === pid && g.acceptTrade(tr.id); if (!ok && tr && tr.to === pid) { tick(room); return 'That trade is no longer possible.'; } break; }
    case 'reject': { const tr = g.findTrade(int(msg.id)); ok = !!tr && tr.to === pid && g.declineTrade(tr.id); break; }
    case 'withdraw': { const tr = g.findTrade(int(msg.id)); ok = !!tr && tr.from === pid && g.cancelTrade(tr.id); break; }
    case 'kick': return startKickVote(room, pid, int(msg.pid));
    case 'vote': return castVote(room, pid, !!msg.yes);
    default: return 'Unknown action.';
  }
  if (!ok) return "That move isn't available right now.";
  tick(room);
  return null;
}

// ------------------------------------------------------------ messages
function handle(ws, msg) {
  if (!msg || typeof msg.type !== 'string') return;
  if (msg.type === 'hello') {
    const c = getClient(msg.token);
    c.sockets.add(ws);
    ws.client = c;
    const n = cleanName(msg.name); if (n) c.name = n;
    if (COLORS.includes(msg.color)) c.color = msg.color;
    if (msg.avatar !== undefined) c.avatar = cleanAvatar(msg.avatar);
    send(ws, { type: 'welcome', clientId: c.id, token: c.token, build: BUILD });
    const room = rooms.get(c.roomId);
    if (room) { room.members.add(c.id); room.emptySince = null; }
    return;
  }
  const c = ws.client;
  if (!c) return;
  const room = rooms.get(c.roomId);
  const isHost = room && room.hostId === c.id;
  const fail = (message, code) => send(ws, { type: 'error', message, code });

  switch (msg.type) {
    case 'rooms': return send(ws, { type: 'rooms', rooms: listRooms() });
    case 'profile': {
      const n = cleanName(msg.name); if (n) c.name = n;
      if (msg.avatar !== undefined) {
        const a = cleanAvatar(msg.avatar);
        if (msg.avatar && !a) return fail('That photo could not be used. Try another one.');
        if (a !== c.avatar) { c.avatar = a; if (room && room.status !== 'waiting') broadcastRoom(room); }
      }
      if (COLORS.includes(msg.color)) {
        if (room && room.status === 'waiting' && room.seats.some((s) => s.color === msg.color && s.clientId !== c.id)) return fail('Someone else already has that colour.');
        c.color = msg.color;
      }
      if (room && room.status === 'waiting') {
        const i = seatOf(room, c.id);
        if (i >= 0) { room.seats[i].name = c.name || room.seats[i].name; room.seats[i].color = c.color; }
        broadcastRoom(room);
      }
      return;
    }
    case 'create': {
      if (rooms.size >= MAX_ROOMS) return fail('The server is full right now. Try again in a few minutes.');
      const n = cleanName(msg.name); if (n) c.name = n;
      const r = createRoom(c, !!msg.private);
      joinRoom(c, r);
      takeSeat(r, c);
      return broadcastRoom(r);
    }
    case 'quick': {
      const n = cleanName(msg.name); if (n) c.name = n;
      const open = [...rooms.values()].filter((r) => r.status === 'waiting' && !r.settings.private && r.seats.length < r.settings.maxPlayers && members(r).some((m) => m.sockets.size))
        .sort((a, b) => b.seats.length - a.seats.length)[0];
      const r = open || (rooms.size < MAX_ROOMS ? createRoom(c, false) : null);
      if (!r) return fail('The server is full right now. Try again in a few minutes.');
      joinRoom(c, r);
      if (takeSeat(r, c) && open) sysChat(r, `${c.name || 'A player'} took a seat.`);
      return broadcastRoom(r);
    }
    case 'join': {
      const r = rooms.get(String(msg.room || '').toLowerCase());
      if (!r) return fail('That room no longer exists. It may have closed after everyone left.', 'noroom');
      return joinRoom(c, r);
    }
    case 'leave': if (room) leaveRoom(c); return send(ws, { type: 'left' });
    case 'restore': { const err = requestRestore(c, msg.data, msg.sig); if (err) fail(err, 'norestore'); return; }
    case 'chat': {
      if (!room) return;
      const text = String(msg.text || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 280);
      if (!text) return;
      const i = seatOf(room, c.id);
      const m = { t: Date.now(), from: c.id, name: c.name || 'Guest', color: i >= 0 ? room.seats[i].color : '#8E99B8', text };
      room.chat.push(m);
      if (room.chat.length > 80) room.chat.splice(0, room.chat.length - 80);
      for (const mbr of members(room)) sendClient(mbr, { type: 'chat', msg: m });
      return;
    }
  }

  if (!room) return fail('Join a room first.');
  switch (msg.type) {
    case 'seat':
      if (room.status !== 'waiting') return fail('The game has already started. You can watch.');
      { const n = cleanName(msg.name); if (n) c.name = n; }
      if (COLORS.includes(msg.color)) c.color = msg.color;
      if (!takeSeat(room, c)) return fail('There are no free seats.');
      c.watchOnly = null;
      sysChat(room, `${c.name || 'A player'} took a seat.`);
      return broadcastRoom(room);
    case 'rejoin': {
      // Someone on a new device (no saved seat) takes back a player's seat while that player is offline.
      const i = int(msg.seat), s = room.seats[i];
      if (!s || s.bot) return fail('That seat is not a player.');
      if (seatOf(room, c.id) >= 0 || pidOf(room, c.id) != null) return fail('You already have a seat in this game.');
      const old = room.game ? room.pidClient[i] : s.clientId;
      const gamePlayer = room.game ? room.game.s.players.find((p) => p.id === i) : null;
      if (gamePlayer && gamePlayer.bankrupt) return fail(`${s.name} is out of the game.`);
      if (online(room, old)) return fail(`${s.name} is still connected on another device. Close the game there first, then try again.`);
      s.clientId = c.id;
      delete s.key;
      c.color = s.color;
      if (!c.name) c.name = s.name;
      if (room.game) {
        room.pidClient[i] = c.id;
        delete room.awaySince[i];
        if (room.idle) delete room.idle[i];
      }
      if (room.hostId === old) room.hostId = c.id;
      sysChat(room, `${s.name} is back, on another device.`);
      broadcastRoom(room);
      if (room.game) { for (const m of members(room)) sendGame(room, m, []); automate(room); tick(room); }
      return;
    }
    case 'unseat': {
      if (room.status !== 'waiting') return;
      const i = seatOf(room, c.id);
      if (i >= 0) room.seats.splice(i, 1);
      c.watchOnly = room.id; // stay unseated, even after a reconnect, until they take a seat again
      return broadcastRoom(room);
    }
    case 'addBot':
      if (!isHost || room.status !== 'waiting') return fail('Only the host can add bots.');
      if (room.seats.length >= room.settings.maxPlayers) return fail('All seats are taken. Raise the player limit first.');
      room.seats.push({ clientId: null, bot: true, color: freeColor(room), name: BOT_NAMES.find((n) => !room.seats.some((s) => s.name === n)) || 'Bot' });
      return broadcastRoom(room);
    case 'kick': {
      if (!isHost || room.status !== 'waiting') return;
      const i = int(msg.seat), s = room.seats[i];
      if (!s || (!s.bot && s.clientId === c.id)) return;
      room.seats.splice(i, 1);
      if (!s.bot) { const k = clientsById.get(s.clientId); if (k) sendClient(k, { type: 'error', message: 'The host gave your seat away. You can still watch or take another seat.' }); }
      return broadcastRoom(room);
    }
    case 'setting': {
      if (!isHost || room.status !== 'waiting') return fail('Only the host can change the rules.');
      const k = String(msg.key);
      if (BOOL_SETTINGS.includes(k)) room.settings[k] = !!msg.value;
      else if (SETTING_RULES[k]) {
        const allowed = SETTING_RULES[k];
        const v = typeof allowed[0] === 'number' ? int(msg.value) : String(msg.value);
        if (!allowed.includes(v)) return;
        if (k === 'maxPlayers' && v < room.seats.length) return fail(`${room.seats.length} seats are already taken.`);
        room.settings[k] = v;
      } else return;
      return broadcastRoom(room);
    }
    case 'start':
      if (!isHost) return fail('Only the host can start the game.');
      if (room.status !== 'waiting') return;
      // starting on your own fills the table with bots, up to 4 players
      if (room.seats.length < 2) {
        while (room.seats.length < Math.min(4, room.settings.maxPlayers)) room.seats.push({ clientId: null, bot: true, color: freeColor(room), name: BOT_NAMES.find((n) => !room.seats.some((x) => x.name === n)) || 'Bot' });
      }
      if (room.seats.length < 2) return fail('You need at least two players. Add a bot or share the link.');
      return startGame(room);
    case 'restart':
      if (!isHost || room.status !== 'over') return;
      clearTimers(room);
      room.game = null; room.status = 'waiting'; room.pidClient = []; room.awaySince = {};
      room.seats = room.seats.filter((s) => s.bot || room.members.has(s.clientId));
      sysChat(room, 'Back in the lobby. The host can start a new game.');
      return broadcastRoom(room);
    case 'action': {
      const err = handleAction(room, c, msg);
      if (err) fail(err);
      return;
    }
  }
}

// ------------------------------------------------------------ sockets
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 256 * 1024 }); // room copies sent back after a restart can be large
wss.on('connection', (ws) => {
  ws.client = null;
  ws.isAlive = true;
  ws.bucket = { start: Date.now(), n: 0 };
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (data) => {
    const b = ws.bucket, now = Date.now();
    if (now - b.start > 5000) { b.start = now; b.n = 0; }
    if (++b.n > 60) return;
    let msg;
    try { msg = JSON.parse(data); } catch (e) { return; }
    try { handle(ws, msg); } catch (e) { console.error(e); send(ws, { type: 'error', message: 'Something went wrong on the server.' }); }
  });
  ws.on('close', () => {
    const c = ws.client;
    if (!c) return;
    c.sockets.delete(ws);
    if (c.sockets.size) return;
    const room = rooms.get(c.roomId);
    if (!room) return;
    const pid = pidOf(room, c.id);
    if (pid != null && room.status === 'playing' && !room.awaySince[pid]) {
      room.awaySince[pid] = Date.now();
      sysChat(room, `${c.name || 'A player'} disconnected. A bot plays their turns if they're not back in ${AWAY_GRACE / 1000} seconds.`);
    }
    passHost(room);
    if (!members(room).some((m) => m.sockets.size)) room.emptySince = Date.now();
    broadcastRoom(room);
    if (room.game) { automate(room); tick(room); }
  });
});

setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);

// Close rooms nobody is connected to.
setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (members(room).some((m) => m.sockets.size)) { room.emptySince = null; continue; }
    if (!room.emptySince) room.emptySince = now;
    const limit = room.status === 'playing' ? 30 * 60000 : 5 * 60000;
    if (now - room.emptySince > limit) {
      clearTimers(room);
      for (const m of members(room)) if (m.roomId === room.id) m.roomId = null;
      rooms.delete(room.id);
    }
  }
  for (const c of clientsById.values()) {
    if (!c.sockets.size && !c.roomId) { clientsById.delete(c.id); clientsByToken.delete(c.token); }
  }
}, 60000);

server.listen(PORT, () => console.log(`PoorDown is running on http://localhost:${PORT}`));

// Before an update shuts this server down, hand every player the latest copy of their room and tell them.
let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  for (const room of rooms.values()) {
    if (room.status === 'over') continue;
    sendSnapshot(room);
    for (const c of members(room)) sendClient(c, { type: 'notice', message: 'The server is updating. Your game will carry on in a moment.' });
  }
  setTimeout(() => process.exit(0), 700);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
