/**
 * THE JAIL — LUIGI: JUNKYARD OLYMPICS
 * =====================================
 *
 * Replaces the old bench press. Same contract as jail-minigames.js:
 *
 *   new JailJunkyardGame(host, charId, onDone)
 *
 * A Hyrox-style circuit: exercise stations alternate with fight walks.
 * Each station's score picks the weapon you carry into the next fight
 * (fists / toothbrush shank / samurai sword / gun). Weapon points add up
 * across stations, so the weapon only gets better; a perfect station is the gun.
 *
 *   JUMP ROPE  double dutch, tap to jump, ropes speed up and vary
 *   FIGHT      run through the swarm, tap to attack, they swing back
 *   BOX JUMP   marker sweeps the power meter, swipe up to jump —
 *              too low shins the box, too high overshoots it
 *   FIGHT      bigger swarm, chasers, brutes
 *   FINISH
 *
 * All text here is functional UI labels (station names, controls,
 * weapon names, counts) — no authored dialogue.
 */

const JUNKYARD_TUNING = {
  rope: {
    passes: 24, leadIn: 2.2,
    firstGap: 1.15, lastGap: 0.56, minGap: 0.5, wobble: 0.26,
    airTime: 0.42, peak: 62, clearH: 13, buffer: 0.14, points: 40,
  },
  box: {
    reps: 8,
    heightStart: 50, heightEnd: 150,
    bandStart: 0.16, bandEnd: 0.05,        // half-width of the landing band (meter is 0..1)
    speedStart: 0.42, speedEnd: 0.95, speedJitter: 0.25, // meter sweeps per second
    perfectFrac: 0.3, points: 80, accuracyPoints: 40,
  },
  fight: [
    { enemies: 22, length: 4400, groupChance: 0.4, chaseEvery: 2.4, chasePair: 0.45, brutes: 0.12 },
    { enemies: 30, length: 5000, groupChance: 0.55, chaseEvery: 1.6, chasePair: 0.65, brutes: 0.2 },
  ],
  runSpeed: 300, chaseSpeed: 390, enemyReach: 72, windup: 0.3, lunge: 200, bruteHP: 2, recover: 0.55,
  playerHP: 5, invuln: 0.6, hitPenalty: 20, downPenalty: 100, downTime: 1.1,
  koPoints: 50, comboPoints: 10, comboWindow: 1.3,
  // Weapon points add up across stations (a station is worth up to 100);
  // a perfect station always earns the gun.
  tiers: { gun: 150, sword: 80, shank: 35 },
};

const JUNKYARD_WEAPONS = {
  fists: { name: 'FISTS',            range: 92,  cooldown: 0.11, hits: 2, multi: false },
  shank: { name: 'TOOTHBRUSH SHANK', range: 98,  cooldown: 0.14, hits: 1, multi: false },
  sword: { name: 'SAMURAI SWORD',    range: 180, cooldown: 0.22, hits: 1, multi: true },
  gun:   { name: 'GUN',              range: 0,   cooldown: 0.12, hits: 1, multi: false, ranged: true },
};
const JUNKYARD_TIER_ORDER = ['fists', 'shank', 'sword', 'gun'];
const JUNKYARD_TIER_LABELS = { fists: '0+', shank: '35+', sword: '80+', gun: '150+' };

const JUNKYARD_LOOKS = {
  player: { shirt: '#f2f2f2', pants: '#4a5060', skin: '#e8b48a', hair: '#3a2a1e', headband: '#ff3d9a' },
  inmate: { shirt: '#e8742a', sleeve: '#e8742a', pants: '#d8661f', hair: '#1e1a16' },
  skins: ['#e8b48a', '#c98e62', '#8d5a3b', '#5e3b26', '#f0c9a0'],
};

