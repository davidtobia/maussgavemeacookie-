// ============================================================
// ZOOMIES v4 — NYC rooftop jump run
// ============================================================
//
// v1: flat 3-lane scroller (felt like the heist car). v2: a real
// pseudo-3D road (liked visually, gameplay unclear). v3: a RUSH-meter
// ribbon-following redesign meant to fix legibility -- direct verdict
// once actually played: "oh i see so you can tap to stay on a path?
// that's not a fun game." The core verb (continuous lane-following)
// was the problem, not the clarity of it. Direct reference given for
// what's wanted instead: "big, obvious jumps between visible
// platforms/gaps... you can SEE the gap, you jump, you either make it
// or don't, real stakes each time" -- a first-person Crash Bandicoot/
// Mario feeling, not an OutRun feeling.
//
// v4 keeps the one thing that was actually liked (the first-person
// pseudo-3D projection) and replaces the entire track model: instead
// of a continuous curving road, the world is a sequence of discrete
// rooftops with real gaps between them. You are always on a roof or
// in the air. There is no ribbon, no lane-following, no "stay inside
// an invisible boundary." There is exactly one core decision, made
// over and over: when to jump, and whether you'll make it.
//
// No new narrative copy -- short functional labels only (JUMP, MISSED,
// PERFECT-style feedback), matching this project's existing precedent.

function zoomiesAlpha(hex, a) {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16), g = parseInt(h.substring(2, 4), 16), b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

const P3D = {
  fieldOfViewDeg: 100,
  cameraHeight: 900,
};
P3D.cameraDepth = 1 / Math.tan((P3D.fieldOfViewDeg / 2) * Math.PI / 180);

