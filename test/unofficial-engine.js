'use strict';
// UnOfficial rules engine: play many bot-only games and check every game finishes and no card is ever lost.
const E = require('../unofficial/engine.js');

function play(n, rules, diffs, handSize) {
  let s = E.createGame({ players: diffs.slice(0, n).map((d, i) => ({ name: `B${i}`, difficulty: d })), deck: E.shuffle(E.buildDeck()), starter: Math.floor(Math.random() * n), rules });
  const D = (a) => { s = E.gameReducer(s, a); };
  const draw = (pi) => {
    if (!s.drawPile.length && s.discard.length > 1) D({ type: 'RESHUFFLE', pile: E.shuffle(s.discard.slice(0, -1).map((e) => e.card)) });
    const before = s; D({ type: 'DRAW_ONE', player: pi }); return s !== before ? s.lastDraw.card : null;
  };
  for (let r = 0; r < handSize; r++) for (let i = 0; i < n; i++) draw(i);
  D({ type: 'FLIP_START', rot: 0 });
  D({ type: 'BEGIN_TURN' });
  let steps = 0, now = 0;
  const total = () => s.drawPile.length + s.discard.length + s.players.reduce((t, p) => t + p.hand.length, 0);
  while (s.phase !== 'GAME_OVER') {
    if (++steps > 5000) throw new Error('game did not finish');
    if (total() !== 108) throw new Error(`card count ${total()}`);
    now += 3000;
    // UNO windows: everyone in grace either called (most) or gets caught
    s.players.forEach((p, i) => { if (p.uno === 'grace') { if (Math.random() < 0.8) D({ type: 'CALL_UNO', player: i }); else { D({ type: 'UNO_EXPIRE', player: i, now }); D({ type: 'CHALLENGE', target: i }); draw(i); draw(i); } } });
    if (s.phase === 'TRANSITION') { D({ type: 'BEGIN_TURN' }); continue; }
    const pi = s.current;
    if (s.pendingDraw > 0) {
      const st = E.aiChooseStack(s, pi);
      if (st) { D({ type: 'PLAY_CARD', player: pi, cardId: st.cardId, color: st.color, now }); continue; }
      for (let k = s.pendingDraw; k > 0; k--) draw(pi);
      D({ type: 'ACCEPT_PENALTY' }); D({ type: 'END_TURN' }); continue;
    }
    const m = E.aiChooseMove(s, pi);
    if (m.type === 'play') { const b = s; D({ type: 'PLAY_CARD', player: pi, cardId: m.cardId, color: m.color, target: m.target, now }); if (b === s) throw new Error('AI chose an illegal card'); continue; }
    let c = draw(pi);
    while (rules.drawToMatch && c && !E.isPlayable(c, s, s.players[pi].hand)) c = draw(pi);
    D({ type: 'MARK_DRAWN', cardId: c ? c.id : null, inferLack: true });
    if (c && E.isPlayable(c, s, s.players[pi].hand) && E.aiWantsDrawn(s, pi, c)) D({ type: 'PLAY_CARD', player: pi, cardId: c.id, color: E.aiColorFor(s, pi, c), target: E.aiSwapTarget(s, pi), now });
    else D({ type: 'END_TURN' });
  }
  if (total() !== 108) throw new Error('card count at end');
  return { steps, winner: s.winner, diff: diffs[s.winner] };
}

const t0 = Date.now();
let games = 0, stratWins = 0, mixed = 0, fair = 0;
const coin = () => Math.random() < 0.5;
for (let i = 0; i < 4000; i++) {
  const n = 2 + (i % 7); // 2–8 players
  const diffs = ['strategic', 'easy', 'easy', 'easy', 'easy', 'easy', 'easy', 'easy'].slice(0, n);
  const rules = { stacking: coin(), drawToMatch: coin(), unoPenalty: [0, 2, 4][i % 3], wild4Strict: coin(), sevenZero: coin() };
  const handSize = n > 6 ? [5, 7][i % 2] : [5, 7, 10][i % 3];
  const r = play(n, rules, diffs, handSize);
  games++; mixed++; fair += 1 / n; if (r.diff === 'strategic') stratWins++;
}
console.log(`UnOfficial engine: ${games} games (2–8 players, random house rules) OK in ${Date.now() - t0} ms; strategic seat won ${Math.round(stratWins / mixed * 100)}% (fair share ${Math.round(fair / mixed * 100)}%)`);
