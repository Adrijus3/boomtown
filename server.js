'use strict';
/* Boomtown online server: static files + WebSocket rooms. The server runs the rules engine for every
   room, so clients only send intentions ("roll", "bid 120") and receive the authoritative state. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const { Game, Bot, DEFAULT_SETTINGS } = require('./public/engine.js');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC = path.join(__dirname, 'public');
const AWAY_GRACE = 15000; // ms before a disconnected player's turn is played on autopilot
const MAX_ROOMS = 500;

// Must match the client's animation timings so the server waits while tokens move.
const SPEED = {
  relaxed: { step: 150, dice: 1300, bot: 1.5, card: 500, jump: 560, auction: 10000 },
  normal: { step: 110, dice: 1050, bot: 1, card: 350, jump: 480, auction: 8000 },
  fast: { step: 65, dice: 700, bot: 0.45, card: 220, jump: 380, auction: 5500 },
};
const COLORS = ['#F5B83D', '#FF7A59', '#F062A5', '#A78BFA', '#4FB3FF', '#2CC7B0', '#9BD34B', '#E3E8F4'];
const BOT_NAMES = ['Baroness Bly', 'Otto Vance', 'Mila Sterling', 'Rex Holloway', 'Juno Park', 'Kit Marlowe', 'Nova Reyes', 'Ivo Brandt', 'Zara Quill', 'Felix Dune', 'Opal Grant', 'Hugo Lake'];

const SETTING_RULES = {
  maxPlayers: [2, 3, 4, 5, 6, 7, 8],
  startingCash: [1000, 1500, 2000, 2500, 3000],
  salary: [100, 200, 300, 400],
  bail: [50, 100, 150],
  roundLimit: [0, 10, 15, 20, 30, 50],
  turnTimer: [0, 60, 120, 180, 300],
  botSpeed: ['relaxed', 'normal', 'fast'],
};
const BOOL_SETTINGS = ['private', 'doubleOnStart', 'vacationCash', 'auctions', 'doubleRentSet', 'mortgages', 'evenBuild', 'limitedBuildings', 'noRentInPrison', 'randomOrder'];
const ROOM_DEFAULTS = Object.assign({}, DEFAULT_SETTINGS, { maxPlayers: 4, private: false, turnTimer: 180 });
const ENGINE_KEYS = Object.keys(DEFAULT_SETTINGS);

// ------------------------------------------------------------ static files
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };
const server = http.createServer((req, res) => {
  let p;
  try { p = decodeURIComponent(new URL(req.url, 'http://local').pathname); } catch (e) { res.writeHead(400); return res.end(); }
  if (p === '/healthz') { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end('ok'); }
  if (p === '/' || /^\/room\/[a-z0-9]{3,12}\/?$/i.test(p)) p = '/index.html';
  const file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(404); return res.end('Not found'); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('Not found'); }
    res.writeHead(200, {
      'content-type': TYPES[path.extname(file)] || 'application/octet-stream',
      'cache-control': p === '/index.html' ? 'no-cache' : 'public, max-age=300',
      'x-content-type-options': 'nosniff',
    });
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
    name: '', color: COLORS[0], sockets: new Set(), roomId: null,
  };
  clientsByToken.set(c.token, c);
  clientsById.set(c.id, c);
  return c;
}
const cleanName = (s) => String(s || '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 18);
const send = (ws, msg) => { if (ws.readyState === 1) ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg)); };
function sendClient(c, msg) { const str = typeof msg === 'string' ? msg : JSON.stringify(msg); for (const ws of c.sockets) send(ws, str); }
const online = (room, clientId) => { const c = clientsById.get(clientId); return !!c && c.sockets.size > 0 && c.roomId === room.id; };
const members = (room) => [...room.members].map((id) => clientsById.get(id)).filter(Boolean);

// ------------------------------------------------------------ rooms
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
    seats: room.seats.map((s) => ({ name: s.name, color: s.color, bot: !!s.bot, clientId: s.bot ? null : s.clientId, online: s.bot || online(room, s.clientId) })),
    watchers: members(room).filter((c) => seatOf(room, c.id) < 0).length,
    chat: room.chat.slice(-60),
  };
}
function broadcastRoom(room) {
  const view = JSON.stringify({ type: 'room', room: roomView(room) });
  for (const c of members(room)) sendClient(c, view);
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
  const pid = pidOf(room, c.id);
  if (pid != null && room.awaySince[pid]) { delete room.awaySince[pid]; if (room.game) sysChat(room, `${c.name || 'A player'} is back.`); }
  if (fresh && room.status !== 'waiting' && pid == null && c.name) sysChat(room, `${c.name} is watching.`);
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
}

function sendGame(room, c, events, stateStr, evStr) {
  const g = room.game;
  if (!g) return;
  stateStr = stateStr || JSON.stringify(Object.assign({}, g.s, { log: g.s.log.slice(-150) }));
  evStr = evStr || JSON.stringify(events || []);
  const meta = {
    now: Date.now(),
    me: pidOf(room, c.id),
    auction: room.auction ? (() => { const me = pidOf(room, c.id); return { deadline: room.auction.deadline, span: room.auction.span, proxy: me != null ? room.auction.proxy[me] || 0 : 0, passed: me != null && !!room.auction.passed[me] }; })() : null,
    turn: timerMeta(room),
    away: Object.keys(room.awaySince).map(Number),
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
    if (tr.status !== 'pending' || !g.player(tr.to).bot || room.tradeTimers[tr.id]) continue;
    room.tradeTimers[tr.id] = setTimeout(() => {
      delete room.tradeTimers[tr.id];
      if (room.game !== g) return;
      const t = g.findTrade(tr.id);
      if (!t || t.status !== 'pending') return;
      if (Bot.evaluateTrade(g, t)) g.acceptTrade(t.id); else g.declineTrade(t.id);
      tick(room);
    }, 1500 * sp.bot + 400);
  }

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
      else Bot.act(g, p.bot ? undefined : { force: true, autopilot: true });
      tick(room);
    }, wait + base * sp.bot + extra);
    return;
  }
}

// One clock per whole turn, doubles included. Time is banked on every state change and the clock pauses
// while dice roll, tokens move and auctions run. When it runs out, the rest of the turn plays itself.
const turnKey = (room) => `${room.gid}:${room.game.s.turn.n}`;
function timerMeta(room) {
  const TT = room.turnT;
  if (!TT) return null;
  return { total: TT.total, left: Math.max(0, Math.round(TT.left)), deadline: TT.runningSince != null ? TT.runningSince + TT.left : null, expired: TT.expired };
}
function sendTimer(room) {
  const msg = JSON.stringify({ type: 'timer', now: Date.now(), turn: timerMeta(room) });
  for (const c of members(room)) sendClient(c, msg);
}
function turnTimer(room) {
  const g = room.game, T = room.settings.turnTimer, p = g.cur, t = g.s.turn, now = Date.now();
  clearTimeout(room.timers.turn); room.timers.turn = null;
  if (!T || p.bot || g.s.over) { room.turnT = null; return; }
  const key = turnKey(room);
  if (!room.turnT || room.turnT.key !== key) room.turnT = { key, pid: p.id, total: T * 1000, left: T * 1000, runningSince: null, expired: false };
  const TT = room.turnT;
  if (TT.runningSince != null) { TT.left = Math.max(0, TT.left - (now - TT.runningSince)); TT.runningSince = null; }
  if (TT.expired) return;
  if (TT.left <= 0) {
    TT.expired = true;
    sysChat(room, `Time's up for ${p.name}. Their turn is being finished for them.`);
    return;
  }
  if (t.phase === 'moving' || t.phase === 'auction') return; // resumes on the next state change
  const later = () => {
    if (room.game !== g || g.s.over) return;
    const was = room.turnT && room.turnT.expired;
    turnTimer(room);
    if (room.turnT && room.turnT.expired && !was) tick(room); else sendTimer(room);
  };
  if (now < room.busyUntil) { room.timers.turn = setTimeout(later, room.busyUntil - now + 20); return; }
  TT.runningSince = now;
  room.timers.turn = setTimeout(later, TT.left + 20);
}

function startAuction(room) {
  if (room.auction) return;
  const g = room.game, sp = speedOf(room);
  const start = Math.max(Date.now(), room.busyUntil);
  room.auction = { deadline: start + sp.auction, span: sp.auction, next: {}, proxy: {}, passed: {} };
  for (const p of g.alive()) if (p.bot) room.auction.next[p.id] = start + (700 + Math.random() * 1500) * sp.bot;
  room.timers.auction = setInterval(() => auctionTick(room, g), 200);
}
function extendAuction(room) {
  const A = room.auction; if (!A) return;
  const n = Date.now();
  A.deadline = Math.max(A.deadline, n + 4200);
  A.span = A.deadline - n;
}
function stopAuction(room) { clearInterval(room.timers.auction); room.timers.auction = null; room.auction = null; }
function auctionTick(room, g) {
  if (room.game !== g || !g.s.auction || g.s.turn.phase !== 'auction') return stopAuction(room);
  const A = room.auction, now = Date.now(), sp = speedOf(room);
  // Auto-bids react first: raise by the minimum whenever their owner is outbid, up to the cap.
  for (const k of Object.keys(A.proxy)) {
    const p = g.player(+k), cap = A.proxy[k], a = g.s.auction;
    if (!p || p.bankrupt || A.passed[k] || a.bidder === p.id) continue;
    const next = Math.max(10, a.high + 10);
    if (next > cap || next > p.money) { delete A.proxy[k]; tick(room); return; }
    if (g.bid(p.id, next)) { extendAuction(room); tick(room); return; }
  }
  const humans = g.alive().filter((p) => !p.bot);
  if (humans.length && humans.every((p) => A.passed[p.id] || A.proxy[p.id] || awayFor(room, p.id) >= 0)) A.deadline = Math.min(A.deadline, now + 2500);
  for (const p of g.alive()) {
    if (!p.bot || now < (A.next[p.id] || 0)) continue;
    A.next[p.id] = now + (600 + Math.random() * 1400) * sp.bot;
    const b = Bot.auctionBid(g, p);
    if (b != null && g.bid(p.id, b)) { extendAuction(room); tick(room); return; }
  }
  if (now >= A.deadline) { stopAuction(room); g.endAuction(); tick(room); }
}

function clearTimers(room) {
  clearTimeout(room.timers.move); clearTimeout(room.timers.bot); clearTimeout(room.timers.turn); clearInterval(room.timers.auction); clearTimeout(room.timers.deferred);
  room.timers = { move: null, bot: null, turn: null, auction: null, deferred: null };
  Object.values(room.tradeTimers).forEach(clearTimeout);
  room.tradeTimers = {};
  room.auction = null; room.turnT = null;
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
    case 'bid': ok = g.bid(pid, int(msg.amount)); if (ok) { extendAuction(room); if (room.auction) delete room.auction.passed[pid]; } break;
    case 'autobid': {
      const A = room.auction;
      if (!A || !g.s.auction) return 'There is no auction running.';
      const amt = int(msg.amount);
      if (amt > 0) { A.proxy[pid] = Math.min(amt, me.money); delete A.passed[pid]; } else delete A.proxy[pid];
      ok = true; break;
    }
    case 'pass': {
      const A = room.auction;
      if (!A || !g.s.auction) return 'There is no auction running.';
      A.passed[pid] = true; delete A.proxy[pid];
      ok = true; break;
    }
    case 'trade': {
      const res = g.proposeTrade({ from: pid, to: int(msg.to), give: cleanSide(msg.give), get: cleanSide(msg.get) });
      if (res.error) return res.error;
      ok = true; break;
    }
    case 'accept': { const tr = g.findTrade(int(msg.id)); ok = !!tr && tr.to === pid && g.acceptTrade(tr.id); if (!ok && tr && tr.to === pid) { tick(room); return 'That trade is no longer possible.'; } break; }
    case 'reject': { const tr = g.findTrade(int(msg.id)); ok = !!tr && tr.to === pid && g.declineTrade(tr.id); break; }
    case 'withdraw': { const tr = g.findTrade(int(msg.id)); ok = !!tr && tr.from === pid && g.cancelTrade(tr.id); break; }
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
    send(ws, { type: 'welcome', clientId: c.id, token: c.token });
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
      sysChat(room, `${c.name || 'A player'} took a seat.`);
      return broadcastRoom(room);
    case 'unseat': {
      if (room.status !== 'waiting') return;
      const i = seatOf(room, c.id);
      if (i >= 0) room.seats.splice(i, 1);
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
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 32 * 1024 });
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

server.listen(PORT, () => console.log(`Boomtown is running on http://localhost:${PORT}`));
