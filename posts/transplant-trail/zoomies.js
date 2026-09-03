// ============================================================
// ZOOMIES — a real pseudo-3D Sonic-style rush through NYC
// ============================================================
//
// v2 rebuild. v1 was a flat 3-lane scroller -- functionally identical
// to the heist getaway car chase with different paint, which defeated
// the whole point of it being a surprise. This is a genuine pseudo-3D
// "into the screen" road renderer (the classic OutRun/Sonic-special-
// stage technique: perspective-projected road segments curving into
// the distance, buildings and landmarks scaling up as you approach) --
// no WebGL, no framework, just canvas 2D + the same projection math
// those games used. Explicitly leaning into a tone break per direct
// instruction: the player is on drugs, so a synthwave/vaporwave visual
// shift (neon grid road, color-cycling, screen warp) is the intended
// look, not a mismatch to fix.
//
// A one-time optional trail event, offered once after the bodega run
// and before Washington Square Park (see trail.js's showZoomiesOffer()/
// startZoomiesGame()). Steer to stay on the curving road, hop obstacles,
// hold-and-release to charge a spin-dash burst. Three zones follow the
// real west-side Manhattan geography roughly north to south: Hudson
// Yards (the Vessel) -> the High Line -> Little Island (Pier 55).
//
// The player is drawn as an abstract glowing spin-ball, not a licensed
// character likeness.
//
// No narrative copy is authored here -- every player-facing string that
// isn't a short functional UI label (matching existing precedent like
// "SPLASH!"/"PERFECT") is marked [PLACEHOLDER] for the user's own pass.

// ------------------------------------------------------------
// Pseudo-3D projection constants
// ------------------------------------------------------------
const P3D = {
  segmentLength: 200,
  rumbleLength: 3,
  fieldOfViewDeg: 100,
  cameraHeight: 1100,
  drawDistanceSegs: 180,
  roadWidth: 1500, // half-width of the paved road, world units
};
P3D.cameraDepth = 1 / Math.tan((P3D.fieldOfViewDeg / 2) * Math.PI / 180);

// A curve stretch is `n` segments at a constant turn rate. Positive =
// curves screen-right as you approach it, negative = left. Tiled to
// fill each zone's segment count. Each zone's pattern gives it a
// distinct driving character even though the renderer is shared.
const ZOOMIES_CURVE_PATTERNS = {
  // Hudson Yards plaza -- broad, gentle winding curves.
  vessel: [
    { n: 50, c: 0 }, { n: 40, c: 0.55 }, { n: 30, c: 0 }, { n: 45, c: -0.5 },
    { n: 35, c: 0 }, { n: 40, c: 0.45 }, { n: 30, c: 0 }, { n: 40, c: -0.4 },
  ],
  // The real High Line runs mostly straight, elevated -- long straights,
  // occasional gentle bends.
  highline: [
    { n: 70, c: 0 }, { n: 25, c: 0.3 }, { n: 60, c: 0 }, { n: 25, c: -0.3 },
    { n: 70, c: 0 }, { n: 30, c: 0.35 }, { n: 50, c: 0 },
  ],
  // Little Island's paths are tight and organic -- frequent, sharper
  // curves weaving between the piers.
  littleisland: [
    { n: 22, c: 0.7 }, { n: 18, c: -0.7 }, { n: 20, c: 0.85 }, { n: 18, c: -0.6 },
    { n: 22, c: 0.6 }, { n: 20, c: -0.85 }, { n: 18, c: 0.5 }, { n: 20, c: 0 },
  ],
};

const ZOOMIES_ZONES = [
  {
    id: 'vessel', name: 'Hudson Yards', segCount: 460,
    skyTop: '#1a0f2e', skyHorizon: '#ff6ec7', sun: '#ffd76a',
    road: '#241633', roadLine: '#7b5cff', rumbleA: '#3a2455', rumbleB: '#241633',
    grid: '#ff6ec7', accent: '#e8b23a', accent2: '#c86ab0', building: '#2a1a40',
  },
  {
    id: 'highline', name: 'The High Line', segCount: 500,
    skyTop: '#08201a', skyHorizon: '#39e8b0', sun: '#f4c542',
    road: '#0d2818', roadLine: '#7ec89a', rumbleA: '#173a28', rumbleB: '#0d2818',
    grid: '#39e8b0', accent: '#7ec89a', accent2: '#f4c542', building: '#123422',
  },
  {
    id: 'littleisland', name: 'Little Island', segCount: 440,
    skyTop: '#061a2c', skyHorizon: '#4fd8f4', sun: '#ff9ad6',
    road: '#0a1f30', roadLine: '#4fb8d8', rumbleA: '#123a52', rumbleB: '#0a1f30',
    grid: '#4fd8f4', accent: '#4fb8d8', accent2: '#e8b23a', building: '#0e2c40',
  },
];

