/**
 * UnOfficial — a fast, tactile colour-matching card game (inspired by UNO), for classmates and bots.
 * ───────────────────────────────────────────────────────────────────────────
 * This is the browser side of the multiplayer game. The server (../rooms.js) runs every hand with the same
 * rules engine (../engine.js); this page shows the table, animates what the server reports, and sends your
 * moves. Rooms hold up to four seats: classmates join with a link or a 5-letter code, and the host fills any
 * empty seats with Easy or Strategic bots. "Practice" deals you straight in against bots.
 *
 * No external media: every card is inline SVG and every sound is synthesised with the Web Audio API.
 *
 * File map
 *   1. Constants & palette
 *   2. Card helpers (the rules themselves live in ../engine.js)
 *   5. Audio engine (Web Audio API)
 *   6. Persistence & small hooks
 *   7. Geometry (responsive sizing, hand-fan layout)
 *   8. Visual components (cards, seats, overlays, controls)
 *   9. Rooms: connection, the server's view of the table, and the screens
 */
import React, { memo, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion } from 'framer-motion';
import {
  ArrowLeft, ArrowRightLeft, BarChart3, Bot, Brain, Camera, Check, Copy, Crown, Dices, LogOut, Megaphone, Minus, Plus, RefreshCw, Settings2, Siren, Trophy, Users,
  Volume2, VolumeX, WifiOff, X,
} from 'lucide-react';
import Engine from '../engine.js';

const { COLORS, isWild, isPlayable, handPoints, mod } = Engine;

// ─────────────────────────────────────────────────────────────────────────────
// 1. Constants & palette
// ─────────────────────────────────────────────────────────────────────────────
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
// 2. Card helpers
// ─────────────────────────────────────────────────────────────────────────────
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

function Avatar({ index, name, size = 28, src = '' }) {
  if (src) {
    return <img src={src} alt="" width={size} height={size} draggable={false} className="block shrink-0 rounded-full object-cover"
      style={{ width: size, height: size, boxShadow: `0 0 0 1.5px ${CREAM}` }} />;
  }
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
const Seat = memo(function Seat({ player, index, count, active, thinking, compact, tight, cardW, bubble, onCatch, fanRef, photo }) {
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
          background: active ? INK : 'rgba(251,247,239,0.8)', color: active ? CREAM : INK, opacity: player.online === false ? 0.6 : 1,
          padding: tight ? '3px 7px' : compact ? '2px 8px 2px 2px' : '3px 10px 3px 3px', gap: tight ? 4 : compact ? 5 : 8,
          boxShadow: active ? undefined : '0 0 0 1px rgba(38,32,24,0.08)',
        }}
      >
        {!tight && <Avatar index={index} name={player.name} size={compact ? 22 : 28} src={photo} />}
        <span className="truncate font-semibold leading-none" style={{ fontSize: compact ? 12 : 14, maxWidth: tight ? 46 : compact ? 58 : 120 }}>{player.name}</span>
        {!compact && player.bot !== false && (player.difficulty === 'strategic'
          ? <Brain size={13} aria-label="Strategic bot" style={{ opacity: 0.6 }} />
          : <Dices size={13} aria-label="Easy bot" style={{ opacity: 0.6 }} />)}
        <span className="rounded-full px-1.5 text-[11px] font-bold tabular-nums leading-[18px]"
          style={{ background: active ? 'rgba(251,247,239,0.16)' : 'rgba(38,39,43,0.08)' }}>{count}</span>
        {thinking && !tight && <ThinkingDots />}
        {called && <span className="h-2 w-2 rounded-full" style={{ background: PALETTE.red.base }} title="Called UNOFFICIAL!" />}
        {player.online === false && <WifiOff size={13} aria-label="Offline: a bot plays for them" style={{ opacity: 0.7 }} />}
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
        <span key={deadline} className="uo-shrink absolute bottom-1.5 left-4 right-4 h-[3px] rounded-full"
          style={{ background: 'rgba(251,247,239,0.85)', animationDuration: `${Math.max(0, (deadline || 0) - performance.now())}ms` }} />
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
// 9. Rooms: connection, the server's view of the table, and the screens
// ─────────────────────────────────────────────────────────────────────────────
const PROFILE_KEY = 'unofficial.profile.v1';
const roomFromPath = () => ((typeof location !== 'undefined' && location.pathname.match(/^\/unofficial\/room\/([a-z0-9]{3,12})/i)) || [])[1]?.toLowerCase() || null;
const codeFromInput = (raw) => {
  const t = String(raw || '').trim();
  const m = t.match(/room\/([a-z0-9]{3,12})/i) || t.match(/^([a-z0-9]{3,12})$/i);
  return m ? m[1].toLowerCase() : null;
};
const newToken = () => {
  try { return Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => (b % 36).toString(36)).join(''); } catch { return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) + Date.now().toString(36); }
};

/**
 * The server sends the table in seat order. Turn it round so you sit at the bottom (display seat 0)
 * and everyone else follows clockwise; opponents' hands become face-down placeholders.
 */
function adaptView(v, receivedAt) {
  const n = v.players.length;
  const you = v.you >= 0 ? v.you : 0;
  const toD = (i) => (i == null || i < 0 ? i : mod(i - you, n));
  const toS = (d) => mod(d + you, n);
  const players = v.players.map((_, d) => {
    const i = toS(d);
    const p = v.players[i];
    const hand = i === v.you ? v.hand : v.reveal ? v.reveal[i] : Array.from({ length: p.count }, (_, k) => ({ id: `h${i}-${k}`, hidden: true }));
    return { ...p, seat: i, isHuman: !p.bot, hand, name: i === v.you ? 'You' : p.name };
  });
  const me = v.you >= 0 ? v.players[v.you] : null;
  return {
    ...v, players, current: toD(v.current), winner: v.winner == null ? null : toD(v.winner),
    drawPile: { length: v.drawCount }, spectator: v.you < 0, toD, toS,
    turnDeadline: v.turnLeft > 0 ? receivedAt + v.turnLeft : 0,
    graceDeadline: me && me.uno === 'grace' ? receivedAt + me.unoLeft : 0,
  };
}

// ── Profile photos ───────────────────────────────────────────────────────────
// The photo is kept in PoorDown's profile on this device, so one photo shows in both College Portal games.
const SHARED_PROFILE_KEY = 'boomtown.online.v1';
const PHOTO_OUT = 128; // pixels per side of the saved picture
const PHOTO_MAX_CHARS = 24000; // the server refuses anything bigger
const isPhoto = (v) => typeof v === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(v) && v.length <= PHOTO_MAX_CHARS;
function loadSharedProfile() { const p = loadJSON(SHARED_PROFILE_KEY); return { name: typeof p.name === 'string' ? p.name : '', avatar: isPhoto(p.avatar) ? p.avatar : '' }; }
function saveSharedPhoto(url) { saveJSON(SHARED_PROFILE_KEY, { ...loadJSON(SHARED_PROFILE_KEY), avatar: url }); }

/** Open the file chooser. Must run inside a click or tap. */
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
/** Load a picture and scale big phone photos down before cropping. */
function loadPicture(file) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type || 'image/')) { reject(new Error('not an image')); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const w = img.naturalWidth, h = img.naturalHeight;
      const k = Math.min(1, 1400 / Math.max(w, h));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
      const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, c.width, c.height);
      resolve(c);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('unreadable')); };
    img.src = url;
  });
}

