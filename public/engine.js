/* Boomtown rules engine. Pure JavaScript, no dependencies; runs in the browser and in Node. */
(function (root) {
  'use strict';

  // ---------------------------------------------------------------- board data
  const GROUPS = {
    wa: { name: 'Wales', color: '#B8754F', house: 40 },
    dv: { name: 'Devon', color: '#5EC2E6', house: 40 },
    lc: { name: 'Lancashire', color: '#E35DA6', house: 80 },
    md: { name: 'The Midlands', color: '#F28B3A', house: 80 },
    yk: { name: 'Yorkshire', color: '#E5484D', house: 120 },
    sc: { name: 'Scotland', color: '#E9C246', house: 120 },
    li: { name: 'Lincolnshire', color: '#2EB673', house: 160 },
    ln: { name: 'London', color: '#4C6FFF', house: 160 },
  };

  const P = (name, group, price, rent) => ({ type: 'prop', name, group, price, rent: rent.map((value, level) => Math.round(value * [1, 1, 0.9, 0.85, 0.75, 0.65][level] / 5) * 5) });
  const BOARD = [
    { type: 'start', name: 'Start' },
    P('Swansea', 'wa', 60, [2, 10, 30, 90, 160, 250]),
    { type: 'chest', name: 'Treasure' },
    P('Cardiff', 'wa', 60, [4, 20, 60, 180, 320, 450]),
    { type: 'tax', name: 'Income Tax', amount: 200 },
    { type: 'airport', name: 'Heathrow Airport', price: 200 },
    P('Torquay', 'dv', 100, [6, 30, 90, 270, 400, 550]),
    { type: 'chance', name: 'Surprise' },
    P('Plymouth', 'dv', 100, [6, 30, 90, 270, 400, 550]),
    P('Exeter', 'dv', 120, [8, 40, 100, 300, 450, 600]),
    { type: 'jail', name: 'Prison' },
    P('Preston', 'lc', 140, [10, 50, 150, 450, 625, 750]),
    { type: 'utility', name: 'Power Grid', price: 150 },
    P('Liverpool', 'lc', 140, [10, 50, 150, 450, 625, 750]),
    P('Manchester', 'lc', 160, [12, 60, 180, 500, 700, 900]),
    { type: 'airport', name: 'Gatwick Airport', price: 200 },
    P('Coventry', 'md', 180, [14, 70, 200, 550, 750, 950]),
    { type: 'chest', name: 'Treasure' },
    P('Nottingham', 'md', 180, [14, 70, 200, 550, 750, 950]),
    P('Birmingham', 'md', 200, [16, 80, 220, 600, 800, 1000]),
    { type: 'vacation', name: 'Free Parking' },
    P('Bradford', 'yk', 220, [18, 90, 250, 700, 875, 1050]),
    { type: 'chance', name: 'Surprise' },
    P('Doncaster', 'yk', 220, [18, 90, 250, 700, 875, 1050]),
    P('York', 'yk', 240, [20, 100, 300, 750, 925, 1100]),
    { type: 'airport', name: 'Stansted Airport', price: 200 },
    P('Dundee', 'sc', 260, [22, 110, 330, 800, 975, 1150]),
    P('Glasgow', 'sc', 260, [22, 110, 330, 800, 975, 1150]),
    { type: 'utility', name: 'Water Works', price: 150 },
    P('Edinburgh', 'sc', 280, [24, 120, 360, 850, 1025, 1200]),
    { type: 'gotojail', name: 'Go to Prison' },
    P('Hibaldstow', 'li', 300, [26, 130, 390, 900, 1100, 1275]),
    P('Brigg', 'li', 300, [26, 130, 390, 900, 1100, 1275]),
    { type: 'chest', name: 'Treasure' },
    P('Scunthorpe', 'li', 320, [28, 150, 450, 1000, 1200, 1400]),
    { type: 'airport', name: 'Humberside Airport', price: 200 },
    { type: 'chance', name: 'Surprise' },
    P('Westminster', 'ln', 350, [35, 175, 500, 1100, 1300, 1500]),
    { type: 'tax', name: 'Luxury Tax', amount: 100 },
    P('City of London', 'ln', 400, [50, 200, 600, 1400, 1700, 2000]),
  ];

  const BUYABLE = (t) => t.type === 'prop' || t.type === 'airport' || t.type === 'utility';
  const GROUP_TILES = {};
  BOARD.forEach((t, i) => { if (t.group) (GROUP_TILES[t.group] = GROUP_TILES[t.group] || []).push(i); });
  const AIRPORTS = BOARD.map((t, i) => (t.type === 'airport' ? i : -1)).filter((i) => i >= 0);
  const UTILITIES = BOARD.map((t, i) => (t.type === 'utility' ? i : -1)).filter((i) => i >= 0);

  const CHANCE = [
    { text: 'Advance to Start and collect your salary.', a: 'moveTo', to: 0 },
    { text: 'Take the train to York. Collect your salary if you pass Start.', a: 'moveTo', to: 24 },
    { text: 'Advance to the City of London.', a: 'moveTo', to: 39 },
    { text: 'Take a detour to Manchester. Collect your salary if you pass Start.', a: 'moveTo', to: 14 },
    { text: 'Head to Heathrow Airport. Collect your salary if you pass Start.', a: 'moveTo', to: 5 },
    { text: 'Advance to the nearest airport. If it is owned, pay the owner double rent.', a: 'nearest', kind: 'airport' },
    { text: 'Advance to the nearest airport. If it is owned, pay the owner double rent.', a: 'nearest', kind: 'airport' },
    { text: 'Advance to the nearest utility. If it is owned, pay ten times your dice roll.', a: 'nearest', kind: 'utility' },
    { text: 'Go back 3 spaces.', a: 'back', n: 3 },
    { text: 'Go directly to Prison. Do not pass Start.', a: 'jail' },
    { text: 'Pardon: get out of Prison free. Keep this card until you need it.', a: 'pardon' },
    { text: 'The bank pays you a dividend of £50.', a: 'gain', n: 50 },
    { text: 'Your building loan matures. Collect £150.', a: 'gain', n: 150 },
    { text: 'Speeding fine. Pay £15.', a: 'pay', n: 15 },
    { text: 'Renovation time. Pay £25 for each house and £100 for each hotel.', a: 'repairs', house: 25, hotel: 100 },
    { text: 'You were elected board chair. Pay each player £50.', a: 'payEach', n: 50 },
  ];
  const CHEST = [
    { text: 'Advance to Start and collect your salary.', a: 'moveTo', to: 0 },
    { text: 'Bank error in your favour. Collect £200.', a: 'gain', n: 200 },
    { text: "Doctor's fee. Pay £50.", a: 'pay', n: 50 },
    { text: 'You sold some shares. Collect £50.', a: 'gain', n: 50 },
    { text: 'Pardon: get out of Prison free. Keep this card until you need it.', a: 'pardon' },
    { text: 'Go directly to Prison. Do not pass Start.', a: 'jail' },
    { text: 'Your holiday fund matures. Collect £100.', a: 'gain', n: 100 },
    { text: 'Tax refund. Collect £20.', a: 'gain', n: 20 },
    { text: "It's your birthday. Collect £10 from every player.", a: 'collectEach', n: 10 },
    { text: 'You host a launch party. Collect £25 from every player.', a: 'collectEach', n: 25 },
    { text: 'Hospital fees. Pay £100.', a: 'pay', n: 100 },
    { text: 'School fees. Pay £50.', a: 'pay', n: 50 },
    { text: 'Consulting fee. Collect £25.', a: 'gain', n: 25 },
    { text: 'Street repairs. Pay £40 for each house and £115 for each hotel.', a: 'repairs', house: 40, hotel: 115 },
    { text: 'Second prize in a design contest. Collect £10.', a: 'gain', n: 10 },
    { text: 'You inherit £100.', a: 'gain', n: 100 },
  ];
  const DECKS = { chance: CHANCE, chest: CHEST };
  const PARDON_INDEX = { chance: CHANCE.findIndex((c) => c.a === 'pardon'), chest: CHEST.findIndex((c) => c.a === 'pardon') };

  const DEFAULT_SETTINGS = {
    startingCash: 1500,
    salary: 200,
    doubleOnStart: false,
    doubleRentSet: true,
    vacationCash: true,
    auctions: true,
    noRentInPrison: false,
    mortgages: true,
    evenBuild: true,
    limitedBuildings: true,
    roundLimit: 0,
    rollTimer: 60,
    turnTimer: 120,
    randomOrder: true,
    bail: 50,
    botSpeed: 'normal',
  };

  const fmt = (n) => '£' + Math.round(n).toLocaleString('en-GB');

  function shuffle(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  const range = (n) => Array.from({ length: n }, (_, i) => i);

  // ---------------------------------------------------------------- game
  class Game {
    constructor(state, rng) {
      this.s = state;
      this.rng = rng || Math.random;
      this.fns = [];
    }

    static create(seats, settings, rng) {
      rng = rng || Math.random;
      settings = Object.assign({}, DEFAULT_SETTINGS, settings || {});
      let players = seats.map((seat, i) => ({
        id: i, name: seat.name, color: seat.color, bot: !!seat.bot,
        money: settings.startingCash, pos: 0, jail: false, jailTurns: 0,
        pardons: [], bankrupt: false, outSeq: 0, outRound: null,
      }));
      if (settings.randomOrder) players = shuffle(players, rng);
      const props = {};
      BOARD.forEach((t, i) => { if (BUYABLE(t)) props[i] = { owner: null, houses: 0, mortgaged: false }; });
      const s = {
        v: 1, settings, players, props,
        bank: { houses: 32, hotels: 12 },
        decks: { chance: shuffle(range(CHANCE.length), rng), chest: shuffle(range(CHEST.length), rng) },
        turn: { idx: 0, phase: 'roll', dice: null, doubles: 0, again: false, n: 1 },
        pending: null, debt: null, auction: null, bankruptcyAuctionQueue: [],
        trades: [], tradeSeq: 1,
        round: 1, pot: 0, log: [], history: [],
        over: false, winner: null, endReason: null, card: null, bankruptSeq: 0, memo: {},
      };
      const g = new Game(s, rng);
      s.history.push(g.snapshotWorth());
      g.log(['Game started. ', { p: players[0].id }, ' goes first.']);
      return g;
    }

    // ---- plumbing
    on(fn) { this.fns.push(fn); return () => { this.fns = this.fns.filter((f) => f !== fn); }; }
    emit(ev) { for (const f of this.fns) f(ev); }
    log(parts) {
      this.s.log.push({ r: this.s.round, parts });
      if (this.s.log.length > 500) this.s.log.splice(0, this.s.log.length - 500);
      this.emit({ type: 'log' });
    }
    die() { return 1 + Math.floor(this.rng() * 6); }
    get cur() { return this.s.players[this.s.turn.idx]; }
    get st() { return this.s.settings; }
    player(id) { return this.s.players.find((p) => p.id === id); }
    alive() { return this.s.players.filter((p) => !p.bankrupt); }
    setPhase(ph) { this.s.turn.phase = ph; this.emit({ type: 'phase', phase: ph }); }

    // ---- queries
    ownedBy(pid) { return Object.keys(this.s.props).map(Number).filter((i) => this.s.props[i].owner === pid); }
    ownsSet(pid, group) { return pid != null && GROUP_TILES[group].every((i) => this.s.props[i].owner === pid); }
    groupHasBuildings(group) { return GROUP_TILES[group].some((i) => this.s.props[i].houses > 0); }
    houseCost(idx) { const t = BOARD[idx]; return t.group ? GROUPS[t.group].house : 0; }
    mortgageValue(idx) { return Math.floor(BOARD[idx].price / 2); }
    unmortgageCost(idx) { return Math.ceil((BOARD[idx].price / 2) * 1.1); }
    sellValue(idx) { return Math.floor(BOARD[idx].price / 2); }

    netWorth(pid) {
      const p = this.player(pid);
      if (!p || p.bankrupt) return 0;
      let w = p.money;
      for (const i of this.ownedBy(pid)) {
        const pr = this.s.props[i];
        w += pr.mortgaged ? BOARD[i].price / 2 : BOARD[i].price;
        w += pr.houses * this.houseCost(i);
      }
      return Math.round(w);
    }
    snapshotWorth() {
      const w = {};
      for (const p of this.s.players) w[p.id] = this.netWorth(p.id);
      return { r: this.s.round, w };
    }
    standings() {
      const alive = this.alive().sort((a, b) => this.netWorth(b.id) - this.netWorth(a.id));
      const out = this.s.players.filter((p) => p.bankrupt).sort((a, b) => b.outSeq - a.outSeq);
      return alive.concat(out);
    }

    rentFor(idx, special, diceTotal) {
      const t = BOARD[idx], pr = this.s.props[idx];
      if (!pr || pr.owner == null) return 0;
      const owner = pr.owner;
      if (t.type === 'prop') {
        if (pr.houses > 0) return t.rent[pr.houses];
        let r = t.rent[0];
        if (this.st.doubleRentSet && this.ownsSet(owner, t.group)) r *= 2;
        return r;
      }
      if (t.type === 'airport') {
        const n = AIRPORTS.filter((i) => this.s.props[i].owner === owner).length;
        let r = 25 * Math.pow(2, n - 1);
        if (special && special.mul) r *= special.mul;
        return r;
      }
      if (t.type === 'utility') {
        const n = UTILITIES.filter((i) => this.s.props[i].owner === owner).length;
        const d = diceTotal || (this.s.turn.dice ? this.s.turn.dice[0] + this.s.turn.dice[1] : 7);
        const mult = special && special.util ? 10 : n >= 2 ? 10 : 4;
        return d * mult;
      }
      return 0;
    }

    // ---- money
    gain(p, amount) {
      if (amount <= 0) return;
      p.money += amount;
      this.emit({ type: 'money', pid: p.id, delta: amount });
    }
    transfer(p, amount, to, potable) {
      p.money -= amount;
      this.emit({ type: 'money', pid: p.id, delta: -amount });
      if (to === 'each') {
        const others = this.alive().filter((o) => o.id !== p.id);
        const each = others.length ? Math.floor(amount / others.length) : 0;
        others.forEach((o) => this.gain(o, each));
        return;
      }
      if (to != null) {
        const o = this.player(to);
        if (o && !o.bankrupt) { this.gain(o, amount); return; }
      }
      if (potable && this.st.vacationCash) this.s.pot += amount;
    }
    // Returns true when paid immediately. Otherwise the player enters the debt phase.
    charge(p, amount, to, potable, cont) {
      if (amount <= 0) return true;
      if (p.money >= amount) { this.transfer(p, amount, to, potable); return true; }
      this.s.debt = { pid: p.id, amount, to, potable: !!potable, cont: cont || null };
      this.log([{ p: p.id }, ' owes ', { m: amount }, ' and needs to raise cash.']);
      this.setPhase('debt');
      return false;
    }
    payDebt() {
      const d = this.s.debt;
      if (!d) return false;
      const p = this.player(d.pid);
      if (p.money < d.amount) return false;
      this.s.debt = null;
      this.transfer(p, d.amount, d.to, d.potable);
      this.log([{ p: p.id }, ' paid off ', { m: d.amount }, '.']);
      if (d.cont && d.cont.type === 'move') this.startMove(p, d.cont.steps);
      else this.finishAction();
      return true;
    }
    // A player who is not on turn has to pay (e.g. a birthday card). Liquidates automatically.
    forcePay(p, amount, toId) {
      if (p.money < amount) Bot.raiseFunds(this, p, amount, true);
      if (p.money >= amount) { this.transfer(p, amount, toId, false); return; }
      const have = p.money;
      if (have > 0) this.transfer(p, have, toId, false);
      this.log([{ p: p.id }, ' could not pay and went bankrupt.']);
      this.s.debt = { pid: p.id, amount: amount - have, to: toId, potable: false, cont: null, forced: true };
      this.declareBankruptcy(p.id, true);
    }

    // ---- turn flow
    roll(forced) {
      const s = this.s, t = s.turn;
      if (s.over || t.phase !== 'roll') return false;
      const p = this.cur;
      const d = forced || [this.die(), this.die()];
      t.dice = d;
      const total = d[0] + d[1], dbl = d[0] === d[1];
      this.emit({ type: 'dice', pid: p.id, dice: d });
      if (p.jail) {
        if (dbl) {
          p.jail = false; p.jailTurns = 0; t.again = false;
          this.log([{ p: p.id }, ` rolled double ${d[0]}s and walked out of Prison.`]);
          this.startMove(p, total);
          return true;
        }
        p.jailTurns++;
        if (p.jailTurns >= 3) {
          p.jail = false; p.jailTurns = 0; t.again = false;
          this.log([{ p: p.id }, ' served three turns and pays ', { m: this.st.bail }, ' bail.']);
          if (this.charge(p, this.st.bail, null, true, { type: 'move', steps: total })) this.startMove(p, total);
          return true;
        }
        this.log([{ p: p.id }, ` rolled ${d[0]} and ${d[1]} and stays in Prison.`]);
        this.setPhase('end');
        return true;
      }
      if (dbl) {
        t.doubles++;
        if (t.doubles >= 3) {
          this.log([{ p: p.id }, ' rolled doubles three times in a row.']);
          this.sendToJail(p);
          this.setPhase('end');
          return true;
        }
        t.again = true;
      } else t.again = false;
      this.startMove(p, total);
      return true;
    }

    // jump: card moves go straight to the destination instead of walking tile by tile.
    startMove(p, steps, special, jump) {
      const from = p.pos;
      const to = (((from + steps) % 40) + 40) % 40;
      this.s.pending = {
        pid: p.id, from, to, steps,
        mode: steps < 0 ? 'back' : 'walk',
        passStart: steps > 0 && from + steps >= 40,
        special: special || null,
        jump: !!jump,
      };
      this.setPhase('moving');
      this.emit(Object.assign({ type: 'move' }, this.s.pending));
    }

    completeMove() {
      const m = this.s.pending;
      if (!m) return false;
      this.s.pending = null;
      const p = this.player(m.pid);
      if (!p || p.bankrupt) return false;
      p.pos = m.to;
      if (m.passStart) {
        let sal = this.st.salary;
        if (m.to === 0 && this.st.doubleOnStart) sal *= 2;
        this.gain(p, sal);
        this.log([{ p: p.id }, m.to === 0 ? ' landed on Start and collected ' : ' passed Start and collected ', { m: sal }, '.']);
      }
      this.resolveTile(p, m.special);
      return true;
    }

    resolveTile(p, special) {
      const s = this.s, tile = BOARD[p.pos];
      switch (tile.type) {
        case 'prop': case 'airport': case 'utility': {
          const pr = s.props[p.pos];
          if (pr.owner == null) { this.setPhase('buy'); return; }
          if (pr.owner === p.id) return this.finishAction();
          if (pr.mortgaged) {
            this.log([{ p: p.id }, ' landed on ', { t: p.pos }, '. It is mortgaged, so no rent is due.']);
            return this.finishAction();
          }
          const owner = this.player(pr.owner);
          if (this.st.noRentInPrison && owner.jail) {
            this.log([{ p: p.id }, ' landed on ', { t: p.pos }, '. ', { p: owner.id }, ' is in Prison and collects nothing.']);
            return this.finishAction();
          }
          const rent = this.rentFor(p.pos, special);
          this.log([{ p: p.id }, ' paid ', { m: rent }, ' rent to ', { p: owner.id }, ' for ', { t: p.pos }, '.']);
          if (this.charge(p, rent, owner.id, false)) this.finishAction();
          return;
        }
        case 'tax':
          this.log([{ p: p.id }, ' paid ', { m: tile.amount }, ' ', tile.name, '.']);
          if (this.charge(p, tile.amount, null, true)) this.finishAction();
          return;
        case 'chance': case 'chest':
          return this.drawCard(p, tile.type);
        case 'gotojail':
          this.sendToJail(p);
          return this.finishAction();
        case 'vacation':
          if (this.st.vacationCash && s.pot > 0) {
            const pot = s.pot; s.pot = 0;
            this.gain(p, pot);
            this.log([{ p: p.id }, ' landed on Free Parking and collected the ', { m: pot }, ' jackpot.']);
          }
          return this.finishAction();
        default:
          return this.finishAction();
      }
    }

    drawCard(p, deck) {
      const s = this.s, arr = s.decks[deck];
      const ci = arr.shift();
      const card = DECKS[deck][ci];
      if (card.a !== 'pardon') arr.push(ci);
      s.card = { deck, ci, pid: p.id, text: card.text, n: (s.card ? s.card.n : 0) + 1 };
      this.emit({ type: 'card', deck, text: card.text, pid: p.id });
      this.log([{ p: p.id }, ' drew ', { c: deck }, ' ', card.text]);
      const others = () => this.alive().filter((o) => o.id !== p.id);
      switch (card.a) {
        case 'moveTo': return this.moveTo(p, card.to);
        case 'nearest': {
          const list = card.kind === 'airport' ? AIRPORTS : UTILITIES;
          let dest = list.find((i) => i > p.pos);
          if (dest == null) dest = list[0];
          return this.moveTo(p, dest, card.kind === 'airport' ? { mul: 2 } : { util: true });
        }
        case 'back': return this.startMove(p, -card.n, null, true);
        case 'jail': this.sendToJail(p); return this.finishAction();
        case 'pardon': p.pardons.push(deck); return this.finishAction();
        case 'gain': this.gain(p, card.n); return this.finishAction();
        case 'pay': if (this.charge(p, card.n, null, true)) this.finishAction(); return;
        case 'repairs': {
          let total = 0;
          for (const i of this.ownedBy(p.id)) {
            const h = s.props[i].houses;
            total += h === 5 ? card.hotel : h * card.house;
          }
          if (total === 0) return this.finishAction();
          if (this.charge(p, total, null, true)) this.finishAction();
          return;
        }
        case 'payEach': {
          const n = others().length;
          if (this.charge(p, card.n * n, 'each', false)) this.finishAction();
          return;
        }
        case 'collectEach': {
          for (const o of others()) this.forcePay(o, card.n, p.id);
          if (!s.over) this.finishAction();
          return;
        }
      }
      this.finishAction();
    }

    moveTo(p, dest, special) {
      let steps = (dest - p.pos + 40) % 40;
      if (steps === 0) steps = 40;
      this.startMove(p, steps, special, true);
    }

    sendToJail(p) {
      p.pos = 10; p.jail = true; p.jailTurns = 0;
      if (this.cur.id === p.id) { this.s.turn.again = false; this.s.turn.doubles = 0; }
      this.emit({ type: 'teleport', pid: p.id, to: 10 });
      this.log([{ p: p.id }, ' was sent to Prison.']);
    }

    payBail() {
      const p = this.cur, t = this.s.turn;
      if (this.s.over || t.phase !== 'roll' || !p.jail || p.money < this.st.bail) return false;
      this.transfer(p, this.st.bail, null, true);
      p.jail = false; p.jailTurns = 0;
      this.log([{ p: p.id }, ' paid ', { m: this.st.bail }, ' bail and is free.']);
      this.setPhase('roll');
      return true;
    }
    usePardon() {
      const p = this.cur, t = this.s.turn;
      if (this.s.over || t.phase !== 'roll' || !p.jail || !p.pardons.length) return false;
      const deck = p.pardons.pop();
      this.s.decks[deck].push(PARDON_INDEX[deck]);
      p.jail = false; p.jailTurns = 0;
      this.log([{ p: p.id }, ' used a Pardon card and is free.']);
      this.setPhase('roll');
      return true;
    }

    finishAction() {
      if (this.s.over) return;
      const p = this.cur, t = this.s.turn;
      if (p.bankrupt) return this.advanceTurn();
      if (t.again && !p.jail) this.setPhase('roll');
      else this.setPhase('end');
    }

    endTurn() {
      if (this.s.over || this.s.turn.phase !== 'end') return false;
      this.advanceTurn();
      return true;
    }

    advanceTurn() {
      const s = this.s, ps = s.players, n = ps.length;
      if (this.alive().length <= 1) return this.endGame('last');
      if (s.bankruptcyAuctionQueue && s.bankruptcyAuctionQueue.length) {
        if (s.bankruptcyAuctionFrom == null) s.bankruptcyAuctionFrom = s.turn.idx;
        const idx = s.bankruptcyAuctionQueue.shift();
        s.auction = { tile: idx, high: 0, bidder: null, seq: 0, bankruptcy: true };
        this.log(['Bankruptcy property ', { t: idx }, ' goes to auction.']);
        this.setPhase('auction');
        this.emit({ type: 'auction', idx });
        return;
      }
      let i = s.turn.idx, wrapped = false;
      for (let k = 0; k < n; k++) {
        i = (i + 1) % n;
        if (i === 0) wrapped = true;
        if (!ps[i].bankrupt) break;
      }
      if (wrapped) {
        if (this.st.roundLimit && s.round >= this.st.roundLimit) return this.endGame('rounds');
        s.round++;
        s.history.push(this.snapshotWorth());
        if (s.history.length > 300) s.history.splice(1, 1);
        this.log([`Round ${s.round} begins.`]);
        this.emit({ type: 'round', round: s.round });
      }
      s.turn = { idx: i, phase: 'roll', dice: null, doubles: 0, again: false, n: s.turn.n + 1 };
      this.emit({ type: 'turn', pid: ps[i].id });
      this.setPhase('roll');
    }

    // ---- buying & auctions
    buy() {
      const t = this.s.turn;
      if (this.s.over || t.phase !== 'buy') return false;
      const p = this.cur, idx = p.pos, tile = BOARD[idx], pr = this.s.props[idx];
      if (!pr || pr.owner != null || p.money < tile.price) return false;
      this.transfer(p, tile.price, null, false);
      pr.owner = p.id;
      this.log([{ p: p.id }, ' bought ', { t: idx }, ' for ', { m: tile.price }, '.']);
      this.emit({ type: 'own', idx, pid: p.id });
      this.finishAction();
      return true;
    }
    decline() {
      const t = this.s.turn;
      if (this.s.over || t.phase !== 'buy') return false;
      const p = this.cur;
      if (this.st.auctions && this.alive().some((o) => o.money > 0)) {
        this.s.auction = { tile: p.pos, high: 0, bidder: null, seq: 0 };
        this.log([{ p: p.id }, ' passed on ', { t: p.pos }, '. It goes to auction.']);
        this.setPhase('auction');
        this.emit({ type: 'auction', idx: p.pos });
      } else {
        this.log([{ p: p.id }, ' passed on ', { t: p.pos }, '.']);
        this.finishAction();
      }
      return true;
    }
    bid(pid, amount) {
      const a = this.s.auction;
      if (!a || this.s.turn.phase !== 'auction') return false;
      const p = this.player(pid);
      amount = Math.floor(amount);
      if (!p || p.bankrupt || a.bidder === pid || amount <= a.high || amount > p.money) return false;
      a.high = amount; a.bidder = pid; a.seq++;
      this.emit({ type: 'bid', pid, amount });
      return true;
    }
    endAuction() {
      const a = this.s.auction;
      if (!a) return false;
      this.s.auction = null;
      if (a.bidder != null) {
        const w = this.player(a.bidder);
        if (w && !w.bankrupt && w.money >= a.high) {
          this.transfer(w, a.high, null, false);
          this.s.props[a.tile].owner = w.id;
          this.log([{ p: w.id }, ' won ', { t: a.tile }, ' at auction for ', { m: a.high }, '.']);
          this.emit({ type: 'own', idx: a.tile, pid: w.id });
        }
      } else {
        this.log(['Nobody bid on ', { t: a.tile }, '. It stays with the bank.']);
      }
      if (a.bankruptcy) {
        if (this.s.bankruptcyAuctionQueue && this.s.bankruptcyAuctionQueue.length) this.advanceTurn();
        else {
          if (this.s.bankruptcyAuctionFrom != null) {
            this.s.turn.idx = this.s.bankruptcyAuctionFrom;
            this.s.bankruptcyAuctionFrom = null;
          }
          this.advanceTurn();
        }
      } else this.finishAction();
      return true;
    }

    // ---- building, selling, mortgages
    canManage(pid) {
      const s = this.s;
      if (s.over) return false;
      const p = this.player(pid);
      if (!p || p.bankrupt) return false;
      return this.cur.id === pid && ['roll', 'end', 'buy', 'debt'].includes(s.turn.phase);
    }
    canBuild(pid, idx, force) {
      const t = BOARD[idx], pr = this.s.props[idx], st = this.st;
      if (!t || t.type !== 'prop') return 'Only cities can have houses.';
      if (pr.owner !== pid) return "You don't own this.";
      if (!force && !this.canManage(pid)) return 'You can build on your own turn.';
      if (!this.ownsSet(pid, t.group)) return `Own all of ${GROUPS[t.group].name} first.`;
      const tiles = GROUP_TILES[t.group];
      if (tiles.some((i) => this.s.props[i].mortgaged)) return 'Pay off the mortgages in this set first.';
      if (pr.houses >= 5) return 'Already has a hotel.';
      if (st.evenBuild && pr.houses > Math.min(...tiles.map((i) => this.s.props[i].houses))) return 'Build evenly: add houses to the rest of the set first.';
      const cost = GROUPS[t.group].house;
      if (this.player(pid).money < cost) return `You need ${fmt(cost)}.`;
      if (st.limitedBuildings) {
        if (pr.houses === 4 && this.s.bank.hotels < 1) return 'The bank has no hotels left.';
        if (pr.houses < 4 && this.s.bank.houses < 1) return 'The bank has no houses left.';
      }
      return '';
    }
    build(pid, idx, force) {
      if (this.canBuild(pid, idx, force)) return false;
      const pr = this.s.props[idx], p = this.player(pid);
      const cost = this.houseCost(idx);
      p.money -= cost;
      this.emit({ type: 'money', pid, delta: -cost });
      if (pr.houses === 4) { this.s.bank.houses += 4; this.s.bank.hotels -= 1; } else this.s.bank.houses -= 1;
      pr.houses++;
      this.log([{ p: pid }, pr.houses === 5 ? ' built a hotel on ' : ' built a house on ', { t: idx }, '.']);
      this.emit({ type: 'build', idx, pid });
      return true;
    }
    canSell(pid, idx, force) {
      const t = BOARD[idx], pr = this.s.props[idx];
      if (!t || t.type !== 'prop' || !pr) return 'Nothing to sell.';
      if (pr.owner !== pid) return "You don't own this.";
      if (!force && !this.canManage(pid)) return 'You can sell on your own turn.';
      if (pr.houses === 0) return 'No buildings to sell.';
      if (this.st.evenBuild && pr.houses < Math.max(...GROUP_TILES[t.group].map((i) => this.s.props[i].houses))) return 'Sell evenly: remove buildings from the rest of the set first.';
      return '';
    }
    sellHouse(pid, idx, force) {
      if (this.canSell(pid, idx, force)) return false;
      const pr = this.s.props[idx], p = this.player(pid), bank = this.s.bank;
      const refund = this.houseCost(idx) / 2;
      let got = refund;
      if (pr.houses === 5) {
        if (!this.st.limitedBuildings || bank.houses >= 4) { pr.houses = 4; bank.hotels++; bank.houses -= 4; }
        else { pr.houses = 0; bank.hotels++; got = refund * 5; }
      } else { pr.houses--; bank.houses++; }
      this.gain(p, got);
      this.log([{ p: pid }, ' sold a building on ', { t: idx }, ' for ', { m: got }, '.']);
      this.emit({ type: 'build', idx, pid });
      return true;
    }
    canMortgage(pid, idx, force) {
      const t = BOARD[idx], pr = this.s.props[idx];
      if (!this.st.mortgages) return 'Mortgages are switched off in this game.';
      if (!pr || pr.owner !== pid) return "You don't own this.";
      if (!force && !this.canManage(pid)) return 'You can mortgage on your own turn.';
      if (pr.mortgaged) return 'Already mortgaged.';
      if (t.group && this.groupHasBuildings(t.group)) return 'Sell the buildings in this set first.';
      return '';
    }
    mortgage(pid, idx, force) {
      if (this.canMortgage(pid, idx, force)) return false;
      this.s.props[idx].mortgaged = true;
      this.gain(this.player(pid), this.mortgageValue(idx));
      this.log([{ p: pid }, ' mortgaged ', { t: idx }, ' for ', { m: this.mortgageValue(idx) }, '.']);
      this.emit({ type: 'build', idx, pid });
      return true;
    }
    canUnmortgage(pid, idx) {
      const pr = this.s.props[idx];
      if (!pr || pr.owner !== pid) return "You don't own this.";
      if (!this.canManage(pid)) return 'You can pay off mortgages on your own turn.';
      if (!pr.mortgaged) return 'Not mortgaged.';
      if (this.player(pid).money < this.unmortgageCost(idx)) return `You need ${fmt(this.unmortgageCost(idx))}.`;
      return '';
    }
    unmortgage(pid, idx) {
      if (this.canUnmortgage(pid, idx)) return false;
      const cost = this.unmortgageCost(idx), p = this.player(pid);
      p.money -= cost;
      this.emit({ type: 'money', pid, delta: -cost });
      this.s.props[idx].mortgaged = false;
      this.log([{ p: pid }, ' paid off the mortgage on ', { t: idx }, ' (', { m: cost }, ').']);
      this.emit({ type: 'build', idx, pid });
      return true;
    }
    canSellProperty(pid, idx, force) {
      const t = BOARD[idx], pr = this.s.props[idx];
      if (!pr || pr.owner !== pid) return "You don't own this.";
      if (!force && !this.canManage(pid)) return 'You can sell on your own turn.';
      if (pr.mortgaged) return 'Pay off the mortgage before selling.';
      if (t.group && this.groupHasBuildings(t.group)) return 'Sell the buildings in this set first.';
      return '';
    }
    sellProperty(pid, idx, force) {
      if (this.canSellProperty(pid, idx, force)) return false;
      const pr = this.s.props[idx], v = this.sellValue(idx);
      pr.owner = null; pr.mortgaged = false; pr.houses = 0;
      this.gain(this.player(pid), v);
      this.log([{ p: pid }, ' sold ', { t: idx }, ' back to the bank for ', { m: v }, '.']);
      this.emit({ type: 'own', idx, pid: null });
      return true;
    }

    // ---- bankruptcy & end of game
    declareBankruptcy(pid, silent) {
      const s = this.s, p = this.player(pid);
      if (!p || p.bankrupt || s.over) return false;
      const d = s.debt && s.debt.pid === pid ? s.debt : null;
      let creditor = d && typeof d.to === 'number' ? this.player(d.to) : null;
      if (creditor && creditor.bankrupt) creditor = null;
      const owned = this.ownedBy(pid);
      for (const i of owned) {
        const pr = s.props[i];
        if (pr.houses > 0) {
          p.money += (pr.houses * this.houseCost(i)) / 2;
          if (pr.houses === 5) s.bank.hotels++; else s.bank.houses += pr.houses;
          pr.houses = 0;
        }
      }
      for (const i of owned) {
        const pr = s.props[i];
        pr.owner = null;
        pr.mortgaged = false;
        pr.houses = 0;
        s.bankruptcyAuctionQueue.push(i);
        this.emit({ type: 'own', idx: i, pid: null });
      }
      if (creditor) {
        if (p.money > 0) this.gain(creditor, p.money);
        creditor.pardons.push(...p.pardons);
      } else {
        for (const deck of p.pardons) s.decks[deck].push(PARDON_INDEX[deck]);
      }
      p.money = 0; p.pardons = []; p.bankrupt = true; p.jail = false;
      p.outSeq = ++s.bankruptSeq; p.outRound = s.round;
      if (d) s.debt = null;
      for (const tr of s.trades) if (tr.status === 'pending' && (tr.from === pid || tr.to === pid)) tr.status = 'cancelled';
      if (s.auction && s.auction.bidder === pid) { s.auction.high = 0; s.auction.bidder = null; }
      if (!silent) this.log([{ p: pid }, ' went bankrupt. Their properties will be auctioned to the remaining players.']);
      else this.log([{ p: pid }, ' was removed. Their properties will be auctioned.']);
      this.emit({ type: 'bankrupt', pid });
      if (this.alive().length <= 1) { this.endGame('last'); return true; }
      if (this.cur.id === pid && s.turn.phase !== 'auction') {
        s.pending = null;
        this.advanceTurn();
      }
      return true;
    }

    endGame(reason) {
      const s = this.s;
      if (s.over) return;
      s.history.push(Object.assign(this.snapshotWorth(), { end: true }));
      s.over = true; s.endReason = reason; s.auction = null; s.pending = null; s.debt = null;
      s.turn.phase = 'over';
      const st = this.standings();
      s.winner = st[0].id;
      this.log([{ p: s.winner }, reason === 'rounds' ? ' wins with the highest net worth after the final round.' : ' is the last tycoon standing and wins!']);
      this.emit({ type: 'over', winner: s.winner, reason });
    }

    // ---- trades
    tradable(pid, idx) {
      const pr = this.s.props[idx], t = BOARD[idx];
      if (!pr || pr.owner !== pid) return false;
      return !(t.group && this.groupHasBuildings(t.group));
    }
    validateTrade(tr) {
      const a = this.player(tr.from), b = this.player(tr.to);
      if (!a || !b || a.bankrupt || b.bankrupt || a.id === b.id) return 'Pick two different players who are still in the game.';
      const chk = (p, side) => {
        if (side.money < 0) return 'Money must be zero or more.';
        if (side.money > p.money) return `${p.name} only has ${fmt(p.money)}.`;
        for (const i of side.props) if (!this.tradable(p.id, i)) return `${BOARD[i].name} can't be traded right now.`;
        if (side.pardons > p.pardons.length) return `${p.name} doesn't have that many Pardon cards.`;
        return '';
      };
      const e = chk(a, tr.give) || chk(b, tr.get);
      if (e) return e;
      const empty = (x) => !x.money && !x.props.length && !x.pardons;
      if (empty(tr.give) && empty(tr.get)) return 'Add something to the trade.';
      return '';
    }
    normSide(x) {
      x = x || {};
      return { money: Math.max(0, Math.floor(+x.money || 0)), props: [...new Set((x.props || []).map(Number))], pardons: Math.max(0, Math.floor(+x.pardons || 0)) };
    }
    proposeTrade(spec) {
      const tr = { from: spec.from, to: spec.to, give: this.normSide(spec.give), get: this.normSide(spec.get) };
      const err = this.validateTrade(tr);
      if (err) return { error: err };
      tr.id = this.s.tradeSeq++;
      tr.status = 'pending';
      tr.round = this.s.round;
      this.s.trades.push(tr);
      if (this.s.trades.length > 40) this.s.trades.splice(0, this.s.trades.length - 40);
      this.log([{ p: tr.from }, ' sent a trade offer to ', { p: tr.to }, '.']);
      this.emit({ type: 'trade', id: tr.id, kind: 'new' });
      return tr;
    }
    findTrade(id) { return this.s.trades.find((t) => t.id === id); }
    acceptTrade(id) {
      const tr = this.findTrade(id);
      if (!tr || tr.status !== 'pending' || this.s.over) return false;
      const err = this.validateTrade(tr);
      if (err) {
        tr.status = 'invalid';
        this.log(['A trade between ', { p: tr.from }, ' and ', { p: tr.to }, ' fell through: ', err]);
        this.emit({ type: 'trade', id, kind: 'invalid' });
        return false;
      }
      const a = this.player(tr.from), b = this.player(tr.to);
      const move = (from, to, side) => {
        if (side.money) { from.money -= side.money; to.money += side.money; this.emit({ type: 'money', pid: from.id, delta: -side.money }); this.emit({ type: 'money', pid: to.id, delta: side.money }); }
        for (const i of side.props) this.s.props[i].owner = to.id;
        for (let k = 0; k < side.pardons; k++) to.pardons.push(from.pardons.pop());
      };
      move(a, b, tr.give);
      move(b, a, tr.get);
      tr.status = 'accepted';
      this.log([{ p: tr.to }, ' accepted a trade from ', { p: tr.from }, '.']);
      this.emit({ type: 'trade', id, kind: 'accepted' });
      return true;
    }
    declineTrade(id) {
      const tr = this.findTrade(id);
      if (!tr || tr.status !== 'pending') return false;
      tr.status = 'declined';
      this.log([{ p: tr.to }, ' declined a trade from ', { p: tr.from }, '.']);
      this.emit({ type: 'trade', id, kind: 'declined' });
      return true;
    }
    cancelTrade(id) {
      const tr = this.findTrade(id);
      if (!tr || tr.status !== 'pending') return false;
      tr.status = 'cancelled';
      this.emit({ type: 'trade', id, kind: 'cancelled' });
      return true;
    }
  }

  // ---------------------------------------------------------------- bots
  const Bot = {
    reserve(g, p) {
      let maxRent = 0;
      for (const k of Object.keys(g.s.props)) {
        const i = +k, pr = g.s.props[i];
        if (pr.owner != null && pr.owner !== p.id && !pr.mortgaged) maxRent = Math.max(maxRent, g.rentFor(i, null, 7));
      }
      return Math.round(Math.min(650, Math.max(100, maxRent * 0.55)));
    },
    unownedCount(g) { return Object.values(g.s.props).filter((pr) => pr.owner == null).length; },
    // How much owning idx (not yet theirs) is worth to pid.
    propValue(g, pid, idx) {
      const t = BOARD[idx], props = g.s.props;
      if (t.type === 'prop') {
        const others = GROUP_TILES[t.group].filter((i) => i !== idx);
        const owners = others.map((i) => props[i].owner);
        const mine = owners.filter((o) => o === pid).length;
        if (mine === others.length) return t.price * 2.3;
        const foreign = owners.filter((o) => o != null && o !== pid);
        if (foreign.length === others.length && new Set(foreign).size === 1) return t.price * 1.7;
        if (mine > 0 && foreign.length === 0) return t.price * 1.35;
        if (foreign.length === 0) return t.price * 1.05;
        return t.price * 0.85;
      }
      const list = t.type === 'airport' ? AIRPORTS : UTILITIES;
      const mine = list.filter((i) => props[i].owner === pid).length;
      return t.price * (t.type === 'airport' ? 1 + 0.25 * mine : mine ? 1.3 : 0.85);
    },
    // How much pid values keeping idx.
    keepValue(g, pid, idx) {
      const t = BOARD[idx], pr = g.s.props[idx];
      let v = pr.mortgaged ? t.price * 0.5 : t.price;
      if (t.type === 'prop') {
        if (g.ownsSet(pid, t.group)) v = t.price * 2.6;
        else if (GROUP_TILES[t.group].some((i) => i !== idx && g.s.props[i].owner === pid)) v *= 1.35;
      } else if (t.type === 'airport') {
        v *= 1 + 0.2 * (AIRPORTS.filter((i) => g.s.props[i].owner === pid).length - 1);
      }
      return v;
    },
    wantsBuy(g, p, idx) {
      const price = BOARD[idx].price;
      if (p.money < price) return false;
      const v = this.propValue(g, p.id, idx);
      if (v >= price * 1.6) return true;
      const res = this.reserve(g, p);
      const early = this.unownedCount(g) > 12;
      return p.money - price >= (early ? 60 : res * 0.6);
    },
    bidLimit(g, p, idx) {
      const keep = Math.min(80, this.reserve(g, p) * 0.3);
      const v = this.propValue(g, p.id, idx) * (0.82 + g.rng() * 0.3);
      return Math.floor(Math.max(0, Math.min(p.money - keep, v)));
    },
    auctionBid(g, p) {
      const a = g.s.auction;
      if (!a || p.bankrupt || a.bidder === p.id) return null;
      const limit = this.bidLimit(g, p, a.tile);
      const inc = a.high < 100 ? 10 : a.high < 400 ? 20 : 50;
      let next = Math.max(10, a.high + inc);
      // Open strongly instead of creeping up £10 at a time.
      if (a.high < limit * 0.45) next = Math.max(next, Math.round((limit * (0.4 + g.rng() * 0.15)) / 10) * 10);
      return next <= limit ? next : null;
    },
    // Headless auction: bots bid in passes until nobody raises.
    runAuction(g) {
      let guard = 200;
      while (g.s.auction && guard--) {
        let raised = false;
        for (const p of shuffle(g.alive().slice(), g.rng)) {
          const b = this.auctionBid(g, p);
          if (b != null && g.bid(p.id, b)) raised = true;
        }
        if (!raised) break;
      }
      g.endAuction();
    },
    raiseFunds(g, p, amount, force) {
      let guard = 80;
      const props = g.s.props;
      while (p.money < amount && guard--) {
        const owned = g.ownedBy(p.id);
        const sellable = owned.filter((i) => !g.canSell(p.id, i, force)).sort((a, b) => props[b].houses - props[a].houses);
        if (sellable.length) { g.sellHouse(p.id, sellable[0], force); continue; }
        const byKeep = (a, b) => this.keepValue(g, p.id, a) - this.keepValue(g, p.id, b);
        const mort = owned.filter((i) => !g.canMortgage(p.id, i, force)).sort(byKeep);
        if (mort.length) { g.mortgage(p.id, mort[0], force); continue; }
        if (!g.st.mortgages) {
          const sell = owned.filter((i) => !g.canSellProperty(p.id, i, force)).sort(byKeep);
          if (sell.length) { g.sellProperty(p.id, sell[0], force); continue; }
        }
        break;
      }
      return p.money >= amount;
    },
    manage(g, p) {
      const res = this.reserve(g, p);
      const props = g.s.props;
      const mortgaged = g.ownedBy(p.id).filter((i) => props[i].mortgaged)
        .sort((a, b) => this.keepValue(g, p.id, b) - this.keepValue(g, p.id, a));
      for (const i of mortgaged) {
        if (p.money - g.unmortgageCost(i) > res + 120) g.unmortgage(p.id, i);
      }
      let guard = 50;
      while (guard--) {
        const opts = g.ownedBy(p.id).filter((i) => !g.canBuild(p.id, i));
        if (!opts.length) break;
        opts.sort((a, b) => props[a].houses - props[b].houses || BOARD[b].price - BOARD[a].price);
        const i = opts[0];
        if (p.money - g.houseCost(i) < res) break;
        g.build(p.id, i);
      }
    },
    jailChoice(g, p) {
      const early = this.unownedCount(g) > 8;
      if (early && p.pardons.length) return g.usePardon();
      if (early && p.money > g.st.bail + this.reserve(g, p)) return g.payBail();
      return g.roll();
    },
    // Strategic value of a player's whole portfolio under an ownership function.
    portfolio(g, pid, ownerOf) {
      let v = 0;
      const props = g.s.props;
      const mortgageCut = (i) => (props[i].mortgaged ? BOARD[i].price * 0.5 : 0);
      for (const grp of Object.keys(GROUP_TILES)) {
        const tiles = GROUP_TILES[grp];
        const mine = tiles.filter((i) => ownerOf(i) === pid);
        if (!mine.length) continue;
        const sum = mine.reduce((a, i) => a + BOARD[i].price, 0);
        if (mine.length === tiles.length) v += sum * 1.6 + GROUPS[grp].house * tiles.length * 2;
        else v += sum * (1 + 0.15 * mine.length);
        for (const i of mine) v -= mortgageCut(i);
      }
      const ap = AIRPORTS.filter((i) => ownerOf(i) === pid);
      v += ap.length * 200 * (1 + 0.25 * (ap.length - 1));
      const ut = UTILITIES.filter((i) => ownerOf(i) === pid);
      v += ut.length * 150 * (ut.length === 2 ? 1.3 : 1);
      for (const i of ap.concat(ut)) v -= mortgageCut(i);
      return v;
    },
    tradeDeltas(g, tr) {
      const now = (i) => g.s.props[i].owner;
      const after = (i) => (tr.get.props.includes(i) ? tr.from : tr.give.props.includes(i) ? tr.to : now(i));
      const cash = tr.give.money - tr.get.money + 55 * (tr.give.pardons - tr.get.pardons);
      const mine = this.portfolio(g, tr.to, after) - this.portfolio(g, tr.to, now) + cash;
      const theirs = this.portfolio(g, tr.from, after) - this.portfolio(g, tr.from, now) - cash;
      return { mine, theirs };
    },
    evaluateTrade(g, tr) {
      const b = g.player(tr.to);
      if (!b || b.bankrupt) return false;
      if (b.money - tr.get.money < 60) return false;
      const { mine, theirs } = this.tradeDeltas(g, tr);
      return mine > 25 && mine >= theirs * 0.75;
    },
    // Extra cash the proposer must add for a bot to accept. Negative: how much more they could ask for.
    fairCash(g, tr) {
      const { mine, theirs } = this.tradeDeltas(g, tr);
      const need = Math.max(26 - mine, (0.75 * theirs - mine) / 1.75);
      return Math.ceil(need / 10) * 10;
    },
    maybeProposeTrade(g, p) {
      if (g.rng() > 0.5) return null;
      const s = g.s, props = s.props;
      if (s.trades.some((t) => t.status === 'pending' && t.from === p.id)) return null;
      s.memo = s.memo || {};
      for (const grp of Object.keys(GROUP_TILES)) {
        const tiles = GROUP_TILES[grp];
        const mine = tiles.filter((i) => props[i].owner === p.id);
        if (mine.length !== tiles.length - 1) continue;
        const missing = tiles.find((i) => props[i].owner !== p.id);
        const ownerId = props[missing].owner;
        if (ownerId == null) continue;
        const o = g.player(ownerId);
        if (!o || o.bankrupt || !g.tradable(ownerId, missing)) continue;
        const key = p.id + ':' + missing;
        if (s.memo[key] != null && s.round - s.memo[key] < 3) continue;
        s.memo[key] = s.round;
        // Try a cash offer, and swaps of each spare property, priced so the other side comes out ahead.
        const spare = g.ownedBy(p.id).filter((i) => g.tradable(p.id, i) && BOARD[i].group !== grp && !(BOARD[i].group && g.ownsSet(p.id, BOARD[i].group)));
        const candidates = [[]].concat(spare.map((i) => [i]));
        const budget = p.money - this.reserve(g, p) * 0.4;
        let best = null;
        for (const giveProps of candidates) {
          const tr = { from: p.id, to: ownerId, give: { money: 0, props: giveProps, pardons: 0 }, get: { money: 0, props: [missing], pardons: 0 } };
          const d = this.tradeDeltas(g, tr);
          let c = Math.max(0, 26 - d.mine, (0.75 * d.theirs - d.mine) / 1.75);
          c = Math.ceil((c * (1 + g.rng() * 0.12)) / 10) * 10;
          const myGain = d.theirs - c;
          if (c > budget || myGain < 60) continue;
          if (!best || myGain > best.gain) best = { gain: myGain, tr: Object.assign(tr, { give: { money: c, props: giveProps, pardons: 0 } }) };
        }
        if (!best) continue;
        const res = g.proposeTrade(best.tr);
        return res && !res.error ? res : null;
      }
      return null;
    },
    // One decision for the bot whose turn it is. Returns true if it acted.
    // opts.force plays for a human seat; opts.autopilot skips building and trade offers.
    act(g, opts) {
      opts = opts || {};
      const s = g.s, p = g.cur, t = s.turn;
      if (s.over || (!p.bot && !opts.force)) return false;
      const auto = !!opts.autopilot;
      switch (t.phase) {
        case 'roll':
          if (p.jail) return this.jailChoice(g, p);
          if (!auto) this.manage(g, p);
          return g.roll();
        case 'buy':
          return this.wantsBuy(g, p, p.pos) ? g.buy() : g.decline();
        case 'debt':
          this.raiseFunds(g, p, s.debt.amount);
          if (p.money >= s.debt.amount) return g.payDebt();
          return g.declareBankruptcy(p.id);
        case 'end':
          if (!auto) { this.manage(g, p); this.maybeProposeTrade(g, p); }
          return g.endTurn();
      }
      return false;
    },
  };

  const api = { Game, Bot, BOARD, GROUPS, GROUP_TILES, AIRPORTS, UTILITIES, CHANCE, CHEST, DEFAULT_SETTINGS, BUYABLE, fmt, shuffle };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Boomtown = api;
})(typeof window !== 'undefined' ? window : globalThis);