const ZOOMIES_OBSTACLES = {
  cart:      { behavior: 'hop',   r: 22 },
  scaffold:  { behavior: 'dodge', r: 26 },
  tourists:  { behavior: 'dodge', r: 28 },
  pigeons:   { behavior: 'hop',   r: 20 },
  trashbags: { behavior: 'hop',   r: 22 },
  barrier:   { behavior: 'dodge', r: 24 },
};
const ZOOMIES_OBSTACLE_TYPES = Object.keys(ZOOMIES_OBSTACLES);

class ZoomiesGame {
  constructor(gameState, onComplete) {
    this.gameState = gameState;
    this.onComplete = onComplete;
    this.canvas = document.getElementById('zoomies-canvas');
    this.ctx = this.canvas.getContext('2d');
    this._af = null;
    this._frame = 0;
    this._resizeHandler = null;
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
    this.zoneIndex = 0;
    this.segments = this._buildZone(ZOOMIES_ZONES[0]);
    this.playerZ = 0;
    this.playerX = 0; // world units, same space as segment.worldX
    this.speed = 4600; // world units/sec at rest
    this.baseSpeed = 4600;
    this.maxSpeed = 8800;
    this.totalRunDistance = 0;

    this.coins = 0;
    this.chain = 0;
    this.bestChain = 0;

    this.steerDir = 0; // -1, 0, 1 while held
    this.offRoad = false;

    this.airborne = false;
    this.jumpVy = 0;
    this.jumpHeight = 0;

    this.charging = false;
    this.chargeStartAt = 0;
    this.chargeMs = 0;
    this.burstTimer = 0;
    this.invuln = 0;

    this.spinAngle = 0;
    this.bank = 0;
    this.hitFlash = 0;
    this.shakeX = 0; this.shakeY = 0;

    this.particles = [];
    this.floaters = [];
    this.trail = [];

    // Vessel set piece: a dramatic billboard grows out of the horizon
    // partway through zone 0, then a scripted leap-through beat near
    // the very end of the zone.
    this.vessel = { leaping: false, leapT: 0, done: false };

    this.finished = false;
  }

  _buildZone(zone) {
    const pattern = ZOOMIES_CURVE_PATTERNS[zone.id];
    const segs = [];
    while (segs.length < zone.segCount) {
      for (const stretch of pattern) {
        for (let i = 0; i < stretch.n && segs.length < zone.segCount; i++) {
          segs.push({ index: segs.length, curve: stretch.c, sprites: [] });
        }
      }
    }
    // Integrate curve -> direction -> world X (the standard pseudo-3D
    // accumulation: curve is a turn RATE, integrated twice for position).
    let dir = 0, x = 0;
    segs.forEach(s => { dir += s.curve; x += dir; s.worldX = x; });

    // Scatter obstacles/coins, skipping the first stretch (breathing
    // room after a zone transition) and the last stretch (clear runway
    // into the next zone / results).
    for (let i = 40; i < segs.length - 40; i++) {
      if (i % 11 === 0) {
        const r = Math.random();
        if (r < 0.6) {
          segs[i].sprites.push({ kind: 'coin', off: (Math.random() - 0.5) * 1.3 });
          if (Math.random() < 0.5 && segs[i + 1]) segs[i + 1].sprites.push({ kind: 'coin', off: (Math.random() - 0.5) * 1.3 });
        } else {
          const type = ZOOMIES_OBSTACLE_TYPES[Math.floor(Math.random() * ZOOMIES_OBSTACLE_TYPES.length)];
          segs[i].sprites.push({ kind: 'obstacle', type, off: (Math.random() - 0.5) * 1.2 });
        }
      }
      // Decorative buildings lining the road, denser than obstacles.
      if (i % 5 === 0) {
        segs[i].sprites.push({ kind: 'building', off: 1.6 + Math.random() * 0.6, h: 220 + Math.random() * 420, side: 1 });
        segs[i].sprites.push({ kind: 'building', off: -(1.6 + Math.random() * 0.6), h: 220 + Math.random() * 420, side: -1 });
      }
    }

    // The Vessel: a huge billboard anchored well before zone end so it
    // grows dramatically as you approach, then the leap set-piece fires
    // right as you'd reach it.
    if (zone.id === 'vessel') {
      const vesselSeg = Math.floor(zone.segCount * 0.72);
      segs[vesselSeg].sprites.push({ kind: 'vessel-billboard', off: 0 });
      this._vesselSegIndex = vesselSeg;
    }
    if (zone.id === 'littleisland') {
      const finalSeg = Math.floor(zone.segCount * 0.9);
      segs[finalSeg].sprites.push({ kind: 'island-billboard', off: 0 });
    }

    return segs;
  }

