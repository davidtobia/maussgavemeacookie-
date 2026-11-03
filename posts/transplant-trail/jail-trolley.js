/**
 * THE JAIL — SBF: TROLLEY PROBLEMS
 * ==================================
 *
 *   new JailTrolleyGame(host, charId, onDone)   (same contract as jail-minigames.js)
 *
 * Side-view, zoomed-out chase down one track. She's ahead — ethereal,
 * glowing, always just out of reach. A trolley (SBF driving, on his
 * laptop) is behind you and follows whatever track you take.
 *
 * The track keeps forking into the textbook trolley diagram: DO NOTHING
 * (top branch) vs PULL THE LEVER (bottom branch), something tied to each.
 * Time slows as you approach and a card for each branch appears; tap the
 * one you want. The trolley runs over whatever's on your branch. Kills
 * stall it, an empty branch lets it catch you. Scored in UTILS with EA
 * math (shrimp > people, hypothetical future people > everything, the
 * 51/49 coin flip is always +EV).
 *
 * When you finally catch her the dream drains out of the world, she turns
 * around, and she's disgusting. She grows giant, crushes the trolley, and
 * chases you — dodge her stomps (tap top / bottom track) to escape.
 *
 * Text here is UI labels for the gags, no dialogue.
 */

const TROLLEY_TUNING = {
  runSpeed: 440, zoomMin: 0.46, zoomMax: 0.8,
  forkFirst: 1000, ramp: 260, branch: 560, mainGap: 420, B: 170, groundY: 330,
  decideDist: 460, slowmo: 0.42,
  carGap: 560, carMin: 110,
  trolleyStartGap: 270, trolleyClose: 30, trolleyMaxGap: 380, trolleyHitGap: 34,
  stallSpeed: 110, surgeSpeed: 150,
  stunTime: 0.8, trolleyDerail: 1.3, runOverPenalty: 260,
  twistTime: 3.6, escapeTime: 10, stompFirst: 1.4, stompLast: 0.8, stompWarn: 0.9,
  shrimpWeight: 0.0003, victimScale: 2.2,
};

