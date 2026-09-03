// ============================================================
// ZOOMIES v3 — a rush through Central Park, on drugs
// ============================================================
//
// v1 was a flat 3-lane scroller (felt identical to the heist getaway
// car). v2 was a real pseudo-3D road (OutRun/Sonic-special-stage
// projection) -- liked visually, but the gameplay didn't make sense:
// curves were cosmetic (steering had no real consequence), coins were
// random noise instead of a readable path, obstacles looked identical
// regardless of what you were supposed to do about them, and the best
// visual moment (the Vessel leap) was fully non-interactive. See
// ZOOMIES_REDESIGN_PLAN.md (an Opus planning pass, committed alongside
// this file) for the full diagnosis and design.
//
// v3 keeps the pseudo-3D projection (the thing that was actually
// liked) and rebuilds everything on top of it around ONE mechanic: a
// RUSH meter that never resets across the run, driving speed and how
// psychedelic the world looks. No fail-out -- you always finish, what
// varies is how fast/bright you got there. This slice covers the full
// Central Park sequence (the Alice in Wonderland statue -> the Ramble
// -> the Lake), which the plan calls out as the fair test of whether
// this direction is fun -- Lincoln Center/the Vessel/Little Island are
// deliberately not built yet.
//
// No new narrative copy -- real place names as title cards are
// explicitly OK per direct instruction ("you can write copy if it is
// just place names"), everything else follows the existing short-
// functional-label precedent (SPLASH!, PERFECT) or is [PLACEHOLDER].

function zoomiesReducedMotion() {
  try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
  catch (e) { return false; }
}
function zoomiesAlpha(hex, a) {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16), g = parseInt(h.substring(2, 4), 16), b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

// ------------------------------------------------------------
// Pseudo-3D projection
// ------------------------------------------------------------
const P3D = {
  segmentLength: 200,
  rumbleLength: 3,
  fieldOfViewDeg: 105,
  drawDistanceSegs: 130,
  cameraHeight: 900,
};
P3D.cameraDepth = 1 / Math.tan((P3D.fieldOfViewDeg / 2) * Math.PI / 180);

// ------------------------------------------------------------
// RUSH — the one meta-mechanic tying every beat together.
// ------------------------------------------------------------
const RUSH_DECAY_PER_FRAME = 0.0009;
function rushSpeedMult(rush) { return rush < 0.33 ? 1 : rush < 0.66 ? 1.35 : 1.75; }
function rushTierName(rush) { return rush < 0.33 ? 'low' : rush < 0.66 ? 'mid' : 'high'; }

// ============================================================
// BEAT DEFINITIONS
// ============================================================
// Each beat authors its own track (curve/width/elevation per segment),
// a ribbon function (the readable path pickups follow), and its own
// obstacle placement. Rendering hooks fill in the identifying visual
// details. Verb-specific physics (the Lake's bounce timing) live in
// ZoomiesGame.update()'s per-beat branches, not here -- this object is
// data/authoring, not behavior.

const ZOOMIES_BEATS = [
  {
    id: 'alice', title: 'ALICE IN WONDERLAND', segCount: 260,
    skyTop: '#2a3a1a', skyHorizon: '#6a8f4a', ground: '#3a4a28',
    accent: '#e8c25a', accent2: '#5f7a5c',
    curve: (t) => Math.sin(t * Math.PI * 2.4) * 0.5,
    width: () => 900,
    elev: () => 0,
    ribbon: (t) => Math.sin(t * Math.PI * 2.4) * 0.55, // rides the curve -- "thread the S-weave"
    obstacles: (segs) => {
      // One taught hop near the end -- the whole tutorial.
      const i = Math.floor(segs.length * 0.86);
      segs[i].obstacle = { kind: 'hop', w: 1.1 };
    },
  },
  {
    id: 'ramble', title: 'THE RAMBLE', segCount: 320,
    skyTop: '#0e1c10', skyHorizon: '#2a4a2a', ground: '#22301a',
    accent: '#c9d98a', accent2: '#5a4a34',
    curve: (t) => Math.sin(t * Math.PI * 5) * 0.7 + Math.sin(t * Math.PI * 1.3) * 0.3,
    width: (t) => (t > 0.15 && t < 0.85) ? 620 : 900, // narrows through the wooded middle
    elev: () => 0,
    ribbon: null, // set per-fork below, not a single formula
    obstacles: (segs, beat) => {
      // Forks: a rock at path center every ~24 segments through the
      // middle 70%, alternating which side carries the ribbon. Cheap
      // fork -- not a graph, just a centered obstacle splitting the
      // usable width in two, with the path visibly diverging around it.
      const forkSegs = [];
      for (let i = Math.floor(segs.length * 0.18); i < segs.length * 0.82; i += 26) forkSegs.push(i);
      forkSegs.forEach((i, fi) => {
        segs[i].obstacle = { kind: 'dodge', w: 0 };
        segs[i].forkSide = fi % 2 === 0 ? 1 : -1; // which side is clear/ribboned
      });
      beat._forkSegs = forkSegs;
      // The Ramble Arch -- a hard squeeze at the midpoint.
      beat._archSeg = Math.floor(segs.length * 0.5);
    },
  },
  {
    id: 'lake', title: 'THE LAKE', segCount: 300,
    skyTop: '#0a1a2c', skyHorizon: '#3a5a7a', ground: '#0d2440',
    accent: '#eaf4ff', accent2: '#e8905a',
    curve: (t) => Math.sin(t * Math.PI * 1.6) * 0.35,
    width: () => 1000,
    elev: () => 0,
    ribbon: (t) => Math.sin(t * Math.PI * 3.2) * 0.6,
    obstacles: () => {}, // no ground obstacles -- this beat is bounce-timing over water
  },
];