  // ------------------------------------------------------------
  // INPUT
  // ------------------------------------------------------------

  bindInput() {
    this._keyDownH = (e) => {
      if (this.finished) return;
      const k = e.key.toLowerCase();
      if (k === 'arrowleft' || k === 'a') this.steerDir = -1;
      else if (k === 'arrowright' || k === 'd') this.steerDir = 1;
      else if (k === ' ' || k === 'arrowup') { e.preventDefault(); this._actionDown(); }
    };
    this._keyUpH = (e) => {
      const k = e.key.toLowerCase();
      if (k === 'arrowleft' || k === 'a' || k === 'arrowright' || k === 'd') this.steerDir = 0;
      if (k === ' ' || k === 'arrowup') this._actionUp();
    };
    window.addEventListener('keydown', this._keyDownH);
    window.addEventListener('keyup', this._keyUpH);

    // Touch: left half of the canvas steers left, right half steers
    // right, held continuously -- a real driving feel through the
    // curves, not a discrete lane-snap swipe like the getaway car.
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
    const down = (e) => { e.preventDefault(); btn.classList.add('pressed'); this._actionDown(); };
    const up = () => { btn.classList.remove('pressed'); this._actionUp(); };
    btn.addEventListener('pointerdown', down);
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointerleave', up);
    btn.addEventListener('pointercancel', up);
    this._btn = btn; this._btnDown = down; this._btnUp = up;
  }

  _actionDown() {
    if (this.finished) return;
    if (!this.airborne && this.burstTimer <= 0) {
      this.charging = true;
      this.chargeStartAt = this._frame;
    }
  }

  _actionUp() {
    if (this.finished) return;
    if (this.charging) {
      const held = this._frame - this.chargeStartAt;
      this.charging = false;
      this.chargeMs = 0;
      if (held < 10) this._triggerJump();
      else this._triggerBurst();
    }
  }

  _triggerJump() {
    if (this.airborne) return;
    this.airborne = true;
    this.jumpVy = -3.1;
    this.jumpHeight = 0;
  }

  _triggerBurst() {
    this.burstTimer = 85;
    this.invuln = 85;
    this.floaters.push(this._makeFloater('SPIN DASH!', '#f4c542'));
  }

  _makeFloater(text, color) {
    return { x: this.canvas.width * 0.5, y: this.canvas.height * 0.22, text, color, life: 34, vy: -0.6 };
  }

  // ------------------------------------------------------------
  // UPDATE
  // ------------------------------------------------------------

  loop() {
    this._frame++;
    if (this.hitFlash > 0) this.hitFlash--;
    this.shakeX *= 0.7; this.shakeY *= 0.7;
    if (!this.finished) this.update();
    this.render();
    if (this.finished) return;
    this._af = requestAnimationFrame(() => this.loop());
  }

  _seg(zIndex) {
    const s = this.segments;
    return s[Math.max(0, Math.min(s.length - 1, zIndex))];
  }