// [DO NOTHING (top), PULL THE LEVER (bottom)]
const TROLLEY_FORKS = [
  ['people:5', 'people:1'],
  ['people:1', 'shrimp'],
  ['people:12', 'future'],
  ['people:1', 'robot'],
  ['people:5', 'coinflip'],
  ['lobster', 'people:2'],
  ['people:3', 'mugger'],
  ['people:1', 'coins'],
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

function jtSmooth(p) { p = jailClamp(p, 0, 1); return p * p * (3 - 2 * p); }

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
    this.dream = 1;
    this.camBlend = 0;

    this.px = 0;
    this.stun = 0;
    this.squash = 0;
    this.escSide = -1;
    this.escY = 0;

    this.tx = -T.trolleyStartGap;
    this.tv = T.runSpeed + T.trolleyClose;
    this.tStall = 0; this.tSurge = 0; this.tStop = 0;
    this.trolleyAlive = true;
    this.blood = 0;

    this.carPenalty = 0;
    this.utils = 0;
    this.picks = 0; this.optimal = 0;
    this.killed = { people: 0, shrimp: 0, lobsters: 0, robots: 0 };
    this.trolleyHits = 0; this.squashes = 0; this.donated = 0;
    this.shake = 0; this.flash = 0; this.flashColor = '224,40,40';

    this.period = 2 * T.ramp + T.branch + T.mainGap;
    this.forks = TROLLEY_FORKS.map((def, k) => {
      const x0 = T.forkFirst + k * this.period;
      const x1 = x0 + 2 * T.ramp + T.branch;
      const groups = def.map((spec, i) => {
        const g = this._makeGroup(spec, i ? 1 : -1, 0, k * 7 + i);
        g.w *= T.victimScale;
        g.x = x0 + T.ramp + 30;
        return g;
      });
      return { k, x0, x1, groups, choice: -1, touched: false, locked: false, resolved: false };
    });
    this.courseEnd = this.forks[this.forks.length - 1].x1 + T.mainGap;

    this.debris = [];
    this.gore = [];
    this.splats = [];
    this.motes = Array.from({ length: 60 }, () => this._mote(true));
    this.stomps = [];

    this._bindInput();
    this.last = performance.now();
    this._loop();
  }

  // ------------------------------------------------------------ plumbing

  _fit() {
    const T = TROLLEY_TUNING;
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
    this.z = jailClamp(this.VW / 1000, T.zoomMin, T.zoomMax);
    this.Wv = this.VW / this.z;
    this.midY = this.VH * 0.5;
    this.camX = this.px - this.Wv * jyLerp(0.33, 0.6, this.camBlend);
  }

  sx(x) { return (x - this.camX) * this.z; }
  sy(y) { return this.midY + y * this.z; }

  _bindInput() {
    const dirAt = (clientY) => ((clientY - this.rect.top) / this.u < this.midY ? -1 : 1);
    this._touchH = (e) => { e.preventDefault(); for (const t of e.changedTouches) this._press(dirAt(t.clientY)); };
    this._touchEndH = (e) => e.preventDefault();
    this._ptrH = (e) => { if (e.pointerType === 'touch') return; e.preventDefault(); this._press(dirAt(e.clientY)); };
    this._keyH = (e) => {
      const k = e.key.toLowerCase();
      if (k === 'arrowup' || k === 'w') { e.preventDefault(); this._press(-1); }
      else if (k === 'arrowdown' || k === 's') { e.preventDefault(); this._press(1); }
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
    if (!dir) return;
    if (this.phase === 'run') {
      const f = this._nextFork();
      if (f && f.x0 - this.px < TROLLEY_TUNING.decideDist * 1.6) { f.choice = dir; f.touched = true; }
    } else if (this.phase === 'escape') this.escSide = dir;
  }

  _setPhase(p) { this.phase = p; this.phaseT = 0; }

  _nextFork() { return this.forks.find(f => !f.locked); }

  _forkAt(x) { return this.forks.find(f => x >= f.x0 && x <= f.x1); }

  _branchY(f, x, side) {
    const T = TROLLEY_TUNING, t = x - f.x0;
    if (t < 0 || x > f.x1) return 0;
    if (t < T.ramp) return side * T.B * jtSmooth(t / T.ramp);
    if (t < T.ramp + T.branch) return side * T.B;
    return side * T.B * jtSmooth((f.x1 - x) / T.ramp);
  }

  // Track height at x along the path actually taken.
  _pathY(x) {
    const f = this._forkAt(x);
    if (f) return this._branchY(f, x, f.choice);
    if (x >= this.courseEnd) return this.escSide * TROLLEY_TUNING.B * jtSmooth((x - this.courseEnd) / TROLLEY_TUNING.ramp);
    return 0;
  }

  _playerY() { return this.px >= this.courseEnd ? this.escY : this._pathY(this.px); }

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

  _mote(anywhere) {
    return { x: Math.random(), y: anywhere ? Math.random() : 1.05, vy: -(0.015 + Math.random() * 0.03), r: 1 + Math.random() * 2.5, ph: Math.random() * 6, petal: Math.random() < 0.35 };
  }

  // ------------------------------------------------------------ update

  _update(rawDt) {
    const T = TROLLEY_TUNING;
    // Slow-mo while a fork's choice is up.
    const nf = this.phase === 'run' ? this._nextFork() : null;
    this.deciding = nf && nf.x0 - this.px < T.decideDist && nf.x0 - this.px > 0 ? nf : null;
    const dt = rawDt * (this.deciding ? T.slowmo : 1);
    this.phaseT += rawDt; this.time += dt;
    this.shake = Math.max(0, this.shake - rawDt * 30);
    this.flash = Math.max(0, this.flash - rawDt * 2.5);
    const late = this.phase === 'twist' || this.phase === 'escape' || this.phase === 'results';
    this.camBlend += ((late ? 1 : 0) - this.camBlend) * Math.min(1, rawDt * 1.5);
    if (late) this.dream = Math.max(0, this.dream - rawDt * 0.9);
    this.motes.forEach((m, i) => { m.y += m.vy * rawDt; m.x += Math.sin(this.time + m.ph) * 0.0008; if (m.y < -0.05) this.motes[i] = this._mote(false); });
    this.floaters.update();
    this._updateDebris(dt);
    if (this.phase === 'intro' || this.phase === 'results') return;

    this.stun = Math.max(0, this.stun - dt);
    this.squash = Math.max(0, this.squash - dt);
    let speed = this.stun > 0 ? 0 : T.runSpeed * (this.squash > 0 ? 0.35 : 1);
    if (this.phase === 'twist') speed = this.phaseT < 0.5 ? T.runSpeed * (1 - this.phaseT / 0.5) : (this.phaseT > T.twistTime - 0.6 ? T.runSpeed * 0.6 : 0);
    this.px += speed * dt;

    if (this.phase === 'run') this._updateRun(dt);
    else if (this.phase === 'twist') this._updateTwist(dt);
    else if (this.phase === 'escape') this._updateEscape(dt);
  }

  _carD() {
    const T = TROLLEY_TUNING;
    const p = this.px / (this.courseEnd - 260);
    return Math.max(T.carMin, T.carGap * (1 - jtSmooth((p - 0.86) / 0.14)) + T.carMin * jtSmooth((p - 0.86) / 0.14)) + this.carPenalty;
  }

  _updateRun(dt) {
    const T = TROLLEY_TUNING;
    this.carPenalty = Math.max(0, this.carPenalty - dt * 80);
    // Lock each fork as you hit it.
    this.forks.forEach(f => {
      if (f.locked || this.px < f.x0) return;
      f.locked = true;
      const pick = f.groups.find(g => g.lane === f.choice);
      const best = Math.min(...f.groups.map(g => this._nominal(g)));
      this.picks++;
      if (this._nominal(pick) <= best) this.optimal++;
    });
    // Cash on your branch gets grabbed and "donated" to her.
    this.forks.forEach(f => f.groups.forEach(g => {
      if (g.kind !== 'coins' || !f.locked || g.lane !== f.choice) return;
      g.coins.forEach(c => {
        const cx = g.x + c.dx * T.victimScale;
        if (!c.got && this.px >= cx) { c.got = true; this.donated += 1000; this.floaters.add(this.sx(cx), this.sy(this._pathY(cx)) - 50, '+$1,000 TO HER', '#f4c542', { size: 16, life: 30 }); }
      });
    }));

    // Trolley.
    if (this.tStop > 0) { this.tStop -= dt; this.tv = 0; }
    else {
      this.tStall -= dt; this.tSurge -= dt;
      const gap = this.px - this.tx;
      if (this.tStall > 0) this.tv = T.stallSpeed;
      else if (this.tSurge > 0) this.tv = T.runSpeed + T.surgeSpeed;
      else this.tv = T.runSpeed + T.trolleyClose;
      if (gap > T.trolleyMaxGap && this.tStall <= 0) this.tv = Math.max(this.tv, T.runSpeed * 1.2);
    }
    this.tx += this.tv * dt;
    this.forks.forEach(f => {
      if (!f.locked || f.resolved) return;
      const g = f.groups.find(o => o.lane === f.choice);
      if (this.tx >= g.x) { f.resolved = true; this._trolleyHits(f, g); }
    });
    if (this.stun <= 0 && this.px - this.tx < T.trolleyHitGap) this._runOver();

    if (this.px >= this.courseEnd - 260) {
      this.twist = { cx: this.px + this._carD() + 170 };
      this._setPhase('twist');
    }
  }

  _trolleyHits(f, g) {
    const T = TROLLEY_TUNING;
    const worst = Math.max(0, ...f.groups.filter(o => o.cost != null && isFinite(o.cost)).map(o => o.cost));
    const gy = this._branchY(f, g.x, g.lane);
    const sx = jailClamp(this.sx(g.x + g.w / 2), 90, this.VW - 90), sy = this.sy(gy) - 70;
    g.hit = true; g.t = 0;
    const pop = (text, color, size) => this.floaters.add(sx, sy, text, color, { size: size || 30, life: 70, vy: -0.6 });
    const wx = g.x, wy = gy;
    if (g.kind === 'people') {
      this.killed.people += g.n;
      this.tStall = 0.25 + 0.08 * g.n;
      g.people.forEach(p => this._ragdoll(wx + p.dx * T.victimScale, wy - 20, p.skin, p.shirt));
      this.blood = Math.min(1, this.blood + 0.08 * g.n);
      this.utils += worst - g.cost;
      pop(g.n === 1 ? '1 DEAD' : `${g.n} DEAD`, '#ff4a4a');
      this.shake = 6 + g.n;
    } else if (g.kind === 'shrimp') {
      this.killed.shrimp += 1e6;
      this.tStall = 0.6;
      for (let i = 0; i < 70; i++) this.debris.push(this._piece(wx + Math.random() * g.w, wy - 10, 'shrimp', '#ff8a9a', 1.1));
      this.utils += worst - g.cost;
      pop('-1,000,000 SHRIMP', '#ff8a9a');
      this.shake = 8;
    } else if (g.kind === 'future') {
      this.tSurge = 0.7;
      this.debris.push(this._piece(wx + 30, wy - 80, 'sign', '#c8a060', 1.2));
      this.utils += worst - g.cost;
      pop('-1.0e58 UTILS', '#ff4a4a', 36);
      this.flash = 0.8; this.flashColor = '120,60,220';
    } else if (g.kind === 'robot') {
      this.killed.robots++;
      this.tStall = 0.45;
      for (let i = 0; i < 34; i++) this.debris.push(this._piece(wx + 30, wy - 40, 'spark', Math.random() < 0.5 ? '#f4c542' : '#9aa4b0', 1.2));
      this.utils += worst - g.cost;
      pop('AI RISK AVERTED', '#7ec89a');
      this.shake = 9;
    } else if (g.kind === 'lobster') {
      this.killed.lobsters += 6;
      this.tStall = 0.4;
      for (let i = 0; i < 6; i++) this.debris.push(this._piece(wx + 40, wy - 60, 'lobster', '#e0402a', 1.2));
      for (let i = 0; i < 24; i++) this.debris.push(this._piece(wx + 40, wy - 40, 'drop', '#bfe6ff', 1));
      this.utils += worst - g.cost;
      pop('LOBSTERS FREED', '#ff7a5a');
    } else if (g.kind === 'coinflip') {
      this.tStall = 0.3;
      const win = Math.random() < 0.51;
      this.debris.push(this._piece(wx + 40, wy - 50, 'coin', '#f4c542', 1.3));
      if (win) { this.utils = this.utils === 0 ? 1000 : this.utils * 2; pop('DOUBLED', '#f4c542', 42); }
      else { this.utils = 0; pop('ZERO', '#ff4a4a', 52); this.flash = 0.8; this.flashColor = '0,0,0'; }
    } else if (g.kind === 'mugger') {
      this.tSurge = 1.0;
      this.utils = this.utils / 2;
      pop('MUGGED: -50%', '#ff4a4a', 34);
    } else {
      this.tSurge = 0.7;
      pop('TROLLEY SPEEDS UP', '#ffb04a', 24);
    }
    if (this.tSurge > 0) this.tStall = 0;
  }

  _runOver() {
    const T = TROLLEY_TUNING;
    this.trolleyHits++;
    this.stun = T.stunTime;
    this.tStop = T.trolleyDerail;
    this.carPenalty += T.runOverPenalty;
    this.shake = 14; this.flash = 0.9; this.flashColor = '224,40,40';
    const y = this._playerY();
    this._blood(this.px, y - 70, 24, 1);
    this.floaters.add(this.sx(this.px), this.sy(y) - 90, 'RUN OVER', '#ff4a4a', { size: 40, life: 60 });
  }

  _updateTwist(dt) {
    const T = TROLLEY_TUNING, t = this.phaseT;
    if (this.trolleyAlive) {
      this.tx = Math.min(this.tx + T.runSpeed * 0.7 * dt, this.px - 120);
      if (t > 2.6) {
        this.trolleyAlive = false;
        this.shake = 22; this.flash = 1; this.flashColor = '255,255,255';
        const y = this._pathY(this.tx);
        for (let i = 0; i < 44; i++) this.debris.push(this._piece(this.tx - 80, y - 50, 'metal', Math.random() < 0.5 ? '#c8402a' : '#f4c542', 1.6));
        this.debris.push(this._piece(this.tx - 80, y - 90, 'sbf', '#6ab0d8', 1.5));
        this.floaters.add(this.sx(this.tx - 80), this.sy(y) - 160, 'CRUNCH', '#f4c542', { size: 56, life: 70 });
      }
    }
    if (t > T.twistTime) {
      this.escape = { t: 0, next: T.stompFirst };
      this.escY = this._pathY(this.px);
      this._setPhase('escape');
    }
  }

  _updateEscape(dt) {
    const T = TROLLEY_TUNING, e = this.escape;
    e.t += dt; e.next -= dt;
    const target = this.escSide * T.B * jtSmooth((this.px - this.courseEnd) / T.ramp);
    this.escY += (target - this.escY) * Math.min(1, dt * 10);
    if (e.next <= 0 && e.t < T.escapeTime - 0.8) {
      e.next = jyLerp(T.stompFirst, T.stompLast, e.t / T.escapeTime);
      const side = Math.random() < 0.65 ? this.escSide : -this.escSide;
      this.stomps.push({ x: this.px + T.runSpeed * T.stompWarn, side, t: 0, slammed: false });
    }
    this.stomps.forEach(s => {
      s.t += dt;
      if (!s.slammed && s.t >= T.stompWarn) {
        s.slammed = true;
        this.shake = 16;
        const pSide = this.escY < 0 ? -1 : 1;
        if (Math.abs(this.px - s.x) < 110 && pSide === s.side && Math.abs(this.escY) > T.B * 0.5 && this.squash <= 0) {
          this.squashes++;
          this.squash = 0.8;
          this.flash = 0.7; this.flashColor = '120,160,60';
          this.floaters.add(this.sx(this.px), this.sy(this.escY) - 90, 'SQUASHED', '#a8d84a', { size: 42, life: 60 });
        }
        for (let i = 0; i < 16; i++) this.debris.push(this._piece(s.x, s.side * T.B - 6, 'dust', '#d8c8a0', 0.9));
      }
    });
    this.stomps = this.stomps.filter(s => s.t < T.stompWarn + 0.6);
    if (e.t >= T.escapeTime) this._setPhase('results');
  }

  _updateDebris(dt) {
    const floor = TROLLEY_TUNING.groundY;
    this.debris.forEach(d => {
      d.vy += 1400 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.rot += d.vr * dt; d.life -= dt;
      if (d.y > floor && d.vy > 0) { d.y = floor; d.vy *= -0.3; d.vx *= 0.6; d.vr *= 0.6; }
    });
    this.debris = this.debris.filter(d => d.life > 0);
    this.gore.forEach(p => {
      p.vy += 1100 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.y > floor) { p.dead = true; this.splats.push({ x: p.x, y: floor + Math.random() * 14, r: p.r * 1.6 }); }
    });
    this.gore = this.gore.filter(p => !p.dead);
    if (this.splats.length > 500) this.splats.splice(0, this.splats.length - 500);
  }

  // ------------------------------------------------------------ drawing

  _draw() {
    const ctx = this.ctx, s = this.dpr * this.u, T = TROLLEY_TUNING;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.save();
    if (this.shake > 0) ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake * 0.6);
    this._drawBackdrop();
    // World space.
    ctx.save();
    ctx.translate(0, this.midY); ctx.scale(this.z, this.z); ctx.translate(-this.camX, 0);
    this._drawTracks();
    this._drawGroups();
    if (this.phase === 'escape') this._drawStomps();
    this._drawCaroline();
    this._drawRunner();
    if (this.trolleyAlive && this.phase !== 'intro') this._drawTrolleyOnPath();
    this._drawDebris();
    ctx.restore();
    this._drawMotes();
    ctx.restore();
    if (this.flash > 0) { ctx.fillStyle = `rgba(${this.flashColor},${this.flash * 0.35})`; ctx.fillRect(0, 0, this.VW, this.VH); }
    this.floaters.draw(ctx);
    if (this.deciding) this._drawChoice(this.deciding);
    else if (this.phase === 'run') this._drawTrolleyWarning();
    this._drawHud();
    if (this.phase === 'intro') this._drawIntro();
    if (this.phase === 'results') this._drawResults();
  }

  _mix(a, b, t) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const ch = (sh) => Math.round(((pa >> sh) & 255) * t + ((pb >> sh) & 255) * (1 - t));
    return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
  }

  _drawBackdrop() {
    const ctx = this.ctx, VW = this.VW, VH = this.VH, d = this.dream;
    const horizon = this.sy(-170);
    const sky = ctx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, this._mix('#c8a0e8', '#141a10', d));
    sky.addColorStop(0.55, this._mix('#ffb8d0', '#3a2a14', d));
    sky.addColorStop(1, this._mix('#fff0c8', '#5a4a1a', d));
    ctx.fillStyle = sky; ctx.fillRect(0, 0, VW, horizon);
    // Big soft sun.
    const sunX = VW * 0.72, sunY = horizon - 40;
    const sg = ctx.createRadialGradient(sunX, sunY, 10, sunX, sunY, 220);
    sg.addColorStop(0, `rgba(255,250,230,${0.95 * d + 0.2})`); sg.addColorStop(0.3, `rgba(255,210,200,${0.5 * d})`); sg.addColorStop(1, 'rgba(255,200,200,0)');
    ctx.fillStyle = sg; ctx.fillRect(0, 0, VW, horizon + 60);
    // Pastel sea.
    ctx.fillStyle = this._mix('#a8d8e8', '#1a2a1a', d); ctx.fillRect(0, horizon, VW, 34);
    ctx.fillStyle = `rgba(255,255,255,${0.35 * d})`;
    for (let i = 0; i < 6; i++) { const x = ((i * 157 - this.camX * this.z * 0.05) % VW + VW) % VW; ctx.fillRect(x, horizon + 8 + (i % 3) * 8, 40, 2); }
    // Sand.
    const sand = ctx.createLinearGradient(0, horizon + 34, 0, VH);
    sand.addColorStop(0, this._mix('#ffe4c0', '#3a3018', d)); sand.addColorStop(1, this._mix('#f0c8a0', '#1e180c', d));
    ctx.fillStyle = sand; ctx.fillRect(0, horizon + 34, VW, VH - horizon - 34);
    // Palms, soft.
    const po = this.camX * this.z * 0.3;
    for (let k = Math.floor(po / 260) - 1; k < (po + VW) / 260 + 1; k++) {
      const x = k * 260 - po + jyHash(k) * 100, base = horizon + 40, h = 110 + jyHash(k + 4) * 60;
      ctx.strokeStyle = this._mix('#d8a8a8', '#1a120a', d); ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(x, base); ctx.quadraticCurveTo(x + 22, base - h * 0.5, x + 14, base - h); ctx.stroke();
      ctx.fillStyle = this._mix('#e8a8c0', '#10180c', d);
      for (let f = 0; f < 6; f++) {
        ctx.save(); ctx.translate(x + 14, base - h); ctx.rotate(f / 6 * Math.PI * 2 + Math.sin(this.time + k) * 0.08);
        ctx.beginPath(); ctx.ellipse(26, 0, 28, 5, 0.3, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    }
    // Haze.
    const hz = ctx.createLinearGradient(0, horizon - 120, 0, horizon + 80);
    hz.addColorStop(0, 'rgba(255,240,240,0)'); hz.addColorStop(0.5, `rgba(255,240,240,${0.35 * d})`); hz.addColorStop(1, 'rgba(255,240,240,0)');
    ctx.fillStyle = hz; ctx.fillRect(0, horizon - 120, VW, 200);
  }

  _railLine(pts) {
    const ctx = this.ctx;
    ctx.strokeStyle = this._mix('#b89080', '#4a3020', this.dream); ctx.lineWidth = 12;
    ctx.setLineDash([8, 18]);
    ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y + 2) : ctx.moveTo(x, y + 2))); ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = this._mix('#fff4f0', '#9aa0a8', this.dream); ctx.lineWidth = 5;
    ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y - 3) : ctx.moveTo(x, y - 3))); ctx.stroke();
  }

  _drawTracks() {
    const ctx = this.ctx, T = TROLLEY_TUNING;
    const x0 = this.camX - 300, x1 = this.camX + this.Wv + 300;
    ctx.fillStyle = '#8a0f12';
    this.splats.forEach(s => { if (s.x > x0 && s.x < x1) { ctx.beginPath(); ctx.ellipse(s.x, s.y, s.r * 1.6, s.r * 0.5, 0, 0, Math.PI * 2); ctx.fill(); } });
    // Trestle posts down to the sand.
    ctx.fillStyle = this._mix('#d0a890', '#5a3a1a', this.dream);
    for (let x = Math.floor(x0 / 160) * 160; x < x1; x += 160) {
      const f = this._forkAt(x);
      const ys = f ? [this._branchY(f, x, -1), this._branchY(f, x, 1)] : (x >= this.courseEnd ? [-1, 1].map(sd => sd * T.B * jtSmooth((x - this.courseEnd) / T.ramp)) : [0]);
      ys.forEach(y => ctx.fillRect(x - 4, y + 6, 8, T.groundY - y));
    }
    // Main line and both branches of every visible fork.
    const step = 20;
    let main = [];
    const flush = () => { if (main.length > 1) this._railLine(main); main = []; };
    for (let x = x0; x <= x1; x += step) {
      const f = this._forkAt(x);
      if (f || x >= this.courseEnd) { flush(); continue; }
      main.push([x, 0]);
    }
    flush();
    this.forks.forEach(f => {
      if (f.x1 < x0 || f.x0 > x1) return;
      [-1, 1].forEach(side => {
        const pts = [];
        for (let x = f.x0; x <= f.x1; x += step) pts.push([x, this._branchY(f, x, side)]);
        pts.push([f.x1, 0]);
        ctx.globalAlpha = f.locked && f.choice !== side ? 0.55 : 1;
        this._railLine(pts);
        ctx.globalAlpha = 1;
      });
      this._drawLever(f);
    });
    if (this.courseEnd < x1) {
      [-1, 1].forEach(side => {
        const pts = [];
        for (let x = this.courseEnd; x <= x1; x += step) pts.push([x, side * T.B * jtSmooth((x - this.courseEnd) / T.ramp)]);
        this._railLine(pts);
      });
    }
  }

  _drawLever(f) {
    const ctx = this.ctx;
    const x = f.x0 - 40, y = 0;
    ctx.fillStyle = '#6a5a4a'; ctx.fillRect(x - 14, y + 4, 28, 14);
    const a = f.choice < 0 ? -0.6 : 0.6;
    ctx.strokeStyle = '#3a3a3a'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, y + 8); ctx.lineTo(x + Math.sin(a) * 46, y + 8 - Math.cos(a) * 46); ctx.stroke();
    ctx.fillStyle = '#d83a3a'; ctx.beginPath(); ctx.arc(x + Math.sin(a) * 46, y + 8 - Math.cos(a) * 46, 9, 0, Math.PI * 2); ctx.fill();
  }

  _drawGroups() {
    const ctx = this.ctx, T = TROLLEY_TUNING;
    this.forks.forEach(f => {
      if (f.x1 < this.camX - 300 || f.x0 > this.camX + this.Wv + 300) return;
      f.groups.forEach(g => {
        ctx.save();
        ctx.translate(g.x, this._branchY(f, g.x + g.w / 2, g.lane));
        ctx.scale(T.victimScale, T.victimScale);
        const w = g.w; g.w = w / T.victimScale;
        this._drawGroup(g);
        g.w = w;
        ctx.restore();
      });
    });
  }

  _drawTrolleyOnPath() {
    const ctx = this.ctx;
    const y = this._pathY(this.tx), yb = this._pathY(this.tx - 120);
    ctx.save();
    ctx.translate(this.tx, y); ctx.rotate(Math.atan2(y - yb, 120));
    this._drawTrolley(0, 0);
    ctx.restore();
  }

  _drawRunner() {
    const T = TROLLEY_TUNING;
    let y = this._playerY();
    // Hop over anything tied to your branch.
    const f = this._forkAt(this.px);
    if (f) {
      const g = f.groups.find(o => o.lane === f.choice);
      if (g && g.kind !== 'empty' && g.kind !== 'coins' && !g.hit) {
        const p = (this.px - (g.x - 60)) / (g.w + 120);
        if (p > 0 && p < 1) y -= Math.sin(p * Math.PI) * 70;
      }
    }
    const look = JUNKYARD_LOOKS.player;
    if (this.stun > 0) {
      const q = this.stun / T.stunTime;
      JailJunkyardGame.prototype._person.call(this, this.px + (1 - q) * 30, y - Math.sin(q * Math.PI) * 70, { ...look, rot: (1 - q) * Math.PI * 2 });
      return;
    }
    const run = this.time * 15;
    const moving = this.phase === 'run' || this.phase === 'escape' || (this.phase === 'twist' && this.phaseT < 0.5);
    const ctx = this.ctx;
    ctx.save();
    if (this.squash > 0) { ctx.translate(this.px, y); ctx.scale(1.4, 0.3); ctx.translate(-this.px, -y); }
    // Running with one arm reaching out ahead for her.
    const reach = this.phase === 'run' || (this.phase === 'twist' && this.phaseT < 0.8);
    JailJunkyardGame.prototype._person.call(this, this.px, y, {
      ...look, stride: moving ? Math.sin(run) * 18 : 0, rot: moving ? 0.12 : 0,
      armF: reach ? -0.35 + Math.sin(run * 0.5) * 0.08 : (moving ? 0.5 + Math.sin(run) : 1.2), armLen: reach ? 36 : 30,
      armB: moving ? 1.2 - Math.sin(run) * 1.0 : 1.8,
    });
    ctx.restore();
  }

  // The dream version: glowing, flowing, reaching back.
  _angel(x, y, s, t, alpha) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y); ctx.scale(s, s);
    ctx.globalAlpha = alpha;
    const aura = ctx.createRadialGradient(0, -90, 6, 0, -90, 190);
    aura.addColorStop(0, 'rgba(255,250,235,0.85)'); aura.addColorStop(0.35, 'rgba(255,215,225,0.35)'); aura.addColorStop(1, 'rgba(255,210,230,0)');
    ctx.fillStyle = aura; ctx.beginPath(); ctx.arc(0, -90, 190, 0, Math.PI * 2); ctx.fill();
    const st = Math.sin(t * 5);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // Legs.
    ctx.strokeStyle = '#fff1e6'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(0, -60); ctx.lineTo(st * 16, -2); ctx.moveTo(0, -60); ctx.lineTo(-st * 16, -4); ctx.stroke();
    // Hair streaming back.
    ctx.strokeStyle = 'rgba(240,200,140,0.95)'; ctx.lineWidth = 5;
    for (let i = 0; i < 8; i++) {
      const w = Math.sin(t * 4 + i * 0.7) * 10;
      ctx.beginPath(); ctx.moveTo(2, -128 + i * 2);
      ctx.bezierCurveTo(-30, -130 + i * 3 + w, -60, -110 + i * 4 - w, -95 - i * 4, -100 + i * 6 + w);
      ctx.stroke();
    }
    // Flowing dress.
    const wave = Math.sin(t * 4) * 12;
    ctx.fillStyle = 'rgba(255,252,248,0.95)';
    ctx.beginPath();
    ctx.moveTo(-8, -108); ctx.lineTo(10, -108); ctx.lineTo(18, -56);
    ctx.quadraticCurveTo(-10, -40 + wave * 0.3, -70 - wave, -48 + wave);
    ctx.quadraticCurveTo(-40, -70, -12, -76);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,220,230,0.7)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(4, -70); ctx.quadraticCurveTo(-24, -54, -60 - wave, -50 + wave); ctx.stroke();
    // Arms: one reaching back toward you.
    ctx.strokeStyle = '#fff1e6'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(0, -104); ctx.quadraticCurveTo(-26, -100, -50, -96 + Math.sin(t * 2) * 4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(4, -104); ctx.lineTo(20, -84 + st * 6); ctx.stroke();
    // Head, glowing, turned away.
    ctx.fillStyle = '#fff6ec'; ctx.beginPath(); ctx.arc(4, -122, 11, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(240,200,140,0.95)'; ctx.beginPath(); ctx.arc(1, -124, 11.5, Math.PI * 0.5, Math.PI * 1.6); ctx.fill();
    ctx.restore();
    // Sparkle trail.
    for (let i = 0; i < 8; i++) {
      const p = (t * 0.8 + i / 8) % 1;
      ctx.globalAlpha = alpha * (1 - p);
      ctx.fillStyle = i % 2 ? '#fff6c8' : '#ffd0e0';
      const sxp = x - 30 * s - p * 160 * s, syp = y - (60 + Math.sin(i * 2.3 + t) * 40) * s;
      ctx.beginPath(); ctx.arc(sxp, syp, (3 - p * 2) * s + 1, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  _drawCaroline() {
    const T = TROLLEY_TUNING, t = this.time;
    if (this.phase === 'run' || this.phase === 'intro') {
      const x = this.px + this._carD();
      const hover = Math.sin(t * 2) * 6;
      this._angel(x, this._pathY(x) - 4 + hover, 1.15, t, 1);
      return;
    }
    if (this.phase === 'twist') {
      const tt = this.phaseT, x0 = this.twist.cx;
      const y0 = this._pathY(x0);
      if (tt < 1.6) {
        // She slows, turns, and the dream drains out of her.
        const m = jtSmooth((tt - 0.6) / 0.9);
        if (m < 1) this._angel(x0, y0, 1.15, t, 1 - m);
        if (m > 0) { this.ctx.globalAlpha = m; this._caroline(x0, y0, 0.8, t, { face: -1, mouth: m }); this.ctx.globalAlpha = 1; }
        return;
      }
      const grow = jtSmooth((tt - 1.6) / 0.9);
      const G = this._giantScale();
      const sc = jyLerp(0.8, G, grow);
      const leap = jailClamp((tt - 2.1) / 0.5, 0, 1);
      const landX = this.tx - 80;
      const x = jyLerp(x0, landX, leap);
      const y = jyLerp(y0, T.groundY, leap) - Math.sin(leap * Math.PI) * 300;
      this._caroline(x, y, sc, t, { face: -1, mouth: 1, giant: true });
      return;
    }
    const G = this._giantScale();
    const bob = Math.abs(Math.sin(t * 4)) * 24;
    this._caroline(this.px - 520 - 40 * Math.sin(t * 0.7), T.groundY - bob, G, t, { face: 1, mouth: 0.6 + 0.4 * Math.sin(t * 6), giant: true, run: true });
  }

  _giantScale() {
    const top = -(this.midY / this.z) * 0.75;
    return Math.min(6, (TROLLEY_TUNING.groundY - top) / 230) * (1 + Math.min(0.2, this.donated / 50000));
  }

  _drawStomps() {
    const ctx = this.ctx, T = TROLLEY_TUNING;
    this.stomps.forEach(s => {
      const y = s.side * T.B;
      if (!s.slammed) {
        const p = s.t / T.stompWarn;
        ctx.fillStyle = `rgba(255,30,30,${0.3 + 0.35 * p + 0.15 * Math.sin(this.time * 30)})`;
        ctx.beginPath(); ctx.ellipse(s.x, y, 120, 20, 0, 0, Math.PI * 2); ctx.fill();
        this._foot(s.x, y - 20 - (1 - p) * 700, 1.6);
      } else {
        const up = (s.t - T.stompWarn) / 0.6;
        this._foot(s.x, y - 8 - up * up * 800, 1.6);
      }
    });
  }

  _drawDebris() {
    const ctx = this.ctx;
    ctx.fillStyle = '#c4141a';
    this.gore.forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 1.4, 0, Math.PI * 2); ctx.fill(); });
    this.debris.forEach(d => {
      ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.rot); ctx.scale(1.5, 1.5);
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
  }

  _drawMotes() {
    const ctx = this.ctx, d = this.dream;
    if (d <= 0) return;
    this.motes.forEach((m, i) => {
      const x = m.x * this.VW, y = m.y * this.VH;
      ctx.globalAlpha = d * (0.4 + 0.4 * Math.sin(this.time * 2 + m.ph));
      if (m.petal) {
        ctx.save(); ctx.translate(x, y); ctx.rotate(this.time + m.ph);
        ctx.fillStyle = '#ffc0d8'; ctx.beginPath(); ctx.ellipse(0, 0, 5, 2.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      } else {
        ctx.fillStyle = '#fff8e0'; ctx.beginPath(); ctx.arc(x, y, m.r, 0, Math.PI * 2); ctx.fill();
      }
    });
    ctx.globalAlpha = 1;
  }

  // The two cards: DO NOTHING (top branch) / PULL THE LEVER (bottom branch).
  _drawChoice(f) {
    const ctx = this.ctx, VW = this.VW, VH = this.VH;
    const k = 1 - jailClamp((f.x0 - this.px) / TROLLEY_TUNING.decideDist, 0, 1);
    const ease = jtSmooth(Math.min(1, k * 4));
    const cards = [
      { side: -1, head: 'DO NOTHING', y: VH * 0.07, g: f.groups[0] },
      { side: 1, head: 'PULL THE LEVER', y: VH * 0.74, g: f.groups[1] },
    ];
    const w = Math.min(VW - 28, 460), h = VH * 0.19;
    cards.forEach(c => {
      const mine = f.choice === c.side;
      const x = (VW - w) / 2;
      const yy = c.y + (1 - ease) * (c.side < 0 ? -h : h);
      // Leader line to the victims on that branch.
      const gx = this.sx(c.g.x + c.g.w / 2), gy = this.sy(this._branchY(f, c.g.x + c.g.w / 2, c.side)) - 30;
      ctx.globalAlpha = ease;
      ctx.strokeStyle = mine ? '#ff5a5a' : 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2.5; ctx.setLineDash([6, 6]);
      ctx.beginPath(); ctx.moveTo(VW / 2, c.side < 0 ? yy + h : yy); ctx.lineTo(jailClamp(gx, 20, VW - 20), gy); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = mine ? 'rgba(200,30,40,0.92)' : 'rgba(20,14,30,0.82)';
      jailRoundRectPath(ctx, x, yy, w, h, 14); ctx.fill();
      ctx.strokeStyle = mine ? '#ffffff' : 'rgba(255,255,255,0.35)'; ctx.lineWidth = mine ? 4 : 2; ctx.stroke();
      this._label(c.head, VW / 2, yy + h * 0.2, 22, mine ? '#ffffff' : '#c8c0d8');
      this._label(c.g.name, VW / 2, yy + h * 0.5, Math.min(40, 40 * (w - 30) / Math.max(1, this._measure(c.g.name, 40))), '#ffffff');
      const good = c.g.cost == null || c.g.cost <= 0;
      this._label(c.g.costLabel, VW / 2, yy + h * 0.78, 22, mine ? '#ffe0a0' : (good ? '#9af0a8' : '#ff9a8a'));
      this._label(mine ? 'TROLLEY GOES HERE' : 'TAP', x + w - 12, yy + 16, 15, mine ? '#ffffff' : '#f4c542', 'right');
      ctx.globalAlpha = 1;
    });
  }

  _measure(text, size) { this.ctx.font = `bold ${size}px VT323, monospace`; return this.ctx.measureText(text).width; }

  _drawTrolleyWarning() {
    const ctx = this.ctx, gap = this.px - this.tx;
    const danger = jailClamp(1 - (gap - 60) / 260, 0, 1);
    if (danger <= 0) return;
    const grad = ctx.createLinearGradient(0, 0, 90, 0);
    grad.addColorStop(0, `rgba(255,30,30,${0.55 * danger * (0.7 + 0.3 * Math.sin(this.time * 14))})`); grad.addColorStop(1, 'rgba(255,30,30,0)');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, 90, this.VH);
  }

  _drawHud() {
    if (this.phase === 'intro' || this.phase === 'results') return;
    if (!this.deciding) {
      this._label(`UTILS ${jtFmt(this.utils)}`, 14, 28, 26, '#f4c542', 'left');
      if (this.donated) this._label(`DONATED TO HER $${jtFmt(this.donated)}`, 14, 54, 17, '#9af0a8', 'left');
    }
    if (this.phase === 'run' && !this.deciding && this.px < 900) this._label('CATCH HER', this.VW / 2, this.VH * 0.2, 34, '#ffffff');
    if (this.phase === 'escape') {
      const left = Math.max(0, TROLLEY_TUNING.escapeTime - this.escape.t);
      this._label(`ESCAPE ${Math.ceil(left)}`, this.VW - 14, 30, 30, '#ff6a6a', 'right');
      if (this.escape.t < 3.5) {
        this._label('DODGE HER FEET', this.VW / 2, this.VH * 0.14, 32, '#ffffff');
        this._label(this.touchUI ? 'TAP TOP / BOTTOM TO SWITCH TRACKS' : 'UP / DOWN TO SWITCH TRACKS', this.VW / 2, this.VH * 0.14 + 32, 18, '#f4c542');
      }
    }
  }

  _drawIntro() {
    this._overlay(0.45);
    const y = this.VH * 0.14, cx = this.VW / 2;
    this._label('TROLLEY PROBLEMS', cx, y, 54, '#ffffff');
    this._label('CATCH HER', cx, y + 52, 32, '#ffd0e0');
    this._label('AT EACH FORK, TAP THE TRACK YOU PICK', cx, y + 108, 21, '#ffffff');
    this._label('THE TROLLEY BEHIND YOU FOLLOWS YOUR TRACK', cx, y + 136, 21, '#ffffff');
    this._label('KILLS SLOW IT DOWN · AN EMPTY TRACK LETS IT CATCH YOU', cx, y + 168, 16, '#ff9a8a');
    this._label('SCORED IN UTILS', cx, y + 194, 18, '#9af0a8');
    if (this.phaseT > 0.5) this._label('TAP TO START', cx, this.VH * 0.66, 30, '#ffffff');
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
      [`DONATED TO HER $${jtFmt(this.donated)}`, '#c2c784'],
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

  // ------------------------------------------------------------ kept pieces

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

  _nominal(g) {
    if (g.kind === 'coinflip') return -0.02 * Math.max(1, Math.abs(this.utils)) - 1e-6;
    return g.cost;
  }

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

  _overlay(a) { this.ctx.fillStyle = `rgba(8,6,12,${a})`; this.ctx.fillRect(0, 0, this.VW, this.VH); }

  _summary() {
    const optFrac = this.picks ? this.optimal / this.picks : 0;
    const q = 0.55 * optFrac + 0.25 * (1 - Math.min(1, this.trolleyHits / 4)) + 0.2 * (1 - Math.min(1, this.squashes / 4));
    return { optFrac, gain: Math.round(45 * jailClamp(q, 0, 1)) };
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
