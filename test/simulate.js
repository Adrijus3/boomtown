// Headless stress test: all-bot games with invariant checks.
const { Game, Bot, BOARD, GROUP_TILES } = require('../public/engine.js');

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function check(g, where) {
  const s = g.s;
  const fail = (m) => { throw new Error(`[${where}] round ${s.round}: ${m}`); };
  for (const p of s.players) {
    if (p.money < 0 && !(s.debt && s.debt.pid === p.id)) fail(`${p.name} negative money ${p.money}`);
    if (p.money < 0) fail(`${p.name} negative money during debt ${p.money}`);
    if (p.bankrupt && g.ownedBy(p.id).length) fail(`bankrupt ${p.name} still owns`);
  }
  let houses = 0, hotels = 0;
  for (const k of Object.keys(s.props)) {
    const i = +k, pr = s.props[i], t = BOARD[i];
    if (pr.houses < 0 || pr.houses > 5) fail('bad houses');
    if (pr.houses > 0) {
      if (t.type !== 'prop') fail('houses on non-prop');
      if (!g.ownsSet(pr.owner, t.group)) fail(`houses without set on ${t.name}`);
      if (GROUP_TILES[t.group].some((j) => s.props[j].mortgaged)) fail('houses with mortgaged set');
      if (pr.houses === 5) hotels++; else houses += pr.houses;
    }
    if (pr.owner == null && (pr.houses || pr.mortgaged)) fail('unowned with state');
  }
  if (s.settings.limitedBuildings && !s.over) {
    if (houses + s.bank.houses !== 32) fail(`house count ${houses}+${s.bank.houses}`);
    if (hotels + s.bank.hotels !== 12) fail(`hotel count ${hotels}+${s.bank.hotels}`);
    if (s.bank.houses < 0 || s.bank.hotels < 0) fail('bank negative');
  }
  const okPhase = ['roll', 'moving', 'buy', 'auction', 'end', 'debt', 'over'];
  if (!okPhase.includes(s.turn.phase)) fail('bad phase ' + s.turn.phase);
  if (!s.over && s.players[s.turn.idx].bankrupt) fail('current player is bankrupt');
}

function play(seed, settings, nPlayers) {
  const rng = mulberry32(seed);
  const names = ['Ada', 'Otto', 'Mila', 'Rex', 'Juno', 'Kit', 'Nova', 'Ivo'];
  const seats = names.slice(0, nPlayers).map((n) => ({ name: n, color: '#fff', bot: true }));
  const g = Game.create(seats, settings, rng);
  let steps = 0;
  while (!g.s.over) {
    if (++steps > 400000) throw new Error('too many steps, seed ' + seed);
    const ph = g.s.turn.phase;
    if (ph === 'moving') g.completeMove();
    else if (ph === 'auction') Bot.runAuction(g);
    else {
      for (const tr of g.s.trades) {
        if (tr.status === 'pending') {
          if (Bot.evaluateTrade(g, tr)) g.acceptTrade(tr.id); else g.declineTrade(tr.id);
        }
      }
      if (!Bot.act(g)) throw new Error(`bot stuck in phase ${ph}, seed ${seed}`);
    }
    check(g, 'seed ' + seed);
  }
  return g;
}

const configs = [
  { name: 'classic', settings: { roundLimit: 300 } },
  { name: 'all rules on', settings: { roundLimit: 300, vacationCash: true, noRentInPrison: true, doubleOnStart: true } },
  { name: 'no mortgages / no auctions', settings: { roundLimit: 300, mortgages: false, auctions: false } },
  { name: 'unlimited buildings, no even build', settings: { roundLimit: 300, limitedBuildings: false, evenBuild: false } },
  { name: 'short game 20 rounds', settings: { roundLimit: 20, startingCash: 1000 } },
];

let total = 0;
const t0 = Date.now();
for (const c of configs) {
  const stats = { endReasons: {}, avgRound: 0, medRound: 0, trades: 0, auctions: 0, firstBuild: 0 }; const rs = [];
  for (let seed = 1; seed <= 120; seed++) {
    const n = 2 + (seed % 7);
    const g = play(seed * 7919 + c.name.length, c.settings, n);
    stats.endReasons[g.s.endReason] = (stats.endReasons[g.s.endReason] || 0) + 1;
    stats.avgRound += g.s.round; rs.push(g.s.round); const fb = g.s.log.find((l) => l.parts.some((x) => typeof x === "string" && x.includes("built a"))); stats.firstBuild += fb ? fb.r : 0;
    stats.trades += g.s.trades.filter((t) => t.status === 'accepted').length;
    stats.auctions += g.s.log.filter((l) => l.parts.some((x) => typeof x === 'string' && x.includes('at auction'))).length;
    total++;
  }
  stats.avgRound = Math.round(stats.avgRound / 120); stats.firstBuild = Math.round(stats.firstBuild / 120); rs.sort((a,b)=>a-b); stats.medRound = rs[60];
  console.log(c.name.padEnd(36), JSON.stringify(stats));
}
console.log(`${total} games OK in ${Date.now() - t0} ms`);
