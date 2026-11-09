'use strict';
/* UnOfficial rules engine, shared by the server (which runs every game) and the browser (which uses it
   to know which of your cards can be played). Everything here is pure: no timers, no network, and every
   random choice (shuffles, AI picks) is made by the caller or by the AI helpers at the bottom.

   Phase machine (state.phase)
     DEAL ──BEGIN_TURN──▶ TURN ──PLAY_CARD / END_TURN──▶ TRANSITION ──BEGIN_TURN──▶ TURN …
     PLAY_CARD (last card) ──▶ GAME_OVER
*/

const COLORS = ['red', 'yellow', 'green', 'blue'];
const HAND_SIZE = 7;
const UNO_GRACE_MS = 2000; // time to call UNOFFICIAL! after dropping to one card

/** Standard 108-card deck: per colour one 0, two each of 1–9, Skip, Reverse, Draw 2; plus 4 Wild and 4 Wild Draw 4. */
function buildDeck() {
  const deck = [];
  let n = 0;
  const add = (color, type, value = null) => deck.push({ id: `c${n++}`, color, type, value });
  for (const color of COLORS) {
    add(color, 'number', 0);
    for (let v = 1; v <= 9; v++) { add(color, 'number', v); add(color, 'number', v); }
    for (const t of ['skip', 'reverse', 'draw2']) { add(color, t); add(color, t); }
  }
  for (let i = 0; i < 4; i++) { add('wild', 'wild'); add('wild', 'wild4'); }
  return deck;
}

/** Fisher–Yates shuffle (returns a new array). */
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const mod = (n, m) => ((n % m) + m) % m;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const isWild = (c) => c.color === 'wild';
const cardPoints = (c) => (c.type === 'number' ? c.value : isWild(c) ? 50 : 20);
const handPoints = (hand) => hand.reduce((t, c) => t + cardPoints(c), 0);
const topEntry = (s) => s.discard[s.discard.length - 1];

/** Stacking house rule: +2 may go on +2; a Wild +4 may go on any pending draw. */
const canStack = (card, pendingType) => card.type === 'wild4' || (card.type === 'draw2' && pendingType === 'draw2');

/**
 * Core matching rule. A card is playable when:
 *   • a draw penalty is pending → only a stackable draw card (and only if stacking is on)
 *   • it is wild (house rule: a Wild +4 only when you hold nothing in the active colour)
 *   • it matches the active colour (wilds set the active colour)
 *   • it matches the top card's number, or its action symbol
 */
function isPlayable(card, s, hand) {
  if (s.pendingDraw > 0) return !!s.rules.stacking && canStack(card, s.pendingType);
  // House rule: a Wild +4 only when you have nothing in the active colour.
  if (card.type === 'wild4' && s.rules.wild4Strict && hand && hand.some((c) => c.id !== card.id && c.color === s.currentColor)) return false;
  if (isWild(card)) return true;
  if (card.color === s.currentColor) return true;
  const top = topEntry(s) && topEntry(s).card;
  if (!top) return true;
  if (card.type === 'number') return top.type === 'number' && top.value === card.value;
  return card.type === top.type;
}

const COLOR_ORDER = { red: 0, yellow: 1, green: 2, blue: 3, wild: 4 };
const TYPE_ORDER = { number: 0, skip: 1, reverse: 2, draw2: 3, wild: 4, wild4: 5 };
/** Hands are kept sorted by colour, then type, then value: easier to scan, and keys 1–9 stay predictable. */
const sortHand = (hand) => hand.slice().sort((a, b) =>
  COLOR_ORDER[a.color] - COLOR_ORDER[b.color] || TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || (a.value || 0) - (b.value || 0));

// ─────────────────────────────────────────────────────────────────────────────
// Reducer
// ─────────────────────────────────────────────────────────────────────────────
const newPlayer = (p) => ({
  name: p.name, isHuman: !!p.isHuman, difficulty: p.difficulty || 'easy', hand: [],
  uno: 'none', // 'none' | 'grace' (2 s to call) | 'called' | 'exposed' (missed it, can be caught) | 'caught'
  unoDeadline: 0, exposedAt: 0,
  armed: false, // pressed UNOFFICIAL! with two cards, before playing the second-to-last one
  lacks: [], // colours this player was seen unable to follow (strategic AI memory)
  lead: null, // colour this player last pushed (strategic AI memory)
});

