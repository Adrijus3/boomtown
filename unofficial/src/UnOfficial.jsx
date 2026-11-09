/**
 * UnOfficial — a fast, tactile colour-matching card game (inspired by UNO).
 * ───────────────────────────────────────────────────────────────────────────
 * Single-file React component. Drop it into any React 18+ app that has
 * Tailwind CSS, framer-motion (v10+) and lucide-react installed:
 *
 *   import UnOfficial from './UnOfficial';
 *   export default function App() { return <UnOfficial />; }
 *
 * Optional props: homeHref (adds a back link in the top bar, e.g. to a games portal) and homeLabel.
 *
 * No external media: every card is inline SVG and every sound is synthesised
 * with the Web Audio API, so there is nothing to download besides the JS.
 *
 * File map
 *   1. Constants & palette
 *   2. Deck & card-matching utilities
 *   3. Rules engine — a pure reducer; every game-state transition lives here
 *   4. AI opponents (Easy / Strategic)
 *   5. Audio engine (Web Audio API)
 *   6. Persistence & small hooks
 *   7. Geometry (responsive sizing, hand-fan layout)
 *   8. Visual components (cards, seats, overlays, controls)
 *   9. <UnOfficial/> — controller: animation sequences, input, render
 *
 * Phase machine (state.phase)
 *   MENU ──NEW_GAME──▶ DEAL ──BEGIN_TURN──▶ PLAYER_TURN | AI_TURN
 *   PLAYER_TURN | AI_TURN ──PLAY_CARD / END_TURN──▶ TRANSITION ──BEGIN_TURN──▶ …
 *   PLAY_CARD (last card) ──▶ GAME_OVER ──NEW_GAME──▶ DEAL
 *   TRANSITION is the short beat between turns while a card is still flying.
 */
