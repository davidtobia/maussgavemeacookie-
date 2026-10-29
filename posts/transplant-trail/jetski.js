/**
 * THE TRANSPLANT TRAIL - JET SKI
 * ==============================
 * Chosen at Liberty Island ("Steal a jet ski", liberty.js). A whale's
 * blowhole fires you into the sky and you drop onto a mountain made of
 * water: a curved halfpipe channel you carve down, SSX-style. Camera
 * behind you.
 *
 * It's a carving game, not a racing-around-junk game:
 *  - Drag to steer (joystick-style: how far your thumb is from where it
 *    went down = how hard you carve). The channel is a trough -- carve
 *    up a wall and drop back down and you GAIN speed. Turns are banked;
 *    curves push you up the outside wall.
 *  - Speed comes from the terrain: steep pitches pull you faster, flatter
 *    runouts slow you, rollers can be pumped.
 *  - Jumps: kicker ramps, drop-offs, and crests you hit fast enough throw
 *    you in the air. In the air a trick wheel pops up -- easy tricks just
 *    happen, harder ones run a quick skill game first. Land it for score
 *    and meter; still mid-trick when you hit the water = bail.
 *  - Rivals (cops, pirates): get near one and a red circle appears on
 *    them; tap it for a skill game, land it to knock them back.
 *  - Hits and landed tricks fill BOOST (tap for a burst) and SPECIAL
 *    (breakdance on the handlebars -> the jet ski becomes a helicopter,
 *    3x speed for 5 seconds).
 *
 * You can't get caught or fail -- place and tricks only change your score.
 *
 * Rendering: pseudo-3D. The track is short segments, each with a grade,
 * a curve and a height; every segment is drawn as a strip of quads across
 * the trough's curved cross-section, far to near (painter's order), so
 * walls, banks and crests occlude correctly.
 */

const JS = {
  seg: 200,           // segment length, world units
  road: 2000,         // half-width of the trough (x = -1..1 is water)
  camHeight: 1050,
  fov: 100,
  draw: 150,          // segments drawn ahead
  steep: 1.3,         // how hard the mountain visibly drops away
  wallH: 700,         // height of the trough walls at the rim
  bank: 0.7,          // how much curves tilt the trough (outside of a turn rides higher)
  // speed
  slopeAccel: 16000,  // downhill pull per unit of grade
  drag: 5.7e-5,       // with slopeAccel, sets the top speed for each grade
  minSpeed: 5000,
  baseSpeed: 11000,   // reference speed (helicopter = 3x this)
  pump: 4.2,          // speed gained per unit dropped off a wall
  pumpLoss: 2.2,      // speed lost per unit climbed -- carving nets speed
  // air
  gravity: 16000,
  stick: 1.7,         // how sharply the water has to fall away (x gravity) to launch you
  // steering
  steerAccel: 6,
  latDamp: 2.2,
  wallPush: 2.3,
  centrifugal: 2.6,
  rivals: ['cop', 'pirate', 'cop', 'pirate', 'cop'],
  finishBonus: [6000, 4000, 3000, 2000, 1500, 1000],
  passBonus: 100,
  // attacks
  promptRange: 2600,
  promptCooldown: 4,
  skillSlowmo: 0.3,
  hitScore: 300,
  hitBoost: 0.34,
  hitSpecial: 0.26,
  // tricks
  trickTime: 0.65,     // how long a trick's animation takes in the air
  trickMinHeight: 90,  // how high above the water before the wheel shows
  trickBoost: 0.25,
  trickSpecial: 0.2,
  // boost
  boostCost: 0.25,
  boostTime: 1.6,
  boostAccel: 14000,
  // special: breakdance -> helicopter
  danceTime: 0.9,
  flyTime: 5,
  flySpeed: 3,
};
JS.depth = 1 / Math.tan((JS.fov / 2) * Math.PI / 180);
JS.playerZ = JS.camHeight * JS.depth; // how far ahead of the camera you sit

// The trick wheel. skill: null = it just happens; otherwise the name of a
// JETSKI_SKILLS game you have to land first. Rename/add freely.
const JETSKI_TRICKS = [
  { name: '360',       skill: null,     score: 300,  anim: 'spin' },
  { name: 'BACKFLIP',  skill: null,     score: 450,  anim: 'flip' },
  { name: 'SUPERMAN',  skill: 'ring',   score: 900,  anim: 'superman' },
  { name: 'HANDSTAND', skill: 'needle', score: 1000, anim: 'handstand' },
];

// Lateral sample points across the trough cross-section, -1..1 is water.
const JS_XS = [-1.75, -1.12, -1.0, -0.8, -0.6, -0.35, 0, 0.35, 0.6, 0.8, 1.0, 1.12, 1.75];

// Height of the water surface across the trough at lateral x, for a
// segment curving by cn (-1..1): flat floor, walls curving up to the rim,
// the whole thing tilted on turns.
function jsWall(x, cn) {
  const ax = Math.abs(x);
  let h;
  if (ax <= 0.35) h = 0;
  else if (ax <= 1) h = Math.pow((ax - 0.35) / 0.65, 2) * JS.wallH;
  else if (ax <= 1.12) h = JS.wallH + (ax - 1) * 600;
  else h = JS.wallH + 72 + (ax - 1.12) * JS.wallH * 1.6;
  return h - cn * x * JS.wallH * JS.bank * 0.5;
}