function jyHash(k) { const s = Math.sin(k * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
function jyLerp(a, b, t) { return a + (b - a) * t; }

class JailJunkyardGame {
  constructor(host, charId, onDone) {
    this.host = host;
    this.charId = charId;
    this.onDone = onDone;
    this.char = JAIL_CHARACTERS.find(c => c.id === charId);
    this.canvas = host.canvas;
    this.ctx = host.ctx;
    this.luigi = { shirt: this.char.color, pants: '#2d3a4a', skin: '#ecbc94', hair: '#24160c', brows: true };
    this.particles = new JailParticles();
    this.floaters = new JailFloaters();
    this.gore = [];
    this.splats = [];
    this.touchUI = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

    this.score = 0;
    this.weapon = 'fists';
    this.weaponPts = 0;
    this.results = {};
    this.fightStats = [];
    this.shake = 0;
    this.flash = 0;
    this.finished = false;

    this.seq = ['rope', 'weapon', 'fight0', 'box', 'weapon', 'fight1', 'finish'];
    this.step = -1;
    this._fit();
    this._next();

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
    // The host's resize handler resets the canvas to CSS px; re-upscale.
    if (this.canvas.width !== cw || this.canvas.height !== ch) { this.canvas.width = cw; this.canvas.height = ch; }
    this.dpr = dpr;
    this.u = Math.min(W / 420, H / 760);
    this.VW = W / this.u;
    this.VH = H / this.u;
    this.groundY = this.VH * 0.74;
    this.cx = this.VW / 2;
  }

  _bindInput() {
    this._touches = {};
    this._touchStartH = (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        this._touches[t.identifier] = { x: t.clientX, y: t.clientY, swiped: false, phase: this.phase };
        if (this.phase !== 'box') this._press();
      }
    };
    this._touchMoveH = (e) => {
      e.preventDefault();
      if (this.phase !== 'box') return;
      for (const t of e.changedTouches) {
        const s = this._touches[t.identifier];
        if (s && s.phase === 'box' && !s.swiped && s.y - t.clientY > 22) { s.swiped = true; this._press(); }
      }
    };
    this._touchEndH = (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        const s = this._touches[t.identifier];
        delete this._touches[t.identifier];
        // A plain tap still works in the box jump, so nobody gets stuck.
        if (s && !s.swiped && this.phase === 'box' && s.phase === 'box' && Math.hypot(t.clientX - s.x, t.clientY - s.y) < 16) this._press();
      }
    };
    this._pointerH = (e) => { if (e.pointerType === 'touch') return; e.preventDefault(); this._press(); };
    this._keyH = (e) => {
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'Enter') { e.preventDefault(); if (!e.repeat) this._press(); }
    };
    this.canvas.addEventListener('touchstart', this._touchStartH, { passive: false });
    this.canvas.addEventListener('touchmove', this._touchMoveH, { passive: false });
    this.canvas.addEventListener('touchend', this._touchEndH, { passive: false });
    this.canvas.addEventListener('touchcancel', this._touchEndH, { passive: false });
    this.canvas.addEventListener('pointerdown', this._pointerH);
    window.addEventListener('keydown', this._keyH);
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

  _press() {
    if (this.finished) return;
    const p = this.phase;
    if (p === 'intro' || p === 'weapon' || p === 'finish') {
      if (this.phaseT < 0.6) return;
      if (p === 'intro') this._beginStation();
      else if (p === 'weapon') this._next();
      else this._end();
    } else if (p === 'rope') this._ropeJump();
    else if (p === 'box') this._boxJump();
    else if (p === 'fight') this._attack();
  }

  _next() {
    this.step++;
    const s = this.seq[this.step];
    this.phaseT = 0;
    if (s === 'rope') { this.station = 'rope'; this._setupRope(); this.phase = 'intro'; }
    else if (s === 'box') { this.station = 'box'; this._setupBox(); this.phase = 'intro'; }
    else if (s === 'weapon') this.phase = 'weapon';
    else if (s === 'fight0' || s === 'fight1') { this._setupFight(s === 'fight0' ? 0 : 1); this.phase = 'fight'; }
    else if (s === 'finish') this.phase = 'finish';
  }

  _beginStation() { this.phase = this.station; this.phaseT = 0; }

  _finishStation(frac, label) {
    const T = JUNKYARD_TUNING.tiers;
    const earned = Math.round(frac * 100);
    this.weaponPts += earned;
    const pts = this.weaponPts;
    const tier = frac >= 1 ? 'gun' : pts >= T.gun ? 'gun' : pts >= T.sword ? 'sword' : pts >= T.shank ? 'shank' : 'fists';
    const order = JUNKYARD_TIER_ORDER;
    this.weapon = order[Math.max(order.indexOf(tier), order.indexOf(this.weapon))];
    this.results[this.station] = { frac, label, weapon: this.weapon, earned };
    this._next();
  }

  _addScore(n, x, y, color) {
    this.score = Math.max(0, this.score + n);
    if (x != null) this.floaters.add(x, y, (n > 0 ? '+' : '') + n, color || (n > 0 ? '#f4c542' : '#ff5a4a'), { size: 22, life: 36 });
  }

  _update(dt) {
    this.phaseT += dt;
    this.shake = Math.max(0, this.shake - dt * 30);
    this.flash = Math.max(0, this.flash - dt * 3);
    if (this.phase === 'rope') this._updateRope(dt);
    else if (this.phase === 'box') this._updateBox(dt);
    else if (this.phase === 'fight') this._updateFight(dt);
    else if (this.phase === 'intro' && this.station === 'rope') this.rope.idle += dt;
    this.particles.update();
    this.floaters.update();
    this._updateGore(dt);
  }

  // ------------------------------------------------------------ JUMP ROPE

  _setupRope() {
    const T = JUNKYARD_TUNING.rope;
    const passes = [];
    let t = T.leadIn;
    for (let i = 0; i < T.passes; i++) {
      passes.push(t);
      const f = i / (T.passes - 1);
      // Trend faster, with speed swings so it never settles into one tempo.
      const swing = Math.sin(i * 0.9 + 0.6) * 0.7 + Math.sin(i * 2.3) * 0.3;
      t += Math.max(T.minGap, jyLerp(T.firstGap, T.lastGap, f) * (1 + T.wobble * swing));
    }
    const g = 2 * T.peak / ((T.airTime / 2) * (T.airTime / 2));
    this.rope = {
      t: 0, idle: 0, passes, next: 0, cleared: 0, streak: 0,
      h: 0, vy: 0, air: false, buffer: -1, stumble: 0,
      gravity: g, v0: g * T.airTime / 2,
      lists: [passes.filter((_, i) => i % 2 === 0), passes.filter((_, i) => i % 2 === 1)],
    };
  }

  _ropePhase(r, t) {
    const P = this.rope.lists[r];
    if (P.length < 2) return 0;
    if (t < P[0]) { const g = P[1] - P[0]; return Math.PI * 2 * (1 - (P[0] - t) / g); }
    for (let k = 0; k < P.length - 1; k++) {
      if (t < P[k + 1]) return Math.PI * 2 * (t - P[k]) / (P[k + 1] - P[k]);
    }
    const g = P[P.length - 1] - P[P.length - 2];
    return Math.PI * 2 * ((t - P[P.length - 1]) / g);
  }

  _ropeJump() {
    const r = this.rope;
    if (r.air) { r.buffer = r.t; return; }
    r.air = true; r.vy = r.v0; r.buffer = -1;
  }

  _updateRope(dt) {
    const T = JUNKYARD_TUNING.rope, r = this.rope;
    r.t += dt;
    r.stumble = Math.max(0, r.stumble - dt);
    if (r.air) {
      r.vy -= r.gravity * dt;
      r.h += r.vy * dt;
      if (r.h <= 0) {
        r.h = 0; r.air = false;
        if (r.buffer >= 0 && r.t - r.buffer < T.buffer) this._ropeJump();
        r.buffer = -1;
        this.particles.burst(this.cx * this.u, this.groundY * this.u, '#8a7560', 4, { speed: 1.2, life: 14 });
      }
    }
    while (r.next < r.passes.length && r.t >= r.passes[r.next]) {
      const px = this.cx, py = this.groundY;
      if (r.h > T.clearH) {
        r.cleared++; r.streak++;
        this._addScore(T.points, px + 40, py - 150 - r.h);
        if (r.streak > 0 && r.streak % 5 === 0) this.floaters.add(px, py - 210, `${r.streak} STREAK`, '#7ec89a', { size: 30, life: 46 });
      } else {
        r.streak = 0; r.stumble = 0.35;
        this.flash = 0.6; this.shake = 6;
        this.floaters.add(px, py - 170, 'TRIPPED', '#ff5a4a', { size: 30, life: 40 });
      }
      this.particles.burst(px * this.u, py * this.u, '#b49a7a', 10, { speed: 2.2, life: 20, upBias: 1 });
      r.next++;
    }
    if (r.next >= r.passes.length && r.t > r.passes[r.passes.length - 1] + 0.9) {
      this._finishStation(r.cleared / r.passes.length, `${r.cleared}/${r.passes.length} CLEARED`);
    }
  }

  _drawRopeStation() {
    const ctx = this.ctx, r = this.rope, g = this.groundY, cx = this.cx;
    const span = Math.min(150, this.VW * 0.36);
    const handY = g - 74, R = 74;
    const t = this.phase === 'rope' ? r.t : 0;
    const turnerLooks = [this.luigi, { ...JUNKYARD_LOOKS.inmate, skin: JUNKYARD_LOOKS.skins[2] }];
    const ropes = [0, 1].map(i => {
      const ph = this.phase === 'rope' ? this._ropePhase(i, t) : (i ? Math.PI * 0.8 : Math.PI * 1.3);
      return { ph, z: (i ? -1 : 1) * Math.sin(ph), color: i ? '#f2f2f2' : '#ff3d9a' };
    });
    const drawRope = (rp) => {
      const midY = handY + R * Math.cos(rp.ph);
      const cy = 2 * midY - handY;
      ctx.strokeStyle = rp.color;
      ctx.globalAlpha = 0.5 + 0.5 * Math.max(0, rp.z);
      ctx.lineWidth = 4 + 2 * rp.z;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(cx - span, handY); ctx.quadraticCurveTo(cx, cy, cx + span, handY); ctx.stroke();
      ctx.globalAlpha = 1;
    };
    // Turners, facing in.
    [-1, 1].forEach((side, i) => {
      const ph = ropes[i].ph;
      const arm = Math.atan2(handY - (g - 86) + Math.sin(ph) * 4, span - 24) ;
      this._person(cx + side * (span + 24), g, { ...turnerLooks[i], face: -side, armF: arm, armB: arm + 0.2 });
    });
    ropes.filter(rp => rp.z < 0).forEach(drawRope);
    const stumble = r.stumble > 0 ? Math.sin(r.stumble * 40) * 0.15 : 0;
    this._person(cx, g - r.h, {
      ...JUNKYARD_LOOKS.player, tuck: Math.min(1, r.h / 30), rot: stumble,
      armF: r.air ? -0.4 : 1.0, armB: r.air ? -0.2 : 1.9,
    });
    ropes.filter(rp => rp.z >= 0).forEach(drawRope);
    if (this.phase === 'rope') {
      this._hudCenter(`${r.cleared}/${r.passes.length}`, this.groundY + 70, 30, '#f2f2f2');
      if (r.t < 3.5) this._hudCenter(this.touchUI ? 'TAP TO JUMP' : 'TAP / SPACE TO JUMP', this.groundY + 110, 24, '#f4c542');
    }
  }

  // ------------------------------------------------------------ BOX JUMP

  _setupBox() {
    const T = JUNKYARD_TUNING.box;
    const reps = [];
    for (let i = 0; i < T.reps; i++) {
      const f = i / (T.reps - 1);
      const h = jyLerp(T.heightStart, T.heightEnd, f);
      const hw = jyLerp(T.bandStart, T.bandEnd, f);
      const c = jaiClampBand(0.3 + 0.42 * f + (jyHash(i + 7) - 0.5) * 0.16, hw);
      const speed = jyLerp(T.speedStart, T.speedEnd, f) * (1 - T.speedJitter / 2 + T.speedJitter * jyHash(i + 31));
      // Junk stack: tires, crates, cinder blocks piled to height.
      const items = [];
      let rem = h, k = 0;
      while (rem > 0) {
        const kind = ['tire', 'crate', 'cinder'][Math.floor(jyHash(i * 13 + k) * 3)];
        const ih = Math.min(rem, kind === 'crate' ? 40 : kind === 'tire' ? 24 : 20);
        items.push({ kind, h: ih, w: 84 + jyHash(i * 5 + k) * 18 });
        rem -= ih; k++;
      }
      reps.push({ h, hw, c, speed, items });
    }
    this.box = { reps, i: 0, sub: 'aim', aimT: 0, ph: Math.PI * jyHash(3), m: 0, t: 0, outcome: null, landed: 0, perfects: 0, acc: 0 };
  }

  _boxGeom() {
    return { x0: this.cx - 95, bx: this.cx + 45, mx: this.cx - 172, mTop: this.groundY - 330, mH: 290 };
  }

  _boxJump() {
    const b = this.box;
    if (b.sub !== 'aim' || b.aimT < 0.25) return;
    const rep = b.reps[b.i];
    const off = b.m - rep.c;
    b.outcome = Math.abs(off) <= rep.hw ? 'land' : off < 0 ? 'short' : 'over';
    b.off = off; b.power = b.m;
    b.sub = 'jump'; b.t = 0;
  }

  _updateBox(dt) {
    const T = JUNKYARD_TUNING.box, b = this.box, rep = b.reps[b.i];
    if (b.sub === 'aim') {
      b.aimT += dt;
      b.ph += Math.PI * 2 * rep.speed * dt;
      b.m = 0.5 - 0.5 * Math.cos(b.ph);
      return;
    }
    b.t += dt;
    const G = this._boxGeom();
    if (b.sub === 'jump' && b.t >= 0.7) {
      b.sub = 'result'; b.t = 0;
      if (b.outcome === 'land') {
        const acc = 1 - Math.abs(b.off) / rep.hw;
        const perfect = Math.abs(b.off) <= rep.hw * T.perfectFrac;
        b.landed++; b.acc += acc;
        if (perfect) b.perfects++;
        this._addScore(Math.round(T.points + T.accuracyPoints * acc), G.bx, this.groundY - rep.h - 150);
        this.floaters.add(G.bx, this.groundY - rep.h - 190, perfect ? 'PERFECT' : 'STUCK IT', perfect ? '#f4c542' : '#7ec89a', { size: 34, life: 50 });
        this.particles.burst(G.bx * this.u, (this.groundY - rep.h) * this.u, '#f4c542', perfect ? 22 : 10, { speed: 3, life: 30, upBias: 1.2 });
      } else {
        this.shake = 8; this.flash = 0.5;
        this.floaters.add(G.bx, this.groundY - rep.h - 170, b.outcome === 'short' ? 'TOO LOW' : 'TOO FAR', '#ff5a4a', { size: 34, life: 50 });
      }
    }
    if (b.sub === 'result' && b.t >= 1.0) {
      b.i++;
      if (b.i >= b.reps.length) {
        this._finishStation(b.landed / b.reps.length, `${b.landed}/${b.reps.length} LANDED`);
        return;
      }
      b.sub = 'aim'; b.t = 0; b.aimT = 0; b.ph = Math.PI * jyHash(b.i + 3) * 2;
    }
  }

  _boxPlayerPose() {
    const b = this.box, rep = b.reps[Math.min(b.i, b.reps.length - 1)], g = this.groundY, G = this._boxGeom();
    if (this.phase !== 'box' || b.sub === 'aim') {
      const crouch = this.phase === 'box' ? 0.25 + 0.15 * Math.sin(this.phaseT * 6) : 0;
      return { x: G.x0, y: g, rot: 0, tuck: crouch, armF: 1.3, armB: 2.1 };
    }
    let x1, y1, arc;
    if (b.outcome === 'land') { x1 = G.bx; y1 = g - rep.h; arc = 60 + rep.h * 0.4; }
    else if (b.outcome === 'short') { x1 = G.bx - 58; y1 = g - rep.h * 0.55; arc = rep.h * 0.3; }
    else { x1 = Math.min(this.VW - 30, G.bx + 120 + 260 * (b.off - rep.hw)); y1 = g; arc = rep.h + 80; }
    if (b.sub === 'jump') {
      const p = Math.min(1, b.t / 0.7);
      const y0 = g;
      return {
        x: jyLerp(G.x0, x1, p), y: jyLerp(y0, y1, p) - arc * 4 * p * (1 - p), rot: 0, tuck: Math.sin(p * Math.PI),
        armF: -1.3, armB: -1.0,
      };
    }
    const q = Math.min(1, b.t / 0.25);
    if (b.outcome === 'land') return { x: x1, y: y1, rot: 0, tuck: 0, armF: -1.4, armB: -1.7 };
    if (b.outcome === 'short') return { x: x1 - 20 * q, y: jyLerp(y1, g, q), rot: -Math.PI / 2 * q, tuck: 0, armF: -2, armB: -2.4 };
    return { x: x1, y: g, rot: Math.PI / 2 * q, tuck: 0, armF: 0.2, armB: 0.4 };
  }

  _drawBoxStation() {
    const ctx = this.ctx, b = this.box, g = this.groundY, G = this._boxGeom();
    const rep = b.reps[Math.min(b.i, b.reps.length - 1)];
    // Luigi spotting from behind the box.
    this._person(G.bx + 100, g - 6, { ...this.luigi, face: -1, armF: 1.4, armB: 1.7, alpha: 0.85 });
    // Junk stack.
    let y = g;
    rep.items.forEach(it => {
      const x = G.bx - it.w / 2;
      if (it.kind === 'tire') {
        ctx.fillStyle = '#1d1b1a'; jailRoundRectPath(ctx, x, y - it.h, it.w, it.h, it.h / 2); ctx.fill();
        ctx.strokeStyle = '#3a3634'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x + 10, y - it.h / 2); ctx.lineTo(x + it.w - 10, y - it.h / 2); ctx.stroke();
      } else if (it.kind === 'crate') {
        ctx.fillStyle = '#9a6a3a'; ctx.fillRect(x, y - it.h, it.w, it.h);
        ctx.strokeStyle = '#6e4a26'; ctx.lineWidth = 3;
        ctx.strokeRect(x + 1.5, y - it.h + 1.5, it.w - 3, it.h - 3);
        ctx.beginPath(); ctx.moveTo(x, y - it.h); ctx.lineTo(x + it.w, y); ctx.stroke();
      } else {
        ctx.fillStyle = '#8c8c88'; ctx.fillRect(x, y - it.h, it.w, it.h);
        ctx.fillStyle = '#5a5a56';
        ctx.fillRect(x + it.w * 0.18, y - it.h * 0.75, it.w * 0.22, it.h * 0.5);
        ctx.fillRect(x + it.w * 0.6, y - it.h * 0.75, it.w * 0.22, it.h * 0.5);
      }
      y -= it.h;
    });
    const pose = this._boxPlayerPose();
    this._person(pose.x, pose.y, { ...JUNKYARD_LOOKS.player, ...pose });

    if (this.phase !== 'box') return;
    // Power meter.
    const { mx, mTop, mH } = G;
    const yOf = (v) => mTop + mH * (1 - v);
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; jailRoundRectPath(ctx, mx - 22, mTop - 8, 44, mH + 16, 10); ctx.fill();
    ctx.fillStyle = 'rgba(224,60,50,0.35)';
    ctx.fillRect(mx - 14, mTop, 28, yOf(rep.c + rep.hw) - mTop);
    ctx.fillRect(mx - 14, yOf(rep.c - rep.hw), 28, mTop + mH - yOf(rep.c - rep.hw));
    ctx.fillStyle = '#2fd160';
    ctx.shadowColor = '#2fd160'; ctx.shadowBlur = 14;
    ctx.fillRect(mx - 14, yOf(rep.c + rep.hw), 28, yOf(rep.c - rep.hw) - yOf(rep.c + rep.hw));
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(mx - 14, yOf(rep.c) - 1, 28, 2);
    const mv = b.sub === 'aim' ? b.m : b.power;
    const my = yOf(mv);
    ctx.fillStyle = '#fff';
    ctx.fillRect(mx - 20, my - 3, 40, 6);
    ctx.beginPath(); ctx.moveTo(mx - 30, my - 9); ctx.lineTo(mx - 20, my); ctx.lineTo(mx - 30, my + 9); ctx.fill();
    ctx.font = 'bold 16px VT323, monospace'; ctx.textAlign = 'center'; ctx.fillStyle = '#ff8a7a';
    ctx.fillText('TOO FAR', mx, mTop - 16);
    ctx.fillText('TOO LOW', mx, mTop + mH + 26);

    this._hudCenter(`REP ${Math.min(b.i + 1, b.reps.length)}/${b.reps.length}`, g + 70, 30, '#f2f2f2');
    if (b.i < 2 && b.sub === 'aim') this._hudCenter(this.touchUI ? 'SWIPE UP IN THE GREEN' : 'TAP / SPACE IN THE GREEN', g + 110, 24, '#f4c542');
  }

  // ------------------------------------------------------------ FIGHT

  _setupFight(idx) {
    const F = JUNKYARD_TUNING.fight[idx];
    const enemies = [];
    const start = 650, end = F.length - 300;
    const gap = (end - start) / F.enemies;
    let k = 0, x = start;
    while (k < F.enemies) {
      const group = jyHash(idx * 57 + k) < F.groupChance ? Math.min(2 + Math.floor(jyHash(k + 400) * 3), F.enemies - k) : 1;
      for (let j = 0; j < group; j++, k++) {
        const e = this._makeEnemy(idx * 100 + k, x + j * 44 + jyHash(k) * 40, false);
        if (jyHash(idx * 31 + k + 900) < F.brutes) { e.brute = true; e.hp += this.weapon === 'fists' ? 1 : JUNKYARD_TUNING.bruteHP; e.speed *= 0.8; }
        enemies.push(e);
      }
      x += gap * group;
    }
    this.gore = []; this.splats = [];
    this.fight = {
      idx, px: 0, length: F.length, enemies, run: 0,
      cool: 0, attackT: 0, face: 1, faceT: 0,
      hp: JUNKYARD_TUNING.playerHP, hurt: 0, invuln: 0, down: 0,
      kos: 0, total: enemies.length, hitsTaken: 0, knockdowns: 0,
      combo: 0, comboT: 0, tracer: null, hitstop: 0, done: 0,
      chaseT: F.chaseEvery, spawnId: idx * 1000 + 500,
    };
  }

  _makeEnemy(id, x, chaser) {
    const T = JUNKYARD_TUNING;
    return {
      x, z: -10 + jyHash(id + 50) * 22, hp: JUNKYARD_WEAPONS[this.weapon].hits,
      state: 'approach', t: 0, cool: 0, dir: 1, chaser,
      walk: jyHash(id + 9) * 6, speed: 70 + jyHash(id + 3) * 80,
      rot: 0, pool: 0,
      skin: JUNKYARD_LOOKS.skins[Math.floor(jyHash(id + 17) * JUNKYARD_LOOKS.skins.length)],
      bald: jyHash(id + 23) > 0.6,
    };
  }

  _alive(e) { return e.state === 'approach' || e.state === 'windup' || e.state === 'recover' || e.state === 'stagger'; }

  _attack() {
    const f = this.fight, w = JUNKYARD_WEAPONS[this.weapon];
    if (f.cool > 0 || f.done || f.down > 0) return;
    f.cool = w.cooldown; f.attackT = 0.16;
    const live = f.enemies.filter(e => this._alive(e));
    let cands = w.ranged
      ? live.filter(e => e.x - f.px > -this.VW * 0.35 && e.x - f.px < this.VW * 0.65)
      : live.filter(e => Math.abs(e.x - f.px) < w.range);
    // Whoever is about to hit you gets priority, then nearest.
    const pri = (e) => Math.abs(e.x - f.px) - (e.state === 'windup' ? 60 : 0);
    cands.sort((a, b) => pri(a) - pri(b));
    if (cands.length) { f.face = cands[0].x >= f.px ? 1 : -1; f.faceT = 0.3; }
    const targets = w.multi ? cands.filter(e => (e.x >= f.px ? 1 : -1) === f.face) : cands.slice(0, 1);
    if (w.ranged) {
      const tg = targets[0];
      f.tracer = { x: tg ? tg.x : f.px + f.face * this.VW, y: tg ? this.groundY + tg.z - 80 : this.groundY - 84, t: 0.07 };
      this.shake = Math.max(this.shake, 3);
    }
    targets.forEach(e => this._hit(e));
  }

  _hit(e) {
    const T = JUNKYARD_TUNING, f = this.fight, g = this.groundY + e.z;
    e.dir = e.x >= f.px ? 1 : -1;
    e.hp--;
    if (e.hp <= 0) {
      e.state = 'dead'; e.t = 0;
      f.kos++; f.hitstop = 0.035;
      f.combo = f.comboT > 0 ? f.combo + 1 : 1; f.comboT = T.comboWindow;
      this.shake = Math.max(this.shake, 7);
      this._blood(e.x, g - 85, 26, 1, e.dir);
      const bonus = f.combo >= 3 ? T.comboPoints * f.combo : 0;
      this._addScore(T.koPoints + bonus, e.x - this._camX() + 10, g - 150);
      if (f.combo >= 3) this.floaters.add(this.VW / 2, this.VH * 0.3, `${f.combo}X COMBO`, '#ff3d9a', { size: 40, life: 40 });
    } else {
      e.state = 'stagger'; e.t = 0.22;
      this._blood(e.x, g - 90, 8, 0.6, e.dir);
      this.shake = Math.max(this.shake, 3);
      this.floaters.add(e.x - this._camX(), g - 140, 'POW', '#f2f2f2', { size: 24, life: 22 });
    }
  }

  _playerHit(e) {
    const T = JUNKYARD_TUNING, f = this.fight;
    if (f.invuln > 0 || f.down > 0 || f.done) return;
    f.hp--; f.hitsTaken++;
    f.hurt = 0.3; f.invuln = T.invuln;
    f.combo = 0;
    this.shake = 11; this.flash = 0.55;
    this._blood(f.px, this.groundY - 90, 10, 0.6, e.x >= f.px ? -1 : 1);
    this._addScore(-T.hitPenalty, this.VW * 0.35, this.groundY - 170);
    if (f.hp <= 0) {
      f.down = T.downTime; f.knockdowns++;
      this._addScore(-T.downPenalty, this.VW * 0.35, this.groundY - 210);
      this.floaters.add(this.VW / 2, this.VH * 0.3, 'KNOCKED DOWN', '#ff5a4a', { size: 44, life: 60 });
      // Clear some room so getting up isn't an instant second knockdown.
      f.enemies.forEach(o => {
        if (this._alive(o) && Math.abs(o.x - f.px) < 200) { o.state = 'stagger'; o.t = 0.5; o.dir = o.x >= f.px ? 1 : -1; }
      });
    }
  }

  _blood(x, y, n, power, dir) {
    dir = dir || 1;
    for (let i = 0; i < n; i++) {
      this.gore.push({
        x, y, vx: dir * ((40 + Math.random() * 260) * power - 40), vy: -(60 + Math.random() * 300) * power,
        r: 2 + Math.random() * 3.5, floor: this.groundY - 4 + Math.random() * 18,
      });
    }
  }

  _updateGore(dt) {
    this.gore.forEach(p => {
      p.vy += 900 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.y >= p.floor) { p.dead = true; this.splats.push({ x: p.x, y: p.floor, r: p.r * (1 + Math.random()) }); }
    });
    this.gore = this.gore.filter(p => !p.dead);
    if (this.splats.length > 400) this.splats.splice(0, this.splats.length - 400);
  }

  _camX() { return this.fight.px - this.VW * 0.35; }

  _updateFight(dt) {
    const T = JUNKYARD_TUNING, f = this.fight, F = T.fight[f.idx];
    if (f.tracer) { f.tracer.t -= dt; if (f.tracer.t <= 0) f.tracer = null; }
    if (f.hitstop > 0) { f.hitstop -= dt; return; }
    f.cool -= dt; f.attackT -= dt;
    f.faceT -= dt; if (f.faceT <= 0) f.face = 1;
    f.invuln -= dt; f.hurt = Math.max(0, f.hurt - dt);
    f.comboT -= dt; if (f.comboT <= 0) f.combo = 0;

    if (f.down > 0) {
      f.down -= dt;
      if (f.down <= 0) { f.hp = T.playerHP; f.invuln = 1.2; }
    } else if (f.done) {
      f.done += dt; f.px += T.runSpeed * 0.5 * dt; f.run += dt * 8;
      if (f.done > 1.0) { this._next(); return; }
    } else {
      f.px += T.runSpeed * (f.hurt > 0 ? 0.45 : 1) * dt;
      f.run += dt * 14;
      if (Math.floor(f.run / Math.PI) !== Math.floor((f.run - dt * 14) / Math.PI)) {
        this.particles.burst(this.VW * 0.35 * this.u, this.groundY * this.u, '#8a7560', 3, { speed: 1.4, life: 14 });
      }
      // Chasers come in from behind.
      f.chaseT -= dt;
      if (f.chaseT <= 0) {
        f.chaseT = F.chaseEvery * (0.7 + 0.6 * Math.random());
        const n = Math.random() < F.chasePair ? 2 : 1;
        for (let i = 0; i < n; i++) {
          f.enemies.push(this._makeEnemy(f.spawnId++, f.px - this.VW * 0.35 - 60 - i * 50, true));
          f.total++;
        }
      }
    }

    const wake = this.VW * 0.65 + 80;
    f.enemies.forEach(e => {
      const dx = e.x - f.px;
      e.cool -= dt;
      if (e.state === 'approach') {
        if (dx > wake) return;
        const behind = dx < 0;
        const sp = behind ? T.chaseSpeed * (0.92 + 0.16 * jyHash(e.speed)) : e.speed;
        e.x += (behind ? 1 : -1) * sp * dt;
        e.walk += dt * (behind ? 15 : 9);
        if (Math.abs(dx) < T.enemyReach && e.cool <= 0 && f.down <= 0 && !f.done) { e.state = 'windup'; e.t = T.windup; }
        if (dx < -this.VW * 0.35 - 260) e.state = 'gone';
      } else if (e.state === 'windup') {
        e.t -= dt;
        // Lunge after you so running past doesn't dodge everything.
        e.x += Math.sign(f.px - e.x) * T.lunge * dt;
        if (e.t <= 0) {
          if (Math.abs(e.x - f.px) < T.enemyReach + 25) this._playerHit(e);
          e.state = 'recover'; e.t = T.recover; e.cool = T.recover + 0.3;
        }
      } else if (e.state === 'recover') {
        e.t -= dt;
        if (e.t <= 0) e.state = 'approach';
      } else if (e.state === 'stagger') {
        e.t -= dt; e.x += e.dir * 170 * dt;
        if (e.t <= 0) e.state = 'approach';
      } else if (e.state === 'dead') {
        e.t += dt;
        e.rot = e.dir * Math.min(Math.PI / 2, e.t / 0.3 * Math.PI / 2);
        if (e.t < 0.3) e.x += e.dir * 110 * dt;
        e.pool = Math.min(1, Math.max(0, (e.t - 0.25) / 1.4));
      }
    });
    f.enemies = f.enemies.filter(e => e.state !== 'gone' && !(e.state === 'dead' && e.x - f.px < -this.VW));
    if (!f.done && f.px >= f.length) {
      f.done = 0.001;
      this.fightStats[f.idx] = { kos: f.kos, total: f.total, hits: f.hitsTaken, knockdowns: f.knockdowns };
    }
  }

  _drawFight() {
    const ctx = this.ctx, f = this.fight, g = this.groundY, camX = this._camX();
    const T = JUNKYARD_TUNING, w = JUNKYARD_WEAPONS[this.weapon];
    const pX = this.VW * 0.35;
    // Speed streaks.
    if (!f.done && f.down <= 0) {
      ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 2;
      ctx.beginPath();
      for (let k = 0; k < 10; k++) {
        const sx = ((k * 173 - f.px * 1.5) % (this.VW + 200) + this.VW + 200) % (this.VW + 200) - 100;
        const sy = g - 40 - jyHash(k) * 260;
        ctx.moveTo(sx, sy); ctx.lineTo(sx + 60 + jyHash(k + 3) * 60, sy);
      }
      ctx.stroke();
    }
    // Destination marker.
    const signX = f.length + 40 - camX;
    const last = f.idx === T.fight.length - 1;
    if (signX < this.VW + 100) {
      if (last) {
        ctx.fillStyle = '#f2f2f2'; ctx.fillRect(signX - 4, g - 150, 8, 150); ctx.fillRect(signX + 160, g - 150, 8, 150);
        ctx.strokeStyle = '#ff3d9a'; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(signX + 4, g - 70); ctx.lineTo(signX + 160, g - 70); ctx.stroke();
        this._person(signX + 200, g, { ...this.luigi, face: -1, armF: -1.3, armB: -1.6 });
        this._label('FINISH', signX + 82, g - 170, 34, '#f4c542');
      } else {
        ctx.fillStyle = '#5a4a3a'; ctx.fillRect(signX - 4, g - 130, 8, 130);
        ctx.fillStyle = '#f4c542'; jailRoundRectPath(ctx, signX - 70, g - 180, 140, 52, 6); ctx.fill();
        this._label('STATION 2', signX, g - 145, 28, '#1a1410');
      }
    }
    ctx.fillStyle = '#8a0f12';
    this.splats.forEach(s => { const sx = s.x - camX; if (sx > -20 && sx < this.VW + 20) { ctx.beginPath(); ctx.ellipse(sx, s.y, s.r * 1.6, s.r * 0.6, 0, 0, Math.PI * 2); ctx.fill(); } });
    f.enemies.forEach(e => {
      if (e.state !== 'dead' || e.pool <= 0) return;
      const sx = e.x - camX + e.dir * 60;
      ctx.fillStyle = '#7a0a0e';
      ctx.beginPath(); ctx.ellipse(sx, g + e.z + 4, 70 * e.pool, 14 * e.pool, 0, 0, Math.PI * 2); ctx.fill();
    });
    let playerDrawn = false;
    const drawPlayer = () => {
      playerDrawn = true;
      if (f.invuln > 0 && f.down <= 0 && Math.floor(f.invuln * 16) % 2) return;
      let rot = 0, y = g;
      if (f.down > 0) {
        const elapsed = T.downTime - f.down;
        const q = Math.min(1, elapsed / 0.2) * Math.min(1, f.down / 0.25);
        rot = -Math.PI / 2 * q;
      } else if (f.hurt > 0) rot = -0.3 * Math.sin(f.hurt / 0.3 * Math.PI);
      else if (!f.done) rot = 0.1;
      const p = f.attackT > 0 ? 1 - f.attackT / 0.16 : -1;
      const arm = this._weaponArm(p);
      if (p < 0 && f.down <= 0) arm.armB = 0.9 + Math.sin(f.run) * 1.1;
      this._person(pX, y, {
        ...JUNKYARD_LOOKS.player,
        face: f.face,
        stride: (f.down > 0) ? 0 : Math.sin(f.run) * (f.done ? 12 : 19),
        rot: rot * f.face, weapon: this.weapon, ...arm,
      });
    };
    f.enemies.forEach(e => {
      if (!playerDrawn && e.z > 0) drawPlayer();
      const sx = e.x - camX;
      if (sx < -160 || sx > this.VW + 80) return;
      const running = e.state === 'approach';
      const stride = running ? Math.sin(e.walk) * (e.x < f.px ? 18 : 12) : 0;
      let armF = 1.2 + Math.sin(e.walk) * 0.5, armB = 1.9 - Math.sin(e.walk) * 0.5;
      if (e.state === 'windup') { const q = 1 - e.t / T.windup; armF = jyLerp(-0.6, -2.4, q); armB = -0.4; }
      if (e.state === 'recover') { armF = 0.1; armB = 1.4; }
      if (e.state === 'stagger') { armF = -0.6; armB = -0.9; }
      if (e.state === 'dead') { armF = -1.6; armB = -2.2; }
      const face = e.state === 'dead' ? -e.dir : (e.x > f.px ? -1 : 1);
      this._person(sx, g + e.z, {
        ...JUNKYARD_LOOKS.inmate, skin: e.skin, hair: e.bald ? null : JUNKYARD_LOOKS.inmate.hair,
        face, stride, armF, armB, rot: e.rot, dead: e.state === 'dead', scale: e.brute ? 1.3 : 1,
      });
      if (e.state === 'windup') {
        const pulse = 1 + 0.25 * Math.sin(this.phaseT * 30);
        this.ctx.save();
        this.ctx.shadowColor = '#ff2a2a'; this.ctx.shadowBlur = 12;
        this._label('!', sx, g + e.z - (e.brute ? 190 : 150), 40 * pulse, '#ff3a3a');
        this.ctx.restore();
      }
    });
    if (!playerDrawn) drawPlayer();
    ctx.fillStyle = '#c4141a';
    this.gore.forEach(p => { ctx.beginPath(); ctx.arc(p.x - camX, p.y, p.r, 0, Math.PI * 2); ctx.fill(); });
    if (f.tracer) {
      ctx.strokeStyle = `rgba(255,230,150,${f.tracer.t / 0.07})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(pX + f.face * 62, g - 84); ctx.lineTo(f.tracer.x - camX, f.tracer.y); ctx.stroke();
    }
    if (this.weapon === 'sword' && f.attackT > 0) {
      const p = 1 - f.attackT / 0.16;
      ctx.save();
      ctx.translate(pX, g - 86); ctx.scale(f.face, 1);
      ctx.strokeStyle = `rgba(230,240,255,${0.6 * (1 - p)})`; ctx.lineWidth = 16;
      ctx.beginPath(); ctx.arc(0, 0, 112, -2.0, jyLerp(-2.0, 0.9, Math.min(1, p * 1.4))); ctx.stroke();
      ctx.restore();
    }
    // Health.
    for (let i = 0; i < T.playerHP; i++) {
      const hx = this.VW - 24 - i * 30, hy = 34, on = i < (f.down > 0 ? 0 : f.hp);
      ctx.fillStyle = on ? '#ff3a4a' : 'rgba(255,255,255,0.18)';
      ctx.beginPath();
      ctx.moveTo(hx, hy + 9);
      ctx.bezierCurveTo(hx - 16, hy - 2, hx - 8, hy - 14, hx, hy - 5);
      ctx.bezierCurveTo(hx + 8, hy - 14, hx + 16, hy - 2, hx, hy + 9);
      ctx.fill();
    }
    if (this.phaseT < 2.6) {
      ctx.globalAlpha = Math.min(1, (2.6 - this.phaseT) / 0.5);
      this._hudCenter('FIGHT TO THE ' + (last ? 'FINISH' : 'NEXT STATION'), this.VH * 0.2, 34, '#f2f2f2');
      this._hudCenter(`${w.name} — ${this.touchUI ? 'TAP' : 'TAP / SPACE'} TO ATTACK`, this.VH * 0.2 + 40, 24, '#f4c542');
      this._hudCenter('THEY HIT BACK WHEN YOU SEE !', this.VH * 0.2 + 74, 22, '#ff8a7a');
      ctx.globalAlpha = 1;
    }
    this._hudCenter(`KO ${f.kos}/${f.total}`, g + 70, 30, '#f2f2f2');
  }

  _weaponArm(p) {
    const wp = this.weapon;
    if (p < 0) {
      return { fists: { armF: 0.5, armB: 0.9 }, shank: { armF: 0.6, armB: 1.6 }, sword: { armF: -0.9, armB: 1.6 }, gun: { armF: 0.05, armB: 1.6 } }[wp];
    }
    const jab = Math.sin(p * Math.PI);
    if (wp === 'fists') return { armF: -0.1, armB: 0.9, armLen: 32 + 16 * jab };
    if (wp === 'shank') return { armF: -0.05, armB: 1.6, armLen: 32 + 16 * jab };
    if (wp === 'sword') return { armF: jyLerp(-2.0, 0.9, Math.min(1, p * 1.4)), armB: 1.6 };
    return { armF: -0.05 - 0.35 * (1 - p), armB: 1.6, muzzle: p < 0.5 };
  }

  // ------------------------------------------------------------ drawing

  _person(x, y, o) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    if (o.rot) ctx.rotate(o.rot);
    ctx.scale((o.face || 1) * (o.scale || 1), o.scale || 1);
    if (o.alpha != null) ctx.globalAlpha = o.alpha;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const stride = o.stride || 0, tuck = o.tuck || 0;
    const skin = o.skin || '#e8b48a';
    const sh = { x: 0, y: -86 };
    const armB = o.armB != null ? o.armB : 1.8;
    ctx.strokeStyle = jailShade(o.sleeve || skin, -18); ctx.lineWidth = 9;
    ctx.beginPath(); ctx.moveTo(sh.x - 4, sh.y); ctx.lineTo(sh.x - 4 + Math.cos(armB) * 30, sh.y + Math.sin(armB) * 30); ctx.stroke();
    const leg = (fx, kx) => {
      ctx.beginPath(); ctx.moveTo(0, -48);
      ctx.lineTo(kx + 10 * tuck, -24 - 10 * tuck); ctx.lineTo(fx - 4 * tuck, -22 * tuck); ctx.stroke();
    };
    ctx.lineWidth = 11;
    ctx.strokeStyle = jailShade(o.pants, -16); leg(-stride, -stride * 0.5 + 1);
    ctx.strokeStyle = o.pants; leg(stride, stride * 0.5 + 3);
    ctx.fillStyle = o.shirt; jailRoundRectPath(ctx, -13, -96, 26, 50, 8); ctx.fill();
    if (!o.sleeve) { ctx.fillStyle = o.pants; ctx.fillRect(-13, -54, 26, 8); }
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.arc(2, -108, 12, 0, Math.PI * 2); ctx.fill();
    if (o.hair) { ctx.fillStyle = o.hair; ctx.beginPath(); ctx.arc(2, -110, 12.6, Math.PI * 1.02, Math.PI * 1.98); ctx.fill(); }
    if (o.headband) { ctx.fillStyle = o.headband; ctx.fillRect(-10, -116, 24, 5); }
    ctx.fillStyle = '#1a1410';
    if (o.dead) {
      ctx.lineWidth = 1.6; ctx.strokeStyle = '#1a1410';
      ctx.beginPath(); ctx.moveTo(5, -111); ctx.lineTo(10, -106); ctx.moveTo(10, -111); ctx.lineTo(5, -106); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(8, -108, 1.8, 0, Math.PI * 2); ctx.fill();
    }
    if (o.brows) { ctx.fillRect(4, -113, 9, 2.5); }
    const armF = o.armF != null ? o.armF : 1.2, len = o.armLen || 30;
    const hx = sh.x + 3 + Math.cos(armF) * len, hy = sh.y + Math.sin(armF) * len;
    ctx.strokeStyle = o.sleeve || skin; ctx.lineWidth = 9;
    ctx.beginPath(); ctx.moveTo(sh.x + 3, sh.y); ctx.lineTo(hx, hy); ctx.stroke();
    ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(hx, hy, 5.5, 0, Math.PI * 2); ctx.fill();
    if (o.weapon) { ctx.save(); ctx.translate(hx, hy); ctx.rotate(armF); this._drawWeapon(o.weapon, o.muzzle); ctx.restore(); }
    ctx.restore();
  }

  _drawWeapon(wp, muzzle) {
    const ctx = this.ctx;
    if (wp === 'fists') {
      ctx.fillStyle = '#f2f2f2'; ctx.fillRect(-7, -6, 4, 12);
    } else if (wp === 'shank') {
      ctx.fillStyle = '#5aa8ff'; jailRoundRectPath(ctx, -4, -2.5, 24, 5, 2); ctx.fill();
      ctx.fillStyle = '#e8e8e0'; ctx.fillRect(14, -3.5, 5, 7);
      ctx.fillStyle = '#d0d4dc';
      ctx.beginPath(); ctx.moveTo(20, -3); ctx.lineTo(38, 0); ctx.lineTo(20, 3); ctx.closePath(); ctx.fill();
    } else if (wp === 'sword') {
      ctx.fillStyle = '#2a1a1a'; ctx.fillRect(-10, -3, 16, 6);
      ctx.fillStyle = '#d6a21f'; ctx.fillRect(5, -7, 4, 14);
      ctx.fillStyle = '#e8eef5';
      ctx.beginPath(); ctx.moveTo(9, -3); ctx.lineTo(86, -2); ctx.lineTo(94, 1); ctx.lineTo(86, 3); ctx.lineTo(9, 3); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(12, -1.5); ctx.lineTo(84, -1); ctx.stroke();
    } else if (wp === 'gun') {
      ctx.fillStyle = '#222'; ctx.fillRect(-2, -9, 28, 9);
      ctx.fillStyle = '#333'; ctx.fillRect(-1, -2, 8, 14);
      if (muzzle) {
        ctx.fillStyle = '#ffe08a';
        ctx.beginPath(); ctx.moveTo(26, -9); ctx.lineTo(44, -4.5); ctx.lineTo(26, 0); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(28, -4.5, 4, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  _drawYard(camX) {
    const ctx = this.ctx, VW = this.VW, VH = this.VH, g = this.groundY;
    const sky = ctx.createLinearGradient(0, 0, 0, g);
    sky.addColorStop(0, '#24163a'); sky.addColorStop(0.6, '#7a3a4a'); sky.addColorStop(1, '#d4703a');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, VW, g);
    ctx.fillStyle = 'rgba(255,200,120,0.9)';
    ctx.beginPath(); ctx.arc(VW * 0.72, g - 150, 46, 0, Math.PI * 2); ctx.fill();
    // Far junk piles.
    const far = camX * 0.25;
    for (let k = Math.floor(far / 260) - 1; k < (far + VW) / 260 + 1; k++) {
      const x = k * 260 - far, h = 70 + jyHash(k) * 90;
      ctx.fillStyle = '#3a2540';
      ctx.beginPath(); ctx.ellipse(x + 130, g - 120, 160, h, 0, Math.PI, 0); ctx.fill();
      ctx.fillStyle = '#2c1c33';
      for (let j = 0; j < 3; j++) {
        ctx.beginPath(); ctx.arc(x + 60 + j * 55 + jyHash(k + j) * 20, g - 120 - h * (0.3 + jyHash(k * 3 + j) * 0.5), 14, 0, Math.PI * 2); ctx.fill();
      }
      if (k % 5 === 0) {
        ctx.strokeStyle = '#2c1c33'; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.moveTo(x + 140, g - 120); ctx.lineTo(x + 140, g - 330); ctx.lineTo(x + 300, g - 280); ctx.stroke();
        ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 290, g - 283); ctx.lineTo(x + 290, g - 220); ctx.stroke();
      }
    }
    ctx.fillStyle = '#2e2420'; ctx.fillRect(0, g - 122, VW, 122);
    // Chain-link fence.
    const fo = camX * 0.6;
    const top = g - 200, bot = g - 70;
    ctx.strokeStyle = 'rgba(190,190,205,0.22)'; ctx.lineWidth = 1.2;
    ctx.beginPath();
    const s0 = Math.floor(fo / 18) * 18 - fo;
    for (let x = s0 - (bot - top); x < VW + 20; x += 18) {
      ctx.moveTo(x, bot); ctx.lineTo(x + (bot - top), top);
      ctx.moveTo(x, top); ctx.lineTo(x + (bot - top), bot);
    }
    ctx.stroke();
    ctx.fillStyle = 'rgba(150,150,165,0.5)';
    for (let x = Math.floor(fo / 170) * 170 - fo; x < VW + 20; x += 170) ctx.fillRect(x - 2, top - 14, 4, bot - top + 14);
    ctx.strokeStyle = 'rgba(200,200,215,0.4)'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let x = s0 - 18; x < VW + 20; x += 14) ctx.arc(x, top - 10, 7, 0, Math.PI * 2);
    ctx.stroke();
    // Ground.
    const ground = ctx.createLinearGradient(0, g - 70, 0, VH);
    ground.addColorStop(0, '#4a3a2c'); ground.addColorStop(1, '#2a2018');
    ctx.fillStyle = ground; ctx.fillRect(0, g - 70, VW, VH - g + 70);
    for (let k = Math.floor(camX / 230) - 1; k < (camX + VW) / 230 + 1; k++) {
      const x = k * 230 - camX + jyHash(k + 99) * 120, y = g + 24 + jyHash(k + 77) * 60;
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath(); ctx.ellipse(x, y, 30 + jyHash(k) * 30, 7, 0, 0, Math.PI * 2); ctx.fill();
      if (jyHash(k + 5) > 0.55) {
        ctx.fillStyle = '#1d1b1a'; ctx.beginPath(); ctx.ellipse(x + 40, y - 4, 18, 7, 0, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  _label(text, x, y, size, color) {
    const ctx = this.ctx;
    ctx.font = `bold ${size}px VT323, monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(text, x + 2, y + 2);
    ctx.fillStyle = color; ctx.fillText(text, x, y);
  }

  _hudCenter(text, y, size, color) { this._label(text, this.VW / 2, y, size, color); }

  _ladder(y, active) {
    const n = JUNKYARD_TIER_ORDER.length, w = Math.min(96, (this.VW - 30) / n);
    JUNKYARD_TIER_ORDER.forEach((k, i) => {
      const x = this.VW / 2 + (i - (n - 1) / 2) * w;
      const on = k === active;
      this.ctx.fillStyle = on ? 'rgba(244,197,66,0.25)' : 'rgba(255,255,255,0.06)';
      jailRoundRectPath(this.ctx, x - w / 2 + 3, y - 30, w - 6, 64, 6); this.ctx.fill();
      this._label(JUNKYARD_WEAPONS[k].name.replace('TOOTHBRUSH ', '').replace('SAMURAI ', ''), x, y - 10, 20, on ? '#f4c542' : '#c8c0b0');
      this._label(JUNKYARD_TIER_LABELS[k], x, y + 14, 15, on ? '#f4c542' : '#8a8070');
    });
  }

  _overlay(a) { this.ctx.fillStyle = `rgba(10,8,6,${a})`; this.ctx.fillRect(0, 0, this.VW, this.VH); }

  _draw() {
    const ctx = this.ctx, s = this.dpr * this.u;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.save();
    if (this.shake > 0) ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake * 0.6);
    const inFight = this.phase === 'fight';
    this._drawYard(inFight ? this._camX() : 0);
    if (inFight) this._drawFight();
    else if (this.station === 'rope' && this.phase !== 'finish') this._drawRopeStation();
    else if (this.station === 'box' && this.phase !== 'finish') this._drawBoxStation();
    ctx.restore();
    // Particles/floaters are kept in device px by JailParticles; floaters in virtual units.
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.particles.draw(ctx);
    ctx.setTransform(s, 0, 0, s, 0, 0);
    this.floaters.draw(ctx);
    if (this.flash > 0) { ctx.fillStyle = `rgba(224,40,40,${this.flash * 0.3})`; ctx.fillRect(0, 0, this.VW, this.VH); }

    this._label(`SCORE ${this.score}`, 90, 34, 30, '#f4c542');
    if (this.phase === 'intro') this._drawIntro();
    else if (this.phase === 'weapon') this._drawWeaponCard();
    else if (this.phase === 'finish') this._drawFinish();
  }

  _drawIntro() {
    this._overlay(0.55);
    const n = this.station === 'rope' ? 1 : 2;
    const y = this.VH * 0.24;
    this._hudCenter(`STATION ${n}`, y, 30, '#c8c0b0');
    this._hudCenter(this.station === 'rope' ? 'JUMP ROPE' : 'BOX JUMP', y + 50, 64, '#f2f2f2');
    const how = this.station === 'rope'
      ? (this.touchUI ? 'TAP TO JUMP THE ROPES' : 'TAP / SPACE TO JUMP THE ROPES')
      : (this.touchUI ? 'SWIPE UP WHEN THE MARKER IS IN THE GREEN' : 'TAP / SPACE WHEN THE MARKER IS IN THE GREEN');
    this._hudCenter(how, y + 105, 22, '#f4c542');
    this._hudCenter(`WEAPON POINTS ${this.weaponPts} — THEY ADD UP`, y + 150, 20, '#c8c0b0');
    this._ladder(y + 210, null);
    this._hudCenter('A PERFECT STATION = GUN', y + 262, 18, '#c8c0b0');
    if (this.phaseT > 0.6) this._hudCenter('TAP TO START', y + 300, 28, '#f2f2f2');
  }

  _drawWeaponCard() {
    const ctx = this.ctx;
    this._overlay(0.72);
    const r = this.results[this.station];
    const y = this.VH * 0.2;
    this._hudCenter(`${r.label}  +${r.earned}`, y, 30, '#c8c0b0');
    this._hudCenter(`WEAPON POINTS ${this.weaponPts}`, y + 44, 26, '#f4c542');
    const p = Math.min(1, this.phaseT / 0.5);
    const glow = ctx.createRadialGradient(this.VW / 2, y + 135, 10, this.VW / 2, y + 135, 150);
    glow.addColorStop(0, 'rgba(244,197,66,0.45)'); glow.addColorStop(1, 'rgba(244,197,66,0)');
    ctx.fillStyle = glow; ctx.fillRect(this.VW / 2 - 160, y + 0, 320, 280);
    ctx.save();
    ctx.translate(this.VW / 2 - (this.weapon === 'sword' ? 120 : 50), y + 140);
    ctx.scale(3 * p, 3 * p);
    ctx.rotate((1 - p) * 6 - 0.15);
    if (this.weapon === 'fists') { ctx.fillStyle = '#e8b48a'; ctx.beginPath(); ctx.arc(14, 0, 12, 0, Math.PI * 2); ctx.fill(); }
    this._drawWeapon(this.weapon, false);
    ctx.restore();
    this._hudCenter(JUNKYARD_WEAPONS[this.weapon].name, y + 230, 52, '#f4c542');
    this._ladder(y + 310, this.weapon);
    this._hudCenter('A PERFECT STATION = GUN', y + 360, 18, '#c8c0b0');
    if (this.phaseT > 0.6) this._hudCenter('TAP TO FIGHT', y + 400, 28, '#f2f2f2');
  }

  _summary() {
    const rope = this.results.rope, box = this.results.box;
    const fights = this.fightStats.filter(Boolean);
    const kos = fights.reduce((a, f) => a + f.kos, 0), total = fights.reduce((a, f) => a + f.total, 0) || 1;
    const q = 0.35 * (rope ? rope.frac : 0) + 0.35 * (box ? box.frac : 0) + 0.3 * (kos / total);
    return { rope, box, kos, total, gain: Math.round(45 * jailClamp(q, 0, 1)) };
  }

  _drawFinish() {
    this._overlay(0.75);
    const sm = this._summary();
    const y = this.VH * 0.18;
    this._hudCenter('FINISH', y, 64, '#f4c542');
    this._hudCenter(`JUMP ROPE  ${sm.rope.label}`, y + 70, 24, '#f2f2f2');
    this._hudCenter(`BOX JUMP  ${sm.box.label}`, y + 104, 24, '#f2f2f2');
    this._hudCenter(`KNOCKOUTS  ${sm.kos}/${sm.total}`, y + 138, 24, '#f2f2f2');
    this._hudCenter('TOTAL', y + 200, 26, '#c8c0b0');
    const pulse = 1 + 0.05 * Math.sin(this.phaseT * 8);
    this.ctx.save();
    this.ctx.translate(this.VW / 2, y + 260); this.ctx.scale(pulse, pulse);
    this._label(String(this.score), 0, 0, 80, '#f4c542');
    this.ctx.restore();
    if (this.phaseT > 0.6) this._hudCenter('TAP TO CONTINUE', y + 350, 28, '#f2f2f2');
  }

  _end() {
    if (this.finished) return;
    const sm = this._summary();
    this.destroy();
    this.onDone({
      grade: jailGradeFromGain(sm.gain),
      friendshipGain: sm.gain,
      stats: [
        ['Jump rope', sm.rope.label.toLowerCase()],
        ['Box jump', sm.box.label.toLowerCase()],
        ['Knockouts', `${sm.kos}/${sm.total}`],
        ['Score', String(this.score)],
        ['Friendship', `+${sm.gain}`],
      ],
      detail: { score: this.score, ropeFrac: sm.rope.frac, boxFrac: sm.box.frac, kos: sm.kos },
    });
  }

  destroy() {
    this.finished = true;
    if (this._af) cancelAnimationFrame(this._af);
    this._af = null;
    this.canvas.removeEventListener('touchstart', this._touchStartH);
    this.canvas.removeEventListener('touchmove', this._touchMoveH);
    this.canvas.removeEventListener('touchend', this._touchEndH);
    this.canvas.removeEventListener('touchcancel', this._touchEndH);
    this.canvas.removeEventListener('pointerdown', this._pointerH);
    window.removeEventListener('keydown', this._keyH);
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.host.resize();
  }
}

// Keep the landing band fully on the meter.
function jaiClampBand(c, hw) { return jailClamp(c, hw + 0.04, 1 - hw - 0.04); }