/** Drag, pinch, scroll or use the keys to fit the picture in the circle; "Use photo" returns a small JPEG data URL. */
function PhotoCropper({ src, onUse, onCancel, onOther }) {
  const stageRef = useRef(null);
  const cvRef = useRef(null);
  const st = useRef({ S: 0, base: 1, z: 1, ox: 0, oy: 0 });
  const pts = useRef(new Map());
  const pinch = useRef(null);
  const [zoom, setZoom] = useState(1);
  const w = src.width, h = src.height;
  const scale = () => st.current.base * st.current.z;
  const clampPos = () => { const s = st.current, sc = scale(); s.ox = Math.min(0, Math.max(s.S - w * sc, s.ox)); s.oy = Math.min(0, Math.max(s.S - h * sc, s.oy)); };
  const draw = () => {
    const cv = cvRef.current; if (!cv) return;
    const s = st.current, dpr = Math.min(3, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(s.S * dpr)) cv.width = cv.height = Math.round(s.S * dpr);
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, s.S, s.S); ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, s.ox, s.oy, w * scale(), h * scale());
  };
  const measure = () => {
    const s = st.current, old = s.S;
    const cx = old ? (s.S / 2 - s.ox) / scale() : w / 2, cy = old ? (s.S / 2 - s.oy) / scale() : h / 2;
    s.S = stageRef.current?.clientWidth || 260;
    s.base = Math.max(s.S / w, s.S / h);
    s.ox = s.S / 2 - cx * scale(); s.oy = s.S / 2 - cy * scale();
    clampPos(); draw();
  };
  const zoomTo = (nz, px, py) => {
    const s = st.current;
    nz = clamp(nz, 1, 4);
    const ix = (px - s.ox) / scale(), iy = (py - s.oy) / scale();
    s.z = nz; s.ox = px - ix * scale(); s.oy = py - iy * scale();
    clampPos(); draw(); setZoom(nz);
  };
  const local = (e) => { const r = stageRef.current.getBoundingClientRect(), S = st.current.S; return { x: (e.clientX - r.left) * (S / r.width), y: (e.clientY - r.top) * (S / r.height) }; };
  const pinchInfo = () => { const [a, b] = [...pts.current.values()]; return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; };
  useEffect(() => {
    st.current = { S: 0, base: 1, z: 1, ox: 0, oy: 0 }; setZoom(1);
    const raf = requestAnimationFrame(() => { measure(); stageRef.current?.focus({ preventScroll: true }); });
    const onResize = () => measure();
    const stage = stageRef.current;
    const onWheel = (e) => { e.preventDefault(); const p = local(e); zoomTo(st.current.z * Math.exp(-e.deltaY * 0.0015), p.x, p.y); };
    window.addEventListener('resize', onResize);
    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); stage.removeEventListener('wheel', onWheel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);
  function exportPhoto() {
    const s = st.current, sc = scale(), sx = -s.ox / sc, sy = -s.oy / sc, side = s.S / sc;
    const mid = document.createElement('canvas'); mid.width = mid.height = PHOTO_OUT * 4;
    const m = mid.getContext('2d'); m.imageSmoothingQuality = 'high'; m.fillStyle = '#fff'; m.fillRect(0, 0, mid.width, mid.height);
    m.drawImage(src, sx, sy, side, side, 0, 0, mid.width, mid.height);
    const out = document.createElement('canvas'); out.width = out.height = PHOTO_OUT;
    const g = out.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(mid, 0, 0, PHOTO_OUT, PHOTO_OUT);
    let q = 0.86, url = out.toDataURL('image/jpeg', q);
    while (url.length > PHOTO_MAX_CHARS && q > 0.35) { q -= 0.12; url = out.toDataURL('image/jpeg', q); }
    return isPhoto(url) ? url : null;
  }
  const onKeyDown = (e) => {
    const s = st.current, k = e.key, step = 10;
    if (k === 'ArrowLeft') s.ox += step; else if (k === 'ArrowRight') s.ox -= step;
    else if (k === 'ArrowUp') s.oy += step; else if (k === 'ArrowDown') s.oy -= step;
    else if (k === '+' || k === '=') { e.preventDefault(); zoomTo(s.z * 1.1, s.S / 2, s.S / 2); return; }
    else if (k === '-' || k === '_') { e.preventDefault(); zoomTo(s.z / 1.1, s.S / 2, s.S / 2); return; }
    else return;
    e.preventDefault(); clampPos(); draw();
  };
  return (
    <motion.div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-6" style={{ background: 'rgba(32,29,24,0.45)' }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.14 }}>
      <motion.div role="dialog" aria-modal="true" aria-label="Your photo" className="w-full max-w-[380px] rounded-t-3xl p-5 sm:rounded-3xl"
        style={{ background: CREAM, color: INK, boxShadow: '0 30px 60px -20px rgba(30,25,18,0.5)' }}
        initial={{ y: 24 }} animate={{ y: 0 }} transition={{ type: 'spring', stiffness: 560, damping: 42 }}>
        <div className="text-lg font-black italic tracking-tight">Your photo</div>
        <div id="uo-photo-hint" className="mb-3 text-xs" style={{ color: 'rgba(38,39,43,0.6)' }}>Drag to move it. Pinch, scroll or use the slider to zoom. Arrow keys and + or − work too.</div>
        <div ref={stageRef} tabIndex={0} role="application" aria-label="Photo position" aria-describedby="uo-photo-hint" onKeyDown={onKeyDown}
          className="relative mx-auto aspect-square w-full max-w-[280px] cursor-grab touch-none overflow-hidden rounded-2xl outline-none focus-visible:ring-2"
          style={{ background: '#1F2023' }}
          onPointerDown={(e) => { stageRef.current.setPointerCapture(e.pointerId); pts.current.set(e.pointerId, local(e)); if (pts.current.size === 2) pinch.current = { ...pinchInfo(), z: st.current.z }; e.preventDefault(); }}
          onPointerMove={(e) => {
            if (!pts.current.has(e.pointerId)) return;
            const prev = pts.current.get(e.pointerId), now = local(e);
            pts.current.set(e.pointerId, now);
            const s = st.current;
            if (pts.current.size === 1) { s.ox += now.x - prev.x; s.oy += now.y - prev.y; clampPos(); draw(); }
            else if (pts.current.size === 2 && pinch.current) {
              const p = pinchInfo();
              zoomTo(pinch.current.z * (p.d / pinch.current.d), p.x, p.y);
              s.ox += p.x - pinch.current.x; s.oy += p.y - pinch.current.y; clampPos(); draw();
              pinch.current.x = p.x; pinch.current.y = p.y;
            }
          }}
          onPointerUp={(e) => { pts.current.delete(e.pointerId); pinch.current = pts.current.size === 2 ? { ...pinchInfo(), z: st.current.z } : null; }}
          onPointerCancel={(e) => { pts.current.delete(e.pointerId); pinch.current = null; }}>
          <canvas ref={cvRef} className="block h-full w-full" />
          <div className="pointer-events-none absolute inset-0 rounded-full" style={{ boxShadow: '0 0 0 999px rgba(20,18,15,0.55), inset 0 0 0 2px rgba(251,247,239,0.9)' }} />
        </div>
        <label className="mt-3 flex items-center gap-3 text-sm font-bold">
          <span aria-hidden="true">−</span>
          <input type="range" min="1" max="4" step="0.01" value={zoom} aria-label="Zoom" className="flex-1"
            onChange={(e) => { const S = st.current.S; zoomTo(parseFloat(e.target.value), S / 2, S / 2); }} />
          <span aria-hidden="true">+</span>
        </label>
        <button type="button" onClick={onOther} className="mt-2 min-h-[44px] text-sm font-semibold underline underline-offset-4" style={{ color: 'rgba(38,39,43,0.7)' }}>Choose another picture</button>
        <div className="mt-2 flex items-center justify-end gap-2">
          <GhostButton onClick={onCancel}>Cancel</GhostButton>
          <PrimaryButton onClick={() => { const url = exportPhoto(); if (url) onUse(url); }}>Use photo</PrimaryButton>
        </div>
      </motion.div>
    </motion.div>
  );
}

/** Seconds left on a clock, shown only once it gets close. Ticks on its own so the table doesn't re-render. */
function Countdown({ deadline, under = 10, prefix = ' · ', suffix = 's' }) {
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => {
    if (!deadline) return undefined;
    const id = setInterval(force, 250);
    return () => clearInterval(id);
  }, [deadline]);
  if (!deadline) return null;
  const left = Math.ceil((deadline - performance.now()) / 1000);
  if (left > under || left < 0) return null;
  return <span className="tabular-nums">{prefix}{left}{suffix}</span>;
}

function Panel({ children, className = '' }) {
  return (
    <div className={`w-full rounded-3xl p-5 sm:p-6 ${className}`} style={{ background: CREAM, boxShadow: '0 24px 50px -24px rgba(30,25,18,0.4), 0 0 0 1px rgba(38,32,24,0.06)' }}>
      {children}
    </div>
  );
}

function TextInput({ value, onChange, placeholder, id, label, maxLength = 18, onEnter, autoFocus }) {
  return (
    <input
      id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={label}
      maxLength={maxLength} autoComplete="off" spellCheck="false" autoFocus={autoFocus}
      onKeyDown={(e) => { if (e.key === 'Enter' && onEnter) { e.preventDefault(); onEnter(); } }}
      className="h-12 w-full min-w-0 rounded-xl px-3.5 text-[15px] outline-none"
      style={{ background: '#FFFFFF', color: INK, boxShadow: 'inset 0 0 0 1px rgba(38,32,24,0.18)' }}
      onFocus={(e) => { e.target.style.boxShadow = `inset 0 0 0 2px ${INK}`; }}
      onBlur={(e) => { e.target.style.boxShadow = 'inset 0 0 0 1px rgba(38,32,24,0.18)'; }}
    />
  );
}

function Stepper({ value, min, max, onChange, label }) {
  return (
    <div className="inline-flex items-center rounded-full p-1" style={{ background: 'rgba(38,39,43,0.07)' }} role="group" aria-label={label}>
      <button type="button" aria-label={`Fewer ${label.toLowerCase()}`} disabled={value <= min} onClick={() => onChange(value - 1)}
        className="grid h-11 w-11 place-items-center rounded-full disabled:opacity-30" style={{ color: INK }}><Minus size={16} /></button>
      <span className="w-8 text-center text-base font-bold tabular-nums" aria-live="polite">{value}</span>
      <button type="button" aria-label={`More ${label.toLowerCase()}`} disabled={value >= max} onClick={() => onChange(value + 1)}
        className="grid h-11 w-11 place-items-center rounded-full disabled:opacity-30" style={{ color: INK }}><Plus size={16} /></button>
    </div>
  );
}

const CLOCKS = [{ value: 0, label: 'Off' }, { value: 15, label: '15s' }, { value: 30, label: '30s' }, { value: 60, label: '60s' }];
const PENALTIES = [{ value: 0, label: 'Off' }, { value: 2, label: '+2' }, { value: 4, label: '+4' }];
const HANDS = [{ value: 5, label: '5' }, { value: 7, label: '7' }, { value: 10, label: '10' }];

function RuleRow({ title, hint, children, value, editable }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="min-w-0 flex-1 basis-[180px]">
        <div className="text-sm font-semibold">{title}</div>
        {hint && <div className="text-xs" style={{ color: 'rgba(38,39,43,0.55)' }}>{hint}</div>}
      </div>
      {editable ? children : <span className="text-sm font-semibold">{value}</span>}
    </div>
  );
}

/** The host's house rules, like PoorDown's. Everyone else sees them read-only. */
function RulesPanel({ settings, editable, onChange, seated, scope }) {
  const set = (patch) => onChange(patch);
  const onOff = (v) => (v ? 'On' : 'Off');
  return (
    <div className="flex flex-col gap-4">
      <RuleRow editable={editable} title="Seats at the table" hint="2 to 8 players, classmates and bots" value={settings.maxSeats}>
        <Stepper label="Seats" value={settings.maxSeats} min={Math.max(2, seated || 2)} max={8} onChange={(v) => set({ maxSeats: v })} />
      </RuleRow>
      <RuleRow editable={editable} title="Starting hand" hint="Cards each (7 at most with 7–8 players)" value={`${settings.handSize} cards`}>
        <Segmented id={`${scope}-hand`} value={settings.handSize} onChange={(v) => set({ handSize: v })} options={HANDS} />
      </RuleRow>
      <RuleRow editable={editable} title="Turn clock" hint="A bot plays for anyone who runs out of time" value={settings.turnClock ? `${settings.turnClock}s` : 'Off'}>
        <Segmented id={`${scope}-clock`} value={settings.turnClock} onChange={(v) => set({ turnClock: v })} options={CLOCKS} />
      </RuleRow>
      <RuleRow editable={editable} title="Bot speed" hint="How fast bots move and cards fly" value={SPEEDS[settings.speed]?.label}>
        <Segmented id={`${scope}-speed`} value={settings.speed} onChange={(v) => set({ speed: v })} options={Object.entries(SPEEDS).map(([k, v]) => ({ value: k, label: v.label }))} />
      </RuleRow>
      <RuleRow editable={editable} title="UNOFFICIAL! penalty" hint="Cards for forgetting to call at one card" value={settings.unoPenalty ? `+${settings.unoPenalty}` : 'Off'}>
        <Segmented id={`${scope}-uno`} value={settings.unoPenalty} onChange={(v) => set({ unoPenalty: v })} options={PENALTIES} />
      </RuleRow>
      <RuleRow editable={editable} title="Stack draw cards" hint="+2 on +2, and +4 on any draw card" value={onOff(settings.stacking)}>
        <Toggle label="Stack draw cards" checked={settings.stacking} onChange={(v) => set({ stacking: v })} />
      </RuleRow>
      <RuleRow editable={editable} title="Draw until you can play" hint="Instead of drawing just one card" value={onOff(settings.drawToMatch)}>
        <Toggle label="Draw until you can play" checked={settings.drawToMatch} onChange={(v) => set({ drawToMatch: v })} />
      </RuleRow>
      <RuleRow editable={editable} title="Strict Wild +4" hint="Only when you have nothing in the active colour" value={onOff(settings.wild4Strict)}>
        <Toggle label="Strict Wild +4" checked={settings.wild4Strict} onChange={(v) => set({ wild4Strict: v })} />
      </RuleRow>
      <RuleRow editable={editable} title="Sevens & zeros" hint="A 7 swaps hands with a player you pick; a 0 passes every hand on" value={onOff(settings.sevenZero)}>
        <Toggle label="Sevens and zeros" checked={settings.sevenZero} onChange={(v) => set({ sevenZero: v })} />
      </RuleRow>
      <RuleRow editable={editable} title="Private room" hint="Only people with the link or code can join" value={settings.private ? 'Private' : 'Public'}>
        <Toggle label="Private room" checked={settings.private} onChange={(v) => set({ private: v })} />
      </RuleRow>
    </div>
  );
}

