'use strict';
/* UnOfficial multiplayer rooms.

   The server runs every game; browsers only send intentions ("play c42 as blue", "draw") and get back a view
   of the table with just their own hand in it. Each change is sent with a small event ("Mara played …",
   "you drew 2") so the browser can animate it, and the server waits for those animations before the next
   automatic move, so everyone sees the same table at the same pace.

   Like PoorDown, a room has a host who picks the table size (2–8 seats) and the house rules, fills empty
   seats with Easy or Strategic bots, and deals. Public rooms are listed for everyone; private ones are reached
   by link or code. If a classmate's connection drops, a bot plays their turns until they come back, and the
   same happens when a player lets their turn clock run out. Rooms live in memory: a server restart ends the
   hands in progress. */

const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const E = require('./engine.js');

const MAX_SEATS = 8;
const MAX_ROOMS = 300;
// What a host can change. The first value of each list is the default.
const DEFAULT_SETTINGS = {
  maxSeats: 4, handSize: 7, stacking: true, drawToMatch: false, unoPenalty: 2, wild4Strict: false, sevenZero: false,
  turnClock: 30, speed: 'normal', private: false,
};
const CHOICES = { maxSeats: [2, 3, 4, 5, 6, 7, 8], handSize: [5, 7, 10], unoPenalty: [0, 2, 4], turnClock: [0, 15, 30, 60] };
const SWITCHES = ['stacking', 'drawToMatch', 'wild4Strict', 'sevenZero', 'private'];
const BOT_NAMES = ['Mara', 'Theo', 'Juno', 'Ivo', 'Pia', 'Otto', 'Nell', 'Rafe'];
const SPEED = { normal: { anim: 1, think: 720 }, fast: { anim: 1 / 1.5, think: 420 }, turbo: { anim: 0.5, think: 140 } };
const AWAY_MS = 5000; // a disconnected player's turn is played by a bot after this
const EXPOSE_REACT_MS = 1100; // after a missed call, bots hold their move so a classmate can still catch it
const SLACK = 90; // network jitter on top of the browser's animation time

// Browser animation times at normal speed (ms). The server waits this long before the next automatic move.
const ANIM = {
  deal: (n, hand) => hand * n * 45 + 220 + 260 + 120,
  play: 320,
  draw: (k) => 270 + Math.max(0, k - 1) * 75,
  turn: 60,
};

const rid = (n) => crypto.randomBytes(16).toString('base64').replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, n);
const rand = (lo, hi) => lo + Math.random() * (hi - lo);
const cleanName = (s) => String(s || '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 18);
const send = (ws, msg) => { if (ws.readyState === 1) ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg)); };

