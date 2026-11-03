/**
 * THE JAIL — SBF: TROLLEY PROBLEMS
 * ==================================
 *
 *   new JailTrolleyGame(host, charId, onDone)   (same contract as jail-minigames.js)
 *
 * Side-view chase across three stacked tracks. You're chasing Caroline;
 * a trolley (SBF at the controls, on his laptop) is right behind you and
 * FOLLOWS YOUR PATH. Every fork has something tied to each track, so the
 * track you're on when you pass it is what the trolley runs over. Kills
 * stall the trolley; empty track lets it catch you. Scored in UTILS with
 * EA math: shrimp outweigh people, hypothetical future people outweigh
 * everything, AGI is worth killing, the 51/49 coin flip is always +EV.
 *
 * Catch Caroline and she turns giant, flattens the trolley, and chases
 * you — dodge her stomps until you escape.
 *
 * Controls: tap above / below your runner (or swipe, or arrows/W/S) to
 * switch tracks. Text here is UI labels for the gags, no dialogue.
 */

const TROLLEY_TUNING = {
  runSpeed: 420, carolineSpeed: 330, carolineStart: 2500,
  trolleyStartGap: 240, trolleyClose: 18, trolleyMaxGap: 260, trolleyHitGap: 26,
  stallSpeed: 120, surgeSpeed: 135, hop: 90,
  segFirst: 900, segGap: 1150,
  stunTime: 0.8, trolleyDerail: 1.3, runOverPenalty: 200,
  twistTime: 3.0, escapeTime: 14, stompFirst: 1.3, stompLast: 0.7, stompWarn: 0.85,
  shrimpWeight: 0.0003,
};

// Top track first.
const TROLLEY_SEGMENTS = [
  ['people:1', 'empty', 'people:5'],
  ['people:5', 'people:1', 'shrimp'],
  ['coins', 'people:12', 'future'],
  ['lobster', 'people:2', 'robot'],
  ['people:5', 'coinflip', 'shrimp'],
  ['people:1', 'mugger', 'people:3'],
  ['future', 'shrimp', 'lobster'],
  ['robot', 'people:5', 'people:12'],
  ['people:2', 'future', 'coinflip'],
  ['shrimp', 'people:1', 'coins'],
];

const TROLLEY_SKINS = ['#e8b48a', '#c98e62', '#8d5a3b', '#5e3b26', '#f0c9a0'];
const TROLLEY_SHIRTS = ['#3a6ea8', '#a83a3a', '#3aa86a', '#d6a21f', '#7a4aa8', '#d0d0d0', '#2a2a2a'];

function jtFmt(n) {
  if (!isFinite(n)) return '∞';
  const a = Math.abs(n);
  if (a >= 1e9) {
    const e = Math.floor(Math.log10(a));
    return `${n < 0 ? '-' : ''}${(a / Math.pow(10, e)).toFixed(1)}e${e}`;
  }
  return Math.round(n).toLocaleString('en-US');
}

class JailTrolleyGame {
  constructor(host, charId, onDone) {
    this.host = host;
    this.charId = charId;
    this.onDone = onDone;
    this.char = JAIL_CHARACTERS.find(c => c.id === charId);
    this.canvas = host.canvas;
    this.ctx = host.ctx;
    this.floaters = new JailFloaters();
    this.touchUI = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

    const T = TROLLEY_TUNING;
    this.phase = 'intro';
    this.phaseT = 0;
    this.time = 0;
    this.finished = false;

    this.px = 0;
    this.lane0 = 1;
    this.target = 1;
    this.changes = [];         // { x, from, to } — the path; the trolley replays it
    this.stun = 0;
    this.squash = 0;

    this.tx = -T.trolleyStartGap;  // trolley front x
    this.tv = T.runSpeed + T.trolleyClose;
    this.tStall = 0; this.tSurge = 0; this.tStop = 0;
    this.trolleyAlive = true;
    this.blood = 0;

    this.carD = T.carolineStart;
    this.utils = 0;
    this.picks = 0; this.optimal = 0;
    this.killed = { people: 0, shrimp: 0, lobsters: 0, robots: 0 };
    this.trolleyHits = 0; this.squashes = 0; this.donated = 0;
    this.shake = 0; this.flash = 0; this.flashColor = '224,40,40';

    this.segments = [];
    this.debris = [];
    this.gore = [];
    this.splats = [];
    this.flyCoins = [];
    this.stomps = [];
    this._ensureSegments(4);

    this._bindInput();
    this.last = performance.now();
    this._loop();
  }

  // ------------------------------------------------------------ plumbing