/** Waiting room: share the link, fill seats with classmates or bots, set the rules, deal. */
function Lobby({ room, onSend, onCopy, onLeave, link, wide, photo, onPhoto }) {
  const full = room.seats.length >= room.max;
  const playing = room.status === 'playing';
  const me = room.seats.find((x) => x.you);
  return (
    <div className="mx-auto grid w-full max-w-[980px] gap-4 px-4 py-6 md:grid-cols-2 md:items-start md:gap-6 md:py-10">
      <div className="flex w-full flex-col gap-4 md:col-start-1 md:row-start-1">
        <Panel>
          <div className="text-xs font-bold uppercase tracking-wider" style={{ color: 'rgba(38,39,43,0.5)' }}>Room code</div>
          <div className="mt-1 font-black italic tracking-tight" style={{ fontSize: wide ? 44 : 38, lineHeight: 1, letterSpacing: '0.02em' }}>{room.id}</div>
          <p className="mt-3 text-sm" style={{ color: 'rgba(38,39,43,0.65)' }}>
            Send classmates the link, or tell them the code: they type it on the College Portal or in UnOfficial.
          </p>
          <div className="mt-3 flex gap-2">
            <input readOnly value={link} aria-label="Room link" onFocus={(e) => e.target.select()}
              className="h-11 min-w-0 flex-1 rounded-xl px-3 text-sm outline-none" style={{ background: '#FFFFFF', boxShadow: 'inset 0 0 0 1px rgba(38,32,24,0.18)', color: INK }} />
            <GhostButton onClick={onCopy}><Copy size={16} /> Copy</GhostButton>
          </div>
        </Panel>
        {playing && (
          <div className="rounded-2xl px-4 py-3 text-sm font-semibold" style={{ background: 'rgba(230,164,43,0.18)', color: '#5A3E06' }}>
            {me ? 'A hand is being played right now. You’re dealt in from the next hand.' : 'A hand is being played and the table is full. You can watch the seats here.'}
          </div>
        )}
      </div>
      <div className="w-full md:col-start-1 md:row-start-2">
        <Panel>
          <div className="mb-1 text-sm font-bold">House rules</div>
          <div className="mb-4 text-xs" style={{ color: 'rgba(38,39,43,0.55)' }}>
            {room.host ? (playing ? 'Changes apply from the next hand (speed and the turn clock apply now).' : 'You’re the host: set the table up before you deal.') : `${room.hostName || 'The host'} sets the rules.`}
          </div>
          <RulesPanel scope="lobby" settings={room.settings} editable={room.host} seated={room.seats.length} onChange={(patch) => onSend({ type: 'setting', settings: patch })} />
        </Panel>
      </div>

      <div className="flex w-full flex-col gap-4 md:col-start-2 md:row-span-2 md:row-start-1">
        <Panel>
          <div className="mb-3 flex items-baseline justify-between">
            <div className="text-sm font-bold">Players</div>
            <div className="text-xs font-semibold tabular-nums" style={{ color: 'rgba(38,39,43,0.55)' }}>{room.seats.length} of {room.max} seats</div>
          </div>
          <div className="flex flex-col gap-2">
            {room.seats.map((x, i) => (
              <div key={x.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl px-3 py-2" style={{ background: x.you ? 'rgba(38,39,43,0.08)' : 'rgba(38,39,43,0.04)', opacity: x.online ? 1 : 0.6 }}>
                <div className="flex min-w-0 items-center gap-2.5">
                  {x.you ? (
                    <button type="button" onClick={onPhoto} aria-label={photo ? 'Change your photo' : 'Add a photo'} className="relative shrink-0 rounded-full">
                      <Avatar index={i % SEAT_TONES.length} name={x.name} size={32} src={photo} />
                      <span className="absolute -bottom-1 -right-1 grid h-[18px] w-[18px] place-items-center rounded-full" style={{ background: INK, color: CREAM, boxShadow: `0 0 0 2px ${CREAM}` }}><Camera size={10} /></span>
                    </button>
                  ) : <Avatar index={i % SEAT_TONES.length} name={x.name} size={32} src={x.avatar} />}
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-sm font-semibold">
                      <span className="truncate">{x.name}{x.you ? ' (you)' : ''}</span>
                      {x.host && <Crown size={13} aria-label="Host" style={{ color: PALETTE.yellow.shade }} />}
                      {!x.online && <WifiOff size={13} aria-label="Offline" />}
                    </div>
                    <div className="text-xs" style={{ color: 'rgba(38,39,43,0.55)' }}>
                      {x.bot ? (x.difficulty === 'strategic' ? 'Strategic bot' : 'Easy bot') : x.online ? 'Classmate' : 'Reconnecting…'}
                      {playing && !x.inHand ? ' · next hand' : ''}{x.score ? ` · ${x.score} pts` : ''}
                    </div>
                  </div>
                </div>
                {room.host && !x.you && !(playing && x.inHand) && (
                  <div className="flex items-center gap-1">
                    {x.bot && (
                      <Segmented id={`bot-${x.id}`} value={x.difficulty} onChange={(v) => onSend({ type: 'setBot', seat: x.id, difficulty: v })}
                        options={[{ value: 'easy', label: 'Easy', icon: Dices }, { value: 'strategic', label: 'Strategic', icon: Brain }]} />
                    )}
                    <IconButton label={x.bot ? `Remove ${x.name}` : `Give ${x.name}'s seat to someone else`} onClick={() => onSend({ type: 'removeSeat', seat: x.id })}><X size={17} /></IconButton>
                  </div>
                )}
                {x.you && !(playing && x.inHand) && room.seats.length > 0 && (
                  <GhostButton onClick={() => onSend({ type: 'unseat' })}>Stand up</GhostButton>
                )}
              </div>
            ))}
            {Array.from({ length: Math.max(0, room.max - room.seats.length) }, (_, i) => (
              <div key={`empty${i}`} className="flex h-[52px] items-center rounded-2xl px-3 text-sm" style={{ border: '1px dashed rgba(38,39,43,0.2)', color: 'rgba(38,39,43,0.45)' }}>
                Empty seat
              </div>
            ))}
          </div>
          {room.host && full && room.max < 8 && <div className="mt-3 text-xs" style={{ color: 'rgba(38,39,43,0.55)' }}>Table full. Add seats in the house rules to fit more players.</div>}
          {room.host && !full && (
            <div className="mt-3 flex flex-wrap gap-2">
              <GhostButton onClick={() => onSend({ type: 'addBot', difficulty: 'easy' })}><Plus size={16} /> Easy bot</GhostButton>
              <GhostButton onClick={() => onSend({ type: 'addBot', difficulty: 'strategic' })}><Plus size={16} /> Strategic bot</GhostButton>
            </div>
          )}
          {!me && !full && <div className="mt-3"><PrimaryButton onClick={() => onSend({ type: 'seat' })}>Take a seat</PrimaryButton></div>}
          {!me && full && <div className="mt-3 text-sm" style={{ color: 'rgba(38,39,43,0.6)' }}>Every seat is taken. You’re watching; ask the host for a seat.</div>}
        </Panel>
        <div className="flex flex-col gap-2 sm:flex-row">
          {room.host ? (
            <PrimaryButton className="flex-1" onClick={() => onSend({ type: 'start' })} kbd={wide ? '↵' : null}>
              {room.seats.length < 2 ? 'Add a bot or wait for a classmate' : playing ? 'Hand in progress' : 'Deal cards'}
            </PrimaryButton>
          ) : (
            <div className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold" style={{ background: 'rgba(38,39,43,0.06)' }}>
              {playing ? 'Hand in progress' : <>Waiting for {room.hostName || 'the host'} to deal <ThinkingDots /></>}
            </div>
          )}
          <GhostButton onClick={onLeave}>Leave room</GhostButton>
        </div>
      </div>
    </div>
  );
}

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
  const [profile, setProfile] = useState(() => {
    const p = loadJSON(PROFILE_KEY);
    const name = typeof p.name === 'string' && p.name ? p.name : loadSharedProfile().name; // a PoorDown nickname is a fine start
    return { name: (name || '').slice(0, 18), token: /^[a-z0-9]{16,64}$/i.test(p.token || '') ? p.token : newToken() };
  });
  const [conn, setConn] = useState('connecting');
  const [room, setRoom] = useState(null);
  const [display, setDisplay] = useState(null);
  const [flights, setFlights] = useState([]);
  const [picker, setPicker] = useState(null);
  const [selected, setSelected] = useState(null);
  const [shake, setShake] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [bubbles, setBubbles] = useState({});
  const [ripple, setRipple] = useState(null);
  const [thud, setThud] = useState(0);
  const [modal, setModal] = useState(null); // 'settings' | 'stats' | 'leave'
  const [overOpen, setOverOpen] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [homeTab, setHomeTab] = useState('class');
  const [joinCode, setJoinCode] = useState(() => roomFromPath() || '');
  const [homeErr, setHomeErr] = useState('');
  const [sent, setSent] = useState(false); // a move is on its way to the server
  const [openRooms, setOpenRooms] = useState(null);
  const [swapPick, setSwapPick] = useState(null); // { cardId } while choosing who to swap hands with
  const [photo, setPhoto] = useState(() => loadSharedProfile().avatar);
  const [crop, setCrop] = useState(null); // a picture being fitted into the circle

  const settingsRef = useLatest(settings);
  const reduceRef = useLatest(reduceMotion);
  const pickerRef = useLatest(picker);
  const swapRef = useLatest(swapPick);
  const photoRef = useLatest(photo);
  const cropRef = useLatest(crop);
  const profileRef = useLatest(profile);
  const roomRef = useLatest(room);
  const displayRef = useRef(null);
  const wsRef = useRef(null);
  const wantRoomRef = useRef(roomFromPath());
  const queueRef = useRef([]);
  const runningRef = useRef(false);
  const timersRef = useRef(new Set());
  const resolversRef = useRef(new Map());
  const seqRef = useRef(0);
  const lastTryRef = useRef(null);
  const overSeqRef = useRef(-1);

  const deckRef = useRef(null);
  const discardRef = useRef(null);
  const handRef = useRef(null);
  const seatEls = useRef({});
  const seatRefFns = useRef({});
  const seatRef = (i) => (seatRefFns.current[i] ||= (el) => { seatEls.current[i] = el; });

  useEffect(() => { Sound.setEnabled(settings.sound); saveJSON(SETTINGS_KEY, settings); }, [settings]);
  useEffect(() => { saveJSON(STATS_KEY, stats); }, [stats]);
  useEffect(() => { saveJSON(PROFILE_KEY, profile); }, [profile]);
  useEffect(() => () => timersRef.current.forEach(clearTimeout), []);

  // ── Sizes: hand first, then shrink the pile to whatever height is left ────
  const handCount = display?.players[0]?.hand.length || 0;
  const oppCount = Math.max(0, (display?.players.length || 1) - 1);
  const layout = useMemo(() => handLayout(handCount, { width: base.handWidth, cardW: base.hand, minStep: base.minStep }), [handCount, base]);
  const sizes = useMemo(() => {
    const tableH = vp.h - 56 - 64 - layout.height - 10;
    const seatBlock = base.wide ? (oppCount === 2 || oppCount === 6 ? 0 : base.opp * 1.4 + 70) : (base.opp * 1.4 + 46) * (oppCount > 4 ? 2 : 1);
    const reserve = base.wide ? 118 : 126;
    return { ...base, pile: Math.round(clamp((tableH - seatBlock - reserve) / 1.82, 44, base.pile)) };
  }, [base, layout.height, vp.h, oppCount]);
  const geomRef = useLatest(sizes);

  // ── Timing helpers ─────────────────────────────────────────────────────────
  const dur = (sec) => sec * (SPEEDS[displayRef.current?.speed]?.anim ?? 1) * (reduceRef.current ? 0.6 : 1);
  const later = (fn, ms) => {
    const id = setTimeout(() => { timersRef.current.delete(id); fn(); }, Math.max(0, ms));
    timersRef.current.add(id);
    return id;
  };

  // ── Feedback ───────────────────────────────────────────────────────────────
  const toast = (text, tone = 'ink') => {
    const id = ++seqRef.current;
    setToasts((t) => [...t.slice(-1), { id, text, tone }]);
    later(() => setToasts((t) => t.filter((x) => x.id !== id)), 2100);
  };
  const say = (d, text, tone = 'ink') => {
    const id = ++seqRef.current;
    setBubbles((b) => ({ ...b, [d]: { id, text, tone } }));
    later(() => setBubbles((b) => (b[d]?.id === id ? { ...b, [d]: null } : b)), 1500);
  };

  // ── Geometry: screen points for flights ────────────────────────────────────
  const pointOf = (el, s) => {
    if (!el) return { x: window.innerWidth / 2, y: window.innerHeight / 2, rot: 0, s };
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, rot: 0, s };
  };
  const deckPoint = () => pointOf(deckRef.current, 1);
  const discardPoint = (rot = 0, dx = 0, dy = 0) => { const p = pointOf(discardRef.current, 1); return { ...p, x: p.x + dx, y: p.y + dy, rot }; };
  const seatPoint = (d) => pointOf(seatEls.current[d], geomRef.current.opp / geomRef.current.pile);
  const handSlotPoint = (cardId, handOverride, lifted = false) => {
    const g = geomRef.current;
    const hand = handOverride || displayRef.current?.players[0]?.hand || [];
    const el = handRef.current;
    const i = hand.findIndex((c) => c.id === cardId);
    if (!el || i < 0) { const p = pointOf(el, g.hand / g.pile); return el ? { ...p, y: el.getBoundingClientRect().top + HAND_PAD + (g.hand * 1.4) / 2 } : p; }
    const r = el.getBoundingClientRect();
    const slot = handLayout(hand.length, { width: g.handWidth, cardW: g.hand, minStep: g.minStep }).slots[i];
    return { x: r.left + r.width / 2 + slot.x, y: r.top + HAND_PAD + slot.y + (g.hand * 1.4) / 2 - (lifted ? LIFT_PLAYABLE : 0), rot: slot.rot, s: g.hand / g.pile };
  };

  // ── Flight layer ───────────────────────────────────────────────────────────
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
  const dropFlights = () => { for (const r of resolversRef.current.values()) r(); resolversRef.current.clear(); setFlights([]); };

  // ── Connection ─────────────────────────────────────────────────────────────
  const api = useRef({});
  useEffect(() => {
    let stop = false;
    let retry = 0;
    let timer = null;
    const connect = () => {
      const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/unofficial/ws`);
      wsRef.current = ws;
      ws.onopen = () => {
        retry = 0;
        setConn('open');
        const p = profileRef.current;
        ws.send(JSON.stringify({ type: 'hello', token: p.token, name: p.name, avatar: photoRef.current || '' }));
        if (wantRoomRef.current && p.name) ws.send(JSON.stringify({ type: 'join', room: wantRoomRef.current, name: p.name }));
      };
      ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } api.current.onMessage(m); };
      ws.onclose = () => {
        if (wsRef.current !== ws) return;
        setConn('closed');
        if (!stop) timer = setTimeout(connect, Math.min(4000, 400 * 2 ** retry++));
      };
    };
    connect();
    return () => { stop = true; clearTimeout(timer); wsRef.current?.close(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const send = (m) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === 1) { ws.send(JSON.stringify(m)); return true; }
    toast('Reconnecting… try again in a moment', 'red');
    return false;
  };

  function resetTable() {
    queueRef.current = [];
    dropFlights();
    displayRef.current = null;
    setDisplay(null); setPicker(null); setSwapPick(null); setSelected(null); setOverOpen(false); setBubbles({}); setRipple(null); setSent(false);
  }

  function onMessage(m) {
    switch (m.type) {
      case 'welcome':
        if (typeof window !== 'undefined' && window.UO_BUILD && m.build && m.build !== window.UO_BUILD) {
          try { if (sessionStorage.getItem('uo-reloaded') !== m.build) { sessionStorage.setItem('uo-reloaded', m.build); location.reload(); return; } } catch { /* stay on this version */ }
        }
        if (m.token && m.token !== profileRef.current.token) setProfile((p) => ({ ...p, token: m.token }));
        return;
      case 'room': {
        const prev = roomRef.current;
        roomRef.current = m.room;
        setRoom(m.room);
        wantRoomRef.current = m.room.id;
        const path = `/unofficial/room/${m.room.id}`;
        if (location.pathname !== path) history.replaceState(null, '', path);
        if (!prev || prev.id !== m.room.id) { setHomeErr(''); if (m.room.status === 'waiting') resetTable(); }
        return;
      }
      case 'game':
        m.receivedAt = performance.now();
        queueRef.current.push(m);
        if (!runningRef.current) runQueue();
        return;
      case 'error':
        setSent(false);
        if (m.code === 'noroom') {
          wantRoomRef.current = null; roomRef.current = null; setRoom(null); resetTable();
          if (location.pathname !== '/unofficial') history.replaceState(null, '', '/unofficial');
          setHomeErr(m.text); setHomeTab('class');
          return;
        }
        Sound.error();
        if (m.code === 'badcard' && lastTryRef.current) setShake({ id: lastTryRef.current, k: performance.now() });
        else if (m.code === 'photo') { setHomeErr(m.text); toast(m.text, 'red'); }
        else if (!['turn', 'uno', 'catch'].includes(m.code)) toast(m.text, 'red');
        return;
      case 'rooms': setOpenRooms(m.rooms); return;
      case 'notice': toast(m.text); return;
      case 'left':
        wantRoomRef.current = null; roomRef.current = null; setRoom(null); resetTable();
        if (location.pathname !== '/unofficial') history.pushState(null, '', '/unofficial');
        return;
      default:
    }
  }

  // ── Event queue: each server change is animated in order ───────────────────
  async function runQueue() {
    runningRef.current = true;
    setAnimating(true);
    while (queueRef.current.length) {
      const m = queueRef.current.shift();
      const fast = document.hidden || queueRef.current.length > 3;
      try { await applyGame(m, fast); } catch (e) { console.error(e); commit(adaptView(m.view, m.receivedAt)); }
    }
    runningRef.current = false;
    setAnimating(false);
  }
  function commit(next) { displayRef.current = next; setDisplay(next); }

  async function applyGame(m, fast) {
    const prev = displayRef.current;
    const next = adaptView(m.view, m.receivedAt);
    const ev = m.ev || { kind: 'sync' };
    setSent(false);
    if (ev.kind === 'deal') { setOverOpen(false); setPicker(null); setSwapPick(null); setSelected(null); overSeqRef.current = -1; }
    if (fast || (!prev && ev.kind !== 'deal')) { commit(next); react(ev, next, prev); return; }
    const D = (i) => next.toD(i);

    if (ev.kind === 'deal') {
      const n = next.players.length;
      const mine = next.players[0].hand.slice();
      const landings = [];
      ev.order.forEach((si, k) => {
        const d = D(si);
        const card = d === 0 && !next.spectator ? mine.shift() : { id: `deal${m.seq}-${k}`, color: 'wild', type: 'wild' };
        if (!card) return;
        later(() => Sound.deal(), dur(0.045) * 1000 * k);
        landings.push(fly({
          card, toSeat: d === 0 ? null : d, delay: dur(0.045) * k,
          from: deckPoint(), to: d === 0 ? () => handSlotPoint(card.id) : seatPoint(d),
          faceFrom: false, faceTo: d === 0 && !next.spectator, duration: dur(0.22), ease: EASE_DEAL, arc: 24, pop: 0.04,
        }));
      });
      const topE = next.discard[next.discard.length - 1];
      const flipDelay = dur(0.045) * ev.order.length + dur(0.22);
      landings.push(fly({ card: topE.card, from: deckPoint(), to: discardPoint(topE.rot), delay: flipDelay, faceFrom: false, faceTo: true, duration: dur(0.26), ease: EASE_PLAY, arc: 30 }));
      commit(next);
      await Promise.all(landings);
      Sound.play();
      toast(next.current === 0 ? 'You lead off' : `${next.players[next.current].name} leads off`);
      void n;
      return;
    }

    if (ev.kind === 'play') {
      const d = D(ev.player);
      const from = d === 0 && prev && !next.spectator ? handSlotPoint(ev.card.id, prev.players[0].hand, true) : seatPoint(d);
      const landed = fly({
        card: ev.card, chosen: isWild(ev.card) ? ev.color : null, from, to: discardPoint(ev.rot, ev.dx, ev.dy),
        faceFrom: d === 0 && !next.spectator, faceTo: true, duration: dur(0.25), ease: EASE_PLAY, arc: d === 0 ? 70 : 34, pop: 0.1,
      });
      if (d === 0) setSelected(null);
      if (ev.swap && prev) {
        // Keep everyone's old hands on the table until the swap has been shown.
        commit({
          ...next, players: next.players.map((p, i) => {
            const pp = prev.players[i];
            const hand = i === 0 && !next.spectator ? pp.hand.filter((c) => c.id !== ev.card.id)
              : Array.from({ length: Math.max(0, pp.count - (i === d ? 1 : 0)) }, (_, k) => ({ id: `h${p.seat}-${k}`, hidden: true }));
            return { ...p, hand, count: hand.length };
          }),
        });
      } else commit(next);
      Sound.flip();
      await landed;
      Sound.play();
      setThud((t) => t + 1);
      react(ev, next, prev);
      if (ev.swap) {
        const at = (di) => (di === 0 && !next.spectator ? handSlotPoint(null) : seatPoint(di));
        const pairs = ev.swap.kind === 'swap' ? [[D(ev.swap.a), D(ev.swap.b)], [D(ev.swap.b), D(ev.swap.a)]]
          : next.players.map((_, i) => [i, mod(i + ev.swap.direction, next.players.length)]);
        const moves = [];
        pairs.forEach(([from, to], j) => {
          for (let k = 0; k < 3; k++) {
            const fp = at(from);
            const tp = at(to);
            moves.push(fly({ card: { id: `swap${m.seq}-${j}-${k}`, color: 'wild', type: 'wild' }, from: { ...fp, s: Math.min(fp.s, 0.7) }, to: { ...tp, s: Math.min(tp.s, 0.7) },
              delay: dur(0.06) * k, faceFrom: false, faceTo: false, duration: dur(0.3), ease: EASE_PLAY, arc: 40, pop: 0.05 }));
          }
        });
        Sound.draw();
        await Promise.all(moves);
        commit(next);
      }
      return;
    }

    if (ev.kind === 'draw') {
      const d = D(ev.player);
      const mineIds = d === 0 && ev.cards ? ev.cards : null;
      const landings = [];
      for (let k = 0; k < ev.count; k++) {
        const card = mineIds ? mineIds[k] : { id: `draw${m.seq}-${k}`, color: 'wild', type: 'wild' };
        later(() => Sound.draw(), dur(0.075) * 1000 * k);
        landings.push(fly({
          card, toSeat: d === 0 ? null : d, delay: dur(0.075) * k,
          from: deckPoint(), to: d === 0 ? () => handSlotPoint(card.id) : seatPoint(d),
          faceFrom: false, faceTo: d === 0 && !!mineIds, duration: dur(0.26), ease: EASE_DRAW, arc: 36, pop: 0.06,
        }));
      }
      commit(next);
      react(ev, next, prev);
      await Promise.all(landings);
      const lastDrawn = mineIds && mineIds[mineIds.length - 1];
      if (d === 0 && ev.reason === 'turn' && lastDrawn && next.phase === 'TURN' && next.current === 0 && isPlayable(lastDrawn, next, next.players[0].hand)) setSelected(lastDrawn.id);
      return;
    }

    commit(next);
    react(ev, next, prev);
  }

  /** Sounds, bubbles and toasts for an event (after its animation, or straight away). */
  function react(ev, next, prev) {
    const D = (i) => next.toD(i);
    const nameOf = (d) => (d === 0 && !next.spectator ? 'you' : next.players[d]?.name || '');
    switch (ev.kind) {
      case 'turn':
        if (next.current === 0 && !next.spectator) { Sound.turn(); setSelected(null); }
        return;
      case 'play': {
        const card = ev.card;
        const d = D(ev.player);
        const n = next.players.length;
        const victim = mod(d + next.direction, n);
        if (d === 0 && !next.spectator) setStats((st) => ({ ...st, cardsPlayed: st.cardsPlayed + 1 }));
        if (isWild(card)) {
          Sound.wild();
          setRipple({ color: ev.color, k: ++seqRef.current });
          if (d !== 0) say(d, PALETTE[ev.color].name);
        }
        if (ev.swap) {
          if (ev.swap.kind === 'swap') toast(`${d === 0 && !next.spectator ? 'You' : next.players[d].name} swapped hands with ${nameOf(D(ev.swap.b))}`);
          else toast('Zero! Every hand moves one seat along');
        }
        if (card.type === 'skip') say(victim, 'Skipped');
        if (card.type === 'reverse') { if (n === 2) say(victim, 'Skipped'); else toast('Direction reversed'); }
        if (card.type === 'draw2' || card.type === 'wild4') {
          const stacked = ev.pending > (card.type === 'draw2' ? 2 : 4);
          const who = nameOf(victim);
          toast(stacked ? `Stacked! +${ev.pending} on ${who}` : `+${ev.pending} for ${who}`, 'red');
        }
        return;
      }
      case 'draw': {
        const d = D(ev.player);
        if (ev.reshuffled) toast('Discards shuffled back into the deck');
        if (ev.reason === 'penalty') { Sound.penalty(); if (d !== 0) say(d, `+${ev.count}`, 'red'); }
        return;
      }
      case 'pass': { const d = D(ev.player); if (d !== 0 || next.spectator) say(d, 'Pass'); return; }
      case 'uno': {
        const d = D(ev.player);
        Sound.uno();
        say(d, 'UNOFFICIAL!', 'red');
        if (d === 0 && !next.spectator) setStats((st) => ({ ...st, unoCalls: st.unoCalls + 1 }));
        return;
      }
      case 'exposed': {
        const d = D(ev.player);
        Sound.tick();
        toast(d === 0 && !next.spectator ? 'You missed your UNOFFICIAL! call' : `${nameOf(d)} didn't call — catch them!`, 'red');
        return;
      }
      case 'catch': {
        const by = D(ev.by);
        const target = D(ev.target);
        Sound.alarm();
        if (by !== 0 || next.spectator) say(by, 'Caught you!', 'red');
        const pen = ev.penalty || 2;
        toast(by === 0 && !next.spectator ? `You caught ${nameOf(target)} — +${pen}` : target === 0 && !next.spectator ? `${nameOf(by)} caught you — draw ${pen}` : `${nameOf(by)} caught ${nameOf(target)} — +${pen}`, 'red');
        if (by === 0 && !next.spectator) setStats((st) => ({ ...st, catches: st.catches + 1 }));
        if (target === 0 && !next.spectator) setStats((st) => ({ ...st, caught: st.caught + 1 }));
        return;
      }
      case 'over': {
        if (overSeqRef.current === next.turnKey) return;
        overSeqRef.current = next.turnKey;
        if (next.spectator) return;
        const won = next.winner === 0;
        if (won) Sound.win(); else Sound.lose();
        setStats((st) => {
          const streak = won ? st.streak + 1 : 0;
          return {
            ...st, played: st.played + 1, wins: st.wins + (won ? 1 : 0), points: st.points + (won ? next.roundPoints : 0),
            bestRound: won ? Math.max(st.bestRound, next.roundPoints) : st.bestRound, streak, bestStreak: Math.max(st.bestStreak, streak),
          };
        });
        later(() => setOverOpen(true), dur(0.5) * 1000 + 200);
        return;
      }
      default:
        void prev;
    }
  }

  // ── Your moves (sent to the server, which checks them) ─────────────────────
  const s = display;
  const me = s && !s.spectator ? s.players[0] : null;
  const myTurn = !!(s && me && s.phase === 'TURN' && s.current === 0);
  const canAct = myTurn && !animating && !sent && conn === 'open';

  function humanPlay(cardId) {
    Sound.unlock();
    const st = displayRef.current;
    if (!canAct || pickerRef.current || swapRef.current || !st) return;
    const card = st.players[0].hand.find((c) => c.id === cardId);
    if (!card) return;
    if (!isPlayable(card, st, st.players[0].hand) || (st.drawnCardId && st.drawnCardId !== cardId)) {
      Sound.error();
      setShake({ id: cardId, k: performance.now() });
      return;
    }
    if (isWild(card)) { setSelected(cardId); setPicker({ cardId }); return; }
    if (st.rules.sevenZero && card.type === 'number' && card.value === 7 && st.players[0].hand.length > 1) { setSelected(cardId); setSwapPick({ cardId }); return; }
    lastTryRef.current = cardId;
    if (send({ type: 'play', cardId })) setSent(true);
  }
  function chooseColor(color) {
    const p = pickerRef.current;
    if (!p) return;
    pickerRef.current = null;
    setPicker(null);
    lastTryRef.current = p.cardId;
    if (send({ type: 'play', cardId: p.cardId, color })) setSent(true);
  }
  function chooseSwap(d) {
    const p = swapRef.current;
    const st = displayRef.current;
    if (!p || !st || d < 1 || d >= st.players.length) return;
    swapRef.current = null;
    setSwapPick(null);
    lastTryRef.current = p.cardId;
    if (send({ type: 'play', cardId: p.cardId, target: st.toS(d) })) setSent(true);
  }
  function humanDraw() {
    Sound.unlock();
    if (!canAct || pickerRef.current || swapRef.current) return;
    if (send({ type: 'draw' })) setSent(true);
  }
  function humanPass() { if (canAct && s.hasDrawn && send({ type: 'pass' })) { setSelected(null); setSent(true); } }
  function humanCallUno() { Sound.unlock(); send({ type: 'uno' }); }
  function humanCatch(d) {
    const st = displayRef.current;
    if (!st) return;
    const target = d ?? st.players.findIndex((p, i) => i > 0 && p.uno === 'exposed');
    if (target > 0) send({ type: 'catch', target: st.toS(target) });
  }

  // ── Profile photo ─────────────────────────────────────────────────────────
  async function pickPhoto() {
    Sound.unlock();
    const file = await chooseFile();
    if (!file) return;
    try { setCrop(await loadPicture(file)); } catch { setHomeErr('That file isn’t a picture that can be used. Try a JPEG or PNG.'); toast('That file isn’t a picture that can be used', 'red'); }
  }
  function usePhoto(url) {
    setCrop(null);
    setPhoto(url);
    saveSharedPhoto(url);
    send({ type: 'profile', avatar: url });
  }
  function removePhoto() { setPhoto(''); saveSharedPhoto(''); send({ type: 'profile', avatar: '' }); }
  const seatPhotos = useMemo(() => {
    const m = {};
    (room?.seats || []).forEach((x) => { if (x.avatar) m[x.id] = x.avatar; });
    return m;
  }, [room]);
  /** Photo for a player at the table: yours straight from this device, everyone else's from the seat list. */
  const photoOf = (p, d) => (d === 0 && s && !s.spectator ? photo : seatPhotos[p.id] || '');

  // ── Rooms ─────────────────────────────────────────────────────────────────
  const nameOk = () => {
    const nm = profile.name.trim();
    if (!nm) { setHomeErr('Pick a nickname first, so classmates know who you are.'); return null; }
    return nm;
  };
  function createRoom() {
    Sound.unlock();
    const nm = nameOk(); if (!nm) return;
    send({ type: 'name', name: nm });
    send({ type: 'create', settings: { stacking: settings.stacking, speed: settings.speed, private: true } });
  }
  function quickPlay() {
    Sound.unlock();
    const nm = nameOk(); if (!nm) return;
    send({ type: 'name', name: nm });
    send({ type: 'quick', settings: { stacking: settings.stacking, speed: settings.speed } });
  }
  function joinRoom(codeArg) {
    Sound.unlock();
    const nm = nameOk(); if (!nm) return;
    const code = codeFromInput(typeof codeArg === 'string' ? codeArg : joinCode);
    if (!code) { setHomeErr('That doesn’t look like a room code. It’s the 5 letters and numbers at the end of the room link.'); return; }
    wantRoomRef.current = code;
    send({ type: 'name', name: nm });
    send({ type: 'join', room: code, name: nm });
  }
  function practice() {
    Sound.unlock();
    const nm = profile.name.trim();
    if (nm) send({ type: 'name', name: nm });
    send({ type: 'solo', bots: settings.difficulties.slice(0, settings.opponents), settings: { stacking: settings.stacking, speed: settings.speed } });
  }
  function leaveRoom() { setModal(null); send({ type: 'leave' }); }
  const roomLink = room ? `${location.origin}/unofficial/room/${room.id}` : '';
  function copyLink() {
    const done = () => toast('Link copied');
    try { navigator.clipboard.writeText(roomLink).then(done, () => toast('Select the link and copy it')); } catch { toast('Select the link and copy it'); }
  }
  // The open-rooms list refreshes while you're on the home screen.
  const onHome = !room && homeTab === 'class' && conn === 'open';
  useEffect(() => {
    if (!onHome) return undefined;
    send({ type: 'rooms' });
    const id = setInterval(() => send({ type: 'rooms' }), 4000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onHome]);
  useEffect(() => {
    const onPop = () => { if (!roomFromPath() && roomRef.current) send({ type: 'leave' }); };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Keyboard ──────────────────────────────────────────────────────────────
  function onKey(e) {
    Sound.unlock();
    const k = e.key.toLowerCase();
    if (cropRef.current) { if (k === 'escape') setCrop(null); return; }
    if (pickerRef.current) {
      const map = { r: 'red', y: 'yellow', g: 'green', b: 'blue', 1: 'red', 2: 'yellow', 3: 'green', 4: 'blue' };
      if (map[k]) { e.preventDefault(); chooseColor(map[k]); } else if (k === 'escape') { setPicker(null); setSelected(null); }
      return;
    }
    if (swapRef.current) {
      if (/^[1-7]$/.test(k)) { e.preventDefault(); chooseSwap(Number(k)); } else if (k === 'escape') { setSwapPick(null); setSelected(null); }
      return;
    }
    if (modal) { if (k === 'escape') setModal(null); return; }
    if (k === 'm') { setSettings((x) => ({ ...x, sound: !x.sound })); return; }
    const st = displayRef.current;
    if (!room || !st || st.spectator) return;
    if (st.phase === 'GAME_OVER') {
      if ((k === 'enter' || k === ' ') && room.host) { e.preventDefault(); send({ type: 'start' }); }
      else if (k === 'escape') setOverOpen(false);
      return;
    }
    const hand = st.players[0].hand;
    if (k === ' ') { e.preventDefault(); if (st.hasDrawn && st.pendingDraw === 0) humanPass(); else humanDraw(); return; }
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
  api.current = { onMessage, onKey };
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
  const screen = !room ? 'home' : (room.status === 'waiting' || !s || s.spectator) ? 'lobby' : 'table';
  const flyingIds = useMemo(() => new Set(flights.map((f) => f.card.id)), [flights]);
  const incoming = useMemo(() => {
    const out = {};
    flights.forEach((f) => { if (f.toSeat) out[f.toSeat] = (out[f.toSeat] || 0) + 1; });
    return out;
  }, [flights]);
  const playableIds = useMemo(() => {
    if (!myTurn || !me) return new Set();
    return new Set(me.hand.filter((c) => isPlayable(c, s, me.hand) && (!s.drawnCardId || s.drawnCardId === c.id)).map((c) => c.id));
  }, [s, me, myTurn]);
  const visibleDiscard = s ? s.discard.filter((e) => !flyingIds.has(e.card.id)) : [];
  const shownColor = visibleDiscard.length ? visibleDiscard[visibleDiscard.length - 1].color : s?.currentColor;
  const exposedOpps = s ? s.players.map((p, i) => (i > 0 && p.uno === 'exposed' ? i : -1)).filter((i) => i > 0) : [];
  const canDraw = canAct && !picker && !(s.hasDrawn && s.pendingDraw === 0);
  const mustDraw = myTurn && playableIds.size === 0 && !s.hasDrawn;
  const inGameRoom = screen === 'table';

  let unoMode = 'idle';
  if (me) {
    if (me.uno === 'called' || me.armed) unoMode = 'called';
    else if (me.uno === 'grace') unoMode = 'grace';
    else if (myTurn && me.hand.length === 2 && playableIds.size > 0) unoMode = 'ready';
  }

  let banner = { text: '', tone: 'muted' };
  if (s && inGameRoom) {
    const p = s.players[s.current];
    if (s.phase === 'DEAL') banner = { text: 'Dealing', tone: 'muted', dots: true };
    else if (s.phase === 'GAME_OVER') banner = { text: s.winner === 0 ? 'You win the hand!' : `${s.players[s.winner].name} wins the hand`, tone: s.winner === 0 ? 'win' : 'ink' };
    else if (s.current === 0) {
      if (s.pendingDraw > 0) banner = { text: playableIds.size ? `Stack it, or take +${s.pendingDraw}` : `Tap the deck to take +${s.pendingDraw}`, tone: 'alert', clock: true };
      else if (s.hasDrawn) banner = { text: playableIds.size ? 'Play the drawn card — or keep it' : 'No luck — passing', tone: 'you' };
      else if (!playableIds.size) banner = { text: 'Nothing fits — tap the deck', tone: 'you', clock: true };
      else banner = { text: 'Your turn', tone: 'you', clock: true };
    } else if (s.pendingDraw > 0) banner = { text: `${p.name} faces +${s.pendingDraw}`, tone: 'alert', clock: p.isHuman };
    else banner = { text: `${p.name} is ${p.isHuman && !p.online ? 'away — a bot will play' : 'thinking'}`, tone: 'muted', dots: true, clock: p.isHuman };
  }

  // Opponents sit clockwise from your left: up the left side, across the top, down the right.
  const seatOrder = (() => {
    const opp = s ? s.players.slice(1).map((_, i) => i + 1) : [];
    const k = opp.length;
    if (!sizes.wide) return { rows: k > 4 ? [opp.slice(0, Math.ceil(k / 2)), opp.slice(Math.ceil(k / 2))] : [opp] };
    const side = k <= 1 ? 0 : k <= 5 ? 1 : 2;
    return { left: opp.slice(0, side).reverse(), top: opp.slice(side, k - side), right: opp.slice(k - side) };
  })();

  const renderSeat = (d) => {
    if (d === undefined || !s) return null;
    const p = s.players[d];
    return (
      <Seat key={d} player={p} index={p.seat % SEAT_TONES.length} count={Math.max(0, p.count - (incoming[d] || 0))}
        active={s.current === d && ['TURN', 'TRANSITION'].includes(s.phase)}
        thinking={s.current === d && s.phase === 'TURN' && flights.length === 0}
        compact={!sizes.wide} tight={!sizes.wide && s.players.length > 5} photo={photoOf(p, d)} cardW={sizes.opp} bubble={bubbles[d]} onCatch={() => humanCatch(d)} fanRef={seatRef(d)} />
    );
  };

  const pileH = Math.round(sizes.pile * 1.4);
  const wellD = Math.round(pileH * 1.3);
  const drawLeft = s?.drawPile.length || 0;
  const deckLayers = clamp(Math.ceil(drawLeft / 20), drawLeft ? 1 : 0, 4);
  const bannerStyle = {
    you: { background: INK, color: CREAM },
    alert: { background: PALETTE.red.base, color: CREAM },
    win: { background: PALETTE.green.base, color: CREAM },
    ink: { background: INK, color: CREAM },
    muted: { background: 'rgba(251,247,239,0.75)', color: INK, boxShadow: '0 0 0 1px rgba(38,32,24,0.08)' },
  }[banner.tone];
  const handCards = me?.hand ?? [];
  const showKeys = sizes.wide && !sizes.coarse && myTurn;
  const myScore = me ? me.score : 0;

  const center = s && (
    <div className="flex flex-col items-center" style={{ gap: sizes.wide ? 14 : 8 }}>
      <div className="flex h-9 items-center justify-center" role="status" aria-live="polite">
        {banner.text && (
          <motion.div key={banner.text} initial={{ opacity: 0, y: 5, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.14 }}
            className={`flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-bold ${banner.tone === 'you' ? 'uo-pulse' : ''}`}
            style={{ ...bannerStyle, '--uo-pulse': 'rgba(38,39,43,0.3)' }}>
            {banner.tone === 'you' && shownColor && <span className="h-2.5 w-2.5 rounded-full" style={{ background: PALETTE[shownColor].base, boxShadow: `0 0 0 2px ${CREAM}` }} />}
            {banner.text}
            {banner.clock && <Countdown deadline={s.turnDeadline} under={s.current === 0 ? 12 : 10} />}
            {banner.dots && <ThinkingDots />}
          </motion.div>
        )}
      </div>

      <div className="flex items-center" style={{ gap: sizes.wide ? 36 : 18 }}>
        {/* Draw deck */}
        <div className="flex flex-col items-center gap-2">
          <motion.button
            ref={deckRef} type="button" data-deck="1" onClick={humanDraw} disabled={!canDraw}
            aria-label={s.pendingDraw > 0 && myTurn ? `Take +${s.pendingDraw} (Space)` : 'Draw a card (Space)'}
            className={`relative ${canDraw && (mustDraw || s.pendingDraw > 0) ? 'uo-pulse' : ''}`}
            style={{ width: sizes.pile, height: pileH, borderRadius: cardRadius(sizes.pile), cursor: canDraw ? 'pointer' : 'default', '--uo-pulse': 'rgba(195,51,58,0.45)' }}
            whileHover={canDraw ? { y: -4 } : undefined} whileTap={canDraw ? { scale: 0.96 } : undefined}
            transition={{ type: 'spring', stiffness: 600, damping: 30 }}
          >
            {deckLayers === 0 && <div className="absolute inset-0 border-2 border-dashed" style={{ borderRadius: cardRadius(sizes.pile), borderColor: 'rgba(38,39,43,0.2)' }} />}
            {Array.from({ length: deckLayers }, (_, i) => {
              const dd = deckLayers - 1 - i;
              return (
                <div key={i} className="absolute inset-0" style={{ transform: `translate(${dd * 1.6}px, ${dd * 1.6}px)`, borderRadius: cardRadius(sizes.pile), boxShadow: SHADOW_REST }}>
                  <CardBack w={sizes.pile} />
                </div>
              );
            })}
          </motion.button>
          <span className="text-[11px] font-semibold tabular-nums" style={{ color: 'rgba(38,39,43,0.55)' }}>{drawLeft} left</span>
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

  const home = (
    <div className="mx-auto flex min-h-full max-w-[980px] flex-col items-center justify-center gap-8 px-5 py-8 md:flex-row md:gap-14">
      <div className="flex flex-col items-center text-center md:items-start md:text-left">
        <SampleFan w={sizes.wide ? 92 : 70} />
        <h1 className="mt-4 font-black italic leading-none" style={{ fontSize: sizes.wide ? 56 : 42, letterSpacing: '-0.045em' }}>
          Un<span style={{ color: PALETTE.red.base }}>Official</span>
        </h1>
        <p className="mt-3 max-w-[340px] text-[15px] leading-snug" style={{ color: 'rgba(38,39,43,0.68)' }}>
          Match the colour, number or symbol. Empty your hand first, and shout <b>UNOFFICIAL!</b> when you’re down to one, or draw two.
          Play with classmates, bots, or both.
        </p>
        <div className="mt-5 flex gap-5 text-sm">
          <div><b className="text-lg tabular-nums">{stats.wins}</b> <span style={{ color: 'rgba(38,39,43,0.55)' }}>wins</span></div>
          <div><b className="text-lg tabular-nums">{stats.played}</b> <span style={{ color: 'rgba(38,39,43,0.55)' }}>played</span></div>
          <div><b className="text-lg tabular-nums">{winRate(stats)}</b> <span style={{ color: 'rgba(38,39,43,0.55)' }}>win rate</span></div>
        </div>
      </div>
      <Panel className="max-w-[460px]">
        <div className="mb-4 flex items-center gap-3">
          <button type="button" onClick={pickPhoto} aria-label={photo ? 'Change your photo' : 'Add a photo'} className="relative shrink-0 rounded-full">
            <Avatar index={0} name={profile.name.trim() || '?'} size={56} src={photo} />
            <span className="absolute -bottom-0.5 -right-0.5 grid h-6 w-6 place-items-center rounded-full" style={{ background: INK, color: CREAM, boxShadow: `0 0 0 2px ${CREAM}` }}><Camera size={13} /></span>
          </button>
          <div className="min-w-0">
            <div className="flex flex-wrap gap-2">
              <GhostButton onClick={pickPhoto}>{photo ? 'Change photo' : 'Add a photo'}</GhostButton>
              {photo && <GhostButton onClick={removePhoto}>Remove</GhostButton>}
            </div>
            <div className="mt-1.5 text-xs" style={{ color: 'rgba(38,39,43,0.55)' }}>Only people in your room see it. It’s kept on this device and used in PoorDown too.</div>
          </div>
        </div>
        <label htmlFor="uo-nick" className="text-sm font-bold">Your nickname</label>
        <div className="mt-2"><TextInput id="uo-nick" label="Your nickname" value={profile.name} placeholder="e.g. Sam"
          onChange={(v) => { setProfile((p) => ({ ...p, name: v.slice(0, 18) })); setHomeErr(''); }} /></div>
        <div className="mt-5"><Segmented id="home-tab" value={homeTab} onChange={(v) => { setHomeTab(v); setHomeErr(''); }}
          options={[{ value: 'class', label: 'With classmates', icon: Users }, { value: 'practice', label: 'Practice', icon: Bot }]} /></div>
        {homeTab === 'class' ? (
          <div className="mt-5 flex flex-col gap-4">
            <div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <PrimaryButton className="flex-1" onClick={quickPlay}>Play now</PrimaryButton>
                <GhostButton onClick={createRoom}>Create a private room</GhostButton>
              </div>
              <div className="mt-2 text-xs" style={{ color: 'rgba(38,39,43,0.55)' }}>
                Play now puts you in an open room, or opens one for others to join. A private room is only reachable by its link or code. Either way, the host sets the seats and house rules and fills empty seats with bots.
              </div>
            </div>
            <div className="h-px" style={{ background: 'rgba(38,39,43,0.1)' }} />
            <div>
              <label htmlFor="uo-code" className="text-sm font-bold">Join a classmate</label>
              <div className="text-xs" style={{ color: 'rgba(38,39,43,0.55)' }}>Type their room code, or paste the link.</div>
              <div className="mt-3 flex gap-2">
                <TextInput id="uo-code" label="Room code" value={joinCode} placeholder="Room code" maxLength={200} onEnter={joinRoom}
                  onChange={(v) => { setJoinCode(v); setHomeErr(''); }} />
                <GhostButton onClick={joinRoom}>Join</GhostButton>
              </div>
            </div>
            <div className="h-px" style={{ background: 'rgba(38,39,43,0.1)' }} />
            <div>
              <div className="flex items-center justify-between">
                <div className="text-sm font-bold">Open rooms</div>
                <IconButton label="Refresh open rooms" onClick={() => send({ type: 'rooms' })}><RefreshCw size={16} /></IconButton>
              </div>
              {!openRooms || !openRooms.length ? (
                <div className="mt-1 text-xs" style={{ color: 'rgba(38,39,43,0.55)' }}>{openRooms ? 'No open rooms right now. Press Play now to open one.' : 'Looking for rooms…'}</div>
              ) : (
                <div className="mt-1 flex max-h-[220px] flex-col gap-1.5 overflow-y-auto">
                  {openRooms.map((r) => (
                    <div key={r.id} className="flex items-center justify-between gap-2 rounded-xl px-3 py-1.5" style={{ background: 'rgba(38,39,43,0.045)' }}>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">{r.host ? `${r.host}’s room` : `Room ${r.id}`}</div>
                        <div className="text-xs tabular-nums" style={{ color: 'rgba(38,39,43,0.55)' }}>
                          {r.players}/{r.max} seats{r.bots ? ` · ${r.bots} bot${r.bots === 1 ? '' : 's'}` : ''} · {r.status === 'waiting' ? 'Waiting' : 'Playing'}
                        </div>
                      </div>
                      <GhostButton onClick={() => { setJoinCode(r.id); joinRoom(r.id); }}>{r.status === 'waiting' && r.players < r.max ? 'Join' : 'Watch'}</GhostButton>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="mt-5">
            <SetupPanel scope="practice" settings={settings} onChange={setSettings} />
            <PrimaryButton className="mt-6 w-full" onClick={practice}>Deal cards</PrimaryButton>
          </div>
        )}
        {homeErr && <p role="alert" className="mt-3 text-sm font-semibold" style={{ color: PALETTE.red.base }}>{homeErr}</p>}
        {conn !== 'open' && <p className="mt-3 flex items-center gap-2 text-xs font-semibold" style={{ color: 'rgba(38,39,43,0.55)' }}>Connecting to the game server <ThinkingDots /></p>}
      </Panel>
    </div>
  );

  return (
    <div className="relative w-full select-none overflow-hidden" onPointerDown={() => Sound.unlock()}
      data-uo-state={/* for automated checks: is the page animating, waiting on the server, connected */ `anim:${animating ? 1 : 0} sent:${sent ? 1 : 0} q:${queueRef.current.length} fl:${flights.length} conn:${conn}`}
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
          {room && sizes.wide && (
            <div className="absolute left-1/2 -translate-x-1/2 text-xs font-semibold" style={{ color: 'rgba(38,39,43,0.5)' }}>
              Room {room.id} · Hand {room.hands + (room.status === 'over' ? 0 : 1)} · You {myScore} pts · {room.settings.stacking ? 'Stacking on' : 'No stacking'} · {SPEEDS[room.settings.speed]?.label}
            </div>
          )}
          <div className="flex items-center">
            {conn !== 'open' && <span className="mr-1 flex items-center gap-1.5 text-xs font-semibold" style={{ color: PALETTE.red.base }}><WifiOff size={15} />{sizes.wide ? 'Reconnecting' : ''}</span>}
            <IconButton label="Statistics" onClick={() => setModal('stats')}><BarChart3 size={19} /></IconButton>
            <IconButton label="Settings" onClick={() => setModal('settings')}><Settings2 size={19} /></IconButton>
            <IconButton label={settings.sound ? 'Mute (M)' : 'Unmute (M)'} onClick={() => setSettings((x) => ({ ...x, sound: !x.sound }))}>
              {settings.sound ? <Volume2 size={19} /> : <VolumeX size={19} />}
            </IconButton>
            {room && <IconButton label="Leave room" onClick={() => (inGameRoom && room.status === 'playing' ? setModal('leave') : leaveRoom())}><LogOut size={18} /></IconButton>}
          </div>
        </header>

        {screen === 'home' && <div className="min-h-0 flex-1 overflow-y-auto">{home}</div>}
        {screen === 'lobby' && room && (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <Lobby room={room} onSend={send} onCopy={copyLink} onLeave={leaveRoom} link={roomLink} wide={sizes.wide} photo={photo} onPhoto={pickPhoto} />
          </div>
        )}

        {screen === 'table' && s && (
          <>
            {/* Table */}
            <div className="relative min-h-0 flex-1">
              <div className="absolute inset-x-2 inset-y-1 sm:inset-x-4 sm:inset-y-2"
                style={{ background: MAT, borderRadius: sizes.wide ? 44 : 28, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.45), inset 0 0 0 1px rgba(38,32,24,0.06)' }} />
              {sizes.wide ? (
                <div className="relative grid h-full" style={{ gridTemplateColumns: 'minmax(0,1fr) auto minmax(0,1fr)', gridTemplateRows: 'auto minmax(0,1fr)' }}>
                  <div className="col-span-3 col-start-1 row-start-1 flex justify-center gap-10 pt-6">{seatOrder.top.map(renderSeat)}</div>
                  <div className="col-start-1 row-start-2 flex flex-col items-center justify-center gap-10 px-4 pb-6">{seatOrder.left.map(renderSeat)}</div>
                  <div className="col-start-2 row-start-2 flex items-center justify-center px-2 pb-4">{center}</div>
                  <div className="col-start-3 row-start-2 flex flex-col items-center justify-center gap-10 px-4 pb-6">{seatOrder.right.map(renderSeat)}</div>
                </div>
              ) : (
                <div className="relative flex h-full flex-col">
                  {seatOrder.rows.map((row, ri) => <div key={ri} className="flex shrink-0 justify-around gap-1 px-3 pt-3">{row.map(renderSeat)}</div>)}
                  <div className="flex min-h-0 flex-1 items-center justify-center pb-10 pt-2">{center}</div>
                </div>
              )}
              {/* Toasts */}
              <div className={`pointer-events-none absolute bottom-3 z-20 flex flex-col gap-1.5 ${sizes.wide ? 'bottom-6 left-8 items-start' : 'inset-x-0 items-center'}`}>
                <AnimatePresence initial={false}>
                  {toasts.map((t) => (
                    <motion.div key={t.id} layout initial={{ opacity: 0, y: 8, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
                      transition={{ duration: 0.16 }} className="rounded-full px-3 py-1 text-xs font-bold"
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
                {s.rules.unoPenalty !== 0 && <UnoButton mode={unoMode} onClick={humanCallUno} deadline={s.graceDeadline} compact={!sizes.wide} />}
              </div>
              {exposedOpps.map((d) => (
                <PrimaryButton key={d} tone={PALETTE.yellow.shade} onClick={() => humanCatch(d)} kbd={sizes.wide ? 'C' : null}>
                  <Siren size={17} /> Catch {s.players[d].name}
                </PrimaryButton>
              ))}
              {myTurn && s.hasDrawn && playableIds.size > 0 && <GhostButton onClick={humanPass} kbd={sizes.wide ? 'Space' : null}>Keep card</GhostButton>}
              {myTurn && s.pendingDraw > 0 && playableIds.size > 0 && (
                <GhostButton onClick={humanDraw} kbd={sizes.wide ? 'Space' : null}>Take +{s.pendingDraw}</GhostButton>
              )}
              {s.phase === 'GAME_OVER' && !overOpen && (room.host
                ? <PrimaryButton onClick={() => send({ type: 'start' })} kbd={sizes.wide ? '↵' : null}>Deal next hand</PrimaryButton>
                : <span className="flex items-center gap-2 text-sm font-semibold">Waiting for {room.hostName || 'the host'} to deal <ThinkingDots /></span>)}
              {sizes.wide && !sizes.coarse && (
                <div className="absolute right-5 top-1/2 hidden -translate-y-1/2 text-[11px] font-medium lg:block" style={{ color: 'rgba(38,39,43,0.45)' }}>
                  <b>Space</b> draw · <b>1–9</b> pick · <b>↵</b> play · <b>U</b> call · <b>C</b> catch · <b>M</b> mute
                </div>
              )}
            </div>

            {/* Your hand */}
            <div className="relative z-10 shrink-0 pb-[max(8px,env(safe-area-inset-bottom))]">
              <div ref={handRef} className="relative mx-auto" style={{ width: sizes.handWidth, height: layout.height }}>
                {handCards.map((c, i) => {
                  const slot = layout.slots[i];
                  if (!slot) return null;
                  const playable = playableIds.has(c.id);
                  const isSel = selected === c.id;
                  const lift = isSel ? LIFT_SELECTED : playable && canAct ? LIFT_PLAYABLE : 0;
                  const shaking = shake?.id === c.id;
                  const r = cardRadius(sizes.hand);
                  return (
                    <motion.button
                      key={c.id} type="button" data-card={c.id} data-playable={playable && canAct ? '1' : '0'}
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

      {/* Wild colour picker */}
      <AnimatePresence>
        {picker && (
          <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: 'rgba(32,29,24,0.3)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.14 }}
            onPointerDown={(e) => { if (e.target === e.currentTarget) { setPicker(null); setSelected(null); } }}>
            <motion.div role="dialog" aria-label="Choose a color" className="rounded-3xl p-4 sm:p-5"
              style={{ background: CREAM, boxShadow: '0 30px 60px -20px rgba(30,25,18,0.5)' }}
              initial={{ scale: 0.9, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0 }} transition={{ type: 'spring', stiffness: 600, damping: 34 }}>
              <div className="mb-3 text-center text-sm font-bold">Choose a colour</div>
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

      {/* Profile photo cropper */}
      <AnimatePresence>
        {crop && <PhotoCropper key="crop" src={crop} onUse={usePhoto} onCancel={() => setCrop(null)} onOther={async () => { const f = await chooseFile(); if (f) { try { setCrop(await loadPicture(f)); } catch { toast('That file isn’t a picture that can be used', 'red'); } } }} />}
      </AnimatePresence>

      {/* Toasts away from the table */}
      {screen !== 'table' && (
        <div className="pointer-events-none fixed inset-x-0 bottom-5 z-[55] flex flex-col items-center gap-1.5">
          <AnimatePresence initial={false}>
            {toasts.map((t) => (
              <motion.div key={t.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}
                className="rounded-full px-3.5 py-1.5 text-sm font-bold" style={{ background: t.tone === 'red' ? PALETTE.red.base : INK, color: CREAM, boxShadow: SHADOW_SMALL }}>
                {t.text}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Sevens & zeros: who to swap hands with */}
      <AnimatePresence>
        {swapPick && s && (
          <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: 'rgba(32,29,24,0.3)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.14 }}
            onPointerDown={(e) => { if (e.target === e.currentTarget) { setSwapPick(null); setSelected(null); } }}>
            <motion.div role="dialog" aria-label="Swap hands with" className="w-full max-w-[340px] rounded-3xl p-4 sm:p-5"
              style={{ background: CREAM, boxShadow: '0 30px 60px -20px rgba(30,25,18,0.5)' }}
              initial={{ scale: 0.9, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0 }} transition={{ type: 'spring', stiffness: 600, damping: 34 }}>
              <div className="mb-1 flex items-center gap-2 text-sm font-bold"><ArrowRightLeft size={16} /> Swap hands with…</div>
              <div className="mb-3 text-xs" style={{ color: 'rgba(38,39,43,0.55)' }}>You’ll have {Math.max(0, (me?.hand.length || 1) - 1)} cards after playing the 7.</div>
              <div className="flex flex-col gap-1.5">
                {s.players.slice(1).map((p, i) => (
                  <motion.button key={p.seat} type="button" whileTap={{ scale: 0.98 }} onClick={() => chooseSwap(i + 1)}
                    className="flex min-h-[48px] items-center justify-between rounded-2xl px-3 text-left" style={{ background: 'rgba(38,39,43,0.06)' }}>
                    <span className="flex items-center gap-2.5"><Avatar index={p.seat % SEAT_TONES.length} name={p.name} size={26} src={photoOf(p, i + 1)} /><span className="text-sm font-semibold">{p.name}</span></span>
                    <span className="flex items-center gap-2 text-sm tabular-nums"><b>{p.count}</b> card{p.count === 1 ? '' : 's'}{sizes.wide && <kbd className="rounded-md px-1.5 text-[11px]" style={{ background: 'rgba(38,39,43,0.08)' }}>{i + 1}</kbd>}</span>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hand result */}
      <Modal open={overOpen && screen === 'table' && s?.phase === 'GAME_OVER'} onClose={() => setOverOpen(false)} label="Hand result" width={480}>
        {s && s.phase === 'GAME_OVER' && (
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
                    <Avatar index={p.seat % SEAT_TONES.length} name={p.name} size={26} src={photoOf(p, i)} />
                    <span className="text-sm font-semibold">{p.name}</span>
                    {p.bot && <span className="text-xs" style={{ color: 'rgba(38,39,43,0.5)' }}>bot</span>}
                    {i === s.winner && <Trophy size={14} style={{ color: PALETTE.green.base }} />}
                  </div>
                  <div className="flex items-center gap-4 text-sm tabular-nums">
                    <span style={{ color: 'rgba(38,39,43,0.6)' }}>{p.hand.length} left · {handPoints(p.hand)} pts</span>
                    <span className="w-14 text-right font-bold">{p.score || 0}</span>
                  </div>
                </div>
              ))}
              <div className="text-right text-[11px] font-medium" style={{ color: 'rgba(38,39,43,0.45)' }}>Room total over {room?.hands || 1} hand{room?.hands === 1 ? '' : 's'}</div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <StatTile label="Your wins" value={stats.wins} />
              <StatTile label="Hands played" value={stats.played} />
              <StatTile label="Win rate" value={winRate(stats)} accent={PALETTE.green.base} />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              {room?.host
                ? <PrimaryButton className="flex-1" onClick={() => send({ type: 'start' })} kbd={sizes.wide ? '↵' : null}>Deal again</PrimaryButton>
                : <div className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-full text-sm font-semibold" style={{ background: 'rgba(38,39,43,0.06)' }}>Waiting for {room?.hostName || 'the host'} <ThinkingDots /></div>}
              <GhostButton onClick={leaveRoom}>Leave room</GhostButton>
            </div>
          </div>
        )}
      </Modal>

      {/* Leave mid-hand */}
      <Modal open={modal === 'leave'} onClose={() => setModal(null)} label="Leave the room" width={420}>
        <div className="pr-10 text-xl font-black italic tracking-tight">Leave this room?</div>
        <p className="mt-2 text-sm" style={{ color: 'rgba(38,39,43,0.65)' }}>A bot finishes this hand in your seat. You can come back with the room link.</p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <PrimaryButton className="flex-1" tone={PALETTE.red.base} onClick={leaveRoom}>Leave room</PrimaryButton>
          <GhostButton onClick={() => setModal(null)}>Stay</GhostButton>
        </div>
      </Modal>

      {/* Settings */}
      <Modal open={modal === 'settings'} onClose={() => setModal(null)} label="Settings">
        <div className="mb-5 pr-10">
          <div className="text-xl font-black italic tracking-tight">Settings</div>
          <div className="text-sm" style={{ color: 'rgba(38,39,43,0.6)' }}>
            {room ? (room.host ? 'You’re the host. Speed and the turn clock apply now; other rules from the next hand.' : 'The host sets this room’s house rules.') : 'Defaults for new rooms and practice games.'}
          </div>
        </div>
        <div className="flex flex-col gap-5">
          {room ? (
            <RulesPanel scope="modal" settings={room.settings} editable={room.host} seated={room.seats.length} onChange={(patch) => send({ type: 'setting', settings: patch })} />
          ) : <SetupPanel scope="modal" settings={settings} onChange={setSettings} />}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Avatar index={0} name={profile.name.trim() || '?'} size={40} src={photo} />
              <div>
                <div className="text-sm font-bold">Your photo</div>
                <div className="text-xs" style={{ color: 'rgba(38,39,43,0.55)' }}>Shown on your seat to people in your room</div>
              </div>
            </div>
            <div className="flex gap-2">
              <GhostButton onClick={pickPhoto}>{photo ? 'Change' : 'Add a photo'}</GhostButton>
              {photo && <GhostButton onClick={removePhoto}>Remove</GhostButton>}
            </div>
          </div>
          {room && (
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-bold">Sound</div>
                <div className="text-xs" style={{ color: 'rgba(38,39,43,0.55)' }}>Only on this device</div>
              </div>
              <Toggle label="Sound" checked={settings.sound} onChange={(v) => setSettings((x) => ({ ...x, sound: v }))} />
            </div>
          )}
        </div>
        <div className="mt-6 flex justify-end"><GhostButton onClick={() => setModal(null)}>Done</GhostButton></div>
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