function jsMix(a, b, t) {
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`;
}

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

    // Drag to steer, joystick-style: how far your thumb is from where it
    // went down sets how hard you carve (see _steerInput). Every touch is
    // tracked by id, so one thumb can steer while the other taps a red
    // circle or the boost button. A touch that lands on a circle/button
    // is a tap, not a steer. Touch goes through touch events (reliable
    // preventDefault on iOS), mouse/pen through pointer events.
    this._dragId = null;
    this._drag = null;
    const local = (cx, cy) => {
      const r = this.canvas.getBoundingClientRect();
      return [cx - r.left, cy - r.top];
    };
    const press = (x, y, id) => {
      if (this.state === 'intro') { this._tap(); return; }
      if (this.skill) { this.skill.down(); this._skillId = id; return; }
      const ui = this.state === 'race' ? this._hitUI(x, y) : null;
      if (ui) { this._useUI(ui); return; }
      if (this._dragId === null) { this._dragId = id; this._drag = { x0: x, cur: x }; }
    };
    const move = (x, id) => {
      if (id !== this._dragId || !this._drag) return;
      this._drag.cur = x;
    };
    const release = (id) => {
      if (this.skill && id === this._skillId) { this.skill.up(); this._skillId = null; }
      if (id === this._dragId) { this._dragId = null; this._drag = null; }
    };
    this._ts = (e) => { e.preventDefault(); for (const t of e.changedTouches) press(...local(t.clientX, t.clientY), t.identifier); };
    this._tm = (e) => { e.preventDefault(); for (const t of e.changedTouches) move(local(t.clientX, t.clientY)[0], t.identifier); };
    this._te = (e) => { e.preventDefault(); for (const t of e.changedTouches) release(t.identifier); };
    this._pd = (e) => { if (e.pointerType === 'touch') return; press(...local(e.clientX, e.clientY), 'm'); };
    this._pm = (e) => { if (e.pointerType === 'touch') return; move(local(e.clientX, e.clientY)[0], 'm'); };
    this._pu = (e) => { if (e.pointerType === 'touch') return; release('m'); };
    this._kd = (e) => {
      if (e.repeat) return;
      if (e.key === 'ArrowLeft' || e.key === 'a') this._keyDir = -1;
      else if (e.key === 'ArrowRight' || e.key === 'd') this._keyDir = 1;
      else if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (this.state === 'intro') this._tap();
        else if (this.skill) { this.skill.down(); this._skillId = 'k'; }
        else if (this.prompt) this._useUI('prompt');
      }
      else if (e.key === 'b' || e.key === 'Shift') this._useUI('boost');
      else if (e.key === 'e') this._useUI('special');
    };
    this._ku = (e) => {
      if ((e.key === 'ArrowLeft' || e.key === 'a') && this._keyDir === -1) this._keyDir = 0;
      if ((e.key === 'ArrowRight' || e.key === 'd') && this._keyDir === 1) this._keyDir = 0;
      if ((e.key === ' ' || e.key === 'Enter') && this.skill && this._skillId === 'k') { this.skill.up(); this._skillId = null; }
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
    this.playerX = 0;          // -1..1 across the trough
    this.vx = 0;               // lateral velocity
    this._steer = 0;
    this._keyDir = 0;
    this.speed = 0;
    this.riderY = 0;
    this.vy = 0;
    this.grounded = true;
    this.airT = 0;
    this.lean = 0;
    this.wobble = 0;
    this.shake = 0;
    this.flash = 0;
    this.skyOffset = 0;
    this.camDrop = 1;
    this.camLift = 0;
    this.score = 0;
    this.passes = 0;
    this.place = JS.rivals.length + 1;
    this.endT = 0;
    this.particles = [];
    this.popups = [];
    this.boost = 0;
    this.special = 0;
    this.boostT = 0;
    this.skill = null;
    this.prompt = null;
    this.heli = null;
    this.trick = null;         // { def, phase: 'skill'|'anim'|'bail', t, perfect }
    this.wheel = false;
    this.hits = 0;
    this.tricksLanded = 0;
    this._ui = {};
    this.racers = JS.rivals.map((kind, i) => ({
      kind,
      z: JS.playerZ + 1600 + i * 750,
      x: [-0.5, 0.4, -0.1, 0.6, -0.6][i % 5],
      vx: 0,
      speed: JS.baseSpeed * 0.8,
      skill: 0.9 + (i / JS.rivals.length) * 0.1,
      tx: 0,
      retarget: Math.random() * 2,
      bob: Math.random() * 6,
      bump: 0, cool: 0, knock: 0,
      ahead: true,
    }));
    this.riderY = this._surf(JS.playerZ, 0);
  }

  // The mountain, section by section: (length in segments, curve, grade,
  // roller size), plus kicker ramps and drop-offs between sections. Grade
  // and curve ease from one section into the next so the run flows.
  _buildTrack() {
    const segs = this.segs = [];
    let y = 0, g = 0.35, c = 0, rollAmp = 0, lastRoll = 0;
    const push = (grade, curve, dy, extra) => {
      const y0 = y;
      y += dy;
      segs.push(Object.assign({ i: segs.length, z: segs.length * JS.seg, y0, y1: y, grade, curve }, extra || {}));
    };
    const run = (n, curve, grade, roll = 0) => {
      for (let i = 0; i < n; i++) {
        g += (grade - g) * 0.04;
        c += (curve - c) * 0.035;
        rollAmp += (roll - rollAmp) * 0.05;
        const r = Math.sin((segs.length / 20) * Math.PI * 2) * rollAmp;
        push(g, c, -g * JS.steep * JS.seg + (r - lastRoll));
        lastRoll = r;
      }
    };
    const kicker = (rise = 760, n = 12) => {
      for (let i = 0; i < n; i++) push(-(rise / n) / JS.seg / JS.steep, c, rise / n, { kick: i / n });
    };
    const drop = (n = 16, grade = 2.2) => {
      for (let i = 0; i < n; i++) push(grade, c, -grade * JS.steep * JS.seg, { drop: true });
      g = grade; // eases back out over the next section
    };

    run(50, 0, 0.35);
    run(150, 3, 0.55);
    kicker();
    run(170, -4, 0.5, 36);
    run(120, 0, 0.9);
    run(200, 5, 0.45);
    kicker();
    run(150, -3, 0.6);
    drop();
    run(200, -5.5, 0.5, 33);
    run(150, 4, 0.7);
    kicker(900, 14);
    run(130, 4.5, 0.55);
    run(130, -4.5, 0.55);
    run(130, 4, 0.6);
    drop(18, 2.4);
    run(180, 3, 0.75, 36);
    kicker();
    run(200, -4.5, 0.6);
    run(150, 5, 0.45, 30);
    run(120, 0, 0.8);
    kicker(1000, 14);
    run(80, -2, 0.6);
    // the last third: long sweeping turns, two more kickers, one big drop
    run(180, 5.5, 0.55, 33);
    run(160, -5, 0.6);
    kicker(820, 12);
    run(170, 4, 0.5);
    run(140, -3.5, 0.7, 36);
    drop(18, 2.3);
    run(200, 5, 0.55);
    run(160, -5.5, 0.5, 30);
    kicker(1050, 15);
    run(90, 0, 0.6);
    this.finishSeg = segs.length + 10;
    run(90, 0, 0.12);      // runout onto the harbor
    run(70, 0, 0);
    this.trackLen = segs.length * JS.seg;
  }

  _segAt(z) {
    return this.segs[Math.max(0, Math.min(this.segs.length - 1, Math.floor(z / JS.seg)))];
  }

  _yAt(z) {
    const s = this._segAt(z);
    const p = Math.max(0, Math.min(1, (z - s.z) / JS.seg));
    return s.y0 + (s.y1 - s.y0) * p;
  }

  // Water surface height at (z, lateral x).
  _surf(z, x) {
    return this._yAt(z) + jsWall(x, this._segAt(z).curve / 6);
  }

  // Joystick-style steering from a drag, or the arrow keys.
  _steerInput() {
    if (this._keyDir) return this._keyDir;
    if (this._drag && this._drag.cur != null) {
      return Math.max(-1, Math.min(1, (this._drag.cur - this._drag.x0) / (this.W * 0.22)));
    }
    return 0;
  }

  // ------------------------------------------------------------------
  // SIM
  // ------------------------------------------------------------------

  step(dt) {
    if (this.skill) {
      this.skill.update(dt);
      if (this.skill.done) this._resolveSkill();
      else dt *= JS.skillSlowmo;
    }
    this.t += dt;
    this._updateFx(dt);
    if (this.state === 'intro') {
      this.introT += dt;
      if (this.introT > 3.2) { this.state = 'race'; this.speed = JS.baseSpeed * 0.85; this.flash = 1; }
      return;
    }
    if (this.state === 'results') return;

    const playerZ = this.pos + JS.playerZ;
    const seg = this._segAt(playerZ);
    const cn = seg.curve / 6;

    if (this.state === 'race') {
      this.boostT = Math.max(0, this.boostT - dt);

      // --- forward speed: the mountain does the work ---
      let acc = this.grounded ? JS.slopeAccel * seg.grade : 0;
      acc -= JS.drag * this.speed * this.speed * (this.grounded ? 1 : 0.5);
      if (this.boostT > 0) acc += JS.boostAccel;
      this.speed = Math.max(JS.minSpeed, this.speed + acc * dt);
      if (this.heli) {
        this.heli.t += dt;
        if (this.heli.phase === 'dance') {
          if (this.heli.t > JS.danceTime) { this.heli = { phase: 'fly', t: 0 }; this.flash = 0.8; this.shake = 10; }
        } else if (this.heli.phase === 'fly') {
          this.speed += (JS.baseSpeed * JS.flySpeed - this.speed) * Math.min(1, dt * 3);
          if (this.heli.t > JS.flyTime) this.heli = { phase: 'land', t: 0 };
        } else if (this.heli.t > 0.6) {
          this.heli = null;
          this._splash(0, 0.5, '#ffffff', 20);
          this.shake = 8;
        }
      }

      // --- carving: steer, walls push back, turns push you wide ---
      const steer = this._steerInput();
      const hOld = jsWall(this.playerX, cn);
      let ax = steer * JS.steerAccel * (this.grounded ? 1 : 0.5);
      if (this.grounded) {
        const dh = (jsWall(this.playerX + 0.01, cn) - jsWall(this.playerX - 0.01, cn)) / 0.02;
        ax -= (dh / JS.wallH) * JS.wallPush;
      }
      ax -= cn * Math.pow(this.speed / 13000, 2) * JS.centrifugal;
      this.vx += ax * dt;
      this.vx *= Math.exp(-JS.latDamp * dt);
      this.playerX += this.vx * dt;
      if (Math.abs(this.playerX) > 1.1) {
        this.playerX = Math.sign(this.playerX) * 1.1;
        this.vx *= -0.3;
        if (Math.random() < 0.4) this._splash(0, 0.6, '#ffffff', 2);
      }
      this.lean += (this.vx * 0.22 - this.lean) * Math.min(1, dt * 8);
      // Dropping off a wall gains speed, climbing one costs a bit less --
      // so carving side to side down the trough is how you go fast.
      if (this.grounded) {
        const dh = jsWall(this.playerX, cn) - hOld;
        this.speed += -dh * (dh < 0 ? JS.pump : JS.pumpLoss);
      }
    } else {
      this.speed *= Math.pow(0.35, dt);
      this.endT += dt;
      if (this.endT > 2.4) this._showResults();
    }

    this.pos = Math.min(this.pos + this.speed * dt, this.trackLen - JS.playerZ - JS.seg * 2);
    this.skyOffset += seg.curve * (this.speed / 13000) * dt * 0.02;
    this.camDrop = Math.max(0, this.camDrop - dt * 0.9);

    // --- vertical: ride the water, or fly off it ---
    const pz2 = this.pos + JS.playerZ;
    const surf = this._surf(pz2, this.playerX);
    if (this.heli && this.heli.phase !== 'dance') {
      this.riderY = surf; this.vy = 0; this.grounded = true;
    } else if (this.grounded) {
      // Look a moment ahead along the water. If it falls away faster than
      // you could fall in that time, you leave it -- off a ramp lip, a
      // drop, or a crest taken fast. (Judged over a short window, not one
      // step, so the joins between segments don't count as bumps.)
      // Forward slope only -- carving up and down the walls never launches you.
      const look = 0.06;
      const vNow = (surf - this.riderY) / dt;
      const vHere = (surf - this._surf(pz2 - this.speed * look, this.playerX)) / look;
      const vAhead = (this._surf(pz2 + this.speed * look, this.playerX) - surf) / look;
      if (this.state === 'race' && vAhead < vHere - JS.gravity * look * JS.stick) {
        this.grounded = false;
        this.airT = 0;
        this.vy = vNow;
        this.riderY = surf;
      } else {
        this.vy = vNow;
        this.riderY = surf;
      }
    } else {
      this.airT += dt;
      this.vy -= JS.gravity * dt;
      this.riderY += this.vy * dt;
      if (this.riderY <= surf) { this.riderY = surf; this._land(); }
    }
    if (this.trick && this.trick.phase !== 'skill') this.trick.t += dt;
    this.wheel = this.state === 'race' && !this.grounded && !this.trick && !this.heli && !this.skill &&
      this.riderY - surf > JS.trickMinHeight;

    if (this.state === 'race') {
      this._updateRivals(dt, pz2);
      if (!this.skill) this._pickPrompt(pz2);
      if (pz2 >= this.finishSeg * JS.seg) this._finish();
    }
  }

  _land() {
    const hard = this.vy < -9000;
    const wasAir = this.airT;
    this.grounded = true;
    this.vy = 0;
    if (this.trick) {
      const tr = this.trick;
      this.trick = null;
      if (tr.phase === 'anim' && tr.t >= JS.trickTime) {
        this.tricksLanded++;
        const pts = Math.round(tr.def.score * (tr.perfect ? 1.5 : 1));
        this._addScore(pts, tr.def.name);
        this.boost = Math.min(1, this.boost + JS.trickBoost);
        this.special = Math.min(1, this.special + JS.trickSpecial);
        this.flash = 0.35;
        this.shake = 8;
        this._splash(0, 0.5, '#ffd84a', 16);
        return;
      }
      this.speed *= 0.6;
      this.wobble = 1;
      this.shake = 14;
      this.popups.push({ text: 'BAIL', life: 1, max: 1, bad: true });
      this._splash(0, 0.4, '#ffffff', 24);
      return;
    }
    if (wasAir > 0.25) {
      this.shake = Math.max(this.shake, hard ? 9 : 4);
      this._splash(0, 0.5, '#ffffff', hard ? 18 : 8);
    }
  }

  _startTrick(i) {
    const def = JETSKI_TRICKS[i];
    if (!def || this.trick || !this.wheel) return;
    if (def.skill && JETSKI_SKILLS[def.skill]) {
      this.trick = { def, phase: 'skill', t: 0 };
      this.skill = JETSKI_SKILLS[def.skill]({ trick: def });
    } else {
      this.trick = { def, phase: 'anim', t: 0 };
    }
    this.wheel = false;
  }

  _updateRivals(dt, playerZ) {
    let ahead = 0;
    for (const r of this.racers) {
      const seg = this._segAt(r.z);
      // rivals ride the mountain at its natural speed for that pitch
      const terminal = Math.sqrt(Math.max(0.05, seg.grade) * JS.slopeAccel / JS.drag);
      let target = Math.max(JS.minSpeed, terminal) * r.skill;
      const gap = r.z - playerZ;
      if (gap > 3000) target *= 0.9;
      else if (gap < -4000) target *= 1.08;
      if (r.cool > 0) r.cool -= dt;
      if (r.knock > 0) { r.knock -= dt; target *= 0.6; }
      if (r.bump > 0) { r.bump -= dt; target *= 0.9; }
      r.speed += (target - r.speed) * Math.min(1, dt * 0.8);
      r.z += r.speed * dt;

      // carve lazily across the trough
      r.retarget -= dt;
      if (r.retarget <= 0) { r.tx = (Math.random() - 0.5) * 1.5; r.retarget = 1.2 + Math.random() * 2; }
      r.x += (r.tx - r.x) * Math.min(1, dt * 1.2);
      r.x = Math.max(-0.95, Math.min(0.95, r.x));

      if (!this.heli && this.grounded && Math.abs(r.z - playerZ) < 280 && Math.abs(r.x - this.playerX) < 0.25) {
        const dir = Math.sign(this.playerX - r.x) || 1;
        this.vx += dir * 1.2;
        r.x -= dir * 0.1;
        r.tx = r.x;
        r.bump = 0.4;
        this.speed *= 0.98;
        this.shake = Math.max(this.shake, 5);
      }

      const isAhead = r.z > playerZ;
      if (r.ahead && !isAhead) { this.passes++; this._addScore(JS.passBonus); }
      r.ahead = isAhead;
      if (isAhead) ahead++;
    }
    this.place = ahead + 1;
  }

  _hitUI(x, y) {
    const near = (o, pad) => o && Math.hypot(x - o.x, y - o.y) < o.r * pad;
    if (this.wheel && this._ui.tricks) {
      for (const b of this._ui.tricks) if (near(b, 1.15)) return 'trick' + b.i;
    }
    if (this.special >= 1 && !this.heli && near(this._ui.special, 1.2)) return 'special';
    if (this.boost >= JS.boostCost && near(this._ui.boost, 1.2)) return 'boost';
    if (this.prompt && this.prompt.sx != null && near({ x: this.prompt.sx, y: this.prompt.sy, r: this.prompt.r }, 1.5)) return 'prompt';
    return null;
  }

  _useUI(kind) {
    if (this.state !== 'race') return;
    if (kind.startsWith('trick')) { this._startTrick(+kind.slice(5)); return; }
    if (kind === 'prompt' && this.prompt && !this.skill) {
      this.skill = jetskiSkillGame(this.prompt.racer);
      this.prompt.racer.cool = JS.promptCooldown;
      this.prompt = null;
    } else if (kind === 'boost' && this.boost >= JS.boostCost && !this.heli) {
      this.boost -= JS.boostCost;
      this.boostT = JS.boostTime;
      this.shake = Math.max(this.shake, 6);
      this._splash(0, 0.5, '#bff3ff', 12);
    } else if (kind === 'special' && this.special >= 1 && !this.heli) {
      this.special = 0;
      this.heli = { phase: 'dance', t: 0 };
      this.trick = null;
    }
  }

  _resolveSkill() {
    const sk = this.skill, r = sk.target;
    this.skill = null;
    if (r && r.trick) {
      // a trick's skill game: land it and the trick plays out
      if (!this.trick) return;
      if (sk.success) { this.trick.phase = 'anim'; this.trick.t = 0; this.trick.perfect = sk.perfect; }
      else this.trick.phase = 'bail';
      return;
    }
    if (sk.success) {
      this.hits++;
      r.knock = 1.2;
      r.speed *= 0.45;
      r.x += (r.x >= this.playerX ? 1 : -1) * 0.35;
      r.tx = r.x;
      this.boost = Math.min(1, this.boost + JS.hitBoost);
      this.special = Math.min(1, this.special + JS.hitSpecial);
      this._addScore(sk.perfect ? JS.hitScore * 2 : JS.hitScore, sk.perfect ? 'PERFECT' : 'POW');
      this.shake = 14;
      this.flash = 0.4;
    } else {
      this.wobble = 0.6;
      this.speed *= 0.9;
      this.popups.push({ text: 'MISS', life: 0.8, max: 0.8, bad: true });
    }
  }

  // ------------------------------------------------------------------
  // RENDER
  // ------------------------------------------------------------------

  _proj(wx, wy, wz, camX, camY) {
    const W = this.W, H = this.H;
    const cz = wz - this.pos;
    const sc = JS.depth / Math.max(1, cz);
    return {
      x: W / 2 + sc * (wx - camX) * W / 2,
      y: this.horizon - sc * (wy - camY) * H / 2,
      sc, cz,
    };
  }

  render() {
    const ctx = this.ctx, W = this.W, H = this.H;
    if (!ctx || !W) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.state === 'intro') { this._renderIntro(); return; }

    ctx.save();
    if (this.shake > 0.3) ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    this.horizon = H * 0.2;
    this._renderSky();

    const base = Math.floor(this.pos / JS.seg);
    const frac = (this.pos % JS.seg) / JS.seg;
    const playerZ = this.pos + JS.playerZ;
    // camera: above the water under itself, rising a little to follow jumps
    // Whichever is higher: riding the water under the camera, or following
    // you (eased) -- so a ramp or a big jump lifts the camera with you
    // instead of leaving it staring into the ramp.
    const follow = this.riderY + JS.camHeight * 0.9;
    if (this.camLift === 0 || this.state !== 'race') this.camLift = follow;
    this.camLift += (follow - this.camLift) * 0.2;
    const camY = Math.max(Math.max(this._yAt(this.pos), this._yAt(playerZ)) + JS.camHeight, this.camLift) + this.camDrop * this.camDrop * 9000;
    const camX = this.playerX * JS.road * 0.8;

    // Boundary points between segments, near to far, with the classic
    // curve accumulation so the run bends away from you.
    const pts = [];
    let xo = 0, dx = -((this.segs[base] ? this.segs[base].curve : 0) * frac);
    const nB = Math.min(JS.draw, this.segs.length - base - 1);
    for (let j = 0; j <= nB; j++) {
      const s = this.segs[base + j];
      const z = s.z, yc = s.y0, cn = s.curve / 6;
      const row = [];
      for (const xl of JS_XS) row.push(this._proj(xo + xl * JS.road, yc + jsWall(xl, cn), z, camX, camY));
      row.xo = xo;
      pts.push(row);
      xo += dx; dx += s.curve;
    }

    // which segment the player and each rival sit in, for draw order
    const playerSeg = Math.floor(playerZ / JS.seg) - base;
    const rivalsBySeg = {};
    for (const r of this.racers) {
      const k = Math.floor(r.z / JS.seg) - base;
      if (k >= 0 && k < nB) (rivalsBySeg[k] = rivalsBySeg[k] || []).push(r);
    }

    // far to near: each nearer strip paints over what it hides
    const fogCol = [255, 214, 190];
    for (let n = nB - 1; n >= 0; n--) {
      const a = pts[n], b = pts[n + 1];
      if (a[0].cz > JS.depth) this._drawStrip(this.segs[base + n], a, b, n / JS.draw, fogCol);
      if (base + n === this.finishSeg) this._drawFinish(a);
      for (const r of rivalsBySeg[n] || []) this._drawRival(r, pts, n, base, camX, camY);
      if (n === playerSeg) this._renderPlayer(pts, n, base, camX, camY);
    }
    if (playerSeg < 0 || playerSeg >= nB) this._renderPlayer(pts, 0, base, camX, camY);

    if (this.prompt && this.prompt.sx != null && !this.skill) this._drawPrompt();
    for (const q of this.particles) {
      ctx.globalAlpha = Math.max(0, q.life / q.max);
      ctx.fillStyle = q.color;
      ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    this._renderSpeedLines();
    if (this.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${this.flash * 0.7})`; ctx.fillRect(0, 0, W, H); }
    this._renderHud();
    if (this.state === 'race') { this._renderButtons(); if (this.wheel) this._renderWheel(); }
    if (this.skill) this.skill.draw(ctx, W, H, this.t);
  }

  // One segment of the trough: a row of quads across the cross-section,
  // colored floor -> walls -> foam rim -> outer bank, banded for speed,
  // fading into the haze with distance.
  _drawStrip(seg, a, b, far, fog) {
    const ctx = this.ctx;
    const band = Math.floor(seg.i / 3) % 2;
    const fogT = Math.pow(far, 1.6) * 0.85;
    const floor = band ? [36, 150, 214] : [30, 138, 204];
    const wall = band ? [92, 204, 240] : [80, 192, 234];
    const rim = band ? [255, 255, 255] : [222, 246, 255];
    const bank = band ? [170, 222, 250] : [150, 210, 245];
    for (let k = 0; k < JS_XS.length - 1; k++) {
      const ax = Math.abs((JS_XS[k] + JS_XS[k + 1]) / 2);
      let col = ax < 0.47 ? floor : ax < 1 ? wall : ax < 1.12 ? rim : bank;
      if (seg.kick != null && ax < 1) col = band ? [255, 220, 90] : [255, 196, 60];
      if (seg.drop && ax < 1) col = band ? [20, 110, 190] : [16, 98, 176];
      ctx.fillStyle = jsMix(col, fog, fogT);
      ctx.beginPath();
      ctx.moveTo(a[k].x, a[k].y); ctx.lineTo(a[k + 1].x, a[k + 1].y);
      ctx.lineTo(b[k + 1].x, b[k + 1].y); ctx.lineTo(b[k].x, b[k].y);
      ctx.closePath(); ctx.fill();
    }
    // chevrons up the kicker so you can read a ramp coming
    if (seg.kick != null && band) {
      ctx.fillStyle = jsMix([255, 255, 255], fog, fogT);
      const m = 6, mid = (a[m].x + b[m].x) / 2, w = Math.abs(a[8].x - a[4].x) * 0.25;
      ctx.beginPath();
      ctx.moveTo(mid - w, a[m].y); ctx.lineTo(mid, b[m].y); ctx.lineTo(mid + w, a[m].y);
      ctx.lineTo(mid + w * 0.6, a[m].y); ctx.lineTo(mid, (a[m].y + b[m].y) / 2); ctx.lineTo(mid - w * 0.6, a[m].y);
      ctx.fill();
    }
  }

  _drawFinish(row) {
    const ctx = this.ctx, l = row[2], r = row[10];
    const h = (r.x - l.x) * 0.45;
    ctx.fillStyle = '#c8402c';
    ctx.fillRect(l.x - 6, l.y - h, 12, h); ctx.fillRect(r.x - 6, r.y - h, 12, h);
    const top = Math.min(l.y, r.y) - h;
    ctx.fillStyle = '#fff'; ctx.fillRect(l.x, top, r.x - l.x, h * 0.18);
    ctx.fillStyle = '#111';
    for (let i = 0; i < 16; i++) ctx.fillRect(l.x + (i / 16) * (r.x - l.x), top + (i % 2) * h * 0.09, (r.x - l.x) / 16, h * 0.09);
  }

  // Interpolated screen position of world point (z, lateral x, height y).
  _place(pts, n, base, z, xl, y, camX, camY) {
    const f = (z - (base + n) * JS.seg) / JS.seg;
    const a = pts[Math.max(0, n)], b = pts[Math.min(pts.length - 1, n + 1)];
    const xo = a.xo + (b.xo - a.xo) * f;
    return this._proj(xo + xl * JS.road, y, z, camX, camY);
  }

  _drawRival(r, pts, n, base, camX, camY) {
    const p = this._place(pts, n, base, r.z, r.x, this._surf(r.z, r.x), camX, camY);
    if (p.cz <= JS.depth) return;
    const w = p.sc * this.W / 2 * 520;
    const bob = Math.sin(this.t * 6 + r.bob) * 2;
    this._drawJetski(p.x, p.y + bob, w, r.kind, r.knock > 0 ? Math.sin(r.knock * 18) * 0.6 : 0);
    if (this.prompt && this.prompt.racer === r) { this.prompt.sx = p.x; this.prompt.sy = p.y - w * 0.35; this.prompt.r = Math.max(30, Math.min(w * 0.6, Math.min(this.W, this.H) * 0.12)); }
  }

  _renderPlayer(pts, n, base, camX, camY) {
    const ctx = this.ctx, W = this.W, H = this.H;
    const playerZ = this.pos + JS.playerZ;
    const p = this._place(pts, n, base, playerZ, this.playerX, this.riderY, camX, camY);
    const w = Math.min(p.sc * W / 2 * 520, H * 0.24);
    const surf = this._surf(playerZ, this.playerX);
    // shadow on the water when you're up in the air
    if (this.riderY - surf > 20) {
      const sp = this._place(pts, n, base, playerZ, this.playerX, surf, camX, camY);
      ctx.fillStyle = 'rgba(0,40,80,0.25)';
      ctx.beginPath(); ctx.ellipse(sp.x, sp.y, w * 0.4, w * 0.07, 0, 0, Math.PI * 2); ctx.fill();
    }
    // rooster tail, bigger the faster you go (only on the water)
    if (this.grounded) {
      const spd = Math.min(1.6, this.speed / 13000);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      for (let i = 0; i < 6; i++) {
        const a = (this.t * 4 + i / 6) % 1;
        ctx.beginPath(); ctx.arc(p.x + Math.sin(i * 2.3) * w * 0.2, p.y + a * H * 0.1, w * (0.05 + a * 0.12) * (0.4 + spd * 0.6), 0, Math.PI * 2); ctx.fill();
      }
    }
    let lean = Math.max(-0.4, Math.min(0.4, this.lean)) + Math.sin(this.t * 25) * this.wobble * 0.15;
    const opts = {};
    const bob = this.grounded ? Math.sin(this.t * 9) * 2 : 0;
    let lift = 0;
    if (this.heli) {
      const h = this.heli;
      if (h.phase === 'dance') opts.spin = h.t * 22;
      else if (h.phase === 'fly') { opts.rotor = true; lift = Math.min(1, h.t / 0.5) * H * 0.16 + Math.sin(this.t * 3) * 6; }
      else { opts.rotor = true; lift = (1 - h.t / 0.6) * H * 0.16; }
    }
    if (this.trick) {
      const tr = this.trick, k = Math.min(1, tr.t / JS.trickTime);
      if (tr.phase === 'bail') lean = this.t * 14;
      else if (tr.phase === 'anim') {
        if (tr.def.anim === 'spin') lean += k * Math.PI * 2;
        else if (tr.def.anim === 'flip') opts.flip = k * Math.PI * 2;
        else if (tr.def.anim === 'superman') opts.spin = -Math.sin(k * Math.PI) * 1.4;
        else if (tr.def.anim === 'handstand') opts.spin = Math.sin(k * Math.PI) * Math.PI;
      }
    }
    if (opts.flip != null) {
      ctx.save(); ctx.translate(p.x, p.y - lift); ctx.scale(1, Math.cos(opts.flip)); ctx.translate(-p.x, -(p.y - lift));
      this._drawJetski(p.x, p.y + bob - lift, w, 'player', lean, opts);
      ctx.restore();
    } else {
      this._drawJetski(p.x, p.y + bob - lift, w, 'player', lean, opts);
    }
    this._playerScreen = { x: p.x, y: p.y - lift, w };
  }

  // The trick wheel: an arc of buttons over your rider while you're in the
  // air. Harder tricks (the ones with a skill game) have a red dot.
  _renderWheel() {
    const ctx = this.ctx, W = this.W, H = this.H;
    const r = Math.max(30, Math.min(W, H) * 0.085);
    const cx = W / 2, cy = H * 0.86, R = Math.max(r * 2.8, Math.min(W * 0.36, H * 0.22));
    const n = JETSKI_TRICKS.length;
    this._ui.tricks = [];
    ctx.save();
    for (let i = 0; i < n; i++) {
      const ang = Math.PI * (1.15 + (0.7 * i) / Math.max(1, n - 1));
      const bx = cx + Math.cos(ang) * R, by = cy + Math.sin(ang) * R;
      this._ui.tricks.push({ x: bx, y: by, r, i });
      const pop = 1 + 0.06 * Math.sin(this.t * 12 + i);
      ctx.fillStyle = 'rgba(10,20,40,0.72)';
      ctx.beginPath(); ctx.arc(bx, by, r * pop, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ffd84a'; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${Math.round(r * (JETSKI_TRICKS[i].name.length > 6 ? 0.34 : 0.48))}px VT323, monospace`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(JETSKI_TRICKS[i].name, bx, by);
      if (JETSKI_TRICKS[i].skill) {
        ctx.fillStyle = '#ff3b3b';
        ctx.beginPath(); ctx.arc(bx + r * 0.62, by - r * 0.62, r * 0.16, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
    ctx.textBaseline = 'alphabetic';
  }

  // Sunset over a range of water mountains, foam on the peaks, a rainbow.
  _renderSky() {
    const ctx = this.ctx, W = this.W, H = this.H;
    const g = ctx.createLinearGradient(0, 0, 0, H * 0.75);
    g.addColorStop(0, '#6f8cff'); g.addColorStop(0.45, '#ffb3c8'); g.addColorStop(1, '#ffd6be');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const off = this.skyOffset * W;
    // rainbow
    ctx.save();
    ctx.globalAlpha = 0.28;
    ['#ff5a5a', '#ffb347', '#ffe66b', '#7be37b', '#6bb8ff', '#a77bff'].forEach((c, i) => {
      ctx.strokeStyle = c; ctx.lineWidth = Math.max(4, W * 0.012);
      ctx.beginPath(); ctx.arc(W * 0.3 - off * 0.1, H * 0.55, W * (0.55 - i * 0.014), Math.PI * 1.08, Math.PI * 1.92); ctx.stroke();
    });
    ctx.restore();
    // two layers of water mountains with foam caps
    const layer = (par, baseY, hgt, col, foam, seed) => {
      const span = W * 1.8, o = ((off * par) % span + span) % span;
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.moveTo(-10, H);
      for (let i = -1; i < 9; i++) {
        const x0 = i * (span / 6) - o;
        const ph = rushHash(i + seed + Math.floor((off * par) / span) * 9);
        ctx.lineTo(x0, baseY);
        ctx.lineTo(x0 + span / 12, baseY - hgt * (0.55 + ph * 0.45));
      }
      ctx.lineTo(W + 10, baseY); ctx.lineTo(W + 10, H); ctx.closePath(); ctx.fill();
      ctx.fillStyle = foam;
      for (let i = -1; i < 9; i++) {
        const x0 = i * (span / 6) - o;
        const ph = rushHash(i + seed + Math.floor((off * par) / span) * 9);
        const px = x0 + span / 12, py = baseY - hgt * (0.55 + ph * 0.45);
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px - hgt * 0.16, py + hgt * 0.18); ctx.lineTo(px + hgt * 0.16, py + hgt * 0.18); ctx.fill();
      }
    };
    layer(0.15, H * 0.42, H * 0.2, 'rgba(110,150,230,0.75)', 'rgba(255,255,255,0.8)', 3);
    layer(0.3, H * 0.47, H * 0.14, 'rgba(70,140,215,0.85)', 'rgba(255,255,255,0.85)', 11);
    // cloud sea below everything
    ctx.fillStyle = 'rgba(255,240,235,0.9)';
    ctx.fillRect(0, H * 0.47, W, H);
  }

  _tap() {
    // Tapping skips the whale intro once you've seen the launch.
    if (this.state === 'intro' && this.introT > 0.8) this.introT = Math.max(this.introT, 2.6);
  }

  // The red circle goes on the nearest rival you're close enough to hit.
  _pickPrompt(playerZ) {
    let best = null;
    if (!this.heli) {
      for (const r of this.racers) {
        if (r.cool > 0 || r.knock > 0) continue;
        const dz = r.z - playerZ;
        if (dz < -150 || dz > JS.promptRange || Math.abs(r.x - this.playerX) > 0.9) continue;
        if (!best || dz < best.z - playerZ) best = r;
      }
    }
    if (!best) { this.prompt = null; return; }
    if (!this.prompt || this.prompt.racer !== best) this.prompt = { racer: best, born: this.t };
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

  _addScore(n, label) {
    this.score += n;
    this.popups.push({ text: `+${n}${label ? ' ' + label : ''}`, life: 1, max: 1 });
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
      ['Tricks landed', this.tricksLanded],
    ].map(([k, v]) => `<p class="cannon-stat">${k}: <span>${v}</span></p>`).join('');
    document.getElementById('jetski-results').classList.remove('hidden');
  }

  // Faint red circle on the rival you can hit -- tap it to attack.
  _drawPrompt() {
    const ctx = this.ctx, pr = this.prompt;
    const age = this.t - pr.born;
    const a = Math.min(1, age * 4) * (0.45 + 0.25 * Math.sin(this.t * 10));
    ctx.save();
    ctx.strokeStyle = `rgba(255,50,50,${a + 0.2})`;
    ctx.fillStyle = `rgba(255,50,50,${a * 0.35})`;
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(pr.sx, pr.sy, pr.r * (1 + 0.08 * Math.sin(this.t * 10)), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  // Lines streaming out of the vanishing point while boosting or flying.
  _renderSpeedLines() {
    const fly = this.heli && this.heli.phase === 'fly';
    if (!(this.boostT > 0 || fly || this.speed > 15000)) return;
    const ctx = this.ctx, W = this.W, H = this.H;
    const cx = W / 2, cy = this.horizon + H * 0.18;
    ctx.save();
    ctx.strokeStyle = fly ? `hsla(${(this.t * 400) % 360},100%,80%,0.6)` : 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 2;
    const n = fly ? 40 : 22;
    for (let i = 0; i < n; i++) {
      const a = rushHash(i + Math.floor(this.t * 20)) * Math.PI * 2;
      const r0 = (0.25 + rushHash(i * 3 + Math.floor(this.t * 20)) * 0.4) * Math.max(W, H);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      ctx.lineTo(cx + Math.cos(a) * (r0 + 120), cy + Math.sin(a) * (r0 + 120));
      ctx.stroke();
    }
    ctx.restore();
  }

  // BOOST (bottom right) and the helicopter SPECIAL (bottom left). Each
  // is a round button with its meter as a ring around it.
  _renderButtons() {
    const ctx = this.ctx, W = this.W, H = this.H;
    const r = Math.max(30, Math.min(W, H) * 0.075);
    const by = H - r - 26;
    this._ui.boost = { x: W - r - 20, y: by, r };
    this._ui.special = { x: r + 20, y: by, r };
    const button = (b, fill, ready, color, label) => {
      ctx.save();
      ctx.globalAlpha = ready ? 1 : 0.55;
      ctx.fillStyle = ready ? color : 'rgba(0,0,0,0.45)';
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 5, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = color; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 5, -Math.PI / 2, -Math.PI / 2 + fill * Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${Math.round(b.r * 0.42)}px VT323, monospace`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, b.x, b.y);
      ctx.restore();
    };
    button(this._ui.boost, this.boost, this.boost >= JS.boostCost, '#22b8ff', 'BOOST');
    const full = this.special >= 1 && !this.heli;
    const col = full ? `hsl(${(this.t * 300) % 360},100%,55%)` : '#ff4fd8';
    if (full) { ctx.save(); ctx.translate(this._ui.special.x, this._ui.special.y); ctx.scale(1 + 0.08 * Math.sin(this.t * 10), 1 + 0.08 * Math.sin(this.t * 10)); ctx.translate(-this._ui.special.x, -this._ui.special.y); }
    button(this._ui.special, this.heli ? 0 : this.special, full, col, 'SPECIAL');
    if (full) ctx.restore();
    ctx.textBaseline = 'alphabetic';
  }

  // A jet ski seen from behind: hull, rider, rooster tail. kind paints it.
  _drawJetski(x, y, w, kind, lean, opts) {
    opts = opts || {};
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
    // rider (spins on the handlebars during the breakdance)
    if (opts.spin) { ctx.save(); ctx.translate(0, -h * 0.5); ctx.rotate(opts.spin); ctx.translate(0, h * 0.5); }
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
    if (opts.spin) ctx.restore();
    // helicopter mode: a mast and a blurred, spinning rotor up top
    if (opts.rotor) {
      ctx.fillStyle = '#333'; ctx.fillRect(-w * 0.03, -h * 1.5, w * 0.06, h * 0.4);
      ctx.fillStyle = 'rgba(40,40,40,0.25)';
      ctx.beginPath(); ctx.ellipse(0, -h * 1.5, w * 0.95, h * 0.12, 0, 0, Math.PI * 2); ctx.fill();
      const b = Math.cos(t * 50) * w * 0.95;
      ctx.strokeStyle = '#222'; ctx.lineWidth = Math.max(2, w * 0.04);
      ctx.beginPath(); ctx.moveTo(-b, -h * 1.5); ctx.lineTo(b, -h * 1.5); ctx.stroke();
    }
    ctx.restore();
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
      // speed, so you can feel the mountain working
      ctx.textAlign = 'center';
      ctx.font = `bold ${Math.round(22 * u)}px VT323, monospace`;
      const mph = Math.round(this.speed / 180);
      ctx.strokeText(`${mph} MPH`, W / 2, 48 * u);
      ctx.fillStyle = this.speed > 15000 ? '#ffd84a' : '#fff'; ctx.fillText(`${mph} MPH`, W / 2, 48 * u);
      // progress down the run
      const prog = Math.min(1, (this.pos + JS.playerZ) / (this.finishSeg * JS.seg));
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(16, 74 * u, W - 32, 7);
      ctx.fillStyle = '#ffd84a'; ctx.fillRect(16, 74 * u, (W - 32) * prog, 7);
      // pass popups
      this.popups.forEach((q, i) => {
        ctx.globalAlpha = Math.min(1, q.life * 2);
        ctx.textAlign = 'right';
        ctx.font = `bold ${Math.round(22 * u)}px VT323, monospace`;
        ctx.fillStyle = q.bad ? '#ff5a5a' : '#ffd84a';
        ctx.fillText(q.text, W - 16, 48 * u + 26 * u * (i + 1) - (1 - q.life) * 20);
      });
      ctx.globalAlpha = 1;
      if (this.t < 6 && this.state === 'race') {
        ctx.textAlign = 'center';
        ctx.font = `${Math.round(24 * u)}px VT323, monospace`;
        ctx.globalAlpha = Math.min(1, 6 - this.t);
        ctx.strokeText('Drag to carve', W / 2, H * 0.4);
        ctx.fillStyle = '#fff'; ctx.fillText('Drag to carve', W / 2, H * 0.4);
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

// ------------------------------------------------------------------
// SKILL GAMES -- one fires when you tap a red circle. Each is about a
// second long, one thumb, readable at a glance. The race runs in slow
// motion underneath. Add new ones to JETSKI_SKILLS.
// ------------------------------------------------------------------

function jetskiSkillBase(target) {
  return { target, t: 0, done: false, success: false, perfect: false, update() {}, down() {}, up() {}, draw() {} };
}

function jetskiSkillFrame(ctx, W, H, label, flash) {
  ctx.fillStyle = 'rgba(0,0,0,0.42)';
  ctx.fillRect(0, 0, W, H);
  const R = Math.min(W, H) * 0.12, cx = W / 2, cy = H * 0.44;
  ctx.font = `bold ${Math.round(R * 0.55)}px VT323, monospace`;
  ctx.textAlign = 'center';
  ctx.lineWidth = 6; ctx.strokeStyle = '#000'; ctx.lineJoin = 'round';
  ctx.strokeText(label, cx, cy - R * 2.6);
  ctx.fillStyle = flash ? '#ffd84a' : '#fff';
  ctx.fillText(label, cx, cy - R * 2.6);
  return { R, cx, cy };
}

const JETSKI_SKILLS = {
  // Hold down: a big ring pulses in over the circle. Let go when they match.
  ring(target) {
    const g = jetskiSkillBase(target);
    g.pressed = false; g.holdT = 0;
    g.outer = () => 1 + 0.9 * (0.5 + 0.5 * Math.cos(g.holdT * 4.4));
    g.update = (dt) => {
      g.t += dt;
      if (g.pressed) { g.holdT += dt; if (g.holdT > 2.4) g.done = true; }
      else if (g.t > 2.2) g.done = true;
    };
    g.down = () => { g.pressed = true; };
    g.up = () => {
      if (!g.pressed || g.done) return;
      const err = Math.abs(g.outer() - 1);
      g.success = err < 0.13; g.perfect = err < 0.05; g.done = true;
    };
    g.draw = (ctx, W, H) => {
      const { R, cx, cy } = jetskiSkillFrame(ctx, W, H, g.pressed ? 'LET GO' : 'HOLD', g.pressed && Math.abs(g.outer() - 1) < 0.13);
      ctx.fillStyle = '#ff3b3b';
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(cx, cy, R * (g.pressed ? g.outer() : 1.9 + 0.05 * Math.sin(g.t * 8)), 0, Math.PI * 2); ctx.stroke();
    };
    return g;
  },
  // Two circles slide toward each other vertically. Tap when they overlap.
  slide(target) {
    const g = jetskiSkillBase(target);
    g.off = () => Math.cos(g.t * 4.2);
    g.update = (dt) => { g.t += dt; if (g.t > 3.1) g.done = true; };
    g.down = () => {
      if (g.done) return;
      const err = Math.abs(g.off());
      g.success = err < 0.2; g.perfect = err < 0.07; g.done = true;
    };
    g.draw = (ctx, W, H) => {
      const { R, cx, cy } = jetskiSkillFrame(ctx, W, H, 'TAP', Math.abs(g.off()) < 0.2);
      const A = R * 2.2, o = g.off() * A;
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(cx, cy - A - R); ctx.lineTo(cx, cy + A + R); ctx.stroke();
      ctx.fillStyle = 'rgba(255,59,59,0.85)';
      ctx.beginPath(); ctx.arc(cx, cy - o, R * 0.8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath(); ctx.arc(cx, cy + o, R * 0.8, 0, Math.PI * 2); ctx.fill();
    };
    return g;
  },
  // A needle sweeps the dial. Tap while it's in the green wedge.
  needle(target) {
    const g = jetskiSkillBase(target);
    g.a0 = Math.random() * Math.PI * 2;
    g.wedge = g.a0 + Math.PI * (0.7 + Math.random() * 0.8);
    g.ang = () => g.a0 + g.t * Math.PI * 2 * 1.05;
    g.update = (dt) => { g.t += dt; if (g.t > 2.8) g.done = true; };
    g.down = () => {
      if (g.done) return;
      let d = Math.abs(((g.ang() - g.wedge) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
      g.success = d < 0.42; g.perfect = d < 0.14; g.done = true;
    };
    g.draw = (ctx, W, H) => {
      let d = Math.abs(((g.ang() - g.wedge) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
      const { R, cx, cy } = jetskiSkillFrame(ctx, W, H, 'TAP', d < 0.42);
      const r = R * 1.6;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2fdc6a';
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, g.wedge - 0.42, g.wedge + 0.42); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#ff3b3b'; ctx.lineWidth = 6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(g.ang()) * r * 0.95, cy + Math.sin(g.ang()) * r * 0.95); ctx.stroke();
      ctx.lineCap = 'butt';
    };
    return g;
  },
};

function jetskiSkillGame(target) {
  const kinds = Object.keys(JETSKI_SKILLS);
  return JETSKI_SKILLS[kinds[Math.floor(Math.random() * kinds.length)]](target);
}

let jetskiGame = null;