  _fit() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = this.canvas.getBoundingClientRect();
    const W = rect.width || window.innerWidth, H = rect.height || window.innerHeight;
    const cw = Math.round(W * dpr), ch = Math.round(H * dpr);
    if (this.canvas.width !== cw || this.canvas.height !== ch) { this.canvas.width = cw; this.canvas.height = ch; }
    this.rect = rect;
    this.dpr = dpr;
    this.u = Math.min(W / 420, H / 760);
    this.VW = W / this.u;
    this.VH = H / this.u;
    this.groundY = this.VH * 0.84;
    this.screenX = jyLerp(Math.min(this.VW * 0.55, 420), Math.min(this.VW * 0.7, 620), this.camBlend || 0);
  }

  laneY(l) { return this.groundY - 40 - l * 125; }

  _bindInput() {
    const dirAt = (clientY) => {
      const y = (clientY - this.rect.top) / this.u;
      const py = this.laneY(this._laneAt(this.px)) - 60;
      return y < py ? 1 : -1;
    };
    this._touchH = (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) this._press(dirAt(t.clientY));
    };
    this._touchEndH = (e) => e.preventDefault();
    this._ptrH = (e) => { if (e.pointerType === 'touch') return; e.preventDefault(); this._press(dirAt(e.clientY)); };
    this._keyH = (e) => {
      const k = e.key.toLowerCase();
      if (k === 'arrowup' || k === 'w') { e.preventDefault(); this._press(1); }
      else if (k === 'arrowdown' || k === 's') { e.preventDefault(); this._press(-1); }
      else if (k === ' ' || k === 'enter') { e.preventDefault(); this._press(0); }
    };
    this.canvas.addEventListener('touchstart', this._touchH, { passive: false });
    this.canvas.addEventListener('touchend', this._touchEndH, { passive: false });
    this.canvas.addEventListener('pointerdown', this._ptrH);
    window.addEventListener('keydown', this._keyH);
  }

  _press(dir) {
    if (this.finished) return;
    if (this.phase === 'intro') { if (this.phaseT > 0.5) this._setPhase('run'); return; }
    if (this.phase === 'results') { if (this.phaseT > 0.8) this._end(); return; }
    if (this.phase !== 'run' && this.phase !== 'escape') return;
    if (!dir || this.stun > 0) return;
    const to = jailClamp(this.target + dir, 0, 2);
    if (to === this.target) return;
    this.changes.push({ x: this.px, from: this._laneAt(this.px), to });
    this.target = to;
  }

  _setPhase(p) { this.phase = p; this.phaseT = 0; }

  // Continuous lane along the path at world x (player and trolley share it).
  _laneAt(x) {
    let lane = this.lane0;
    for (const c of this.changes) {
      if (x < c.x) break;
      lane = jyLerp(c.from, c.to, Math.min(1, (x - c.x) / TROLLEY_TUNING.hop));
    }
    return lane;
  }

  _loop() {
    if (this.finished) return;
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this._fit();
    this._update(dt);
    this._draw();
    this._af = requestAnimationFrame(() => this._loop());
  }

  // ------------------------------------------------------------ course

  _ensureSegments(ahead) {
    const T = TROLLEY_TUNING;
    while (this.segments.length < 2 || this.segments[this.segments.length - 1].gx < this.px + ahead * T.segGap) {
      const k = this.segments.length;
      const def = TROLLEY_SEGMENTS[k % TROLLEY_SEGMENTS.length];
      const gx = T.segFirst + k * T.segGap;
      const groups = def.map((spec, i) => this._makeGroup(spec, 2 - i, gx, k * 7 + i));
      this.segments.push({ k, gx, groups, chosen: null, resolved: false });
    }
  }

  _makeGroup(spec, lane, gx, seed) {
    const [kind, nStr] = spec.split(':');
    const n = nStr ? +nStr : 0;
    const g = { kind, n, lane, x: gx, w: 40, hit: false, seed, t: 0 };
    if (kind === 'people') {
      g.w = Math.max(30, n * 20);
      g.people = [];
      for (let i = 0; i < n; i++) {
        g.people.push({
          dx: i * 20 + (n > 6 ? (i % 2) * 6 : 0), row: n > 6 ? i % 2 : 0,
          skin: TROLLEY_SKINS[Math.floor(jyHash(seed * 31 + i) * TROLLEY_SKINS.length)],
          shirt: TROLLEY_SHIRTS[Math.floor(jyHash(seed * 17 + i) * TROLLEY_SHIRTS.length)],
          ph: jyHash(seed + i * 3) * 6,
        });
      }
      g.cost = n;
      g.name = n === 1 ? '1 PERSON' : `${n} PEOPLE`;
      g.costLabel = `-${n} UTILS`;
    } else if (kind === 'shrimp') {
      g.w = 130; g.cost = 1e6 * TROLLEY_TUNING.shrimpWeight;
      g.name = '1,000,000 SHRIMP'; g.costLabel = `-${jtFmt(g.cost)} UTILS`;
    } else if (kind === 'future') {
      g.w = 120; g.cost = 1e58;
      g.name = '10^58 FUTURE PEOPLE'; g.costLabel = '-1.0e58 UTILS';
    } else if (kind === 'robot') {
      g.w = 46; g.cost = -1e12;
      g.name = 'AGI'; g.costLabel = '+1.0e12 UTILS';
    } else if (kind === 'lobster') {
      g.w = 70; g.cost = -50;
      g.name = 'BOILING LOBSTERS'; g.costLabel = '+50 UTILS';
    } else if (kind === 'coinflip') {
      g.w = 60; g.cost = null;
      g.name = '51% DOUBLE / 49% ZERO'; g.costLabel = 'EV +2%';
    } else if (kind === 'mugger') {
      g.w = 40; g.cost = -Infinity;
      g.name = "PASCAL'S MUGGER"; g.costLabel = '+∞ UTILS';
    } else if (kind === 'coins') {
      g.w = 220; g.cost = 0;
      g.name = 'CASH'; g.costLabel = '0 UTILS';
      g.coins = Array.from({ length: 7 }, (_, i) => ({ dx: i * 34, got: false }));
    } else {
      g.w = 60; g.cost = 0; g.name = 'EMPTY TRACK'; g.costLabel = '0 UTILS';
    }
    return g;
  }

  // Nominal EA cost for comparing tracks (the coin flip's +2% EV always wins).
  _nominal(g) {
    if (g.kind === 'coinflip') return -0.02 * Math.max(1, Math.abs(this.utils)) - 1e-6;
    return g.cost;
  }

  // ------------------------------------------------------------ update

  _update(dt) {
    const T = TROLLEY_TUNING;
    this.phaseT += dt; this.time += dt;
    const late = this.phase === 'twist' || this.phase === 'escape' || this.phase === 'results';
    this.camBlend = (this.camBlend || 0) + ((late ? 1 : 0) - (this.camBlend || 0)) * Math.min(1, dt * 1.5);
    this.shake = Math.max(0, this.shake - dt * 30);
    this.flash = Math.max(0, this.flash - dt * 2.5);
    this.floaters.update();
    this._updateDebris(dt);
    if (this.phase === 'intro' || this.phase === 'results') return;

    // Player.
    this.stun = Math.max(0, this.stun - dt);
    this.squash = Math.max(0, this.squash - dt);
    let speed = this.stun > 0 ? 0 : T.runSpeed * (this.squash > 0 ? 0.35 : 1);
    if (this.phase === 'twist') speed = this.phaseT < 0.4 ? T.runSpeed * (1 - this.phaseT / 0.4) : 0;
    this.px += speed * dt;
    this._ensureSegments(3);

    if (this.phase === 'run') this._updateRun(dt, speed);
    else if (this.phase === 'twist') this._updateTwist(dt);
    else if (this.phase === 'escape') this._updateEscape(dt);
  }

  _updateRun(dt, speed) {
    const T = TROLLEY_TUNING;
    // Caroline.
    this.carD += (T.carolineSpeed - speed) * dt;
    // Choices lock in as you pass each fork; coins get grabbed.
    this.segments.forEach(seg => {
      if (seg.chosen == null && this.px >= seg.gx) {
        const lane = Math.round(this._laneAt(seg.gx));
        seg.chosen = lane;
        const pick = seg.groups.find(g => g.lane === lane);
        const best = Math.min(...seg.groups.map(g => this._nominal(g)));
        this.picks++;
        if (this._nominal(pick) <= best) this.optimal++;
      }
      seg.groups.forEach(g => {
        if (g.kind !== 'coins') return;
        g.coins.forEach(c => {
          const cx = g.x + c.dx;
          if (!c.got && this.px >= cx && Math.round(this._laneAt(cx)) === g.lane) {
            c.got = true; this.donated += 1000;
            const sx = cx - this._camX(), sy = this.laneY(g.lane) - 40;
            this.flyCoins.push({ x: sx, y: sy, t: 0 });
          }
        });
      });
    });

    // Trolley.
    if (this.tStop > 0) { this.tStop -= dt; this.tv = 0; }
    else {
      this.tStall -= dt; this.tSurge -= dt;
      const gap = this.px - this.tx;
      if (this.tStall > 0) this.tv = T.stallSpeed;
      else if (this.tSurge > 0) this.tv = T.runSpeed + T.surgeSpeed;
      else this.tv = T.runSpeed + T.trolleyClose;
      if (gap > T.trolleyMaxGap && this.tStall <= 0) this.tv = Math.max(this.tv, T.runSpeed * 1.15);
    }
    this.tx += this.tv * dt;
    this.segments.forEach(seg => {
      if (seg.resolved || seg.chosen == null || this.tx < seg.gx) return;
      seg.resolved = true;
      this._trolleyHits(seg, seg.groups.find(g => g.lane === seg.chosen));
    });
    if (this.stun <= 0 && this.px - this.tx < T.trolleyHitGap) this._runOver();

    if (this.carD <= 0) {
      this.carD = 0;
      this.twist = { cx: this.px + 230, lane: this._laneAt(this.px) };
      this._setPhase('twist');
    }
  }

  _trolleyHits(seg, g) {
    const T = TROLLEY_TUNING;
    const others = seg.groups.filter(o => o.cost != null && isFinite(o.cost));
    const worst = Math.max(0, ...others.map(o => o.cost));
    const sx = g.x - this._camX(), y = this.laneY(g.lane);
    g.hit = true; g.t = 0;
    const pop = (text, color, size) => this.floaters.add(jailClamp(sx, 80, this.VW - 80), y - 110, text, color, { size: size || 30, life: 60, vy: -0.6 });
    if (g.kind === 'people') {
      this.killed.people += g.n;
      this.tStall = 0.25 + 0.08 * g.n;
      g.people.forEach(p => this._ragdoll(g.x + p.dx, y - 14 - p.row * 6, p.skin, p.shirt));
      this.blood = Math.min(1, this.blood + 0.08 * g.n);
      this.utils += worst - g.cost;
      pop(`${g.n === 1 ? '1 DEAD' : g.n + ' DEAD'}`, '#ff4a4a');
      this.shake = 6 + g.n;
    } else if (g.kind === 'shrimp') {
      this.killed.shrimp += 1e6;
      this.tStall = 0.6;
      for (let i = 0; i < 60; i++) this.debris.push(this._piece(g.x + Math.random() * g.w, y - 10, 'shrimp', '#ff8a9a', 1.1));
      this.utils += worst - g.cost;
      pop('-1,000,000 SHRIMP', '#ff8a9a');
      this.shake = 8;
    } else if (g.kind === 'future') {
      this.tSurge = 0.6;
      this.debris.push(this._piece(g.x + 20, y - 60, 'sign', '#c8a060', 1.2));
      this.utils += worst - g.cost;
      pop('-1.0e58 UTILS', '#ff4a4a', 34);
      this.flash = 0.8; this.flashColor = '120,60,220';
    } else if (g.kind === 'robot') {
      this.killed.robots++;
      this.tStall = 0.4;
      for (let i = 0; i < 30; i++) this.debris.push(this._piece(g.x + 20, y - 30, 'spark', Math.random() < 0.5 ? '#f4c542' : '#9aa4b0', 1.2));
      this.utils += worst - g.cost;
      pop('AI RISK AVERTED', '#7ec89a');
      this.shake = 9;
    } else if (g.kind === 'lobster') {
      this.killed.lobsters += 6;
      this.tStall = 0.35;
      for (let i = 0; i < 6; i++) this.debris.push(this._piece(g.x + 30, y - 40, 'lobster', '#e0402a', 1.2));
      for (let i = 0; i < 20; i++) this.debris.push(this._piece(g.x + 30, y - 30, 'drop', '#bfe6ff', 1));
      this.utils += worst - g.cost;
      pop('LOBSTERS FREED', '#ff7a5a');
    } else if (g.kind === 'coinflip') {
      this.tStall = 0.3;
      const win = Math.random() < 0.51;
      this.debris.push(this._piece(g.x + 30, y - 40, 'coin', '#f4c542', 1.3));
      if (win) { this.utils = this.utils === 0 ? 1000 : this.utils * 2; pop('DOUBLED', '#f4c542', 40); }
      else { this.utils = 0; pop('ZERO', '#ff4a4a', 48); this.flash = 0.8; this.flashColor = '0,0,0'; }
    } else if (g.kind === 'mugger') {
      this.tSurge = 1.0;
      this.utils = this.utils / 2;
      pop('MUGGED: -50%', '#ff4a4a', 34);
    } else {
      this.tSurge = 0.6;
      pop('TROLLEY SPEEDS UP', '#ffb04a', 24);
    }
    if (this.tSurge > 0) this.tStall = 0;
  }

  _runOver() {
    const T = TROLLEY_TUNING;
    this.trolleyHits++;
    this.stun = T.stunTime;
    this.tStop = T.trolleyDerail;
    this.carD += T.runOverPenalty;
    this.shake = 14; this.flash = 0.9; this.flashColor = '224,40,40';
    const y = this.laneY(this._laneAt(this.px));
    this._blood(this.px, y - 70, 24, 1);
    this.floaters.add(this.screenX, y - 150, 'RUN OVER', '#ff4a4a', { size: 40, life: 60 });
  }

  _updateTwist(dt) {
    const tw = this.twist, t = this.phaseT, T = TROLLEY_TUNING;
    // Trolley keeps coming; she leaps over you and lands on it.
    if (this.trolleyAlive) {
      this.tx = Math.min(this.tx + T.runSpeed * 0.6 * dt, this.px - 90);
      if (t > 2.1) {
        this.trolleyAlive = false;
        this.shake = 22; this.flash = 1; this.flashColor = '255,255,255';
        const y = this.laneY(this._laneAt(this.tx));
        for (let i = 0; i < 40; i++) this.debris.push(this._piece(this.tx - 70, y - 50, 'metal', Math.random() < 0.5 ? '#c8402a' : '#f4c542', 1.6));
        this.debris.push(this._piece(this.tx - 70, y - 80, 'sbf', '#6ab0d8', 1.5));
        this.floaters.add(this.screenX - 60, y - 200, 'CRUNCH', '#f4c542', { size: 54, life: 70 });
      }
    }
    if (t > T.twistTime) {
      this.escape = { t: 0, next: T.stompFirst };
      this._setPhase('escape');
    }
  }

  _updateEscape(dt) {
    const T = TROLLEY_TUNING, e = this.escape;
    e.t += dt;
    e.next -= dt;
    if (e.next <= 0 && e.t < T.escapeTime - 0.8) {
      const prog = e.t / T.escapeTime;
      e.next = jyLerp(T.stompFirst, T.stompLast, prog);
      const here = Math.round(this._laneAt(this.px));
      const lane = Math.random() < 0.6 ? here : jailClamp(here + (Math.random() < 0.5 ? 1 : -1), 0, 2);
      this.stomps.push({ x: this.px + T.runSpeed * T.stompWarn, lane, t: 0, slammed: false });
    }
    this.stomps.forEach(s => {
      s.t += dt;
      if (!s.slammed && s.t >= T.stompWarn) {
        s.slammed = true;
        this.shake = 16;
        const pl = this._laneAt(this.px);
        if (Math.abs(this.px - s.x) < 80 && Math.abs(pl - s.lane) < 0.5 && this.squash <= 0) {
          this.squashes++;
          this.squash = 0.8;
          this.flash = 0.7; this.flashColor = '120,160,60';
          this.floaters.add(this.screenX, this.laneY(s.lane) - 150, 'SQUASHED', '#a8d84a', { size: 42, life: 60 });
        }
        for (let i = 0; i < 14; i++) this.debris.push(this._piece(s.x, this.laneY(s.lane) - 6, 'dust', '#d8c8a0', 0.9));
      }
    });
    this.stomps = this.stomps.filter(s => s.t < T.stompWarn + 0.6);
    if (e.t >= T.escapeTime) this._setPhase('results');
  }

  // ------------------------------------------------------------ debris

  _piece(x, y, kind, color, power) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
    const s = (250 + Math.random() * 450) * power;
    return { x, y, vx: Math.cos(a) * s + 160, vy: Math.sin(a) * s, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 18, kind, color, life: 2.6 };
  }

  _ragdoll(x, y, skin, shirt) {
    this._blood(x, y, 14, 1.1);
    this.debris.push(this._piece(x, y - 16, 'head', skin, 1.3));
    this.debris.push(this._piece(x, y, 'torso', shirt, 1));
    for (let i = 0; i < 4; i++) this.debris.push(this._piece(x, y, 'limb', i < 2 ? skin : '#3a3f4a', 1.15));
  }

  _blood(x, y, n, power) {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.6;
      const s = (120 + Math.random() * 420) * power;
      this.gore.push({ x, y, vx: Math.cos(a) * s + 120, vy: Math.sin(a) * s, r: 2 + Math.random() * 3.5 });
    }
  }

  _updateDebris(dt) {
    const floor = this.groundY + 30;
    this.debris.forEach(d => {
      d.vy += 1400 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.rot += d.vr * dt; d.life -= dt;
      if (d.y > floor && d.vy > 0) { d.y = floor; d.vy *= -0.3; d.vx *= 0.6; d.vr *= 0.6; }
    });
    this.debris = this.debris.filter(d => d.life > 0);
    this.gore.forEach(p => {
      p.vy += 1100 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.y > floor) { p.dead = true; this.splats.push({ x: p.x, y: floor + Math.random() * 10, r: p.r * 1.6 }); }
    });
    this.gore = this.gore.filter(p => !p.dead);
    if (this.splats.length > 500) this.splats.splice(0, this.splats.length - 500);
    this.flyCoins.forEach(c => { c.t += dt; });
    this.flyCoins = this.flyCoins.filter(c => c.t < 0.7);
  }

  // ------------------------------------------------------------ drawing

  _camX() { return this.px - this.screenX; }

  _draw() {
    const ctx = this.ctx, s = this.dpr * this.u;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.save();
    if (this.shake > 0) ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake * 0.6);
    const camX = this._camX();
    this._drawBackdrop(camX);
    this._drawTracks(camX);
    this._drawGroups(camX);
    if (this.phase === 'escape' || (this.phase === 'twist' && this.phaseT > 0.5)) this._drawStompMarks(camX);
    this._drawRunner(camX);
    if (this.trolleyAlive && this.phase !== 'intro') this._drawTrolley(this.tx - camX, this.laneY(this._laneAt(this.tx)));
    this._drawCarolineWorld(camX);
    this._drawDebris(camX);
    ctx.restore();
    this.floaters.draw(ctx);
    if (this.flash > 0) { ctx.fillStyle = `rgba(${this.flashColor},${this.flash * 0.35})`; ctx.fillRect(0, 0, this.VW, this.VH); }
    if (this.phase === 'run') { this._drawLabels(camX); this._drawTrolleyWarning(); }
    this._drawHud();
    if (this.phase === 'intro') this._drawIntro();
    if (this.phase === 'results') this._drawResults();
  }

  _drawBackdrop(camX) {
    const ctx = this.ctx, VW = this.VW, VH = this.VH, g = this.groundY;
    const sky = ctx.createLinearGradient(0, 0, 0, g);
    const night = this.phase === 'escape' || this.phase === 'twist' || this.phase === 'results';
    if (night) { sky.addColorStop(0, '#1a0a1a'); sky.addColorStop(1, '#6a1a2a'); }
    else { sky.addColorStop(0, '#2ab0c8'); sky.addColorStop(0.6, '#8ad8d0'); sky.addColorStop(1, '#ffc89a'); }
    ctx.fillStyle = sky; ctx.fillRect(0, 0, VW, g);
    // Ocean + far penthouse tower.
    const seaY = g - 300;
    ctx.fillStyle = night ? '#1a2a3a' : '#1fa0b8'; ctx.fillRect(0, seaY, VW, 60);
    const towerX = 520 - camX * 0.08;
    ctx.fillStyle = night ? '#2a1a2a' : '#e8e0d0';
    for (let k = -1; k < 3; k++) {
      const tx = ((towerX + k * 900) % (VW + 900) + VW + 900) % (VW + 900) - 300;
      ctx.fillRect(tx, seaY - 120, 70, 120);
      ctx.fillStyle = night ? '#f4c542' : '#7ad0e0';
      for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) ctx.fillRect(tx + 8 + c * 21, seaY - 110 + r * 22, 12, 12);
      ctx.fillStyle = night ? '#2a1a2a' : '#e8e0d0';
    }
    // Sand.
    const sand = ctx.createLinearGradient(0, seaY + 60, 0, VH);
    sand.addColorStop(0, night ? '#5a4a3a' : '#f0d8a0'); sand.addColorStop(1, night ? '#3a2a1a' : '#d8b878');
    ctx.fillStyle = sand; ctx.fillRect(0, seaY + 60, VW, VH - seaY - 60);
    // Palms.
    const po = camX * 0.4;
    for (let k = Math.floor(po / 300) - 1; k < (po + VW) / 300 + 1; k++) {
      const x = k * 300 - po + jyHash(k) * 120, base = seaY + 70;
      const h = 150 + jyHash(k + 4) * 80;
      ctx.strokeStyle = night ? '#2a1a14' : '#7a5a3a'; ctx.lineWidth = 9;
      ctx.beginPath(); ctx.moveTo(x, base); ctx.quadraticCurveTo(x + 30, base - h * 0.5, x + 18, base - h); ctx.stroke();
      ctx.fillStyle = night ? '#14201a' : '#2a8a4a';
      for (let f = 0; f < 6; f++) {
        const a = f / 6 * Math.PI * 2 + Math.sin(this.time + k) * 0.08;
        ctx.save(); ctx.translate(x + 18, base - h); ctx.rotate(a);
        ctx.beginPath(); ctx.ellipse(34, 0, 36, 7, 0.3, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    }
  }

  _drawTracks(camX) {
    const ctx = this.ctx, VW = this.VW;
    // Blood splats on the sand.
    ctx.fillStyle = '#8a0f12';
    this.splats.forEach(s => { const sx = s.x - camX; if (sx > -20 && sx < VW + 20) { ctx.beginPath(); ctx.ellipse(sx, s.y, s.r * 1.6, s.r * 0.5, 0, 0, Math.PI * 2); ctx.fill(); } });
    for (let l = 0; l < 3; l++) {
      const y = this.laneY(l);
      // Trestle posts.
      if (l > 0) {
        ctx.fillStyle = '#6a4a2a';
        for (let x = -((camX * 1) % 140) - 140; x < VW + 140; x += 140) {
          ctx.fillRect(x, y + 6, 8, this.groundY + 30 - y - 6);
          ctx.save(); ctx.strokeStyle = '#5a3a1a'; ctx.lineWidth = 4;
          ctx.beginPath(); ctx.moveTo(x + 4, y + 10); ctx.lineTo(x + 74, y + 70); ctx.stroke(); ctx.restore();
        }
      }
      ctx.fillStyle = '#4a3020';
      for (let x = -(camX % 26) - 26; x < VW + 26; x += 26) ctx.fillRect(x, y - 2, 14, 10);
      ctx.fillStyle = '#9aa0a8'; ctx.fillRect(0, y - 5, VW, 4);
      ctx.fillStyle = '#c8ccd0'; ctx.fillRect(0, y - 5, VW, 1.5);
    }
  }

  _drawGroups(camX) {
    const ctx = this.ctx;
    this.segments.forEach(seg => seg.groups.forEach(g => {
      const sx = g.x - camX;
      if (sx < -260 || sx > this.VW + 60) return;
      const y = this.laneY(g.lane);
      ctx.save(); ctx.translate(sx, y);
      this._drawGroup(g);
      ctx.restore();
    }));
  }

  _drawGroup(g) {
    const ctx = this.ctx, t = this.time;
    if (g.kind === 'people') {
      if (g.hit) { ctx.fillStyle = '#7a0a0e'; ctx.beginPath(); ctx.ellipse(g.w / 2, -3, g.w / 2 + 14, 6, 0, 0, Math.PI * 2); ctx.fill(); return; }
      g.people.forEach(p => {
        ctx.save(); ctx.translate(p.dx, -p.row * 6);
        const flail = Math.sin(t * 14 + p.ph);
        ctx.strokeStyle = p.skin; ctx.lineWidth = 4; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(-4, -22); ctx.lineTo(-10, -36 - flail * 6); ctx.moveTo(4, -22); ctx.lineTo(10, -36 + flail * 6); ctx.stroke();
        ctx.fillStyle = p.shirt; jailRoundRectPath(ctx, -7, -26, 14, 22, 4); ctx.fill();
        ctx.strokeStyle = '#c8a060'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-9, -14); ctx.lineTo(9, -12); ctx.moveTo(-9, -9); ctx.lineTo(9, -7); ctx.stroke();
        ctx.fillStyle = p.skin; ctx.beginPath(); ctx.arc(0, -33, 7, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#1a1010';
        ctx.beginPath(); ctx.arc(-2.5, -35, 1.3, 0, Math.PI * 2); ctx.arc(2.5, -35, 1.3, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(0, -30, 2.2, 3 + Math.abs(flail), 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      });
    } else if (g.kind === 'shrimp') {
      if (g.hit) { ctx.fillStyle = 'rgba(255,138,154,0.6)'; ctx.beginPath(); ctx.ellipse(g.w / 2, -3, g.w / 2 + 10, 5, 0, 0, Math.PI * 2); ctx.fill(); return; }
      for (let i = 0; i < 70; i++) {
        const fx = jyHash(g.seed * 7 + i), fy = jyHash(g.seed * 13 + i);
        const x = fx * g.w, h = Math.sin(fx * Math.PI) * 34;
        const y = -4 - fy * h;
        ctx.strokeStyle = i % 3 ? '#ff8a9a' : '#ff6a7a'; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(x, y + Math.sin(t * 10 + i) * 1.2, 5, 0.2 + i, 3.6 + i); ctx.stroke();
      }
    } else if (g.kind === 'future') {
      ctx.fillStyle = '#7a5a3a'; ctx.fillRect(g.w / 2 - 3, -60, 6, 60);
      if (!g.hit) { ctx.fillStyle = '#e8d8b0'; ctx.fillRect(g.w / 2 - 26, -78, 52, 30); this._t('?', g.w / 2, -63, 24, '#5a3a1a'); }
      // Hypothetical people: ghosts.
      for (let i = 0; i < 6; i++) {
        ctx.globalAlpha = g.hit ? 0.06 : 0.18 + 0.1 * Math.sin(t * 3 + i);
        ctx.fillStyle = '#ffffff';
        const x = 10 + i * 20, bob = Math.sin(t * 2 + i) * 3;
        ctx.beginPath(); ctx.arc(x, -34 + bob, 7, 0, Math.PI * 2); ctx.fill();
        ctx.fillRect(x - 7, -34 + bob, 14, 28);
      }
      ctx.globalAlpha = 1;
    } else if (g.kind === 'robot') {
      if (g.hit) { ctx.fillStyle = '#3a3a3a'; ctx.fillRect(4, -8, 36, 6); return; }
      ctx.fillStyle = '#9aa4b0'; jailRoundRectPath(ctx, 6, -44, 34, 40, 6); ctx.fill();
      ctx.fillStyle = '#5a6470'; ctx.fillRect(10, -38, 26, 14);
      ctx.fillStyle = Math.sin(t * 6) > 0 ? '#ff3a3a' : '#7ec89a';
      ctx.beginPath(); ctx.arc(17, -31, 3, 0, Math.PI * 2); ctx.arc(29, -31, 3, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#5a6470'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(23, -44); ctx.lineTo(23, -56); ctx.stroke();
      ctx.fillStyle = '#f4c542'; ctx.beginPath(); ctx.arc(23, -58, 3.5, 0, Math.PI * 2); ctx.fill();
    } else if (g.kind === 'lobster') {
      if (g.hit) { ctx.save(); ctx.translate(40, -10); ctx.rotate(1.3); ctx.fillStyle = '#222'; ctx.fillRect(-26, -20, 52, 36); ctx.restore(); return; }
      ctx.fillStyle = `rgba(255,${120 + Math.random() * 80},40,0.9)`;
      for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(14 + i * 12, -4); ctx.lineTo(20 + i * 12, -16 - Math.random() * 8); ctx.lineTo(26 + i * 12, -4); ctx.fill(); }
      ctx.fillStyle = '#222'; jailRoundRectPath(ctx, 8, -54, 56, 40, 6); ctx.fill();
      ctx.fillStyle = '#444'; ctx.fillRect(4, -56, 64, 6);
      ctx.fillStyle = '#e0402a';
      for (let i = 0; i < 3; i++) {
        const x = 20 + i * 16, wave = Math.sin(t * 9 + i) * 4;
        ctx.beginPath(); ctx.ellipse(x, -64 + wave, 5, 9, 0.3, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x - 3, -74 + wave, 4, 0, Math.PI * 2); ctx.arc(x + 4, -75 + wave, 4, 0, Math.PI * 2); ctx.fill();
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 3;
      for (let i = 0; i < 3; i++) { const p = (t * 0.8 + i / 3) % 1; ctx.beginPath(); ctx.arc(20 + i * 16, -80 - p * 30, 5 + p * 4, 0, Math.PI * 2); ctx.stroke(); }
    } else if (g.kind === 'coinflip') {
      if (g.hit) return;
      const squish = Math.abs(Math.cos(t * 3));
      ctx.fillStyle = '#d6a21f'; ctx.beginPath(); ctx.ellipse(30, -34, 26 * squish + 3, 28, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f4c542'; ctx.beginPath(); ctx.ellipse(30, -34, 21 * squish + 2, 23, 0, 0, Math.PI * 2); ctx.fill();
      if (squish > 0.5) this._t('51%', 30, -33, 15, '#8a5a10');
    } else if (g.kind === 'mugger') {
      if (g.hit) return;
      ctx.fillStyle = '#5a4030'; ctx.beginPath(); ctx.moveTo(6, -4); ctx.lineTo(34, -4); ctx.lineTo(28, -56); ctx.lineTo(12, -56); ctx.fill();
      ctx.fillStyle = '#d8b090'; ctx.beginPath(); ctx.arc(20, -64, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2a2018'; ctx.fillRect(8, -74, 24, 5); ctx.fillRect(12, -84, 16, 11);
      ctx.fillStyle = '#f2f2f2'; ctx.fillRect(28, -70, 30, 22);
      this._t('∞', 43, -59, 22, '#1a1010');
    } else if (g.kind === 'coins') {
      g.coins.forEach((c, i) => {
        if (c.got) return;
        const bob = Math.sin(t * 5 + i) * 4;
        ctx.fillStyle = '#d6a21f'; ctx.beginPath(); ctx.ellipse(c.dx, -44 + bob, 9 * Math.abs(Math.cos(t * 4 + i)) + 2, 10, 0, 0, Math.PI * 2); ctx.fill();
      });
    }
  }

  _drawLabels(camX) {
    const ctx = this.ctx;
    const seg = this.segments.find(s => s.chosen == null);
    if (!seg) return;
    const dx = seg.gx - this.px;
    if (dx > 2300) return;
    const myLane = Math.round(this._laneAt(this.px));
    seg.groups.forEach(g => {
      const sx = g.x + g.w / 2 - camX;
      const y = this.laneY(g.lane) - 104;
      ctx.font = 'bold 17px VT323, monospace';
      const w = Math.max(ctx.measureText(g.name).width, 70) + 18;
      const x = jailClamp(sx, w / 2 + 6, this.VW - w / 2 - 6);
      const mine = g.lane === myLane;
      ctx.globalAlpha = sx > this.screenX + 30 ? 1 : 0.4;
      ctx.fillStyle = mine ? 'rgba(255,60,60,0.88)' : 'rgba(10,10,20,0.78)';
      jailRoundRectPath(ctx, x - w / 2, y - 22, w, 44, 7); ctx.fill();
      if (mine) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); }
      this._t(g.name, x, y - 9, 17, '#ffffff');
      const good = g.cost == null || g.cost <= 0;
      this._t(g.costLabel, x, y + 10, 15, mine ? '#ffffff' : (good ? '#9af0a8' : '#ff9a8a'));
      if (sx > this.VW) this._t('»', x + w / 2 - 2, y + 26, 18, '#ffffff');
      ctx.globalAlpha = 1;
    });
  }

  _drawTrolleyWarning() {
    const ctx = this.ctx, gap = this.px - this.tx;
    const danger = jailClamp(1 - (gap - 40) / 220, 0, 1);
    if (danger <= 0) return;
    const grad = ctx.createLinearGradient(0, 0, 90, 0);
    grad.addColorStop(0, `rgba(255,30,30,${0.55 * danger * (0.7 + 0.3 * Math.sin(this.time * 14))})`); grad.addColorStop(1, 'rgba(255,30,30,0)');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, 90, this.VH);
  }

  _drawRunner(camX) {
    const lane = this._laneAt(this.px);
    let y = this.laneY(lane);
    // Hop arc mid-switch, and over anything tied to the track.
    const last = this.changes[this.changes.length - 1];
    if (last && this.px - last.x < TROLLEY_TUNING.hop) y -= Math.sin((this.px - last.x) / TROLLEY_TUNING.hop * Math.PI) * 26;
    const seg = this.segments.find(s => Math.abs(s.gx - this.px) < 260);
    if (seg) {
      const g = seg.groups.find(o => o.lane === Math.round(lane));
      if (g && g.kind !== 'empty' && g.kind !== 'coins' && !g.hit) {
        const p = (this.px - (g.x - 50)) / (g.w + 100);
        if (p > 0 && p < 1) y -= Math.sin(p * Math.PI) * 60;
      }
    }
    const ctx = this.ctx, sx = this.px - camX;
    const look = JUNKYARD_LOOKS.player;
    if (this.stun > 0) {
      const q = this.stun / TROLLEY_TUNING.stunTime;
      JailJunkyardGame.prototype._person.call(this, sx + (1 - q) * 30, y - Math.sin(q * Math.PI) * 60, { ...look, rot: (1 - q) * Math.PI * 2 + Math.PI / 2 * (q < 0.2 ? 1 - q / 0.2 : 1) });
      return;
    }
    const run = this.time * 15;
    const moving = this.phase === 'run' || this.phase === 'escape';
    ctx.save();
    if (this.squash > 0) { ctx.translate(sx, y); ctx.scale(1.4, 0.3); ctx.translate(-sx, -y); }
    JailJunkyardGame.prototype._person.call(this, sx, y, {
      ...look, stride: moving ? Math.sin(run) * 18 : 0, rot: moving ? 0.12 : 0,
      armF: moving ? 0.5 + Math.sin(run) * 1.0 : 1.2, armB: moving ? 1.2 - Math.sin(run) * 1.0 : 1.8,
    });
    ctx.restore();
  }

  _drawTrolley(sx, y) {
    const ctx = this.ctx, t = this.time;
    ctx.save(); ctx.translate(sx, y);
    // Body faces right, front edge at x=0.
    ctx.fillStyle = '#2a2a2a';
    [-140, -100, -50, -20].forEach(wx => {
      ctx.beginPath(); ctx.arc(wx, -10, 11, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#888'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(wx, -10); ctx.lineTo(wx + Math.cos(t * 20) * 9, -10 + Math.sin(t * 20) * 9); ctx.stroke();
    });
    ctx.fillStyle = '#c8402a'; jailRoundRectPath(ctx, -165, -100, 165, 82, 12); ctx.fill();
    ctx.fillStyle = '#f4c542'; ctx.fillRect(-165, -48, 165, 9);
    ctx.fillStyle = '#9adaf0';
    for (let i = 0; i < 3; i++) ctx.fillRect(-155 + i * 40, -88, 30, 30);
    ctx.fillStyle = '#bfeaff'; ctx.fillRect(-36, -90, 30, 36);
    // SBF at the controls, laptop glow.
    ctx.fillStyle = '#3a2414';
    for (let i = 0; i < 7; i++) { ctx.beginPath(); ctx.arc(-24 + Math.cos(i) * 8, -78 + Math.sin(i * 1.7) * 4, 6, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#f0c9a0'; ctx.beginPath(); ctx.arc(-21, -70, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(150,220,255,${0.6 + 0.3 * Math.sin(t * 9)})`; ctx.fillRect(-28, -60, 16, 6);
    // Cowcatcher + blood.
    ctx.fillStyle = '#5a5a5a';
    ctx.beginPath(); ctx.moveTo(0, -40); ctx.lineTo(18, -4); ctx.lineTo(0, -4); ctx.fill();
    if (this.blood > 0) {
      ctx.fillStyle = `rgba(150,10,14,${0.4 + 0.5 * this.blood})`;
      ctx.beginPath(); ctx.moveTo(0, -100 + 60 * (1 - this.blood)); ctx.lineTo(4, -4); ctx.lineTo(18, -4); ctx.lineTo(0, -40); ctx.closePath(); ctx.fill();
      for (let i = 0; i < 4; i++) ctx.fillRect(-6 - i * 5, -60 + i * 9, 4, 20 + this.blood * 20);
    }
    ctx.strokeStyle = '#444'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-80, -100); ctx.lineTo(-40, -150); ctx.stroke();
    if (Math.random() < 0.5) { ctx.fillStyle = '#bfeaff'; ctx.beginPath(); ctx.arc(-40, -150, 4 + Math.random() * 4, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
    // Speed streaks behind.
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 4; i++) { const yy = y - 30 - i * 18; ctx.moveTo(sx - 175 - i * 10, yy); ctx.lineTo(sx - 230 - i * 20, yy); }
    ctx.stroke();
  }

  // Where Caroline is drawn during the chase / twist / escape.
  _drawCarolineWorld(camX) {
    const T = TROLLEY_TUNING;
    if (this.phase === 'run' || this.phase === 'intro') {
      const sx = this.screenX + this.carD + 40;
      if (sx < this.VW + 80) this._caroline(sx, this.laneY(1), 1, this.time, { run: true, face: 1 });
      return;
    }
    if (this.phase === 'twist') {
      const tw = this.twist, t = this.phaseT;
      const sx0 = tw.cx - camX;
      if (t < 0.7) { this._caroline(sx0, this.laneY(tw.lane), 1, this.time, { face: t < 0.35 ? 1 : -1, mouth: t / 0.7 }); return; }
      const grow = Math.min(1, (t - 0.7) / 0.9);
      const G = this._giantScale();
      const sc = jyLerp(1, G, grow * grow);
      // Leap over you onto the trolley.
      const leap = jailClamp((t - 1.5) / 0.6, 0, 1);
      const landX = this.tx - 70 - camX;
      const x = jyLerp(sx0, landX, leap);
      const baseY = jyLerp(this.laneY(tw.lane), this.groundY + 40, leap) - Math.sin(leap * Math.PI) * 200;
      this._caroline(x, baseY, sc, this.time, { face: -1, mouth: 1, giant: true });
      return;
    }
    if (this.phase === 'escape' || this.phase === 'results') {
      const G = this._giantScale();
      const bob = Math.abs(Math.sin(this.time * 4)) * 18;
      this._caroline(this.screenX - 200 - 30 * Math.sin(this.time * 0.7), this.groundY + 30 - bob, G, this.time, { face: 1, mouth: 0.6 + 0.4 * Math.sin(this.time * 6), giant: true, run: true });
    }
  }

  _giantScale() { return Math.min(3, this.VH * 0.72 / 230) * (1 + Math.min(0.2, this.donated / 50000)); }

  _drawStompMarks(camX) {
    const ctx = this.ctx, T = TROLLEY_TUNING;
    this.stomps.forEach(s => {
      const sx = s.x - camX, y = this.laneY(s.lane);
      if (!s.slammed) {
        const p = s.t / T.stompWarn;
        ctx.fillStyle = `rgba(255,30,30,${0.25 + 0.35 * p + 0.15 * Math.sin(this.time * 30)})`;
        ctx.beginPath(); ctx.ellipse(sx, y, 80, 14, 0, 0, Math.PI * 2); ctx.fill();
        this._foot(sx, y - 20 - (1 - p) * 500, 1.1);
      } else {
        const up = (s.t - T.stompWarn) / 0.6;
        this._foot(sx, y - 8 - up * up * 600, 1.1);
      }
    });
  }

  // ------------------------------------------------------------ Caroline

  _caroline(x, y, s, t, o) {
    const ctx = this.ctx;
    const skin = '#c2c784', skinDark = '#9a9e5a', vein = 'rgba(120,60,140,0.6)';
    ctx.save();
    ctx.translate(x, y); ctx.scale(s * (o.face || 1), s);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const run = o.run ? Math.sin(t * (o.giant ? 5 : 14)) : 0;
    // Stink lines.
    ctx.strokeStyle = 'rgba(130,170,60,0.55)'; ctx.lineWidth = 2.5;
    for (let i = 0; i < 4; i++) {
      const p = (t * 0.7 + i / 4) % 1;
      ctx.beginPath();
      for (let k = 0; k <= 6; k++) { const yy = -150 - p * 70 - k * 6; const xx = -40 + i * 26 + Math.sin(k + t * 4 + i) * 5; k ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy); }
      ctx.stroke();
    }
    // Spreadsheet cape.
    const wave = Math.sin(t * 6) * 10;
    ctx.fillStyle = '#e8f4e0';
    ctx.beginPath(); ctx.moveTo(-14, -128); ctx.quadraticCurveTo(-60, -90 + wave, -84, -40 + wave); ctx.lineTo(-40, -30); ctx.lineTo(-4, -70); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#4aa860'; ctx.lineWidth = 1;
    for (let i = 1; i < 6; i++) { ctx.beginPath(); ctx.moveTo(-14 - i * 12, -124 + i * 6); ctx.lineTo(-6 - i * 7, -66 + i * 7); ctx.stroke(); }
    for (let i = 1; i < 5; i++) { ctx.beginPath(); ctx.moveTo(-14 - i * 4, -128 + i * 18); ctx.lineTo(-56 - i * 6, -100 + i * 15 + wave * 0.5); ctx.stroke(); }
    // Legs: lumpy, hairy, veiny.
    const leg = (dx, ph) => {
      const fx = dx + ph * 18;
      ctx.strokeStyle = skin; ctx.lineWidth = 17;
      ctx.beginPath(); ctx.moveTo(dx * 0.5, -62); ctx.quadraticCurveTo(dx + ph * 6 + 6, -32, fx, -6); ctx.stroke();
      ctx.strokeStyle = vein; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(dx * 0.5 + 3, -55); ctx.lineTo(dx + ph * 4 + 2, -34); ctx.lineTo(fx - 2, -16); ctx.stroke();
      ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 1;
      for (let i = 0; i < 6; i++) { const yy = -50 + i * 7; ctx.beginPath(); ctx.moveTo(dx + 7, yy); ctx.lineTo(dx + 11, yy - 3); ctx.stroke(); }
      ctx.fillStyle = skinDark; ctx.beginPath(); ctx.ellipse(fx + 8, -4, 17, 7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#d8c040';
      for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(fx + 18 + i * 1.5, -8 + i * 2.5); ctx.lineTo(fx + 29 + i, -6 + i * 2.5); ctx.lineTo(fx + 18, -4 + i * 2.5); ctx.fill(); }
    };
    leg(-8, -run); leg(10, run);
    // Frumpy stained dress.
    ctx.fillStyle = '#6a5a3a';
    ctx.beginPath(); ctx.moveTo(-24, -128); ctx.lineTo(28, -128); ctx.lineTo(40, -56); ctx.lineTo(-34, -56); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#4a3a1a';
    [[-10, -100, 9], [16, -84, 7], [-20, -70, 6], [8, -110, 5]].forEach(([a, b, r]) => { ctx.beginPath(); ctx.ellipse(a, b, r, r * 0.7, 0.4, 0, Math.PI * 2); ctx.fill(); });
    // Belly roll.
    ctx.fillStyle = skin; ctx.beginPath(); ctx.ellipse(6, -62, 28, 8, 0, 0, Math.PI); ctx.fill();
    // Money-bag arm.
    ctx.strokeStyle = skin; ctx.lineWidth = 14;
    ctx.beginPath(); ctx.moveTo(22, -120); ctx.quadraticCurveTo(46, -100 - run * 10, 40, -76); ctx.stroke();
    ctx.fillStyle = '#c8a060'; ctx.beginPath(); ctx.arc(46, -68, 18, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#8a6a30'; ctx.fillRect(40, -88, 12, 6);
    this._t('$', 46, -66, 22, '#2a6a2a');
    // Other arm, flabby wing.
    ctx.strokeStyle = skin; ctx.lineWidth = 14;
    ctx.beginPath(); ctx.moveTo(-18, -120); ctx.quadraticCurveTo(-36, -96 + run * 10, -28, -78); ctx.stroke();
    ctx.fillStyle = skin; ctx.beginPath(); ctx.ellipse(-30, -100, 8, 14, 0.3, 0, Math.PI * 2); ctx.fill();
    // Hair: a huge frizzy auburn mass.
    const hy = -168;
    ctx.fillStyle = '#6a2e14';
    for (let i = 0; i < 26; i++) {
      const a = Math.PI * (0.8 + i / 25 * 1.5);
      const r = 40 + (i % 4) * 5;
      ctx.beginPath(); ctx.arc(6 + Math.cos(a) * r * 0.9, hy + Math.sin(a) * r * 0.85 + 6, 13 + (i % 3) * 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#4a1e0a';
    for (let i = 0; i < 10; i++) { const a = Math.PI * (0.9 + i / 9 * 1.3); ctx.beginPath(); ctx.arc(6 + Math.cos(a) * 46, hy + Math.sin(a) * 40 + 10, 7, 0, Math.PI * 2); ctx.fill(); }
    // Lumpy head.
    ctx.fillStyle = skin;
    [[6, hy, 34], [-10, hy + 10, 22], [24, hy + 12, 22], [8, hy + 22, 24], [-4, hy - 14, 18]].forEach(([a, b, r]) => { ctx.beginPath(); ctx.arc(a, b, r, 0, Math.PI * 2); ctx.fill(); });
    ctx.strokeStyle = vein; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-14, hy - 20); ctx.lineTo(-6, hy - 10); ctx.lineTo(-12, hy); ctx.stroke();
    // Warts (with hairs) and pimples.
    [[-16, hy + 14], [30, hy - 4], [-2, hy + 30], [26, hy + 26]].forEach(([a, b]) => {
      ctx.fillStyle = '#6a5a2a'; ctx.beginPath(); ctx.arc(a, b, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(a + 3, b - 5); ctx.stroke();
    });
    [[16, hy - 18], [-8, hy - 4], [34, hy + 14], [4, hy + 36]].forEach(([a, b]) => {
      ctx.fillStyle = '#d84a3a'; ctx.beginPath(); ctx.arc(a, b, 3.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f4e070'; ctx.beginPath(); ctx.arc(a, b - 0.8, 1.3, 0, Math.PI * 2); ctx.fill();
    });
    // Bulging bloodshot eyes behind cracked coke-bottle glasses.
    const eyes = [[-6, hy - 6], [20, hy - 6]];
    eyes.forEach(([a, b], i) => {
      const bulge = 12 + Math.sin(t * 5 + i) * 1.2;
      ctx.fillStyle = '#fff6e0'; ctx.beginPath(); ctx.arc(a, b, bulge, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#d83a3a'; ctx.lineWidth = 1;
      for (let k = 0; k < 5; k++) { const ang = k * 1.3 + i; ctx.beginPath(); ctx.moveTo(a + Math.cos(ang) * bulge, b + Math.sin(ang) * bulge); ctx.lineTo(a + Math.cos(ang + 0.3) * bulge * 0.5, b + Math.sin(ang + 0.3) * bulge * 0.5); ctx.stroke(); }
      const look = i ? [4, -3] : [-3, 4];
      ctx.fillStyle = '#3a6a2a'; ctx.beginPath(); ctx.arc(a + look[0], b + look[1], 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(a + look[0], b + look[1], 2.2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.arc(a, b, 14.5, 0, Math.PI * 2); ctx.stroke();
    });
    ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(8.5, hy - 7); ctx.lineTo(5.5, hy - 7); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(14, hy - 16); ctx.lineTo(20, hy - 6); ctx.lineTo(17, hy + 2); ctx.moveTo(20, hy - 6); ctx.lineTo(28, hy - 4); ctx.stroke();
    // Bulbous nose with nostril hair.
    ctx.fillStyle = skinDark; ctx.beginPath(); ctx.arc(10, hy + 10, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3a2a1a'; ctx.beginPath(); ctx.arc(6, hy + 15, 2.2, 0, Math.PI * 2); ctx.arc(14, hy + 15, 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(6, hy + 16); ctx.lineTo(5, hy + 20); ctx.moveTo(14, hy + 16); ctx.lineTo(15, hy + 20); ctx.stroke();
    // Gaping mouth: crooked rotten teeth, tongue, cash, drool.
    const open = 6 + 16 * (o.mouth != null ? o.mouth : 0.4 + 0.3 * Math.sin(t * 8));
    const my = hy + 28;
    ctx.fillStyle = '#3a0a10'; ctx.beginPath(); ctx.ellipse(10, my + open / 2, 18, open / 2 + 2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#d84a6a'; ctx.beginPath(); ctx.ellipse(12, my + open - 2, 10, 4, 0, 0, Math.PI * 2); ctx.fill();
    const teeth = [['#e8d070', 4], ['#c8a040', 6], [null, 0], ['#e8d070', 5], ['#7a5a20', 4], ['#e8d070', 7]];
    teeth.forEach(([c, h], i) => { if (!c) return; ctx.fillStyle = c; ctx.save(); ctx.translate(-3 + i * 5.2, my - 1); ctx.rotate((i % 2 ? 0.2 : -0.15)); ctx.fillRect(0, 0, 4.4, h); ctx.restore(); });
    ctx.fillStyle = '#e8d070'; ctx.fillRect(4, my + open - 3, 4, 4); ctx.fillRect(16, my + open - 4, 4, 5);
    ctx.save(); ctx.translate(24, my + open * 0.5); ctx.rotate(0.5 + Math.sin(t * 4) * 0.2);
    ctx.fillStyle = '#6aa860'; ctx.fillRect(0, -4, 22, 9); ctx.fillStyle = '#4a8040'; ctx.fillRect(7, -2, 8, 5);
    ctx.restore();
    const drip = (t * 0.9) % 1;
    ctx.strokeStyle = 'rgba(150,200,80,0.85)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-4, my + open * 0.6); ctx.quadraticCurveTo(-8, my + open + 10, -6, my + open + 14 + drip * 26); ctx.stroke();
    ctx.fillStyle = 'rgba(150,200,80,0.9)'; ctx.beginPath(); ctx.arc(-6, my + open + 16 + drip * 26, 3.5, 0, Math.PI * 2); ctx.fill();
    // Flies.
    ctx.fillStyle = '#111';
    for (let i = 0; i < 5; i++) {
      const a = t * (3 + i * 0.4) + i * 1.3, r = 52 + (i % 2) * 14;
      const fx = 6 + Math.cos(a) * r, fy = hy - 10 + Math.sin(a * 1.3) * r * 0.6;
      ctx.beginPath(); ctx.arc(fx, fy, 2.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(200,220,255,0.6)'; ctx.beginPath(); ctx.ellipse(fx - 1, fy - 3, 3, 1.5, Math.sin(t * 60) * 0.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#111';
    }
    ctx.restore();
  }

  _foot(x, y, s) {
    const ctx = this.ctx;
    const skin = '#c2c784', dark = '#9a9e5a';
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.fillStyle = skin; ctx.fillRect(-36, -420, 62, 380);
    ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 1.5;
    for (let i = 0; i < 18; i++) { const yy = -400 + i * 20; ctx.beginPath(); ctx.moveTo(-30 + (i % 3) * 18, yy); ctx.lineTo(-26 + (i % 3) * 18, yy - 7); ctx.stroke(); }
    ctx.fillStyle = dark; ctx.beginPath(); ctx.ellipse(10, -12, 82, 30, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = skin;
    for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(58 + i * 3 - (i > 2 ? 6 : 0), -30 + i * 9, 10 - i, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#d8c040';
    for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(64 + i * 3, -36 + i * 9); ctx.lineTo(88 + i * 2, -30 + i * 9); ctx.lineTo(62 + i * 3, -26 + i * 9); ctx.fill(); }
    ctx.fillStyle = '#6a5a2a';
    [[-20, -20], [20, -30], [0, -2]].forEach(([a, b]) => { ctx.beginPath(); ctx.arc(a, b, 5, 0, Math.PI * 2); ctx.fill(); });
    ctx.restore();
  }

  _drawDebris(camX) {
    const ctx = this.ctx;
    ctx.fillStyle = '#c4141a';
    this.gore.forEach(p => { ctx.beginPath(); ctx.arc(p.x - camX, p.y, p.r, 0, Math.PI * 2); ctx.fill(); });
    this.debris.forEach(d => {
      const sx = d.x - camX;
      if (sx < -60 || sx > this.VW + 60) return;
      ctx.save(); ctx.translate(sx, d.y); ctx.rotate(d.rot);
      ctx.globalAlpha = Math.min(1, d.life / 0.5);
      ctx.fillStyle = d.color; ctx.strokeStyle = d.color; ctx.lineCap = 'round';
      if (d.kind === 'head') { ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#c4141a'; ctx.fillRect(-3, 5, 6, 4); }
      else if (d.kind === 'torso') { jailRoundRectPath(ctx, -7, -11, 14, 22, 4); ctx.fill(); ctx.fillStyle = '#c4141a'; ctx.fillRect(-7, -11, 14, 4); }
      else if (d.kind === 'limb') { ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(8, 0); ctx.stroke(); ctx.fillStyle = '#c4141a'; ctx.beginPath(); ctx.arc(-8, 0, 2.5, 0, Math.PI * 2); ctx.fill(); }
      else if (d.kind === 'shrimp') { ctx.lineWidth = 3.5; ctx.beginPath(); ctx.arc(0, 0, 5, 0.2, 3.6); ctx.stroke(); }
      else if (d.kind === 'lobster') { ctx.beginPath(); ctx.ellipse(0, 0, 5, 10, 0, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(-4, -11, 4, 0, Math.PI * 2); ctx.arc(4, -11, 4, 0, Math.PI * 2); ctx.fill(); }
      else if (d.kind === 'spark' || d.kind === 'metal') { ctx.fillRect(-4, -2, 8, 4); }
      else if (d.kind === 'drop' || d.kind === 'dust') { ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill(); }
      else if (d.kind === 'coin') { ctx.beginPath(); ctx.ellipse(0, 0, 18 * Math.abs(Math.cos(d.rot * 2)) + 2, 20, 0, 0, Math.PI * 2); ctx.fill(); }
      else if (d.kind === 'sign') { ctx.fillStyle = '#e8d8b0'; ctx.fillRect(-26, -15, 52, 30); ctx.fillStyle = '#7a5a3a'; ctx.fillRect(-3, 15, 6, 40); }
      else if (d.kind === 'sbf') {
        ctx.fillStyle = '#3a2414';
        for (let i = 0; i < 7; i++) { ctx.beginPath(); ctx.arc(Math.cos(i) * 9, -12 + Math.sin(i * 1.7) * 5, 7, 0, Math.PI * 2); ctx.fill(); }
        ctx.fillStyle = '#f0c9a0'; ctx.beginPath(); ctx.arc(0, -8, 9, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#6ab0d8'; ctx.fillRect(-9, 0, 18, 22);
        ctx.fillStyle = '#8a7a5a'; ctx.fillRect(-9, 22, 18, 10);
      }
      ctx.restore();
    });
    ctx.globalAlpha = 1;
    // Coins flying off to Caroline.
    this.flyCoins.forEach(c => {
      const p = c.t / 0.7;
      const x = jyLerp(c.x, this.VW - 40, p), y = jyLerp(c.y, 70, p) - Math.sin(p * Math.PI) * 60;
      ctx.fillStyle = '#f4c542'; ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fill();
    });
  }

  // ------------------------------------------------------------ HUD / screens

  _t(text, x, y, size, color) {
    const ctx = this.ctx;
    ctx.font = `bold ${size}px VT323, monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = color; ctx.fillText(text, x, y);
  }

  _label(text, x, y, size, color, align) {
    const ctx = this.ctx;
    ctx.font = `bold ${size}px VT323, monospace`;
    ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.lineWidth = 5;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color; ctx.fillText(text, x, y);
  }

  _drawHud() {
    if (this.phase === 'intro' || this.phase === 'results') return;
    this._label(`UTILS ${jtFmt(this.utils)}`, 14, 30, 28, '#f4c542', 'left');
    if (this.donated) this._label(`DONATED TO CAROLINE $${jtFmt(this.donated)}`, 14, 58, 18, '#9af0a8', 'left');
    if (this.phase === 'run') {
      this._label(`CAROLINE ${Math.max(0, Math.round(this.carD / 10))}m »`, this.VW - 14, 30, 26, '#c2c784', 'right');
      if (this.time < 5) this._label(this.touchUI ? 'TAP ABOVE / BELOW YOU TO SWITCH TRACKS' : 'UP / DOWN TO SWITCH TRACKS', this.VW / 2, this.VH * 0.17, 20, '#ffffff');
      if (this.time < 5) this._label('THE TROLLEY FOLLOWS YOUR PATH', this.VW / 2, this.VH * 0.17 + 26, 20, '#ff9a8a');
    } else if (this.phase === 'escape') {
      const left = Math.max(0, TROLLEY_TUNING.escapeTime - this.escape.t);
      this._label(`ESCAPE ${Math.ceil(left)}`, this.VW - 14, 30, 30, '#ff6a6a', 'right');
      if (this.escape.t < 3) this._label('DODGE THE FEET', this.VW / 2, this.VH * 0.17, 30, '#ffffff');
    }
  }

  _overlay(a) { this.ctx.fillStyle = `rgba(8,6,12,${a})`; this.ctx.fillRect(0, 0, this.VW, this.VH); }

  _drawIntro() {
    this._overlay(0.6);
    const y = this.VH * 0.16, cx = this.VW / 2;
    this._label('TROLLEY PROBLEMS', cx, y, 54, '#f4c542');
    this._label('CHASE CAROLINE', cx, y + 50, 34, '#c2c784');
    this._label('THE TROLLEY FOLLOWS YOUR PATH', cx, y + 104, 22, '#ffffff');
    this._label('WHATEVER IS ON YOUR TRACK, IT HITS', cx, y + 130, 22, '#ffffff');
    this._label('KILLS SLOW IT DOWN · EMPTY TRACK SPEEDS IT UP', cx, y + 162, 18, '#ff9a8a');
    this._label('SCORED IN UTILS', cx, y + 190, 18, '#9af0a8');
    this._label(this.touchUI ? 'TAP ABOVE / BELOW YOU TO SWITCH TRACKS' : 'UP / DOWN (OR CLICK) TO SWITCH TRACKS', cx, y + 230, 20, '#f4c542');
    if (this.phaseT > 0.5) this._label('TAP TO START', cx, this.VH * 0.62, 30, '#ffffff');
  }

  _summary() {
    const optFrac = this.picks ? this.optimal / this.picks : 0;
    const q = 0.55 * optFrac + 0.25 * (1 - Math.min(1, this.trolleyHits / 4)) + 0.2 * (1 - Math.min(1, this.squashes / 4));
    return { optFrac, gain: Math.round(45 * jailClamp(q, 0, 1)) };
  }

  _drawResults() {
    this._overlay(0.72);
    const cx = this.VW / 2, y = this.VH * 0.14;
    this._label('ESCAPED', cx, y, 60, '#f4c542');
    const rows = [
      [`EV-OPTIMAL PICKS ${this.optimal}/${this.picks}`, '#ffffff'],
      [`PEOPLE KILLED ${this.killed.people}`, '#ff8a8a'],
      [`SHRIMP KILLED ${jtFmt(this.killed.shrimp)}`, '#ff8a9a'],
      [`LOBSTERS FREED ${this.killed.lobsters}`, '#ff9a6a'],
      [`AGIS DESTROYED ${this.killed.robots}`, '#9af0a8'],
      [`DONATED TO CAROLINE $${jtFmt(this.donated)}`, '#c2c784'],
      [`RUN OVER ${this.trolleyHits} · SQUASHED ${this.squashes}`, '#ffffff'],
    ];
    rows.forEach(([text, c], i) => this._label(text, cx, y + 62 + i * 30, 21, c));
    this._label('UTILS', cx, y + 300, 24, '#c8c0b0');
    const pulse = 1 + 0.05 * Math.sin(this.phaseT * 8);
    this.ctx.save(); this.ctx.translate(cx, y + 350); this.ctx.scale(pulse, pulse);
    this._label(jtFmt(this.utils), 0, 0, 64, '#f4c542');
    this.ctx.restore();
    if (this.phaseT > 0.8) this._label('TAP TO CONTINUE', cx, y + 430, 28, '#ffffff');
  }

  _end() {
    if (this.finished) return;
    const sm = this._summary();
    this.destroy();
    this.onDone({
      grade: jailGradeFromGain(sm.gain),
      friendshipGain: sm.gain,
      stats: [
        ['EV-optimal picks', `${this.optimal}/${this.picks}`],
        ['Utils', jtFmt(this.utils)],
        ['People killed', String(this.killed.people)],
        ['Shrimp killed', jtFmt(this.killed.shrimp)],
        ['Run over / squashed', `${this.trolleyHits} / ${this.squashes}`],
        ['Friendship', `+${sm.gain}`],
      ],
      detail: { rescued: true, utils: this.utils, optimal: this.optimal, picks: this.picks },
    });
  }

  destroy() {
    this.finished = true;
    if (this._af) cancelAnimationFrame(this._af);
    this._af = null;
    this.canvas.removeEventListener('touchstart', this._touchH);
    this.canvas.removeEventListener('touchend', this._touchEndH);
    this.canvas.removeEventListener('pointerdown', this._ptrH);
    window.removeEventListener('keydown', this._keyH);
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.host.resize();
  }
}