import React, { memo, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion } from 'framer-motion';
import {
  ArrowLeft, BarChart3, Brain, Check, Dices, Megaphone, RotateCcw, Settings2, Siren, Trophy, Volume2, VolumeX, X,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// 1. Constants & palette
// ─────────────────────────────────────────────────────────────────────────────
const COLORS = ['red', 'yellow', 'green', 'blue'];
const PALETTE = {
  red: { base: '#C3333A', shade: '#9F252C', name: 'Crimson', key: 'R' },
  yellow: { base: '#E6A42B', shade: '#C4861A', name: 'Amber', key: 'Y' },
  green: { base: '#1B8257', shade: '#126543', name: 'Emerald', key: 'G' },
  blue: { base: '#24509F', shade: '#1A3C7E', name: 'Cobalt', key: 'B' },
  wild: { base: '#2B2C30', shade: '#1F2023', name: 'Wild', key: '' },
};
const CREAM = '#FBF7EF';
const INK = '#26272B';
const TABLE = '#E8E2D6';
const MAT = '#DED6C7';
const WELL = '#D3CAB9';
const SEAT_TONES = ['#26272B', '#7B5E96', '#3E7D84', '#AD5F3B'];
const FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

const HAND_SIZE = 7;
const UNO_GRACE_MS = 2000; // time to tap UNOFFICIAL! after dropping to one card
const EXPOSE_REACT_MS = 900; // AI waits this long after an exposure so a human can still catch it
const OPPONENT_NAMES = ['Mara', 'Theo', 'Juno'];

const SPEEDS = {
  normal: { label: 'Normal', anim: 1, think: 720 },
  fast: { label: 'Fast', anim: 1 / 1.5, think: 420 },
  turbo: { label: 'Turbo', anim: 0.5, think: 0 },
};
const EASE_PLAY = [0.2, 0.75, 0.25, 1]; // quick lift, soft landing
const EASE_DRAW = [0.34, 1.42, 0.64, 1]; // elastic overshoot into the hand
const EASE_DEAL = [0.25, 0.9, 0.3, 1];

const SHADOW_REST = '0 1px 1px rgba(38,32,24,0.10), 0 2px 4px rgba(38,32,24,0.10), 0 6px 14px -4px rgba(38,32,24,0.20)';
const SHADOW_LIFT = '0 2px 2px rgba(38,32,24,0.08), 0 10px 18px -4px rgba(38,32,24,0.24), 0 24px 36px -12px rgba(38,32,24,0.32)';
const SHADOW_SMALL = '0 1px 1px rgba(38,32,24,0.14), 0 2px 5px -1px rgba(38,32,24,0.18)';

const SETTINGS_KEY = 'unofficial.settings.v1';
const STATS_KEY = 'unofficial.stats.v1';
const DEFAULT_SETTINGS = { opponents: 2, difficulties: ['strategic', 'easy', 'strategic'], stacking: true, speed: 'normal', sound: true };
const DEFAULT_STATS = { played: 0, wins: 0, points: 0, bestRound: 0, streak: 0, bestStreak: 0, cardsPlayed: 0, unoCalls: 0, catches: 0, caught: 0 };

// ─────────────────────────────────────────────────────────────────────────────
// 2. Deck & card-matching utilities
// ─────────────────────────────────────────────────────────────────────────────
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
const rand = (lo, hi) => lo + Math.random() * (hi - lo);
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
 *   • it is wild
 *   • it matches the active colour (wilds set the active colour)
 *   • it matches the top card's number, or its action symbol
 */
function isPlayable(card, s) {
  if (s.pendingDraw > 0) return s.rules.stacking && canStack(card, s.pendingType);
  if (isWild(card)) return true;
  if (card.color === s.currentColor) return true;
  const top = topEntry(s)?.card;
  if (!top) return true;
  if (card.type === 'number') return top.type === 'number' && top.value === card.value;
  return card.type === top.type;
}

const COLOR_ORDER = { red: 0, yellow: 1, green: 2, blue: 3, wild: 4 };
const TYPE_ORDER = { number: 0, skip: 1, reverse: 2, draw2: 3, wild: 4, wild4: 5 };
/** Hands are kept sorted by colour, then type, then value — easier to scan, and keys 1–9 stay predictable. */
const sortHand = (hand) => hand.slice().sort((a, b) =>
  COLOR_ORDER[a.color] - COLOR_ORDER[b.color] || TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || (a.value ?? 0) - (b.value ?? 0));

function cardLabel(c) {
  const col = isWild(c) ? '' : `${PALETTE[c.color].name} `;
  switch (c.type) {
    case 'number': return `${col}${c.value}`;
    case 'skip': return `${col}Skip`;
    case 'reverse': return `${col}Reverse`;
    case 'draw2': return `${col}Draw 2`;
    case 'wild': return 'Wild';
    default: return 'Wild Draw 4';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Rules engine — pure reducer
// ─────────────────────────────────────────────────────────────────────────────
const INITIAL_STATE = {
  phase: 'MENU', players: [], drawPile: [], discard: [], currentColor: null, current: 0, direction: 1,
  pendingDraw: 0, pendingType: null, hasDrawn: false, drawnCardId: null, turnKey: 0, winner: null,
  roundPoints: 0, rules: { stacking: true }, lastDraw: null,
};

const newPlayer = (id, name, isHuman, difficulty) => ({
  id, name, isHuman, difficulty, hand: [],
  uno: 'none', // 'none' | 'grace' (2 s to call) | 'called' | 'exposed' (missed it, can be caught) | 'caught'
  unoDeadline: 0, exposedAt: 0,
  armed: false, // pressed UNOFFICIAL! with two cards, before playing the second-to-last one
  lacks: [], // colours this player was seen unable to follow (strategic AI memory)
  lead: null, // colour this player last pushed (strategic AI memory)
});

const patchPlayer = (players, i, patch) =>
  players.map((p, j) => (j === i ? { ...p, ...(typeof patch === 'function' ? patch(p) : patch) } : p));

const TURN_PHASES = ['PLAYER_TURN', 'AI_TURN'];
const LIVE_PHASES = ['DEAL', 'PLAYER_TURN', 'AI_TURN', 'TRANSITION'];

function gameReducer(s, a) {
  switch (a.type) {
    // MENU / GAME_OVER → DEAL: fresh players, a pre-shuffled deck (shuffling happens outside so the reducer stays pure).
    case 'NEW_GAME': {
      const players = [newPlayer(0, 'You', true, null), ...a.opponents.map((o, i) => newPlayer(i + 1, o.name, false, o.difficulty))];
      return { ...INITIAL_STATE, phase: 'DEAL', players, drawPile: a.deck, current: a.starter, rules: { stacking: a.stacking } };
    }

    // Draw pile ran dry: everything under the top discard becomes the new (pre-shuffled) draw pile.
    case 'RESHUFFLE': {
      if (s.drawPile.length || s.discard.length < 2) return s;
      return { ...s, drawPile: a.pile, discard: [topEntry(s)] };
    }

    // One card from the top of the draw pile into a hand (used by dealing, drawing, penalties and catches).
    case 'DRAW_ONE': {
      if (!LIVE_PHASES.includes(s.phase) || !s.drawPile.length) return s;
      const card = s.drawPile[s.drawPile.length - 1];
      const players = patchPlayer(s.players, a.player, (p) => ({ hand: sortHand([...p.hand, card]), uno: 'none', exposedAt: 0, armed: false }));
      return { ...s, drawPile: s.drawPile.slice(0, -1), players, lastDraw: { player: a.player, card } };
    }

    // DEAL: turn the first discard face up. Action/wild cards are skipped so every round opens on a number.
    case 'FLIP_START': {
      if (s.phase !== 'DEAL') return s;
      let idx = s.drawPile.length - 1;
      while (idx > 0 && s.drawPile[idx].type !== 'number') idx--;
      const card = s.drawPile[idx];
      return {
        ...s,
        drawPile: s.drawPile.filter((_, i) => i !== idx),
        discard: [{ card, color: card.color, rot: a.rot, dx: 0, dy: 0 }],
        currentColor: card.color,
      };
    }

    // DEAL | TRANSITION → PLAYER_TURN | AI_TURN. A player who was exposed is safe once their own turn starts.
    case 'BEGIN_TURN': {
      if (s.phase !== 'DEAL' && s.phase !== 'TRANSITION') return s;
      const pi = s.current;
      const players = patchPlayer(s.players, pi, (q) => ({ armed: false, ...(q.uno === 'exposed' ? { uno: 'none', exposedAt: 0 } : {}) }));
      return { ...s, players, phase: players[pi].isHuman ? 'PLAYER_TURN' : 'AI_TURN', turnKey: s.turnKey + 1, hasDrawn: false, drawnCardId: null };
    }

    // The heart of the rules: validate, move the card, apply its effect, open the UNOFFICIAL! window, pick the next player.
    case 'PLAY_CARD': {
      const { player: pi, cardId, color, now } = a;
      if (!TURN_PHASES.includes(s.phase) || pi !== s.current) return s;
      const p = s.players[pi];
      if (p.isHuman !== (s.phase === 'PLAYER_TURN')) return s;
      const card = p.hand.find((c) => c.id === cardId);
      if (!card || !isPlayable(card, s)) return s;
      if (s.drawnCardId && s.drawnCardId !== cardId) return s; // after drawing, only the drawn card may be played

      const n = s.players.length;
      const hand = p.hand.filter((c) => c.id !== cardId);
      const chosen = isWild(card) ? (COLORS.includes(color) ? color : 'red') : card.color;
      let { direction, pendingDraw, pendingType } = s;
      let skip = 0;
      if (card.type === 'reverse') { direction = -direction; if (n === 2) skip = 1; } // 2 players: Reverse acts as Skip
      if (card.type === 'skip') skip = 1;
      if (card.type === 'draw2') { pendingDraw += 2; pendingType = 'draw2'; } // next player stacks or draws
      if (card.type === 'wild4') { pendingDraw += 4; pendingType = 'wild4'; }

      // UNOFFICIAL! window: pre-called → safe; otherwise a 2-second grace period starts now.
      let uno = 'none';
      let unoDeadline = 0;
      if (hand.length === 1) {
        if (p.armed) uno = 'called';
        else { uno = 'grace'; unoDeadline = now + UNO_GRACE_MS; }
      }
      const players = patchPlayer(s.players, pi, (q) => ({
        hand, uno, unoDeadline, exposedAt: 0, armed: false, lacks: q.lacks.filter((c) => c !== chosen), lead: chosen,
      }));
      const discard = [...s.discard, { card, color: chosen, rot: a.rot ?? 0, dx: a.dx ?? 0, dy: a.dy ?? 0 }];
      const base = { ...s, players, discard, currentColor: chosen, direction, pendingDraw, pendingType, hasDrawn: false, drawnCardId: null };

      if (hand.length === 0) {
        // Round over: the winner scores the value of every card left in opponents' hands.
        const roundPoints = players.reduce((t, q, i) => (i === pi ? t : t + handPoints(q.hand)), 0);
        return { ...base, phase: 'GAME_OVER', winner: pi, roundPoints, pendingDraw: 0, pendingType: null };
      }
      return { ...base, current: mod(pi + direction * (1 + skip), n), phase: 'TRANSITION' };
    }

    // A non-penalty draw. inferLack lets opponents remember "they couldn't follow this colour".
    case 'MARK_DRAWN': {
      if (!TURN_PHASES.includes(s.phase)) return s;
      const players = a.inferLack
        ? patchPlayer(s.players, s.current, (q) => ({ lacks: q.lacks.includes(s.currentColor) ? q.lacks : [...q.lacks, s.currentColor] }))
        : s.players;
      return { ...s, players, hasDrawn: true, drawnCardId: a.cardId };
    }

    // Penalty cards taken: the stack is cleared; the victim's turn then ends via END_TURN.
    case 'ACCEPT_PENALTY':
      return { ...s, pendingDraw: 0, pendingType: null, players: patchPlayer(s.players, s.current, { lacks: [] }) };

    // PLAYER_TURN | AI_TURN → TRANSITION (pass, or turn lost to a penalty).
    case 'END_TURN': {
      if (!TURN_PHASES.includes(s.phase)) return s;
      return {
        ...s, current: mod(s.current + s.direction, s.players.length), phase: 'TRANSITION',
        hasDrawn: false, drawnCardId: null, players: patchPlayer(s.players, s.current, { armed: false }),
      };
    }

    // UNOFFICIAL! — either pre-arm (2 cards, own turn) or call inside the 2-second grace window.
    case 'CALL_UNO': {
      const p = s.players[a.player];
      if (!p || !LIVE_PHASES.includes(s.phase)) return s;
      if (p.uno === 'grace' && p.hand.length === 1) return { ...s, players: patchPlayer(s.players, a.player, { uno: 'called' }) };
      if (p.hand.length === 2 && s.current === a.player && TURN_PHASES.includes(s.phase) && !p.armed) {
        return { ...s, players: patchPlayer(s.players, a.player, { armed: true }) };
      }
      return s;
    }

    // Grace window ran out without a call → the player is exposed and can be challenged.
    case 'UNO_EXPIRE': {
      const p = s.players[a.player];
      if (!p || p.uno !== 'grace' || a.now < p.unoDeadline || !LIVE_PHASES.includes(s.phase)) return s;
      return { ...s, players: patchPlayer(s.players, a.player, { uno: 'exposed', exposedAt: a.now }) };
    }

    // Successful challenge: mark as caught (the two penalty cards follow as DRAW_ONE actions).
    case 'CHALLENGE': {
      const p = s.players[a.target];
      if (!p || p.uno !== 'exposed' || p.hand.length !== 1 || !LIVE_PHASES.includes(s.phase)) return s;
      return { ...s, players: patchPlayer(s.players, a.target, { uno: 'caught' }) };
    }

    default:
      return s;
  }
}

/** Synchronous store: dispatch() returns the next state immediately, so async animation sequences never read stale state. */
function useGameStore() {
  const ref = useRef(INITIAL_STATE);
  const [, force] = useReducer((x) => x + 1, 0);
  const dispatch = useCallback((action) => {
    const prev = ref.current;
    const next = gameReducer(prev, action);
    if (next !== prev) { ref.current = next; force(); }
    return next;
  }, []);
  return [ref.current, dispatch, ref];
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. AI opponents
// ─────────────────────────────────────────────────────────────────────────────
const nextSeat = (s, from, steps = 1) => mod(from + s.direction * steps, s.players.length);

/** Strategic colour choice: our deepest suit, nudged toward colours the next player can't follow and away from their lead. */
function aiBestColor(s, pi, played) {
  const p = s.players[pi];
  const rest = p.hand.filter((c) => c.id !== played?.id && !isWild(c));
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
  const threat = next.hand.length <= 2 ? 3 - next.hand.length : 0; // 1 or 2 when the next player is close to out
  let score = 0;

  // Save wilds — they're the only cards that are always playable.
  if (card.type === 'wild') score -= 28;
  if (card.type === 'wild4') score -= 36 - threat * 30;
  // Dump high-value number cards early (they count against us if someone else goes out).
  if (card.type === 'number') score += card.value * 0.5;
  // Attack when the next player is close to winning.
  if (card.type === 'skip' || (card.type === 'reverse' && n === 2)) score += 4 + threat * 14;
  if (card.type === 'draw2') score += 6 + threat * 18;
  if (card.type === 'reverse' && n > 2) {
    const prev = s.players[nextSeat(s, pi, -1)];
    score += next.hand.length < prev.hand.length ? 8 + threat * 8 : -3;
  }
  // Colour control: keep playing into our deepest suit.
  const deep = rest.filter((c) => c.color === color).length;
  score += deep * 4;
  if (!isWild(card) && card.color !== s.currentColor) score += (deep - rest.filter((c) => c.color === s.currentColor).length) * 2;
  // Counter opponent colour leads.
  if (next.lacks.includes(color)) score += 10;
  if (next.lead === color) score -= 7;
  // End game: keep a wild as the final card — it can always be played.
  if (rest.length === 1 && isWild(rest[0]) && !isWild(card)) score += 15;
  return score + Math.random() * 1.5;
}

/** Returns { type:'play', cardId, color } or { type:'draw' } for a normal (non-penalty) turn. */
function aiChooseMove(s, pi) {
  const p = s.players[pi];
  const playable = p.hand.filter((c) => isPlayable(c, s));
  if (!playable.length) return { type: 'draw' };
  if (p.difficulty !== 'strategic') {
    const card = pick(playable); // Easy: any legal card, any colour
    return { type: 'play', cardId: card.id, color: isWild(card) ? pick(COLORS) : null };
  }
  let best = null;
  let bestScore = -Infinity;
  for (const card of playable) {
    const color = isWild(card) ? aiBestColor(s, pi, card) : card.color;
    const sc = scoreStrategic(s, pi, card, color);
    if (sc > bestScore) { bestScore = sc; best = { card, color }; }
  }
  return { type: 'play', cardId: best.card.id, color: isWild(best.card) ? best.color : null };
}

/** Facing a pending +2/+4: stack (if allowed and wanted) or return null to take the cards. */
function aiChooseStack(s, pi) {
  if (!s.rules.stacking) return null;
  const p = s.players[pi];
  const options = p.hand.filter((c) => canStack(c, s.pendingType));
  if (!options.length) return null;
  if (p.difficulty !== 'strategic') {
    if (Math.random() < 0.5) return null;
    const c = pick(options);
    return { cardId: c.id, color: isWild(c) ? pick(COLORS) : null };
  }
  const c = options.find((o) => o.type === 'draw2') || options[0]; // spend a +2 before a +4
  return { cardId: c.id, color: isWild(c) ? aiBestColor(s, pi, c) : null };
}

/** After drawing a playable card: Easy usually plays it; Strategic keeps a drawn wild while its hand is still big. */
function aiWantsDrawn(s, pi, card) {
  const p = s.players[pi];
  if (p.difficulty !== 'strategic') return Math.random() < 0.75;
  return !(isWild(card) && p.hand.length > 3);
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Audio engine — everything synthesised on the fly
// ─────────────────────────────────────────────────────────────────────────────
const Sound = (() => {
  let ctx = null;
  let master = null;
  let noiseBuf = null;
  let enabled = true;

  function ensure() {
    if (!enabled || typeof window === 'undefined') return null;
    try {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.55;
        const comp = ctx.createDynamicsCompressor();
        master.connect(comp);
        comp.connect(ctx.destination);
        noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.6), ctx.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    } catch {
      return null;
    }
  }

  function tone({ freq, to, dur = 0.12, type = 'sine', gain = 0.25, at = 0 }) {
    const c = ensure();
    if (!c) return;
    const t0 = c.currentTime + at;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(master);
    o.start(t0);
    o.stop(t0 + dur + 0.03);
  }

  function noise({ dur = 0.06, freq = 2000, to, q = 1, gain = 0.3, at = 0 }) {
    const c = ensure();
    if (!c) return;
    const t0 = c.currentTime + at;
    const src = c.createBufferSource();
    src.buffer = noiseBuf;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(freq, t0);
    f.Q.value = q;
    if (to) f.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t0, Math.random() * 0.3);
    src.stop(t0 + dur + 0.03);
  }

  return {
    setEnabled(v) { enabled = v; },
    unlock() { ensure(); },
    flip() { noise({ dur: 0.05, freq: 3400, q: 1.4, gain: 0.2 }); },
    deal() { noise({ dur: 0.045, freq: 2600, to: 4200, q: 1.6, gain: 0.14 }); },
    play() { noise({ dur: 0.07, freq: 1500, q: 0.9, gain: 0.36 }); tone({ freq: 150, to: 70, dur: 0.1, gain: 0.3 }); },
    draw() { noise({ dur: 0.11, freq: 800, to: 3000, q: 1.1, gain: 0.2 }); },
    uno() { tone({ freq: 659.25, dur: 0.1, type: 'triangle', gain: 0.3 }); tone({ freq: 987.77, dur: 0.2, type: 'triangle', gain: 0.3, at: 0.085 }); },
    wild() {
      [523.25, 659.25, 783.99].forEach((f, i) => tone({ freq: f, dur: 0.16, gain: 0.13, at: i * 0.035 }));
      noise({ dur: 0.24, freq: 1200, to: 5200, q: 0.7, gain: 0.07 });
    },
    penalty() { tone({ freq: 240, to: 150, dur: 0.22, type: 'square', gain: 0.06 }); },
    alarm() { tone({ freq: 880, dur: 0.07, type: 'square', gain: 0.06 }); tone({ freq: 660, dur: 0.12, type: 'square', gain: 0.06, at: 0.08 }); },
    turn() { tone({ freq: 1320, dur: 0.05, gain: 0.07 }); },
    tick() { tone({ freq: 1800, dur: 0.025, gain: 0.04 }); },
    error() { tone({ freq: 160, dur: 0.09, type: 'triangle', gain: 0.14 }); },
    win() {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone({ freq: f, dur: 0.5, type: 'triangle', gain: 0.17, at: i * 0.085 }));
      [1046.5, 1318.5, 1568].forEach((f) => tone({ freq: f, dur: 0.9, gain: 0.06, at: 0.38 }));
    },
    lose() { [392, 329.63, 261.63].forEach((f, i) => tone({ freq: f, dur: 0.28, type: 'triangle', gain: 0.13, at: i * 0.12 })); },
  };
})();

// ─────────────────────────────────────────────────────────────────────────────
// 6. Persistence & small hooks
// ─────────────────────────────────────────────────────────────────────────────
function loadJSON(key) {
  try { return JSON.parse(window.localStorage.getItem(key)) || {}; } catch { return {}; }
}
function saveJSON(key, value) {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable — keep in memory */ }
}
function useLatest(value) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
function useViewport() {
  const read = () => (typeof window === 'undefined' ? { w: 1280, h: 800 } : { w: window.innerWidth, h: window.innerHeight });
  const [vp, setVp] = useState(read);
  useEffect(() => {
    const on = () => setVp(read());
    window.addEventListener('resize', on);
    window.addEventListener('orientationchange', on);
    return () => { window.removeEventListener('resize', on); window.removeEventListener('orientationchange', on); };
  }, []);
  return vp;
}
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

// ─────────────────────────────────────────────────────────────────────────────
// 7. Geometry
// ─────────────────────────────────────────────────────────────────────────────
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const HAND_PAD = 26; // headroom above the fan for lifted / hovered cards
const LIFT_PLAYABLE = 8;
const LIFT_SELECTED = 22;
const cardRadius = (w) => Math.round(w * 0.095);

/** Every size on the table derives from the viewport, so phones and wide screens share one code path. */
function computeSizes(w, h) {
  const wide = w >= 768 && h >= 560;
  const coarse = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;
  return {
    wide,
    coarse,
    pile: Math.round(clamp(Math.min(w * 0.2, h * 0.14), 54, 112)),
    hand: Math.round(clamp(Math.min(w * 0.19, h * 0.15), 54, 104)),
    opp: Math.round(wide ? clamp(h * 0.05, 30, 46) : clamp(Math.min(w * 0.062, h * 0.045), 20, 30)),
    minStep: wide && !coarse ? 30 : 44, // visible sliver of each card ≥ 44 px on touch screens
    handWidth: Math.min(w - 16, 1120),
  };
}

/**
 * Fan layout for the player's hand. Cards overlap more as the hand grows; when the visible
 * sliver of each card would drop below `minStep`, the hand wraps into up to three staggered rows,
 * so even 20+ cards stay on screen with comfortable touch targets.
 * Returns slot centres relative to the hand container (x from centre, y from top before HAND_PAD).
 */
function handLayout(n, { width, cardW, minStep }) {
  const cardH = cardW * 1.4;
  if (!n) return { slots: [], height: HAND_PAD + cardH };
  const usable = Math.max(cardW, width - 8);
  const perRowMax = Math.max(1, Math.floor((usable - cardW) / minStep) + 1);
  const rows = Math.min(3, Math.ceil(n / perRowMax));
  const perRow = Math.ceil(n / rows);
  const rowGap = Math.max(44, Math.round(cardH * 0.4));
  const slots = [];
  let maxArc = 0;
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / perRow);
    const inRow = Math.min(perRow, n - row * perRow);
    const col = i - row * perRow;
    const step = inRow > 1 ? Math.min(cardW * 0.7, (usable - cardW) / (inRow - 1)) : 0;
    const off = col - (inRow - 1) / 2;
    const t = inRow > 1 ? off / ((inRow - 1) / 2) : 0; // −1 … 1 across the row
    const spread = Math.min(14, 3 + inRow * 1.25);
    const arc = Math.min(cardH * 0.1, 2 + inRow * 1.6);
    maxArc = Math.max(maxArc, arc);
    slots.push({ x: off * step, y: row * rowGap + t * t * arc, rot: t * spread });
  }
  return { slots, height: HAND_PAD + (rows - 1) * rowGap + cardH + maxArc + 6 };
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Visual components
// ─────────────────────────────────────────────────────────────────────────────
const CSS = `
.uo-spin{animation:uo-spin 26s linear infinite}
@keyframes uo-spin{to{transform:rotate(360deg)}}
.uo-pulse{animation:uo-pulse 1.4s ease-out infinite}
@keyframes uo-pulse{0%{box-shadow:0 0 0 0 var(--uo-pulse,rgba(38,39,43,.35))}100%{box-shadow:0 0 0 12px rgba(0,0,0,0)}}
.uo-breathe{animation:uo-breathe 1.3s ease-in-out infinite}
@keyframes uo-breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.045)}}
.uo-shrink{animation:uo-shrink 2s linear forwards;transform-origin:left center}
@keyframes uo-shrink{from{transform:scaleX(1)}to{transform:scaleX(0)}}
.uo-dot{animation:uo-dot 1s ease-in-out infinite}
@keyframes uo-dot{0%,80%,100%{opacity:.25;transform:translateY(0)}40%{opacity:1;transform:translateY(-2px)}}
@media (prefers-reduced-motion:reduce){.uo-spin,.uo-pulse,.uo-breathe,.uo-dot{animation:none!important}}
`;

