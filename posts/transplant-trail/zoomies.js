// ============================================================
// ZOOMIES — a Sonic-style spin-dash rush through a stylized NYC
// ============================================================
//
// A one-time optional trail event, offered once after the bodega run
// and before Washington Square Park (see trail.js's showZoomiesOffer()/
// startZoomiesGame()). Auto-scrolling 3-lane runner: swipe to change
// lanes, tap to hop, hold-and-release to charge a spin-dash burst
// (brief invincibility + speed + auto-collect). Three zones follow the
// real west-side Manhattan geography roughly north to south: Hudson
// Yards (the Vessel) -> the High Line -> Little Island (Pier 55) --
// stylized, not satellite-accurate, the same way cannon.js's boroughs
// use real bridges/geography without being a literal map.
//
// The player is drawn as an abstract glowing spin-ball, not a licensed
// character likeness -- the "curled up and rolling" fantasy without
// actually being Sonic.
//
// No narrative copy is authored here -- every player-facing string that
// isn't a short functional UI label (matching existing precedent like
// "SPLASH!"/"PERFECT") is marked [PLACEHOLDER] for the user's own pass.

// Lengths tuned via a jsdom stress harness so a full run lands around
// 40-50 real seconds (was ~14s at the first-pass numbers -- distance
// covered per frame is capped once speed maxes out, so pacing has to be
// tuned against actual frame counts, not guessed from raw length).
const ZOOMIES_ZONES = [
  {
    id: 'vessel', name: 'Hudson Yards', length: 3200,
    skyTop: '#241633', skyBottom: '#4a2f5c', ground: '#15101c',
    accent: '#e8b23a', accent2: '#c86ab0',
  },
  {
    id: 'highline', name: 'The High Line', length: 3400,
    skyTop: '#0d2818', skyBottom: '#1f4a30', ground: '#0a1710',
    accent: '#7ec89a', accent2: '#f4c542',
  },
  {
    id: 'littleisland', name: 'Little Island', length: 3000,
    skyTop: '#0a1f30', skyBottom: '#123a52', ground: '#081420',
    accent: '#4fb8d8', accent2: '#e8b23a',
  },
];

const ZOOMIES_TOTAL_LENGTH = ZOOMIES_ZONES.reduce((s, z) => s + z.length, 0);

