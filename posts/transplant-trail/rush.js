/**
 * THE TRANSPLANT TRAIL - RUSH
 * ===========================
 * Side-view auto-runner offered at Midtown (see showRushOffer() in
 * trail.js). Replaces the four first-person "zoomies" builds, which all
 * failed on the same thing: you couldn't judge a gap coming straight at
 * you. Here the gap, the platform and your own arc are all on screen at
 * once.
 *
 * ONE verb: jump. Tap/click/space to jump, hold for a higher one, press
 * again in the air for a double jump. ONE rule: landing on things is
 * good (you bounce), running into them is bad.
 *
 * Nothing can strand you. A pit doesn't respawn you anywhere -- it
 * costs a heart and throws you forward out the far side -- so there is
 * no "retry the same jump forever" state to get stuck in (the bug that
 * killed zoomies v4).
 *
 * Score only: never touches money/aura. Losing every heart before the
 * finish costs trail time (RUSH_WIPEOUT_HOURS), applied in trail.js.
 *
 * World units: x runs right, y is height above street level. The sim
 * (step()) is fixed-timestep and has no canvas dependency, so it can be
 * driven headless by a bot.
 */

const RUSH_WIPEOUT_HOURS = 40;

const RUSH_TUNING = {
  gravity: 2200,
  jumpV: 760,          // full jump: apex ~131, ~0.69s of air
  doubleJumpV: 660,
  jumpCutV: 260,       // releasing early clamps upward speed to this
  coyote: 0.1,         // seconds after leaving a ledge you can still jump
  buffer: 0.13,        // seconds a press is remembered before landing
  baseSpeed: 350,
  paceSpeed: 250,      // added at full pace (a clean streak)
  paceSeconds: 14,     // clean running time to reach full pace
  boostSpeed: 230, boostTime: 1.8,
  rushSpeed: 700, rushTime: 5.5,
  magnetTime: 8, magnetRange: 180,
  hearts: 4, maxHearts: 5,
  invuln: 1.4,
  springV: 960,
  stompV: 640, carBounceV: 900,
  viewW: 560, viewH: 470, // minimum world units visible each way
  swingR: 46,          // bar-to-body radius while swinging
  swingGrab: 46,       // how close your body has to pass to a bar to catch it
  swingIdeal: 1.15,    // release angle (radians past straight-down) that launches highest
  loopR: 115,
  launchVX: 700,
  launchVY: 1080, launchVYPace: 380, // kicker launch: more pace = higher hit on the statue
};

// ------------------------------------------------------------------
// HEADLINES -- giant text that slams onto the screen during the run.
// The first one fires the moment you start; the rest are spread evenly
// across the course in this order, however many there are. Add, cut or
// reorder freely.
// ------------------------------------------------------------------
const RUSH_HEADLINES = [
  'AHHHHHHHHHHHHH',
  'AHHHHH I WANNA KISS THE MOON',
  'I AM NEW YORK',
  'I LOVE LINES',
];

const RUSH_ZONES = [
  { name: 'TIMES SQUARE' },
  { name: '42 ST STATION' },
  { name: 'BROOKLYN BRIDGE' },
];

const RUSH_OB = {
  low:  { w: 26, h: 34, bounce: 'stompV' },
  tall: { w: 30, h: 62, bounce: 'stompV' },
  car:  { w: 96, h: 40, bounce: 'carBounceV', solid: true },
  bird: { w: 32, h: 22, bounce: 'stompV', vx: -50 },
  rat:  { w: 38, h: 16, bounce: 'stompV', vx: -150 },
};

function rushHash(i) {
  const v = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
}

class RushGame {
  constructor(gameState, onComplete) {
    this.gameState = gameState;
    this.onComplete = onComplete;
    this.canvas = null;
    this.ctx = null;
    this._af = null;
    this.audio = null;
    this.finishedOnce = false;
    this.bestScore = 0;
    this.reset();
  }

  // ------------------------------------------------------------------
  // SETUP
  // ------------------------------------------------------------------

  init() {
    this.canvas = document.getElementById('rush-canvas');
    this.ctx = this.canvas.getContext('2d');
    this._resize = () => {
      const r = this.canvas.getBoundingClientRect();
      const w = r.width || window.innerWidth, h = r.height || window.innerHeight;
      this.dpr = Math.min(2, window.devicePixelRatio || 1);
      this.canvas.width = Math.round(w * this.dpr);
      this.canvas.height = Math.round(h * this.dpr);
      this.W = w; this.H = h;
    };
    this._resize();
    window.addEventListener('resize', this._resize);
    // The address bar sliding away changes the canvas's box without
    // always firing a window resize; watch the element itself.
    if (typeof ResizeObserver === 'function') {
      this._ro = new ResizeObserver(this._resize);
      this._ro.observe(this.canvas);
    }
    window.scrollTo(0, 0);

    // Touch goes through touchstart, not pointerdown: preventDefault on
    // the touch itself is the one thing iOS reliably honors for stopping
    // double-tap zoom and the long-press callout, and when the browser
    // does claim a gesture it cancels the pointer stream (a dropped
    // jump). Pointer events are left for mouse/pen only.
    this._down = (e) => { if (e.pointerType === 'touch') return; e.preventDefault(); this.press(); };
    this._up = (e) => { if (e && e.pointerType === 'touch') return; this.release(); };
    this._ts = (e) => { e.preventDefault(); for (let i = 0; i < e.changedTouches.length; i++) this.press(); };
    this._te = (e) => { e.preventDefault(); if (e.touches.length === 0) this.release(); };
    this._kd = (e) => {
      if (e.key !== ' ' && e.key !== 'ArrowUp' && e.key.toLowerCase() !== 'w') return;
      e.preventDefault();
      if (!e.repeat) this.press();
    };
    this._ku = (e) => {
      if (e.key === ' ' || e.key === 'ArrowUp' || e.key.toLowerCase() === 'w') this.release();
    };
    this.canvas.addEventListener('pointerdown', this._down);
    this.canvas.addEventListener('touchstart', this._ts, { passive: false });
    this.canvas.addEventListener('touchend', this._te, { passive: false });
    this.canvas.addEventListener('touchcancel', this._te, { passive: false });
    window.addEventListener('pointerup', this._up);
    window.addEventListener('pointercancel', this._up);
    window.addEventListener('keydown', this._kd);
    window.addEventListener('keyup', this._ku);

    document.getElementById('rush-results').classList.add('hidden');
    document.getElementById('rush-results-again').onclick = () => {
      document.getElementById('rush-results').classList.add('hidden');
      this.reset();
    };
    document.getElementById('rush-results-continue').onclick = () => this._exit();

    this._last = performance.now();
    this._acc = 0;
    const frame = (now) => {
      const dt = Math.min(0.1, (now - this._last) / 1000);
      this._last = now;
      this._acc += dt;
      const STEP = 1 / 120;
      while (this._acc >= STEP) { this.step(STEP); this._acc -= STEP; }
      this.render();
      this._af = requestAnimationFrame(frame);
    };
    this._af = requestAnimationFrame(frame);
  }

  reset() {
    const T = RUSH_TUNING;
    this.state = 'ready'; // ready -> run -> finish | wipe -> results
    this.t = 0;
    this.endT = 0;
    this.freeze = 0;
    this.shake = 0;
    this.flash = 0;
    this.score = 0;
    this.coins = 0;
    this.coinStreak = 0;
    this.coinPitch = 0;
    this.coinPitchT = 0;
    this.stompChain = 0;
    this.bestChain = 0;
    this.pace = 0;
    this.hearts = T.hearts;
    this.boostT = 0;
    this.rushT = 0;
    this.magnetT = 0;
    this.invuln = 0;
    this.zoneIdx = 0;
    this.zoneCardT = 0;
    this.particles = [];
    this.popups = [];
    this.trail = [];
    this.p = {
      x: 200, y: 0, vx: 0, vy: 0, grounded: true, airJumps: 1,
      coyote: 0, buffer: 0, held: false, canCut: false,
      squash: 0, spin: 0, runPhase: 0, swing: null,
    };
    this.loopRun = null;
    this.loopDone = false;
    this.launched = false;
    this.poleHit = false;
    this.focusX = this.p.x;
    this.camY = 0;
    this.headline = null;
    this._buildLevel();
  }

  destroy() {
    if (this._af) cancelAnimationFrame(this._af);
    this._af = null;
    window.removeEventListener('resize', this._resize);
    if (this._ro) { this._ro.disconnect(); this._ro = null; }
    if (this.canvas) {
      this.canvas.removeEventListener('pointerdown', this._down);
      this.canvas.removeEventListener('touchstart', this._ts);
      this.canvas.removeEventListener('touchend', this._te);
      this.canvas.removeEventListener('touchcancel', this._te);
    }
    window.removeEventListener('pointerup', this._up);
    window.removeEventListener('pointercancel', this._up);
    window.removeEventListener('keydown', this._kd);
    window.removeEventListener('keyup', this._ku);
    this._stopMusic();
    if (this.audio) { try { this.audio.close(); } catch (e) { /* ignore */ } this.audio = null; }
  }

  _exit() {
    document.getElementById('rush-results').classList.add('hidden');
    this.destroy();
    // A finish on any attempt counts -- "run it back" after a wipeout
    // and finishing clears the time penalty.
    this.onComplete({ score: this.bestScore, wipedOut: !this.finishedOnce });
  }

  // ------------------------------------------------------------------
  // LEVEL
  // ------------------------------------------------------------------
  // Authored, not random: the same course every run, so a second attempt
  // is about playing it better, not rolling a kinder layout. Every coin
  // arc traces the jump that clears whatever is under it.