const patchPlayer = (players, i, patch) =>
  players.map((p, j) => (j === i ? Object.assign({}, p, typeof patch === 'function' ? patch(p) : patch) : p));

const LIVE = ['DEAL', 'TURN', 'TRANSITION'];

/** House rules a host can set. Hand size and "draw until you can play" are handled by whoever deals and draws. */
const DEFAULT_RULES = { stacking: true, drawToMatch: false, unoPenalty: 2, wild4Strict: false, sevenZero: false };

function createGame({ players, deck, starter, rules, stacking }) {
  const r = Object.assign({}, DEFAULT_RULES, rules || {}, stacking === undefined ? {} : { stacking: !!stacking });
  return {
    phase: 'DEAL', players: players.map(newPlayer), drawPile: deck, discard: [], currentColor: null,
    current: starter, direction: 1, pendingDraw: 0, pendingType: null, hasDrawn: false, drawnCardId: null,
    turnKey: 0, winner: null, roundPoints: 0, rules: r, lastDraw: null, lastSwap: null,
  };
}

function gameReducer(s, a) {
  switch (a.type) {
    // Draw pile ran dry: everything under the top discard becomes the new (pre-shuffled) draw pile.
    case 'RESHUFFLE': {
      if (s.drawPile.length || s.discard.length < 2) return s;
      return Object.assign({}, s, { drawPile: a.pile, discard: [topEntry(s)] });
    }

    // One card from the top of the draw pile into a hand (dealing, drawing, penalties and catches).
    case 'DRAW_ONE': {
      if (!LIVE.includes(s.phase) || !s.drawPile.length) return s;
      const card = s.drawPile[s.drawPile.length - 1];
      const players = patchPlayer(s.players, a.player, (p) => ({ hand: sortHand(p.hand.concat([card])), uno: 'none', exposedAt: 0, armed: false }));
      return Object.assign({}, s, { drawPile: s.drawPile.slice(0, -1), players, lastDraw: { player: a.player, card } });
    }

    // DEAL: turn the first discard face up. Action and wild cards are skipped so every round opens on a number.
    case 'FLIP_START': {
      if (s.phase !== 'DEAL') return s;
      let idx = s.drawPile.length - 1;
      while (idx > 0 && s.drawPile[idx].type !== 'number') idx--;
      const card = s.drawPile[idx];
      return Object.assign({}, s, {
        drawPile: s.drawPile.filter((_, i) => i !== idx),
        discard: [{ card, color: card.color, rot: a.rot || 0, dx: 0, dy: 0 }],
        currentColor: card.color,
      });
    }

    // DEAL | TRANSITION → TURN. A player who was exposed is safe once their own turn starts.
    case 'BEGIN_TURN': {
      if (s.phase !== 'DEAL' && s.phase !== 'TRANSITION') return s;
      const players = patchPlayer(s.players, s.current, (q) => Object.assign({ armed: false }, q.uno === 'exposed' ? { uno: 'none', exposedAt: 0 } : {}));
      return Object.assign({}, s, { players, phase: 'TURN', turnKey: s.turnKey + 1, hasDrawn: false, drawnCardId: null });
    }

    // The heart of the rules: validate, move the card, apply its effect, open the UNOFFICIAL! window, pick the next player.
    case 'PLAY_CARD': {
      const pi = a.player;
      if (s.phase !== 'TURN' || pi !== s.current) return s;
      const p = s.players[pi];
      const card = p.hand.find((c) => c.id === a.cardId);
      if (!card || !isPlayable(card, s, p.hand)) return s;
      if (s.drawnCardId && s.drawnCardId !== a.cardId) return s; // after drawing, only the drawn card may be played

      const n = s.players.length;
      const hand = p.hand.filter((c) => c.id !== a.cardId);
      const chosen = isWild(card) ? (COLORS.includes(a.color) ? a.color : 'red') : card.color;
      let direction = s.direction;
      let pendingDraw = s.pendingDraw;
      let pendingType = s.pendingType;
      let skip = 0;
      if (card.type === 'reverse') { direction = -direction; if (n === 2) skip = 1; } // 2 players: Reverse acts as Skip
      if (card.type === 'skip') skip = 1;
      if (card.type === 'draw2') { pendingDraw += 2; pendingType = 'draw2'; } // next player stacks or draws
      if (card.type === 'wild4') { pendingDraw += 4; pendingType = 'wild4'; }

      // UNOFFICIAL! window: pre-called → safe; otherwise a 2-second grace period starts now (unless the host turned calls off).
      let uno = 'none';
      let unoDeadline = 0;
      if (hand.length === 1 && s.rules.unoPenalty !== 0) {
        if (p.armed) uno = 'called';
        else { uno = 'grace'; unoDeadline = a.now + UNO_GRACE_MS; }
      }
      let players = patchPlayer(s.players, pi, (q) => ({
        hand, uno, unoDeadline, exposedAt: 0, armed: false, lacks: q.lacks.filter((c) => c !== chosen), lead: chosen,
      }));
      // House rule "sevens & zeros": a 7 swaps hands with a player of your choice; a 0 passes every hand one seat on.
      let lastSwap = null;
      if (hand.length > 0 && s.rules.sevenZero && card.type === 'number' && (card.value === 7 || card.value === 0)) {
        const fresh = { uno: 'none', unoDeadline: 0, exposedAt: 0, armed: false, lacks: [] };
        if (card.value === 7) {
          let t = Number.isInteger(a.target) && a.target >= 0 && a.target < n && a.target !== pi ? a.target : -1;
          if (t < 0) t = players.reduce((best, q, i) => (i !== pi && (best < 0 || q.hand.length < players[best].hand.length) ? i : best), -1);
          const mine = players[pi].hand;
          const theirs = players[t].hand;
          players = players.map((q, i) => (i === pi ? Object.assign({}, q, fresh, { hand: theirs }) : i === t ? Object.assign({}, q, fresh, { hand: mine }) : q));
          lastSwap = { kind: 'swap', a: pi, b: t };
        } else {
          const hands = players.map((q) => q.hand);
          players = players.map((q, i) => Object.assign({}, q, fresh, { hand: hands[mod(i - direction, n)] }));
          lastSwap = { kind: 'rotate', direction };
        }
      }
      const discard = s.discard.concat([{ card, color: chosen, rot: a.rot || 0, dx: a.dx || 0, dy: a.dy || 0, by: pi }]);
      const base = Object.assign({}, s, { players, discard, currentColor: chosen, direction, pendingDraw, pendingType, hasDrawn: false, drawnCardId: null, lastSwap });

      if (hand.length === 0) {
        // Round over: the winner scores the value of every card left in opponents' hands.
        const roundPoints = players.reduce((t, q, i) => (i === pi ? t : t + handPoints(q.hand)), 0);
        return Object.assign(base, { phase: 'GAME_OVER', winner: pi, roundPoints, pendingDraw: 0, pendingType: null });
      }
      return Object.assign(base, { current: mod(pi + direction * (1 + skip), n), phase: 'TRANSITION' });
    }

    // A non-penalty draw. inferLack lets opponents remember "they couldn't follow this colour".
    case 'MARK_DRAWN': {
      if (s.phase !== 'TURN') return s;
      const players = a.inferLack
        ? patchPlayer(s.players, s.current, (q) => ({ lacks: q.lacks.includes(s.currentColor) ? q.lacks : q.lacks.concat([s.currentColor]) }))
        : s.players;
      return Object.assign({}, s, { players, hasDrawn: true, drawnCardId: a.cardId });
    }

    // Penalty cards taken: the stack is cleared; the victim's turn then ends via END_TURN.
    case 'ACCEPT_PENALTY':
      return Object.assign({}, s, { pendingDraw: 0, pendingType: null, players: patchPlayer(s.players, s.current, { lacks: [] }) });

    // TURN → TRANSITION (pass, or a turn lost to a penalty).
    case 'END_TURN': {
      if (s.phase !== 'TURN') return s;
      return Object.assign({}, s, {
        current: mod(s.current + s.direction, s.players.length), phase: 'TRANSITION',
        hasDrawn: false, drawnCardId: null, players: patchPlayer(s.players, s.current, { armed: false }),
      });
    }

    // UNOFFICIAL! Either pre-arm (2 cards, own turn) or call inside the 2-second grace window.
    case 'CALL_UNO': {
      const p = s.players[a.player];
      if (!p || !LIVE.includes(s.phase)) return s;
      if (p.uno === 'grace' && p.hand.length === 1) return Object.assign({}, s, { players: patchPlayer(s.players, a.player, { uno: 'called' }) });
      if (p.hand.length === 2 && s.current === a.player && s.phase === 'TURN' && !p.armed) {
        return Object.assign({}, s, { players: patchPlayer(s.players, a.player, { armed: true }) });
      }
      return s;
    }

    // Grace window ran out without a call: the player is exposed and can be challenged.
    case 'UNO_EXPIRE': {
      const p = s.players[a.player];
      if (!p || p.uno !== 'grace' || a.now < p.unoDeadline || !LIVE.includes(s.phase)) return s;
      return Object.assign({}, s, { players: patchPlayer(s.players, a.player, { uno: 'exposed', exposedAt: a.now }) });
    }

    // Successful challenge: mark as caught (the two penalty cards follow as DRAW_ONE actions).
    case 'CHALLENGE': {
      const p = s.players[a.target];
      if (!p || p.uno !== 'exposed' || p.hand.length !== 1 || !LIVE.includes(s.phase)) return s;
      return Object.assign({}, s, { players: patchPlayer(s.players, a.target, { uno: 'caught' }) });
    }

    default:
      return s;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AI
// ─────────────────────────────────────────────────────────────────────────────
const nextSeat = (s, from, steps = 1) => mod(from + s.direction * steps, s.players.length);

/** Strategic colour choice: our deepest suit, nudged toward colours the next player can't follow and away from their lead. */
function aiBestColor(s, pi, played) {
  const p = s.players[pi];
  const rest = p.hand.filter((c) => (!played || c.id !== played.id) && !isWild(c));
  const next = s.players[nextSeat(s, pi)];
  let best = pick(COLORS);
  let bestScore = -Infinity;
  for (const color of COLORS) {
    const mine = rest.filter((c) => c.color === color);
    let sc = mine.length * 10 + handPoints(mine) * 0.15 + (mine.some((c) => c.type !== 'number') ? 3 : 0);
    if (next.lacks.includes(color)) sc += 6;
    if (next.lead === color) sc -= 5;
    if (sc > bestScore) { bestScore = sc; best = color; }
  }
  return best;
}

/** Heuristic score for one playable card (Strategic only). */
function scoreStrategic(s, pi, card, color) {
  const p = s.players[pi];
  const n = s.players.length;
  const rest = p.hand.filter((c) => c.id !== card.id);
  const next = s.players[nextSeat(s, pi)];
  const threat = next.hand.length <= 2 ? 3 - next.hand.length : 0;
  let score = 0;
  if (card.type === 'wild') score -= 28; // save wilds: the only cards that are always playable
  if (card.type === 'wild4') score -= 36 - threat * 30;
  if (card.type === 'number') score += card.value * 0.5; // dump high-value numbers early
  if (card.type === 'skip' || (card.type === 'reverse' && n === 2)) score += 4 + threat * 14;
  if (card.type === 'draw2') score += 6 + threat * 18;
  if (card.type === 'reverse' && n > 2) {
    const prev = s.players[nextSeat(s, pi, -1)];
    score += next.hand.length < prev.hand.length ? 8 + threat * 8 : -3;
  }
  const deep = rest.filter((c) => c.color === color).length; // colour control
  score += deep * 4;
  if (!isWild(card) && card.color !== s.currentColor) score += (deep - rest.filter((c) => c.color === s.currentColor).length) * 2;
  if (next.lacks.includes(color)) score += 10; // counter opponent colour leads
  if (next.lead === color) score -= 7;
  if (rest.length === 1 && isWild(rest[0]) && !isWild(card)) score += 15; // keep a wild as the last card
  if (s.rules.sevenZero && card.type === 'number' && rest.length) {
    const others = s.players.filter((_, i) => i !== pi).map((q) => q.hand.length);
    if (card.value === 7) score += Math.max(0, rest.length - Math.min(...others)) * 5; // grab a small hand
    if (card.value === 0) score += (rest.length - s.players[nextSeat(s, pi, -1)].hand.length) * 3; // we get the previous player's hand
  }
  return score + Math.random() * 1.5;
}

/** { type:'play', cardId, color } or { type:'draw' } for a normal (non-penalty) turn. */
function aiChooseMove(s, pi, difficulty) {
  const p = s.players[pi];
  const playable = p.hand.filter((c) => isPlayable(c, s, p.hand));
  if (!playable.length) return { type: 'draw' };
  if ((difficulty || p.difficulty) !== 'strategic') {
    const card = pick(playable);
    return { type: 'play', cardId: card.id, color: isWild(card) ? pick(COLORS) : null, target: aiSwapTarget(s, pi, difficulty) };
  }
  let best = null;
  let bestScore = -Infinity;
  for (const card of playable) {
    const color = isWild(card) ? aiBestColor(s, pi, card) : card.color;
    const sc = scoreStrategic(s, pi, card, color);
    if (sc > bestScore) { bestScore = sc; best = { card, color }; }
  }
  return { type: 'play', cardId: best.card.id, color: isWild(best.card) ? best.color : null, target: aiSwapTarget(s, pi, difficulty) };
}

/** Who to swap hands with on a 7: Strategic takes the smallest hand, Easy picks anyone. */
function aiSwapTarget(s, pi, difficulty) {
  const others = s.players.map((_, i) => i).filter((i) => i !== pi);
  if ((difficulty || s.players[pi].difficulty) !== 'strategic') return pick(others);
  let best = others[0];
  for (const i of others) if (s.players[i].hand.length < s.players[best].hand.length) best = i;
  return best;
}

/** Facing a pending +2/+4: a card to stack, or null to take the cards. */
function aiChooseStack(s, pi, difficulty) {
  if (!s.rules.stacking) return null;
  const p = s.players[pi];
  const options = p.hand.filter((c) => canStack(c, s.pendingType));
  if (!options.length) return null;
  if ((difficulty || p.difficulty) !== 'strategic') {
    if (Math.random() < 0.5) return null;
    const c = pick(options);
    return { cardId: c.id, color: isWild(c) ? pick(COLORS) : null };
  }
  const c = options.find((o) => o.type === 'draw2') || options[0]; // spend a +2 before a +4
  return { cardId: c.id, color: isWild(c) ? aiBestColor(s, pi, c) : null };
}

/** After drawing a playable card: Easy usually plays it; Strategic keeps a drawn wild while its hand is still big. */
function aiWantsDrawn(s, pi, card, difficulty) {
  const p = s.players[pi];
  if ((difficulty || p.difficulty) !== 'strategic') return Math.random() < 0.75;
  return !(isWild(card) && p.hand.length > 3);
}

function aiColorFor(s, pi, card, difficulty) {
  return (difficulty || s.players[pi].difficulty) === 'strategic' ? aiBestColor(s, pi, card) : pick(COLORS);
}

module.exports = {
  COLORS, HAND_SIZE, UNO_GRACE_MS,
  buildDeck, shuffle, mod, isWild, cardPoints, handPoints, topEntry, canStack, isPlayable, sortHand,
  DEFAULT_RULES, createGame, gameReducer,
  aiChooseMove, aiChooseStack, aiWantsDrawn, aiColorFor, aiBestColor, aiSwapTarget,
};