function createUnofficial({ build = '', isTaken = () => false } = {}) {
  const clients = new Map(); // token -> client
  const rooms = new Map();

  // ── clients ──────────────────────────────────────────────────────────────
  function getClient(token) {
    if (typeof token === 'string' && /^[a-z0-9]{16,64}$/i.test(token) && clients.has(token)) return clients.get(token);
    const c = { id: rid(10), token: typeof token === 'string' && /^[a-z0-9]{16,64}$/i.test(token) ? token : rid(24) + rid(8), name: '', sockets: new Set(), roomId: null, idleSince: null };
    clients.set(c.token, c);
    return c;
  }
  const sendClient = (c, msg) => { const str = typeof msg === 'string' ? msg : JSON.stringify(msg); for (const ws of c.sockets) send(ws, str); };
  const clientById = (id) => { for (const c of clients.values()) if (c.id === id) return c; return null; };
  const isOnline = (room, seat) => { if (seat.bot) return true; const c = clientById(seat.clientId); return !!c && c.sockets.size > 0 && c.roomId === room.id && !seat.left; };
  const members = (room) => [...room.members].map(clientById).filter(Boolean);

  // ── rooms ────────────────────────────────────────────────────────────────
  function createRoom(host, settings) {
    let id;
    do { id = rid(5); } while (id.length < 5 || rooms.has(id) || isTaken(id));
    const room = {
      id, hostId: host.id, status: 'waiting', settings: Object.assign({}, DEFAULT_SETTINGS),
      seats: [], members: new Set(), game: null, gameSeats: [], scores: {}, hands: 0,
      busyUntil: 0, timers: new Set(), stepTimer: null, turnKey: -1, turnStartedAt: 0, thinkAt: 0, drawnAt: 0,
      seq: 0, emptySince: null,
    };
    applySettings(room, settings);
    rooms.set(id, room);
    return room;
  }
  /** Only known settings with allowed values get through. Rule changes during a hand apply from the next deal. */
  function applySettings(room, s) {
    if (!s || typeof s !== 'object') return;
    for (const [k, list] of Object.entries(CHOICES)) if (list.includes(Number(s[k]))) room.settings[k] = Number(s[k]);
    for (const k of SWITCHES) if (typeof s[k] === 'boolean') room.settings[k] = s[k];
    if (SPEED[s.speed]) room.settings.speed = s.speed;
    // Fewer seats than people sitting down: drop bots from the end (never in the middle of their hand).
    while (room.seats.length > room.settings.maxSeats) {
      let i = -1;
      for (let j = room.seats.length - 1; j >= 0; j--) if (room.seats[j].bot && !(room.status === 'playing' && room.gameSeats.includes(room.seats[j]))) { i = j; break; }
      if (i < 0) { room.settings.maxSeats = room.seats.length; break; }
      room.seats.splice(i, 1);
    }
  }
  const maxSeats = (room) => room.settings.maxSeats;
  const later = (room, fn, ms) => { const t = setTimeout(() => { room.timers.delete(t); fn(); }, Math.max(0, ms)); room.timers.add(t); return t; };
  function clearTimers(room) { for (const t of room.timers) clearTimeout(t); room.timers.clear(); clearTimeout(room.stepTimer); room.stepTimer = null; }
  const speedOf = (room) => SPEED[room.settings.speed] || SPEED.normal;
  const seatIndex = (room, clientId) => room.seats.findIndex((x) => !x.bot && x.clientId === clientId);
  const playerIndex = (room, clientId) => (room.game ? room.gameSeats.findIndex((x) => !x.bot && x.clientId === clientId) : -1);
  const freeBotName = (room) => BOT_NAMES.find((nm) => !room.seats.some((x) => x.name === nm)) || 'Bot';

  function addBot(room, difficulty) {
    if (room.seats.length >= maxSeats(room)) return false;
    room.seats.push({ id: rid(8), bot: true, difficulty: difficulty === 'easy' ? 'easy' : 'strategic', name: freeBotName(room), clientId: null });
    return true;
  }
  function takeSeat(room, c) {
    if (seatIndex(room, c.id) >= 0) return true;
    if (room.seats.length >= maxSeats(room)) return false;
    room.seats.push({ id: rid(8), bot: false, clientId: c.id, name: c.name || 'Player', difficulty: 'easy' });
    return true;
  }
  function passHost(room) {
    const host = clientById(room.hostId);
    if (host && host.sockets.size && host.roomId === room.id) return;
    const next = room.seats.find((x) => !x.bot && !x.left && isOnline(room, x));
    if (next) room.hostId = next.clientId;
  }

  function roomView(room, c) {
    return {
      id: room.id, status: room.status, settings: room.settings, hands: room.hands, max: maxSeats(room),
      host: room.hostId === c.id, hostName: (room.seats.find((x) => x.clientId === room.hostId) || {}).name || '',
      seated: seatIndex(room, c.id) >= 0,
      seats: room.seats.map((x) => ({
        id: x.id, name: x.name, bot: x.bot, difficulty: x.bot ? x.difficulty : null, you: !x.bot && x.clientId === c.id,
        host: !x.bot && x.clientId === room.hostId, online: isOnline(room, x),
        inHand: room.status === 'playing' ? room.gameSeats.includes(x) : true, score: room.scores[x.id] || 0,
      })),
    };
  }
  function broadcastRoom(room) { for (const c of members(room)) sendClient(c, { type: 'room', room: roomView(room, c) }); }
  /** Public rooms with someone in them, waiting rooms first. */
  function listRooms() {
    return [...rooms.values()]
      .filter((r) => !r.settings.private && members(r).some((m) => m.sockets.size))
      .sort((a, b) => (a.status === 'waiting' ? 0 : 1) - (b.status === 'waiting' ? 0 : 1) || b.seats.length - a.seats.length)
      .slice(0, 30)
      .map((r) => ({
        id: r.id, host: (r.seats.find((x) => x.clientId === r.hostId) || {}).name || '', status: r.status,
        players: r.seats.length, max: maxSeats(r), bots: r.seats.filter((x) => x.bot).length,
      }));
  }

  // ── game views ───────────────────────────────────────────────────────────
  function autopilot(room, i, now) {
    const seat = room.gameSeats[i];
    if (seat.bot) return seat.difficulty;
    if (seat.left) return 'easy';
    if (!isOnline(room, seat) && now - Math.max(room.turnStartedAt, seat.offlineSince || 0) >= AWAY_MS) return 'easy';
    const clock = room.settings.turnClock * 1000;
    if (clock && now - room.turnStartedAt >= clock) return 'easy';
    return null;
  }
  function gameView(room, c) {
    const s = room.game;
    const you = playerIndex(room, c.id);
    const now = Date.now();
    const cur = s.players[s.current];
    const humanTurn = s.phase === 'TURN' && cur && cur.isHuman && !room.gameSeats[s.current].left;
    return {
      you, phase: s.phase, current: s.current, direction: s.direction, currentColor: s.currentColor,
      pendingDraw: s.pendingDraw, pendingType: s.pendingType, hasDrawn: s.hasDrawn,
      drawnCardId: you === s.current ? s.drawnCardId : null, turnKey: s.turnKey, rules: s.rules, speed: room.settings.speed,
      drawCount: s.drawPile.length, discard: s.discard.slice(-6), winner: s.winner, roundPoints: s.roundPoints,
      players: s.players.map((p, i) => {
        const seat = room.gameSeats[i];
        return {
          name: seat.name, bot: seat.bot, difficulty: seat.bot ? seat.difficulty : null, count: p.hand.length,
          uno: p.uno, unoLeft: p.uno === 'grace' ? Math.max(0, p.unoDeadline - now) : 0, armed: i === you && p.armed,
          online: isOnline(room, seat), score: room.scores[seat.id] || 0,
        };
      }),
      hand: you >= 0 ? s.players[you].hand : [],
      reveal: s.phase === 'GAME_OVER' ? s.players.map((p) => p.hand) : null,
      turnLeft: humanTurn && room.settings.turnClock ? Math.max(0, room.settings.turnClock * 1000 - (now - room.turnStartedAt)) : 0,
    };
  }
  /** Send everyone the new table. `ev` describes what just happened; drawn cards are only shown to the drawer. */
  function broadcastGame(room, ev) {
    room.seq += 1;
    for (const c of members(room)) {
      let e = ev;
      if (ev && ev.kind === 'draw') {
        const mine = playerIndex(room, c.id) === ev.player;
        e = Object.assign({}, ev, { cards: mine ? ev.cards : undefined });
      }
      sendClient(c, { type: 'game', seq: room.seq, view: gameView(room, c), ev: e || { kind: 'sync' } });
    }
  }

  // ── the game loop ────────────────────────────────────────────────────────
  function busy(room, ms) { room.busyUntil = Math.max(room.busyUntil, Date.now() + ms * speedOf(room).anim + SLACK); }
  function schedule(room, ms) {
    clearTimeout(room.stepTimer);
    room.stepTimer = setTimeout(() => { room.stepTimer = null; step(room); }, Math.max(0, ms));
  }
  const anyoneHere = (room) => room.gameSeats.some((x) => !x.bot && isOnline(room, x));
  function apply(room, action) {
    const before = room.game;
    room.game = E.gameReducer(before, action);
    return room.game !== before;
  }
  function unoBlocking(room, now) {
    return room.game.players.some((p) => p.uno === 'grace' || p.uno === 'caught' || (p.uno === 'exposed' && now - p.exposedAt < EXPOSE_REACT_MS));
  }

  function deal(room) {
    clearTimers(room);
    room.seats = room.seats.filter((x) => !x.left);
    if (room.seats.length < 2) { room.status = 'waiting'; room.game = null; broadcastRoom(room); return false; }
    room.gameSeats = room.seats.slice();
    room.status = 'playing';
    const n = room.gameSeats.length;
    const starter = Math.floor(Math.random() * n);
    const st = room.settings;
    const hand = n > 6 && st.handSize > 7 ? 7 : st.handSize; // 108 cards don't stretch to 10 each for 7–8 players
    let s = E.createGame({
      players: room.gameSeats.map((x) => ({ name: x.name, isHuman: !x.bot, difficulty: x.difficulty })),
      deck: E.shuffle(E.buildDeck()), starter,
      rules: { stacking: st.stacking, drawToMatch: st.drawToMatch, unoPenalty: st.unoPenalty, wild4Strict: st.wild4Strict, sevenZero: st.sevenZero },
    });
    const order = [];
    for (let r = 0; r < hand; r++) for (let k = 0; k < n; k++) { const pi = (starter + k) % n; s = E.gameReducer(s, { type: 'DRAW_ONE', player: pi }); order.push(pi); }
    s = E.gameReducer(s, { type: 'FLIP_START', rot: Math.round(rand(-10, 10)) });
    room.game = s;
    room.turnKey = -1;
    room.busyUntil = 0;
    busy(room, ANIM.deal(n, hand));
    broadcastRoom(room);
    broadcastGame(room, { kind: 'deal', order, starter });
    schedule(room, room.busyUntil - Date.now());
    return true;
  }

  /** Decide the next automatic move. Called after every change and on timers; it does nothing while cards are still flying. */
  function step(room) {
    const s = room.game;
    if (!s || room.status !== 'playing' || rooms.get(room.id) !== room) return;
    const now = Date.now();
    if (now < room.busyUntil) return schedule(room, room.busyUntil - now);
    if (!anyoneHere(room)) return; // everyone has gone: wait for someone to come back
    if (s.phase === 'DEAL' || s.phase === 'TRANSITION') {
      apply(room, { type: 'BEGIN_TURN' });
      // The turn clock starts now, so every browser shows the same countdown.
      room.turnKey = room.game.turnKey; room.turnStartedAt = now; room.thinkAt = 0; room.drawnAt = 0;
      busy(room, ANIM.turn);
      broadcastGame(room, { kind: 'turn', player: room.game.current });
      return schedule(room, room.busyUntil - Date.now());
    }
    if (s.phase !== 'TURN') return;
    const pi = s.current;
    if (room.turnKey !== s.turnKey) { room.turnKey = s.turnKey; room.turnStartedAt = now; room.thinkAt = 0; room.drawnAt = 0; }
    const diff = autopilot(room, pi, now);

    if (diff) {
      if (unoBlocking(room, now)) return schedule(room, 120);
      if (!room.thinkAt) room.thinkAt = now + speedOf(room).think * rand(0.75, 1.25);
      if (now < room.thinkAt) return schedule(room, room.thinkAt - now);
      return botMove(room, pi, diff);
    }
    // A classmate is in control. The only move made for them is passing after a drawn card that doesn't fit.
    if (s.hasDrawn && s.pendingDraw === 0) {
      const drawn = s.players[pi].hand.find((c) => c.id === s.drawnCardId);
      if (!drawn || !E.isPlayable(drawn, s, s.players[pi].hand)) {
        const at = room.drawnAt + 450 * speedOf(room).anim;
        if (now < at) return schedule(room, at - now);
        return pass(room, pi);
      }
    }
    // Otherwise wake up when the turn clock runs out, or when a disconnected player's grace ends.
    const seat = room.gameSeats[pi];
    let wake = room.settings.turnClock ? room.turnStartedAt + room.settings.turnClock * 1000 - now : 60000;
    if (!isOnline(room, seat)) wake = Math.min(wake, Math.max(room.turnStartedAt, seat.offlineSince || 0) + AWAY_MS - now);
    schedule(room, Math.max(50, wake + 5));
  }

  function botMove(room, pi, diff) {
    const s = room.game;
    if (s.pendingDraw > 0) {
      const st = E.aiChooseStack(s, pi, diff);
      if (st && playCard(room, pi, st.cardId, st.color)) return;
      return takePenalty(room, pi);
    }
    if (s.hasDrawn) {
      const c = s.players[pi].hand.find((x) => x.id === s.drawnCardId);
      if (c && E.isPlayable(c, s, s.players[pi].hand) && E.aiWantsDrawn(s, pi, c, diff) && playCard(room, pi, c.id, E.aiColorFor(s, pi, c, diff), E.aiSwapTarget(s, pi, diff))) return;
      return pass(room, pi);
    }
    const m = E.aiChooseMove(s, pi, diff);
    if (m.type === 'play' && playCard(room, pi, m.cardId, m.color, m.target)) return;
    drawForTurn(room, pi);
    room.thinkAt = Date.now() + (ANIM.draw(1) + 180) * speedOf(room).anim;
    schedule(room, room.busyUntil - Date.now());
  }

  // ── actions (shared by players and bots) ─────────────────────────────────
  function playCard(room, pi, cardId, color, target) {
    const s = room.game;
    const card = s.players[pi] && s.players[pi].hand.find((c) => c.id === cardId);
    if (!card) return false;
    const rot = Math.round(rand(-14, 14));
    const dx = Math.round(rand(-5, 5));
    const dy = Math.round(rand(-4, 4));
    if (!apply(room, { type: 'PLAY_CARD', player: pi, cardId, color, target: Number.isInteger(target) ? target : undefined, rot, dx, dy, now: Date.now() })) return false;
    const after = room.game;
    busy(room, ANIM.play + (after.lastSwap ? 420 : 0));
    broadcastGame(room, { kind: 'play', player: pi, card, color: after.currentColor, rot, dx, dy, pending: after.pendingDraw, direction: after.direction, next: after.current, swap: after.lastSwap });
    if (after.phase === 'GAME_OVER') return finish(room), true;
    if (after.players[pi].uno === 'grace') openUnoWindow(room, pi);
    schedule(room, room.busyUntil - Date.now());
    return true;
  }
  function reshuffleIfNeeded(room) {
    const s = room.game;
    if (s.drawPile.length || s.discard.length < 2) return false;
    return apply(room, { type: 'RESHUFFLE', pile: E.shuffle(s.discard.slice(0, -1).map((e) => e.card)) });
  }
  function drawCards(room, pi, count) {
    const cards = [];
    let reshuffled = false;
    for (let k = 0; k < count; k++) {
      reshuffled = reshuffleIfNeeded(room) || reshuffled;
      if (!apply(room, { type: 'DRAW_ONE', player: pi })) break;
      cards.push(room.game.lastDraw.card);
    }
    return { cards, reshuffled };
  }
  function drawForTurn(room, pi) {
    // One card, or (house rule) keep drawing until something fits.
    const cards = [];
    let reshuffled = false;
    do {
      const got = drawCards(room, pi, 1);
      reshuffled = reshuffled || got.reshuffled;
      if (!got.cards.length) break;
      cards.push(got.cards[0]);
    } while (room.game.rules.drawToMatch && cards.length < 40 && !E.isPlayable(cards[cards.length - 1], room.game, room.game.players[pi].hand));
    const last = cards[cards.length - 1];
    apply(room, { type: 'MARK_DRAWN', cardId: last ? last.id : null, inferLack: true });
    busy(room, ANIM.draw(Math.max(1, cards.length)));
    room.drawnAt = Date.now() + ANIM.draw(Math.max(1, cards.length)) * speedOf(room).anim;
    broadcastGame(room, { kind: 'draw', player: pi, count: cards.length, cards, reason: 'turn', reshuffled });
    if (!cards.length) return pass(room, pi); // deck and discards are both empty
    schedule(room, room.busyUntil - Date.now());
  }
  function takePenalty(room, pi) {
    const n = room.game.pendingDraw;
    const { cards, reshuffled } = drawCards(room, pi, n);
    apply(room, { type: 'ACCEPT_PENALTY' });
    apply(room, { type: 'END_TURN' });
    busy(room, ANIM.draw(cards.length));
    broadcastGame(room, { kind: 'draw', player: pi, count: cards.length, cards, reason: 'penalty', reshuffled });
    schedule(room, room.busyUntil - Date.now());
  }
  function pass(room, pi) {
    if (!apply(room, { type: 'END_TURN' })) return;
    busy(room, 80);
    broadcastGame(room, { kind: 'pass', player: pi });
    schedule(room, room.busyUntil - Date.now());
  }

  // ── UNOFFICIAL! calls and catches ────────────────────────────────────────
  function callUno(room, pi) {
    if (!apply(room, { type: 'CALL_UNO', player: pi })) return false;
    broadcastGame(room, { kind: 'uno', player: pi });
    return true;
  }
  function openUnoWindow(room, pi) {
    const p = room.game.players[pi];
    const seat = room.gameSeats[pi];
    later(room, () => expireUno(room, pi), p.unoDeadline - Date.now() + 5);
    const diff = autopilot(room, pi, Date.now());
    if (seat.bot) {
      const strategic = seat.difficulty === 'strategic';
      if (Math.random() < (strategic ? 0.94 : 0.7)) later(room, () => { if (room.status === 'playing') callUno(room, pi); }, strategic ? rand(160, 700) : rand(350, 2500));
    } else if (diff) {
      later(room, () => { if (room.status === 'playing') callUno(room, pi); }, 300); // a bot standing in for a classmate calls for them
    }
  }
  function expireUno(room, pi) {
    if (!room.game || room.status !== 'playing') return;
    const now = Date.now();
    if (!apply(room, { type: 'UNO_EXPIRE', player: pi, now })) return;
    broadcastGame(room, { kind: 'exposed', player: pi });
    // Bots at the table notice: Strategic ones straight away, Easy ones only sometimes.
    room.gameSeats.forEach((x, j) => {
      if (j === pi || !x.bot) return;
      const strategic = x.difficulty === 'strategic';
      if (!strategic && Math.random() > 0.4) return;
      later(room, () => challenge(room, pi, j), strategic ? rand(200, 360) : rand(800, 1500));
    });
    schedule(room, 50);
  }
  function challenge(room, target, by) {
    if (!room.game || room.status !== 'playing' || target === by) return false;
    if (!apply(room, { type: 'CHALLENGE', target })) return false;
    broadcastGame(room, { kind: 'catch', by, target, penalty: room.game.rules.unoPenalty || 2 });
    const { cards, reshuffled } = drawCards(room, target, room.game.rules.unoPenalty || 2);
    busy(room, ANIM.draw(cards.length) + 150);
    broadcastGame(room, { kind: 'draw', player: target, count: cards.length, cards, reason: 'catch', reshuffled });
    schedule(room, room.busyUntil - Date.now());
    return true;
  }

  function finish(room) {
    const s = room.game;
    room.status = 'over';
    const seat = room.gameSeats[s.winner];
    room.scores[seat.id] = (room.scores[seat.id] || 0) + s.roundPoints;
    room.hands += 1;
    clearTimers(room);
    broadcastGame(room, { kind: 'over', winner: s.winner, points: s.roundPoints });
    broadcastRoom(room);
  }

  // ── leaving and joining ──────────────────────────────────────────────────
  function joinRoom(c, room) {
    if (c.roomId && c.roomId !== room.id) leaveRoom(c);
    c.roomId = room.id;
    room.members.add(c.id);
    room.emptySince = null;
    const i = seatIndex(room, c.id);
    if (i >= 0) { const seat = room.seats[i]; seat.left = false; seat.offlineSince = 0; seat.name = c.name || seat.name; }
    else if (c.name) takeSeat(room, c); // seated straight away while there's room (playing rooms: from the next hand)
    passHost(room);
    broadcastRoom(room);
    if (room.game) {
      sendClient(c, { type: 'game', seq: room.seq, view: gameView(room, c), ev: { kind: 'sync' } });
      broadcastGame(room, { kind: 'sync' });
      schedule(room, 0);
    }
  }
  function leaveRoom(c) {
    const room = rooms.get(c.roomId);
    c.roomId = null;
    if (!room) return;
    room.members.delete(c.id);
    const i = seatIndex(room, c.id);
    if (i >= 0) {
      const seat = room.seats[i];
      if (room.status === 'playing' && room.gameSeats.includes(seat)) seat.left = true; // a bot finishes their hand
      else room.seats.splice(i, 1);
    }
    passHost(room);
    broadcastRoom(room);
    if (room.game) { broadcastGame(room, { kind: 'sync' }); schedule(room, 0); }
  }

  // ── messages ─────────────────────────────────────────────────────────────
  function handle(ws, msg) {
    if (!msg || typeof msg.type !== 'string') return;
    if (msg.type === 'hello') {
      const c = getClient(msg.token);
      if (ws.client && ws.client !== c) ws.client.sockets.delete(ws);
      ws.client = c;
      c.sockets.add(ws);
      c.idleSince = null;
      if (msg.name) c.name = cleanName(msg.name);
      send(ws, { type: 'welcome', id: c.id, token: c.token, build });
      return;
    }
    const c = ws.client;
    if (!c) return;
    const room = rooms.get(c.roomId);
    const fail = (text, code) => send(ws, { type: 'error', text, code });
    const isHost = room && room.hostId === c.id;

    switch (msg.type) {
      case 'name': {
        c.name = cleanName(msg.name);
        if (room) { const i = seatIndex(room, c.id); if (i >= 0 && c.name) { room.seats[i].name = c.name; broadcastRoom(room); } }
        return;
      }
      case 'create':
      case 'solo': {
        if (!c.name && msg.type === 'create') return fail('Pick a nickname first.');
        if (!c.name) c.name = 'Player';
        if (rooms.size >= MAX_ROOMS) return fail('The server is busy right now. Try again in a minute.');
        const r = createRoom(c, msg.settings);
        joinRoom(c, r);
        if (msg.type === 'solo') {
          const bots = Array.isArray(msg.bots) && msg.bots.length ? msg.bots.slice(0, MAX_SEATS - 1) : ['strategic'];
          applySettings(r, { maxSeats: Math.max(2, bots.length + 1), private: true });
          for (const d of bots) addBot(r, d);
          deal(r);
        }
        return;
      }
      case 'rooms': return send(ws, { type: 'rooms', rooms: listRooms() });
      case 'debug': {
        if (!process.env.UO_DEBUG || !room || !room.game) return;
        const g = room.game, now = Date.now();
        return send(ws, { type: 'debug', d: {
          busyIn: room.busyUntil - now, stepTimer: !!room.stepTimer, thinkIn: room.thinkAt ? room.thinkAt - now : null,
          turnKey: room.turnKey, sTurnKey: g.turnKey, phase: g.phase, current: g.current, hasDrawn: g.hasDrawn, pending: g.pendingDraw,
          auto: autopilot(room, g.current, now), blocking: unoBlocking(room, now), here: anyoneHere(room), timers: room.timers.size,
          uno: g.players.map((p) => [p.uno, p.unoDeadline ? p.unoDeadline - now : 0, p.exposedAt ? now - p.exposedAt : 0, p.hand.length]),
          seats: room.gameSeats.map((x) => [x.name, x.bot, isOnline(room, x)]),
        } });
      }
      case 'quick': {
        // Play now: an open public room with a free seat, or a new public room.
        if (!c.name) return fail('Pick a nickname first.');
        const open = [...rooms.values()].find((r) => !r.settings.private && r.status === 'waiting' && r.seats.length < maxSeats(r) && members(r).some((m) => m.sockets.size));
        if (open) return joinRoom(c, open);
        if (rooms.size >= MAX_ROOMS) return fail('The server is busy right now. Try again in a minute.');
        const r = createRoom(c, Object.assign({}, msg.settings, { private: false }));
        joinRoom(c, r);
        return;
      }
      case 'join': {
        const r = rooms.get(String(msg.room || '').toLowerCase());
        if (!r) return fail('That room has closed, or the code is wrong.', 'noroom');
        if (msg.name) c.name = cleanName(msg.name);
        joinRoom(c, r);
        return;
      }
      case 'leave': if (room) leaveRoom(c); return send(ws, { type: 'left' });
    }
    if (!room) return fail('You are not in a room.', 'noroom');

    switch (msg.type) {
      case 'seat': if (!takeSeat(room, c)) fail('The table is full.'); broadcastRoom(room); return;
      case 'unseat': {
        // Stand up and watch (not during a hand you're playing in).
        const i = seatIndex(room, c.id);
        if (i < 0) return;
        if (room.status === 'playing' && room.gameSeats.includes(room.seats[i])) return fail('Finish this hand first, or leave the room.');
        room.seats.splice(i, 1);
        passHost(room);
        return broadcastRoom(room);
      }
      case 'addBot':
        if (!isHost) return fail('Only the host can add bots.');
        if (!addBot(room, msg.difficulty)) return fail(`The table is full. Add seats in the rules (up to ${MAX_SEATS}).`);
        return broadcastRoom(room);
      case 'setBot': {
        if (!isHost) return;
        const seat = room.seats.find((x) => x.id === msg.seat && x.bot);
        const inHand = room.status === 'playing' && room.gameSeats.includes(seat);
        if (seat && !inHand) seat.difficulty = msg.difficulty === 'easy' ? 'easy' : 'strategic';
        return broadcastRoom(room);
      }
      case 'removeSeat': {
        if (!isHost) return;
        const i = room.seats.findIndex((x) => x.id === msg.seat);
        if (i < 0 || (room.status === 'playing' && room.gameSeats.includes(room.seats[i]))) return fail('Players in this hand stay until it ends.');
        if (!room.seats[i].bot && room.seats[i].clientId === c.id) return;
        const removed = room.seats.splice(i, 1)[0];
        if (!removed.bot) { const who = clientById(removed.clientId); if (who) sendClient(who, { type: 'notice', text: 'The host gave your seat to someone else. You can watch, or take a seat if one frees up.' }); }
        return broadcastRoom(room);
      }
      case 'setting':
        if (!isHost) return;
        applySettings(room, msg.settings);
        if (room.game && room.status === 'playing') broadcastGame(room, { kind: 'sync' }); // speed applies straight away
        return broadcastRoom(room);
      case 'start':
        if (!isHost) return fail('Only the host can deal.');
        if (room.status === 'playing') return;
        if (room.seats.filter((x) => !x.left).length < 2) return fail('Add a bot or wait for a classmate: two players at least.');
        deal(room);
        return;
    }

    // In-game moves: only for a seated player in this hand.
    const s = room.game;
    const pi = playerIndex(room, c.id);
    if (!s || room.status !== 'playing' || pi < 0) return;
    const myTurn = s.phase === 'TURN' && s.current === pi;
    switch (msg.type) {
      case 'play':
        if (!myTurn) return fail('It is not your turn.', 'turn');
        if (!playCard(room, pi, String(msg.cardId), msg.color, Number.isInteger(msg.target) ? msg.target : undefined)) fail('That card does not fit.', 'badcard');
        return;
      case 'draw':
        if (!myTurn) return fail('It is not your turn.', 'turn');
        if (s.pendingDraw > 0) return takePenalty(room, pi);
        if (s.hasDrawn) return pass(room, pi);
        return drawForTurn(room, pi);
      case 'pass':
        if (myTurn && s.hasDrawn) pass(room, pi);
        return;
      case 'uno':
        if (!callUno(room, pi)) fail('Nothing to call right now.', 'uno');
        return;
      case 'catch':
        if (!challenge(room, Number(msg.target), pi)) fail('Too late, nobody to catch.', 'catch');
        return;
    }
  }

  // ── sockets ──────────────────────────────────────────────────────────────
  const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });
  wss.on('connection', (ws) => {
    ws.client = null;
    ws.isAlive = true;
    ws.bucket = { start: Date.now(), n: 0 };
    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('message', (data) => {
      const b = ws.bucket, now = Date.now();
      if (now - b.start > 5000) { b.start = now; b.n = 0; }
      if (++b.n > 80) return;
      let msg;
      try { msg = JSON.parse(data); } catch (e) { return; }
      try { handle(ws, msg); } catch (e) { console.error('[unofficial]', e); send(ws, { type: 'error', text: 'Something went wrong on the server.' }); }
    });
    ws.on('close', () => {
      const c = ws.client;
      if (!c) return;
      c.sockets.delete(ws);
      if (c.sockets.size) return;
      c.idleSince = Date.now();
      const room = rooms.get(c.roomId);
      if (!room) return;
      const i = seatIndex(room, c.id);
      if (i >= 0) room.seats[i].offlineSince = Date.now();
      passHost(room);
      broadcastRoom(room);
      if (room.game && room.status === 'playing') { broadcastGame(room, { kind: 'sync' }); schedule(room, 0); }
    });
  });

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; ws.ping(); }
  }, 30000);
  // Close rooms nobody is connected to, and forget clients that have gone.
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const room of rooms.values()) {
      if (members(room).some((m) => m.sockets.size)) { room.emptySince = null; continue; }
      if (!room.emptySince) room.emptySince = now;
      if (now - room.emptySince > 10 * 60000) {
        clearTimers(room);
        for (const m of members(room)) if (m.roomId === room.id) m.roomId = null;
        rooms.delete(room.id);
      }
    }
    for (const [token, c] of clients) if (!c.sockets.size && !c.roomId && c.idleSince && now - c.idleSince > 30 * 60000) clients.delete(token);
  }, 60000);
  heartbeat.unref && heartbeat.unref();
  sweep.unref && sweep.unref();

  return {
    wss,
    hasRoom: (code) => rooms.has(String(code).toLowerCase()),
    roomCount: () => rooms.size,
    close() { clearInterval(heartbeat); clearInterval(sweep); for (const room of rooms.values()) clearTimers(room); },
  };
}

module.exports = { createUnofficial, MAX_SEATS, DEFAULT_SETTINGS };