  _buildLevel() {
    const L = this.level = { pits: [], plats: [], obs: [], picks: [], pads: [], bars: [], triggers: [], zones: [], finishX: 0 };
    const ob = (type, x, y = 0) => {
      const d = RUSH_OB[type];
      L.obs.push({ type, x, y, w: d.w, h: d.h, vx: d.vx || 0, solid: !!d.solid, bounce: RUSH_TUNING[d.bounce], alive: true, scored: false });
    };
    const pick = (x, y, kind = 'coin') => L.picks.push({ x, y, kind, taken: false });
    const arc = (cx, dist, apex, n, baseY = 24) => {
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        pick(cx - dist / 2 + dist * t, baseY + apex * 4 * t * (1 - t));
      }
    };
    const coins = (x, n = 8, y = 24) => { for (let i = 0; i < n; i++) pick(x + i * 46, y); return x + n * 46; };
    const low = (x, n = 1) => {
      for (let i = 0; i < n; i++) { const ox = x + 170 + i * 310; ob('low', ox); arc(ox + 13, 250, 100, 5); }
      return x + 170 + n * 310;
    };
    const tall = (x, n = 1) => {
      for (let i = 0; i < n; i++) { const ox = x + 190 + i * 340; ob('tall', ox); arc(ox + 15, 270, 120, 5); }
      return x + 190 + n * 340;
    };
    const pit = (x, w) => {
      L.pits.push({ x0: x + 150, x1: x + 150 + w });
      arc(x + 150 + w / 2, w + 150, 112, 6);
      return x + 150 + w + 170;
    };
    const car = (x, n = 1) => {
      for (let i = 0; i < n; i++) { const cx = x + 180 + i * 360; ob('car', cx); arc(cx + 48 + 180, 360, 170, 6, 46); }
      return x + 180 + n * 360 + 120;
    };
    const birds = (x, n) => {
      for (let i = 0; i < n; i++) { const bx = x + 220 + i * 280; ob('bird', bx, 34); pick(bx + 4, 130); pick(bx - 40, 100); }
      return x + 220 + n * 280;
    };
    const rats = (x, n) => {
      for (let i = 0; i < n; i++) ob('rat', x + 460 + i * 360);
      coins(x + 60, 6);
      return x + 460 + n * 360 - 150 * 1.5;
    };
    const scaffold = (x, power) => {
      L.pads.push({ x: x + 110, w: 46, kind: 'spring' });
      L.plats.push({ x0: x + 300, x1: x + 860, y: 120 });
      for (let i = 0; i < 11; i++) pick(x + 330 + i * 46, 144);
      if (power) pick(x + 600, 176, power);
      ob('tall', x + 470); ob('tall', x + 720);
      return x + 860 + 220;
    };
    const stairs = (x, power) => {
      const steps = [[140, 330, 56], [400, 590, 112], [660, 900, 168]];
      steps.forEach(([a, b, y]) => {
        L.plats.push({ x0: x + a, x1: x + b, y });
        for (let cx = x + a + 30; cx < x + b - 10; cx += 46) pick(cx, y + 24);
      });
      L.pits.push({ x0: x + 390, x1: x + 610 });
      if (power) pick(x + 780, 168 + 60, power);
      return x + 900 + 280;
    };
    const boostRun = (x, w = 230) => {
      L.pads.push({ x: x + 80, w: 70, kind: 'boost' });
      const x2 = coins(x + 190, 9);
      return pit(x2 - 60, w);
    };
    const jam = (x) => {
      pick(x + 120, 30, 'rush');
      for (let i = 0; i < 6; i++) { ob('car', x + 430 + i * 150); pick(x + 478 + i * 150, 70); }
      return x + 430 + 6 * 150 + 220;
    };
    const gauntlet = (x) => {
      ob('low', x + 170); arc(x + 183, 250, 100, 4);
      L.pits.push({ x0: x + 430, x1: x + 570 }); arc(x + 500, 290, 112, 5);
      ob('bird', x + 860, 34); pick(x + 850, 130);
      ob('tall', x + 1120); arc(x + 1135, 270, 120, 4);
      return x + 1120 + 260;
    };
    // Hanging bars, each one placed where the previous one's average
    // release lands you. Coins trace the swing-and-launch arcs; the street
    // underneath stays clear apart from a few low hazards, so a missed
    // bar only costs you the high route, never a heart.
    const bars = (x, n, y0 = 150, rise = 75) => {
      let bx = x + 320;
      arc(bx - 140, 260, 90, 4);
      for (let i = 0; i < n; i++) {
        const by = y0 + i * rise;
        L.bars.push({ x: bx, y: by, cool: 0 });
        for (let k = 0; k < 6; k++) pick(bx + 110 + k * 72, by + 120 + Math.sin((k / 5) * Math.PI) * 170 - k * 18);
        if (i < n - 1) ob('low', bx + 240);
        bx += 570;
      }
      return bx + 120;
    };
    const gap = (x, n = 200) => x + n;
    const zone = (x, i) => { L.zones.push({ x0: x, name: RUSH_ZONES[i].name }); return coins(x + 240, 8) + 120; };

    let x = 0;
    L.zones.push({ x0: -1e9, name: RUSH_ZONES[0].name });
    x = coins(700, 8) + 80;
    x = gap(low(x, 1));
    x = gap(pit(x, 110));
    x = gap(car(x, 1));
    x = gap(bars(x, 1));
    x = gap(scaffold(x, 'magnet'));
    x = gap(birds(x, 2));
    x = gap(boostRun(x, 190));
    x = gap(jam(x));

    x = zone(x, 1);
    x = gap(rats(x, 2));
    x = gap(pit(x, 150));
    x = gap(stairs(x, 'heart'));
    x = gap(bars(x, 3), 160);
    x = gap(car(x, 2), 160);
    x = gap(birds(x, 2), 160);
    x = gap(gauntlet(x), 160);
    x = gap(scaffold(x, 'rush'), 120);