// SVG pie quadrants for wild cards (radius 31, centred at 0,0).
const QUADS = [
  ['red', 'M0 0 L0 -31 A31 31 0 0 1 31 0 Z'],
  ['blue', 'M0 0 L31 0 A31 31 0 0 1 0 31 Z'],
  ['yellow', 'M0 0 L0 31 A31 31 0 0 1 -31 0 Z'],
  ['green', 'M0 0 L-31 0 A31 31 0 0 1 0 -31 Z'],
];

function GlyphText({ text, size, y, fill }) {
  return (
    <text x="0" y={y} textAnchor="middle" fontSize={size} fontWeight="900" fontStyle="italic" fill={fill} fontFamily={FONT} letterSpacing="-1.5">
      {text}
    </text>
  );
}

/** Symbol for a card, drawn in one colour (called twice: once as an offset shadow, once in ink). */
function glyph(card, fill, corner) {
  const sw = corner ? 6.5 : 5.5;
  switch (card.type) {
    case 'number':
      return (
        <g>
          <GlyphText text={card.value} size={corner ? 17 : 46} y={corner ? 6 : 16.5} fill={fill} />
          {(card.value === 6 || card.value === 9) && (
            <rect x={corner ? -4 : -10} y={corner ? 8.5 : 22} width={corner ? 8 : 20} height={corner ? 1.8 : 3.6} rx="1" fill={fill} />
          )}
        </g>
      );
    case 'skip':
      return (
        <g transform={corner ? 'scale(0.4)' : undefined} fill="none" stroke={fill} strokeWidth={sw} strokeLinecap="round">
          <circle r="15" />
          <path d="M-10.6 10.6 L10.6 -10.6" />
        </g>
      );
    case 'reverse':
      return (
        <g transform={corner ? 'scale(0.4)' : undefined} fill="none" stroke={fill} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
          <path d="M-14 5 V-4 a8 8 0 0 1 8 -8 H12" />
          <path d="M6 -19 L13 -12 L6 -5" />
          <path d="M14 -5 V4 a8 8 0 0 1 -8 8 H-12" />
          <path d="M-6 19 L-13 12 L-6 5" />
        </g>
      );
    case 'draw2':
      return <GlyphText text="+2" size={corner ? 14 : 38} y={corner ? 5 : 13.5} fill={fill} />;
    case 'wild4':
      return corner ? <GlyphText text="+4" size={14} y={5} fill={fill} /> : null;
    default:
      return null;
  }
}

/** Face of a card as crisp vector art (viewBox 100 × 140). */
const CardFace = memo(function CardFace({ card, w, chosen = null, dim = false }) {
  const h = Math.round(w * 1.4);
  const pal = PALETTE[card.color];
  const ink = card.color === 'yellow' ? '#3A2907' : CREAM;
  const wild = isWild(card);
  const corner = (
    <g>
      {wild && card.type === 'wild' ? (
        <g transform="scale(0.24) rotate(-20)">
          {QUADS.map(([c, d]) => <path key={c} d={d} fill={PALETTE[c].base} stroke={pal.base} strokeWidth="4" />)}
        </g>
      ) : (
        glyph(card, ink, true)
      )}
    </g>
  );
  return (
    <svg width={w} height={h} viewBox="0 0 100 140" className="block" aria-hidden="true">
      <rect x="0.5" y="0.5" width="99" height="139" rx="9.5" fill={CREAM} stroke="rgba(30,25,20,0.14)" />
      <rect x="5" y="5" width="90" height="130" rx="6.5" fill={pal.base} />
      {/* inner inset shadow + top highlight for a printed, tactile edge */}
      <rect x="6" y="6" width="88" height="128" rx="5.6" fill="none" stroke="rgba(0,0,0,0.17)" strokeWidth="2" />
      <path d="M12 6.4 H88" stroke="rgba(255,255,255,0.28)" strokeWidth="1" />
      <g transform="translate(50 70)">
        {wild ? (
          <>
            <g transform="rotate(-20)">
              {QUADS.map(([c, d]) => (
                <path key={c} d={d} fill={PALETTE[c].base} stroke={pal.base} strokeWidth="2" opacity={chosen && chosen !== c ? 0.25 : 1} />
              ))}
            </g>
            {card.type === 'wild4' && (
              <>
                <circle r="15.5" fill={pal.base} />
                <GlyphText text="+4" size={20} y={7} fill={CREAM} />
              </>
            )}
            <circle r="34.5" fill="none" stroke={chosen ? PALETTE[chosen].base : CREAM} strokeOpacity={chosen ? 1 : 0.3} strokeWidth={chosen ? 3.5 : 1} />
          </>
        ) : (
          <>
            <circle r="31" fill={pal.shade} />
            <circle r="34.5" fill="none" stroke={ink} strokeOpacity="0.32" strokeWidth="1" />
            <g transform="translate(1.6 1.6)">{glyph(card, 'rgba(0,0,0,0.24)', false)}</g>
            {glyph(card, ink, false)}
          </>
        )}
      </g>
      <g transform="translate(15 21)">{corner}</g>
      <g transform="rotate(180 50 70) translate(15 21)">{corner}</g>
      {dim && <rect x="0" y="0" width="100" height="140" rx="9.5" fill={TABLE} fillOpacity="0.42" />}
    </svg>
  );
});

const CardBack = memo(function CardBack({ w }) {
  const h = Math.round(w * 1.4);
  return (
    <svg width={w} height={h} viewBox="0 0 100 140" className="block" aria-hidden="true">
      <rect x="0.5" y="0.5" width="99" height="139" rx="9.5" fill={CREAM} stroke="rgba(30,25,20,0.14)" />
      <rect x="5" y="5" width="90" height="130" rx="6.5" fill={PALETTE.wild.base} />
      <rect x="6" y="6" width="88" height="128" rx="5.6" fill="none" stroke="rgba(0,0,0,0.3)" strokeWidth="2" />
      <rect x="11" y="11" width="78" height="118" rx="4" fill="none" stroke={CREAM} strokeOpacity="0.14" />
      <g transform="translate(50 70) rotate(-24)">
        <rect x="-42" y="-14" width="84" height="28" rx="14" fill={PALETTE.red.base} />
        <text y="5.2" textAnchor="middle" fontSize="14.5" fontWeight="900" fontStyle="italic" fill={CREAM} fontFamily={FONT} letterSpacing="-0.4">
          UnOfficial
        </text>
      </g>
      {COLORS.map((c, i) => <rect key={c} x={32 + i * 9.5} y="119" width="7" height="3" rx="1.5" fill={PALETTE[c].base} />)}
      {COLORS.map((c, i) => <rect key={`t${c}`} x={32 + i * 9.5} y="18" width="7" height="3" rx="1.5" fill={PALETTE[COLORS[3 - i]].base} />)}
    </svg>
  );
});

/**
 * A card in flight between two screen points (deck → hand, hand → pile, seat → pile…).
 * Position follows a quadratic Bézier arc driven by one progress value; it flips in 3D when
 * the face changes, and `to` may be a function so it can track a hand that reflows mid-flight.
 */
function FlyingCard({ f, base, onDone }) {
  const W = base;
  const H = Math.round(base * 1.4);
  const x = useMotionValue(f.from.x - W / 2);
  const y = useMotionValue(f.from.y - H / 2);
  const rotate = useMotionValue(f.from.rot);
  const scale = useMotionValue(f.from.s);
  const rotateY = useMotionValue(f.faceFrom ? 0 : 180);

  useEffect(() => {
    const getTo = typeof f.to === 'function' ? f.to : () => f.to;
    const ctl = animate(0, 1, {
      duration: f.duration,
      delay: f.delay || 0,
      ease: f.ease,
      onUpdate: (t) => {
        const to = getTo();
        const cx = (f.from.x + to.x) / 2;
        const cy = Math.min(f.from.y, to.y) - f.arc;
        const u = 1 - t;
        x.set(u * u * f.from.x + 2 * u * t * cx + t * t * to.x - W / 2);
        y.set(u * u * f.from.y + 2 * u * t * cy + t * t * to.y - H / 2);
        rotate.set(f.from.rot + (to.rot - f.from.rot) * t);
        const tc = clamp(t, 0, 1);
        scale.set(f.from.s + (to.s - f.from.s) * t + Math.sin(Math.PI * tc) * (f.pop ?? 0.08));
        if (f.faceFrom !== f.faceTo) rotateY.set((f.faceFrom ? 0 : 180) + (f.faceTo ? -180 : 180) * Math.min(1, tc * 1.6));
      },
      onComplete: () => onDone(f.id),
    });
    return () => ctl.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const face = { position: 'absolute', inset: 0, backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' };
  return (
    <motion.div style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, x, y, rotate, scale, zIndex: 1 }}>
      <motion.div style={{ width: '100%', height: '100%', position: 'relative', rotateY, transformPerspective: 900, transformStyle: 'preserve-3d' }}>
        <div style={{ ...face, borderRadius: cardRadius(W), boxShadow: SHADOW_LIFT }}>
          <CardFace card={f.card} w={W} chosen={f.chosen} />
        </div>
        <div style={{ ...face, transform: 'rotateY(180deg)', borderRadius: cardRadius(W), boxShadow: SHADOW_LIFT }}>
          <CardBack w={W} />
        </div>
      </motion.div>
    </motion.div>
  );
}

function Wordmark({ size = 20 }) {
  const sq = Math.round(size * 0.78);
  return (
    <div className="flex items-center select-none" style={{ gap: size * 0.4 }} aria-label="UnOfficial">
      <span className="grid grid-cols-2" style={{ width: sq, height: sq, gap: Math.max(1.5, size * 0.08) }}>
        {['red', 'yellow', 'blue', 'green'].map((c) => <span key={c} style={{ background: PALETTE[c].base, borderRadius: size * 0.1 }} />)}
      </span>
      <span className="font-black italic leading-none" style={{ fontSize: size, letterSpacing: '-0.035em', color: INK }}>
        Un<span style={{ color: PALETTE.red.base }}>Official</span>
      </span>
    </div>
  );
}

function IconButton({ label, onClick, children, active = false }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid h-11 w-11 place-items-center rounded-full transition-colors duration-150 hover:bg-black/5 active:bg-black/10"
      style={{ color: active ? PALETTE.red.base : INK }}
    >
      {children}
    </button>
  );
}

