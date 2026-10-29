/**
 * THE TRANSPLANT TRAIL - JET SKI (phase 1: the ride)
 * ==================================================
 * Chosen at Liberty Island ("Steal a jet ski", liberty.js). SSX-style:
 * a whale's blowhole fires you into the sky, you drop onto a downhill
 * slope made of water, and race cops and pirates on jet skis to a
 * splashdown at Battery Park. Camera behind you.
 *
 * Phase 1 is only the ride: launch, slope, drag-to-steer, rivals, finish.
 * Planned on top (not built yet): proximity prompts that fire quick skill
 * games, attacks that fill a boost meter (tap to go faster) and a special-
 * move meter, and jumps with a trick wheel.
 *
 * You can't get caught or fail -- placing only changes your score.
 *
 * Rendering is the classic pseudo-3D segment road: the track is a list of
 * short segments, each with a curve and a height, projected near-to-far
 * with the nearer segment clipping the farther ones. A steady downhill
 * just lowers the vanishing line -- which is exactly the "looking down a
 * steep run" view SSX has.
 */

const JS = {
  seg: 200,           // segment length, world units
  road: 2200,         // half-width of the water channel
  camHeight: 900,
  fov: 100,
  draw: 220,          // segments drawn ahead
  baseSpeed: 9200,    // world units / s
  slopeAccel: 9000,   // extra target speed per unit of slope
  maxSpeed: 13500,
  steep: 1.3,         // visual steepness: how hard the run drops away (doesn't change speed)
  hitSlow: 0.55,
  rivals: [           // who's racing you (kind sets the paint job)
    'cop', 'pirate', 'cop', 'pirate', 'cop', 'pirate', 'cop',
  ],
  finishBonus: [6000, 4000, 3000, 2000, 1500, 1200, 1000, 800],
  passBonus: 100,
};
JS.depth = 1 / Math.tan((JS.fov / 2) * Math.PI / 180);
JS.playerZ = JS.camHeight * JS.depth; // how far ahead of the camera you sit

class JetskiGame {
  constructor(gameState, onComplete) {
    this.gameState = gameState;
    this.onComplete = onComplete;
    this.best = 0;
    this._af = null;
  }

  init() {
    this.canvas = document.getElementById('jetski-canvas');
    this.ctx = this.canvas.getContext('2d');
    this._resize = () => {
      const r = this.canvas.getBoundingClientRect();
      this.W = r.width || window.innerWidth;
      this.H = r.height || window.innerHeight;
      this.dpr = Math.min(2, window.devicePixelRatio || 1);
      this.canvas.width = Math.round(this.W * this.dpr);
      this.canvas.height = Math.round(this.H * this.dpr);
    };
    this._resize();
    window.addEventListener('resize', this._resize);
    if (typeof ResizeObserver === 'function') {
      this._ro = new ResizeObserver(this._resize);
      this._ro.observe(this.canvas);
    }

    // Drag to steer: the jet ski follows how far your thumb has moved
    // since it went down, wherever on the screen that is. Touch goes
    // through touch events (reliable preventDefault on iOS), mouse/pen
    // through pointer events.
    this._drag = null;
    const start = (x) => { this._drag = { x0: x, t0: this.steerTarget }; this._tap(); };
    const move = (x) => {
      if (!this._drag) return;
      this.steerTarget = Math.max(-1.15, Math.min(1.15, this._drag.t0 + ((x - this._drag.x0) / (this.W * 0.42)) * 1.6));
    };
    const end = () => { this._drag = null; };
    this._ts = (e) => { e.preventDefault(); start(e.touches[0].clientX); };
    this._tm = (e) => { e.preventDefault(); move(e.touches[0].clientX); };
    this._te = (e) => { e.preventDefault(); if (!e.touches.length) end(); };
    this._pd = (e) => { if (e.pointerType === 'touch') return; start(e.clientX); };
    this._pm = (e) => { if (e.pointerType === 'touch') return; move(e.clientX); };
    this._pu = (e) => { if (e.pointerType === 'touch') return; end(); };
    this._kd = (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'a') this._keyDir = -1;
      else if (e.key === 'ArrowRight' || e.key === 'd') this._keyDir = 1;
      else if (e.key === ' ' || e.key === 'Enter') this._tap();
    };
    this._ku = (e) => {
      if ((e.key === 'ArrowLeft' || e.key === 'a') && this._keyDir === -1) this._keyDir = 0;
      if ((e.key === 'ArrowRight' || e.key === 'd') && this._keyDir === 1) this._keyDir = 0;
    };
    const c = this.canvas;
    c.addEventListener('touchstart', this._ts, { passive: false });
    c.addEventListener('touchmove', this._tm, { passive: false });
    c.addEventListener('touchend', this._te, { passive: false });
    c.addEventListener('touchcancel', this._te, { passive: false });
    c.addEventListener('pointerdown', this._pd);
    window.addEventListener('pointermove', this._pm);
    window.addEventListener('pointerup', this._pu);
    window.addEventListener('keydown', this._kd);
    window.addEventListener('keyup', this._ku);