// A run is just a generated sequence of rooftops. Each has a lateral
// center (worldX), a depth span (zStart..zEnd -- how far you can run
// on it), a width, a height (rooftops step up/down), and a decoration
// kind for visual variety. Gaps are the literal space between one
// roof's zEnd and the next roof's zStart.
function buildRooftops(count) {
  const roofs = [];
  let z = 400, x = 0, y = 0;
  for (let i = 0; i < count; i++) {
    // Difficulty ramps with i: gaps widen, roofs narrow, height
    // changes get bigger and more frequent -- for free, no separate
    // tuning curve, same trick the original plan used for the Vessel.
    const t = Math.min(1, i / (count * 0.85));
    const roofDepth = 900 - t * 250 + Math.random() * 200;
    const roofWidth = Math.max(340, 780 - t * 380);
    // Tuned against a fixed jump (see _triggerJump: max ~700-800 world
    // units at a perfectly-timed edge takeoff) -- gaps stay reliably
    // makeable with good timing instead of exceeding what the jump can
    // actually cover. First pass here overshot badly: gaps up to ~1140
    // units against a jump that (with groundSpeed coupled in) actually
    // covered ~2000 units, meaning a "well-timed" jump flew straight
    // over the entire next roof and failed almost every time --
    // confirmed via a jsdom trial landing 0/71 jumps before this fix.
    const gap = 220 + t * 260 + Math.random() * (100 + t * 140);
    const lateralShift = (Math.random() - 0.5) * (500 + t * 900);
    const heightShift = i === 0 ? 0 : (Math.random() < 0.35 + t * 0.25 ? (Math.random() - 0.5) * (260 + t * 260) : 0);

    x += i === 0 ? 0 : lateralShift;
    y += heightShift;
    const kind = ['flat', 'water-tower', 'antenna', 'billboard'][Math.floor(Math.random() * 4)];
    roofs.push({ index: i, x, y, zStart: z, zEnd: z + roofDepth, width: roofWidth, kind, cleared: false });
    z += roofDepth + gap;
  }
  return roofs;
}

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
    document.getElementById('zoomies-charge-wrap').classList.add('hidden');
    this._updateHud();
    this._showPrimer();
  }

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width = rect.width || window.innerWidth;
    this.canvas.height = rect.height || window.innerHeight;
  }

  reset() {
    this.roofs = buildRooftops(24); // a bounded run, not an endless one
    this.roofIndex = 0;
    this.playerZ = this.roofs[0].zStart + 60;
    this.playerX = this.roofs[0].x;
    this.playerY = this.roofs[0].y;
    this.groundSpeed = 1600; // world units/sec while running on a roof

    this.state = 'run'; // 'run' | 'air' | 'fall' | 'primer'
    this.vz = 0; this.vy = 0;
    this.airTime = 0;

    this.score = 0;
    this.streak = 0;
    this.bestStreak = 0;
    this.misses = 0;

    this.steerDir = 0;
    this.bank = 0;
    this.spinAngle = 0;
    this.jumpFlash = 0;
    this.landFlash = 0;
    this.hitFlash = 0;
    this.shakeX = 0; this.shakeY = 0;

    this.particles = [];
    this.floaters = [];
    this.trail = [];

    this.jumpEdgeGlow = 0; // 0..1, ramps as you approach a usable jump window
    this.finished = false;
  }

  // A short, literal primer before the run starts -- direct response
  // to "I do not understand what I'm supposed to be doing." Not prose,
  // just the two verbs (steer, jump) demonstrated with the same visual
  // language the game itself uses (the pulsing button, arrow glyphs),
  // dismissed by the player actually doing the thing once.
  _showPrimer() {
    this.state = 'primer';
    this._primerStep = 0; // 0: steer, 1: jump, 2: go
    this._primerHoldFrames = 0;
    this.render();
    this._af = requestAnimationFrame(() => this.loop());
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
      // "TAP TO START" (primer step 2) doesn't name the jump button --
      // a direct tap anywhere on the canvas should also confirm it.
      if (this.state === 'primer' && this._primerStep === 2) this._action();
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

  _action() {
    if (this.finished) return;
    if (this.state === 'primer') {
      // Step 0 (hold to steer) advances itself in _updatePrimer() from a
      // real sustained hold -- pressing jump/tapping early here is a
      // no-op on purpose, not a shortcut past it.
      if (this._primerStep === 1) { this._primerStep = 2; this.jumpFlash = 14; }
      else if (this._primerStep === 2) { this.state = 'run'; }
      return;
    }
    if (this.state === 'run') this._triggerJump();
  }

  _triggerJump() {
    const roof = this.roofs[this.roofIndex];
    const distToEdge = roof.zEnd - this.playerZ;
    // Jump window: the last ~34% of the roof. Jumping earlier than
    // that undershoots on purpose -- the whole point is the edge has
    // to be a real, felt decision, not a free action from anywhere.
    const windowLen = (roof.zEnd - roof.zStart) * 0.34;
    if (distToEdge > windowLen) {
      // Too early -- a short hop that reliably falls short of even the
      // smallest gap, not a real leap. Jump physics are independent of
      // groundSpeed entirely now (see the note on gap generation above
      // for why coupling them badly overshot every real jump too).
      this.state = 'air'; this.vy = -5; this.vz = 380;
      this.airTime = 0; this._shortHop = true;
      this.jumpFlash = 10;
      return;
    }
    this.state = 'air';
    this._shortHop = false;
    // Leap power scales with how close to the edge the jump landed --
    // right at the edge covers the biggest gaps; early in the window
    // covers less. Real, readable skill expression. Tuned against the
    // gap-generation formula above (max gap ~620 units) so a
    // perfectly-timed edge jump (edgeFactor=1, ~940 units of range)
    // reliably lands well inside the next roof instead of overshooting
    // past it, and a minimum-window jump (edgeFactor=0, ~600 units)
    // still clears the smallest gap with room to spare.
    const edgeFactor = 1 - Math.max(0, distToEdge) / windowLen; // 0..1
    this.vy = -8.5 - edgeFactor * 2;
    this.vz = 600 + edgeFactor * 340;
    this.airTime = 0;
    this.jumpFlash = 14;
    this.bank = -this.steerDir * 0.3;
  }

  _makeFloater(text, color) {
    return { x: this.canvas.width * 0.5, y: this.canvas.height * 0.26, text, color, life: 34, vy: -0.7 };
  }

  // ------------------------------------------------------------
  // UPDATE
  // ------------------------------------------------------------

  loop() {
    this._frame++;
    if (this.jumpFlash > 0) this.jumpFlash--;
    if (this.landFlash > 0) this.landFlash--;
    if (this.hitFlash > 0) this.hitFlash--;
    this.shakeX *= 0.7; this.shakeY *= 0.7;
    if (this.state === 'primer') this._updatePrimer();
    else if (!this.finished) this.update();
    this.render();
    if (this.finished) return;
    this._af = requestAnimationFrame(() => this.loop());
  }

  _updatePrimer() {
    this.spinAngle += 0.14;
    this.bank += ((this.steerDir * -0.3) - this.bank) * 0.15;
    // Step 0 ("HOLD LEFT OR RIGHT SIDE") has to advance from an actual
    // sustained hold, checked every frame -- it used to only count a
    // pointerdown *event* (once per touch, not once per frame held),
    // so a real hold never accumulated past 1 and the primer could
    // never be gotten past this way at all. Advances itself once held
    // long enough; no extra jump-button press needed to "confirm" it.
    if (this._primerStep === 0) {
      if (this.steerDir !== 0) this._primerHoldFrames++;
      if (this._primerHoldFrames > 20) { this._primerStep = 1; this._primerHoldFrames = 0; }
    }
  }

  update() {
    const dt = 1 / 60;
    this.spinAngle += 0.16 + (this.state === 'air' ? this.vz * 0.00006 : 0.05);
    this.bank += ((this.state === 'air' ? this.bank : this.steerDir * -0.3) - this.bank) * 0.15;

    if (this.state === 'run') {
      this.playerX += this.steerDir * 900 * dt;
      this.playerZ += this.groundSpeed * dt;

      const roof = this.roofs[this.roofIndex];
      const distToEdge = roof.zEnd - this.playerZ;
      const windowLen = (roof.zEnd - roof.zStart) * 0.34;
      this.jumpEdgeGlow = Math.max(0, Math.min(1, 1 - distToEdge / windowLen));

      if (this.playerZ >= roof.zEnd) {
        // Walked off without jumping -- an automatic short, doomed hop.
        this.state = 'air'; this.vy = -3; this.vz = 260; this.airTime = 0; this._shortHop = true;
      }
    } else if (this.state === 'air') {
      this.airTime++;
      this.vy += 0.34;
      this.playerY -= this.vy * (this.roofs[this.roofIndex].y > this.playerY ? -1 : 1) * 0; // placeholder to keep lint calm; not used
      this.playerZ += this.vz * dt;
      this.playerX += this.steerDir * 700 * dt;
      // Height above the takeoff roof, purely for the arc render --
      // real landing/fail logic is distance-based (below), not this.
      this._arcHeight = (this._arcHeight || 0);
      this._arcHeight = Math.max(0, this._arcHeight - this.vy * dt * 60 * 0.5 + (this.airTime === 1 ? 0 : 0));

      this._checkLanding();
    } else if (this.state === 'fall') {
      this.airTime++;
      this.vy += 0.5;
      this._arcHeight -= this.vy * 4;
      if (this._arcHeight < -900) this._respawn();
    }

    this.particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += 0.15; p.life--; });
    this.particles = this.particles.filter(p => p.life > 0);
    this.floaters.forEach(f => { f.y += f.vy; f.life--; });
    this.floaters = this.floaters.filter(f => f.life > 0);

    this._updateHud();
  }

  // A real, symmetric jump arc measured in world units (not just a
  // screen-space bob): rises then falls back to roof height over
  // `airTime`, actual height is a function of vy integrated over time.
  _arcY() {
    // Reconstruct height from the initial vy and elapsed time, standard
    // kinematics -- height = v0*t - 0.5*g*t^2, scaled to feel right at
    // 60fps with vy in "per-frame" units.
    const t = this.airTime;
    const g = 0.34;
    const v0 = -this._takeoffVy || 9.5;
    return v0 * t - 0.5 * g * t * t;
  }

  _checkLanding() {
    // Find the arc height directly from kinematics so landing detection
    // doesn't depend on a separately-integrated value drifting out of
    // sync with the actual jump.
    if (this._takeoffVy === undefined) this._takeoffVy = -this.vy;
    const h = this._takeoffVy * this.airTime - 0.5 * 0.34 * this.airTime * this.airTime;
    if (h > 0) return; // still rising or at apex, can't land yet

    // Back on roof-height plane -- check if there's a roof under us.
    const target = this.roofs[this.roofIndex + 1];
    const cur = this.roofs[this.roofIndex];
    const landedOnNext = target && this.playerZ >= target.zStart && this.playerZ <= target.zEnd &&
      Math.abs(this.playerX - target.x) < target.width * 0.5;
    const landedBackOnCurrent = this.playerZ <= cur.zEnd && Math.abs(this.playerX - cur.x) < cur.width * 0.5;

    if (landedOnNext) {
      this._land(this.roofIndex + 1);
    } else if (landedBackOnCurrent && this._shortHop) {
      // The "jumped too early" case landing back on the same roof --
      // not a fail, just wasted the jump, keep running.
      this.state = 'run';
      this._takeoffVy = undefined;
    } else {
      this._fail();
    }
  }

  _land(index) {
    this.roofIndex = index;
    this.state = 'run';
    this._takeoffVy = undefined;
    this.playerZ = Math.max(this.playerZ, this.roofs[index].zStart + 10);
    this.playerX = Math.max(this.roofs[index].x - this.roofs[index].width * 0.4,
      Math.min(this.roofs[index].x + this.roofs[index].width * 0.4, this.playerX));

    this.streak++;
    this.bestStreak = Math.max(this.bestStreak, this.streak);
    const bonus = this._shortHop ? 0 : 40 + this.streak * 6;
    this.score += bonus;
    this.landFlash = 14;
    this.shakeY = 6; this.shakeX = (Math.random() - 0.5) * 4;
    this._burstAtPlayer(this.roofs[index].zStart + 5, 12);
    if (this.streak > 1 && this.streak % 3 === 0) this.floaters.push(this._makeFloater(`${this.streak}x STREAK`, '#f4c542'));

    if (index >= this.roofs.length - 1) this._end();
  }

  _fail() {
    this.state = 'fall';
    this._arcHeight = this._takeoffVy * this.airTime - 0.5 * 0.34 * this.airTime * this.airTime;
    this.vy = Math.max(0, this.vy);
    this.streak = 0;
    this.misses++;
    this.hitFlash = 16;
    this.floaters.push(this._makeFloater('MISSED', '#e05a4a'));
    this.shakeX = (Math.random() - 0.5) * 10; this.shakeY = 6;
  }

  _respawn() {
    // No death -- real stakes (streak resets, a miss is logged, the
    // fall itself is a felt beat) without a hard game-over. Reappear
    // running on the roof you failed to leave.
    const cur = this.roofs[this.roofIndex];
    this.playerX = cur.x;
    this.playerZ = Math.max(cur.zStart + 40, Math.min(cur.zEnd - 60, this.playerZ - 200));
    this.playerY = cur.y;
    this.state = 'run';
    this._takeoffVy = undefined;
    this._arcHeight = 0;
  }


  _burstAtPlayer(zHint, n) {
    const p = this._project(this.playerX, this.playerY, this.playerZ);
    if (!p) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 1.4 + Math.random() * 3;
      this.particles.push({ x: p.x, y: p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1.5, life: 20 + Math.floor(Math.random() * 14), color: '#f4c542' });
    }
  }

  // ------------------------------------------------------------
  // PROJECTION
  // ------------------------------------------------------------

  _project(worldX, worldY, worldZ) {
    const dz = worldZ - this.playerZ + 60;
    if (dz <= 1) return null;
    const W = this.canvas.width, H = this.canvas.height;
    const scale = P3D.cameraDepth / dz;
    const camY = this.playerY + P3D.cameraHeight;
    const x = (W / 2) + scale * (worldX - this.playerX) * (W / 2);
    const y = (H / 2) - scale * (worldY - camY) * (H / 2) * 0.5 + H * 0.08;
    return { x, y, scale };
  }

  _ws(worldUnits, scale) { return scale * worldUnits * (this.canvas.width / 2); }

  // ------------------------------------------------------------
  // RENDER
  // ------------------------------------------------------------

  render() {
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    ctx.clearRect(0, 0, W, H);

    const rushT = Math.min(1, this.streak / 8);
    ctx.filter = `saturate(${100 + rushT * 90}%)`;

    this._renderSky(ctx, W, H);

    ctx.save();
    ctx.translate(Math.round(this.shakeX), Math.round(this.shakeY));
    this._renderRoofs(ctx, W, H);
    if (this.state !== 'primer') this._renderPlayer(ctx, W, H);
    ctx.restore();

    ctx.filter = 'none';
    this._renderParticles(ctx);
    this._renderFloaters(ctx);

    if (this.hitFlash > 0) { ctx.fillStyle = `rgba(224,90,74,${0.22 * (this.hitFlash / 16)})`; ctx.fillRect(0, 0, W, H); }
    if (this.landFlash > 0) { ctx.fillStyle = `rgba(244,197,66,${0.12 * (this.landFlash / 14)})`; ctx.fillRect(0, 0, W, H); }
    if (this.jumpFlash > 0) { ctx.fillStyle = `rgba(255,255,255,${0.1 * (this.jumpFlash / 14)})`; ctx.fillRect(0, 0, W, H); }

    if (this.state === 'primer') this._renderPrimer(ctx, W, H);

    // HUD-ish: streak + jump-window edge glow, both load-bearing
    // legibility, not decoration.
    if (this.state === 'run' && this.jumpEdgeGlow > 0.05) {
      ctx.fillStyle = `rgba(244,197,66,${this.jumpEdgeGlow * 0.35})`;
      ctx.fillRect(0, H - 8, W, 8);
    }
  }

  _renderSky(ctx, W, H) {
    const horizonY = H * 0.48;
    const g = ctx.createLinearGradient(0, 0, 0, horizonY);
    g.addColorStop(0, '#150a26'); g.addColorStop(1, '#ff6ec7');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, horizonY);
    // Distant skyline, well below the roofs we're actually jumping.
    ctx.fillStyle = 'rgba(30,15,45,0.7)';
    const off = this.playerZ * 0.05;
    for (let i = 0; i < 10; i++) {
      const bx = ((i * 120 - off * 0.2) % (W + 140) + W + 140) % (W + 140) - 70;
      const bh = 30 + Math.sin(i * 1.9) * 18 + 18;
      ctx.fillRect(bx, horizonY - bh, 80, bh);
    }
  }

  _renderRoofs(ctx, W, H) {
    // Void below/between the roofs (nothing but city-glow far down) --
    // filled once, behind everything. This used to be re-filled inside
    // the per-roof loop below, which wiped out every nearer roof already
    // drawn that same frame (only the single farthest roof in range ever
    // actually stayed visible) -- caught from a real gameplay screenshot
    // showing an almost-empty canvas.
    ctx.fillStyle = '#0a0616';
    ctx.fillRect(0, 0, W, H);

    // Farthest-to-nearest so nearer roofs correctly paint over farther ones.
    const startI = Math.max(0, this.roofIndex - 1);
    const endI = Math.min(this.roofs.length, this.roofIndex + 6);
    for (let i = endI - 1; i >= startI; i--) {
      const r = this.roofs[i];
      const pNear = this._project(r.x, r.y, r.zStart);
      const pFar = this._project(r.x, r.y, r.zEnd);
      if (!pNear && !pFar) continue;
      const useNear = pNear || pFar, useFar = pFar || pNear;
      const wNear = this._ws(r.width * 0.5, useNear.scale);
      const wFar = this._ws(r.width * 0.5, useFar.scale);

      // Roof top surface.
      ctx.fillStyle = i % 2 === 0 ? '#2a2438' : '#241f30';
      ctx.beginPath();
      ctx.moveTo(useNear.x - wNear, useNear.y); ctx.lineTo(useNear.x + wNear, useNear.y);
      ctx.lineTo(useFar.x + wFar, useFar.y); ctx.lineTo(useFar.x - wFar, useFar.y);
      ctx.closePath(); ctx.fill();

      // Edge trim -- brighter right at the jump-off edge so the gap
      // reads clearly (the single most important line in the game).
      ctx.strokeStyle = i === this.roofIndex ? zoomiesAlpha('#f4c542', 0.5 + this.jumpEdgeGlow * 0.5) : 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(useFar.x - wFar, useFar.y); ctx.lineTo(useFar.x + wFar, useFar.y); ctx.stroke();

      // Roof props for silhouette variety + real NYC read.
      this._renderRoofProp(ctx, r, useNear);
    }
  }

  _renderRoofProp(ctx, r, p) {
    if (!p || p.scale <= 0) return;
    const cx = p.x, cy = p.y;
    if (r.kind === 'water-tower') {
      const s = Math.max(4, this._ws(90, p.scale));
      ctx.fillStyle = '#5a4530';
      ctx.beginPath(); ctx.moveTo(cx - s * 0.5, cy); ctx.lineTo(cx - s * 0.4, cy - s * 1.1); ctx.lineTo(cx + s * 0.4, cy - s * 1.1); ctx.lineTo(cx + s * 0.5, cy); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#3a2c1c';
      ctx.beginPath(); ctx.moveTo(cx - s * 0.55, cy - s * 1.1); ctx.lineTo(cx, cy - s * 1.6); ctx.lineTo(cx + s * 0.55, cy - s * 1.1); ctx.closePath(); ctx.fill();
    } else if (r.kind === 'antenna') {
      const s = Math.max(4, this._ws(140, p.scale));
      ctx.strokeStyle = '#888'; ctx.lineWidth = Math.max(1, s * 0.03);
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy - s); ctx.stroke();
      ctx.fillStyle = '#e05a4a'; ctx.beginPath(); ctx.arc(cx, cy - s, Math.max(1, s * 0.06), 0, Math.PI * 2); ctx.fill();
    } else if (r.kind === 'billboard') {
      const s = Math.max(4, this._ws(160, p.scale));
      ctx.fillStyle = '#1a1a1a'; ctx.fillRect(cx - s * 0.6, cy - s * 0.5, s * 1.2, s * 0.5);
      ctx.fillStyle = '#f58426'; ctx.fillRect(cx - s * 0.5, cy - s * 0.42, s * 1.0, s * 0.34);
    }
  }

  _renderPlayer(ctx, W, H) {
    const px = W / 2;
    let py = H * 0.8;
    if (this.state === 'air' || this.state === 'fall') {
      const t = this.airTime;
      const h = this.state === 'fall' ? (this._arcHeight || 0) : (this._takeoffVy || 9.5) * t - 0.5 * 0.34 * t * t;
      py -= h * 3.2;
    }
    const r = 20;

    for (let i = 0; i < this.trail.length; i++) {
      const a = (1 - i / this.trail.length) * 0.22;
      ctx.fillStyle = zoomiesAlpha('#f4c542', a);
      ctx.beginPath(); ctx.arc(px - this.trail[i] * 16, py, r * (1 - i * 0.08), 0, Math.PI * 2); ctx.fill();
    }
    this.trail.unshift(this.bank);
    if (this.trail.length > 7) this.trail.pop();

    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(px, H * 0.8 + 18, 18, 5, 0, 0, Math.PI * 2); ctx.fill();

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(this.spinAngle + this.bank);
    const grad = ctx.createRadialGradient(-4, -4, 2, 0, 0, r);
    grad.addColorStop(0, '#ffffff'); grad.addColorStop(0.5, '#f4c542'); grad.addColorStop(1, '#c86ab0');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = zoomiesAlpha('#c86ab0', 0.85);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2, len = r * 0.5;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r * 0.8, Math.sin(a) * r * 0.8);
      ctx.lineTo(Math.cos(a - 0.12) * (r + len), Math.sin(a - 0.12) * (r + len));
      ctx.lineTo(Math.cos(a + 0.12) * (r + len * 0.6), Math.sin(a + 0.12) * (r + len * 0.6));
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
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
      ctx.font = 'bold 28px VT323, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(f.text, f.x, f.y);
    });
    ctx.globalAlpha = 1;
  }

  // Two-step primer -- demonstrated, not narrated. Step 0: hold either
  // half of the screen, watch the ball actually move (a real,
  // unmissable answer to "does my input do anything"). Step 1: tap the
  // action button once, watch it hop, so the button has proven itself
  // before the first real edge ever arrives.
  _renderPrimer(ctx, W, H) {
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    if (this._primerStep === 0) {
      ctx.fillStyle = '#f4c542'; ctx.font = 'bold 24px VT323, monospace';
      ctx.fillText('HOLD LEFT OR RIGHT SIDE', W / 2, H * 0.3);
      ctx.fillText('OF THE SCREEN TO STEER', W / 2, H * 0.34);
      const pulse = 6 + Math.sin(this._frame * 0.15) * 4;
      ctx.strokeStyle = zoomiesAlpha('#f4c542', 0.7); ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(40, H * 0.5); ctx.lineTo(40 + pulse, H * 0.5 - 14); ctx.lineTo(40 + pulse, H * 0.5 + 14); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(W - 40, H * 0.5); ctx.lineTo(W - 40 - pulse, H * 0.5 - 14); ctx.lineTo(W - 40 - pulse, H * 0.5 + 14); ctx.closePath(); ctx.stroke();
    } else if (this._primerStep === 1) {
      ctx.fillStyle = '#f4c542'; ctx.font = 'bold 24px VT323, monospace';
      ctx.fillText('NOW TAP JUMP', W / 2, H * 0.3);
      ctx.fillText('TO LEAP THE GAP', W / 2, H * 0.34);
    } else {
      ctx.fillStyle = '#e05a4a'; ctx.font = 'bold 26px VT323, monospace';
      ctx.fillText('SEE THE EDGE. JUMP AT IT.', W / 2, H * 0.3);
      ctx.fillStyle = '#f4c542'; ctx.font = '18px VT323, monospace';
      ctx.fillText('miss the timing, miss the roof.', W / 2, H * 0.34);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 20px VT323, monospace';
      ctx.fillText('TAP TO START', W / 2, H * 0.44);
    }
  }

  _updateHud() {
    document.getElementById('zoomies-hud-title').textContent = 'ROOFTOPS';
    document.getElementById('zoomies-hud-hint').textContent = this.streak > 2 ? `${this.streak}x streak` : '';
    document.getElementById('zoomies-hud-meta').textContent = `Score: ${this.score}`;
    const btn = document.getElementById('zoomies-action-btn');
    const label = btn.querySelector('.zoomies-action-label');
    if (label) label.textContent = 'JUMP';
  }

  // ------------------------------------------------------------
  // END
  // ------------------------------------------------------------

  _end() {
    this.finished = true;
    if (this._af) cancelAnimationFrame(this._af);
    document.getElementById('zoomies-hud').classList.add('hidden');
    document.getElementById('zoomies-controls').classList.add('hidden');

    document.getElementById('zoomies-results-coins').textContent = this.score;
    document.getElementById('zoomies-results-chain').textContent = `${this.bestStreak}x`;
    const overlay = document.getElementById('zoomies-results');
    overlay.classList.remove('hidden');
    document.getElementById('zoomies-results-continue').onclick = () => {
      overlay.classList.add('hidden');
      this.destroy();
      this.onComplete({ score: this.score, bestStreak: this.bestStreak, misses: this.misses });
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
