'use strict';
// UnOfficial rooms end to end: start the real server, connect two "classmates" over WebSocket, set a 6-seat table
// with every house rule on, fill it with bots, play two hands at turbo speed, drop one player and bring them back.
const { spawn } = require('child_process');
const path = require('path');
const WebSocket = require('ws');
const E = require('../unofficial/engine.js');

const PORT = 4400 + Math.floor(Math.random() * 400);
const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: Object.assign({}, process.env, { PORT: String(PORT), UO_DEBUG: process.env.UO_DEBUG || '' }), stdio: ['ignore', 'pipe', 'inherit'] });
const fail = (m) => { console.error('UnOfficial rooms: FAIL —', m); srv.kill(); process.exit(1); };
let lastInfo = '';
const deadline = setTimeout(() => { if (process.env.UO_DEBUG && global.A) { global.A.ws.on('message', (d) => { const m = JSON.parse(d); if (m.type === 'debug') { console.error('DEBUG', JSON.stringify(m.d)); fail(`timed out (${lastInfo})`); } }); global.A.send({ type: 'debug' }); setTimeout(() => fail('timed out, no debug'), 2000); } else fail(`timed out (${lastInfo})`); }, 240000);

function player(name, token) {
  const p = { name, token, ws: null, view: null, room: null, errors: [], hands: 0, msgs: 0, events: {} };
  p.connect = () => new Promise((res) => {
    p.ws = new WebSocket(`ws://localhost:${PORT}/unofficial/ws`);
    p.ws.on('open', () => { p.send({ type: 'hello', token, name }); res(); });
    p.ws.on('message', (d) => p.onMsg(JSON.parse(d)));
  });
  p.send = (m) => p.ws.readyState === 1 && p.ws.send(JSON.stringify(m));
  p.onMsg = (m) => {
    p.msgs++;
    if (m.type === 'room') p.room = m.room;
    if (m.type === 'rooms') p.list = m.rooms;
    if (m.type === 'game' && m.ev.kind === 'play' && m.ev.swap) p.swaps = (p.swaps || 0) + 1;
    if (m.type === 'error' && !['turn', 'badcard', 'uno', 'catch'].includes(m.code)) p.errors.push(m.text);
    if (m.type !== 'game') return;
    p.view = m.view; p.events[m.ev.kind] = (p.events[m.ev.kind] || 0) + 1;
    const v = m.view;
    if (v.you >= 0 && v.hand.length !== v.players[v.you].count) fail(`${name}: hand ${v.hand.length} vs count ${v.players[v.you].count}`);
    if (m.ev.kind === 'over') p.hands++;
    if (m.ev.kind === 'draw' && m.ev.player !== v.you && m.ev.cards) fail('saw someone else\'s drawn cards');
    clearTimeout(p.t); p.t = setTimeout(() => p.act(), 30);
  };
  p.act = () => {
    const v = p.view;
    if (!v || v.phase === 'GAME_OVER' || v.you < 0) return;
    // catch anyone who forgot to call
    v.players.forEach((q, i) => { if (i !== v.you && q.uno === 'exposed' && Math.random() < 0.5) p.send({ type: 'catch', target: i }); });
    if (v.phase !== 'TURN' || v.current !== v.you) return;
    const s = Object.assign({}, v);
    const playable = v.hand.filter((c) => E.isPlayable(c, s, v.hand) && (!v.drawnCardId || v.drawnCardId === c.id));
    if (v.hand.length === 2 && playable.length && Math.random() < 0.7) p.send({ type: 'uno' });
    if (playable.length) { const c = playable[0]; p.send({ type: 'play', cardId: c.id, color: c.color === 'wild' ? 'blue' : null, target: (v.you + 1) % v.players.length }); }
    else if (v.hasDrawn) p.send({ type: 'pass' });
    else p.send({ type: 'draw' });
  };
  return p;
}