    document.getElementById('jetski-results').classList.add('hidden');
    document.getElementById('jetski-results-again').onclick = () => {
      document.getElementById('jetski-results').classList.add('hidden');
      this.reset();
    };
    document.getElementById('jetski-results-continue').onclick = () => this._exit();

    this.reset();
    let last = performance.now(), acc = 0;
    const frame = (now) => {
      acc += Math.min(0.1, (now - last) / 1000);
      last = now;
      while (acc >= 1 / 120) { this.step(1 / 120); acc -= 1 / 120; }
      this.render();
      this._af = requestAnimationFrame(frame);
    };
    this._af = requestAnimationFrame(frame);
  }

  destroy() {
    if (this._af) cancelAnimationFrame(this._af);
    this._af = null;
    window.removeEventListener('resize', this._resize);
    if (this._ro) { this._ro.disconnect(); this._ro = null; }
    const c = this.canvas;
    c.removeEventListener('touchstart', this._ts);
    c.removeEventListener('touchmove', this._tm);
    c.removeEventListener('touchend', this._te);
    c.removeEventListener('touchcancel', this._te);
    c.removeEventListener('pointerdown', this._pd);
    window.removeEventListener('pointermove', this._pm);
    window.removeEventListener('pointerup', this._pu);
    window.removeEventListener('keydown', this._kd);
    window.removeEventListener('keyup', this._ku);
  }

  _exit() {
    document.getElementById('jetski-results').classList.add('hidden');
    this.destroy();
    this.onComplete({ score: this.best });
  }

  // ------------------------------------------------------------------
  // TRACK
  // ------------------------------------------------------------------

  reset() {
    this._buildTrack();
    this.state = 'intro'; // intro -> race -> splash -> results
    this.t = 0;
    this.introT = 0;
    this.pos = 0;              // camera z
    this.playerX = 0;          // -1..1 across the channel
    this.steerTarget = 0;
    this._keyDir = 0;
    this.speed = 0;
    this.lean = 0;
    this.wobble = 0;
    this.shake = 0;
    this.flash = 0;
    this.skyOffset = 0;
    this.camDrop = 1;          // 1 = still way up from the whale launch, eases to 0
    this.score = 0;
    this.passes = 0;
    this.place = JS.rivals.length + 1;
    this.endT = 0;
    this.particles = [];
    this.popups = [];
    // Everyone gets launched together and lands in a loose pack.
    this.racers = JS.rivals.map((kind, i) => ({
      kind,
      z: JS.playerZ + 1400 + i * 650,
      x: ((i % 4) / 3) * 1.4 - 0.7 + (Math.floor(i / 4) ? 0.25 : 0),
      tx: 0,
      speed: JS.baseSpeed * 0.8,
      skill: 0.88 + (i / JS.rivals.length) * 0.12,
      retarget: Math.random() * 2,
      bob: Math.random() * 6,
      bump: 0,
      ahead: true,
    }));
  }

  _buildTrack() {
    const segs = this.segs = [];
    let y = 0;
    const add = (n, curve, slope, bump = 0) => {
      for (let i = 0; i < n; i++) {
        const y0 = y;
        // Smooth in/out of each section so curves and grades don't snap.
        const ease = Math.sin((i / n) * Math.PI);
        y -= slope * JS.steep * JS.seg;
        if (bump) y += Math.sin((i / n) * Math.PI * 2) * bump;
        segs.push({ i: segs.length, z: segs.length * JS.seg, y0, y1: y, grade: slope, curve: curve * ease, sprites: [], clip: 0 });
      }
    };
    add(60, 0, 0.3);
    add(90, 2.5, 0.35);
    add(60, 0, 0.5, 30);
    add(110, -4, 0.4);
    add(70, 0, 0.65);
    add(90, 5, 0.3);
    add(80, -2, 0.45, 40);
    add(100, -5, 0.55);
    add(60, 0, 0.25);
    add(120, 3.5, 0.6);
    add(90, -3, 0.35, 35);
    add(110, 4.5, 0.5);
    add(70, 0, 0.7);
    add(100, -4, 0.4);
    add(80, 2, 0.3, 30);
    add(110, -2.5, 0.55);
    add(90, 0, 0.35);
    // second half: tighter, steeper
    add(100, 5.5, 0.5);
    add(70, -5.5, 0.55, 30);
    add(120, 0, 0.75);
    add(90, 4, 0.4, 45);
    add(110, -6, 0.6);
    add(60, 0, 0.3);
    add(100, 6, 0.55);
    add(80, -3, 0.7, 35);
    add(120, 2.5, 0.5);
    add(90, -4.5, 0.45);
    add(110, 0, 0.8);
    add(90, 3, 0.4, 40);
    add(100, -5, 0.5);
    add(80, 0, 0.35);
    add(100, 4, 0.6, 30);
    add(90, -3.5, 0.5);
    this.finishSeg = segs.length + 10;
    add(80, 0, 0.12);     // runout onto the harbor
    add(60, 0, 0);
    this.trackLen = segs.length * JS.seg;

    // Floating junk to steer around, plus scenery on the cloud banks.
    let k = 0;
    for (let i = 70; i < this.finishSeg - 10; i += 14 + Math.floor(rushHash(i) * 12)) {
      const kinds = ['buoy', 'buoy', 'trash', 'duck'];
      segs[i].sprites.push({ kind: kinds[k++ % kinds.length], x: (rushHash(i * 3) - 0.5) * 1.6, hit: false });
    }
    for (let i = 10; i < segs.length; i += 9) {
      segs[i].sprites.push({ kind: 'cloud', x: (rushHash(i) < 0.5 ? -1 : 1) * (1.6 + rushHash(i + 7) * 2.5), deco: true });
    }
    for (let i = 0; i < 4; i++) segs[this.finishSeg + i * 2].sprites.push({ kind: 'finish', x: 0, deco: true });
  }

  _segAt(z) {
    return this.segs[Math.max(0, Math.min(this.segs.length - 1, Math.floor(z / JS.seg)))];
  }

  _yAt(z) {
    const s = this._segAt(z);
    const p = (z % JS.seg) / JS.seg;
    return s.y0 + (s.y1 - s.y0) * p;
  }

  // ------------------------------------------------------------------
  // INPUT
  // ------------------------------------------------------------------

  _tap() {
    // Tapping skips the whale intro once you've seen the launch.
    if (this.state === 'intro' && this.introT > 0.8) this.introT = Math.max(this.introT, 2.6);
  }

  // ------------------------------------------------------------------
  // SIM
  // ------------------------------------------------------------------

  step(dt) {
    this.t += dt;
    this._updateFx(dt);
    if (this.state === 'intro') {
      this.introT += dt;
      if (this.introT > 3.2) { this.state = 'race'; this.speed = JS.baseSpeed * 0.8; this.flash = 1; }
      return;
    }
    if (this.state === 'results') return;

    const playerZ = this.pos + JS.playerZ;
    const seg = this._segAt(playerZ);
    const slope = seg.grade;

    if (this.state === 'race') {
      // speed: downhill pulls you faster
      const target = Math.min(JS.maxSpeed, JS.baseSpeed + slope * JS.slopeAccel);
      this.speed += (target - this.speed) * Math.min(1, dt * 0.9);

      // steering: ease toward where your thumb says
      if (this._keyDir) this.steerTarget = Math.max(-1.15, Math.min(1.15, this.steerTarget + this._keyDir * dt * 2.2));
      const prevX = this.playerX;
      this.playerX += (this.steerTarget - this.playerX) * Math.min(1, dt * 9);
      // curves push you to the outside; your thumb's target slides too, so
      // holding still drifts you wide and you steer against it
      const push = seg.curve * (this.speed / JS.maxSpeed) * dt * 0.09;
      this.playerX -= push;
      this.steerTarget -= push;
      this.lean += (((this.playerX - prevX) / dt) * 0.35 - this.lean) * Math.min(1, dt * 8);

      // foam walls: bounce back in, lose a little speed
      if (Math.abs(this.playerX) > 1.05) {
        this.playerX = Math.sign(this.playerX) * 1.05;
        this.steerTarget = Math.sign(this.playerX) * 0.9;
        this.speed *= 0.985;
        if (Math.random() < 0.5) this._splash(0, 0.6, '#ffffff', 2);
      }
    } else {
      // splashdown: coast to a stop
      this.speed *= Math.pow(0.35, dt);
      this.endT += dt;
      if (this.endT > 2.4) this._showResults();
    }

    this.pos = Math.min(this.pos + this.speed * dt, this.trackLen - JS.playerZ - JS.seg * 2);
    this.skyOffset += seg.curve * (this.speed / JS.maxSpeed) * dt * 0.02;
    this.camDrop = Math.max(0, this.camDrop - dt * 0.9);

    if (this.state === 'race') {
      this._collideJunk(playerZ);
      this._updateRivals(dt, playerZ);
      if (playerZ >= this.finishSeg * JS.seg) this._finish();
    }
  }

  _collideJunk(playerZ) {
    for (let n = 0; n < 2; n++) {
      const seg = this.segs[Math.floor(playerZ / JS.seg) + n];
      if (!seg) continue;
      for (const sp of seg.sprites) {
        if (sp.deco || sp.hit) continue;
        if (Math.abs(sp.x - this.playerX) < 0.2 && Math.abs(seg.z - playerZ) < JS.seg) {
          sp.hit = true;
          this.speed *= JS.hitSlow;
          this.wobble = 1;
          this.shake = 10;
          this._splash(0, 0.4, '#ffffff', 14);
        }
      }
    }
  }

  _updateRivals(dt, playerZ) {
    let ahead = 0;
    for (const r of this.racers) {
      const seg = this._segAt(r.z);
      const slope = seg.grade;
      let target = Math.min(JS.maxSpeed, JS.baseSpeed + slope * JS.slopeAccel) * r.skill;
      // Keep the race close: the pack eases off when it's way ahead of you
      // and pushes when it's fallen far behind.
      const gap = r.z - playerZ;
      if (gap > 3000) target *= 0.9;
      else if (gap < -4000) target *= 1.08;
      r.speed += (target - r.speed) * Math.min(1, dt * 0.8);
      if (r.bump > 0) { r.bump -= dt; r.speed *= Math.pow(0.6, dt); }
      r.z += r.speed * dt;

      // pick a new line now and then, and steer around junk ahead
      r.retarget -= dt;
      if (r.retarget <= 0) { r.tx = (Math.random() - 0.5) * 1.6; r.retarget = 1 + Math.random() * 2; }
      for (let n = 1; n < 12; n++) {
        const s2 = this.segs[Math.floor(r.z / JS.seg) + n];
        if (!s2) break;
        for (const sp of s2.sprites) {
          if (!sp.deco && !sp.hit && Math.abs(sp.x - r.tx) < 0.3) r.tx = sp.x + (sp.x > 0 ? -0.5 : 0.5);
        }
      }
      r.x += (r.tx - r.x) * Math.min(1, dt * 1.6);
      r.x -= seg.curve * (r.speed / JS.maxSpeed) * dt * 0.05;
      r.x = Math.max(-0.95, Math.min(0.95, r.x));

      // bumping into you shoves you both apart
      if (Math.abs(r.z - playerZ) < 280 && Math.abs(r.x - this.playerX) < 0.3) {
        const dir = Math.sign(this.playerX - r.x) || 1;
        this.playerX += dir * 0.08;
        this.steerTarget += dir * 0.08;
        r.x -= dir * 0.12;
        r.tx = r.x;
        this.speed *= 0.97;
        this.shake = Math.max(this.shake, 5);
        if (Math.random() < 0.3) this._splash(0, 0.5, '#d8f1ff', 3);
      }

      // overtakes are worth points
      const isAhead = r.z > playerZ;
      if (r.ahead && !isAhead) { this.passes++; this._addScore(JS.passBonus); }
      r.ahead = isAhead;
      if (isAhead) ahead++;
    }
    this.place = ahead + 1;
  }

  _finish() {
    this.state = 'splash';
    this.endT = 0;
    this.flash = 1;
    this.shake = 12;
    this._splash(0, 0.2, '#ffffff', 40);
    this.finalPlace = this.place;
    this._addScore(JS.finishBonus[this.place - 1] || 500);
  }

  _addScore(n) {
    this.score += n;
    this.popups.push({ text: `+${n}`, life: 1, max: 1 });
  }

  _splash(xOff, yFrac, color, n) {
    for (let i = 0; i < n; i++) {
      this.particles.push({
        x: this.W / 2 + xOff + (Math.random() - 0.5) * this.W * 0.2,
        y: this.H * (0.78 + Math.random() * 0.06),
        vx: (Math.random() - 0.5) * 380, vy: -150 - Math.random() * 420,
        life: 0.5 + Math.random() * 0.4, max: 0.9, color, r: 2 + Math.random() * 4,
      });
    }
  }

  _updateFx(dt) {
    for (const p of this.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 1100 * dt; p.life -= dt; }
    this.particles = this.particles.filter(p => p.life > 0);
    for (const p of this.popups) p.life -= dt;
    this.popups = this.popups.filter(p => p.life > 0);
    this.shake = Math.max(0, this.shake - dt * 30);
    this.flash = Math.max(0, this.flash - dt * 2.5);
    this.wobble = Math.max(0, this.wobble - dt * 1.5);
  }

  _showResults() {
    if (this.state === 'results') return;
    this.state = 'results';
    this.best = Math.max(this.best, this.score);
    const p = this.finalPlace;
    const ord = p === 1 ? 'st' : p === 2 ? 'nd' : p === 3 ? 'rd' : 'th';
    document.getElementById('jetski-results-title').textContent = `${p}${ord} PLACE`;
    document.getElementById('jetski-results-stats').innerHTML = [
      ['Score', this.score],
      ['Racers passed', this.passes],
    ].map(([k, v]) => `<p class="cannon-stat">${k}: <span>${v}</span></p>`).join('');
    document.getElementById('jetski-results').classList.remove('hidden');
  }

  // ------------------------------------------------------------------
  // RENDER
  // ------------------------------------------------------------------

  _project(p, camX, camY, camZ) {
    const W = this.W, H = this.H;
    const cz = p.z - camZ;
    p.scale = JS.depth / cz;
    p.sx = Math.round(W / 2 + p.scale * (p.x - camX) * W / 2);
    p.sy = Math.round(this.horizon - p.scale * (p.y - camY) * H / 2);
    p.sw = Math.round(p.scale * JS.road * W / 2);
    p.cz = cz;
  }

  render() {
    const ctx = this.ctx, W = this.W, H = this.H;
    if (!ctx || !W) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.state === 'intro') { this._renderIntro(); return; }

    ctx.save();
    if (this.shake > 0.3) ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    this.horizon = H * 0.18;
    this._renderSky();

    const base = Math.floor(this.pos / JS.seg);
    const playerZ = this.pos + JS.playerZ;
    // Camera rides above the water under ITSELF (it's uphill of you), so
    // the slope between it and you never rises above it.
    const camY = this._yAt(this.pos) + JS.camHeight + this.camDrop * this.camDrop * 9000;
    this._playerSY = Math.min(H * 0.84, this.horizon + (JS.depth / JS.playerZ) * (camY - this._yAt(playerZ)) * H / 2);
    const segOff = (this.pos % JS.seg) / JS.seg;
    let x = 0, dx = -(this.segs[base] ? this.segs[base].curve : 0) * segOff;
    let maxy = H;
    const camX = this.playerX * JS.road;

    for (let n = 0; n < JS.draw; n++) {
      const seg = this.segs[base + n];
      if (!seg) break;
      const p1 = { x: 0, y: seg.y0, z: seg.z }, p2 = { x: 0, y: seg.y1, z: seg.z + JS.seg };
      this._project(p1, camX - x, camY, this.pos);
      this._project(p2, camX - x - dx, camY, this.pos);
      x += dx; dx += seg.curve;
      seg.p1 = p1; seg.clip = maxy;
      if (p1.cz <= JS.depth || p2.sy >= p1.sy || p2.sy >= maxy) continue;
      this._renderSegment(seg, p1, p2, maxy);
      maxy = p1.sy;
    }

    // sprites and racers, far to near, each clipped by the water in front of it
    const rivalsBySeg = {};
    for (const r of this.racers) {
      const si = Math.floor(r.z / JS.seg);
      (rivalsBySeg[si] = rivalsBySeg[si] || []).push(r);
    }
    for (let n = JS.draw - 1; n > 0; n--) {
      const seg = this.segs[base + n];
      if (!seg || !seg.p1 || seg.p1.cz <= JS.depth) continue;
      const p = seg.p1;
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, W, seg.clip); ctx.clip();
      for (const sp of seg.sprites) {
        if (sp.hit) continue;
        this._drawSprite(sp.kind, p.sx + p.scale * sp.x * JS.road * W / 2, p.sy, p.scale * W / 2, sp);
      }
      for (const r of rivalsBySeg[base + n] || []) {
        const bob = Math.sin(this.t * 6 + r.bob) * 2;
        this._drawJetski(p.sx + p.scale * r.x * JS.road * W / 2, p.sy + bob, p.scale * W / 2 * 520, r.kind, 0);
      }
      ctx.restore();
    }

    this._renderPlayer();

    for (const q of this.particles) {
      ctx.globalAlpha = Math.max(0, q.life / q.max);
      ctx.fillStyle = q.color;
      ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    if (this.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${this.flash * 0.7})`; ctx.fillRect(0, 0, W, H); }
    this._renderHud();
  }

  _renderSky() {
    const ctx = this.ctx, W = this.W, H = this.H;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#5aa8ff'); g.addColorStop(0.45, '#bfe2ff'); g.addColorStop(1, '#fff3e0');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // sun
    ctx.fillStyle = 'rgba(255,240,180,0.9)';
    ctx.beginPath(); ctx.arc(W * 0.78, H * 0.12, Math.min(W, H) * 0.06, 0, Math.PI * 2); ctx.fill();
    // the city, tiny and far below the slope
    const off = (this.skyOffset * W) % W;
    ctx.fillStyle = 'rgba(90,110,150,0.55)';
    for (let i = -2; i < 34; i++) {
      const bw = W / 30, bh = (6 + rushHash(i + 40) * 34) * (H / 900);
      const bx = ((i * bw - off * 0.4) % (W + bw * 4) + W + bw * 4) % (W + bw * 4) - bw * 2;
      ctx.fillRect(bx, H * 0.52 - bh, bw - 1, bh);
    }
    // cloud deck
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (let i = 0; i < 10; i++) {
      const cx = ((rushHash(i) * W * 1.6 - off) % (W * 1.6) + W * 1.6) % (W * 1.6) - W * 0.3;
      ctx.beginPath(); ctx.ellipse(cx, H * (0.2 + rushHash(i + 3) * 0.12), W * 0.12, H * 0.025, 0, 0, Math.PI * 2); ctx.fill();
    }
  }

  _renderSegment(seg, p1, p2, maxy) {
    const ctx = this.ctx, W = this.W;
    const band = Math.floor(seg.i / 3) % 2;
    const quad = (x1, y1, w1, x2, y2, w2, color) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x1 - w1, y1); ctx.lineTo(x2 - w2, y2); ctx.lineTo(x2 + w2, y2); ctx.lineTo(x1 + w1, y1);
      ctx.closePath(); ctx.fill();
    };
    // cloud banks either side
    ctx.fillStyle = band ? '#f4f1ff' : '#e6e0fb';
    ctx.fillRect(0, p2.sy, W, p1.sy - p2.sy + 1);
    // foam edges
    quad(p1.sx, p1.sy, p1.sw * 1.12, p2.sx, p2.sy, p2.sw * 1.12, band ? '#ffffff' : '#d9f3ff');
    // the water
    quad(p1.sx, p1.sy, p1.sw, p2.sx, p2.sy, p2.sw, band ? '#2f9bd6' : '#2a8ec8');
    // wake lines down the channel for a sense of speed
    if (band) {
      for (const k of [-0.5, 0, 0.5]) {
        quad(p1.sx + p1.sw * k, p1.sy, p1.sw * 0.015, p2.sx + p2.sw * k, p2.sy, p2.sw * 0.015, 'rgba(255,255,255,0.35)');
      }
    }
  }

  _drawSprite(kind, x, y, k, sp) {
    const ctx = this.ctx;
    if (kind === 'cloud') {
      const r = 700 * k;
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.beginPath();
      ctx.arc(x, y - r * 0.4, r * 0.6, 0, Math.PI * 2);
      ctx.arc(x - r * 0.55, y - r * 0.2, r * 0.42, 0, Math.PI * 2);
      ctx.arc(x + r * 0.55, y - r * 0.25, r * 0.48, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    if (kind === 'finish') {
      const w = JS.road * 1.1 * k, h = 900 * k;
      ctx.fillStyle = '#c8402c';
      ctx.fillRect(x - w, y - h, 40 * k, h); ctx.fillRect(x + w - 40 * k, y - h, 40 * k, h);
      ctx.fillStyle = '#fff'; ctx.fillRect(x - w, y - h, w * 2, 160 * k);
      ctx.fillStyle = '#111';
      for (let i = 0; i < 16; i++) if (i % 2) ctx.fillRect(x - w + (i / 16) * w * 2, y - h, w / 8, 80 * k);
      for (let i = 0; i < 16; i++) if (!(i % 2)) ctx.fillRect(x - w + (i / 16) * w * 2, y - h + 80 * k, w / 8, 80 * k);
      return;
    }
    const s = 260 * k;
    if (kind === 'buoy') {
      ctx.fillStyle = '#ff6a1a';
      ctx.beginPath(); ctx.moveTo(x - s * 0.5, y); ctx.lineTo(x - s * 0.25, y - s * 1.2); ctx.lineTo(x + s * 0.25, y - s * 1.2); ctx.lineTo(x + s * 0.5, y); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillRect(x - s * 0.36, y - s * 0.75, s * 0.72, s * 0.2);
    } else if (kind === 'trash') {
      ctx.fillStyle = '#2b2b2b';
      ctx.beginPath(); ctx.ellipse(x, y - s * 0.35, s * 0.6, s * 0.45, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#555'; ctx.fillRect(x - s * 0.1, y - s * 0.95, s * 0.2, s * 0.25);
    } else if (kind === 'duck') {
      ctx.fillStyle = '#ffd84a';
      ctx.beginPath(); ctx.ellipse(x, y - s * 0.3, s * 0.6, s * 0.35, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + s * 0.3, y - s * 0.8, s * 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ff8a1a'; ctx.fillRect(x + s * 0.55, y - s * 0.82, s * 0.25, s * 0.1);
    }
    // a little wake ring around anything floating
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = Math.max(1, s * 0.06);
    ctx.beginPath(); ctx.ellipse(x, y, s * 0.75, s * 0.15, 0, 0, Math.PI * 2); ctx.stroke();
  }

  // A jet ski seen from behind: hull, rider, rooster tail. kind paints it.
  _drawJetski(x, y, w, kind, lean) {
    const ctx = this.ctx, t = this.t;
    if (w < 2) return;
    const h = w * 0.55;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(lean);
    // spray
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    for (let i = 0; i < 4; i++) {
      const a = (t * 7 + i * 1.7) % 1;
      ctx.beginPath(); ctx.arc((i % 2 ? -1 : 1) * w * (0.15 + a * 0.3), -h * 0.1 - a * h * 0.5, w * 0.08 * (1 - a * 0.5), 0, Math.PI * 2); ctx.fill();
    }
    const hull = kind === 'cop' ? '#1e3f8a' : kind === 'pirate' ? '#1a1a1a' : '#e8402c';
    const trim = kind === 'cop' ? '#ffffff' : kind === 'pirate' ? '#b0893a' : '#ffffff';
    ctx.fillStyle = hull;
    ctx.beginPath(); ctx.moveTo(-w * 0.5, -h * 0.15); ctx.lineTo(w * 0.5, -h * 0.15); ctx.lineTo(w * 0.38, h * 0.12); ctx.lineTo(-w * 0.38, h * 0.12); ctx.fill();
    ctx.fillStyle = trim; ctx.fillRect(-w * 0.5, -h * 0.22, w, h * 0.09);
    // rider
    const skin = '#e8b98a';
    const shirt = kind === 'cop' ? '#23407d' : kind === 'pirate' ? '#7a1e1e' : '#27b7c9';
    ctx.fillStyle = shirt; ctx.fillRect(-w * 0.17, -h * 0.85, w * 0.34, h * 0.65);
    ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(0, -h * 0.98, w * 0.13, 0, Math.PI * 2); ctx.fill();
    if (kind === 'cop') {
      ctx.fillStyle = '#16244a'; ctx.fillRect(-w * 0.15, -h * 1.12, w * 0.3, h * 0.1);
      const on = Math.floor(t * 8) % 2;
      ctx.fillStyle = on ? '#ff2b2b' : '#2b6bff'; ctx.fillRect(-w * 0.28, -h * 0.3, w * 0.12, h * 0.1);
      ctx.fillStyle = on ? '#2b6bff' : '#ff2b2b'; ctx.fillRect(w * 0.16, -h * 0.3, w * 0.12, h * 0.1);
    } else if (kind === 'pirate') {
      ctx.fillStyle = '#111';
      ctx.beginPath(); ctx.moveTo(-w * 0.24, -h * 1.06); ctx.lineTo(w * 0.24, -h * 1.06); ctx.lineTo(0, -h * 1.3); ctx.fill();
      ctx.fillStyle = '#5a4630'; ctx.fillRect(w * 0.32, -h * 1.5, w * 0.03, h * 1.35);
      ctx.fillStyle = '#111'; ctx.fillRect(w * 0.35, -h * 1.5, w * 0.22, h * 0.28);
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(w * 0.46, -h * 1.37, w * 0.04, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = '#3a2a1e'; ctx.beginPath(); ctx.arc(0, -h * 1.02, w * 0.13, Math.PI, 0); ctx.fill();
    }
    ctx.restore();
  }

  _renderPlayer() {
    const W = this.W, H = this.H;
    // same size a rival would be drawn at this distance
    const w = Math.min((JS.depth / JS.playerZ) * (W / 2) * 520, H * 0.26);
    const bob = Math.sin(this.t * 9) * 2 + (this.state === 'race' ? Math.sin(this.t * 31) * this.wobble * 6 : 0);
    const lean = Math.max(-0.35, Math.min(0.35, this.lean)) + Math.sin(this.t * 25) * this.wobble * 0.15;
    // rooster tail behind the player, bigger the faster you go
    const ctx = this.ctx;
    const sp = this.speed / JS.maxSpeed;
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for (let i = 0; i < 6; i++) {
      const a = (this.t * 4 + i / 6) % 1;
      ctx.beginPath(); ctx.arc(W / 2 + Math.sin(i * 2.3) * w * 0.2, this._playerSY + a * H * 0.12, w * (0.06 + a * 0.12) * (0.5 + sp), 0, Math.PI * 2); ctx.fill();
    }
    this._drawJetski(W / 2, this._playerSY + bob, w, 'player', lean);
  }

  _renderHud() {
    const ctx = this.ctx, W = this.W, H = this.H;
    const u = Math.max(0.85, Math.min(1.4, W / 480));
    if (this.state === 'race' || this.state === 'splash') {
      const p = this.state === 'splash' ? this.finalPlace : this.place;
      const ord = p === 1 ? 'ST' : p === 2 ? 'ND' : p === 3 ? 'RD' : 'TH';
      ctx.textAlign = 'left';
      ctx.font = `bold ${Math.round(56 * u)}px VT323, monospace`;
      ctx.lineWidth = 6; ctx.strokeStyle = '#000'; ctx.lineJoin = 'round';
      ctx.strokeText(`${p}${ord}`, 16, 58 * u);
      ctx.fillStyle = p === 1 ? '#ffd84a' : '#fff';
      ctx.fillText(`${p}${ord}`, 16, 58 * u);
      ctx.font = `bold ${Math.round(24 * u)}px VT323, monospace`;
      ctx.strokeText(`/ ${this.racers.length + 1}`, 16 + 80 * u, 58 * u);
      ctx.fillStyle = '#fff'; ctx.fillText(`/ ${this.racers.length + 1}`, 16 + 80 * u, 58 * u);
      // score
      ctx.textAlign = 'right';
      ctx.font = `bold ${Math.round(30 * u)}px VT323, monospace`;
      ctx.strokeText(String(this.score), W - 16, 48 * u);
      ctx.fillStyle = '#fff'; ctx.fillText(String(this.score), W - 16, 48 * u);
      // progress down the run
      const prog = Math.min(1, (this.pos + JS.playerZ) / (this.finishSeg * JS.seg));
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(16, 74 * u, W - 32, 7);
      ctx.fillStyle = '#ffd84a'; ctx.fillRect(16, 74 * u, (W - 32) * prog, 7);
      // pass popups
      this.popups.forEach((q, i) => {
        ctx.globalAlpha = Math.min(1, q.life * 2);
        ctx.textAlign = 'right';
        ctx.font = `bold ${Math.round(22 * u)}px VT323, monospace`;
        ctx.fillStyle = '#ffd84a';
        ctx.fillText(q.text, W - 16, 48 * u + 26 * u * (i + 1) - (1 - q.life) * 20);
      });
      ctx.globalAlpha = 1;
      if (this.t < 6 && this.state === 'race') {
        ctx.textAlign = 'center';
        ctx.font = `${Math.round(24 * u)}px VT323, monospace`;
        ctx.globalAlpha = Math.min(1, 6 - this.t);
        ctx.strokeText('Drag to steer', W / 2, H * 0.62);
        ctx.fillStyle = '#fff'; ctx.fillText('Drag to steer', W / 2, H * 0.62);
        ctx.globalAlpha = 1;
      }
    }
  }

  // Behind you, flat harbor: a whale surfaces under the jet ski and its
  // blowhole fires you straight up out of frame. White out, then you drop
  // in from the sky onto the top of the run.
  _renderIntro() {
    const ctx = this.ctx, W = this.W, H = this.H, t = this.introT;
    const hz = H * 0.48;
    const g = ctx.createLinearGradient(0, 0, 0, hz);
    g.addColorStop(0, '#2a2457'); g.addColorStop(1, '#f08a5d');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, hz);
    ctx.fillStyle = '#23305e'; ctx.fillRect(0, hz, W, H - hz);
    ctx.fillStyle = 'rgba(255,170,110,0.35)';
    for (let i = 0; i < 30; i++) ctx.fillRect((rushHash(i) * W + t * 60 * (i % 3 + 1)) % W, hz + rushHash(i + 9) * (H - hz), 26, 2);
    // the statue, receding behind you
    rushDrawStatue(ctx, W * 0.82, hz + 4, Math.min(W, H) / 2600, this.t, W * 0.5, H * 0.8);

    const rise = Math.min(1, Math.max(0, (t - 0.5) / 0.8));       // whale surfaces
    const launch = Math.max(0, t - 1.4);                          // spout fires
    // whale back, right under you
    const wy = H * 0.98 - rise * H * 0.18;
    ctx.fillStyle = '#3d4f6b';
    ctx.beginPath(); ctx.ellipse(W / 2, wy, W * 0.42, H * 0.12, 0, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#56709a';
    ctx.beginPath(); ctx.ellipse(W / 2, wy - H * 0.03, W * 0.3, H * 0.05, 0, Math.PI, 0); ctx.fill();
    // blowhole spout
    if (launch > 0) {
      const sh = Math.min(H * 1.1, launch * H * 1.6);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.moveTo(W / 2 - W * 0.05, wy - H * 0.1);
      ctx.quadraticCurveTo(W / 2 - W * 0.15, wy - sh * 0.6, W / 2 - W * 0.02, wy - sh);
      ctx.lineTo(W / 2 + W * 0.02, wy - sh);
      ctx.quadraticCurveTo(W / 2 + W * 0.15, wy - sh * 0.6, W / 2 + W * 0.05, wy - H * 0.1);
      ctx.fill();
      for (let i = 0; i < 14; i++) {
        const a = (launch * 2 + i / 14) % 1;
        ctx.beginPath(); ctx.arc(W / 2 + Math.sin(i * 7) * W * 0.18 * a, wy - sh * (0.3 + a * 0.6), W * 0.03, 0, Math.PI * 2); ctx.fill();
      }
    }
    // you, riding it -- then gone straight up
    const py = wy - H * 0.13 - Math.pow(launch, 2) * H * 2.2;
    this._drawJetski(W / 2, py, Math.min(W * 0.34, H * 0.2), 'player', Math.sin(launch * 12) * 0.3);
    // white out
    if (t > 2.2) {
      ctx.fillStyle = `rgba(255,255,255,${Math.min(1, (t - 2.2) / 0.8)})`;
      ctx.fillRect(0, 0, W, H);
    }
  }
}

let jetskiGame = null;