// Obstacle archetypes. 'dodge' spans the lane -- you have to swipe out
// of it. 'hop' is low enough to jump over. Both are pure silhouettes,
// no new written jokes needed -- the visual is the joke, same as the
// existing games' pigeons/hot-dog-carts/rat-mode.
const ZOOMIES_OBSTACLES = {
  cart:       { behavior: 'hop',   w: 34, h: 22 },
  scaffold:   { behavior: 'dodge', w: 30, h: 60 },
  tourists:   { behavior: 'dodge', w: 36, h: 44 },
  pigeons:    { behavior: 'hop',   w: 30, h: 16 },
  trashbags:  { behavior: 'hop',   w: 32, h: 20 },
  barrier:    { behavior: 'dodge', w: 26, h: 34 },
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
    this._tapHandler = null;
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
    this.zoneDistance = 0;
    this.totalDistance = 0;
    this.lane = 1;
    this.laneY = 0;
    this.baseSpeed = 5.6;
    this.speed = this.baseSpeed;
    this.coins = 0;
    this.chain = 0;
    this.bestChain = 0;

    this.airborne = false;
    this.jumpVy = 0;
    this.jumpHeight = 0;

    this.charging = false;
    this.chargeMs = 0;
    this.chargeStartAt = 0;
    this.burstTimer = 0;
    this.invuln = 0;

    this.spinAngle = 0;
    this.hitFlash = 0;
    this.shakeX = 0; this.shakeY = 0;
    this.wobbleY = 0;

    this.entities = [];
    this.spawnTimer = 30;
    this.trail = [];
    this.particles = [];
    this.floaters = [];

    // Vessel spiral-and-leap set piece (end of zone 0)
    this.vessel = { active: false, done: false, t: 0, leaping: false, leapT: 0 };
    // Little Island platform hop (zone 2) -- widened forgiving jump
    // window rather than a whole separate control scheme.
    this.islandBounce = 0;

    this.finished = false;
    this.gameOver = false;
  }

  bindInput() {
    let startY = null, triggered = false;
    const threshold = 34;
    const localY = (clientY) => clientY - this.canvas.getBoundingClientRect().top;

    this._pointerDown = (e) => {
      if (this.finished) return;
      startY = localY(e.clientY);
      triggered = false;
    };
    this._pointerMove = (e) => {
      if (this.finished || startY === null || triggered) return;
      const dy = localY(e.clientY) - startY;
      if (dy < -threshold) { this.changeLane(-1); triggered = true; }
      else if (dy > threshold) { this.changeLane(1); triggered = true; }
    };
    this._pointerUp = () => { startY = null; };
    this.canvas.addEventListener('pointerdown', this._pointerDown);
    this.canvas.addEventListener('pointermove', this._pointerMove);
    window.addEventListener('pointerup', this._pointerUp);

    this._keyDownH = (e) => {
      if (this.finished) return;
      const k = e.key.toLowerCase();
      if (k === 'arrowup') this.changeLane(-1);
      else if (k === 'arrowdown') this.changeLane(1);
      else if (k === ' ' || k === 'arrowright') { e.preventDefault(); this._actionDown(); }
    };
    this._keyUpH = (e) => {
      const k = e.key.toLowerCase();
      if (k === ' ' || k === 'arrowright') this._actionUp();
    };
    window.addEventListener('keydown', this._keyDownH);
    window.addEventListener('keyup', this._keyUpH);

    const btn = document.getElementById('zoomies-action-btn');
    const down = (e) => { e.preventDefault(); btn.classList.add('pressed'); this._actionDown(); };
    const up = () => { btn.classList.remove('pressed'); this._actionUp(); };
    btn.addEventListener('pointerdown', down);
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointerleave', up);
    btn.addEventListener('pointercancel', up);
    this._btn = btn; this._btnDown = down; this._btnUp = up;
  }

  changeLane(dir) {
    if (this.vessel.active || this.vessel.leaping) return; // scripted moment owns lane input
    this.lane = Math.max(0, Math.min(2, this.lane + dir));
  }

  // Tap = hop. Hold long enough and release = spin-dash burst. One
  // button, two moves -- the actual Sonic-y decision point.
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
      const heldFrames = this._frame - this.chargeStartAt;
      this.charging = false;
      this.chargeMs = 0;
      if (heldFrames < 10) {
        this.triggerJump();
      } else {
        this.triggerBurst();
      }
    }
  }

  triggerJump() {
    if (this.airborne) return;
    this.airborne = true;
    this.jumpVy = -3.1;
    this.jumpHeight = 0;
  }

  triggerBurst() {
    this.burstTimer = 85;
    this.invuln = 85;
    this.floaters.push(this._makeFloater('SPIN DASH!', '#f4c542'));
  }

  _makeFloater(text, color) {
    const W = this.canvas.width;
    return { x: W * 0.5, y: this.canvas.height * 0.3, text, color, life: 34, vy: -0.6 };
  }

  laneCenterY(H) {
    const trackTop = H * 0.52, trackBottom = H * 0.86;
    const laneH = (trackBottom - trackTop) / 3;
    return trackTop + laneH * (this.lane + 0.5);
  }

  loop() {
    this._frame++;
    if (this.hitFlash > 0) this.hitFlash--;
    this.shakeX *= 0.7; this.shakeY *= 0.7;
    if (!this.finished) this.update();
    this.render();
    if (this.finished) return;
    this._af = requestAnimationFrame(() => this.loop());
  }

  update() {
    const W = this.canvas.width, H = this.canvas.height;
    const zone = ZOOMIES_ZONES[this.zoneIndex];

    // Charge build-up while held
    if (this.charging) {
      this.chargeMs = Math.min(1, (this._frame - this.chargeStartAt) / 42);
    }

    // Effective forward speed
    if (this.burstTimer > 0) {
      this.burstTimer--;
      this.speed = this.baseSpeed * 2.05;
      if (this.invuln > 0) this.invuln--;
    } else {
      this.speed = this.baseSpeed + Math.min(2.4, this.totalDistance / 900);
    }

    this.spinAngle += (this.burstTimer > 0 ? 0.55 : 0.22 + this.speed * 0.01);

    // Jump arc
    if (this.airborne) {
      this.jumpVy += 0.12;
      this.jumpHeight += this.jumpVy;
      if (this.jumpHeight >= 0) { this.jumpHeight = 0; this.jumpVy = 0; this.airborne = false; }
    }

    // Little Island: a gentle perpetual bounce read as hopping the
    // flowerpot piers, on top of whatever real jump the player does.
    if (zone.id === 'littleisland') {
      this.islandBounce = Math.sin(this._frame * 0.09) * 5;
    } else {
      this.islandBounce = 0;
    }

    // ---- Vessel set piece: triggers near the end of zone 0 ----
    if (zone.id === 'vessel' && !this.vessel.done) {
      if (!this.vessel.active && !this.vessel.leaping && zone.length - this.zoneDistance < 170) {
        this.vessel.active = true; this.vessel.t = 0;
        this.lane = 1;
        this.floaters.push(this._makeFloater('THE VESSEL!', zone.accent));
      }
      if (this.vessel.active) {
        this.vessel.t++;
        this.spinAngle += 0.25; // extra spin through the climb
        if (this._frame % 5 === 0) this._spawnVesselCoin();
        if (this.vessel.t > 95) {
          this.vessel.active = false;
          this.vessel.leaping = true; this.vessel.leapT = 0;
          this.airborne = true; this.jumpVy = -5.2; this.jumpHeight = 0;
          this.floaters.push(this._makeFloater('LEAP!', '#ffffff'));
        }
      }
      if (this.vessel.leaping) {
        this.vessel.leapT++;
        if (this._frame % 4 === 0) this._spawnArcCoin(this.vessel.leapT);
        if (this.vessel.leapT > 55) {
          this.vessel.leaping = false;
          this.vessel.done = true;
          this.airborne = false; this.jumpHeight = 0; this.jumpVy = 0;
        }
      }
    }

    // Advance distance (frozen during the vessel climb itself, since
    // that's a vertical beat, not forward progress -- still advances
    // during the leap so it flows back into the run smoothly).
    if (!this.vessel.active) {
      this.zoneDistance += this.speed * 0.5;
      this.totalDistance += this.speed * 0.5;
    }

    // Zone transition
    if (this.zoneDistance >= zone.length) {
      if (this.zoneIndex < ZOOMIES_ZONES.length - 1) {
        this.zoneIndex++;
        this.zoneDistance = 0;
        this.floaters.push(this._makeFloater(ZOOMIES_ZONES[this.zoneIndex].name.toUpperCase(), ZOOMIES_ZONES[this.zoneIndex].accent));
      } else {
        this._end();
        return;
      }
    }

    // Spawn + move entities (suspended during the vessel's own climb --
    // it spawns its own coin pattern instead)
    if (!this.vessel.active && !this.vessel.leaping) {
      this.spawnTimer--;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = 26 + Math.floor(Math.random() * 20);
        this._spawnEntity();
      }
    }
    const dx = this.speed * 1.4;
    this.entities.forEach(e => { e.x -= dx; });
    this.entities = this.entities.filter(e => e.x > -80 && !e.dead);

    this._checkCollisions();

    // Trail + particles
    this.trail.unshift({ x: 0, y: 0, a: 1 });
    if (this.trail.length > 10) this.trail.pop();
    this.particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += 0.15; p.life--; });
    this.particles = this.particles.filter(p => p.life > 0);
    this.floaters.forEach(f => { f.y += f.vy; f.life--; });
    this.floaters = this.floaters.filter(f => f.life > 0);

    this._updateHud();
  }

  _spawnEntity() {
    const W = this.canvas.width;
    const r = Math.random();
    if (r < 0.62) {
      // Coin (or a short run of coins in one lane)
      const lane = Math.floor(Math.random() * 3);
      const runLen = Math.random() < 0.4 ? 3 : 1;
      for (let i = 0; i < runLen; i++) {
        this.entities.push({ type: 'coin', lane, x: W + 60 + i * 34, dead: false });
      }
    } else {
      const type = ZOOMIES_OBSTACLE_TYPES[Math.floor(Math.random() * ZOOMIES_OBSTACLE_TYPES.length)];
      const lane = Math.floor(Math.random() * 3);
      this.entities.push({ type, lane, x: W + 60, dead: false, obstacle: true });
    }
  }

  _spawnVesselCoin() {
    const W = this.canvas.width;
    const ang = (this.vessel.t / 95) * Math.PI * 6;
    const r = 20 + (this.vessel.t / 95) * 90;
    this.entities.push({
      type: 'coin', lane: 1, x: W + 40, dead: false,
      spiralAng: ang, spiralR: r,
    });
  }

  _spawnArcCoin(t) {
    const W = this.canvas.width;
    this.entities.push({ type: 'coin', lane: 1, x: W + 40, dead: false, arcT: t });
  }

  _checkCollisions() {
    const H = this.canvas.height;
    const px = 88;
    const py = this.laneCenterY(H) + this.jumpHeight * 0 + this.wobbleY;

    this.entities.forEach(e => {
      if (e.dead) return;
      const eLane = e.lane;
      const ey = this.laneCenterY(H);
      const sameLane = eLane === this.lane;
      const closeX = Math.abs(e.x - px) < 30;
      if (!closeX) return;
      // Coins in a spiral/arc render/collide at their own offset position,
      // not a fixed lane -- collected on proximity only.
      const isSpecial = e.spiralAng !== undefined || e.arcT !== undefined;

      if (e.type === 'coin') {
        if (isSpecial || sameLane) {
          e.dead = true;
          this.coins++;
          this.chain++;
          this.bestChain = Math.max(this.bestChain, this.chain);
          this._burst(px, ey, ZOOMIES_ZONES[this.zoneIndex].accent, 8);
        }
        return;
      }

      // Obstacle
      if (!sameLane) return;
      const def = ZOOMIES_OBSTACLES[e.type];
      const clearedByJump = def.behavior === 'hop' && (this.airborne || this.jumpHeight < -6);
      if (clearedByJump) return;
      if (this.invuln > 0) {
        // Bursting through -- plow it, small bonus, no penalty.
        e.dead = true;
        this.coins += 1;
        this._burst(px, ey, '#ffffff', 12);
        return;
      }
      e.dead = true;
      this.chain = 0;
      this.hitFlash = 14;
      this.shakeX = (Math.random() - 0.5) * 10;
      this.shakeY = 6;
      this._burst(px, ey, '#e05a4a', 10);
    });
  }

  _burst(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 1.4 + Math.random() * 3;
      this.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1, life: 20 + Math.floor(Math.random() * 14), color });
    }
  }

  _updateHud() {
    const zone = ZOOMIES_ZONES[this.zoneIndex];
    document.getElementById('zoomies-hud-title').textContent = zone.name;
    document.getElementById('zoomies-hud-hint').textContent = this.chain > 4 ? `${this.chain}x chain` : '';
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

  // ============================================
  // RENDER
  // ============================================

  render() {
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    const zone = ZOOMIES_ZONES[this.zoneIndex];
    ctx.clearRect(0, 0, W, H);

    ctx.save();
    ctx.translate(Math.round(this.shakeX), Math.round(this.shakeY));

    this._renderSky(ctx, W, H, zone);
    if (zone.id === 'vessel') this._renderVesselScene(ctx, W, H, zone);
    else if (zone.id === 'highline') this._renderHighlineScene(ctx, W, H, zone);
    else this._renderIslandScene(ctx, W, H, zone);

    this._renderTrack(ctx, W, H, zone);
    this._renderEntities(ctx, W, H, zone);
    this._renderPlayer(ctx, W, H, zone);
    this._renderParticles(ctx);
    this._renderFloaters(ctx);

    ctx.restore();

    // Burst vignette -- screen-space, rides on top of the shake.
    if (this.burstTimer > 0) {
      const a = Math.min(0.28, this.burstTimer / 85 * 0.28);
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

    // Progress bar across the whole run
    const pct = (this.zoneIndex > 0 ? ZOOMIES_ZONES.slice(0, this.zoneIndex).reduce((s, z) => s + z.length, 0) : 0
      ) + this.zoneDistance;
    const frac = Math.min(1, pct / ZOOMIES_TOTAL_LENGTH);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(W * 0.1 - 3, 10, W * 0.8 + 6, 8);
    ctx.fillStyle = zone.accent;
    ctx.fillRect(W * 0.1, 12, W * 0.8 * frac, 4);
  }

  _renderSky(ctx, W, H, zone) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, zone.skyTop);
    g.addColorStop(1, zone.skyBottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Soft drifting stars/motes -- reads as "rush," not literally night.
    ctx.fillStyle = `rgba(255,255,255,0.5)`;
    for (let i = 0; i < 40; i++) {
      const sx = ((i * 97 - this.totalDistance * 0.4) % (W + 60) + W + 60) % (W + 60) - 30;
      const sy = (i * 53) % (H * 0.5);
      ctx.fillRect(sx, sy, i % 6 === 0 ? 2 : 1, i % 6 === 0 ? 2 : 1);
    }
  }

  _skylineOffset() { return this.totalDistance * 1.1; }

  _renderSkyline(ctx, W, H, groundY, color, alpha) {
    const off = this._skylineOffset();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    for (let i = 0; i < 12; i++) {
      const bx = ((i * 130 - off * 0.35) % (W + 180) + W + 180) % (W + 180) - 90;
      const bh = 50 + Math.sin(i * 1.7) * 30 + 30;
      ctx.fillRect(bx, groundY - bh, 96, bh);
    }
    ctx.globalAlpha = 1;
  }

  _renderVesselScene(ctx, W, H, zone) {
    const groundY = H * 0.52;
    this._renderSkyline(ctx, W, H, groundY, '#3a2a4a', 0.55);

    // The Vessel -- a copper honeycomb lattice looming in the
    // background, spinning slowly during its own climb sequence.
    const cx = W * 0.5, cy = groundY - 10;
    const spin = this.vessel.active ? this.vessel.t * 0.05 : this._frame * 0.004;
    const scale = this.vessel.active ? 1.15 : 1;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(spin);
    ctx.scale(scale, scale);
    ctx.strokeStyle = jailAlphaSafe(zone.accent, 0.55);
    ctx.lineWidth = 2;
    for (let ring = 1; ring <= 5; ring++) {
      const rr = ring * 20;
      const seg = 6 + ring * 2;
      for (let s = 0; s < seg; s++) {
        const a0 = (s / seg) * Math.PI * 2, a1 = ((s + 1) / seg) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a0) * rr, Math.sin(a0) * rr * 0.55 - rr * 0.3);
        ctx.lineTo(Math.cos(a1) * rr, Math.sin(a1) * rr * 0.55 - rr * 0.3);
        ctx.stroke();
      }
    }
    ctx.restore();

    if (this.vessel.active) {
      ctx.fillStyle = `rgba(232,178,58,${0.08 + 0.05 * Math.sin(this._frame * 0.2)})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  _renderHighlineScene(ctx, W, H, zone) {
    const groundY = H * 0.52;
    this._renderSkyline(ctx, W, H, groundY, '#123a24', 0.5);

    // Elevated steel truss under the park + string lights above.
    const off = this._skylineOffset();
    ctx.strokeStyle = jailAlphaSafe('#5a4a38', 0.6);
    ctx.lineWidth = 2;
    for (let i = 0; i < 10; i++) {
      const bx = ((i * 90 - off * 0.6) % (W + 120) + W + 120) % (W + 120) - 60;
      ctx.beginPath();
      ctx.moveTo(bx, groundY); ctx.lineTo(bx + 45, groundY - 26); ctx.lineTo(bx + 90, groundY);
      ctx.stroke();
    }
    ctx.strokeStyle = jailAlphaSafe(zone.accent2, 0.5);
    ctx.beginPath();
    for (let x = 0; x < W; x += 4) {
      const y = groundY - 70 + Math.sin((x + off * 0.5) * 0.02) * 8;
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    for (let i = 0; i < 14; i++) {
      const bx = ((i * 60 - off * 0.5) % (W + 60) + W + 60) % (W + 60) - 30;
      const by = groundY - 70 + Math.sin((bx + off * 0.5) * 0.02) * 8 + 5;
      ctx.fillStyle = zone.accent2;
      ctx.beginPath(); ctx.arc(bx, by, 2.5, 0, Math.PI * 2); ctx.fill();
    }
  }

  _renderIslandScene(ctx, W, H, zone) {
    const groundY = H * 0.6;
    this._renderSkyline(ctx, W, H, groundY - 40, '#0e2c40', 0.4);

    // Water
    ctx.fillStyle = '#0d2a3e';
    ctx.fillRect(0, groundY, W, H - groundY);
    ctx.strokeStyle = 'rgba(120,190,220,0.25)'; ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      const wy = groundY + 14 + i * 18;
      ctx.beginPath();
      for (let x = 0; x < W; x += 4) ctx.lineTo(x, wy + Math.sin(x * 0.03 + this._frame * 0.05 + i) * 3.5);
      ctx.stroke();
    }

    // Mushroom-cap piers, bobbing gently
    const off = this._skylineOffset();
    for (let i = 0; i < 8; i++) {
      const bx = ((i * 110 - off * 0.7) % (W + 160) + W + 160) % (W + 160) - 80;
      const bob = Math.sin(this._frame * 0.06 + i) * 3;
      const capY = groundY - 26 + bob;
      ctx.strokeStyle = jailAlphaSafe('#2a5a70', 0.7); ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(bx, groundY + 10); ctx.lineTo(bx, capY); ctx.stroke();
      ctx.fillStyle = jailAlphaSafe(zone.accent, 0.7);
      ctx.beginPath(); ctx.ellipse(bx, capY, 26, 12, 0, 0, Math.PI * 2); ctx.fill();
    }
  }

  _renderTrack(ctx, W, H, zone) {
    const trackTop = H * 0.52, trackBottom = H * 0.86;
    const g = ctx.createLinearGradient(0, trackTop, 0, trackBottom);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, zone.ground);
    ctx.fillStyle = g;
    ctx.fillRect(0, trackTop, W, trackBottom - trackTop);

    const laneH = (trackBottom - trackTop) / 3;
    ctx.strokeStyle = jailAlphaSafe(zone.accent, 0.35);
    ctx.lineWidth = 1.5;
    ctx.setLineDash([10, 10]);
    for (let i = 1; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(0, trackTop + laneH * i);
      ctx.lineTo(W, trackTop + laneH * i);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Speed streaks on the track, faster during a burst.
    const streakSpeed = this.burstTimer > 0 ? 3.2 : 1.4;
    ctx.strokeStyle = jailAlphaSafe('#ffffff', 0.18);
    for (let i = 0; i < 14; i++) {
      const sx = ((i * 60 - this._frame * streakSpeed * 4) % (W + 60) + W + 60) % (W + 60) - 30;
      const ly = trackTop + laneH * (i % 3 + 0.5);
      ctx.beginPath(); ctx.moveTo(sx, ly); ctx.lineTo(sx - 26, ly); ctx.stroke();
    }
  }

  _renderEntities(ctx, W, H, zone) {
    const trackTop = H * 0.52, trackBottom = H * 0.86;
    this.entities.forEach(e => {
      if (e.dead) return;
      let ex = e.x, ey = this.laneCenterY(H);
      // Spiral/arc coins render at a fixed screen-space offset from the
      // Vessel's center rather than scrolling with normal traffic --
      // they're part of the scripted climb, not the lane stream.
      if (e.spiralAng !== undefined) {
        const cx = W * 0.5, cy = trackTop - 10;
        ex = cx + Math.cos(e.spiralAng) * e.spiralR;
        ey = cy + Math.sin(e.spiralAng) * e.spiralR * 0.4 - e.spiralR * 0.25;
      } else if (e.arcT !== undefined) {
        const cx = W * 0.5;
        ex = cx + (e.arcT - this.vessel.leapT) * 6 + 60;
        ey = trackTop - 40 - Math.sin(Math.min(1, e.arcT / 55) * Math.PI) * 70;
      }

      if (e.type === 'coin') {
        const bob = Math.sin(this._frame * 0.15 + ex * 0.05) * 3;
        ctx.save();
        ctx.translate(ex, ey + bob);
        ctx.rotate(this._frame * 0.12);
        ctx.fillStyle = zone.accent;
        ctx.beginPath(); ctx.ellipse(0, 0, 9, 9, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.beginPath(); ctx.ellipse(-3, -3, 3, 3, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        return;
      }

      const def = ZOOMIES_OBSTACLES[e.type];
      ctx.fillStyle = '#2a2420';
      ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1.5;
      const oy = def.behavior === 'hop' ? trackBottom - def.h * 0.6 : trackBottom - def.h;
      jailRoundRectPathSafe(ctx, ex - def.w / 2, oy, def.w, def.h, 5);
      ctx.fill(); ctx.stroke();
      // A little color accent so obstacle types read distinctly even as
      // silhouettes.
      ctx.fillStyle = def.behavior === 'hop' ? '#e8b23a' : '#e05a4a';
      ctx.fillRect(ex - def.w / 2 + 3, oy + 3, def.w - 6, 4);
    });
  }

  _renderPlayer(ctx, W, H, zone) {
    const px = 88;
    const groundY = this.laneCenterY(H);
    const py = groundY + this.jumpHeight * 60 - Math.abs(this.islandBounce) - (this.vessel.active ? 40 : 0) - (this.vessel.leaping ? Math.max(0, -this.jumpHeight * 90) : 0);
    const r = 15;

    // Trail
    for (let i = 0; i < this.trail.length; i++) {
      const a = (1 - i / this.trail.length) * 0.28;
      ctx.fillStyle = jailAlphaSafe(this.burstTimer > 0 ? '#f4c542' : zone.accent, a);
      ctx.beginPath();
      ctx.arc(px - i * 7, py, r * (1 - i * 0.06), 0, Math.PI * 2);
      ctx.fill();
    }

    // Ground shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(px, groundY + 22, 16, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Charge-up glow
    if (this.charging) {
      ctx.fillStyle = jailAlphaSafe('#ffffff', 0.15 + this.chargeMs * 0.25);
      ctx.beginPath(); ctx.arc(px, py, r + 6 + this.chargeMs * 10, 0, Math.PI * 2); ctx.fill();
    }

    // Core ball
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(this.spinAngle);
    const grad = ctx.createRadialGradient(-4, -4, 2, 0, 0, r);
    const coreColor = this.burstTimer > 0 ? '#fff4cf' : zone.accent;
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.5, coreColor);
    grad.addColorStop(1, jailAlphaSafe(zone.accent2, 0.9));
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();

    // Spikes
    const spikeN = 8;
    ctx.fillStyle = jailAlphaSafe(zone.accent2, 0.85);
    for (let i = 0; i < spikeN; i++) {
      const a = (i / spikeN) * Math.PI * 2;
      const len = this.burstTimer > 0 ? r * 0.9 : r * 0.55;
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
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 2.5, p.y - 2.5, 5, 5);
    });
    ctx.globalAlpha = 1;
  }

  _renderFloaters(ctx) {
    const W = this.canvas.width;
    this.floaters.forEach(f => {
      ctx.globalAlpha = Math.max(0, Math.min(1, f.life / 20));
      ctx.fillStyle = f.color;
      ctx.font = 'bold 28px VT323, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(f.text, f.x, f.y);
    });
    ctx.globalAlpha = 1;
  }

  // ============================================
  // END
  // ============================================

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
    if (this._pointerDown) this.canvas.removeEventListener('pointerdown', this._pointerDown);
    if (this._pointerMove) this.canvas.removeEventListener('pointermove', this._pointerMove);
    if (this._pointerUp) window.removeEventListener('pointerup', this._pointerUp);
    if (this._keyDownH) window.removeEventListener('keydown', this._keyDownH);
    if (this._keyUpH) window.removeEventListener('keyup', this._keyUpH);
    if (this._btn) {
      this._btn.removeEventListener('pointerdown', this._btnDown);
      this._btn.removeEventListener('pointerup', this._btnUp);
      this._btn.removeEventListener('pointerleave', this._btnUp);
      this._btn.removeEventListener('pointercancel', this._btnUp);
    }
  }
}

// Tiny local helpers so this file doesn't depend on jail-minigames.js's
// internal utilities (different chapter, shouldn't reach across).
function jailAlphaSafe(hex, a) {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16), g = parseInt(h.substring(2, 4), 16), b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}
function jailRoundRectPathSafe(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

let zoomiesGame = null;