class ZoomiesGame {
  constructor(gameState, onComplete) {
    this.gameState = gameState;
    this.onComplete = onComplete;
    this.canvas = document.getElementById('zoomies-canvas');
    this.ctx = this.canvas.getContext('2d');
    this._af = null;
    this._frame = 0;
    this._resizeHandler = null;
    this._reduced = zoomiesReducedMotion();
  }

  init() {
    this.resize();
    this._resizeHandler = () => this.resize();
    window.addEventListener('resize', this._resizeHandler);
    this.bindInput();
    this.reset();
    document.getElementById('zoomies-hud').classList.remove('hidden');
    document.getElementById('zoomies-controls').classList.remove('hidden');
    this._updateHud();
    this.loop();
  }

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width = rect.width || window.innerWidth;
    this.canvas.height = rect.height || window.innerHeight;
  }

  reset() {
    this.beatIndex = 0;
    this._enterBeat(0);

    this.rush = 0.14;
    this.peakRush = this.rush;
    this.landmarksHit = 0;
    // Pure score, no economy hook -- explicit instruction: "should not
    // feed into money or health, it is just for fun and SCORE.
    // everything is about score." trail.js's callback only reads
    // score/peakRush, never touches checkingAccount/aura.
    this.score = 0;

    this.playerZ = 0;
    this.playerX = 0;
    this.speed = 0;

    this.steerDir = 0;
    this.offPath = false;

    this.airborne = false;
    this.jumpVy = 0;
    this.jumpHeight = 0;

    // Lake bounce state
    this.bouncePhase = 0;
    this.bounceY = 0;
    this.bounceQuality = 0; // 0..1, decays, drives ribbon-catch height

    this.spinAngle = 0;
    this.bank = 0;
    this.hitFlash = 0;
    this.shakeX = 0; this.shakeY = 0;
    this.titleCardTimer = 90;

    this.particles = [];
    this.floaters = [];
    this.trail = [];

    this.finished = false;
  }

  _enterBeat(i) {
    this.beatIndex = i;
    this.beat = ZOOMIES_BEATS[i];
    this.segments = this._buildTrack(this.beat);
    this.beatZ = 0; // progress within THIS beat, world units
    this.titleCardTimer = 90;
    this.landmarksHit++;
  }

  _buildTrack(beat) {
    const segs = [];
    for (let i = 0; i < beat.segCount; i++) {
      const t = i / beat.segCount;
      segs.push({ index: i, t, curve: beat.curve(t), w: beat.width(t), elev: beat.elev(t), obstacle: null, forkSide: 0 });
    }
    // Integrate curve -> direction -> world X (standard pseudo-3D
    // double-integration: curve is a turn rate).
    let dir = 0, x = 0;
    segs.forEach(s => { dir += s.curve; x += dir; s.worldX = x; });
    if (beat.obstacles) beat.obstacles(segs, beat);
    return segs;
  }

  _seg(i) { const s = this.segments; return s[Math.max(0, Math.min(s.length - 1, i))]; }
  _segAtZ(z) { return this._seg(Math.floor(z / P3D.segmentLength)); }

  // ------------------------------------------------------------
  // INPUT
  // ------------------------------------------------------------

  bindInput() {
    this._keyDownH = (e) => {
      if (this.finished) return;
      const k = e.key.toLowerCase();
      if (k === 'arrowleft' || k === 'a') this.steerDir = -1;
      else if (k === 'arrowright' || k === 'd') this.steerDir = 1;
      else if (k === ' ' || k === 'arrowup') { e.preventDefault(); this._action(); }
    };
    this._keyUpH = (e) => {
      const k = e.key.toLowerCase();
      if (k === 'arrowleft' || k === 'a' || k === 'arrowright' || k === 'd') this.steerDir = 0;
    };
    window.addEventListener('keydown', this._keyDownH);
    window.addEventListener('keyup', this._keyUpH);

    this._pointerDown = (e) => {
      if (this.finished) return;
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      this.steerDir = x < rect.width / 2 ? -1 : 1;
      this._steerPointerId = e.pointerId;
    };
    this._pointerUp = (e) => {
      if (e.pointerId === this._steerPointerId) { this.steerDir = 0; this._steerPointerId = null; }
    };
    this.canvas.addEventListener('pointerdown', this._pointerDown);
    this.canvas.addEventListener('pointerup', this._pointerUp);
    this.canvas.addEventListener('pointercancel', this._pointerUp);
    this.canvas.addEventListener('pointerleave', this._pointerUp);

    const btn = document.getElementById('zoomies-action-btn');
    const down = (e) => { e.preventDefault(); btn.classList.add('pressed'); this._action(); };
    const up = () => btn.classList.remove('pressed');
    btn.addEventListener('pointerdown', down);
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointerleave', up);
    btn.addEventListener('pointercancel', up);
    this._btn = btn; this._btnDown = down; this._btnUp = up;
  }

  // One button, one meaning at a time -- jump on the road beats, tap-
  // the-bounce on the Lake. Never asks the player to hold two ideas at once.
  _action() {
    if (this.finished) return;
    if (this.beat.id === 'lake') { this._lakeTap(); return; }
    this._triggerJump();
  }

  _triggerJump() {
    if (this.airborne) return;
    this.airborne = true;
    this.jumpVy = -3.4;
    this.jumpHeight = 0;
  }

  _makeFloater(text, color) {
    return { x: this.canvas.width * 0.5, y: this.canvas.height * 0.24, text, color, life: 32, vy: -0.6 };
  }

  _bumpRush(amt) {
    this.rush = Math.max(0, Math.min(1, this.rush + amt));
    this.peakRush = Math.max(this.peakRush, this.rush);
  }

  laneLabel() {
    return this.beat.id === 'lake' ? 'TAP' : 'JUMP';
  }

  // ------------------------------------------------------------
  // UPDATE
  // ------------------------------------------------------------

  loop() {
    this._frame++;
    if (this.hitFlash > 0) this.hitFlash--;
    this.shakeX *= 0.7; this.shakeY *= 0.7;
    if (this.titleCardTimer > 0) this.titleCardTimer--;
    if (!this.finished) this.update();
    this.render();
    if (this.finished) return;
    this._af = requestAnimationFrame(() => this.loop());
  }

  update() {
    const dt = 1 / 60;
    this.rush = Math.max(0, this.rush - RUSH_DECAY_PER_FRAME);
    const targetSpeed = 4400 * rushSpeedMult(this.rush);
    this.speed += (targetSpeed - this.speed) * 0.05;
    this.spinAngle += 0.16 + this.speed * 0.00004;

    if (this.beat.id === 'lake') this._updateLake(dt);
    else this._updateRoad(dt);

    this._updateHud();
  }

  // Shared "run down a path, steer to follow the ribbon, jump/dodge
  // obstacles" logic for Alice and the Ramble.
  _updateRoad(dt) {
    this.bank += ((this.steerDir * -0.3) - this.bank) * 0.15;

    if (this.airborne) {
      this.jumpVy += 0.12;
      this.jumpHeight += this.jumpVy;
      if (this.jumpHeight >= 0) { this.jumpHeight = 0; this.jumpVy = 0; this.airborne = false; }
    }

    const seg = this._segAtZ(this.beatZ);
    this.playerX += this.steerDir * 1900 * dt;

    // E5 — leaving the path has a real, instant consequence.
    this.offPath = Math.abs(seg.worldX - this.playerX) > seg.w * 0.62;
    if (this.offPath) {
      this.shakeX = (Math.random() - 0.5) * 4;
      this._bumpRush(-0.0022); // steady bleed while off-path, on top of decay
    }

    // Ribbon pickup — collected by lateral proximity at the player's
    // current z, same one-per-segment cadence for every road beat.
    if (this._frame % 6 === 0) {
      const ribbonX = seg.worldX + this._ribbonOffsetAt(seg) * seg.w;
      if (Math.abs(ribbonX - this.playerX) < 90) {
        this._bumpRush(0.018);
        this.score += 10;
        this._burstAtWorld(ribbonX, 60);
      }
    }

    // Obstacles
    if (seg.obstacle && !seg.obstacle.hit && Math.abs(seg.index - this.beatZ / P3D.segmentLength) < 0.5) {
      const def = seg.obstacle;
      if (def.kind === 'hop') {
        const cleared = this.airborne || this.jumpHeight < -6;
        if (!cleared) { seg.obstacle.hit = true; this._hitObstacle(seg); }
      } else {
        // 'dodge' — a fork rock at path center. Hitting it (staying too
        // close to center) is the penalty; committing to either side clears it.
        const distFromCenter = Math.abs(this.playerX - seg.worldX);
        if (distFromCenter < seg.w * 0.22) { seg.obstacle.hit = true; this._hitObstacle(seg); }
      }
    }

    this.beatZ += this.speed * dt;
    this._advanceBeatOrTransition();

    this.particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += 0.15; p.life--; });
    this.particles = this.particles.filter(p => p.life > 0);
    this.floaters.forEach(f => { f.y += f.vy; f.life--; });
    this.floaters = this.floaters.filter(f => f.life > 0);
  }

  _hitObstacle(seg) {
    this.hitFlash = 14;
    this.shakeX = (Math.random() - 0.5) * 12; this.shakeY = 8;
    this._bumpRush(-0.15);
    this.speed *= 0.55;
    // Snap back toward the path center so a hit doesn't compound into
    // an unrecoverable spiral.
    this.playerX += (seg.worldX - this.playerX) * 0.5;
  }

  // The Lake: a fixed-rhythm bounce. Tap on contact; timing quality
  // sets bounce height, which gates whether the ribbon (strung at
  // apex height) is actually reachable.
  _updateLake(dt) {
    this.bank += ((this.steerDir * -0.3) - this.bank) * 0.15;
    const seg = this._segAtZ(this.beatZ);
    this.playerX += this.steerDir * 1700 * dt;
    this.offPath = false; // open water -- no off-path fail here, per the plan (forgiving beat)

    const bouncePeriod = 62; // frames per bounce cycle
    this.bouncePhase = (this.bouncePhase + 1) % bouncePeriod;
    // bounceY: 0 at contact, negative (up) at apex, standard parabola.
    const bp = this.bouncePhase / bouncePeriod;
    this.bounceY = -Math.sin(bp * Math.PI) * (60 + this.bounceQuality * 70);
    this.bounceQuality = Math.max(0, this.bounceQuality - 0.004);

    if (this._frame % 6 === 0) {
      const ribbonX = seg.worldX + this._ribbonOffsetAt(seg) * (this.beat.width() * 0.5);
      const apexReach = this.bounceQuality > 0.35;
      if (apexReach && Math.abs(ribbonX - this.playerX) < 100) {
        this._bumpRush(0.02);
        this.score += 15;
        this._burstAtWorld(ribbonX, 180);
      }
    }

    this.beatZ += this.speed * 0.85 * dt;
    this._advanceBeatOrTransition();

    this.particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += 0.15; p.life--; });
    this.particles = this.particles.filter(p => p.life > 0);
    this.floaters.forEach(f => { f.y += f.vy; f.life--; });
    this.floaters = this.floaters.filter(f => f.life > 0);
  }

  _lakeTap() {
    // Contact window: near the bottom of the bounce cycle (bouncePhase
    // near 0 or the period's end).
    const distFromContact = Math.min(this.bouncePhase, 62 - this.bouncePhase);
    if (distFromContact <= 3) {
      this.bounceQuality = 1;
      this._bumpRush(0.045);
      this.score += 40;
      this.floaters.push(this._makeFloater('PERFECT', '#f4c542'));
    } else if (distFromContact <= 9) {
      this.bounceQuality = Math.max(this.bounceQuality, 0.55);
      this._bumpRush(0.015);
      this.score += 15;
    } else {
      this.bounceQuality = Math.max(0, this.bounceQuality - 0.3);
      this._bumpRush(-0.06);
      this.floaters.push(this._makeFloater('SPLASH!', '#5dade2'));
      this.hitFlash = 8;
    }
    this.bouncePhase = 0; // re-sync contact to the tap
  }

  _ribbonOffsetAt(seg) {
    const beat = this.beat;
    if (beat.id === 'ramble') {
      // Forks override the smooth ribbon -- bend to whichever side is
      // clear at the nearest fork.
      const forks = beat._forkSegs || [];
      let nearest = null, nearestDist = Infinity;
      forks.forEach(fi => { const d = Math.abs(fi - seg.index); if (d < nearestDist) { nearestDist = d; nearest = fi; } });
      if (nearest !== null && nearestDist < 14) return this._seg(nearest).forkSide * 0.42;
      return Math.sin(seg.t * Math.PI * 3) * 0.3;
    }
    return beat.ribbon(seg.t);
  }

  _burstAtWorld(worldX, worldY) {
    const p = this._project(worldX, worldY, this.beatZ + 40);
    if (!p) return;
    for (let i = 0; i < 7; i++) {
      const a = Math.random() * Math.PI * 2, sp = 1.3 + Math.random() * 2.6;
      this.particles.push({ x: p.x, y: p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1, life: 18 + Math.floor(Math.random() * 12), color: this.beat.accent });
    }
  }

  _advanceBeatOrTransition() {
    const beatLenZ = (this.segments.length - 2) * P3D.segmentLength;
    if (this.beatZ >= beatLenZ) {
      if (this.beatIndex < ZOOMIES_BEATS.length - 1) {
        this._enterBeat(this.beatIndex + 1);
        this.playerX = this._seg(0).worldX;
        this.score += 60; // landmark-reached bonus
        this.floaters.push(this._makeFloater(ZOOMIES_BEATS[this.beatIndex].title, ZOOMIES_BEATS[this.beatIndex].accent));
      } else {
        this._end();
      }
    }
  }

  // ------------------------------------------------------------
  // PROJECTION
  // ------------------------------------------------------------

  _project(worldX, worldY, worldZ) {
    const dz = worldZ - this.beatZ;
    if (dz <= 1) return null;
    const W = this.canvas.width, H = this.canvas.height;
    const scale = P3D.cameraDepth / dz;
    const x = (W / 2) + scale * (worldX - this.playerX) * (W / 2);
    const y = (H / 2) - scale * (worldY - P3D.cameraHeight) * (H / 2) * 0.5 + H * 0.08;
    const w = scale * this._segAtZ(worldZ).w * (W / 2);
    return { x, y, w, scale };
  }

  // World-unit size -> screen pixels for a sprite at a given projected
  // `scale`. Every custom sprite needs this same *(W/2) conversion the
  // road/ribbon projection above already applies via its `w` field --
  // sprites that skip it render roughly 250x too small (confirmed via
  // screenshot: trees/statue/obstacles were invisible slivers until
  // this was added). `worldUnits` is authored in the same rough scale
  // as segment width (seg.w ~ 600-1000 for a path), so e.g. a tree
  // canopy at ~220 reads as meaningfully smaller than the path itself.
  _ws(worldUnits, scale) {
    return scale * worldUnits * (this.canvas.width / 2);
  }

  // ------------------------------------------------------------
  // RENDER
  // ------------------------------------------------------------

  render() {
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    const beat = this.beat;
    ctx.clearRect(0, 0, W, H);

    // Rush -> saturation/hue via canvas filters -- global, cheap,
    // exactly the "world gets more psychedelic" effect the meter needs.
    // Skipped under reduced-motion (hue-rotate especially).
    if (!this._reduced) {
      const sat = 75 + this.rush * 110;
      const hue = this.rush > 0.66 ? (this._frame * 1.3) % 360 : 0;
      ctx.filter = `saturate(${sat}%)${hue ? ` hue-rotate(${hue}deg)` : ''}`;
    }

    this._renderSky(ctx, W, H, beat);

    ctx.save();
    ctx.translate(Math.round(this.shakeX), Math.round(this.shakeY));
    if (beat.id === 'lake') this._renderLake(ctx, W, H, beat);
    else this._renderRoad(ctx, W, H, beat);
    this._renderPlayer(ctx, W, H, beat);
    ctx.restore();

    ctx.filter = 'none';
    this._renderParticles(ctx);
    this._renderFloaters(ctx);

    if (this.hitFlash > 0) {
      ctx.fillStyle = `rgba(224,90,74,${0.2 * (this.hitFlash / 14)})`;
      ctx.fillRect(0, 0, W, H);
    }

    // Title card — the direct, wordless-otherwise answer to "people
    // should clearly know where they are." Real place names, not
    // authored copy.
    if (this.titleCardTimer > 0) {
      const a = Math.min(1, this.titleCardTimer / 20) * (this.titleCardTimer > 70 ? (90 - this.titleCardTimer) / 20 : 1);
      ctx.globalAlpha = Math.max(0, Math.min(1, a));
      ctx.fillStyle = '#000'; ctx.globalAlpha *= 0.4;
      ctx.fillRect(0, H * 0.42, W, 54);
      ctx.globalAlpha = Math.max(0, Math.min(1, a));
      ctx.fillStyle = beat.accent; ctx.font = 'bold 26px VT323, monospace'; ctx.textAlign = 'center';
      ctx.fillText(beat.title, W / 2, H * 0.42 + 34);
      ctx.globalAlpha = 1;
    }

    // Progress bar
    const priorZ = ZOOMIES_BEATS.slice(0, this.beatIndex).reduce((s, b) => s + b.segCount * P3D.segmentLength, 0);
    const totalZ = ZOOMIES_BEATS.reduce((s, b) => s + b.segCount * P3D.segmentLength, 0);
    const frac = Math.min(1, (priorZ + this.beatZ) / totalZ);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(W * 0.1 - 3, 10, W * 0.8 + 6, 8);
    ctx.fillStyle = beat.accent;
    ctx.fillRect(W * 0.1, 12, W * 0.8 * frac, 4);
  }

  _renderSky(ctx, W, H, beat) {
    const horizonY = H * 0.5;
    const g = ctx.createLinearGradient(0, 0, 0, horizonY);
    g.addColorStop(0, beat.skyTop);
    g.addColorStop(1, beat.skyHorizon);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, horizonY);
  }

  _skylineOffset() { return this.beatZ * 1.1; }

  _renderRoad(ctx, W, H, beat) {
    const baseIdx = Math.floor(this.beatZ / P3D.segmentLength);
    let centerlinePts = [];
    // Pass 1: road surface only. Scenery/obstacles are deferred to a
    // second pass below -- a tree or statue drawn per-segment here got
    // silently painted over by the NEXT (nearer) segment's opaque
    // grass-strip fill, since sprites can extend outside their own
    // segment's screen band. Splitting the passes keeps every sprite
    // correctly far-to-near ordered without that overpaint.
    const sceneryQueue = [];
    for (let n = P3D.drawDistanceSegs; n >= 0; n--) {
      const idx = baseIdx + n;
      const seg = this.segments[idx];
      if (!seg) continue;
      const segZ = idx * P3D.segmentLength;
      const p = this._project(seg.worldX, 0, segZ);
      if (!p) continue;
      const nextSeg = this.segments[idx + 1];
      const pNext = nextSeg ? this._project(nextSeg.worldX, 0, segZ + P3D.segmentLength) : p;

      const rumble = Math.floor(idx / P3D.rumbleLength) % 2 === 0;
      ctx.fillStyle = rumble ? zoomiesAlpha(beat.ground, 0.55) : zoomiesAlpha(beat.ground, 0.85);
      ctx.fillRect(0, pNext.y, W, Math.max(1, p.y - pNext.y));

      ctx.fillStyle = beat.id === 'ramble' ? '#3a3222' : '#4a5a34';
      ctx.beginPath();
      ctx.moveTo(p.x - p.w, p.y); ctx.lineTo(p.x + p.w, p.y);
      ctx.lineTo(pNext.x + pNext.w, pNext.y); ctx.lineTo(pNext.x - pNext.w, pNext.y);
      ctx.closePath(); ctx.fill();

      sceneryQueue.push({ seg, segZ, p });
      centerlinePts.push({ x: seg.worldX + this._ribbonOffsetAt(seg) * seg.w, y: 0, seg, segZ });
    }

    // Pass 2: scenery + obstacles, still far-to-near (sceneryQueue was
    // filled in that order), now safe from being overpainted.
    sceneryQueue.forEach(({ seg, segZ, p }) => {
      this._renderBeatScenery(ctx, beat, seg, segZ, p);
      if (seg.obstacle && !seg.obstacle.hit) this._renderObstacle(ctx, seg, p);
    });

    // Ribbon — the readable line, drawn as a connected glowing path
    // (not isolated dots), the single highest-value legibility change.
    ctx.strokeStyle = zoomiesAlpha(beat.accent, this.offPath ? 0.35 : 0.85);
    ctx.lineWidth = 4;
    ctx.beginPath();
    let started = false;
    centerlinePts.slice().reverse().forEach(pt => {
      const pr = this._project(pt.x, 70, pt.segZ);
      if (!pr) return;
      if (!started) { ctx.moveTo(pr.x, pr.y); started = true; } else ctx.lineTo(pr.x, pr.y);
    });
    ctx.stroke();
  }

  _renderBeatScenery(ctx, beat, seg, segZ, p) {
    if (beat.id === 'alice') {
      // Elm canopy — two rows arching inward, framing the statue.
      if (seg.index % 4 === 0) {
        [-1, 1].forEach(side => {
          // 1.35x offset put these off the right/left edge of the
          // screen at exactly the close-up distances where they'd
          // otherwise be big and visible (confirmed via direct
          // projection check: x landed at 564 on a 520-wide canvas).
          // 0.55x keeps them on-screen across the whole draw range.
          const wx = seg.worldX + side * (seg.w * 0.55);
          const pr = this._project(wx, 260, segZ);
          if (!pr || pr.scale <= 0) return;
          const r = Math.min(110, Math.max(4, this._ws(220, pr.scale)));
          ctx.fillStyle = zoomiesAlpha('#2f4a22', Math.min(1, pr.scale * 550));
          ctx.beginPath(); ctx.arc(pr.x - side * r * 0.5, pr.y, r, 0, Math.PI * 2); ctx.fill();
        });
      }
      // Mushroom-dome ring near the statue.
      if (Math.abs(seg.index - Math.floor(this.segments.length * 0.8)) < 3) {
        [-0.8, 0.8].forEach(off => {
          const wx = seg.worldX + off * seg.w;
          const pr = this._project(wx, 0, segZ);
          if (!pr || pr.scale <= 0) return;
          const r = Math.min(34, Math.max(2, this._ws(90, pr.scale)));
          ctx.fillStyle = '#8a6a3a';
          ctx.beginPath(); ctx.ellipse(pr.x, pr.y - r * 0.4, r, r * 0.5, 0, Math.PI, 0); ctx.fill();
        });
      }
      // The statue itself — a big billboard that grows as approached.
      if (seg.index === Math.floor(this.segments.length * 0.82)) {
        const pr = this._project(seg.worldX, 0, segZ);
        if (pr && pr.scale > 0) {
          const size = Math.max(6, this._ws(900, pr.scale));
          ctx.save(); ctx.translate(pr.x, pr.y - size * 0.4);
          ctx.fillStyle = '#5f7a5c';
          ctx.beginPath(); ctx.ellipse(0, 0, size * 0.14, size * 0.34, 0, 0, Math.PI * 2); ctx.fill(); // Alice, seated
          ctx.beginPath(); ctx.arc(0, -size * 0.22, size * 0.09, 0, Math.PI * 2); ctx.fill(); // head
          ctx.fillStyle = zoomiesAlpha('#5f7a5c', 0.85);
          ctx.beginPath(); ctx.ellipse(-size * 0.22, size * 0.05, size * 0.05, size * 0.16, 0.3, 0, Math.PI * 2); ctx.fill(); // rabbit
          ctx.beginPath(); ctx.ellipse(size * 0.22, size * 0.05, size * 0.06, size * 0.16, -0.3, 0, Math.PI * 2); ctx.fill(); // hatter
          ctx.fillStyle = '#3a5a34';
          ctx.beginPath(); ctx.ellipse(0, size * 0.34, size * 0.32, size * 0.09, 0, 0, Math.PI * 2); ctx.fill(); // mushroom cap base
          ctx.restore();
        }
      }
      // Conservatory Water off to one side.
      if (seg.index % 10 === 0) {
        const wx = seg.worldX - seg.w * 2.4;
        const pr = this._project(wx, -10, segZ);
        if (pr && pr.scale > 0) {
          // Boat alpha rides the same distance fade as the water it
          // sits on, so it never reads as a solid triangle floating
          // over invisible water far down the road.
          const waterAlpha = Math.min(0.7, Math.max(0.08, pr.scale * 220));
          ctx.fillStyle = zoomiesAlpha('#3a5a7a', waterAlpha);
          ctx.beginPath(); ctx.ellipse(pr.x, pr.y, Math.max(4, this._ws(260, pr.scale)), Math.max(2, this._ws(65, pr.scale)), 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = zoomiesAlpha('#ffffff', Math.min(1, waterAlpha * 1.6));
          ctx.beginPath(); ctx.moveTo(pr.x, pr.y - 6); ctx.lineTo(pr.x - 4, pr.y + 2); ctx.lineTo(pr.x + 4, pr.y + 2); ctx.closePath(); ctx.fill();
        }
      }
    } else if (beat.id === 'ramble') {
      // Rustic zigzag log railings along both edges.
      if (seg.index % 2 === 0) {
        [-1, 1].forEach(side => {
          const jitter = (seg.index % 4 === 0) ? 10 : -10;
          const wx = seg.worldX + side * (seg.w * 1.02) + jitter;
          const pr = this._project(wx, 30, segZ);
          if (pr && pr.scale > 0) {
            const h = Math.max(2, this._ws(45, pr.scale));
            ctx.fillStyle = '#5a4a34';
            ctx.fillRect(pr.x - 2, pr.y - h, 4, h);
          }
        });
      }
      // Dappled light blobs.
      if (!this._reduced && seg.index % 5 === 0) {
        const wx = seg.worldX + (Math.sin(seg.index) * seg.w * 0.6);
        const pr = this._project(wx, 5, segZ);
        if (pr && pr.scale > 0) {
          ctx.fillStyle = zoomiesAlpha('#c9d98a', 0.12);
          ctx.beginPath(); ctx.arc(pr.x, pr.y, Math.max(2, this._ws(55, pr.scale)), 0, Math.PI * 2); ctx.fill();
        }
      }
      // The Ramble Arch — a squeeze gate at the midpoint.
      if (this.beat._archSeg && seg.index === this.beat._archSeg) {
        const pr = this._project(seg.worldX, 0, segZ);
        if (pr && pr.scale > 0) {
          const size = Math.max(8, this._ws(700, pr.scale));
          ctx.fillStyle = '#3a362c';
          ctx.beginPath();
          ctx.moveTo(pr.x - size * 0.4, pr.y);
          ctx.lineTo(pr.x - size * 0.4, pr.y - size * 0.45);
          ctx.quadraticCurveTo(pr.x, pr.y - size * 0.75, pr.x + size * 0.4, pr.y - size * 0.45);
          ctx.lineTo(pr.x + size * 0.4, pr.y);
          ctx.lineTo(pr.x + size * 0.28, pr.y);
          ctx.lineTo(pr.x + size * 0.28, pr.y - size * 0.4);
          ctx.quadraticCurveTo(pr.x, pr.y - size * 0.62, pr.x - size * 0.28, pr.y - size * 0.4);
          ctx.lineTo(pr.x - size * 0.28, pr.y);
          ctx.closePath(); ctx.fill();
        }
      }
    } else if (beat.id === 'lake') {
      // handled in _renderLake
    }
  }

  _renderObstacle(ctx, seg, p) {
    const def = seg.obstacle;
    if (def.kind === 'hop') {
      // Low and wide — the global "jump this" shape rule.
      const h = Math.max(3, this._ws(35, p.scale));
      ctx.fillStyle = '#4a3a24';
      ctx.fillRect(p.x - p.w * 0.7, p.y - h, p.w * 1.4, h);
    } else {
      // Tall and narrow, centered — the fork rock.
      const h = Math.max(6, this._ws(180, p.scale));
      ctx.fillStyle = '#5a5a58';
      ctx.beginPath();
      ctx.moveTo(p.x - h * 0.4, p.y); ctx.lineTo(p.x - h * 0.22, p.y - h);
      ctx.lineTo(p.x + h * 0.22, p.y - h); ctx.lineTo(p.x + h * 0.4, p.y);
      ctx.closePath(); ctx.fill();
    }
  }

  _renderLake(ctx, W, H, beat) {
    const groundY = H * 0.5;
    // Water bands
    ctx.fillStyle = beat.ground; ctx.fillRect(0, groundY, W, H - groundY);
    const off = this._skylineOffset();
    for (let i = 0; i < 8; i++) {
      const wy = groundY + i * (H - groundY) / 8;
      ctx.strokeStyle = zoomiesAlpha(beat.accent2, 0.12 + (i % 2) * 0.06);
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = 0; x < W; x += 6) ctx.lineTo(x, wy + Math.sin((x + off * 0.4 + i * 40) * 0.02) * 4);
      ctx.stroke();
    }
    // Bow Bridge — grows ahead; skimmed over at high bounce quality.
    const bridgeZ = this.segments.length * P3D.segmentLength * 0.55;
    const pr = this._project(this._seg(Math.floor(bridgeZ / P3D.segmentLength)).worldX, 0, bridgeZ);
    if (pr && pr.scale > 0) {
      const size = Math.max(8, this._ws(900, pr.scale));
      ctx.strokeStyle = '#cfc9b8'; ctx.lineWidth = Math.max(2, size * 0.03);
      ctx.beginPath();
      ctx.moveTo(pr.x - size * 0.5, pr.y);
      ctx.quadraticCurveTo(pr.x, pr.y - size * 0.28, pr.x + size * 0.5, pr.y);
      ctx.stroke();
    }
    // Rowboats
    if (this._frame % 40 < 2) {
      // (spawned as decorative particles below for simplicity)
    }
    // Skyline
    ctx.fillStyle = zoomiesAlpha('#0e2438', 0.7);
    for (let i = 0; i < 6; i++) {
      const bx = ((i * 140 - off * 0.25) % (W + 160) + W + 160) % (W + 160) - 80;
      const bh = 40 + Math.sin(i * 1.7) * 20 + 20;
      ctx.fillRect(bx, groundY - bh, 90, bh);
    }
    // Ribbon over water, arced to apex height so a bad bounce misses it.
    const baseIdx = Math.floor(this.beatZ / P3D.segmentLength);
    ctx.strokeStyle = zoomiesAlpha(beat.accent, 0.75); ctx.lineWidth = 3;
    ctx.beginPath();
    let started = false;
    for (let n = Math.min(60, P3D.drawDistanceSegs); n >= 0; n--) {
      const seg = this.segments[baseIdx + n];
      if (!seg) continue;
      const segZ = (baseIdx + n) * P3D.segmentLength;
      const wx = seg.worldX + this._ribbonOffsetAt(seg) * (beat.width() * 0.5);
      const pr2 = this._project(wx, 200, segZ);
      if (!pr2) continue;
      if (!started) { ctx.moveTo(pr2.x, pr2.y); started = true; } else ctx.lineTo(pr2.x, pr2.y);
    }
    ctx.stroke();

    // Ripple ring at contact
    if (this.bouncePhase < 4) {
      ctx.strokeStyle = zoomiesAlpha('#eaf4ff', 0.6); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(W / 2, H * 0.82, 20 + this.bouncePhase * 8, 0, Math.PI * 2); ctx.stroke();
    }
  }

  _renderPlayer(ctx, W, H, beat) {
    const px = W / 2;
    const groundY = H * 0.82;
    const airOffset = beat.id === 'lake' ? this.bounceY : this.jumpHeight * 90;
    const py = groundY + airOffset;
    const r = Math.max(15, 21 - Math.abs(this.bank) * 3);

    for (let i = 0; i < this.trail.length; i++) {
      const a = (1 - i / this.trail.length) * (0.15 + this.rush * 0.2);
      ctx.fillStyle = zoomiesAlpha(beat.accent, a);
      ctx.beginPath(); ctx.arc(px - this.trail[i] * 18, py, r * (1 - i * 0.08), 0, Math.PI * 2); ctx.fill();
    }
    this.trail.unshift(this.bank);
    if (this.trail.length > (this.rush > 0.66 ? 12 : 6)) this.trail.pop();

    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(px, groundY + 20, 18, 5, 0, 0, Math.PI * 2); ctx.fill();

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(this.spinAngle + this.bank);
    const grad = ctx.createRadialGradient(-4, -4, 2, 0, 0, r);
    grad.addColorStop(0, '#ffffff'); grad.addColorStop(0.5, beat.accent); grad.addColorStop(1, zoomiesAlpha(beat.accent2, 0.9));
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = zoomiesAlpha(beat.accent2, 0.85);
    const spikeN = 8, len = r * (0.4 + this.rush * 0.5);
    for (let i = 0; i < spikeN; i++) {
      const a = (i / spikeN) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r * 0.8, Math.sin(a) * r * 0.8);
      ctx.lineTo(Math.cos(a - 0.12) * (r + len), Math.sin(a - 0.12) * (r + len));
      ctx.lineTo(Math.cos(a + 0.12) * (r + len * 0.6), Math.sin(a + 0.12) * (r + len * 0.6));
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();

    if (this.offPath) {
      ctx.strokeStyle = `rgba(224,90,74,${0.5 + 0.3 * Math.sin(this._frame * 0.4)})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(px, py, r + 8, 0, Math.PI * 2); ctx.stroke();
    }
  }

  _renderParticles(ctx) {
    this.particles.forEach(p => {
      ctx.globalAlpha = Math.max(0, p.life / 30);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 2.5, p.y - 2.5, 5, 5);
    });
    ctx.globalAlpha = 1;
  }

  _renderFloaters(ctx) {
    this.floaters.forEach(f => {
      ctx.globalAlpha = Math.max(0, Math.min(1, f.life / 20));
      ctx.fillStyle = f.color;
      ctx.font = 'bold 26px VT323, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(f.text, f.x, f.y);
    });
    ctx.globalAlpha = 1;
  }

  _updateHud() {
    document.getElementById('zoomies-hud-title').textContent = this.beat.title;
    document.getElementById('zoomies-hud-hint').textContent = this.offPath ? 'off the path!' : '';
    document.getElementById('zoomies-hud-meta').textContent = `Score: ${this.score} · Rush: ${Math.round(this.rush * 100)}%`;
    document.getElementById('zoomies-charge-wrap').classList.remove('hidden');
    document.getElementById('zoomies-charge-fill').style.width = `${Math.round(this.rush * 100)}%`;
    const btn = document.getElementById('zoomies-action-btn');
    const label = btn.querySelector('.zoomies-action-label');
    if (label) label.textContent = this.laneLabel();
  }

  // ------------------------------------------------------------
  // END
  // ------------------------------------------------------------

  _end() {
    this.finished = true;
    if (this._af) cancelAnimationFrame(this._af);
    document.getElementById('zoomies-hud').classList.add('hidden');
    document.getElementById('zoomies-controls').classList.add('hidden');
    document.getElementById('zoomies-charge-wrap').classList.add('hidden');

    document.getElementById('zoomies-results-coins').textContent = this.score;
    document.getElementById('zoomies-results-chain').textContent = `${Math.round(this.peakRush * 100)}%`;
    const overlay = document.getElementById('zoomies-results');
    overlay.classList.remove('hidden');
    document.getElementById('zoomies-results-continue').onclick = () => {
      overlay.classList.add('hidden');
      this.destroy();
      // Pure score/spectacle -- no money or health payload. trail.js's
      // callback uses peakRush only to decide the "bad trip" day-loss
      // consequence, never touches checkingAccount/aura/balances.
      this.onComplete({ score: this.score, peakRush: this.peakRush, landmarksHit: this.landmarksHit });
    };
  }

  destroy() {
    if (this._af) cancelAnimationFrame(this._af);
    this._af = null;
    if (this._resizeHandler) window.removeEventListener('resize', this._resizeHandler);
    if (this._keyDownH) window.removeEventListener('keydown', this._keyDownH);
    if (this._keyUpH) window.removeEventListener('keyup', this._keyUpH);
    if (this._pointerDown) {
      this.canvas.removeEventListener('pointerdown', this._pointerDown);
      this.canvas.removeEventListener('pointerup', this._pointerUp);
      this.canvas.removeEventListener('pointercancel', this._pointerUp);
      this.canvas.removeEventListener('pointerleave', this._pointerUp);
    }
    if (this._btn) {
      this._btn.removeEventListener('pointerdown', this._btnDown);
      this._btn.removeEventListener('pointerup', this._btnUp);
      this._btn.removeEventListener('pointerleave', this._btnUp);
      this._btn.removeEventListener('pointercancel', this._btnUp);
    }
  }
}

let zoomiesGame = null;