(async () => {
  // wait for the server (it compresses its pages at start-up, which takes a few seconds on a busy machine)
  for (let i = 0; i < 300; i++) { try { await new Promise((res, rej) => { const w = new WebSocket(`ws://localhost:${PORT}/unofficial/ws`); w.on('open', () => { w.close(); res(); }); w.on('error', rej); }); break; } catch (e) { await new Promise((r) => setTimeout(r, 100)); } }
  const A = player('Ada', 'a'.repeat(24)), B = player('Ben', 'b'.repeat(24));
  global.A = A;
  await A.connect(); await B.connect();
  A.send({ type: 'create', settings: { speed: 'turbo', stacking: true, private: false } });
  await new Promise((r) => setTimeout(r, 300));
  if (!A.room || !A.room.host) fail('room not created');
  const code = A.room.id;
  // the portal's join link finds this room
  const http = require('http');
  const loc = await new Promise((res) => http.get(`http://localhost:${PORT}/join/${code}`, (r) => res(r.headers.location)));
  if (loc !== `/unofficial/room/${code}`) fail(`portal join redirect went to ${loc}`);
  B.send({ type: 'rooms' }); await new Promise((r) => setTimeout(r, 200));
  if (!B.list || !B.list.some((r) => r.id === code)) fail('public room missing from the open-rooms list');
  B.send({ type: 'quick' }); // Play now finds Ada's open room
  A.send({ type: 'setting', settings: { maxSeats: 6, handSize: 5, drawToMatch: true, unoPenalty: 4, wild4Strict: true, sevenZero: true, turnClock: 15, bogus: 1 } });
  B.send({ type: 'setting', settings: { maxSeats: 2 } }); // not the host: ignored
  for (const d of ['strategic', 'easy', 'strategic', 'easy']) A.send({ type: 'addBot', difficulty: d });
  B.send({ type: 'addBot', difficulty: 'easy' }); // not the host: refused
  await new Promise((r) => setTimeout(r, 300));
  if (A.room.seats.length !== 6) fail(`expected 6 seats, got ${A.room.seats.length}`);
  const st = A.room.settings;
  if (st.maxSeats !== 6 || st.handSize !== 5 || !st.sevenZero || st.unoPenalty !== 4 || st.turnClock !== 15 || 'bogus' in st) fail(`settings not applied: ${JSON.stringify(st)}`);
  if (!B.errors.some((e) => /host/.test(e))) fail('non-host could add a bot'); B.errors = [];
  A.send({ type: 'start' });
  let dropped = false, rejoined = false;
  while (A.hands < 2) {
    await new Promise((r) => setTimeout(r, 200));
    lastInfo = `hands ${A.hands}, phase ${A.view && A.view.phase}, current ${A.view && A.view.current}, A you ${A.view && A.view.you}, B you ${B.view && B.view.you}, room ${A.room && A.room.status}, pending ${A.view && A.view.pendingDraw}, drawn ${A.view && A.view.hasDrawn}, counts ${A.view && A.view.players.map((p) => p.count + p.uno[0] + (p.online ? '' : '!')).join(' ')}`;
    if (A.view && A.view.phase === 'GAME_OVER' && A.room.status === 'over') { A.send({ type: 'start' }); await new Promise((r) => setTimeout(r, 300)); }
    if (A.hands === 0 && !dropped && A.view && A.view.phase === 'TURN' && A.view.turnKey > 20) {
      dropped = true; B.ws.terminate(); // Ben's wifi drops
      const t0 = Date.now(); const hBefore = A.hands;
      while (Date.now() - t0 < 9000 && A.hands === hBefore) await new Promise((r) => setTimeout(r, 200)); // a bot covers his turns
      await B.connect(); B.send({ type: 'join', room: code }); rejoined = true;
      await new Promise((r) => setTimeout(r, 500));
      if (!B.view || B.view.you < 0) fail('Ben did not get his seat back');
    }
  }
  if (A.errors.length || B.errors.length) fail(`errors: ${A.errors.concat(B.errors).join('; ')}`);
  const kinds = Object.keys(A.events).sort().join(',');
  console.log(`UnOfficial rooms: 2 hands, 6 seats (2 classmates + 4 bots), all house rules on: OK (play-now, open rooms, drop/rejoin ${rejoined ? 'OK' : 'skipped'}, ${A.swaps || 0} swaps/rotations; events: ${kinds})`);
  clearTimeout(deadline); A.ws.close(); B.ws.close(); srv.kill(); process.exit(0);
})().catch((e) => fail(e.stack));