    x = zone(x, 2);
    x = gap(boostRun(x, 230), 140);
    x = gap(pit(x, 150), 60);
    x = gap(pit(x, 170), 140);
    x = gap(birds(x, 4), 140);
    x = gap(bars(x, 3, 160, 70), 140);
    x = gap(stairs(x, 'magnet'), 140);
    x = gap(jam(x), 140);
    x = gap(gauntlet(x), 120);
    // FINALE: boost pad -> 360 loop -> kicker ramp -> the statue, which
    // is the flagpole. How high you hit her is the bonus.
    x = coins(x + 100, 10);
    L.pads.push({ x: x + 40, w: 70, kind: 'boost' });
    L.loopX = x + 420;
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      pick(L.loopX + Math.sin(a) * (RUSH_TUNING.loopR - 40), RUSH_TUNING.loopR - Math.cos(a) * (RUSH_TUNING.loopR - 40));
    }
    L.kickerX = L.loopX + RUSH_TUNING.loopR + 280;
    L.statueX = L.kickerX + 760;
    L.finishX = L.statueX - 58; // just off her left side -- she is the "pole"
    L.endX = L.statueX + 900;
    // Headlines: #0 on the first tap, the rest evenly spaced up to the loop.
    for (let i = 1; i < RUSH_HEADLINES.length; i++) {
      L.triggers.push({ x: 600 + (L.loopX - 900) * (i / RUSH_HEADLINES.length), idx: i, fired: false });
    }

    L.pits.sort((a, b) => a.x0 - b.x0);
    L.obs.sort((a, b) => a.x - b.x);
    L.picks.sort((a, b) => a.x - b.x);
  }

  _zoneAt(x) {
    const z = this.level.zones;
    let i = 0;
    for (let k = 1; k < z.length; k++) if (x >= z[k].x0) i = k;
    return i;
  }

  _pitAt(x, margin = 8) {
    const pits = this.level.pits;
    for (let i = 0; i < pits.length; i++) {
      if (x > pits[i].x0 + margin && x < pits[i].x1 - margin) return pits[i];
    }
    return null;
  }

  // ------------------------------------------------------------------
  // INPUT
  // ------------------------------------------------------------------

  press() {
    this._ensureAudio();
    if (this.state === 'ready') {
      this.state = 'run';
      this.zoneCardT = 2.4;
      this._startMusic();
      this._headline(0);
      return;
    }
    if (this.state !== 'run') return;
    const p = this.p;
    p.held = true;
    if (this.loopRun) return;
    if (p.swing) { this._releaseSwing(); return; }
    if (p.grounded || p.coyote > 0) { this._jump(RUSH_TUNING.jumpV, false); return; }
    if (p.airJumps > 0) { p.airJumps--; this._jump(RUSH_TUNING.doubleJumpV, true); return; }
    p.buffer = RUSH_TUNING.buffer;
  }

  release() {
    const p = this.p;
    p.held = false;
    if (p.canCut && p.vy > RUSH_TUNING.jumpCutV) p.vy = RUSH_TUNING.jumpCutV;
    p.canCut = false;
  }

  _jump(v, isDouble) {
    const p = this.p;
    p.vy = v;
    p.grounded = false;
    p.coyote = 0;
    p.buffer = 0;
    p.canCut = true;
    p.squash = -0.35;
    this._burst(p.x, p.y + (isDouble ? 14 : 2), isDouble ? '#9be7ff' : '#d8d2c4', isDouble ? 12 : 6, { speed: 150, up: isDouble ? 0 : 60, life: 0.3 });
    this._sfx(isDouble ? 'djump' : 'jump');
  }

  // ------------------------------------------------------------------
  // SIM
  // ------------------------------------------------------------------

  step(dt) {
    this.t += dt;
    this._updateFx(dt);
    if (this.state === 'ready') return;
    if (this.freeze > 0) { this.freeze -= dt; return; }
    const p = this.p, T = RUSH_TUNING, L = this.level;

    this._updateCamera(dt);
    if (this.state === 'finish' && this.poleHit) {
      // Mario flagpole: slide down her side, then celebrate.
      this.endT += dt;
      p.x = L.finishX;
      p.vx = 0;
      p.y = Math.max(0, p.y - 300 * dt);
      p.grounded = true; // drawn as the clinging figure, not the ball
      if (Math.random() < dt * 40) {
        this._burst(L.statueX + (Math.random() - 0.5) * 600, 300 + Math.random() * 200, `hsl(${Math.random() * 360},90%,65%)`, 1, { speed: 120, life: 1.2, g: 500 });
      }
      if (this.endT > Math.max(2.4, this.poleY / 300 + 1.2)) this._showResults();
      return;
    }
    if (this.state === 'finish' || this.state === 'wipe') {
      this.endT += dt;
      p.vx *= Math.pow(this.state === 'finish' ? 0.25 : 0.05, dt);
      p.x += p.vx * dt;
      p.vy -= T.gravity * dt;
      p.y += p.vy * dt;
      if (p.y <= 0) { p.y = 0; p.vy = this.state === 'wipe' && p.vy < -200 ? -p.vy * 0.35 : 0; p.grounded = true; }
      if (this.state === 'finish' && Math.random() < dt * 40) {
        this._burst(p.x + (Math.random() - 0.3) * 500, 240 + Math.random() * 120, `hsl(${Math.random() * 360},90%,65%)`, 1, { speed: 120, life: 1.2, g: 500 });
      }
      if (this.endT > (this.state === 'finish' ? 2.2 : 1.5)) this._showResults();
      return;
    }

    // --- timers ---
    this.boostT = Math.max(0, this.boostT - dt);
    this.rushT = Math.max(0, this.rushT - dt);
    this.magnetT = Math.max(0, this.magnetT - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.zoneCardT = Math.max(0, this.zoneCardT - dt);
    this.coinPitchT -= dt;
    if (this.coinPitchT <= 0) this.coinPitch = 0;
    this.pace = Math.min(1, this.pace + dt / T.paceSeconds);
    for (let i = 0; i < L.triggers.length; i++) {
      const tr = L.triggers[i];
      if (!tr.fired && p.x >= tr.x) { tr.fired = true; this._headline(tr.idx); }
    }

    if (p.swing) { this._stepSwing(dt); this._collectPickups(dt); return; }
    if (this.loopRun) { this._stepLoop(dt); this._collectPickups(dt); return; }

    // --- horizontal speed ---
    if (!this.launched) {
      let target = T.baseSpeed + T.paceSpeed * this.pace;
      if (this.boostT > 0) target += T.boostSpeed;
      if (this.rushT > 0) target = Math.max(target, T.rushSpeed);
      const accel = p.vx < target ? 520 : 260;
      p.vx += Math.sign(target - p.vx) * Math.min(Math.abs(target - p.vx), accel * dt);
    }
    p.x += p.vx * dt;
    p.runPhase += p.vx * dt * 0.045;

    // --- vertical ---
    const prevY = p.y;
    if (!p.grounded) {
      p.vy -= T.gravity * dt;
      p.y += p.vy * dt;
      p.spin += dt * (10 + p.vx * 0.02);
    }
    p.coyote = Math.max(0, p.coyote - dt);
    p.buffer = Math.max(0, p.buffer - dt);

    // What is under the player's feet right now?
    let floor = null;
    const pitHere = this._pitAt(p.x);
    if (!pitHere) floor = 0;
    for (let i = 0; i < L.plats.length; i++) {
      const pl = L.plats[i];
      if (p.x < pl.x0 - 10 || p.x > pl.x1 + 10) continue;
      // One-way: only catches you coming down from above it.
      if (prevY >= pl.y - 0.01 && (floor === null || pl.y > floor)) floor = pl.y;
    }

    if (p.grounded) {
      if (floor === null || floor < p.y - 0.5) {
        // Ran off an edge.
        p.grounded = false;
        p.coyote = T.coyote;
        p.vy = 0;
        p.canCut = false;
      } else {
        p.y = floor;
      }
    } else if (p.vy <= 0 && floor !== null && p.y <= floor) {
      if (floor === 0 && !pitHere && prevY < -24) {
        this._pitFall(); // slammed into the far wall of a pit, well below the lip
      } else {
        p.y = floor; // (a near-miss on the far lip counts as making it)
        this._land();
      }
    }
    if (pitHere && p.y < -110) this._pitFall();

    // --- pads ---
    for (let i = 0; i < L.pads.length; i++) {
      const pad = L.pads[i];
      if (p.x < pad.x || p.x > pad.x + pad.w || p.y > 6) continue;
      if (pad.kind === 'spring' && p.vy <= 0) {
        p.vy = T.springV; p.grounded = false; p.airJumps = 1; p.canCut = false; p.coyote = 0; p.squash = -0.5;
        pad.pop = 0.25;
        this._burst(p.x, 4, '#e8f6ff', 14, { speed: 220, up: 160, life: 0.4 });
        this._sfx('spring');
      } else if (pad.kind === 'boost' && !pad.used) {
        pad.used = true;
        this.boostT = T.boostTime;
        this._addScore(50, p.x, p.y + 60);
        this.shake = Math.max(this.shake, 5);
        this._sfx('boost');
      }
    }

    if (p.buffer > 0 && p.grounded) this._jump(T.jumpV, false);

    // --- hanging bars: catch one by passing close to it in the air ---
    if (!p.grounded) {
      for (let i = 0; i < L.bars.length; i++) {
        const b = L.bars[i];
        if (b.cool > 0) { b.cool -= dt; continue; }
        const dx = p.x - b.x, dy = (p.y + 20) - b.y;
        if (Math.abs(dx) > 34 || Math.abs(dy) > T.swingGrab) continue;
        p.swing = { bar: b, th: Math.atan2(dx, -dy), w: Math.max(7, p.vx / T.swingR), revs: 0 };
        p.vy = 0;
        p.canCut = false;
        this.stompChain = 0;
        this._burst(b.x, b.y, '#ffe46b', 8, { speed: 160, life: 0.3 });
        this._sfx('grab');
        break;
      }
      if (p.swing) { this._stepSwing(0); return; }
    }

    // --- finale: loop, then kicker ---
    if (L.loopX && !this.loopDone && !this.loopRun && p.x >= L.loopX) {
      this.loopRun = { phi: 0 };
      p.grounded = false;
      p.canCut = false;
      this._sfx('spring');
      return;
    }
    if (L.kickerX && !this.launched && p.x >= L.kickerX && p.y < 30) {
      this.launched = true;
      p.vx = T.launchVX;
      p.vy = T.launchVY + T.launchVYPace * this.pace;
      p.grounded = false;
      p.airJumps = 1;
      p.canCut = false;
      this.shake = 10;
      this.flash = 1;
      this._burst(p.x, 10, '#ffffff', 24, { speed: 380, up: 200, life: 0.6 });
      this._sfx('boost');
    }

    this._collideObstacles(dt, prevY);
    this._collectPickups(dt);

    // --- zones / finish ---
    const zi = this._zoneAt(p.x);
    if (zi !== this.zoneIdx) { this.zoneIdx = zi; this.zoneCardT = 2.4; this._sfx('zone'); }
    if (p.x >= L.finishX) {
      this.state = 'finish';
      this.endT = 0;
      this.finishedOnce = true;
      this.poleHit = true;
      this.poleY = Math.max(0, p.y);
      // Flagpole tiers by how high up her you hit.
      const h = this.poleY;
      const bonus = h >= 400 ? 5000 : h >= 300 ? 2000 : h >= 200 ? 1000 : h >= 100 ? 400 : 100;
      this.poleBonus = bonus;
      this._addScore(bonus, p.x - 40, p.y + 60);
      this._addScore(this.hearts * 500, p.x, p.y + 90);
      this.flash = 1;
      this.shake = 10;
      this._sfx('finish');
      this._stopMusic();
    }
  }

  _land() {
    const p = this.p;
    if (p.vy < -500) this._burst(p.x, p.y + 2, '#cfc8ba', 8, { speed: 130, up: 40, life: 0.3 });
    p.squash = Math.min(0.45, -p.vy / 2400);
    p.vy = 0;
    p.grounded = true;
    p.airJumps = 1;
    p.canCut = false;
    p.spin = 0;
    this.stompChain = 0;
  }

  // Pendulum around the bar: spins faster the longer you hang on. Tap to
  // let go -- launch height depends on how close to the ideal angle (low
  // on the front side, swinging up) you release. Never punishing: even
  // a bad release throws you up and forward.
  _stepSwing(dt) {
    const p = this.p, T = RUSH_TUNING, sw = p.swing;
    sw.w = Math.min(15, sw.w + 7 * dt);
    sw.th += sw.w * dt;
    sw.revs += (sw.w * dt) / (Math.PI * 2);
    p.x = sw.bar.x + Math.sin(sw.th) * T.swingR;
    p.y = sw.bar.y - Math.cos(sw.th) * T.swingR - 20;
    p.spin = sw.th;
    if (sw.revs > 2.3) this._releaseSwing(true);
  }

  _releaseSwing(auto) {
    const p = this.p, T = RUSH_TUNING, sw = p.swing;
    if (!sw) return;
    let a = sw.th % (Math.PI * 2);
    if (a < 0) a += Math.PI * 2;
    let off = Math.abs(a - T.swingIdeal);
    off = Math.min(off, Math.PI * 2 - off);
    const q = auto ? 0.55 : Math.max(0.55, 1 - off / Math.PI);
    p.swing = null;
    sw.bar.cool = 0.5;
    p.vy = 650 + 650 * q;
    p.vx = Math.max(p.vx, 420 + 220 * q);
    p.grounded = false;
    p.airJumps = 1;
    p.canCut = false;
    p.y = Math.max(p.y, sw.bar.y - T.swingR - 20);
    const perfect = q > 0.86;
    this._addScore(Math.round(150 * q) * (perfect ? 2 : 1), p.x, p.y + 60, perfect ? 'PERFECT' : '');
    this._burst(p.x, p.y + 20, perfect ? '#ffd84a' : '#e8f6ff', perfect ? 20 : 10, { speed: 260, life: 0.45 });
    if (perfect) { this.flash = 0.6; this.shake = Math.max(this.shake, 6); }
    this._sfx(perfect ? 'power' : 'djump');
  }

  // Scripted ride around the inside of the loop, then out the bottom
  // faster than you went in.
  _stepLoop(dt) {
    const p = this.p, T = RUSH_TUNING, L = this.level, lr = this.loopRun;
    const speed = Math.max(p.vx, 600);
    const r = T.loopR - 22;
    lr.phi += (speed / r) * dt;
    if (lr.phi >= Math.PI * 2) {
      this.loopRun = null;
      this.loopDone = true;
      p.x = L.loopX + 1;
      p.y = 0;
      p.vx = Math.max(p.vx, 660);
      this._land();
      this.shake = 6;
      return;
    }
    p.x = L.loopX + Math.sin(lr.phi) * r;
    p.y = T.loopR - Math.cos(lr.phi) * r - 20;
    p.spin = lr.phi * 2;
    if (Math.random() < dt * 30) this._burst(p.x, p.y + 20, `hsl(${(this.t * 500) % 360},100%,65%)`, 1, { speed: 60, life: 0.4, g: 0 });
  }

  // Camera eases after the runner instead of being bolted to it, so the
  // swing/loop motion reads as motion instead of the world shaking, and
  // rises when you go high (bars, the launch).
  _updateCamera(dt) {
    const p = this.p, L = this.level;
    let fx = p.x;
    if (p.swing) fx = p.swing.bar.x + 30;
    if (this.loopRun) fx = L.loopX + 40;
    this.focusX += (fx - this.focusX) * Math.min(1, dt * 16);
    const ty = Math.max(0, p.y - 190);
    this.camY += (ty - this.camY) * Math.min(1, dt * 6);
  }

  _headline(i) {
    const text = RUSH_HEADLINES[i];
    if (!text) return;
    this.headline = { text, life: 1.9, max: 1.9, hue: Math.random() * 360 };
    this.shake = Math.max(this.shake, 8);
  }

  _pitFall() {
    const p = this.p;
    this._hurt(true);
    if (this.state !== 'run') return;
    // Thrown forward out of the hole, fast enough to clear what's left
    // of it from any point inside, with a fresh air jump. Always forward:
    // there is no position to get stuck retrying from.
    p.y = Math.max(p.y, -60);
    p.vy = 1000;
    p.vx = Math.max(p.vx, 380);
    p.grounded = false;
    p.airJumps = 1;
    p.canCut = false;
    this._burst(p.x, 0, '#ffb347', 16, { speed: 260, up: 200, life: 0.5 });
  }

  _hurt(fromPit) {
    const p = this.p, T = RUSH_TUNING;
    if (this.invuln > 0 && !fromPit) return;
    if (this.invuln <= 0 && this.rushT <= 0) {
      this.hearts--;
      this.pace = 0;
      this.coinStreak = 0;
      this.boostT = 0;
      this.flash = -1;
      this.shake = 14;
      this.freeze = 0.08;
      this._sfx('hurt');
      this._burst(p.x, p.y + 20, '#ff5a5a', 14, { speed: 260, up: 120, life: 0.5 });
    }
    this.invuln = T.invuln;
    if (!fromPit) {
      p.vx = 170;
      p.vy = 430;
      p.grounded = false;
      p.canCut = false;
    }
    if (this.hearts <= 0) {
      this.state = 'wipe';
      this.endT = 0;
      p.vy = 620;
      p.grounded = false;
      this._stopMusic();
      this._sfx('wipe');
    }
  }

  _collideObstacles(dt, prevY) {
    const p = this.p, T = RUSH_TUNING, obs = this.level.obs;
    const half = 13, ph = 38;
    for (let i = 0; i < obs.length; i++) {
      const o = obs[i];
      if (!o.alive) continue;
      if (o.x > p.x + 900) break;
      if (o.x + o.w < p.x - 400) continue;
      // Movers only wake up once they're nearly on screen, so they are
      // where the level put them when you first see them.
      if (o.vx && o.x - p.x < 760) o.x += o.vx * dt;
      if (p.x + half < o.x || p.x - half > o.x + o.w) continue;
      const top = o.y + o.h;
      if (p.y >= top || p.y + ph <= o.y) continue;

      if (this.rushT > 0) {
        o.alive = false;
        this._addScore(150, o.x + o.w / 2, top + 30);
        this._burst(o.x + o.w / 2, o.y + o.h / 2, '#ffffff', 16, { speed: 420, up: 160, life: 0.6, g: 900 });
        this.shake = Math.max(this.shake, 7);
        this._sfx('smash');
        continue;
      }
      // Coming down onto it from above (or onto its upper half): a stomp.
      const fromAbove = p.vy < 0 && (prevY >= top - 14 || p.y > o.y + o.h * 0.25);
      if (fromAbove) {
        p.y = top;
        p.vy = o.bounce + (p.held ? 110 : 0);
        p.grounded = false;
        p.airJumps = 1;
        p.canCut = false;
        p.squash = -0.4;
        this.stompChain++;
        this.bestChain = Math.max(this.bestChain, this.stompChain);
        if (!o.scored) this._addScore(Math.min(1600, 100 * Math.pow(2, this.stompChain - 1)), o.x + o.w / 2, top + 34, this.stompChain > 1 ? `x${this.stompChain}` : '');
        o.scored = true;
        if (o.solid) o.squish = 0.2; else o.alive = false;
        this._burst(o.x + o.w / 2, top, o.solid ? '#ffe46b' : '#e9e9e9', 12, { speed: 240, up: 120, life: 0.45 });
        this.freeze = 0.045;
        this.shake = Math.max(this.shake, 4 + this.stompChain);
        this._sfx('stomp');
        continue;
      }
      if (this.invuln > 0) continue;
      // Damage box is smaller than the drawn sprite (birds/rats much
      // smaller) -- clipping a wingtip on the way down shouldn't cost a heart.
      const ins = (o.type === 'bird' || o.type === 'rat') ? o.w * 0.28 : 5;
      if (p.x + half < o.x + ins || p.x - half > o.x + o.w - ins || p.y >= top - ins * 0.6) continue;
      this._hurt(false);
      if (this.state !== 'run') return;
    }
  }

  _collectPickups(dt) {
    const p = this.p, T = RUSH_TUNING, picks = this.level.picks;
    const cy = p.y + 20;
    for (let i = 0; i < picks.length; i++) {
      const c = picks[i];
      if (c.taken) continue;
      if (c.x > p.x + 400) break;
      if (c.x < p.x - 200) continue;
      const dx = c.x - p.x, dy = c.y - cy;
      const d2 = dx * dx + dy * dy;
      if (c.kind === 'coin' && this.magnetT > 0 && d2 < T.magnetRange * T.magnetRange) {
        const d = Math.sqrt(d2) || 1;
        const pull = 900 * dt;
        c.x -= (dx / d) * Math.min(d, pull) - p.vx * dt * 0.9;
        c.y -= (dy / d) * Math.min(d, pull);
      }
      const reach = c.kind === 'coin' ? 30 : 38;
      if (Math.abs(dx) > reach || Math.abs(dy) > reach + 6) continue;
      c.taken = true;
      if (c.kind === 'coin') {
        this.coins++;
        this.coinStreak++;
        this.coinPitch = Math.min(14, this.coinPitch + 1);
        this.coinPitchT = 0.5;
        this._addScore(10 * this.mult(), 0, 0, null);
        this._burst(c.x, c.y, '#ffd84a', 4, { speed: 110, life: 0.25 });
        this._sfx('coin');
      } else {
        if (c.kind === 'rush') { this.rushT = T.rushTime; this.invuln = Math.max(this.invuln, 0.2); }
        if (c.kind === 'magnet') this.magnetT = T.magnetTime;
        if (c.kind === 'heart') this.hearts = Math.min(T.maxHearts, this.hearts + 1);
        this._addScore(200, c.x, c.y + 30);
        this.flash = 1;
        this.shake = Math.max(this.shake, 6);
        this._burst(c.x, c.y, '#ffffff', 22, { speed: 320, life: 0.6 });
        this._sfx('power');
      }
    }
  }

  mult() { return Math.min(8, 1 + Math.floor(this.coinStreak / 12)); }

  _addScore(n, x, y, label) {
    this.score += n;
    if (label === null) return;
    this.popups.push({ x, y, text: `+${n}${label ? ' ' + label : ''}`, life: 0.9, max: 0.9, big: n >= 200 });
  }

  _burst(x, y, color, n, o) {
    o = o || {};
    if (this.particles.length > 260) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = (o.speed || 200) * (0.35 + Math.random() * 0.8);
      const life = (o.life || 0.4) * (0.6 + Math.random() * 0.6);
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s + (o.up || 0), g: o.g != null ? o.g : 700, life, max: life, color, r: 2 + Math.random() * 3 });
    }
  }

  _updateFx(dt) {
    for (let i = 0; i < this.particles.length; i++) {
      const q = this.particles[i];
      q.x += q.vx * dt; q.y += q.vy * dt; q.vy -= q.g * dt; q.life -= dt;
    }
    if (this.particles.length) this.particles = this.particles.filter(q => q.life > 0);
    for (let i = 0; i < this.popups.length; i++) { this.popups[i].y += 60 * dt; this.popups[i].life -= dt; }
    if (this.popups.length) this.popups = this.popups.filter(q => q.life > 0);
    this.shake = Math.max(0, this.shake - dt * 40);
    if (this.headline) { this.headline.life -= dt; if (this.headline.life <= 0) this.headline = null; }
    this.flash -= Math.sign(this.flash) * Math.min(Math.abs(this.flash), dt * 3.5);
    const p = this.p;
    p.squash += (0 - p.squash) * Math.min(1, dt * 14);
    const pads = this.level.pads;
    for (let i = 0; i < pads.length; i++) if (pads[i].pop > 0) pads[i].pop -= dt;
    const obs = this.level.obs;
    for (let i = 0; i < obs.length; i++) if (obs[i].squish > 0) obs[i].squish -= dt;
  }

  _showResults() {
    if (this.state === 'results') return;
    const wiped = this.state === 'wipe';
    this.state = 'results';
    this.bestScore = Math.max(this.bestScore, this.score);
    document.getElementById('rush-results-title').textContent = wiped ? 'WIPED OUT' : 'FINISH';
    const rows = [
      ['Score', this.score],
      ['Bagels', this.coins],
      ['Best stomp chain', `${this.bestChain}x`],
    ];
    if (!wiped) rows.push(['Statue bonus', this.poleBonus || 0], ['Hearts left', this.hearts]);
    if (!this.finishedOnce) rows.push(['Recovery', `${RUSH_WIPEOUT_HOURS} hours lost`]);
    document.getElementById('rush-results-stats').innerHTML =
      rows.map(([k, v]) => `<p class="cannon-stat">${k}: <span>${v}</span></p>`).join('');
    document.getElementById('rush-results').classList.remove('hidden');
  }

  // ------------------------------------------------------------------
  // AUDIO -- all synthesized, no assets
  // ------------------------------------------------------------------

  _ensureAudio() {
    if (this.audio) { if (this.audio.state === 'suspended') this.audio.resume().catch(() => {}); return; }
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) this.audio = new Ctx();
    } catch (e) { this.audio = null; }
  }

  _tone(type, f0, f1, dur, vol, when) {
    const a = this.audio;
    if (!a) return;
    try {
      const t = when || a.currentTime;
      const osc = a.createOscillator(), g = a.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(f0, t);
      if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(g).connect(a.destination);
      osc.start(t); osc.stop(t + dur + 0.02);
    } catch (e) { /* ignore */ }
  }

  _sfx(name) {
    if (!this.audio) return;
    switch (name) {
      case 'jump':   this._tone('square', 300, 620, 0.12, 0.07); break;
      case 'djump':  this._tone('square', 520, 980, 0.12, 0.07); break;
      case 'coin':   this._tone('triangle', 880 * Math.pow(1.06, this.coinPitch), 880 * Math.pow(1.06, this.coinPitch), 0.08, 0.1); break;
      case 'stomp':  this._tone('sine', 220 + this.stompChain * 60, 70, 0.16, 0.3); this._tone('square', 700 + this.stompChain * 120, 900 + this.stompChain * 120, 0.07, 0.05); break;
      case 'smash':  this._tone('sawtooth', 240, 50, 0.2, 0.16); break;
      case 'spring': this._tone('sine', 200, 900, 0.22, 0.16); break;
      case 'boost':  this._tone('sawtooth', 180, 720, 0.3, 0.1); break;
      case 'hurt':   this._tone('sawtooth', 400, 60, 0.35, 0.2); break;
      case 'wipe':   this._tone('sawtooth', 300, 40, 0.9, 0.2); break;
      case 'zone':   this._tone('triangle', 440, 880, 0.3, 0.1); break;
      case 'grab':   this._tone('square', 330, 440, 0.08, 0.08); break;
      case 'power':  [523, 659, 784, 1047].forEach((f, i) => this._tone('square', f, f, 0.1, 0.07, this.audio.currentTime + i * 0.06)); break;
      case 'finish': [523, 659, 784, 1047, 1319].forEach((f, i) => this._tone('triangle', f, f, 0.22, 0.12, this.audio.currentTime + i * 0.1)); break;
    }
  }

  // A driving 16th-note loop whose tempo follows how fast you're going.
  _startMusic() {
    if (!this.audio || this._music) return;
    let stepIdx = 0;
    let next = this.audio.currentTime + 0.05;
    const bass = [55, 55, 110, 55, 65.4, 65.4, 130.8, 65.4, 73.4, 73.4, 146.8, 73.4, 49, 49, 98, 49];
    this._music = setInterval(() => {
      const a = this.audio;
      if (!a) return;
      while (next < a.currentTime + 0.12) {
        const bpm = 132 + 44 * this.pace + (this.rushT > 0 ? 22 : 0);
        const s = stepIdx % 16;
        if (s % 4 === 0) this._tone('sine', 130, 42, 0.14, 0.32, next);
        if (s % 4 === 2) this._tone('square', 6000, 5000, 0.03, 0.02, next);
        if (s % 2 === 0) this._tone('sawtooth', bass[(stepIdx >> 1) % 16], bass[(stepIdx >> 1) % 16], 0.11, 0.07, next);
        next += 60 / bpm / 4;
        stepIdx++;
      }
    }, 30);
  }

  _stopMusic() {
    if (this._music) clearInterval(this._music);
    this._music = null;
  }

  // ------------------------------------------------------------------
  // RENDER
  // ------------------------------------------------------------------

  render() {
    const ctx = this.ctx, W = this.W, H = this.H, T = RUSH_TUNING, p = this.p, L = this.level;
    if (!ctx || !W) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const s = this.s = Math.min(W / T.viewW, H / T.viewH);
    // gy = screen y of street level; it slides down as the camera rises.
    const gy = this.gy = Math.round(H * 0.74 + this.camY * s);
    const camX = this.camX = this.focusX - (W / s) * 0.2;
    const X = (wx) => (wx - camX) * s;
    const Y = (wy) => gy - wy * s;
    const fast = Math.max(0, (p.vx - T.baseSpeed) / (T.rushSpeed - T.baseSpeed));
    const rush = this.rushT > 0;
    // The faster you go, the further the whole palette drifts off true.
    const hue = (rush ? this.t * 260 : fast * 50 * Math.sin(this.t * 1.7)) | 0;

    ctx.save();
    if (this.shake > 0.2) ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);

    // --- background, cross-faded across each zone boundary ---
    const zi = this._zoneAt(p.x);
    this._drawBg(zi, hue, 1);
    const nextZ = L.zones[zi + 1];
    if (nextZ) {
      const a = 1 - (nextZ.x0 - p.x) / 700;
      if (a > 0) this._drawBg(zi + 1, hue, Math.min(1, a));
    }

    // --- ground ---
    const x0 = camX - 40, x1 = camX + W / s + 40;
    this._drawGround(x0, x1, X, Y, hue);

    // --- finale set pieces ---
    const R = T.loopR;
    if (L.loopX && L.loopX - R < x1 && L.loopX + R > x0) this._drawLoop(X(L.loopX), Y(R), R * s);
    if (L.kickerX && L.kickerX - 100 < x1 && L.kickerX > x0) {
      const kx = X(L.kickerX), kw = 100 * s, kh = 34 * s;
      ctx.fillStyle = '#ffd84a';
      ctx.beginPath(); ctx.moveTo(kx - kw, gy); ctx.lineTo(kx, gy - kh); ctx.lineTo(kx, gy); ctx.fill();
      ctx.fillStyle = '#111';
      for (let k = 1; k < 5; k++) {
        const fx = kx - kw + (k / 5) * kw;
        ctx.beginPath(); ctx.moveTo(fx, gy); ctx.lineTo(fx + 8 * s, gy - (k / 5) * kh - 3 * s); ctx.lineTo(fx + 14 * s, gy - (k / 5) * kh - 3 * s); ctx.lineTo(fx + 6 * s, gy); ctx.fill();
      }
    }
    if (L.statueX && L.statueX - 120 < x1 && L.statueX + 160 > x0) this._drawStatue(X(L.statueX), gy, s);

    // --- hanging bars ---
    for (let i = 0; i < L.bars.length; i++) {
      const b = L.bars[i];
      if (b.x < x0 - 60 || b.x > x1 + 60) continue;
      const bx = X(b.x), by = Y(b.y), hw = 30 * s;
      const zi = this._zoneAt(b.x);
      ctx.strokeStyle = zi === 2 ? '#6b5a48' : '#9aa3ae'; ctx.lineWidth = 2 * s;
      ctx.beginPath(); ctx.moveTo(bx - hw, by); ctx.lineTo(bx - hw * 0.6, 0); ctx.moveTo(bx + hw, by); ctx.lineTo(bx + hw * 0.6, 0); ctx.stroke();
      const glow = 0.4 + 0.3 * Math.sin(this.t * 6 + i);
      ctx.strokeStyle = `rgba(255,228,107,${glow})`; ctx.lineWidth = 12 * s; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(bx - hw, by); ctx.lineTo(bx + hw, by); ctx.stroke();
      ctx.strokeStyle = zi === 1 ? '#e6c229' : '#d8dde4'; ctx.lineWidth = 6 * s;
      ctx.beginPath(); ctx.moveTo(bx - hw, by); ctx.lineTo(bx + hw, by); ctx.stroke();
      ctx.lineCap = 'butt';
    }

    // --- pads ---
    for (let i = 0; i < L.pads.length; i++) {
      const pad = L.pads[i];
      if (pad.x > x1 || pad.x + pad.w < x0) continue;
      const px = X(pad.x), pw = pad.w * s;
      if (pad.kind === 'spring') {
        const up = (pad.pop > 0 ? 16 : 0) * s;
        ctx.fillStyle = '#5d6470'; ctx.fillRect(px, gy - 6 * s, pw, 6 * s);
        ctx.strokeStyle = '#cfd6e0'; ctx.lineWidth = 2 * s;
        ctx.beginPath();
        for (let k = 0; k <= 4; k++) ctx.lineTo(px + (k % 2 ? pw * 0.8 : pw * 0.2), gy - 6 * s - (k / 4) * (10 * s + up));
        ctx.stroke();
        ctx.fillStyle = '#ff4f6d'; ctx.fillRect(px - 2 * s, gy - 22 * s - up, pw + 4 * s, 7 * s);
        // steam puffs: reads as a street vent, and as "this goes up"
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        for (let k = 0; k < 3; k++) {
          const ph = (this.t * 1.4 + k / 3) % 1;
          ctx.beginPath(); ctx.arc(px + pw / 2 + Math.sin(k * 9 + this.t * 3) * 6 * s, gy - 28 * s - ph * 60 * s, (4 + ph * 7) * s, 0, 6.3); ctx.fill();
        }
      } else {
        ctx.fillStyle = pad.used ? '#3a6a4a' : '#22e07a';
        ctx.fillRect(px, gy - 5 * s, pw, 5 * s);
        ctx.fillStyle = '#eaffef';
        for (let k = 0; k < 3; k++) {
          const cx = px + ((k / 3 + this.t * 1.5) % 1) * pw;
          ctx.beginPath(); ctx.moveTo(cx, gy - 5 * s); ctx.lineTo(cx + 9 * s, gy - 12 * s); ctx.lineTo(cx, gy - 19 * s);
          ctx.lineTo(cx + 5 * s, gy - 19 * s); ctx.lineTo(cx + 14 * s, gy - 12 * s); ctx.lineTo(cx + 5 * s, gy - 5 * s); ctx.fill();
        }
      }
    }

    // --- platforms ---
    for (let i = 0; i < L.plats.length; i++) {
      const pl = L.plats[i];
      if (pl.x0 > x1 || pl.x1 < x0) continue;
      const a = X(pl.x0), b = X(pl.x1), py = Y(pl.y);
      ctx.fillStyle = '#c9a15a'; ctx.fillRect(a, py, b - a, 6 * s);
      ctx.fillStyle = '#8a6a34'; ctx.fillRect(a, py + 6 * s, b - a, 3 * s);
      ctx.strokeStyle = 'rgba(190,200,215,0.55)'; ctx.lineWidth = 2 * s;
      for (let px = pl.x0 + 8; px <= pl.x1 - 4; px += 92) {
        ctx.beginPath(); ctx.moveTo(X(px), py + 9 * s); ctx.lineTo(X(px), gy); ctx.stroke();
      }
    }

    // --- pickups ---
    for (let i = 0; i < L.picks.length; i++) {
      const c = L.picks[i];
      if (c.taken || c.x < x0) continue;
      if (c.x > x1) break;
      this._drawPickup(c, X(c.x), Y(c.y), s, i);
    }

    // --- obstacles ---
    for (let i = 0; i < L.obs.length; i++) {
      const o = L.obs[i];
      if (!o.alive || o.x + o.w < x0) continue;
      if (o.x > x1) break;
      this._drawObstacle(o, X(o.x), Y(o.y), s, this._zoneAt(o.x));
    }

    // --- player ---
    this._drawPlayer(X, Y, s, fast, rush);

    // --- particles / popups ---
    for (let i = 0; i < this.particles.length; i++) {
      const q = this.particles[i];
      ctx.globalAlpha = Math.max(0, q.life / q.max);
      ctx.fillStyle = q.color;
      ctx.fillRect(X(q.x) - q.r * s / 2, Y(q.y) - q.r * s / 2, q.r * s, q.r * s);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    for (let i = 0; i < this.popups.length; i++) {
      const q = this.popups[i];
      ctx.globalAlpha = Math.min(1, q.life / (q.max * 0.5));
      ctx.font = `bold ${Math.round((q.big ? 26 : 18) * Math.max(0.8, s))}px VT323, monospace`;
      ctx.fillStyle = '#000'; ctx.fillText(q.text, X(q.x) + 2, Y(q.y) + 2);
      ctx.fillStyle = q.big ? '#ffd84a' : '#fff'; ctx.fillText(q.text, X(q.x), Y(q.y));
    }
    ctx.globalAlpha = 1;

    // --- speed lines ---
    if (fast > 0.25 && this.state === 'run') {
      ctx.strokeStyle = rush ? `hsla(${(this.t * 500) % 360},100%,75%,0.5)` : `rgba(255,255,255,${0.12 + fast * 0.25})`;
      ctx.lineWidth = 2;
      const n = Math.round(6 + fast * 16);
      for (let i = 0; i < n; i++) {
        const ly = rushHash(i + Math.floor(this.t * 14)) * H * 0.9;
        const lx = W - ((this.t * (900 + i * 130) + i * 197) % (W + 300));
        ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + 60 + fast * 160, ly); ctx.stroke();
      }
    }
    ctx.restore();

    if (rush) {
      ctx.fillStyle = `hsla(${(this.t * 300) % 360},100%,60%,0.13)`;
      ctx.fillRect(0, 0, W, H);
    }
    if (this.flash !== 0) {
      ctx.fillStyle = this.flash > 0 ? `rgba(255,255,255,${this.flash * 0.35})` : `rgba(255,40,40,${-this.flash * 0.4})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (this.headline && this.state !== 'ready') this._drawHeadline();
    this._drawHud();
  }

  _drawBg(zi, hue, alpha) {
    const ctx = this.ctx, W = this.W, H = this.H, gy = this.gy, cam = this.camX, s = this.s, t = this.t;
    ctx.globalAlpha = alpha;
    const hsl = (h, sat, l, a = 1) => `hsla(${(h + hue + 360) % 360},${sat}%,${l}%,${a})`;
    if (zi === 0) {
      const g = ctx.createLinearGradient(0, 0, 0, gy);
      g.addColorStop(0, hsl(265, 60, 8)); g.addColorStop(1, hsl(300, 55, 26));
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      // far skyline
      const bw = 70 * s, off = (cam * 0.12 * s) % bw, base = Math.floor(cam * 0.12 * s / bw);
      for (let i = -1; i < W / bw + 2; i++) {
        const k = base + i, h = (0.25 + rushHash(k) * 0.4) * gy;
        const bx = i * bw - off;
        ctx.fillStyle = hsl(270, 40, 13);
        ctx.fillRect(bx, gy - h, bw - 4, h);
        ctx.fillStyle = hsl(48, 90, 70, 0.55);
        for (let r = 0; r < 7; r++) for (let c = 0; c < 3; c++) {
          if (rushHash(k * 31 + r * 7 + c) > 0.55) ctx.fillRect(bx + 10 * s + c * 18 * s, gy - h + 12 * s + r * 20 * s, 7 * s, 9 * s);
        }
      }
      // billboards
      const mw = 190 * s, moff = (cam * 0.4 * s) % mw, mbase = Math.floor(cam * 0.4 * s / mw);
      for (let i = -1; i < W / mw + 2; i++) {
        const k = mbase + i, bx = i * mw - moff, bh = (70 + rushHash(k + 9) * 80) * s, by = gy - (90 + rushHash(k + 3) * 110) * s - bh;
        ctx.fillStyle = hsl(250, 30, 10); ctx.fillRect(bx + 20 * s, by + bh, 8 * s, gy - by - bh);
        ctx.fillStyle = hsl(250, 30, 10); ctx.fillRect(bx, by, 130 * s, bh);
        const bhue = rushHash(k * 5) * 360;
        ctx.fillStyle = hsl(bhue, 95, 58 + 10 * Math.sin(t * 5 + k)); ctx.fillRect(bx + 5 * s, by + 5 * s, 120 * s, bh - 10 * s);
        ctx.fillStyle = hsl(bhue + 150, 95, 70); ctx.fillRect(bx + 14 * s, by + 14 * s, 50 * s * (0.5 + 0.5 * Math.sin(t * 3 + k * 2)), bh * 0.3);
        ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillRect(bx + 14 * s, by + bh * 0.62, 90 * s, 5 * s);
      }
    } else if (zi === 1) {
      ctx.fillStyle = hsl(240, 15, 6); ctx.fillRect(0, 0, W, H);
      const wallH = Math.max(250 * s, gy * 0.62), wallTop = gy - wallH;
      ctx.fillStyle = hsl(45, 12, 78); ctx.fillRect(0, wallTop, W, wallH);
      ctx.fillStyle = hsl(140, 70, 30); ctx.fillRect(0, wallTop + 46 * s, W, 16 * s);
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, gy - 100 * s, W, 100 * s);
      const tw = 26 * s, toff = (cam * 0.6 * s) % tw;
      ctx.strokeStyle = 'rgba(0,0,0,0.13)'; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = -toff; x < W; x += tw) { ctx.moveTo(x, wallTop); ctx.lineTo(x, gy); }
      for (let y = wallTop; y < gy; y += 13 * s) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
      ctx.stroke();
      // ceiling lights streaking by
      const lw = 300 * s, loff = (cam * 0.8 * s) % lw;
      for (let x = -loff; x < W + lw; x += lw) {
        ctx.fillStyle = hsl(55, 90, 85, 0.9); ctx.fillRect(x, wallTop - 14 * s, 110 * s, 8 * s);
        ctx.fillStyle = hsl(55, 90, 85, 0.08); ctx.fillRect(x - 30 * s, wallTop - 6 * s, 170 * s, wallH + 6 * s);
      }
      // steel columns
      const cw = 260 * s, coff = (cam * 0.85 * s) % cw;
      for (let x = -coff; x < W + cw; x += cw) {
        ctx.fillStyle = hsl(215, 25, 16); ctx.fillRect(x, 0, 20 * s, gy);
        ctx.fillStyle = hsl(215, 25, 26); ctx.fillRect(x + 4 * s, 0, 4 * s, gy);
      }
    } else {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, hsl(215, 60, 55)); g.addColorStop(0.5, hsl(28, 95, 72)); g.addColorStop(0.78, hsl(12, 95, 62)); g.addColorStop(1, hsl(215, 50, 30));
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = hsl(45, 100, 80); ctx.beginPath(); ctx.arc(W * 0.7, gy - 40 * s, 60 * s, 0, 6.3); ctx.fill();
      ctx.fillStyle = hsl(45, 100, 80, 0.25); ctx.beginPath(); ctx.arc(W * 0.7, gy - 40 * s, 95 * s, 0, 6.3); ctx.fill();
      // skyline across the water
      const bw = 46 * s, off = (cam * 0.06 * s) % bw, base = Math.floor(cam * 0.06 * s / bw);
      ctx.fillStyle = hsl(262, 35, 34);
      for (let i = -1; i < W / bw + 2; i++) {
        const h = (30 + rushHash(base + i + 500) * 150) * s;
        ctx.fillRect(i * bw - off, gy + 30 * s - h, bw - 3, h);
      }
      // river
      ctx.fillStyle = hsl(215, 55, 32); ctx.fillRect(0, gy + 30 * s, W, H);
      ctx.fillStyle = hsl(30, 90, 75, 0.35);
      for (let i = 0; i < 26; i++) {
        const rx = (rushHash(i) * 2000 - cam * 0.2 * s) % (W + 80);
        ctx.fillRect((rx + W + 80) % (W + 80) - 40, gy + (40 + rushHash(i + 60) * 160) * s + Math.sin(t * 2 + i) * 2, 34 * s, 2);
      }
      // suspension cables + stone towers
      const sw = 1500 * s, soff = (cam * 0.7 * s) % sw;
      ctx.strokeStyle = hsl(25, 20, 22, 0.75); ctx.lineWidth = 1.5;
      for (let x0 = -soff - sw; x0 < W + sw; x0 += sw) {
        ctx.beginPath();
        for (let k = 1; k < 22; k++) {
          const cx = x0 + (k / 22) * sw, sag = Math.pow((k / 22) * 2 - 1, 2);
          ctx.moveTo(cx, gy); ctx.lineTo(cx, gy - (60 + sag * 300) * s);
        }
        ctx.stroke();
        ctx.lineWidth = 4 * s;
        ctx.beginPath();
        for (let k = 0; k <= 22; k++) {
          const cx = x0 + (k / 22) * sw, sag = Math.pow((k / 22) * 2 - 1, 2);
          ctx.lineTo(cx, gy - (60 + sag * 300) * s);
        }
        ctx.stroke();
        ctx.lineWidth = 1.5;
        const tx = x0 - 55 * s;
        ctx.fillStyle = hsl(28, 28, 38); ctx.fillRect(tx, gy - 400 * s, 110 * s, 400 * s + H);
        ctx.fillStyle = hsl(28, 95, 72, 0.9);
        for (let a = 0; a < 2; a++) {
          const ax = tx + (16 + a * 46) * s;
          ctx.beginPath(); ctx.moveTo(ax, gy - 110 * s); ctx.lineTo(ax, gy - 290 * s); ctx.lineTo(ax + 16 * s, gy - 330 * s);
          ctx.lineTo(ax + 32 * s, gy - 290 * s); ctx.lineTo(ax + 32 * s, gy - 110 * s); ctx.fill();
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  _drawGround(x0, x1, X, Y, hue) {
    const ctx = this.ctx, H = this.H, gy = this.gy, s = this.s, L = this.level;
    // Solid spans between pits.
    const spans = [];
    let cur = x0;
    for (let i = 0; i < L.pits.length; i++) {
      const pt = L.pits[i];
      if (pt.x1 < x0) continue;
      if (pt.x0 > x1) break;
      if (pt.x0 > cur) spans.push([cur, pt.x0]);
      cur = Math.max(cur, pt.x1);
    }
    if (cur < x1) spans.push([cur, x1]);

    for (let i = 0; i < spans.length; i++) {
      const [a, b] = spans[i];
      const zi = this._zoneAt((a + b) / 2);
      const ax = X(a), bw = X(b) - ax;
      if (zi === 0) {
        ctx.fillStyle = '#1d1d25'; ctx.fillRect(ax, gy, bw, H - gy);
        ctx.fillStyle = '#9a9aa8'; ctx.fillRect(ax, gy, bw, 5 * s);
        ctx.fillStyle = '#e8c33a';
        for (let d = Math.ceil(a / 120) * 120; d < b - 50; d += 120) ctx.fillRect(X(d), gy + 46 * s, 50 * s, 5 * s);
      } else if (zi === 1) {
        ctx.fillStyle = '#34343e'; ctx.fillRect(ax, gy, bw, H - gy);
        ctx.fillStyle = '#e6c229'; ctx.fillRect(ax, gy, bw, 9 * s);
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        for (let d = Math.ceil(a / 14) * 14; d < b; d += 14) ctx.fillRect(X(d), gy + 2 * s, 5 * s, 5 * s);
      } else {
        ctx.fillStyle = '#8a5a35'; ctx.fillRect(ax, gy, bw, 20 * s);
        ctx.fillStyle = '#5c3a20'; ctx.fillRect(ax, gy + 20 * s, bw, 8 * s);
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        for (let d = Math.ceil(a / 26) * 26; d < b; d += 26) ctx.fillRect(X(d), gy, 2, 20 * s);
        ctx.fillStyle = '#3d2716';
        for (let d = Math.ceil(a / 180) * 180; d < b; d += 180) ctx.fillRect(X(d), gy + 28 * s, 12 * s, 60 * s);
      }
    }
    // Pits: hazard-striped lips so the edge reads instantly, and a dark
    // drop on the two street-level zones (the bridge just shows river).
    for (let i = 0; i < L.pits.length; i++) {
      const pt = L.pits[i];
      if (pt.x1 < x0) continue;
      if (pt.x0 > x1) break;
      const ax = X(pt.x0), bx = X(pt.x1);
      if (this._zoneAt(pt.x0) < 2) {
        const g = ctx.createLinearGradient(0, gy, 0, gy + 120 * s);
        g.addColorStop(0, '#16090c'); g.addColorStop(1, '#000');
        ctx.fillStyle = g; ctx.fillRect(ax, gy, bx - ax, H - gy);
      }
      for (let k = 0; k < 2; k++) {
        const ex = k ? bx : ax - 10 * s;
        for (let r = 0; r < 5; r++) {
          ctx.fillStyle = r % 2 ? '#111' : '#ffb400';
          ctx.fillRect(ex, gy + r * 7 * s, 10 * s, 7 * s);
        }
      }
    }
  }

  _drawPickup(c, x, y, s, i) {
    const ctx = this.ctx, t = this.t;
    if (c.kind === 'coin') {
      // A bagel: it was always going to be the ring.
      const squish = Math.abs(Math.cos(t * 5 + i * 0.5));
      ctx.strokeStyle = '#7a4a12'; ctx.lineWidth = 8 * s;
      ctx.beginPath(); ctx.ellipse(x, y, 9 * s * (0.35 + 0.65 * squish), 9 * s, 0, 0, 6.3); ctx.stroke();
      ctx.strokeStyle = '#f2b441'; ctx.lineWidth = 5.5 * s;
      ctx.beginPath(); ctx.ellipse(x, y, 9 * s * (0.35 + 0.65 * squish), 9 * s, 0, 0, 6.3); ctx.stroke();
      return;
    }
    const bob = Math.sin(t * 4) * 5 * s, r = 17 * s;
    y += bob;
    const col = c.kind === 'rush' ? '#ffffff' : c.kind === 'magnet' ? '#ff4f4f' : '#ff5fa2';
    ctx.fillStyle = col; ctx.globalAlpha = 0.25 + 0.15 * Math.sin(t * 8);
    ctx.beginPath(); ctx.arc(x, y, r * 1.7, 0, 6.3); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#16121e'; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.3); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 3 * s; ctx.stroke();
    if (c.kind === 'rush') {
      // little zip bag
      ctx.fillStyle = '#fff'; ctx.fillRect(x - 8 * s, y - 7 * s, 16 * s, 16 * s);
      ctx.fillStyle = '#7ad0ff'; ctx.fillRect(x - 8 * s, y - 10 * s, 16 * s, 4 * s);
      ctx.fillStyle = '#cfd6e0'; ctx.fillRect(x - 5 * s, y + 1 * s, 10 * s, 5 * s);
    } else if (c.kind === 'magnet') {
      ctx.strokeStyle = '#ff4f4f'; ctx.lineWidth = 6 * s;
      ctx.beginPath(); ctx.arc(x, y - 1 * s, 7 * s, Math.PI, 0); ctx.lineTo(x + 7 * s, y + 5 * s); ctx.moveTo(x - 7 * s, y - 1 * s); ctx.lineTo(x - 7 * s, y + 5 * s); ctx.stroke();
      ctx.fillStyle = '#e8e8e8'; ctx.fillRect(x - 10 * s, y + 5 * s, 6 * s, 4 * s); ctx.fillRect(x + 4 * s, y + 5 * s, 6 * s, 4 * s);
    } else {
      this._heart(x, y, 9 * s, '#ff5fa2');
    }
  }

  _heart(x, y, r, color) {
    const ctx = this.ctx;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x - r * 0.5, y - r * 0.3, r * 0.55, 0, 6.3);
    ctx.arc(x + r * 0.5, y - r * 0.3, r * 0.55, 0, 6.3);
    ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - r, y - r * 0.05); ctx.lineTo(x, y + r); ctx.lineTo(x + r, y - r * 0.05); ctx.fill();
  }

  // x = left edge, y = screen y of the obstacle's BASE.
  _drawObstacle(o, x, y, s, zi) {
    const ctx = this.ctx, t = this.t, w = o.w * s, h = o.h * s;
    ctx.save();
    if (o.squish > 0) { ctx.translate(x + w / 2, y); ctx.scale(1 + o.squish, 1 - o.squish * 1.6); ctx.translate(-(x + w / 2), -y); }
    switch (o.type) {
      case 'low':
        if (zi === 0) { // hydrant
          ctx.fillStyle = '#d8342c'; ctx.fillRect(x + 5 * s, y - h + 8 * s, w - 10 * s, h - 8 * s);
          ctx.fillRect(x, y - h * 0.55, w, 7 * s); ctx.fillRect(x + 2 * s, y - 5 * s, w - 4 * s, 5 * s);
          ctx.beginPath(); ctx.arc(x + w / 2, y - h + 9 * s, 8 * s, Math.PI, 0); ctx.fill();
          ctx.fillStyle = '#ff8078'; ctx.fillRect(x + 8 * s, y - h + 10 * s, 3 * s, h - 18 * s);
        } else if (zi === 1) { // trash can
          ctx.fillStyle = '#2f6b45'; ctx.fillRect(x + 2 * s, y - h + 5 * s, w - 4 * s, h - 5 * s);
          ctx.fillStyle = '#1d4a2e'; ctx.fillRect(x, y - h, w, 6 * s);
          ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1;
          for (let k = 1; k < 4; k++) { ctx.beginPath(); ctx.moveTo(x + k * w / 4, y - h + 6 * s); ctx.lineTo(x + k * w / 4, y); ctx.stroke(); }
        } else { // cone
          ctx.fillStyle = '#ff7a1a';
          ctx.beginPath(); ctx.moveTo(x + w / 2 - 3 * s, y - h); ctx.lineTo(x + w / 2 + 3 * s, y - h); ctx.lineTo(x + w - 2 * s, y - 4 * s); ctx.lineTo(x + 2 * s, y - 4 * s); ctx.fill();
          ctx.fillRect(x - 2 * s, y - 4 * s, w + 4 * s, 4 * s);
          ctx.fillStyle = '#fff'; ctx.fillRect(x + 6 * s, y - h * 0.55, w - 12 * s, 5 * s);
        }
        break;
      case 'tall': { // striped barricade
        ctx.fillStyle = '#4a4a55'; ctx.fillRect(x + 3 * s, y - h, 4 * s, h); ctx.fillRect(x + w - 7 * s, y - h, 4 * s, h);
        for (let r = 0; r < 3; r++) {
          const by = y - h + 4 * s + r * 18 * s;
          ctx.fillStyle = '#ff7a1a'; ctx.fillRect(x - 3 * s, by, w + 6 * s, 11 * s);
          ctx.fillStyle = '#fff';
          for (let k = 0; k < 3; k++) ctx.fillRect(x - 1 * s + k * 12 * s, by, 5 * s, 11 * s);
        }
        ctx.fillStyle = `rgba(255,190,60,${0.6 + 0.4 * Math.sin(t * 9)})`;
        ctx.beginPath(); ctx.arc(x + w / 2, y - h - 5 * s, 5 * s, 0, 6.3); ctx.fill();
        break;
      }
      case 'car':
        if (zi === 0) { // taxi
          ctx.fillStyle = '#f7c81e'; ctx.fillRect(x, y - h * 0.62, w, h * 0.5);
          ctx.beginPath(); ctx.moveTo(x + w * 0.18, y - h * 0.6); ctx.lineTo(x + w * 0.3, y - h); ctx.lineTo(x + w * 0.72, y - h); ctx.lineTo(x + w * 0.86, y - h * 0.6); ctx.fill();
          ctx.fillStyle = '#9fe0ff'; ctx.fillRect(x + w * 0.33, y - h * 0.92, w * 0.16, h * 0.28); ctx.fillRect(x + w * 0.53, y - h * 0.92, w * 0.17, h * 0.28);
          ctx.fillStyle = '#111';
          for (let k = 0; k < 8; k++) if (k % 2) ctx.fillRect(x + k * w / 8, y - h * 0.42, w / 8, 4 * s);
          ctx.fillStyle = '#fff'; ctx.fillRect(x + w * 0.44, y - h - 6 * s, w * 0.14, 6 * s);
          ctx.fillStyle = '#15151a';
          ctx.beginPath(); ctx.arc(x + w * 0.22, y - 7 * s, 8 * s, 0, 6.3); ctx.arc(x + w * 0.78, y - 7 * s, 8 * s, 0, 6.3); ctx.fill();
        } else if (zi === 1) { // subway bench
          ctx.fillStyle = '#9a6a3a'; ctx.fillRect(x, y - h * 0.55, w, 7 * s); ctx.fillRect(x, y - h, w, 6 * s); ctx.fillRect(x, y - h * 0.8, w, 5 * s);
          ctx.fillStyle = '#3a3a44';
          for (let k = 0; k < 4; k++) ctx.fillRect(x + 4 * s + k * (w - 12 * s) / 3, y - h, 4 * s, h);
        } else { // cart with umbrella
          ctx.fillStyle = '#c9ced6'; ctx.fillRect(x + 8 * s, y - h * 0.62, w - 16 * s, h * 0.5);
          ctx.fillStyle = '#8b9199'; ctx.fillRect(x + 8 * s, y - h * 0.62, w - 16 * s, 4 * s);
          ctx.fillStyle = '#555'; ctx.fillRect(x + w / 2 - 2 * s, y - h, 4 * s, h * 0.4);
          for (let k = 0; k < 4; k++) {
            ctx.fillStyle = k % 2 ? '#e8402c' : '#ffd84a';
            ctx.beginPath(); ctx.moveTo(x + k * w / 4, y - h + 9 * s); ctx.lineTo(x + w / 2, y - h - 3 * s); ctx.lineTo(x + (k + 1) * w / 4, y - h + 9 * s); ctx.fill();
          }
          ctx.fillStyle = '#15151a';
          ctx.beginPath(); ctx.arc(x + w * 0.25, y - 6 * s, 7 * s, 0, 6.3); ctx.arc(x + w * 0.75, y - 6 * s, 7 * s, 0, 6.3); ctx.fill();
        }
        break;
      case 'bird': {
        const flap = Math.sin(t * 16 + o.x) * 9 * s;
        ctx.fillStyle = zi === 2 ? '#f4f4f4' : '#8d93a0';
        ctx.beginPath(); ctx.ellipse(x + w / 2, y - h / 2, w / 2, h / 2.4, 0, 0, 6.3); ctx.fill();
        ctx.beginPath(); ctx.arc(x + 5 * s, y - h * 0.72, 6 * s, 0, 6.3); ctx.fill();
        ctx.fillStyle = zi === 2 ? '#bfc4cc' : '#5f6470';
        ctx.beginPath(); ctx.moveTo(x + w * 0.35, y - h * 0.6); ctx.lineTo(x + w * 0.85, y - h * 0.6); ctx.lineTo(x + w * 0.7, y - h * 0.6 - 8 * s - flap); ctx.fill();
        ctx.fillStyle = '#f0a020'; ctx.fillRect(x - 4 * s, y - h * 0.72, 5 * s, 3 * s);
        ctx.fillStyle = '#111'; ctx.fillRect(x + 3 * s, y - h * 0.82, 2 * s, 2 * s);
        break;
      }
      case 'rat': {
        const sc = Math.sin(t * 30 + o.x) * 2 * s;
        ctx.strokeStyle = '#c98b8b'; ctx.lineWidth = 2 * s;
        ctx.beginPath(); ctx.moveTo(x + w, y - 5 * s); ctx.quadraticCurveTo(x + w + 12 * s, y - 14 * s, x + w + 20 * s, y - 4 * s + sc); ctx.stroke();
        ctx.fillStyle = '#6b5a50';
        ctx.beginPath(); ctx.ellipse(x + w / 2, y - h / 2, w / 2, h / 2, 0, 0, 6.3); ctx.fill();
        ctx.beginPath(); ctx.arc(x + 3 * s, y - h * 0.75, 3.5 * s, 0, 6.3); ctx.fill();
        ctx.fillStyle = '#111'; ctx.fillRect(x + 4 * s, y - h * 0.55, 2 * s, 2 * s);
        // the slice
        ctx.fillStyle = '#f2b441';
        ctx.beginPath(); ctx.moveTo(x + 8 * s, y - h); ctx.lineTo(x + 30 * s, y - h - 9 * s); ctx.lineTo(x + 30 * s, y - h + 3 * s); ctx.fill();
        ctx.fillStyle = '#d8342c'; ctx.fillRect(x + 20 * s, y - h - 4 * s, 4 * s, 4 * s);
        break;
      }
    }
    ctx.restore();
  }

  // The 360 loop: a thick track ring on two legs, ridden on its inside.
  _drawLoop(cx, cy, r) {
    const ctx = this.ctx, gy = this.gy, s = this.s;
    ctx.fillStyle = '#4a4f5a';
    ctx.fillRect(cx - r * 0.75, cy, 10 * s, gy - cy);
    ctx.fillRect(cx + r * 0.75 - 10 * s, cy, 10 * s, gy - cy);
    ctx.lineWidth = 18 * s;
    ctx.strokeStyle = '#2a2e38';
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 4 * s;
    ctx.strokeStyle = `hsl(${(this.t * 120) % 360},90%,62%)`;
    ctx.beginPath(); ctx.arc(cx, cy, r - 8 * s, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.setLineDash([10 * s, 14 * s]);
    ctx.lineDashOffset = -this.t * 120;
    ctx.beginPath(); ctx.arc(cx, cy, r + 8 * s, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
  }

  // The flagpole: the Statue of Liberty, smoking, with bug eyes that
  // follow you in.
  _drawStatue(x, gy, s) {
    const ctx = this.ctx, t = this.t, p = this.p;
    const U = (v) => v * s;
    // pedestal
    ctx.fillStyle = '#9a9283'; ctx.fillRect(x - U(44), gy - U(150), U(88), U(150));
    ctx.fillStyle = '#7d766a';
    for (let k = 1; k < 5; k++) ctx.fillRect(x - U(44), gy - U(k * 30), U(88), U(3));
    ctx.fillStyle = '#b3ab9a'; ctx.fillRect(x - U(52), gy - U(158), U(104), U(10));
    // robe
    const green = '#5fae94', dark = '#3f8a72';
    ctx.fillStyle = green;
    ctx.beginPath(); ctx.moveTo(x - U(40), gy - U(150)); ctx.lineTo(x + U(40), gy - U(150)); ctx.lineTo(x + U(28), gy - U(355)); ctx.lineTo(x - U(28), gy - U(355)); ctx.fill();
    ctx.strokeStyle = dark; ctx.lineWidth = U(3);
    for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(x + U(k * 12), gy - U(155)); ctx.lineTo(x + U(k * 8), gy - U(340)); ctx.stroke(); }
    // tablet arm
    ctx.fillStyle = dark; ctx.fillRect(x + U(14), gy - U(320), U(26), U(40));
    // raised torch arm
    ctx.strokeStyle = green; ctx.lineWidth = U(14); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x - U(20), gy - U(340)); ctx.lineTo(x - U(34), gy - U(462)); ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.fillStyle = '#c9a24a'; ctx.fillRect(x - U(44), gy - U(480), U(20), U(16));
    const fl = Math.sin(t * 14) * U(3);
    ctx.fillStyle = '#ff9a2a';
    ctx.beginPath(); ctx.moveTo(x - U(46), gy - U(480)); ctx.quadraticCurveTo(x - U(34) + fl, gy - U(515), x - U(22), gy - U(480)); ctx.fill();
    ctx.fillStyle = '#ffe46b';
    ctx.beginPath(); ctx.moveTo(x - U(40), gy - U(480)); ctx.quadraticCurveTo(x - U(34) - fl, gy - U(500), x - U(28), gy - U(480)); ctx.fill();
    // head + crown
    const hx = x, hy = gy - U(380);
    ctx.fillStyle = green; ctx.beginPath(); ctx.arc(hx, hy, U(24), 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = green;
    for (let k = 0; k < 7; k++) {
      const a = -Math.PI * 0.85 + (k / 6) * Math.PI * 0.7;
      const bx = hx + Math.cos(a) * U(20), by = hy - U(10) + Math.sin(a) * U(16);
      ctx.beginPath(); ctx.moveTo(bx - U(4), by); ctx.lineTo(bx + Math.cos(a) * U(20), by + Math.sin(a) * U(20)); ctx.lineTo(bx + U(4), by); ctx.fill();
    }
    ctx.fillStyle = dark; ctx.fillRect(hx - U(22), hy - U(14), U(44), U(6));
    // big bug eyes, pupils tracking the runner
    const prx = (p.x - this.camX) * s, pry = gy - (p.y + 20) * s;
    [[-11, 0], [11, 0]].forEach(([ex, ey]) => {
      const cx = hx + U(ex), cy = hy + U(ey);
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx, cy, U(12), 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#222'; ctx.lineWidth = U(2); ctx.stroke();
      const dx = prx - cx, dy = pry - cy, d = Math.hypot(dx, dy) || 1;
      const wob = Math.sin(t * 9 + ex) * U(0.8);
      ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(cx + (dx / d) * U(5) + wob, cy + (dy / d) * U(5), U(5.5), 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx + (dx / d) * U(5) - U(2), cy + (dy / d) * U(5) - U(2), U(1.6), 0, Math.PI * 2); ctx.fill();
    });
    // cigarette, glowing tip, smoke
    const mx = hx - U(6), my = hy + U(14);
    ctx.fillStyle = '#f2efe6'; ctx.fillRect(mx - U(34), my - U(3), U(30), U(6));
    ctx.fillStyle = '#d98a4a'; ctx.fillRect(mx - U(8), my - U(3), U(6), U(6));
    ctx.fillStyle = `rgba(255,${90 + 60 * Math.sin(t * 6)},40,1)`; ctx.fillRect(mx - U(38), my - U(3), U(5), U(6));
    for (let k = 0; k < 6; k++) {
      const ph = (t * 0.5 + k / 6) % 1;
      ctx.fillStyle = `rgba(220,220,225,${0.45 * (1 - ph)})`;
      ctx.beginPath(); ctx.arc(mx - U(40) - ph * U(30) + Math.sin(ph * 8 + k) * U(8), my - ph * U(120), U(5 + ph * 14), 0, Math.PI * 2); ctx.fill();
    }
  }

  // Slams in oversized, shudders, cycles color, then fades -- sized to
  // fill the width, wrapping onto more lines only when it has to.
  _drawHeadline() {
    const ctx = this.ctx, h = this.headline, W = this.W, H = this.H;
    const age = h.max - h.life;
    const slam = age < 0.14 ? 1 + (1 - age / 0.14) * 1.4 : 1;
    const a = Math.min(1, h.life / 0.35);
    const words = h.text.split(' ');
    let fs = Math.min(110, W * 0.2), lines;
    for (;;) {
      ctx.font = `bold ${Math.round(fs)}px VT323, monospace`;
      lines = [];
      let cur = '';
      words.forEach(w => {
        const t = cur ? cur + ' ' + w : w;
        if (ctx.measureText(t).width > W * 0.9 && cur) { lines.push(cur); cur = w; } else cur = t;
      });
      if (cur) lines.push(cur);
      const widest = Math.max(...lines.map(l => ctx.measureText(l).width));
      if ((widest <= W * 0.9 && lines.length <= 3) || fs < 26) break;
      fs *= 0.9;
    }
    const lh = fs * 0.92;
    const cy = H * 0.42 - ((lines.length - 1) * lh) / 2;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    lines.forEach((l, i) => {
      const jx = (Math.random() - 0.5) * fs * 0.06, jy = (Math.random() - 0.5) * fs * 0.06;
      ctx.save();
      ctx.translate(W / 2 + jx, cy + i * lh + jy);
      ctx.rotate(Math.sin(this.t * 13 + i) * 0.035);
      ctx.scale(slam, slam);
      ctx.lineWidth = Math.max(4, fs * 0.12);
      ctx.strokeStyle = '#000';
      ctx.strokeText(l, 0, 0);
      ctx.fillStyle = `hsl(${(h.hue + this.t * 420 + i * 40) % 360},100%,62%)`;
      ctx.fillText(l, 0, 0);
      ctx.restore();
    });
    ctx.restore();
    ctx.textBaseline = 'alphabetic';
  }

  _drawPlayer(X, Y, s, fast, rush) {
    const ctx = this.ctx, p = this.p, t = this.t;
    const px = X(p.x), py = Y(p.y);
    // afterimages
    this.trail.push({ x: p.x, y: p.y, air: !p.grounded, spin: p.spin });
    const keep = rush ? 12 : Math.round(3 + fast * 8);
    while (this.trail.length > keep) this.trail.shift();
    if (this.state === 'run' && (fast > 0.2 || rush)) {
      for (let i = 0; i < this.trail.length - 1; i++) {
        const g = this.trail[i];
        ctx.globalAlpha = 0.07 + 0.22 * (i / this.trail.length);
        ctx.fillStyle = rush ? `hsl(${(t * 400 + i * 30) % 360},100%,65%)` : '#7fe3ff';
        ctx.beginPath(); ctx.arc(X(g.x), Y(g.y + 20), 16 * s, 0, 6.3); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    if (this.invuln > 0 && !rush && Math.floor(t * 20) % 2) return;

    const body = rush ? `hsl(${(t * 400) % 360},100%,62%)` : '#27b7c9';
    const dark = rush ? '#fff' : '#12717e';
    // shadow on the street
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    if (!this._pitAt(p.x, 0)) { ctx.beginPath(); ctx.ellipse(px, this.gy + 2 * s, 14 * s * Math.max(0.4, 1 - p.y / 300), 3 * s, 0, 0, 6.3); ctx.fill(); }

    ctx.save();
    const sq = p.squash;
    ctx.translate(px, py);
    ctx.scale(1 + sq * 0.6, 1 - sq * 0.6);
    if (this.state === 'wipe') { ctx.translate(0, -20 * s); ctx.rotate(this.endT * 9); ctx.translate(0, 20 * s); }
    if (p.swing) {
      // hanging by the hands, body pointing away from the bar
      ctx.restore();
      ctx.save();
      const bx = X(p.swing.bar.x), by = Y(p.swing.bar.y);
      ctx.translate(bx, by);
      ctx.rotate(-p.swing.th);
      ctx.strokeStyle = dark; ctx.lineWidth = 5 * s; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-5 * s, 0); ctx.lineTo(-4 * s, 16 * s); ctx.moveTo(5 * s, 0); ctx.lineTo(4 * s, 16 * s); ctx.stroke();
      ctx.fillStyle = '#f0c8a0'; ctx.beginPath(); ctx.arc(0, 22 * s, 7.5 * s, 0, 6.3); ctx.fill();
      ctx.fillStyle = body; ctx.fillRect(-8 * s, 28 * s, 16 * s, 18 * s);
      ctx.strokeStyle = '#2b2b3a'; ctx.lineWidth = 6 * s;
      ctx.beginPath(); ctx.moveTo(-4 * s, 45 * s); ctx.lineTo(-6 * s, 62 * s); ctx.moveTo(4 * s, 45 * s); ctx.lineTo(8 * s, 60 * s); ctx.stroke();
      ctx.lineCap = 'butt';
    } else if (!p.grounded && this.state !== 'wipe') {
      // curled into a spinning ball
      ctx.translate(0, -20 * s);
      ctx.rotate(p.spin);
      ctx.fillStyle = body; ctx.beginPath(); ctx.arc(0, 0, 18 * s, 0, 6.3); ctx.fill();
      ctx.fillStyle = dark; ctx.beginPath(); ctx.arc(0, 0, 18 * s, 0.4, 2.2); ctx.lineTo(0, 0); ctx.fill();
      ctx.fillStyle = '#f0c8a0'; ctx.beginPath(); ctx.arc(8 * s, -6 * s, 6 * s, 0, 6.3); ctx.fill();
      ctx.fillStyle = '#f4f4f4'; ctx.fillRect(-14 * s, 8 * s, 10 * s, 5 * s);
    } else {
      const ph = this.state === 'run' ? p.runPhase : 0;
      const lean = this.state === 'run' ? 0.12 + fast * 0.22 : 0;
      ctx.rotate(lean);
      ctx.strokeStyle = '#2b2b3a'; ctx.lineWidth = 6 * s; ctx.lineCap = 'round';
      for (let k = 0; k < 2; k++) {
        const a = Math.sin(ph + k * Math.PI);
        ctx.beginPath(); ctx.moveTo(0, -16 * s); ctx.lineTo(a * 11 * s, -8 * s + Math.abs(a) * -3 * s);
        ctx.lineTo(a * 13 * s - 4 * s, -1 * s - Math.max(0, -a) * 7 * s); ctx.stroke();
        ctx.fillStyle = '#f4f4f4'; ctx.fillRect(a * 13 * s - 6 * s, -3 * s - Math.max(0, -a) * 7 * s, 9 * s, 4 * s);
      }
      ctx.fillStyle = body; ctx.fillRect(-8 * s, -32 * s, 16 * s, 18 * s);
      ctx.strokeStyle = dark; ctx.lineWidth = 5 * s;
      const arm = Math.sin(ph + Math.PI) * 9 * s;
      ctx.beginPath(); ctx.moveTo(0, -28 * s); ctx.lineTo(arm, -19 * s); ctx.stroke();
      ctx.fillStyle = '#f0c8a0'; ctx.beginPath(); ctx.arc(2 * s, -39 * s, 7.5 * s, 0, 6.3); ctx.fill();
      ctx.fillStyle = '#3a2a1e'; ctx.beginPath(); ctx.arc(1 * s, -41 * s, 7.5 * s, Math.PI * 0.9, Math.PI * 1.95); ctx.fill();
      ctx.fillStyle = '#111'; ctx.fillRect(5 * s, -40 * s, 2 * s, 2.5 * s);
    }
    ctx.restore();
    ctx.lineCap = 'butt';
  }

  _drawHud() {
    const ctx = this.ctx, W = this.W, H = this.H, L = this.level, p = this.p, T = RUSH_TUNING;
    const u = Math.max(0.85, Math.min(1.4, W / 480));
    ctx.textBaseline = 'alphabetic';

    if (this.state === 'ready') {
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, W, H);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${Math.round(46 * u)}px VT323, monospace`;
      ctx.globalAlpha = 0.65 + 0.35 * Math.sin(this.t * 5);
      ctx.fillText('TAP TO JUMP', W / 2, H * 0.36);
      ctx.globalAlpha = 1;
      ctx.font = `${Math.round(20 * u)}px VT323, monospace`;
      ctx.fillStyle = '#d8d2c4';
      ['Hold for a higher jump', 'Tap again in the air to double jump', 'Land on things. Don\'t run into them.']
        .forEach((line, i) => ctx.fillText(line, W / 2, H * 0.36 + (40 + i * 28) * u));
      return;
    }

    // progress bar with zone ticks
    const bw = Math.min(W - 32, 520), bx = (W - bw) / 2, by = 12;
    const start = 200, span = L.finishX - start;
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(bx, by, bw, 8);
    ctx.fillStyle = this.rushT > 0 ? `hsl(${(this.t * 400) % 360},100%,65%)` : '#27d7e9';
    ctx.fillRect(bx, by, bw * Math.max(0, Math.min(1, (p.x - start) / span)), 8);
    ctx.fillStyle = '#fff';
    for (let i = 1; i < L.zones.length; i++) ctx.fillRect(bx + bw * (L.zones[i].x0 - start) / span - 1, by - 2, 2, 12);

    ctx.textAlign = 'left';
    ctx.font = `bold ${Math.round(34 * u)}px VT323, monospace`;
    ctx.fillStyle = '#000'; ctx.fillText(String(this.score), 18, 52 * u + 8);
    ctx.fillStyle = '#fff'; ctx.fillText(String(this.score), 16, 50 * u + 8);
    const m = this.mult();
    if (m > 1) {
      ctx.font = `bold ${Math.round(24 * u)}px VT323, monospace`;
      ctx.fillStyle = '#ffd84a'; ctx.fillText(`x${m}`, 16, 76 * u + 8);
    }
    for (let i = 0; i < Math.max(T.hearts, this.hearts); i++) {
      this._heart(W - 24 * u - i * 28 * u, 38 * u + 4, 10 * u, i < this.hearts ? '#ff5fa2' : 'rgba(255,255,255,0.2)');
    }
    // active power-up timers
    let ty = 62 * u + 4;
    [[this.rushT, T.rushTime, '#ffffff'], [this.magnetT, T.magnetTime, '#ff4f4f'], [this.boostT, T.boostTime, '#22e07a']].forEach(([v, max, col]) => {
      if (v <= 0) return;
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(W - 16 - 90 * u, ty, 90 * u, 7);
      ctx.fillStyle = col; ctx.fillRect(W - 16 - 90 * u, ty, 90 * u * (v / max), 7);
      ty += 12;
    });

    // zone title card
    if (this.zoneCardT > 0 && this.state === 'run') {
      const a = Math.min(1, this.zoneCardT / 0.4, (2.4 - this.zoneCardT) / 0.25);
      const slide = (1 - Math.min(1, (2.4 - this.zoneCardT) / 0.25)) * 60;
      ctx.globalAlpha = Math.max(0, a);
      ctx.textAlign = 'center';
      ctx.font = `bold ${Math.round(44 * u)}px VT323, monospace`;
      const name = L.zones[this.zoneIdx].name;
      ctx.fillStyle = '#000'; ctx.fillText(name, W / 2 + 3 - slide, H * 0.2 + 3);
      ctx.fillStyle = '#fff'; ctx.fillText(name, W / 2 - slide, H * 0.2);
      ctx.globalAlpha = 1;
    }
  }
}

let rushGame = null;