  update() {
    const zone = ZOOMIES_ZONES[this.zoneIndex];
    const dt = 1 / 60;

    if (this.charging) this.chargeMs = Math.min(1, (this._frame - this.chargeStartAt) / 42);

    // Speed: ramps toward max over the run, bursts spike it hard,
    // off-road bleeds it off (real driving stakes through the curves).
    const targetSpeed = this.burstTimer > 0
      ? this.maxSpeed * 1.35
      : this.baseSpeed + (this.maxSpeed - this.baseSpeed) * Math.min(1, this.totalRunDistance / 40000);
    this.speed += (targetSpeed - this.speed) * (this.offRoad ? 0.02 : 0.06);
    if (this.offRoad && this.burstTimer <= 0) this.speed *= 0.985;
    if (this.burstTimer > 0) { this.burstTimer--; if (this.invuln > 0) this.invuln--; }

    this.spinAngle += (this.burstTimer > 0 ? 0.5 : 0.18 + this.speed * 0.00004);

    // Steering + curve pull. The road curving under you means standing
    // still on X drifts you toward the outside of the turn -- you have
    // to actively counter-steer, same as any pseudo-3D racer.
    const curSeg = this._seg(Math.floor(this.playerZ / P3D.segmentLength));
    const STEER_SPEED = 1900;
    this.playerX += this.steerDir * STEER_SPEED * dt;
    this.bank += ((this.steerDir * -0.35) - this.bank) * 0.15;
    this.offRoad = Math.abs(curSeg.worldX - this.playerX) > P3D.roadWidth * 1.05;
    if (this.offRoad) {
      this.shakeX = (Math.random() - 0.5) * 4;
    }

    // Jump arc
    if (this.airborne) {
      this.jumpVy += 0.12;
      this.jumpHeight += this.jumpVy;
      if (this.jumpHeight >= 0) { this.jumpHeight = 0; this.jumpVy = 0; this.airborne = false; }
    }

    // ---- Vessel leap set piece ----
    if (zone.id === 'vessel' && !this.vessel.done) {
      const distToVessel = (this._vesselSegIndex * P3D.segmentLength) - this.playerZ;
      if (!this.vessel.leaping && distToVessel < 900 && distToVessel > -200) {
        this.vessel.leaping = true; this.vessel.leapT = 0;
        this.airborne = true; this.jumpVy = -6.5; this.jumpHeight = 0;
        this.invuln = 130;
        this.floaters.push(this._makeFloater('THE VESSEL!', zone.accent));
      }
      if (this.vessel.leaping) {
        this.vessel.leapT++;
        if (this._frame % 3 === 0) {
          this.particles.push({
            x: this.canvas.width * (0.3 + Math.random() * 0.4), y: this.canvas.height * (0.2 + Math.random() * 0.3),
            vx: (Math.random() - 0.5) * 1.5, vy: 1.5 + Math.random(), life: 40, color: zone.accent, isCoinBurst: true,
          });
          this.coins++; this.chain++; this.bestChain = Math.max(this.bestChain, this.chain);
        }
        if (this.vessel.leapT > 90) { this.vessel.leaping = false; this.vessel.done = true; }
      }
    }

    // Advance along the track (frozen during the vessel's own leap --
    // that's a vertical/scripted beat, not forward road progress).
    if (!this.vessel.leaping) {
      const advance = this.speed * dt;
      this.playerZ += advance;
      this.totalRunDistance += advance;
    }

    // Zone transition
    if (this.playerZ >= (this.segments.length - 2) * P3D.segmentLength) {
      if (this.zoneIndex < ZOOMIES_ZONES.length - 1) {
        this.zoneIndex++;
        this.segments = this._buildZone(ZOOMIES_ZONES[this.zoneIndex]);
        this.playerZ = 0;
        this.playerX = this._seg(0).worldX;
        this.floaters.push(this._makeFloater(ZOOMIES_ZONES[this.zoneIndex].name.toUpperCase(), ZOOMIES_ZONES[this.zoneIndex].accent));
      } else {
        this._end();
        return;
      }
    }

    this._checkCollisions();

    this.particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += 0.15; p.life--; });
    this.particles = this.particles.filter(p => p.life > 0);
    this.floaters.forEach(f => { f.y += f.vy; f.life--; });
    this.floaters = this.floaters.filter(f => f.life > 0);

    this._updateHud();
  }

  _checkCollisions() {
    const playerSegIdx = Math.floor(this.playerZ / P3D.segmentLength);
    for (let d = -1; d <= 1; d++) {
      const seg = this.segments[playerSegIdx + d];
      if (!seg) continue;
      seg.sprites.forEach(spr => {
        if (spr.dead || (spr.kind !== 'coin' && spr.kind !== 'obstacle')) return;
        const spriteZ = (playerSegIdx + d) * P3D.segmentLength;
        if (Math.abs(spriteZ - this.playerZ) > P3D.segmentLength * 0.6) return;
        const spriteWorldX = seg.worldX + spr.off * P3D.roadWidth;
        if (Math.abs(spriteWorldX - this.playerX) > 300) return;

        if (spr.kind === 'coin') {
          spr.dead = true;
          this.coins++; this.chain++; this.bestChain = Math.max(this.bestChain, this.chain);
          this._burst(spriteWorldX, 260);
          return;
        }
        const def = ZOOMIES_OBSTACLES[spr.type];
        const clearedByJump = def.behavior === 'hop' && (this.airborne || this.jumpHeight < -6);
        if (clearedByJump) return;
        if (this.invuln > 0) { spr.dead = true; this.coins++; return; }
        spr.dead = true;
        this.chain = 0;
        this.hitFlash = 14;
        this.shakeX = (Math.random() - 0.5) * 12; this.shakeY = 8;
        this.speed *= 0.7;
      });
    }
  }

  _burst(worldX, dummy) {
    const p = this._project(worldX, 0, this.playerZ + 40);
    if (!p) return;
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2, sp = 1.4 + Math.random() * 3;
      this.particles.push({ x: p.x, y: p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1, life: 20 + Math.floor(Math.random() * 14), color: ZOOMIES_ZONES[this.zoneIndex].accent });
    }
  }

  _updateHud() {
    const zone = ZOOMIES_ZONES[this.zoneIndex];
    document.getElementById('zoomies-hud-title').textContent = zone.name;
    document.getElementById('zoomies-hud-hint').textContent = this.chain > 4 ? `${this.chain}x chain` : (this.offRoad ? 'off road!' : '');
    document.getElementById('zoomies-hud-meta').textContent = `Coins: ${this.coins}`;
    const chargeWrap = document.getElementById('zoomies-charge-wrap');
    const chargeFill = document.getElementById('zoomies-charge-fill');
    if (this.charging) {
      chargeWrap.classList.remove('hidden');
      chargeFill.style.width = `${Math.round(this.chargeMs * 100)}%`;
    } else {
      chargeWrap.classList.add('hidden');
    }
  }

  // ------------------------------------------------------------
  // PROJECTION
  // ------------------------------------------------------------

  _project(worldX, worldY, worldZ) {
    const dz = worldZ - this.playerZ;
    if (dz <= 1) return null;
    const W = this.canvas.width, H = this.canvas.height;
    const scale = P3D.cameraDepth / dz;
    const x = (W / 2) + scale * (worldX - this.playerX) * (W / 2);
    const y = (H / 2) - scale * (worldY - P3D.cameraHeight) * (H / 2) * 0.5 + H * 0.08;
    const w = scale * P3D.roadWidth * (W / 2);
    return { x, y, w, scale };
  }

  // ------------------------------------------------------------
  // RENDER
  // ------------------------------------------------------------

  render() {
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    const zone = ZOOMIES_ZONES[this.zoneIndex];
    ctx.clearRect(0, 0, W, H);

    this._renderSky(ctx, W, H, zone);

    ctx.save();
    ctx.translate(Math.round(this.shakeX), Math.round(this.shakeY));
    this._renderRoad(ctx, W, H, zone);
    this._renderPlayer(ctx, W, H, zone);
    ctx.restore();

    this._renderParticles(ctx);
    this._renderFloaters(ctx);

    // Vessel leap: a full psychedelic wash while airborne through it.
    if (this.vessel.leaping) {
      const t = this.vessel.leapT / 90;
      const hue = (this._frame * 4) % 360;
      ctx.fillStyle = `hsla(${hue},80%,60%,${0.12 + 0.1 * Math.sin(this._frame * 0.3)})`;
      ctx.fillRect(0, 0, W, H);
    }

    if (this.burstTimer > 0) {
      const a = Math.min(0.25, this.burstTimer / 85 * 0.25);
      const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, H * 0.7);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, `rgba(244,197,66,${a})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    if (this.hitFlash > 0) {
      ctx.fillStyle = `rgba(224,90,74,${0.2 * (this.hitFlash / 14)})`;
      ctx.fillRect(0, 0, W, H);
    }

    // Progress bar
    const zoneProgress = this.playerZ / ((this.segments.length - 2) * P3D.segmentLength);
    const priorZones = ZOOMIES_ZONES.slice(0, this.zoneIndex).reduce((s, z) => s + z.segCount, 0);
    const totalSegs = ZOOMIES_ZONES.reduce((s, z) => s + z.segCount, 0);
    const frac = Math.min(1, (priorZones + zoneProgress * ZOOMIES_ZONES[this.zoneIndex].segCount) / totalSegs);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(W * 0.1 - 3, 10, W * 0.8 + 6, 8);
    ctx.fillStyle = zone.accent;
    ctx.fillRect(W * 0.1, 12, W * 0.8 * frac, 4);
  }

  _renderSky(ctx, W, H, zone) {
    const horizonY = H * 0.5;
    const g = ctx.createLinearGradient(0, 0, 0, horizonY);
    g.addColorStop(0, zone.skyTop);
    g.addColorStop(1, zone.skyHorizon);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, horizonY);

    // Sun
    const sunR = W * 0.22;
    const sg = ctx.createRadialGradient(W / 2, horizonY, 2, W / 2, horizonY, sunR);
    sg.addColorStop(0, zone.sun);
    sg.addColorStop(1, jailAlphaSafe(zone.sun, 0));
    ctx.fillStyle = sg;
    ctx.beginPath(); ctx.arc(W / 2, horizonY, sunR, 0, Math.PI * 2); ctx.fill();
    // Retro sun stripes
    ctx.fillStyle = zone.skyTop;
    for (let i = 0; i < 5; i++) {
      const sy = horizonY - sunR * 0.7 + i * (sunR * 0.28) + (this._frame * 0.3) % (sunR * 0.28);
      ctx.fillRect(W / 2 - sunR, sy, sunR * 2, 6);
    }

    // Distant skyline
    const off = this.playerZ * 0.02;
    ctx.fillStyle = jailAlphaSafe(zone.building, 0.8);
    for (let i = 0; i < 14; i++) {
      const bx = ((i * 100 - off * 0.3) % (W + 140) + W + 140) % (W + 140) - 70;
      const bh = 40 + Math.sin(i * 1.9) * 24 + 24;
      ctx.fillRect(bx, horizonY - bh, 80, bh);
    }

    // Perspective grid on the "ground" below horizon, vaporwave-style,
    // showing through where the road doesn't cover.
    ctx.strokeStyle = jailAlphaSafe(zone.grid, 0.25);
    ctx.lineWidth = 1;
    for (let i = 1; i < 10; i++) {
      const y = horizonY + (H - horizonY) * (i / 10) * (i / 10);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
  }

  _renderRoad(ctx, W, H, zone) {
    const baseIdx = Math.floor(this.playerZ / P3D.segmentLength);
    let prevP = null;
    // Center-line dashes are collected here and stroked once at a fixed
    // pixel width afterward, instead of filling a separate perspective
    // trapezoid per segment -- per-segment fill looked fine far away,
    // but the handful of segments nearest the camera have huge screen-Y
    // deltas between them (normal for this projection), and a filled
    // trapezoid spanning that height read as a solid pole planted right
    // behind the player instead of a dash. A single fixed-width stroke
    // doesn't have that failure mode at any distance.
    const centerlinePts = [];
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
      // Grass/shoulder either side, wide enough to always cover the screen.
      ctx.fillStyle = rumble ? jailAlphaSafe(zone.rumbleA, 0.9) : jailAlphaSafe(zone.rumbleB, 0.9);
      ctx.fillRect(0, pNext.y, W, Math.max(1, p.y - pNext.y));

      // Road surface trapezoid
      ctx.fillStyle = zone.road;
      ctx.beginPath();
      ctx.moveTo(p.x - p.w, p.y);
      ctx.lineTo(p.x + p.w, p.y);
      ctx.lineTo(pNext.x + pNext.w, pNext.y);
      ctx.lineTo(pNext.x - pNext.w, pNext.y);
      ctx.closePath();
      ctx.fill();

      // Rumble strip edges
      ctx.fillStyle = rumble ? '#ffffff' : zone.roadLine;
      const rw = p.w * 0.04, rwN = pNext.w * 0.04;
      ctx.beginPath();
      ctx.moveTo(p.x - p.w, p.y); ctx.lineTo(p.x - p.w + rw, p.y);
      ctx.lineTo(pNext.x - pNext.w + rwN, pNext.y); ctx.lineTo(pNext.x - pNext.w, pNext.y);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(p.x + p.w - rw, p.y); ctx.lineTo(p.x + p.w, p.y);
      ctx.lineTo(pNext.x + pNext.w, pNext.y); ctx.lineTo(pNext.x + pNext.w - rwN, pNext.y);
      ctx.closePath(); ctx.fill();

      if (rumble) centerlinePts.push({ x: p.x, y: p.y });

      // Sprites anchored to this segment (drawn back-to-front since
      // we're iterating far -> near already).
      seg.sprites.forEach(spr => {
        if (spr.dead) return;
        this._renderSprite(ctx, spr, seg, segZ, zone);
      });

      prevP = p;
    }

    // Stroke the collected dash points as separate short segments (a
    // real dash gap between each rumbleLength group), fixed 3px width
    // regardless of distance.
    ctx.strokeStyle = jailAlphaSafe(zone.grid, 0.85);
    ctx.lineWidth = 3;
    let dashStart = null;
    for (let i = 0; i < centerlinePts.length; i++) {
      const cur = centerlinePts[i];
      const next = centerlinePts[i + 1];
      const contiguous = next && Math.abs(next.y - cur.y) < 90;
      if (dashStart === null) dashStart = cur;
      if (!contiguous) {
        ctx.beginPath();
        ctx.moveTo(dashStart.x, dashStart.y);
        ctx.lineTo(cur.x, cur.y);
        ctx.stroke();
        dashStart = null;
      }
    }
  }

  _renderSprite(ctx, spr, seg, segZ, zone) {
    // Right at the point of collection/collision, dz gets small enough
    // that scale spikes and, combined with animation (the coin's squash
    // spin), the sprite reads as a stray smear instead of an object.
    // The hit particle burst already sells "you got it" at that exact
    // moment, so just stop drawing the sprite itself once it's this
    // close -- nothing is lost, and it stops the visual artifact.
    if ((spr.kind === 'coin' || spr.kind === 'obstacle') && (segZ - this.playerZ) < P3D.segmentLength * 0.55) return;
    if (spr.kind === 'building') {
      const worldX = seg.worldX + spr.off * P3D.roadWidth;
      const p = this._project(worldX, 0, segZ);
      if (!p || p.scale <= 0) return;
      const bw = p.w * 0.5, bh = spr.h * p.scale * 0.5;
      ctx.fillStyle = jailAlphaSafe(zone.building, Math.min(1, p.scale * 3));
      ctx.fillRect(p.x - bw / 2, p.y - bh, bw, bh);
      ctx.fillStyle = jailAlphaSafe(zone.accent2, Math.min(0.5, p.scale * 1.5));
      for (let wy = p.y - bh + bh * 0.15; wy < p.y - bh * 0.1; wy += Math.max(4, bh * 0.16)) {
        ctx.fillRect(p.x - bw * 0.3, wy, bw * 0.6, Math.max(1, bh * 0.05));
      }
      return;
    }
    if (spr.kind === 'coin') {
      const worldX = seg.worldX + spr.off * P3D.roadWidth;
      const p = this._project(worldX, 180 + Math.sin(this._frame * 0.15 + worldX * 0.001) * 40, segZ);
      if (!p || p.scale <= 0) return;
      // Capped -- right at the moment of pickup, scale can spike hugely
      // (very small dz), and combined with the squash animation an
      // uncapped radius rendered as a tall thin bar instead of a coin.
      const r = Math.min(46, Math.max(2, 26 * p.scale));
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.scale(Math.max(0.15, Math.cos(this._frame * 0.08)), 1);
      ctx.fillStyle = zone.accent;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.beginPath(); ctx.arc(-r * 0.3, -r * 0.3, r * 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      return;
    }
    if (spr.kind === 'obstacle') {
      const worldX = seg.worldX + spr.off * P3D.roadWidth;
      const def = ZOOMIES_OBSTACLES[spr.type];
      const p = this._project(worldX, def.behavior === 'hop' ? 60 : 0, segZ);
      if (!p || p.scale <= 0) return;
      const r = Math.min(70, Math.max(2, def.r * 3 * p.scale));
      ctx.fillStyle = '#2a2420';
      ctx.beginPath(); ctx.ellipse(p.x, p.y, r, r * 0.7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = def.behavior === 'hop' ? '#e8b23a' : '#e05a4a';
      ctx.beginPath(); ctx.ellipse(p.x, p.y - r * 0.3, r * 0.5, r * 0.2, 0, 0, Math.PI * 2); ctx.fill();
      return;
    }
    if (spr.kind === 'vessel-billboard' || spr.kind === 'island-billboard') {
      const p = this._project(seg.worldX, 0, segZ);
      if (!p || p.scale <= 0) return;
      const size = Math.max(4, 2600 * p.scale);
      ctx.save();
      ctx.translate(p.x, p.y - size * 0.42);
      if (spr.kind === 'vessel-billboard') {
        ctx.rotate(this._frame * 0.006);
        ctx.strokeStyle = jailAlphaSafe(zone.accent, 0.8);
        ctx.lineWidth = Math.max(1, size * 0.01);
        for (let ring = 1; ring <= 6; ring++) {
          const rr = (size / 12) * ring;
          const seg2 = 6 + ring * 2;
          for (let s = 0; s < seg2; s++) {
            const a0 = (s / seg2) * Math.PI * 2, a1 = ((s + 1) / seg2) * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(Math.cos(a0) * rr, Math.sin(a0) * rr * 0.55);
            ctx.lineTo(Math.cos(a1) * rr, Math.sin(a1) * rr * 0.55);
            ctx.stroke();
          }
        }
      } else {
        ctx.fillStyle = jailAlphaSafe(zone.accent, 0.85);
        ctx.beginPath(); ctx.ellipse(0, 0, size * 0.35, size * 0.16, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = jailAlphaSafe('#2a5a70', 0.7); ctx.lineWidth = Math.max(1, size * 0.015);
        ctx.beginPath(); ctx.moveTo(0, size * 0.1); ctx.lineTo(0, size * 0.5); ctx.stroke();
      }
      ctx.restore();
    }
  }

  _renderPlayer(ctx, W, H, zone) {
    const px = W / 2, groundY = H * 0.82;
    const py = groundY + this.jumpHeight * 90 - (this.vessel.leaping ? 60 : 0);
    const r = Math.max(16, 22 - Math.abs(this.bank) * 4);

    for (let i = 0; i < this.trail.length; i++) {
      const a = (1 - i / this.trail.length) * 0.25;
      ctx.fillStyle = jailAlphaSafe(this.burstTimer > 0 ? '#f4c542' : zone.accent, a);
      ctx.beginPath(); ctx.arc(px - this.trail[i] * 20, py, r * (1 - i * 0.08), 0, Math.PI * 2); ctx.fill();
    }
    this.trail.unshift(this.bank);
    if (this.trail.length > 8) this.trail.pop();

    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(px, groundY + 22, 20, 6, 0, 0, Math.PI * 2); ctx.fill();

    if (this.charging) {
      ctx.fillStyle = jailAlphaSafe('#ffffff', 0.15 + this.chargeMs * 0.25);
      ctx.beginPath(); ctx.arc(px, py, r + 6 + this.chargeMs * 10, 0, Math.PI * 2); ctx.fill();
    }

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(this.spinAngle + this.bank);
    const grad = ctx.createRadialGradient(-4, -4, 2, 0, 0, r);
    const core = this.burstTimer > 0 ? '#fff4cf' : zone.accent;
    grad.addColorStop(0, '#ffffff'); grad.addColorStop(0.5, core); grad.addColorStop(1, jailAlphaSafe(zone.accent2, 0.9));
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = jailAlphaSafe(zone.accent2, 0.85);
    const spikeN = 8;
    for (let i = 0; i < spikeN; i++) {
      const a = (i / spikeN) * Math.PI * 2;
      const len = this.burstTimer > 0 ? r * 0.9 : r * 0.5;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r * 0.8, Math.sin(a) * r * 0.8);
      ctx.lineTo(Math.cos(a - 0.12) * (r + len), Math.sin(a - 0.12) * (r + len));
      ctx.lineTo(Math.cos(a + 0.12) * (r + len * 0.6), Math.sin(a + 0.12) * (r + len * 0.6));
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();

    if (this.invuln > 0) {
      ctx.strokeStyle = `rgba(255,255,255,${0.4 + 0.3 * Math.sin(this._frame * 0.5)})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(px, py, r + 9, 0, Math.PI * 2); ctx.stroke();
    }
  }

  _renderParticles(ctx) {
    this.particles.forEach(p => {
      ctx.globalAlpha = Math.max(0, p.life / 30);
      if (p.isCoinBurst) {
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - 2.5, p.y - 2.5, 5, 5);
      }
    });
    ctx.globalAlpha = 1;
  }

  _renderFloaters(ctx) {
    this.floaters.forEach(f => {
      ctx.globalAlpha = Math.max(0, Math.min(1, f.life / 20));
      ctx.fillStyle = f.color;
      ctx.font = 'bold 28px VT323, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(f.text, f.x, f.y);
    });
    ctx.globalAlpha = 1;
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

    document.getElementById('zoomies-results-coins').textContent = this.coins;
    document.getElementById('zoomies-results-chain').textContent = `${this.bestChain}x`;
    const overlay = document.getElementById('zoomies-results');
    overlay.classList.remove('hidden');
    document.getElementById('zoomies-results-continue').onclick = () => {
      overlay.classList.add('hidden');
      this.destroy();
      this.onComplete({ coins: this.coins, bestChain: this.bestChain });
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

function jailAlphaSafe(hex, a) {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16), g = parseInt(h.substring(2, 4), 16), b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

let zoomiesGame = null;