function Segmented({ value, options, onChange, id }) {
  return (
    <div role="radiogroup" aria-label={id} className="inline-flex rounded-full p-1" style={{ background: 'rgba(38,39,43,0.07)' }}>
      {options.map((o) => {
        const on = o.value === value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className="relative flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full px-3.5 text-sm font-semibold transition-colors duration-150"
            style={{ color: on ? CREAM : 'rgba(38,39,43,0.68)' }}
          >
            {on && (
              <motion.span layoutId={`seg-${id}`} className="absolute inset-0 rounded-full" style={{ background: INK }}
                transition={{ type: 'spring', stiffness: 650, damping: 42 }} />
            )}
            <span className="relative flex items-center gap-1.5">{Icon && <Icon size={14} strokeWidth={2.4} />}{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function Toggle({ checked, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
      className="relative inline-flex h-11 w-[60px] shrink-0 items-center">
      <span className="absolute inset-x-0 top-1/2 h-7 -translate-y-1/2 rounded-full transition-colors duration-200"
        style={{ background: checked ? PALETTE.green.base : 'rgba(38,39,43,0.2)' }} />
      <motion.span className="relative ml-1 h-5 w-5 rounded-full" style={{ background: CREAM, boxShadow: '0 1px 2px rgba(0,0,0,0.3)' }}
        initial={false} animate={{ x: checked ? 32 : 0 }} transition={{ type: 'spring', stiffness: 700, damping: 40 }} />
    </button>
  );
}

function Avatar({ index, name, size = 28 }) {
  return (
    <span className="grid shrink-0 place-items-center rounded-full font-black italic"
      style={{ width: size, height: size, background: SEAT_TONES[index], color: CREAM, fontSize: size * 0.46 }}>
      {name[0]}
    </span>
  );
}

function SetupPanel({ settings, onChange, scope }) {
  const set = (patch) => onChange({ ...settings, ...patch });
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-sm font-bold">Opponents</div>
          <div className="text-xs" style={{ color: 'rgba(38,39,43,0.55)' }}>Seats around the table</div>
        </div>
        <Segmented id={`${scope}-opponents`} value={settings.opponents} onChange={(v) => set({ opponents: v })}
          options={[1, 2, 3].map((n) => ({ value: n, label: String(n) }))} />
      </div>
      <div className="flex flex-col gap-2">
        {Array.from({ length: settings.opponents }, (_, i) => (
          <div key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl px-3 py-2" style={{ background: 'rgba(38,39,43,0.045)' }}>
            <div className="flex min-w-0 items-center gap-2.5">
              <Avatar index={i + 1} name={OPPONENT_NAMES[i]} />
              <div className="min-w-0">
                <div className="text-sm font-semibold">{OPPONENT_NAMES[i]}</div>
                <div className="text-xs" style={{ color: 'rgba(38,39,43,0.55)' }}>
                  {settings.difficulties[i] === 'strategic' ? 'Saves wilds, reads your colors' : 'Plays whatever fits'}
                </div>
              </div>
            </div>
            <Segmented id={`${scope}-difficulty-${i}`} value={settings.difficulties[i]}
              onChange={(v) => { const d = settings.difficulties.slice(); d[i] = v; set({ difficulties: d }); }}
              options={[{ value: 'easy', label: 'Easy', icon: Dices }, { value: 'strategic', label: 'Strategic', icon: Brain }]} />
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-bold">Game speed</div>
          <div className="text-xs" style={{ color: 'rgba(38,39,43,0.55)' }}>Turbo makes AI moves instant</div>
        </div>
        <Segmented id={`${scope}-speed`} value={settings.speed} onChange={(v) => set({ speed: v })}
          options={Object.entries(SPEEDS).map(([k, v]) => ({ value: k, label: v.label }))} />
      </div>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-bold">Stack draw cards</div>
          <div className="text-xs" style={{ color: 'rgba(38,39,43,0.55)' }}>+2 on +2, and +4 on any draw card</div>
        </div>
        <Toggle label="Stack draw cards" checked={settings.stacking} onChange={(v) => set({ stacking: v })} />
      </div>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-bold">Sound</div>
          <div className="text-xs" style={{ color: 'rgba(38,39,43,0.55)' }}>Synthesized live — no audio files</div>
        </div>
        <Toggle label="Sound" checked={settings.sound} onChange={(v) => set({ sound: v })} />
      </div>
    </div>
  );
}

function Modal({ open, onClose, label, width = 520, children }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6"
          style={{ background: 'rgba(32,29,24,0.38)' }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}
          onPointerDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
        >
          <motion.div
            role="dialog" aria-modal="true" aria-label={label}
            className="relative max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl p-5 sm:rounded-3xl sm:p-7"
            style={{ maxWidth: width, background: CREAM, color: INK, boxShadow: '0 30px 60px -20px rgba(30,25,18,0.45), 0 0 0 1px rgba(38,32,24,0.06)' }}
            initial={{ y: 28, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 18, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 560, damping: 42 }}
          >
            {onClose && (
              <button type="button" aria-label="Close" onClick={onClose}
                className="absolute right-3 top-3 grid h-11 w-11 place-items-center rounded-full hover:bg-black/5">
                <X size={18} />
              </button>
            )}
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function PrimaryButton({ children, onClick, kbd, tone = INK, className = '' }) {
  return (
    <motion.button type="button" onClick={onClick} whileTap={{ scale: 0.97 }}
      className={`flex min-h-[48px] items-center justify-center gap-2 rounded-full px-6 text-base font-bold ${className}`}
      style={{ background: tone, color: CREAM, boxShadow: '0 1px 0 rgba(255,255,255,0.15) inset, 0 6px 14px -6px rgba(30,25,18,0.5)' }}>
      {children}
      {kbd && <kbd className="rounded-md px-1.5 py-0.5 text-[11px] font-semibold" style={{ background: 'rgba(251,247,239,0.16)' }}>{kbd}</kbd>}
    </motion.button>
  );
}

function GhostButton({ children, onClick, kbd }) {
  return (
    <motion.button type="button" onClick={onClick} whileTap={{ scale: 0.97 }}
      className="flex min-h-[44px] items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold"
      style={{ background: 'rgba(251,247,239,0.85)', color: INK, boxShadow: '0 0 0 1px rgba(38,32,24,0.12), 0 2px 6px -3px rgba(30,25,18,0.3)' }}>
      {children}
      {kbd && <kbd className="rounded-md px-1.5 py-0.5 text-[11px]" style={{ background: 'rgba(38,39,43,0.08)' }}>{kbd}</kbd>}
    </motion.button>
  );
}

function ThinkingDots({ color = 'currentColor' }) {
  return (
    <span className="inline-flex items-center gap-[3px]" aria-hidden="true">
      {[0, 1, 2].map((i) => <span key={i} className="uo-dot h-1 w-1 rounded-full" style={{ background: color, animationDelay: `${i * 0.15}s` }} />)}
    </span>
  );
}

function Bubble({ text, tone }) {
  const bg = tone === 'red' ? PALETTE.red.base : tone === 'green' ? PALETTE.green.base : INK;
  return (
    <motion.div
      initial={{ opacity: 0, y: -4, scale: 0.85 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 700, damping: 30 }}
      className="pointer-events-none whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-black italic"
      style={{ background: bg, color: CREAM, boxShadow: SHADOW_SMALL }}
    >
      {text}
    </motion.div>
  );
}

/** Opponent seat: a fan of card backs, a name plate, and live call / catch indicators. */
const Seat = memo(function Seat({ player, index, count, active, thinking, compact, cardW, bubble, onCatch, fanRef }) {
  const shown = Math.min(count, compact ? 5 : 8);
  const step = cardW * (compact ? 0.3 : 0.34);
  const fanW = cardW + Math.max(0, shown - 1) * step;
  const h = Math.round(cardW * 1.4);
  const r = cardRadius(cardW);
  const exposed = player.uno === 'exposed';
  const called = player.uno === 'called';
  return (
    <div className="relative flex flex-col items-center" style={{ gap: compact ? 6 : 10 }}>
      <div ref={fanRef} className="relative" style={{ width: Math.max(fanW, cardW), height: h }}>
        {count === 0 && <div className="absolute inset-0 border border-dashed" style={{ borderRadius: r, borderColor: 'rgba(38,39,43,0.2)' }} />}
        {Array.from({ length: shown }, (_, i) => {
          const t = shown > 1 ? i / (shown - 1) - 0.5 : 0;
          return (
            <div key={i} className="absolute top-0"
              style={{ left: i * step, borderRadius: r, boxShadow: SHADOW_SMALL, transform: `rotate(${t * (compact ? 12 : 16)}deg)`, transformOrigin: '50% 120%' }}>
              <CardBack w={cardW} />
            </div>
          );
        })}
      </div>
      <div
        className={`relative flex items-center rounded-full transition-colors duration-200 ${active ? 'uo-pulse' : ''}`}
        style={{
          background: active ? INK : 'rgba(251,247,239,0.8)', color: active ? CREAM : INK,
          padding: compact ? '2px 8px 2px 2px' : '3px 10px 3px 3px', gap: compact ? 5 : 8,
          boxShadow: active ? undefined : '0 0 0 1px rgba(38,32,24,0.08)',
        }}
      >
        <Avatar index={index} name={player.name} size={compact ? 22 : 28} />
        <span className="font-semibold leading-none" style={{ fontSize: compact ? 12 : 14 }}>{player.name}</span>
        {!compact && (player.difficulty === 'strategic'
          ? <Brain size={13} aria-label="Strategic" style={{ opacity: 0.6 }} />
          : <Dices size={13} aria-label="Easy" style={{ opacity: 0.6 }} />)}
        <span className="rounded-full px-1.5 text-[11px] font-bold tabular-nums leading-[18px]"
          style={{ background: active ? 'rgba(251,247,239,0.16)' : 'rgba(38,39,43,0.08)' }}>{count}</span>
        {thinking && <ThinkingDots />}
        {called && <span className="h-2 w-2 rounded-full" style={{ background: PALETTE.red.base }} title="Called UNOFFICIAL!" />}
      </div>
      <div className={`absolute left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-1 ${compact ? 'top-0' : 'top-full mt-1.5'}`}>
        {exposed && (
          <motion.button type="button" onClick={onCatch} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className="uo-pulse flex min-h-[44px] items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-xs font-black italic"
            style={{ background: PALETTE.yellow.base, color: '#3A2907', '--uo-pulse': 'rgba(230,164,43,0.6)' }}>
            <Siren size={14} /> Catch!
          </motion.button>
        )}
        <AnimatePresence>{bubble && <Bubble key={bubble.id} text={bubble.text} tone={bubble.tone} />}</AnimatePresence>
      </div>
    </div>
  );
});

/** Circular arrows that orbit the discard well; flips when play direction reverses. */
function DirectionRing({ direction, size }) {
  return (
    <motion.div className="pointer-events-none absolute" style={{ width: size, height: size }}
      initial={false} animate={{ scaleX: direction }} transition={{ type: 'spring', stiffness: 320, damping: 22 }}>
      <svg viewBox="0 0 100 100" className="uo-spin h-full w-full" aria-hidden="true">
        <circle cx="50" cy="50" r="47" fill="none" stroke={INK} strokeOpacity="0.16" strokeWidth="0.7" strokeDasharray="1.5 3" />
        <path d="M46.5 0.8 L50.5 3 L46.5 5.2" fill="none" stroke={INK} strokeOpacity="0.45" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M53.5 94.8 L49.5 97 L53.5 99.2" fill="none" stroke={INK} strokeOpacity="0.45" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </motion.div>
  );
}

/** The UNOFFICIAL! call button — idle, ready (two cards), counting down (one card), or called. */
function UnoButton({ mode, onClick, deadline, compact }) {
  const ready = mode === 'ready' || mode === 'grace';
  const bg = mode === 'called' ? PALETTE.green.base : ready ? PALETTE.red.base : 'rgba(38,39,43,0.1)';
  const fg = mode === 'idle' ? 'rgba(38,39,43,0.38)' : CREAM;
  return (
    <motion.button
      type="button" onClick={onClick} disabled={!ready} data-uno-btn={mode}
      aria-label="Call UNOFFICIAL! (U)"
      whileTap={ready ? { scale: 0.95 } : undefined}
      className={`relative flex min-h-[48px] items-center gap-2 overflow-hidden rounded-full font-black italic ${ready ? 'uo-breathe' : ''}`}
      style={{
        background: bg, color: fg, padding: compact ? '0 16px' : '0 22px', fontSize: compact ? 15 : 17, letterSpacing: '-0.02em',
        boxShadow: ready ? '0 1px 0 rgba(255,255,255,0.2) inset, 0 8px 18px -8px rgba(159,37,44,0.75)' : 'none',
        cursor: ready ? 'pointer' : 'default',
      }}
    >
      {mode === 'called' ? <Check size={18} strokeWidth={3} /> : <Megaphone size={18} strokeWidth={2.4} />}
      {mode === 'called' ? 'Called!' : 'UNOFFICIAL!'}
      {mode === 'grace' && (
        <span key={deadline} className="uo-shrink absolute bottom-1.5 left-4 right-4 h-[3px] rounded-full" style={{ background: 'rgba(251,247,239,0.85)' }} />
      )}
    </motion.button>
  );
}

function SampleFan({ w }) {
  const cards = [
    { id: 's1', color: 'red', type: 'number', value: 7 },
    { id: 's2', color: 'yellow', type: 'skip' },
    { id: 's3', color: 'wild', type: 'wild4' },
    { id: 's4', color: 'green', type: 'reverse' },
    { id: 's5', color: 'blue', type: 'draw2' },
  ];
  return (
    <div className="relative" style={{ width: w * 3, height: w * 1.4 + 28 }}>
      {cards.map((c, i) => {
        const t = i - 2;
        return (
          <motion.div key={c.id} className="absolute" style={{ left: '50%', top: 8, marginLeft: -w / 2, borderRadius: cardRadius(w), boxShadow: SHADOW_REST, zIndex: i }}
            initial={{ y: 50, opacity: 0, rotate: 0 }}
            animate={{ x: t * w * 0.44, y: Math.abs(t) * 7, rotate: t * 9, opacity: 1 }}
            whileHover={{ y: Math.abs(t) * 7 - 14 }}
            transition={{ delay: 0.06 * i, type: 'spring', stiffness: 420, damping: 30 }}>
            <CardFace card={c} w={w} />
          </motion.div>
        );
      })}
    </div>
  );
}

function StatTile({ label, value, accent }) {
  return (
    <div className="rounded-2xl px-3.5 py-3" style={{ background: 'rgba(38,39,43,0.045)' }}>
      <div className="text-2xl font-black tabular-nums tracking-tight" style={{ color: accent || INK }}>{value}</div>
      <div className="text-xs font-medium" style={{ color: 'rgba(38,39,43,0.58)' }}>{label}</div>
    </div>
  );
}

const winRate = (st) => (st.played ? `${Math.round((st.wins / st.played) * 100)}%` : '—');

// ─────────────────────────────────────────────────────────────────────────────
// 9. <UnOfficial/> — controller + render
// ─────────────────────────────────────────────────────────────────────────────
export default function UnOfficial({ homeHref = null, homeLabel = 'Back' } = {}) {
  const vp = useViewport();
  const reduceMotion = useReducedMotion();
  const base = useMemo(() => computeSizes(vp.w, vp.h), [vp.w, vp.h]);

  const [settings, setSettings] = useState(() => {
    const saved = { ...DEFAULT_SETTINGS, ...loadJSON(SETTINGS_KEY) };
    if (!Array.isArray(saved.difficulties) || saved.difficulties.length < 3) saved.difficulties = DEFAULT_SETTINGS.difficulties;
    if (!SPEEDS[saved.speed]) saved.speed = 'normal';
    saved.opponents = clamp(Number(saved.opponents) || 2, 1, 3);
    return saved;
  });
  const [stats, setStats] = useState(() => ({ ...DEFAULT_STATS, ...loadJSON(STATS_KEY) }));
  const [state, dispatch, store] = useGameStore();

  // Hand layout first, then shrink the centre pile to whatever height is left — big hands on small phones stay on screen.
  const handCount = state.players[0]?.hand.length || 0;
  const oppCount = Math.max(0, state.players.length - 1);
  const layout = useMemo(
    () => handLayout(handCount, { width: base.handWidth, cardW: base.hand, minStep: base.minStep }),
    [handCount, base],
  );
  const sizes = useMemo(() => {
    const tableH = vp.h - 56 - 64 - layout.height - 10; // minus top bar, action bar, hand
    const seatBlock = base.wide ? (oppCount === 2 ? 0 : base.opp * 1.4 + 70) : base.opp * 1.4 + 46;
    const reserve = base.wide ? 118 : 126; // banner, labels, toast room
    return { ...base, pile: Math.round(clamp((tableH - seatBlock - reserve) / 1.82, 44, base.pile)) };
  }, [base, layout.height, vp.h, oppCount]);

  const [flights, setFlights] = useState([]); // cards currently animating between places
  const [picker, setPicker] = useState(null); // { cardId } while choosing a wild colour
  const [selected, setSelected] = useState(null); // keyboard / drawn-card highlight
  const [shake, setShake] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [bubbles, setBubbles] = useState({});
  const [ripple, setRipple] = useState(null);
  const [thud, setThud] = useState(0);
  const [modal, setModal] = useState(null); // 'settings' | 'stats' | null
  const [overOpen, setOverOpen] = useState(false);
  const [match, setMatch] = useState({ key: '', hands: 0, scores: {} });

  const settingsRef = useLatest(settings);
  const reduceRef = useLatest(reduceMotion);
  const pickerRef = useLatest(picker);
  const geomRef = useLatest(sizes);

  const epochRef = useRef(0); // bumps on every new game; stale async sequences check it and bail out
  const busyRef = useRef(false); // an animated sequence owns the table — ignore human input
  const catchingRef = useRef(0); // challenge draws in progress
  const handledTurnRef = useRef(-1);
  const timersRef = useRef(new Set());
  const resolversRef = useRef(new Map());
  const seqRef = useRef(0);

  const deckRef = useRef(null);
  const discardRef = useRef(null);
  const handRef = useRef(null);
  const seatEls = useRef({});
  const seatRefFns = useRef({});
  const seatRef = (i) => (seatRefFns.current[i] ||= (el) => { seatEls.current[i] = el; });

  useEffect(() => { Sound.setEnabled(settings.sound); saveJSON(SETTINGS_KEY, settings); }, [settings]);
  useEffect(() => { saveJSON(STATS_KEY, stats); }, [stats]);
  useEffect(() => () => timersRef.current.forEach(clearTimeout), []);

  // ── Timing helpers ─────────────────────────────────────────────────────────
  const dur = (sec) => sec * SPEEDS[settingsRef.current.speed].anim * (reduceRef.current ? 0.6 : 1);
  const later = (fn, ms) => {
    const id = setTimeout(() => { timersRef.current.delete(id); fn(); }, Math.max(0, ms));
    timersRef.current.add(id);
    return id;
  };
  const sleep = (ms) => new Promise((r) => later(r, ms));
  const wait = (sec) => sleep(dur(sec) * 1000);
  const alive = (epoch) => epoch === epochRef.current;
  async function waitUntil(pred, epoch, maxMs = 6000) {
    const t0 = performance.now();
    while (alive(epoch) && !pred() && performance.now() - t0 < maxMs) await sleep(60);
  }

  // ── Feedback: toasts and speech bubbles ────────────────────────────────────
  const toast = (text, tone = 'ink') => {
    const id = ++seqRef.current;
    setToasts((t) => [...t.slice(-1), { id, text, tone }]);
    later(() => setToasts((t) => t.filter((x) => x.id !== id)), 1900);
  };
  const say = (pi, text, tone = 'ink') => {
    const id = ++seqRef.current;
    setBubbles((b) => ({ ...b, [pi]: { id, text, tone } }));
    later(() => setBubbles((b) => (b[pi]?.id === id ? { ...b, [pi]: null } : b)), 1500);
  };
  const nameOf = (i) => store.current.players[i]?.name ?? '';

  // ── Geometry: screen points for flights ────────────────────────────────────
  const pointOf = (el, s) => {
    if (!el) return { x: window.innerWidth / 2, y: window.innerHeight / 2, rot: 0, s };
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, rot: 0, s };
  };
  const deckPoint = () => pointOf(deckRef.current, 1);
  const discardPoint = (rot = 0, dx = 0, dy = 0) => { const p = pointOf(discardRef.current, 1); return { ...p, x: p.x + dx, y: p.y + dy, rot }; };
  const seatPoint = (pi) => pointOf(seatEls.current[pi], geomRef.current.opp / geomRef.current.pile);
  const handSlotPoint = (cardId, handOverride, lifted = false) => {
    const g = geomRef.current;
    const hand = handOverride || store.current.players[0]?.hand || [];
    const el = handRef.current;
    const i = hand.findIndex((c) => c.id === cardId);
    if (!el || i < 0) return pointOf(el, g.hand / g.pile);
    const r = el.getBoundingClientRect();
    const slot = handLayout(hand.length, { width: g.handWidth, cardW: g.hand, minStep: g.minStep }).slots[i];
    return {
      x: r.left + r.width / 2 + slot.x,
      y: r.top + HAND_PAD + slot.y + (g.hand * 1.4) / 2 - (lifted ? LIFT_PLAYABLE : 0),
      rot: slot.rot,
      s: g.hand / g.pile,
    };
  };

  // ── Flight layer: fly() resolves when the card lands ───────────────────────
  const fly = (spec) => new Promise((resolve) => {
    const id = ++seqRef.current;
    resolversRef.current.set(id, resolve);
    setFlights((f) => [...f, { ...spec, id }]);
  });
  const onFlightDone = useCallback((id) => {
    const r = resolversRef.current.get(id);
    resolversRef.current.delete(id);
    setFlights((f) => f.filter((x) => x.id !== id));
    r?.();
  }, []);

  // ── Sequences (each is one animated, awaited state transition) ─────────────
  function reshuffleIfNeeded() {
    const s = store.current;
    if (s.drawPile.length > 0 || s.discard.length < 2) return;
    dispatch({ type: 'RESHUFFLE', pile: shuffle(s.discard.slice(0, -1).map((e) => e.card)) });
    toast('Discards shuffled back into the deck');
  }

  /** Draw `count` cards for a player with staggered, elastic flights. Returns the drawn card ids. */
  async function drawCards(pi, count, epoch) {
    const ids = [];
    const landings = [];
    for (let k = 0; k < count; k++) {
      reshuffleIfNeeded();
      const before = store.current;
      const ns = dispatch({ type: 'DRAW_ONE', player: pi });
      if (ns === before) break; // deck truly empty
      const card = ns.lastDraw.card;
      ids.push(card.id);
      Sound.draw();
      landings.push(fly({
        card, toSeat: pi === 0 ? null : pi,
        from: deckPoint(), to: pi === 0 ? () => handSlotPoint(card.id) : seatPoint(pi),
        faceFrom: false, faceTo: pi === 0, duration: dur(0.26), ease: EASE_DRAW, arc: 36, pop: 0.06,
      }));
      if (k < count - 1) { await wait(0.075); if (!alive(epoch)) return ids; }
    }
    await Promise.all(landings);
    return ids;
  }

  /** Play a card: validate via the reducer, fly it to the pile, then announce its effect and start the next turn. */
  async function playCard(pi, cardId, color) {
    const epoch = epochRef.current;
    const before = store.current;
    const card = before.players[pi]?.hand.find((c) => c.id === cardId);
    if (!card) return false;
    const from = pi === 0 ? handSlotPoint(cardId, before.players[0].hand, true) : seatPoint(pi);
    const rot = rand(-14, 14);
    const dx = rand(-5, 5);
    const dy = rand(-4, 4);
    const ns = dispatch({ type: 'PLAY_CARD', player: pi, cardId, color, rot, dx, dy, now: performance.now() });
    if (ns === before) {
      if (pi === 0) { Sound.error(); setShake({ id: cardId, k: performance.now() }); }
      return false;
    }
    busyRef.current = true;
    if (pi === 0) setSelected(null);
    Sound.flip();
    await fly({
      card, chosen: isWild(card) ? ns.currentColor : null, from, to: discardPoint(rot, dx, dy),
      faceFrom: pi === 0, faceTo: true, duration: dur(0.25), ease: EASE_PLAY, arc: pi === 0 ? 70 : 34, pop: 0.1,
    });
    if (!alive(epoch)) return true;
    Sound.play();
    setThud((t) => t + 1);
    if (pi === 0) setStats((st) => ({ ...st, cardsPlayed: st.cardsPlayed + 1 }));
    announcePlay(pi, card, ns);
    if (ns.phase === 'GAME_OVER') { finishRound(ns); busyRef.current = false; return true; }
    if (!ns.players[pi].isHuman && ns.players[pi].uno === 'grace') scheduleAiUnoCall(pi, epoch);
    await wait(0.06);
    if (!alive(epoch)) return true;
    dispatch({ type: 'BEGIN_TURN' });
    busyRef.current = false;
    return true;
  }

  function announcePlay(pi, card, ns) {
    const n = ns.players.length;
    const victim = mod(pi + ns.direction, n);
    if (isWild(card)) {
      Sound.wild();
      setRipple({ color: ns.currentColor, k: ++seqRef.current });
      if (pi !== 0) say(pi, PALETTE[ns.currentColor].name, 'ink');
    }
    if (card.type === 'skip') say(victim, 'Skipped');
    if (card.type === 'reverse') {
      if (n === 2) say(victim, 'Skipped');
      else toast('Direction reversed');
    }
    if (card.type === 'draw2' || card.type === 'wild4') {
      const stacked = ns.pendingDraw > (card.type === 'draw2' ? 2 : 4);
      toast(stacked ? `Stacked! +${ns.pendingDraw} on ${victim === 0 ? 'you' : nameOf(victim)}` : `+${ns.pendingDraw} for ${victim === 0 ? 'you' : nameOf(victim)}`, 'red');
    }
  }

  /** Penalty: draw the whole pending stack, then lose the turn. */
  async function takePenalty(pi, epoch) {
    busyRef.current = true;
    const n = store.current.pendingDraw;
    Sound.penalty();
    if (pi !== 0) say(pi, `+${n}`, 'red');
    await drawCards(pi, n, epoch);
    if (!alive(epoch)) return;
    dispatch({ type: 'ACCEPT_PENALTY' });
    dispatch({ type: 'END_TURN' });
    await wait(0.05);
    if (!alive(epoch)) return;
    dispatch({ type: 'BEGIN_TURN' });
    busyRef.current = false;
  }

  /** True while an UNOFFICIAL! window is open or being resolved — AI turns wait so calls and catches stay fair. */
  const unoBlocking = () => {
    const now = performance.now();
    return catchingRef.current > 0 || store.current.players.some((p) =>
      p.uno === 'grace' || p.uno === 'caught' || (p.uno === 'exposed' && now - p.exposedAt < EXPOSE_REACT_MS));
  };

  // AI_TURN: think → (wait for open calls) → stack / take penalty / play / draw-then-maybe-play.
  async function runAiTurn(key) {
    const epoch = epochRef.current;
    const pi = store.current.current;
    await sleep(SPEEDS[settingsRef.current.speed].think * rand(0.75, 1.25));
    await waitUntil(() => !unoBlocking(), epoch);
    let s = store.current;
    if (!alive(epoch) || s.turnKey !== key || s.phase !== 'AI_TURN') return;

    if (s.pendingDraw > 0) {
      const stack = aiChooseStack(s, pi);
      if (stack) await playCard(pi, stack.cardId, stack.color);
      else await takePenalty(pi, epoch);
      return;
    }
    const move = aiChooseMove(s, pi);
    if (move.type === 'play') { await playCard(pi, move.cardId, move.color); return; }

    busyRef.current = true;
    const [id] = await drawCards(pi, 1, epoch);
    if (!alive(epoch)) return;
    dispatch({ type: 'MARK_DRAWN', cardId: id ?? null, inferLack: true });
    s = store.current;
    const drawn = id && s.players[pi].hand.find((c) => c.id === id);
    if (drawn && isPlayable(drawn, s) && aiWantsDrawn(s, pi, drawn)) {
      await wait(0.18);
      if (!alive(epoch)) return;
      await playCard(pi, drawn.id, isWild(drawn) ? (s.players[pi].difficulty === 'strategic' ? aiBestColor(s, pi, drawn) : pick(COLORS)) : null);
      return;
    }
    say(pi, 'Pass');
    dispatch({ type: 'END_TURN' });
    dispatch({ type: 'BEGIN_TURN' });
    busyRef.current = false;
  }

  // PLAYER_TURN start: force the draw when nothing fits (or when a penalty can't be stacked).
  function humanTurnStart(key) {
    const epoch = epochRef.current;
    const s = store.current;
    const me = s.players[0];
    Sound.turn();
    const anyPlayable = me.hand.some((c) => isPlayable(c, s));
    const stillMyTurn = () => alive(epoch) && store.current.turnKey === key && store.current.phase === 'PLAYER_TURN' && !busyRef.current && !pickerRef.current;
    if (s.pendingDraw > 0) {
      if (!anyPlayable) later(() => { if (stillMyTurn()) takePenalty(0, epoch); }, dur(0.6) * 1000 + 250);
      return;
    }
    if (!anyPlayable) later(() => { if (stillMyTurn() && !store.current.hasDrawn) humanDraw(); }, dur(0.5) * 1000 + 450);
  }

  async function humanDraw() {
    const s = store.current;
    if (s.phase !== 'PLAYER_TURN' || busyRef.current || pickerRef.current) return;
    const epoch = epochRef.current;
    if (s.pendingDraw > 0) { await takePenalty(0, epoch); return; }
    if (s.hasDrawn) { humanPass(); return; }
    busyRef.current = true;
    const [id] = await drawCards(0, 1, epoch);
    if (!alive(epoch)) return;
    if (!id) toast('The deck is empty — passing');
    dispatch({ type: 'MARK_DRAWN', cardId: id ?? null, inferLack: true });
    const ns = store.current;
    const drawn = id && ns.players[0].hand.find((c) => c.id === id);
    if (drawn && isPlayable(drawn, ns)) { setSelected(drawn.id); busyRef.current = false; return; }
    await wait(0.22);
    if (!alive(epoch)) return;
    dispatch({ type: 'END_TURN' });
    dispatch({ type: 'BEGIN_TURN' });
    busyRef.current = false;
  }

  function humanPass() {
    const s = store.current;
    if (s.phase !== 'PLAYER_TURN' || !s.hasDrawn || busyRef.current) return;
    setSelected(null);
    dispatch({ type: 'END_TURN' });
    dispatch({ type: 'BEGIN_TURN' });
  }

  function humanPlay(cardId) {
    Sound.unlock();
    const s = store.current;
    if (s.phase !== 'PLAYER_TURN' || busyRef.current || pickerRef.current) return;
    const card = s.players[0].hand.find((c) => c.id === cardId);
    if (!card) return;
    if (!isPlayable(card, s) || (s.drawnCardId && s.drawnCardId !== cardId)) {
      Sound.error();
      setShake({ id: cardId, k: performance.now() });
      return;
    }
    if (isWild(card)) { setSelected(cardId); setPicker({ cardId }); return; }
    playCard(0, cardId, null);
  }

  function chooseColor(color) {
    const p = pickerRef.current;
    if (!p) return;
    pickerRef.current = null;
    setPicker(null);
    playCard(0, p.cardId, color);
  }

  function humanCallUno() {
    Sound.unlock();
    const before = store.current;
    const ns = dispatch({ type: 'CALL_UNO', player: 0 });
    if (ns === before) { Sound.error(); return; }
    Sound.uno();
    say(0, 'UNOFFICIAL!', 'red');
    setStats((st) => ({ ...st, unoCalls: st.unoCalls + 1 }));
  }

  function humanCatch(target) {
    const s = store.current;
    const t = target ?? s.players.findIndex((p) => !p.isHuman && p.uno === 'exposed');
    if (t > 0) runChallenge(t, 0);
  }

  /** A challenge: the exposed player draws two. */
  async function runChallenge(target, by) {
    const epoch = epochRef.current;
    const before = store.current;
    const ns = dispatch({ type: 'CHALLENGE', target, by });
    if (ns === before) return;
    catchingRef.current += 1;
    Sound.alarm();
    if (by !== 0) say(by, 'Caught you!', 'red');
    toast(by === 0 ? `You caught ${nameOf(target)} — +2` : target === 0 ? `${nameOf(by)} caught you — draw 2` : `${nameOf(by)} caught ${nameOf(target)} — +2`, 'red');
    if (by === 0) setStats((st) => ({ ...st, catches: st.catches + 1 }));
    if (target === 0) setStats((st) => ({ ...st, caught: st.caught + 1 }));
    await drawCards(target, 2, epoch);
    if (alive(epoch)) catchingRef.current = Math.max(0, catchingRef.current - 1);
  }

  /** Grace window expired without a call: announce it and let AI opponents react. */
  function onExposed(i) {
    const epoch = epochRef.current;
    const s = store.current;
    Sound.tick();
    toast(i === 0 ? 'You missed your UNOFFICIAL! call' : `${s.players[i].name} didn't call — catch them!`, 'red');
    s.players.forEach((q, j) => {
      if (j === i || q.isHuman) return;
      const strategic = q.difficulty === 'strategic';
      if (!strategic && Math.random() > 0.4) return; // Easy players often don't notice
      later(() => { if (alive(epoch)) runChallenge(i, j); }, strategic ? rand(200, 360) : rand(800, 1500));
    });
  }

  /** AI players call UNOFFICIAL! after a human-ish delay — Easy ones sometimes forget or call too late. */
  function scheduleAiUnoCall(pi, epoch) {
    const strategic = store.current.players[pi].difficulty === 'strategic';
    if (Math.random() > (strategic ? 0.94 : 0.7)) return;
    later(() => {
      if (!alive(epoch)) return;
      const before = store.current;
      if (dispatch({ type: 'CALL_UNO', player: pi }) !== before) { Sound.uno(); say(pi, 'UNOFFICIAL!', 'red'); }
    }, strategic ? rand(160, 700) : rand(350, 2500));
  }

  function finishRound(ns) {
    const won = ns.winner === 0;
    if (won) Sound.win(); else Sound.lose();
    setStats((st) => {
      const streak = won ? st.streak + 1 : 0;
      return {
        ...st, played: st.played + 1, wins: st.wins + (won ? 1 : 0), points: st.points + (won ? ns.roundPoints : 0),
        bestRound: won ? Math.max(st.bestRound, ns.roundPoints) : st.bestRound, streak, bestStreak: Math.max(st.bestStreak, streak),
      };
    });
    setMatch((m) => ({ ...m, hands: m.hands + 1, scores: { ...m.scores, [ns.winner]: (m.scores[ns.winner] || 0) + ns.roundPoints } }));
    later(() => setOverOpen(true), dur(0.5) * 1000 + 200);
  }

  // NEW_GAME → DEAL: reset everything, deal seven cards each in rotation, flip the starter, begin.
  async function startGame() {
    Sound.unlock();
    epochRef.current += 1;
    const epoch = epochRef.current;
    timersRef.current.forEach(clearTimeout);
    timersRef.current.clear();
    resolversRef.current.clear();
    pickerRef.current = null;
    setFlights([]); setPicker(null); setSelected(null); setToasts([]); setBubbles({}); setOverOpen(false); setModal(null); setRipple(null);
    catchingRef.current = 0;
    handledTurnRef.current = -1;
    busyRef.current = true;

    const st = settingsRef.current;
    const opponents = Array.from({ length: st.opponents }, (_, i) => ({ name: OPPONENT_NAMES[i], difficulty: st.difficulties[i] }));
    const rosterKey = opponents.map((o) => `${o.name}:${o.difficulty}`).join('|');
    setMatch((m) => (m.key === rosterKey ? m : { key: rosterKey, hands: 0, scores: {} }));
    const n = opponents.length + 1;
    const starter = Math.floor(Math.random() * n);
    dispatch({ type: 'NEW_GAME', opponents, stacking: st.stacking, deck: shuffle(buildDeck()), starter });

    await nextFrame();
    await nextFrame(); // the table has mounted; deck / seat / hand geometry is measurable
    if (!alive(epoch)) return;
    const landings = [];
    for (let r = 0; r < HAND_SIZE; r++) {
      for (let k = 0; k < n; k++) {
        const pi = (starter + k) % n;
        const card = dispatch({ type: 'DRAW_ONE', player: pi }).lastDraw.card;
        Sound.deal();
        landings.push(fly({
          card, toSeat: pi === 0 ? null : pi,
          from: deckPoint(), to: pi === 0 ? () => handSlotPoint(card.id) : seatPoint(pi),
          faceFrom: false, faceTo: pi === 0, duration: dur(0.22), ease: EASE_DEAL, arc: 24, pop: 0.04,
        }));
        await wait(0.045);
        if (!alive(epoch)) return;
      }
    }
    await Promise.all(landings);
    if (!alive(epoch)) return;
    const rot = rand(-10, 10);
    const top = dispatch({ type: 'FLIP_START', rot }).discard[0].card;
    Sound.flip();
    await fly({ card: top, from: deckPoint(), to: discardPoint(rot), faceFrom: false, faceTo: true, duration: dur(0.26), ease: EASE_PLAY, arc: 30 });
    if (!alive(epoch)) return;
    Sound.play();
    await wait(0.1);
    if (!alive(epoch)) return;
    dispatch({ type: 'BEGIN_TURN' });
    busyRef.current = false;
    toast(starter === 0 ? 'You lead off' : `${opponents[starter - 1].name} leads off`);
  }

  // ── Turn driver: whenever a new turn begins, hand control to the AI or prime the human turn.
  useEffect(() => {
    const s = store.current;
    if (handledTurnRef.current === s.turnKey) return;
    if (s.phase === 'AI_TURN') { handledTurnRef.current = s.turnKey; runAiTurn(s.turnKey); }
    else if (s.phase === 'PLAYER_TURN') { handledTurnRef.current = s.turnKey; humanTurnStart(s.turnKey); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, state.turnKey]);

  // ── UNOFFICIAL! window ticker: expire grace periods (2 s) into exposures.
  const api = useRef({});
  useEffect(() => {
    const id = setInterval(() => {
      const s = store.current;
      const now = performance.now();
      s.players.forEach((p, i) => {
        if (p.uno === 'grace' && now >= p.unoDeadline) {
          const before = store.current;
          if (dispatch({ type: 'UNO_EXPIRE', player: i, now }) !== before) api.current.onExposed(i);
        }
      });
    }, 100);
    return () => clearInterval(id);
  }, [dispatch, store]);

  // ── Keyboard: Space draw/keep · 1–9,0 select (again = play) · ←/→ · Enter play · U call · C catch · M mute
  function onKey(e) {
    Sound.unlock();
    const k = e.key.toLowerCase();
    const s = store.current;
    if (pickerRef.current) {
      const map = { r: 'red', y: 'yellow', g: 'green', b: 'blue', 1: 'red', 2: 'yellow', 3: 'green', 4: 'blue' };
      if (map[k]) { e.preventDefault(); chooseColor(map[k]); } else if (k === 'escape') { setPicker(null); setSelected(null); }
      return;
    }
    if (modal) { if (k === 'escape') setModal(null); return; }
    if (k === 'm') { setSettings((x) => ({ ...x, sound: !x.sound })); return; }
    if (s.phase === 'MENU' || overOpen || s.phase === 'GAME_OVER') {
      if (k === 'enter' || (k === ' ' && s.phase !== 'MENU')) { e.preventDefault(); startGame(); }
      else if (k === 'escape') setOverOpen(false);
      return;
    }
    const hand = s.players[0].hand;
    if (k === ' ') { e.preventDefault(); humanDraw(); return; }
    if (k === 'u') { humanCallUno(); return; }
    if (k === 'c') { humanCatch(); return; }
    if (/^[0-9]$/.test(k)) {
      const c = hand[k === '0' ? 9 : Number(k) - 1];
      if (!c) return;
      if (selected === c.id) humanPlay(c.id); else { setSelected(c.id); Sound.tick(); }
      return;
    }
    if (k === 'arrowleft' || k === 'arrowright') {
      e.preventDefault();
      if (!hand.length) return;
      const i = hand.findIndex((c) => c.id === selected);
      const ni = i < 0 ? (k === 'arrowleft' ? hand.length - 1 : 0) : clamp(i + (k === 'arrowleft' ? -1 : 1), 0, hand.length - 1);
      setSelected(hand[ni].id);
      Sound.tick();
      return;
    }
    if (k === 'enter' && selected) { e.preventDefault(); humanPlay(selected); }
  }
  api.current = { onExposed, onKey };
  useEffect(() => {
    const handler = (e) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName)) return;
      api.current.onKey(e);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ── Derived view state ─────────────────────────────────────────────────────
  const s = state;
  const inGame = s.phase !== 'MENU';
  const me = s.players[0];
  const myTurn = s.phase === 'PLAYER_TURN';
  const flyingIds = useMemo(() => new Set(flights.map((f) => f.card.id)), [flights]);
  const incoming = useMemo(() => {
    const m = {};
    flights.forEach((f) => { if (f.toSeat) m[f.toSeat] = (m[f.toSeat] || 0) + 1; });
    return m;
  }, [flights]);
  const playableIds = useMemo(() => {
    if (!myTurn || !me) return new Set();
    return new Set(me.hand.filter((c) => isPlayable(c, s) && (!s.drawnCardId || s.drawnCardId === c.id)).map((c) => c.id));
  }, [s, me, myTurn]);
  const visibleDiscard = s.discard.filter((e) => !flyingIds.has(e.card.id));
  const shownColor = visibleDiscard.length ? visibleDiscard[visibleDiscard.length - 1].color : s.currentColor;
  const exposedOpps = s.players.filter((p) => !p.isHuman && p.uno === 'exposed').map((p) => p.id);
  const canDraw = myTurn && !picker && !(s.hasDrawn && s.pendingDraw === 0);
  const forcedDraw = myTurn && playableIds.size === 0 && !s.hasDrawn;
  const n = s.players.length;

  let unoMode = 'idle';
  if (me) {
    if (me.uno === 'called' || me.armed) unoMode = 'called';
    else if (me.uno === 'grace') unoMode = 'grace';
    else if (myTurn && me.hand.length === 2 && playableIds.size > 0) unoMode = 'ready';
  }

  let banner = { text: '', tone: 'muted' };
  if (s.phase === 'DEAL') banner = { text: 'Dealing', tone: 'muted', dots: true };
  else if (s.phase === 'GAME_OVER') banner = { text: s.winner === 0 ? 'You win the hand!' : `${s.players[s.winner].name} wins the hand`, tone: s.winner === 0 ? 'win' : 'ink' };
  else if (inGame) {
    const p = s.players[s.current];
    if (p.isHuman) {
      if (s.pendingDraw > 0) banner = { text: playableIds.size ? `Stack it, or take +${s.pendingDraw}` : `Taking +${s.pendingDraw}`, tone: 'alert' };
      else if (s.hasDrawn) banner = { text: playableIds.size ? 'Play the drawn card — or keep it' : 'No luck — passing', tone: 'you' };
      else if (!playableIds.size) banner = { text: 'No match — drawing', tone: 'you', dots: true };
      else banner = { text: 'Your turn', tone: 'you' };
    } else {
      banner = s.pendingDraw > 0
        ? { text: `${p.name} faces +${s.pendingDraw}`, tone: 'alert' }
        : { text: `${p.name} is thinking`, tone: 'muted', dots: true };
    }
  }

  const seatOrder = (() => {
    const opp = s.players.slice(1).map((p) => p.id);
    if (!sizes.wide) return { row: opp };
    if (opp.length === 1) return { top: opp[0] };
    if (opp.length === 2) return { left: opp[0], right: opp[1] };
    return { left: opp[0], top: opp[1], right: opp[2] };
  })();

  const renderSeat = (pi) => {
    if (pi === undefined) return null;
    const p = s.players[pi];
    return (
      <Seat key={pi} player={p} index={pi} count={Math.max(0, p.hand.length - (incoming[pi] || 0))}
        active={s.current === pi && ['AI_TURN', 'TRANSITION'].includes(s.phase)}
        thinking={s.current === pi && s.phase === 'AI_TURN' && flights.length === 0}
        compact={!sizes.wide} cardW={sizes.opp} bubble={bubbles[pi]} onCatch={() => humanCatch(pi)} fanRef={seatRef(pi)} />
    );
  };

  const pileH = Math.round(sizes.pile * 1.4);
  const wellD = Math.round(pileH * 1.3);
  const deckLayers = clamp(Math.ceil(s.drawPile.length / 20), s.drawPile.length ? 1 : 0, 4);
  const bannerStyle = {
    you: { background: INK, color: CREAM },
    alert: { background: PALETTE.red.base, color: CREAM },
    win: { background: PALETTE.green.base, color: CREAM },
    ink: { background: INK, color: CREAM },
    muted: { background: 'rgba(251,247,239,0.75)', color: INK, boxShadow: '0 0 0 1px rgba(38,32,24,0.08)' },
  }[banner.tone];

  const center = (
    <div className="flex flex-col items-center" style={{ gap: sizes.wide ? 14 : 8 }}>
      <div className="flex h-9 items-center justify-center" role="status" aria-live="polite">
        {banner.text && (
            <motion.div key={banner.text} initial={{ opacity: 0, y: 5, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.14 }}
              className={`flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-bold ${banner.tone === 'you' ? 'uo-pulse' : ''}`}
              style={{ ...bannerStyle, '--uo-pulse': 'rgba(38,39,43,0.3)' }}>
              {banner.tone === 'you' && shownColor && <span className="h-2.5 w-2.5 rounded-full" style={{ background: PALETTE[shownColor].base, boxShadow: `0 0 0 2px ${CREAM}` }} />}
              {banner.text}
              {banner.dots && <ThinkingDots />}
            </motion.div>
        )}
      </div>

      <div className="flex items-center" style={{ gap: sizes.wide ? 36 : 18 }}>
        {/* Draw deck */}
        <div className="flex flex-col items-center gap-2">
          <motion.button
            ref={deckRef} type="button" data-deck="1" onClick={() => { Sound.unlock(); humanDraw(); }} disabled={!canDraw}
            aria-label={s.pendingDraw > 0 && myTurn ? `Take +${s.pendingDraw} (Space)` : 'Draw a card (Space)'}
            className={`relative ${forcedDraw || (myTurn && s.pendingDraw > 0) ? 'uo-pulse' : ''}`}
            style={{ width: sizes.pile, height: pileH, borderRadius: cardRadius(sizes.pile), cursor: canDraw ? 'pointer' : 'default', '--uo-pulse': 'rgba(195,51,58,0.45)' }}
            whileHover={canDraw ? { y: -4 } : undefined} whileTap={canDraw ? { scale: 0.96 } : undefined}
            transition={{ type: 'spring', stiffness: 600, damping: 30 }}
          >
            {deckLayers === 0 && <div className="absolute inset-0 border-2 border-dashed" style={{ borderRadius: cardRadius(sizes.pile), borderColor: 'rgba(38,39,43,0.2)' }} />}
            {Array.from({ length: deckLayers }, (_, i) => {
              const d = deckLayers - 1 - i;
              return (
                <div key={i} className="absolute inset-0" style={{ transform: `translate(${d * 1.6}px, ${d * 1.6}px)`, borderRadius: cardRadius(sizes.pile), boxShadow: SHADOW_REST }}>
                  <CardBack w={sizes.pile} />
                </div>
              );
            })}
          </motion.button>
          <span className="text-[11px] font-semibold tabular-nums" style={{ color: 'rgba(38,39,43,0.55)' }}>{s.drawPile.length} left</span>
        </div>

        {/* Discard well: ring shows the active colour, arrows show play direction */}
        <div className="flex flex-col items-center gap-4">
          <div className="relative grid place-items-center" style={{ width: wellD, height: wellD }}>
            <div className="absolute inset-0 rounded-full transition-shadow duration-300"
              style={{ background: WELL, boxShadow: `inset 0 2px 6px rgba(38,32,24,0.12), 0 0 0 4px ${shownColor ? PALETTE[shownColor].base : 'transparent'}` }} />
            <AnimatePresence>
              {ripple && (
                <motion.span key={ripple.k} className="pointer-events-none absolute rounded-full"
                  style={{ width: wellD, height: wellD, background: PALETTE[ripple.color].base, zIndex: 0 }}
                  initial={{ scale: 0.7, opacity: 0.32 }} animate={{ scale: 7, opacity: 0 }} exit={{ opacity: 0 }}
                  transition={{ duration: dur(0.6), ease: [0.2, 0.7, 0.3, 1] }} onAnimationComplete={() => setRipple(null)} />
              )}
            </AnimatePresence>
            <DirectionRing direction={s.direction} size={wellD + 26} />
            <motion.div key={thud} ref={discardRef} className="relative" style={{ width: sizes.pile, height: pileH }}
              initial={{ scale: thud ? 0.97 : 1 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 900, damping: 18 }}>
              {visibleDiscard.slice(-5).map((e) => (
                <div key={e.card.id} className="absolute inset-0"
                  style={{ transform: `translate(${e.dx}px, ${e.dy}px) rotate(${e.rot}deg)`, borderRadius: cardRadius(sizes.pile), boxShadow: SHADOW_REST }}>
                  <CardFace card={e.card} w={sizes.pile} chosen={isWild(e.card) ? e.color : null} />
                </div>
              ))}
            </motion.div>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: 'rgba(38,39,43,0.7)' }}>
            {shownColor && <span className="h-2.5 w-2.5 rounded-full transition-colors duration-300" style={{ background: PALETTE[shownColor].base }} />}
            {shownColor ? PALETTE[shownColor].name : '—'}
            <span style={{ opacity: 0.45 }}>·</span>
            {s.direction === 1 ? 'Clockwise' : 'Counter-clockwise'}
          </div>
        </div>
      </div>
    </div>
  );

  const handCards = me?.hand ?? [];
  const showKeys = sizes.wide && !sizes.coarse && myTurn;

  return (
    <div className="relative w-full select-none overflow-hidden" onPointerDown={() => Sound.unlock()}
      style={{ height: '100dvh', background: TABLE, color: INK, fontFamily: FONT, touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}>
      <style>{CSS}</style>

      <div className="flex h-full flex-col">
        {/* Top bar */}
        <header className="relative z-30 flex h-14 shrink-0 items-center justify-between pl-3 pr-1 sm:pl-5 sm:pr-3">
          <div className="flex items-center gap-1">
            {homeHref && (
              <a href={homeHref} aria-label={homeLabel} title={homeLabel}
                className="-ml-2 grid h-11 w-11 place-items-center rounded-full transition-colors duration-150 hover:bg-black/5" style={{ color: INK }}>
                <ArrowLeft size={19} />
              </a>
            )}
            <Wordmark size={sizes.wide ? 22 : 19} />
          </div>
          {inGame && sizes.wide && (
            <div className="absolute left-1/2 -translate-x-1/2 text-xs font-semibold" style={{ color: 'rgba(38,39,43,0.5)' }}>
              Hand {match.hands + (s.phase === 'GAME_OVER' ? 0 : 1)} · You {match.scores[0] || 0} pts · {s.rules.stacking ? 'Stacking on' : 'No stacking'} · {SPEEDS[settings.speed].label}
            </div>
          )}
          <div className="flex items-center">
            <IconButton label="Statistics" onClick={() => setModal('stats')}><BarChart3 size={19} /></IconButton>
            <IconButton label="Settings" onClick={() => setModal('settings')}><Settings2 size={19} /></IconButton>
            <IconButton label={settings.sound ? 'Mute (M)' : 'Unmute (M)'} onClick={() => setSettings((x) => ({ ...x, sound: !x.sound }))}>
              {settings.sound ? <Volume2 size={19} /> : <VolumeX size={19} />}
            </IconButton>
            {inGame && <IconButton label="New hand" onClick={startGame}><RotateCcw size={18} /></IconButton>}
          </div>
        </header>

        {inGame && (
          <>
            {/* Table */}
            <div className="relative min-h-0 flex-1">
              <div className="absolute inset-x-2 inset-y-1 sm:inset-x-4 sm:inset-y-2"
                style={{ background: MAT, borderRadius: sizes.wide ? 44 : 28, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.45), inset 0 0 0 1px rgba(38,32,24,0.06)' }} />
              {sizes.wide ? (
                <div className="relative grid h-full" style={{ gridTemplateColumns: 'minmax(0,1fr) auto minmax(0,1fr)', gridTemplateRows: 'auto minmax(0,1fr)' }}>
                  <div className="col-start-2 row-start-1 flex justify-center pt-6">{renderSeat(seatOrder.top)}</div>
                  <div className="col-start-1 row-start-2 flex items-center justify-center px-4 pb-6">{renderSeat(seatOrder.left)}</div>
                  <div className="col-start-2 row-start-2 flex items-center justify-center px-2 pb-4">{center}</div>
                  <div className="col-start-3 row-start-2 flex items-center justify-center px-4 pb-6">{renderSeat(seatOrder.right)}</div>
                </div>
              ) : (
                <div className="relative flex h-full flex-col">
                  <div className="flex shrink-0 justify-around px-4 pt-3">{seatOrder.row.map(renderSeat)}</div>
                  <div className="flex min-h-0 flex-1 items-center justify-center pb-10 pt-2">{center}</div>
                </div>
              )}
              {/* Toasts */}
              <div className={`pointer-events-none absolute bottom-3 z-20 flex flex-col gap-1.5 ${sizes.wide ? 'left-8 bottom-6 items-start' : 'inset-x-0 items-center'}`}>
                <AnimatePresence initial={false}>
                  {toasts.map((t) => (
                    <motion.div key={t.id} layout initial={{ opacity: 0, y: 8, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
                      transition={{ duration: 0.16 }}
                      className="rounded-full px-3 py-1 text-xs font-bold"
                      style={{ background: t.tone === 'red' ? PALETTE.red.base : INK, color: CREAM, boxShadow: SHADOW_SMALL }}>
                      {t.text}
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>

            {/* Action bar */}
            <div className="relative z-20 flex min-h-[64px] shrink-0 flex-wrap items-center justify-center gap-2 px-3 pt-2">
              <div className="relative">
                <div className="absolute bottom-full left-1/2 mb-2 -translate-x-1/2">
                  <AnimatePresence>{bubbles[0] && <Bubble key={bubbles[0].id} text={bubbles[0].text} tone={bubbles[0].tone} />}</AnimatePresence>
                </div>
                <UnoButton mode={unoMode} onClick={humanCallUno} deadline={me?.unoDeadline} compact={!sizes.wide} />
              </div>
              {exposedOpps.map((id) => (
                <PrimaryButton key={id} tone={PALETTE.yellow.shade} onClick={() => humanCatch(id)} kbd={sizes.wide ? 'C' : null}>
                  <Siren size={17} /> Catch {s.players[id].name}
                </PrimaryButton>
              ))}
              {myTurn && s.hasDrawn && playableIds.size > 0 && <GhostButton onClick={humanPass} kbd={sizes.wide ? 'Space' : null}>Keep card</GhostButton>}
              {myTurn && s.pendingDraw > 0 && playableIds.size > 0 && (
                <GhostButton onClick={() => humanDraw()} kbd={sizes.wide ? 'Space' : null}>Take +{s.pendingDraw}</GhostButton>
              )}
              {s.phase === 'GAME_OVER' && !overOpen && <PrimaryButton onClick={startGame} kbd={sizes.wide ? '↵' : null}>Deal next hand</PrimaryButton>}
              {sizes.wide && !sizes.coarse && (
                <div className="absolute right-5 top-1/2 hidden -translate-y-1/2 text-[11px] font-medium lg:block" style={{ color: 'rgba(38,39,43,0.45)' }}>
                  <b>Space</b> draw · <b>1–9</b> pick · <b>↵</b> play · <b>U</b> call · <b>C</b> catch · <b>M</b> mute
                </div>
              )}
            </div>

            {/* Player hand */}
            <div className="relative z-10 shrink-0 pb-[max(8px,env(safe-area-inset-bottom))]">
              <div ref={handRef} className="relative mx-auto" style={{ width: sizes.handWidth, height: layout.height }}>
                {handCards.map((c, i) => {
                  const slot = layout.slots[i];
                  if (!slot) return null;
                  const playable = playableIds.has(c.id);
                  const isSel = selected === c.id;
                  const lift = isSel ? LIFT_SELECTED : playable ? LIFT_PLAYABLE : 0;
                  const shaking = shake?.id === c.id;
                  const r = cardRadius(sizes.hand);
                  return (
                    <motion.button
                      key={c.id} type="button" data-card={c.id} data-playable={playable ? '1' : '0'}
                      aria-label={`${cardLabel(c)}${playable ? '' : ', not playable'}`}
                      onClick={() => humanPlay(c.id)}
                      className="absolute top-0 outline-none"
                      style={{
                        left: `calc(50% - ${sizes.hand / 2}px)`, width: sizes.hand, height: Math.round(sizes.hand * 1.4), zIndex: i + 1,
                        borderRadius: r, visibility: flyingIds.has(c.id) ? 'hidden' : 'visible', cursor: myTurn ? (playable ? 'pointer' : 'not-allowed') : 'default',
                      }}
                      initial={false}
                      animate={{ x: slot.x, y: HAND_PAD + slot.y - lift, rotate: slot.rot, boxShadow: isSel ? SHADOW_LIFT : SHADOW_REST }}
                      whileHover={myTurn && playable && !sizes.coarse ? { y: HAND_PAD + slot.y - Math.max(lift, 20), boxShadow: SHADOW_LIFT } : undefined}
                      whileTap={myTurn ? { scale: 0.97 } : undefined}
                      transition={{ type: 'spring', stiffness: 560, damping: 36, mass: 0.7 }}
                    >
                      <motion.div key={shaking ? shake.k : 'still'} animate={shaking ? { x: [0, -6, 6, -4, 4, 0] } : { x: 0 }} transition={{ duration: 0.28 }}>
                        <CardFace card={c} w={sizes.hand} dim={myTurn && !playable} />
                      </motion.div>
                      {isSel && <span className="pointer-events-none absolute inset-0" style={{ borderRadius: r, boxShadow: `0 0 0 3px ${INK}` }} />}
                      {showKeys && i < 10 && (
                        <span className="pointer-events-none absolute -top-5 left-1 text-[10px] font-bold tabular-nums" style={{ color: 'rgba(38,39,43,0.45)' }}>
                          {i === 9 ? 0 : i + 1}
                        </span>
                      )}
                    </motion.button>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Flying cards */}
      <div className="pointer-events-none fixed inset-0 z-40">
        {flights.map((f) => <FlyingCard key={f.id} f={f} base={sizes.pile} onDone={onFlightDone} />)}
      </div>

      {/* Start screen */}
      <AnimatePresence>
        {s.phase === 'MENU' && (
          <motion.div className="absolute inset-x-0 bottom-0 top-14 z-30 overflow-y-auto" style={{ background: TABLE }}
            exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
            <div className="mx-auto flex min-h-full max-w-[980px] flex-col items-center justify-center gap-8 px-5 py-8 md:flex-row md:gap-14">
              <div className="flex flex-col items-center text-center md:items-start md:text-left">
                <SampleFan w={sizes.wide ? 92 : 70} />
                <h1 className="mt-4 font-black italic leading-none" style={{ fontSize: sizes.wide ? 56 : 42, letterSpacing: '-0.045em' }}>
                  Un<span style={{ color: PALETTE.red.base }}>Official</span>
                </h1>
                <p className="mt-3 max-w-[340px] text-[15px] leading-snug" style={{ color: 'rgba(38,39,43,0.68)' }}>
                  Match the color, number or symbol. Empty your hand first — and shout <b>UNOFFICIAL!</b> when you’re down to one, or pay two.
                </p>
                <div className="mt-5 flex gap-5 text-sm">
                  <div><b className="text-lg tabular-nums">{stats.wins}</b> <span style={{ color: 'rgba(38,39,43,0.55)' }}>wins</span></div>
                  <div><b className="text-lg tabular-nums">{stats.played}</b> <span style={{ color: 'rgba(38,39,43,0.55)' }}>played</span></div>
                  <div><b className="text-lg tabular-nums">{winRate(stats)}</b> <span style={{ color: 'rgba(38,39,43,0.55)' }}>win rate</span></div>
                </div>
              </div>
              <div className="w-full max-w-[460px] rounded-3xl p-5 sm:p-6" style={{ background: CREAM, boxShadow: '0 24px 50px -24px rgba(30,25,18,0.4), 0 0 0 1px rgba(38,32,24,0.06)' }}>
                <SetupPanel scope="menu" settings={settings} onChange={setSettings} />
                <PrimaryButton className="mt-6 w-full" onClick={startGame} kbd={sizes.wide ? '↵' : null}>Deal cards</PrimaryButton>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Wild colour picker */}
      <AnimatePresence>
        {picker && (
          <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: 'rgba(32,29,24,0.3)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.14 }}
            onPointerDown={(e) => { if (e.target === e.currentTarget) { setPicker(null); setSelected(null); } }}>
            <motion.div role="dialog" aria-label="Choose a color" className="rounded-3xl p-4 sm:p-5"
              style={{ background: CREAM, boxShadow: '0 30px 60px -20px rgba(30,25,18,0.5)' }}
              initial={{ scale: 0.9, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0 }} transition={{ type: 'spring', stiffness: 600, damping: 34 }}>
              <div className="mb-3 text-center text-sm font-bold">Choose a color</div>
              <div className="grid grid-cols-2 gap-2.5">
                {COLORS.map((c, i) => (
                  <motion.button key={c} type="button" onClick={() => chooseColor(c)} aria-label={`${PALETTE[c].name} (${PALETTE[c].key})`}
                    whileHover={{ y: -3 }} whileTap={{ scale: 0.95 }}
                    className="relative flex h-24 w-28 flex-col items-start justify-end rounded-2xl p-2.5 text-left sm:h-28 sm:w-32"
                    style={{ background: PALETTE[c].base, color: c === 'yellow' ? '#3A2907' : CREAM, boxShadow: `inset 0 -3px 0 ${PALETTE[c].shade}, ${SHADOW_SMALL}` }}>
                    <span className="text-sm font-black italic">{PALETTE[c].name}</span>
                    <span className="absolute right-2.5 top-2 text-[11px] font-bold opacity-70">{sizes.wide ? `${PALETTE[c].key} · ${i + 1}` : ''}</span>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Game over */}
      <Modal open={overOpen && s.phase === 'GAME_OVER'} onClose={() => setOverOpen(false)} label="Hand result" width={480}>
        {s.phase === 'GAME_OVER' && (
          <div className="flex flex-col gap-5">
            <div className="flex items-center gap-3 pr-10">
              <span className="grid h-12 w-12 place-items-center rounded-2xl"
                style={{ background: s.winner === 0 ? PALETTE.green.base : 'rgba(38,39,43,0.08)', color: s.winner === 0 ? CREAM : INK }}>
                <Trophy size={22} />
              </span>
              <div>
                <div className="text-2xl font-black italic leading-tight tracking-tight">{s.winner === 0 ? 'You win the hand!' : `${s.players[s.winner].name} wins the hand`}</div>
                <div className="text-sm" style={{ color: 'rgba(38,39,43,0.6)' }}>+{s.roundPoints} points from cards left in other hands</div>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              {s.players.map((p, i) => (
                <div key={i} className="flex items-center justify-between rounded-xl px-3 py-2" style={{ background: i === s.winner ? 'rgba(27,130,87,0.1)' : 'rgba(38,39,43,0.04)' }}>
                  <div className="flex items-center gap-2.5">
                    <Avatar index={i} name={p.name} size={26} />
                    <span className="text-sm font-semibold">{p.name}</span>
                    {i === s.winner && <Trophy size={14} style={{ color: PALETTE.green.base }} />}
                  </div>
                  <div className="flex items-center gap-4 text-sm tabular-nums">
                    <span style={{ color: 'rgba(38,39,43,0.6)' }}>{p.hand.length} left · {handPoints(p.hand)} pts</span>
                    <span className="w-14 text-right font-bold">{match.scores[i] || 0}</span>
                  </div>
                </div>
              ))}
              <div className="text-right text-[11px] font-medium" style={{ color: 'rgba(38,39,43,0.45)' }}>Match total over {match.hands} hand{match.hands === 1 ? '' : 's'}</div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <StatTile label="Wins" value={stats.wins} />
              <StatTile label="Hands played" value={stats.played} />
              <StatTile label="Win rate" value={winRate(stats)} accent={PALETTE.green.base} />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <PrimaryButton className="flex-1" onClick={startGame} kbd={sizes.wide ? '↵' : null}>Deal again</PrimaryButton>
              <GhostButton onClick={() => { setOverOpen(false); setModal('settings'); }}>Table settings</GhostButton>
            </div>
          </div>
        )}
      </Modal>

      {/* Settings */}
      <Modal open={modal === 'settings'} onClose={() => setModal(null)} label="Settings">
        <div className="mb-5 pr-10">
          <div className="text-xl font-black italic tracking-tight">Table settings</div>
          <div className="text-sm" style={{ color: 'rgba(38,39,43,0.6)' }}>Speed and sound apply now; seats and rules apply on the next deal.</div>
        </div>
        <SetupPanel scope="modal" settings={settings} onChange={setSettings} />
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <PrimaryButton className="flex-1" onClick={startGame}>{inGame ? 'Deal a new hand' : 'Deal cards'}</PrimaryButton>
          <GhostButton onClick={() => setModal(null)}>Done</GhostButton>
        </div>
      </Modal>

      {/* Statistics */}
      <Modal open={modal === 'stats'} onClose={() => setModal(null)} label="Statistics">
        <div className="mb-5 pr-10">
          <div className="text-xl font-black italic tracking-tight">Your record</div>
          <div className="text-sm" style={{ color: 'rgba(38,39,43,0.6)' }}>Saved on this device.</div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <StatTile label="Wins" value={stats.wins} />
          <StatTile label="Hands played" value={stats.played} />
          <StatTile label="Win rate" value={winRate(stats)} accent={PALETTE.green.base} />
          <StatTile label="Total points" value={stats.points} />
          <StatTile label="Best hand" value={stats.bestRound} />
          <StatTile label="Best streak" value={stats.bestStreak} />
          <StatTile label="Cards played" value={stats.cardsPlayed} />
          <StatTile label="UNOFFICIAL! calls" value={stats.unoCalls} />
          <StatTile label="Catches · caught" value={`${stats.catches} · ${stats.caught}`} accent={PALETTE.red.base} />
        </div>
        <div className="mt-5 flex justify-end">
          <GhostButton onClick={() => setStats(DEFAULT_STATS)}>Reset statistics</GhostButton>
        </div>
      </Modal>
    </div>
  );
}
