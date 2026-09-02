/**
 * THE TRANSPLANT TRAIL — ACT 2: THE HEIST
 *
 * Money Heist by way of a Williamsburg warehouse. The crew plans the job in an
 * old sugar-factory hideout, the player assigns the three Wise Erics to the
 * three support roles, and WHICH Eric takes a role changes the actual verb of
 * that role's mini-encounter — not just its flavor text.
 *
 * Flow: intro -> role assignment -> briefing -> distraction A -> distraction B
 *       -> register lockpick -> getaway chase -> scripted capture -> Act 3 stub.
 *
 * The ending is fixed: the crew gets caught no matter how well you play. That's
 * the on-ramp to Act 3, which is not built yet.
 */

// ============================================
// CREW + ROLES
// ============================================

const HEIST_CREW = [
  {
    id: 'tony',
    name: 'Big Tony',
    origin: 'New Jersey Italian',
    portrait: 'nj-italian',
    color: '#e05a4a',
    // Narrator-voice descriptions of what each Eric DOES. No quoted lines —
    // Tony, Ruhul and Dmitri are voiced by the author, not by this file.
    distractionBlurb: 'Creates a scene with his entire body. Fast, loud, over before anyone decides how to feel about it.',
    getawayBlurb: 'Drives like the lane lines are a suggestion. Fastest route, most paint traded.',
    verb: 'Timing',
  },
  {
    id: 'ruhul',
    name: 'Ruhul',
    origin: 'Queens Bengali',
    portrait: 'queens-bengali',
    color: '#5dc46a',
    distractionBlurb: 'Talks. Keeps talking. Somehow the clerk is now walking away from the register voluntarily.',
    getawayBlurb: 'Knows a guy who knows a street. The route is shorter than the route should be.',
    verb: 'Charm',
  },
  {
    id: 'dmitri',
    name: 'Dmitri',
    origin: 'Coney Island Russian',
    portrait: 'coney-russian',
    color: '#6f9be0',
    distractionBlurb: 'Does not lure anyone anywhere. Simply stands there with a question that cannot be answered quickly.',
    getawayBlurb: 'Drives at exactly one speed forever. Nothing surprises him, including the police.',
    verb: 'Patience',
  },
];

const HEIST_ROLES = [
  { id: 'distractionA', name: 'Distraction A', sub: 'Front of the store — pull the clerk off the counter' },
  { id: 'distractionB', name: 'Distraction B', sub: 'Back aisle — keep the manager busy' },
  { id: 'lookout',      name: 'Lookout / Getaway', sub: 'Watches the block from the car, then drives it' },
];

function getHeistCrew(id) {
  return HEIST_CREW.find(c => c.id === id);
}

// ============================================
// TUNING
//
// Every number below came out of a simulation of the mechanic (see the
// session's /tmp/heist_balance*.js scratch scripts), not out of a guess:
//   Tony  — oscillator speed 2.4 / zone 24 => ~64% hit rate for a deliberate
//           tap (90ms timing SD), ~24% for a random one.
//   Ruhul — fill rate 1.0 into a wide band => ~100% for a deliberate release,
//           ~32% for a masher. Forgiving on purpose; skill shows in the score.
//   Dmitri— thrust/gravity/damping tuned so a real (noisy) player banks about
//           7-8s in-zone out of 14s, a masher banks ~1s. Target is 5.5s, so
//           anyone actually playing clears it and nobody dead-ends.
//   Register — 4 tumblers, 25s, 3s miss penalty => ~89% full-clear for a
//           deliberate player (avg 3.87 of 4 tumblers), ~16% for a masher.
// ============================================

const HEIST_TUNING = {
  // The board tilts on two independent axes (left thumb -> X, right thumb ->
  // Y, or mouse position on desktop -> both at once). accel/friction give it
  // real momentum on purpose: push too hard and you carry into a hole,
  // correct late and you're already committed. That inertia is the actual
  // difficulty, not just steering toward the goal.
  maze: {
    // "The ball should be moving much much faster" -- re-simulated with a
    // hole-dodging bot (not a perfect solver: reaction lag, imperfect
    // avoidance) against the 10x24 grid with holes scattered randomly
    // across every cell, path included. Speed actually helps up to a
    // point (less time exposed near a hole each pass) before it tips over
    // into losing control -- accel .13 / friction .93 was the peak,
    // ~58% clean completions across 40 generated mazes. That's real
    // difficulty on a maze this size, not "impossible," which matches
    // "it should be a challenge to get through."
    timeLimit: 150,
    accel: 0.13,
    friction: 0.93,
    ballRadius: 2.6,
  },
  getaway: {
    // Not a finish line anymore -- "no matter what they will be caught,
    // but as they get nitro or shoot cops it'll go down... in the end
    // they'll get caught no matter what after 75 seconds or so." Fixed
    // real-time run for everyone (so there's actually time to go through
    // the motions: shoot some cops, maybe the chopper, jump if you feel
    // like it) with a HEAT meter that's always drifting toward capture
    // and only good play pushes back against it. Whichever Eric ended up
    // on Lookout is still the one behind the wheel -- speed/spawn density
    // are their personality now, not a race distance.
    duration: 55,
    tony:   { speed: 9.0, spawn: 34, label: 'Big Tony drives.' },
    ruhul:  { speed: 7.4, spawn: 44, label: 'Ruhul knows a shortcut.' },
    dmitri: { speed: 6.6, spawn: 56, label: 'Dmitri drives. Dmitri always drives like this.' },
    heat: {
      start: 22,
      // Drift alone over the actual 55s run: 22 + 0.6*55 = ~55 -- lands
      // you mid-bar just for surviving, not already deep in the red
      // before the run's half over. Used to be 0.88 (tuned for a 75s
      // run that got cut to 55 without this being revisited), which put
      // passive drift alone at 22+0.88*55=~70 -- already past the "bad"
      // threshold, and one crash away from pinned at the 100 cap with
      // 20+ seconds still to play. Once capped, nothing you do shows up
      // on the bar -- which is exactly the "I hit obstacle after
      // obstacle and it doesn't matter" complaint. copKillSub/
      // heliKillSub also existed here but were never actually applied
      // anywhere (fixed alongside this) -- shooting cops/the chopper did
      // real cash, but had never once touched heat.
      driftPerSecond: 0.6,
      crashAdd: 8,
      copKillSub: 6,
      heliKillSub: 20,
      nitroSub: 6,
    },
  },
  cashMazeComplete: 420,
  cashPerSecondLeft: 10,
  cashLostPerCrash: 40,
};

// ============================================
// GAME
// ============================================

class HeistGame {
  constructor(gameState, onComplete) {
    this.gameState = gameState;
    this.onComplete = onComplete;

    this.canvas = document.getElementById('heist-canvas');
    this.ctx = this.canvas.getContext('2d');

    this.phase = 'idle';
    this.cash = 0;
    this.assign = { distractionA: null, distractionB: null, lookout: null };
    this.openRoleId = null;
    this.crashes = 0;
    this.bestFlips = 0;
    this.mazeCompleted = false;

    this.mech = null;      // active mini-encounter state
    this._af = null;       // active RAF handle
    this._frame = 0;
    this.input = { down: false, tapY: 0, onDown: null, onUp: null };
    this._bound = false;
  }

  // ------------------------------------------------
  // INFRASTRUCTURE
  // ------------------------------------------------

  init() {
    this.resize();
    this._resizeHandler = () => this.resize();
    window.addEventListener('resize', this._resizeHandler);
    this.bindInput();
    this.bindMazeInput();
    this.bindGetawayInput();
    this.showIntro();
  }

  // A real swipe up/down changes lanes, not just a tap on the top/bottom
  // half of the screen (that still works too, as a fallback for a press
  // that doesn't move far enough to register as a swipe).
  bindGetawayInput() {
    let startY = null, triggered = false;
    const threshold = 36;

    const localY = (clientY) => clientY - this.canvas.getBoundingClientRect().top;
    const localXY = (e) => {
      const r = this.canvas.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };

    this.canvas.addEventListener('pointerdown', (e) => {
      if (this.phase !== 'getaway') return;
      const g = this.mech;
      if (g && g.aiming) { const [x, y] = localXY(e); g.aiming.x = x; g.aiming.y = y; return; }
      startY = localY(e.clientY);
      triggered = false;
    });

    this.canvas.addEventListener('pointermove', (e) => {
      if (this.phase !== 'getaway') return;
      const g = this.mech;
      if (!g || g.kind !== 'getaway') return;
      if (g.aiming) { const [x, y] = localXY(e); g.aiming.x = x; g.aiming.y = y; return; }
      if (startY === null || triggered) return;
      const dy = localY(e.clientY) - startY;
      if (dy < -threshold) { g.laneUp(); triggered = true; }
      else if (dy > threshold) { g.laneDown(); triggered = true; }
    });

    window.addEventListener('pointerup', () => {
      // No tap-on-half fallback -- swipe only. Direct feedback: "take out
      // the tap option, the swiping is much better." Desktop still has
      // ArrowUp/ArrowDown wired in bindInput().
      //
      // Firing used to happen here too (confirm on whatever pointerup
      // came next while aiming) -- but pointerup fires globally, so the
      // very release of the ROCKET button that just started the aim
      // satisfied that condition immediately. Confirmed bug: "when you
      // press the rocket, it automatically shoots." Dragging the reticle
      // on the canvas no longer fires anything on release; only a second,
      // deliberate press of the ROCKET/FIRE button does now.
      startY = null;
    });

    // Jump button: press to launch, keep holding while airborne to spin
    // the car for a flip. Doesn't fight the swipe/tap lane logic above --
    // separate element entirely.
    const jumpBtn = document.getElementById('heist-jump-btn');
    const press = (e) => {
      if (this.phase !== 'getaway') return;
      e.preventDefault();
      jumpBtn.classList.add('pressed');
      this.getawayJumpHeld = true;
      this.triggerGetawayJump();
    };
    const release = () => { jumpBtn.classList.remove('pressed'); this.getawayJumpHeld = false; };
    jumpBtn.addEventListener('pointerdown', press);
    jumpBtn.addEventListener('pointerup', release);
    jumpBtn.addEventListener('pointerleave', release);
    jumpBtn.addEventListener('pointercancel', release);

    const wireTap = (id, fn) => {
      const el = document.getElementById(id);
      el.addEventListener('pointerdown', (e) => {
        if (this.phase !== 'getaway') return;
        e.preventDefault();
        el.classList.add('pressed');
        fn();
      });
      const up = () => el.classList.remove('pressed');
      el.addEventListener('pointerup', up);
      el.addEventListener('pointerleave', up);
      el.addEventListener('pointercancel', up);
    };
    wireTap('heist-nitro-btn', () => this.triggerGetawayNitro());
    wireTap('heist-fire-btn', () => this.triggerGetawayFire());
    // A real two-press action: first press arms the aim (bullet-time,
    // reticle appears), second press on the same button fires it. Not a
    // single tap-and-forget.
    wireTap('heist-rocket-btn', () => {
      const g = this.mech;
      if (g && g.aiming) this.confirmGetawayAim();
      else this.startGetawayAim();
    });
    wireTap('heist-jumpout-btn', () => this.jumpOffBridge());
  }

  // The gun still auto-fires straight down the current lane -- that
  // always had a real target to hit (a cop car in the same lane).
  // Rockets didn't: "I fired and it missed and there's not really an
  // aiming mechanic." So rockets get one: press ROCKET and the world
  // slows way down, a bullseye appears, and you get ~3 real seconds to
  // drag it over the cop car or helicopter before it fires -- direct hit
  // if the reticle's on target when it goes, a wasted rocket if it isn't.
  // First press only ARMS the aim -- bullet-time, a reticle appears, live
  // targets get highlighted so you can see what's actually hittable. It
  // does NOT snap onto anything for you: "don't auto aim... it's on them
  // to move it properly." You get 5 real seconds (300 frames, ticking
  // regardless of the bullet-time slowdown) to drag it yourself before it
  // auto-fires wherever it's sitting; a second press of the same button
  // fires early.
  startGetawayAim() {
    const g = this.mech;
    if (!g || g.kind !== 'getaway' || g.aiming || g.rocketAmmo <= 0) return;
    g.rocketAmmo--;
    g.aiming = { x: this.canvas.width * 0.55, y: this.canvas.height * 0.4, timer: 300 };
    this.updateGetawayButtons();
  }

  confirmGetawayAim() {
    const g = this.mech;
    if (!g || g.kind !== 'getaway' || !g.aiming) return;
    const { x, y } = g.aiming;
    g.aiming = null;
    const hitR = 46;
    let hitCop = null;
    g.obstacles.forEach(o => {
      if (o.kind !== 'cop' || o.destroyed) return;
      const oy = this.laneCenterY(o.lane);
      if (Math.hypot(x - o.x, y - oy) < hitR) hitCop = o;
    });
    if (g.heli && !g.heli.destroyed && Math.hypot(x - g.heli.x, y - g.heli.y) < hitR) {
      g.heli.destroyed = true; g.heliDone = true;
      g.heli.fallVy = -2; g.heli.fallSpin = (Math.random() < 0.5 ? -1 : 1) * 0.1;
      this.cash += 80;
      // Same dead-tuning bug as the cop kill below -- heliKillSub existed
      // but nothing ever read it, so downing the chopper (the single
      // biggest possible play) had zero effect on heat.
      g.heat = Math.max(0, g.heat - HEIST_TUNING.getaway.heat.heliKillSub);
      this.spawnGetawayBurst(g.heli.x, g.heli.y);
      this.setHudHint('Direct hit! The helicopter goes down in flames.', g.cfg.label);
    } else if (hitCop) {
      hitCop.destroyed = true;
      this.cash += 25;
      g.heat = Math.max(0, g.heat - HEIST_TUNING.getaway.heat.copKillSub);
      this.spawnGetawayBurst(hitCop.x, this.laneCenterY(hitCop.lane));
      this.setHudHint('Direct hit. Cruiser down.', g.cfg.label);
    } else {
      this.spawnGetawayBurst(x, y);
      this.setHudHint('Rocket wasted -- nothing under the reticle.', g.cfg.label);
    }
    this.updateGetawayButtons();
  }

  triggerGetawayJump() {
    const g = this.mech;
    if (!g || g.kind !== 'getaway' || g.airborne) return;
    g.airborne = true;
    g.jumpVy = -3.4;
    g.jumpHeight = 0;
    g.flips = 0;
  }

  // Nitro: a banked charge burns for a few seconds of real speed and a
  // fire trail. Doesn't touch g.speed directly -- getawayLoop reads
  // nitroActive as a multiplier so it cleanly wears off instead of
  // needing to remember and subtract a bonus later.
  triggerGetawayNitro() {
    const g = this.mech;
    if (!g || g.kind !== 'getaway' || g.nitro <= 0 || g.nitroActive > 0) return;
    g.nitro--;
    g.nitroActive = 90;
    g.heat = Math.max(0, g.heat - HEIST_TUNING.getaway.heat.nitroSub);
  }

  // One button fires whatever's currently loaded -- bullets down cop cars,
  // rockets down the helicopter (and cop cars too, if you'd rather).
  // Gun only, now -- rockets go through startGetawayAim()/confirmGetawayAim()
  // instead, since a straight-down-the-lane shot could never reliably
  // reach either target (see the aim mechanic above for why).
  // Fires backward, out the rear window -- the actual threat (the
  // pursuing cop) comes from behind now, not ahead of you, so a forward
  // shot could never reach it.
  triggerGetawayFire() {
    const g = this.mech;
    if (!g || g.kind !== 'getaway' || g.aiming || g.gunAmmo <= 0) return;
    g.gunAmmo--;
    const px = this.canvas.width * 0.22;
    g.shots.push({ x: px - 44, y: g.laneY, lane: g.lane, kind: 'bullet', vx: -26 });
  }

  // Only available for the bridge half of the run -- an alternate exit
  // that skips the rest of the chase outright. Flavor over fairness: it's
  // there because jumping off the Brooklyn Bridge with a bag of cash is
  // funnier than not being able to.
  jumpOffBridge() {
    const g = this.mech;
    if (!g || g.kind !== 'getaway' || g.jumpedOff) return;
    if (g.sirens < this.jumpOutMin || g.sirens > this.jumpOutMax) return;
    g.jumpedOff = true;
    this.jumpedOffBridge = true;
    this.stopLoop();
    document.getElementById('heist-getaway-controls').classList.add('hidden');
    document.getElementById('heist-jumpout-btn').classList.add('hidden');
    this.setHudHint('Over the rail. Down toward the water.', g.cfg.label);
    this._bridgeJumpFrame = 0;
    this.bridgeJumpLoop();
  }

  // A short freeze-frame animation: the car keeps rolling empty while a
  // silhouette arcs off the rail toward the river, then straight to the
  // ending -- no crash risk for the rest of the run, but no flip bonus
  // either, since there's no more run left to flip in. Doesn't get you
  // away clean -- it's a different way to get caught, not an escape (see
  // showEnding()).
  bridgeJumpLoop() {
    const g = this.mech;
    if (!g) return;
    this._frame++;
    this._bridgeJumpFrame++;
    this.drawStreetScene();
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    const t = this._bridgeJumpFrame / 50;
    const px = W * 0.22 + t * 90;
    const py = g.laneY - Math.sin(Math.min(1, t) * Math.PI) * 70 + t * t * 90;
    ctx.fillStyle = '#1a1410';
    ctx.beginPath(); ctx.ellipse(px, py, 9, 13, -0.4, 0, Math.PI * 2); ctx.fill();
    if (this._bridgeJumpFrame < 55) {
      this._af = requestAnimationFrame(() => this.bridgeJumpLoop());
    } else {
      this.crashes = g.crashes;
      this.bestFlips = g.bestFlips;
      this.hideHud();
      document.getElementById('heist-getaway-controls').classList.add('hidden');
      document.getElementById('heist-jumpout-btn').classList.add('hidden');
      this.mech = null;
      this.showEnding();
    }
  }

  // Two real, simultaneous fingers: left thumb (wherever it lands on the
  // left half of the screen) sets X-tilt from its vertical position, right
  // thumb sets Y-tilt the same way on the right half — like turning both
  // knobs on a wooden labyrinth toy. Only does anything during 'maze'.
  // Mouse position is the desktop fallback: it drives both axes at once.
  // Real buttons, not touch-position tracking or a sensor — the previous
  // continuous-drag and device-tilt approaches both turned out unreliable in
  // practice (tilt in particular needs a secure (https) origin in most
  // mobile browsers and just silently does nothing on plain http, which is
  // almost certainly what "tilt isn't supported" actually was). A held
  // button always works, on every device, with no permission and no
  // position math to get subtly wrong.
  bindMazeInput() {
    this.mazeTiltX = 0;
    this.mazeTiltY = 0;
    this.mazeUseTilt = false;
    this._mazeOrientBase = null;
    this._mazeGotOrientEvent = false;

    document.querySelectorAll('.heist-pad-btn').forEach(btn => {
      const axis = btn.dataset.axis, dir = parseFloat(btn.dataset.dir);
      const press = (e) => {
        if (this.phase !== 'maze' || this.mazeUseTilt) return;
        e.preventDefault();
        btn.classList.add('pressed');
        if (axis === 'x') this.mazeTiltX = dir; else this.mazeTiltY = dir;
      };
      const release = (e) => {
        if (this.mazeUseTilt) return;
        btn.classList.remove('pressed');
        if (axis === 'x') this.mazeTiltX = 0; else this.mazeTiltY = 0;
      };
      btn.addEventListener('pointerdown', press);
      btn.addEventListener('pointerup', release);
      btn.addEventListener('pointerleave', release);
      btn.addEventListener('pointercancel', release);
    });

    // Real device tilt. Calibrated against whatever angle you're already
    // holding the phone at when tilt mode turns on — you don't have to hold
    // it dead flat, wherever it starts becomes "neutral."
    window.addEventListener('deviceorientation', (e) => {
      if (this.phase !== 'maze' || !this.mazeUseTilt) return;
      if (e.beta === null || e.gamma === null) return;
      this._mazeGotOrientEvent = true;
      if (!this._mazeOrientBase) this._mazeOrientBase = { beta: e.beta, gamma: e.gamma };
      const dGamma = e.gamma - this._mazeOrientBase.gamma; // left/right
      const dBeta = e.beta - this._mazeOrientBase.beta;   // front/back
      this.mazeTiltX = Math.max(-1, Math.min(1, dGamma / 22));
      this.mazeTiltY = Math.max(-1, Math.min(1, dBeta / 22));
    });

    const tiltBtn = document.getElementById('heist-maze-tilt-btn');
    if (typeof window.DeviceOrientationEvent === 'undefined') {
      tiltBtn.classList.add('hidden');
    } else {
      tiltBtn.onclick = () => {
        if (this.mazeUseTilt) {
          // Toggle back off — buttons take over again immediately.
          this.mazeUseTilt = false;
          this.mazeTiltX = 0; this.mazeTiltY = 0;
          tiltBtn.textContent = 'Try tilt — 10x cash, unlimited lives';
          document.getElementById('heist-maze-pads').classList.remove('tilt-active');
          return;
        }
        this.requestTiltPermission((granted) => {
          if (this.phase !== 'maze' || !granted) {
            tiltBtn.textContent = "Tilt didn't respond — using arrows";
            setTimeout(() => { tiltBtn.textContent = 'Try tilt — 10x cash, unlimited lives'; }, 2000);
            return;
          }
          this._mazeOrientBase = null;
          this._mazeGotOrientEvent = false;
          this.mazeUseTilt = true;
          this.mazeTiltX = 0; this.mazeTiltY = 0;
          tiltBtn.textContent = 'Checking for signal…';
          // Some browsers grant permission but the sensor still never
          // actually reports (common over plain http) -- verify a real
          // event shows up before committing, instead of trusting the
          // permission grant alone.
          setTimeout(() => {
            if (this.phase !== 'maze' || !this.mazeUseTilt) return;
            if (this._mazeGotOrientEvent) {
              tiltBtn.textContent = 'Using tilt (tap for arrows)';
              document.getElementById('heist-maze-pads').classList.add('tilt-active');
            } else {
              this.mazeUseTilt = false;
              tiltBtn.textContent = 'No signal — using arrows';
              setTimeout(() => { tiltBtn.textContent = 'Try tilt — 10x cash, unlimited lives'; }, 2000);
            }
          }, 700);
        });
      };
    }
  }

  // iOS 13+ gates DeviceOrientationEvent behind an explicit permission
  // request that MUST be called synchronously from a user gesture — this is
  // called directly from the tilt button's click handler.
  requestTiltPermission(onDone) {
    const DOE = window.DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === 'function') {
      DOE.requestPermission().then(state => onDone(state === 'granted')).catch(() => onDone(false));
    } else if (typeof DOE !== 'undefined') {
      onDone(true); // Android and older Safari: no permission gate at all
    } else {
      onDone(false); // no device orientation support on this device/browser
    }
  }

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width = rect.width || window.innerWidth;
    this.canvas.height = rect.height || window.innerHeight;
  }

  bindInput() {
    if (this._bound) return;
    this._bound = true;

    const press = (x, y) => {
      if (this.input.down) return;
      this.input.down = true;
      this.input.tapX = x;
      this.input.tapY = y;
      if (this.input.onDown) this.input.onDown(x, y);
    };
    const release = () => {
      if (!this.input.down) return;
      this.input.down = false;
      if (this.input.onUp) this.input.onUp();
    };

    this.canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const r = this.canvas.getBoundingClientRect();
      press(e.clientX - r.left, e.clientY - r.top);
    });
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);

    document.addEventListener('keydown', (e) => {
      if (!this.isActiveScreen()) return;
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        if (!e.repeat) press(this.canvas.width / 2, this.canvas.height / 2);
      } else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        e.preventDefault();
        if (this.mech && this.mech.laneUp) this.mech.laneUp();
      } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        e.preventDefault();
        if (this.mech && this.mech.laneDown) this.mech.laneDown();
      }
    });
    document.addEventListener('keyup', (e) => {
      if (e.code === 'Space' || e.key === ' ') release();
    });
  }

  isActiveScreen() {
    const el = document.getElementById('heist-game');
    return el && el.classList.contains('active');
  }

  stopLoop() {
    if (this._af) { cancelAnimationFrame(this._af); this._af = null; }
    this.input.onDown = null;
    this.input.onUp = null;
    this.input.down = false;
  }

  showOverlay(id) {
    document.querySelectorAll('#heist-game .heist-overlay').forEach(el => el.classList.add('hidden'));
    const el = document.getElementById(id);
    if (el) el.classList.remove('hidden');
  }

  hideOverlays() {
    document.querySelectorAll('#heist-game .heist-overlay').forEach(el => el.classList.add('hidden'));
  }

  showHud(title, hint, meta) {
    const hud = document.getElementById('heist-hud');
    hud.classList.remove('hidden');
    document.getElementById('heist-hud-title').textContent = title || '';
    document.getElementById('heist-hud-hint').textContent = hint || '';
    document.getElementById('heist-hud-meta').textContent = meta || '';
  }

  setHudHint(hint, meta) {
    document.getElementById('heist-hud-hint').textContent = hint || '';
    if (meta !== undefined) document.getElementById('heist-hud-meta').textContent = meta;
  }

  hideHud() {
    document.getElementById('heist-hud').classList.add('hidden');
  }

  // ------------------------------------------------
  // PHASE 0a — WAREHOUSE INTRO
  // ------------------------------------------------

  showIntro() {
    this.phase = 'intro';
    this.stopLoop();
    this.hideHud();
    this.ambientLoop();
    this.showOverlay('heist-intro');
    document.getElementById('heist-intro-continue').onclick = () => {
      if (this.phase !== 'intro') return;
      this.showRoleAssign();
    };
  }

  // Slow flicker on the hanging bulb so the hideout doesn't read as a static
  // image behind the planning overlays.
  ambientLoop() {
    this._frame++;
    this.drawWarehouse();
    this._af = requestAnimationFrame(() => this.ambientLoop());
  }

  // ------------------------------------------------
  // PHASE 0b — ROLE ASSIGNMENT
  // ------------------------------------------------

  showRoleAssign() {
    this.phase = 'roles';
    this.showOverlay('heist-roles');
    this.openRoleId = null;
    this.assign = { distractionA: null, distractionB: null, lookout: null };
    this.renderRoleUI();

    document.getElementById('heist-roles-confirm').onclick = () => {
      if (this.phase !== 'roles') return;
      if (!this.assignmentComplete()) return;
      this.startFloor();
    };
  }

  assignmentComplete() {
    return HEIST_ROLES.every(r => this.assign[r.id]);
  }

  assignedRoleOf(crewId) {
    return HEIST_ROLES.find(r => this.assign[r.id] === crewId) || null;
  }

  renderRoleUI() {
    const roleRow = document.getElementById('heist-role-row');
    roleRow.innerHTML = '';

    // The player's own fixed role, shown but not assignable.
    const thief = document.createElement('div');
    thief.className = 'heist-role-slot heist-role-fixed';
    thief.innerHTML = `
      <div class="heist-role-name">Thief</div>
      <div class="heist-role-sub">Cracks the register. This one is you.</div>
      <div class="heist-role-filled">${this.gameState.playerName || 'You'}</div>`;
    roleRow.appendChild(thief);

    HEIST_ROLES.forEach(r => {
      const occupant = this.assign[r.id] ? getHeistCrew(this.assign[r.id]) : null;
      const wrap = document.createElement('div');
      wrap.className = 'heist-role-slot';
      if (occupant) wrap.classList.add('filled');

      const btn = document.createElement('button');
      btn.className = 'heist-role-btn';
      btn.innerHTML = `
        <div class="heist-role-name">${r.name}</div>
        <div class="heist-role-sub">${r.sub}</div>
        <div class="heist-role-filled" style="${occupant ? `color:${occupant.color}` : ''}">
          ${occupant ? occupant.name : 'Tap to assign'}
        </div>`;
      btn.onclick = () => {
        if (occupant) {
          // Tap a filled job again to clear it back out.
          this.assign[r.id] = null;
          this.openRoleId = null;
          this.renderRoleUI();
          return;
        }
        this.openRoleId = this.openRoleId === r.id ? null : r.id;
        this.renderRoleUI();
      };
      wrap.appendChild(btn);

      if (this.openRoleId === r.id) {
        const picker = document.createElement('div');
        picker.className = 'heist-crew-picker';
        const available = HEIST_CREW.filter(c => !this.assignedRoleOf(c.id));
        if (available.length === 0) {
          picker.innerHTML = `<div class="heist-crew-picker-empty">Everyone already has a job — clear one first.</div>`;
        } else {
          available.forEach(c => {
            const opt = document.createElement('button');
            opt.className = 'heist-crew-option';
            opt.style.borderColor = c.color;
            opt.innerHTML = `
              <div class="heist-crew-option-name" style="color:${c.color}">${c.name}</div>
              <div class="heist-crew-option-origin">${c.origin}</div>
              <div class="heist-crew-option-verb">Plays on: ${c.verb}</div>`;
            opt.onclick = (ev) => {
              ev.stopPropagation();
              this.assign[r.id] = c.id;
              this.openRoleId = null;
              this.renderRoleUI();
            };
            picker.appendChild(opt);
          });
        }
        wrap.appendChild(picker);
      }

      roleRow.appendChild(wrap);
    });

    const hint = document.getElementById('heist-roles-hint');
    const complete = this.assignmentComplete();
    if (complete) {
      hint.textContent = 'Everyone has a job. Who you put where changes how their part of the job actually plays.';
    } else if (this.openRoleId) {
      hint.textContent = 'Pick who fills this job.';
    } else {
      hint.textContent = 'Tap an open job to fill it. Tap a filled job to clear it.';
    }
    document.getElementById('heist-roles-confirm').classList.toggle('hidden', !complete);
  }

  // ------------------------------------------------
  // PHASE 1 — THE FLOOR
  //
  // An overhead view of the store. You switch between whichever crew are
  // actually inside (the Thief, plus whoever got assigned to Distraction A/B
  // — the Lookout stays outside with the car) and click to send the active
  // one walking. Guards patrol with a real cone of vision; walk into one and
  // your heat climbs. A distractor who overheats gets pulled off the floor —
  // the job goes on without them. If YOUR heat (the Thief) maxes out, the
  // job ends early, caught, before you ever reach the register.
  //
  // Each Eric's hotspots share the same five store zones, but what happens
  // when they arrive — and what it does to nearby guards — is a different
  // verb per Eric, not just different flavor text:
  //   Tony   — loud. Every guard near the hotspot snaps toward it, hard and
  //            short. Big, brief window, several guards at once.
  //   Ruhul  — charm. Only the nearest guard drifts over, but stays pulled
  //            much longer. Narrower, but you can plan around it.
  //   Dmitri — the stall. Doesn't lure anyone toward him at all — freezes
  //            the nearest guard's cone wherever it already happens to be
  //            pointing, for a long time. Useful for locking down a guard
  //            that's already looking somewhere safe.
  // ------------------------------------------------

  // Real counters on the outer edges now, not point-markers floating in
  // open floor -- see the rebuilt startFloor() for why. Coordinates are in
  // the store's actual (much bigger) world space.
  floorZones() {
    return [
      { id: 'deli',     name: 'Deli Counter',    x: 68,  y: 18,  edge: 'top' },
      { id: 'fish',     name: 'Fish Counter',    x: 172, y: 18,  edge: 'top' },
      { id: 'produce',  name: 'Produce Section', x: 68,  y: 132, edge: 'bottom' },
      { id: 'frozen',   name: 'Frozen Aisle',    x: 172, y: 132, edge: 'bottom' },
      { id: 'checkout', name: 'Self-Checkout',   x: 226, y: 40,  edge: 'right' },
    ];
  }

  // Narrator-voice notes on what each Eric actually does at each zone. Real
  // quoted lines are the author's — anything not supplied stays a bracketed
  // placeholder, same rule as everywhere else in this file.
  floorFlavor(crewId, zoneId) {
    const lines = {
      tony: {
        deli: 'How does a deli run out of prosciutto?',
        fish: 'I need calamari. For my mother.',
        produce: 'This lettuce? This is an insult. Somebody get me the manager.',
        frozen: "Where's the good ice cream? Not this. The GOOD ice cream.",
        checkout: "This thing wants me to scan my own bananas? I didn't go to school for this.",
      },
      ruhul: {
        deli: 'He asks the guy behind the counter a genuinely good question about the pastrami, and just keeps asking follow-ups.',
        fish: 'Ruhul strikes up a conversation about wholesale pricing the guy behind the counter did not expect to enjoy this much.',
        produce: "He's helping a total stranger pick a ripe avocado like it's the most important decision either of them will make today.",
        frozen: "Ruhul's deep in a genuinely useful conversation about which freezer brand doesn't die after two years.",
        checkout: 'He talks the self-checkout attendant through a coupon situation so complicated it becomes personal for both of them.',
      },
      dmitri: {
        deli: 'Dmitri stands very still near the deli counter. Somehow this is enough.',
        fish: 'He studies the fish like it owes him money. The nearby guard forgets to move.',
        produce: 'Dmitri picks up an apple, looks at it for what feels like a geological era, puts it back.',
        frozen: "He's just standing in front of the freezer case. Not buying. Not leaving.",
        checkout: "Dmitri is \"having trouble\" with the self-checkout in a way that never actually resolves.",
      },
    };
    return lines[crewId][zoneId];
  }

  // A real store now, not an open square: direct feedback was "it isn't
  // fun, there's no real stakes... you can walk directly through the
  // middle. There should be rows of groceries like a grocery store...
  // I need the scale to be bigger." Six aisle shelves run nearly the full
  // height, leaving only a cross-aisle at the very top and another at the
  // very bottom to get from one side of the store to the other -- exactly
  // where the patrols live, so going around isn't a free pass, it's the
  // guarded route. World is 240x150 (vs. the old single-screen 100x100),
  // camera follows whoever you're controlling.
  floorAisleLayout() {
    const cols = [40, 76, 112, 148, 184, 214];
    const shelfTop = 35, shelfBottom = 115;
    const shelves = cols.map(x => ({ x: x - 4.5, y: shelfTop, w: 9, h: shelfBottom - shelfTop }));
    return { shelves, cols, shelfTop, shelfBottom, worldW: 240, worldH: 150 };
  }

  startFloor() {
    this.stopLoop();
    this.hideOverlays();
    this.hideHud();
    this.phase = 'floor';

    const layout = this.floorAisleLayout();
    this.floorShelves = layout.shelves;
    this.floorWorldW = layout.worldW;
    this.floorWorldH = layout.worldH;

    const distractors = HEIST_ROLES.filter(r => r.id !== 'lookout')
      .map(r => getHeistCrew(this.assign[r.id]));

    // Everyone present starts at the entrance -- the open left margin
    // before the first shelf, not inside the aisle block itself.
    const entX = 12, entY = 75;
    this.floorChars = [
      { id: 'thief', name: this.gameState.playerName || 'You', color: '#d4a574',
        x: entX, y: entY, tx: entX, ty: entY, speed: 0.62, heat: 0, pulled: false, isThief: true },
      ...distractors.map((c, i) => ({
        id: c.id, name: c.name, color: c.color, crew: c,
        x: entX, y: entY + (i === 0 ? -8 : 8), tx: entX, ty: entY + (i === 0 ? -8 : 8),
        speed: c.id === 'tony' ? 0.74 : c.id === 'dmitri' ? 0.5 : 0.62,
        heat: 0, pulled: false, isThief: false,
      })),
    ];
    this.floorActiveId = 'thief';
    this.floorCamX = entX; this.floorCamY = entY;

    // Each distractor gets one hotspot per counter, offset slightly so two
    // colors at the "same" counter don't sit on top of each other.
    this.floorHotspots = [];
    distractors.forEach((c, i) => {
      const jitter = i === 0 ? -4 : 4;
      this.floorZones().forEach(z => {
        this.floorHotspots.push({
          crewId: c.id, color: c.color, zoneId: z.id, zoneName: z.name,
          x: z.x + jitter, y: z.y,
          triggered: false,
        });
      });
    });

    // The open right margin, past the last shelf column -- the mirror of
    // the entrance on the other side of the whole aisle block.
    this.floorRegister = { x: layout.worldW - 12, y: 75, r: 9 };

    // Fixed posts, each sweeping its own cone on its own clock so they
    // don't all turn in sync. axis 'y' walks a fixed X up/down between
    // min/max; axis 'x' walks a fixed Y left/right between min/max.
    // facing is the cone direction while on patrol (kept fixed rather
    // than tied to walk direction, so it reads as "watching a lane"
    // rather than just looking where they're going).
    const makeGuard = ({ axis, fixed, min, max, speed, facing, range, halfAngle, dir }) => {
      const x = axis === 'y' ? fixed : min, y = axis === 'y' ? min : fixed;
      return {
        x, y, patrolAxis: axis, patrolMin: min, patrolMax: max, patrolDir: dir || 1,
        speed, facing, angle: facing, range: range || 26, halfAngle: halfAngle || 0.55,
        state: 'patrol', targetX: 0, targetY: 0, pauseTimer: 0, runSpeed: 0,
        homeX: x, homeY: y, frozen: false, freezeTimer: 0,
      };
    };

    // Eight now: two walking the top cross-aisle (facing down into the
    // shelves), two walking the bottom cross-aisle (facing up into them)
    // -- the two chokepoints any full crossing has to use -- plus two
    // patrolling specific aisle lanes between shelf columns (so ducking
    // into just any aisle isn't automatically safe either), plus two
    // more working the open side margins near the entrance and register.
    this.floorGuards = [
      makeGuard({ axis: 'x', fixed: 22, min: 20, max: 220, speed: 0.36, facing: Math.PI / 2 }),
      makeGuard({ axis: 'x', fixed: 26, min: 20, max: 220, speed: 0.34, facing: Math.PI / 2, dir: -1 }),
      makeGuard({ axis: 'x', fixed: 124, min: 20, max: 220, speed: 0.36, facing: -Math.PI / 2 }),
      makeGuard({ axis: 'x', fixed: 128, min: 20, max: 220, speed: 0.34, facing: -Math.PI / 2, dir: -1 }),
      makeGuard({ axis: 'y', fixed: 94, min: 38, max: 112, speed: 0.3, facing: 0 }),
      makeGuard({ axis: 'y', fixed: 166, min: 38, max: 112, speed: 0.3, facing: Math.PI, dir: -1 }),
      makeGuard({ axis: 'y', fixed: 26, min: 30, max: 120, speed: 0.28, facing: Math.PI / 2 }),
      makeGuard({ axis: 'y', fixed: 226, min: 30, max: 120, speed: 0.28, facing: -Math.PI / 2, dir: -1 }),
    ];

    this.floorHeatGain = 1.15;
    this.floorHeatDecay = 0.55;

    // Purely cosmetic chaos — nothing here touches heat, guards, or cash.
    // Just the store falling apart a little in the background.
    this.floorAmbient = [];
    this.floorAmbientTimer = 150;

    this.buildFloorRosterDOM();
    document.getElementById('heist-floor-hud').classList.remove('hidden');
    document.getElementById('heist-floor-hint').textContent =
      'Tap a crew icon above to take control of them, then tap the floor to send them there. Shelves block sightlines -- duck behind one.';

    this.input.onDown = (x, y) => this.floorClick(x, y);
    this.input.onUp = null;

    this.floorLoop();
  }

  buildFloorRosterDOM() {
    const row = document.getElementById('heist-floor-roster');
    row.innerHTML = '';
    this.floorChars.forEach(ch => {
      const chip = document.createElement('div');
      chip.className = 'heist-floor-chip';
      chip.id = `heist-chip-${ch.id}`;
      chip.innerHTML = `
        <div class="heist-floor-chip-dot" style="background:${ch.color}"></div>
        <div class="heist-floor-chip-name">${ch.isThief ? 'You' : ch.name}</div>
        <div class="heist-floor-chip-heat"><div class="heist-floor-chip-heat-fill" id="heist-chip-heat-${ch.id}"></div></div>
      `;
      chip.onclick = () => {
        if (this.phase !== 'floor') return;
        const c = this.floorChars.find(x => x.id === ch.id);
        if (!c || c.pulled) return;
        this.floorActiveId = ch.id;
        this.updateFloorRosterDOM();
      };
      row.appendChild(chip);
    });
    this.updateFloorRosterDOM();
  }

  updateFloorRosterDOM() {
    this.floorChars.forEach(ch => {
      const chip = document.getElementById(`heist-chip-${ch.id}`);
      if (!chip) return;
      chip.classList.toggle('active', ch.id === this.floorActiveId);
      chip.classList.toggle('pulled', ch.pulled);
      const fill = document.getElementById(`heist-chip-heat-${ch.id}`);
      if (fill) {
        fill.style.width = `${Math.round(ch.heat)}%`;
        fill.style.background = ch.heat > 75 ? '#e74c3c' : ch.heat > 40 ? '#f39c12' : '#2ecc71';
      }
    });
    const active = this.floorChars.find(c => c.id === this.floorActiveId);
    const label = document.getElementById('heist-floor-controlling');
    if (label && active) {
      label.textContent = `Controlling: ${active.isThief ? 'You (the Thief)' : active.name}`;
      label.style.color = active.color;
    }
  }

  floorToast(text, ms) {
    const el = document.getElementById('heist-floor-toast');
    el.textContent = text;
    el.classList.remove('hidden');
    clearTimeout(this._floorToastTimer);
    this._floorToastTimer = setTimeout(() => el.classList.add('hidden'), ms || 2200);
  }

  floorBounds() {
    // Found while auditing the floor phase: every position, speed, and
    // guard "range" here is a single number used identically for both x
    // and y in a 0-100 logical grid -- Math.hypot(dx, dy) straight up,
    // same units on both axes. That's only correct if the rendered rect
    // is actually square. It wasn't (independent 0.88*W / 0.76*H
    // fractions), which on any real (non-square) phone screen means a
    // guard's vision cone is drawn as a circle sized off the WIDTH scale
    // alone, while the real hit-test -- measuring raw logical-unit
    // distance -- reaches further in whichever axis has the larger
    // pixels-per-unit ratio. Concretely: on a tall phone, the true
    // detection range extends well below/above the visible cone, so you
    // can get "seen" while standing outside it, or stand inside the
    // drawn cone and not be seen. Same class of bug the maze board hit
    // before it was forced square; same fix here.
    const W = this.canvas.width, H = this.canvas.height;
    const availW = W * 0.88, availH = H * 0.76;
    const side = Math.min(availW, availH);
    return { x: (W - side) / 2, y: H * 0.16 + (availH - side) / 2, w: side, h: side };
  }

  floorClick(px, py) {
    if (this.phase !== 'floor') return;

    // Screen tap -> world coordinates, through the camera window (the
    // store is bigger than one screen now, same pattern as the maze).
    const b = this.floorBounds();
    const view = this.floorCamView;
    const camMinX = this.floorCamX - view / 2, camMinY = this.floorCamY - view / 2;
    const x = camMinX + ((px - b.x) / b.w) * view;
    const y = camMinY + ((py - b.y) / b.h) * view;
    if (x < -10 || x > this.floorWorldW + 10 || y < -10 || y > this.floorWorldH + 10) return;

    // Tapping directly on a character's dot on the floor selects them --
    // just as valid as tapping their chip in the roster above.
    const tapped = this.floorChars.find(c => !c.pulled && Math.hypot(c.x - x, c.y - y) < 7);
    if (tapped) {
      this.floorActiveId = tapped.id;
      this.updateFloorRosterDOM();
      return;
    }

    const active = this.floorChars.find(c => c.id === this.floorActiveId);
    if (!active || active.pulled) return;

    // Hit-test the active character's own, untriggered hotspots first.
    if (!active.isThief) {
      const spot = this.floorHotspots.find(h =>
        h.crewId === active.id && !h.triggered && Math.hypot(h.x - x, h.y - y) < 6);
      if (spot) {
        active.tx = spot.x; active.ty = spot.y; active.pendingHotspot = spot;
        return;
      }
    }
    active.tx = Math.max(2, Math.min(this.floorWorldW - 2, x));
    active.ty = Math.max(2, Math.min(this.floorWorldH - 2, y));
    active.pendingHotspot = null;
  }

  triggerHotspot(char, spot) {
    spot.triggered = true;
    char.pendingHotspot = null;
    const flavor = this.floorFlavor(char.id, spot.zoneId);
    this.floorToast(`${char.name} — ${spot.zoneName}: ${flavor}`, 3200);

    const nearGuards = this.floorGuards
      .map(g => ({ g, d: Math.hypot(g.x - spot.x, g.y - spot.y) }))
      .sort((a, b) => a.d - b.d);

    // Physically send a guard to investigate: they run over, stop and look
    // around for a few seconds, then walk back to wherever their patrol got
    // interrupted. Already-frozen guards (Dmitri's doing) don't get pulled.
    const sendToInvestigate = (g, pauseFrames) => {
      if (g.frozen) return;
      g.homeX = g.x; g.homeY = g.y;
      g.state = 'investigate';
      g.targetX = spot.x; g.targetY = spot.y;
      g.runSpeed = g.speed * 2.6;
      g.pauseTimer = pauseFrames;
    };

    // Reach thresholds scaled up for the bigger store (was a 100x100
    // space, now 240x150 -- roughly 2x the diagonal) so a distraction can
    // still actually pull a guard from a realistic patrol distance
    // instead of only the one standing right on top of it.
    if (char.id === 'tony') {
      // Loud: everyone within range runs over, hard and short.
      nearGuards.filter(({ d }) => d < 90).forEach(({ g }) => sendToInvestigate(g, 90));
      this.cash += 70;
    } else if (char.id === 'ruhul') {
      // Charm: just the nearest one, but they stick around much longer.
      if (nearGuards[0] && nearGuards[0].d < 115) sendToInvestigate(nearGuards[0].g, 260);
      this.cash += 85;
    } else {
      // The stall: doesn't lure anyone anywhere. Freezes the nearest guard
      // in place, wherever they currently are — they just stop walking.
      if (nearGuards[0] && nearGuards[0].d < 105) {
        const g = nearGuards[0].g;
        g.frozen = true;
        g.freezeTimer = 320;
      }
      this.cash += 65;
    }
  }

  spawnAmbient() {
    const zones = this.floorZones();
    const z = zones[Math.floor(Math.random() * zones.length)];
    const type = Math.random() < 0.55 ? 'tomato' : 'carts';
    this.floorAmbient.push({
      type,
      x: z.x + (Math.random() - 0.5) * 14,
      y: z.y + (Math.random() - 0.5) * 14,
      rollX: (Math.random() - 0.5) * 18,
      rollY: (Math.random() - 0.5) * 18,
      t: 0,
      duration: type === 'tomato' ? 110 : 170,
    });
    this.floorAmbientTimer = 260 + Math.random() * 260;
  }

  updateAmbient() {
    this.floorAmbientTimer--;
    if (this.floorAmbientTimer <= 0) this.spawnAmbient();
    this.floorAmbient.forEach(a => a.t++);
    this.floorAmbient = this.floorAmbient.filter(a => a.t < a.duration);
  }

  // Position-only push-out of a shelf rectangle -- characters here move
  // straight toward a target each frame rather than carrying velocity, so
  // the maze's velocity-aware resolveWallCollision doesn't apply as-is.
  floorPushOffShelves(entity, r) {
    this.floorShelves.forEach(w => {
      const closestX = Math.max(w.x, Math.min(entity.x, w.x + w.w));
      const closestY = Math.max(w.y, Math.min(entity.y, w.y + w.h));
      const dx = entity.x - closestX, dy = entity.y - closestY;
      const dist = Math.hypot(dx, dy);
      if (dist >= r || dist < 0.0001) return;
      const push = r - dist;
      entity.x += (dx / dist) * push;
      entity.y += (dy / dist) * push;
    });
  }

  // Sample points along a guard-to-character sightline and check whether
  // any of them land inside a shelf -- a real line-of-sight check, cheap
  // enough at this scale. Ducking down an aisle actually breaks sight now,
  // not just distance/angle math with nothing physical in the way.
  floorSightBlocked(x1, y1, x2, y2) {
    const steps = 10;
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const px = x1 + (x2 - x1) * t, py = y1 + (y2 - y1) * t;
      if (this.floorShelves.some(w => px > w.x && px < w.x + w.w && py > w.y && py < w.y + w.h)) return true;
    }
    return false;
  }

  floorLoop() {
    if (this.phase !== 'floor') return;
    this._frame++;
    this.updateAmbient();

    // Move every present, un-pulled character toward its own target, then
    // push back out of any shelf it walked into -- the shelves are real
    // obstacles now, not decoration.
    this.floorChars.forEach(ch => {
      if (ch.pulled) return;
      const dx = ch.tx - ch.x, dy = ch.ty - ch.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 0.4) {
        ch.x += (dx / dist) * Math.min(ch.speed, dist);
        ch.y += (dy / dist) * Math.min(ch.speed, dist);
      } else if (ch.pendingHotspot && !ch.pendingHotspot.triggered) {
        this.triggerHotspot(ch, ch.pendingHotspot);
      }
      this.floorPushOffShelves(ch, 2.2);
    });

    // Camera follows whoever's actually being directed right now.
    {
      const active = this.floorChars.find(c => c.id === this.floorActiveId) || this.floorChars[0];
      const view = this.floorCamView;
      this.floorCamX = Math.max(view / 2, Math.min(this.floorWorldW - view / 2, active.x));
      this.floorCamY = Math.max(view / 2, Math.min(this.floorWorldH - view / 2, active.y));
    }

    // Guards actually walk now, not just stand and swivel:
    //   patrol      — walking their route, facing into the store.
    //   investigate — running toward a triggered hotspot.
    //   pause       — stopped there for a few seconds, looking around.
    //   return      — walking back to wherever they were interrupted.
    // Frozen (Dmitri's stall) skips all of it — they don't move at all.
    this.floorGuards.forEach(g => {
      if (g.frozen) {
        g.freezeTimer--;
        if (g.freezeTimer <= 0) g.frozen = false;
        return;
      }

      if (g.state === 'patrol') {
        // Cone used to snap to one fixed absolute direction (g.facing)
        // for the entire patrol regardless of which way the guard was
        // actually walking -- direct feedback: "the people don't even
        // change their vision cone when they turn, so they look like
        // they're walking backwards." Faces direction of travel now,
        // like someone actually watching where they're going, plus a
        // slow glance sweep so a long straightaway doesn't read as a
        // guard staring dead ahead the whole patrol. Bonus: a cone that
        // never moved during patrol also never gave a real "time it for
        // when they glance away" stealth window -- this does now.
        const travelAngle = g.patrolAxis === 'y'
          ? (g.patrolDir > 0 ? Math.PI / 2 : -Math.PI / 2)
          : (g.patrolDir > 0 ? 0 : Math.PI);
        if (g.sweepSeed == null) g.sweepSeed = Math.random() * Math.PI * 2;
        g.angle = travelAngle + Math.sin(this._frame * 0.025 + g.sweepSeed) * 0.5;
        if (g.patrolAxis === 'y') {
          g.y += g.speed * g.patrolDir;
          if (g.y >= g.patrolMax) { g.y = g.patrolMax; g.patrolDir = -1; }
          if (g.y <= g.patrolMin) { g.y = g.patrolMin; g.patrolDir = 1; }
        } else {
          g.x += g.speed * g.patrolDir;
          if (g.x >= g.patrolMax) { g.x = g.patrolMax; g.patrolDir = -1; }
          if (g.x <= g.patrolMin) { g.x = g.patrolMin; g.patrolDir = 1; }
        }
      } else if (g.state === 'investigate') {
        const dx = g.targetX - g.x, dy = g.targetY - g.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 1.2) {
          g.angle = Math.atan2(dy, dx);
          g.x += (dx / dist) * g.runSpeed;
          g.y += (dy / dist) * g.runSpeed;
        } else {
          g.state = 'pause';
          g.pauseBaseAngle = g.angle; // sweep around this while paused, not just hold it
        }
      } else if (g.state === 'pause') {
        // Actually look around instead of freezing at whatever direction
        // it happened to be running when it arrived -- the comment above
        // already claimed this, the code just never did it.
        g.angle = g.pauseBaseAngle + Math.sin(this._frame * 0.07) * 0.7;
        g.pauseTimer--;
        if (g.pauseTimer <= 0) g.state = 'return';
      } else if (g.state === 'return') {
        const dx = g.homeX - g.x, dy = g.homeY - g.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 1.2) {
          g.angle = Math.atan2(dy, dx);
          g.x += (dx / dist) * g.speed;
          g.y += (dy / dist) * g.speed;
        } else {
          g.state = 'patrol';
        }
      }
      // Guards mostly patrol bands/lanes that don't cross a shelf, but an
      // investigate/return beeline toward an arbitrary hotspot could --
      // push back out rather than let a guard visibly clip through solid
      // shelving.
      this.floorPushOffShelves(g, 2.5);
    });

    // Heat: anyone (present, un-pulled) inside any guard's cone AND with an
    // actual clear sightline heats up; otherwise cools down. Ducking
    // behind a shelf really does break line of sight now.
    this.floorChars.forEach(ch => {
      if (ch.pulled) return;
      const seen = this.floorGuards.some(g => {
        if (g.frozen) return false; // a frozen cone isn't watching anything new
        const dx = ch.x - g.x, dy = ch.y - g.y;
        const dist = Math.hypot(dx, dy);
        if (dist > g.range) return false;
        const a = Math.atan2(dy, dx);
        let diff = a - g.angle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        if (Math.abs(diff) >= g.halfAngle) return false;
        return !this.floorSightBlocked(g.x, g.y, ch.x, ch.y);
      });
      ch.heat = Math.max(0, Math.min(100, ch.heat + (seen ? this.floorHeatGain : -this.floorHeatDecay)));

      if (!ch.isThief && ch.heat >= 100 && !ch.pulled) {
        ch.pulled = true;
        if (this.floorActiveId === ch.id) this.floorActiveId = 'thief';
        this.floorToast(`${ch.name} got made. Security walks them out — the floor goes on without them.`, 2800);
      }
    });

    const thief = this.floorChars.find(c => c.isThief);
    if (thief.heat >= 100) {
      this.updateFloorRosterDOM();
      this.drawFloorScene();
      this.floorCaught();
      return;
    }

    if (Math.hypot(thief.x - this.floorRegister.x, thief.y - this.floorRegister.y) < this.floorRegister.r) {
      this.updateFloorRosterDOM();
      this.drawFloorScene();
      this.floorSuccess();
      return;
    }

    this.updateFloorRosterDOM();
    this.drawFloorScene();
    this._af = requestAnimationFrame(() => this.floorLoop());
  }

  floorCaught() {
    this.stopLoop();
    document.getElementById('heist-floor-hud').classList.add('hidden');
    document.getElementById('heist-floor-toast').classList.add('hidden');
    this.phase = 'floor-caught';
    this.caughtEarly = true;

    this.showResult({
      title: 'Made you',
      who: null,
      lines: [
        'Someone puts a hand on your shoulder before you ever reach the drawer.',
        'You never got the register open. Whatever the Erics pulled in is the whole take.',
      ],
      stats: [['Take so far', `$${this.cash}`]],
      buttonLabel: 'Out the door — fast',
      onContinue: () => this.startGetaway(),
    });
  }

  floorSuccess() {
    this.stopLoop();
    document.getElementById('heist-floor-hud').classList.add('hidden');
    document.getElementById('heist-floor-toast').classList.add('hidden');
    this.startRegister();
  }

  // ------------------------------------------------
  // FLOOR RENDERING
  // ------------------------------------------------

  drawFloorScene() {
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    const b = this.floorBounds();

    ctx.fillStyle = '#0e1416';
    ctx.fillRect(0, 0, W, H);

    // Camera-relative projection -- the store is much bigger than the
    // viewport now, same pattern as the maze's scrolling camera.
    const view = this.floorCamView;
    const camMinX = this.floorCamX - view / 2, camMinY = this.floorCamY - view / 2;
    const toPx = (x, y) => [b.x + ((x - camMinX) / view) * b.w, b.y + ((y - camMinY) / view) * b.h];
    const toPxLen = (v) => (v / view) * b.w;
    const margin = 8;
    const visible = (x, y) => x > camMinX - margin && x < camMinX + view + margin && y > camMinY - margin && y < camMinY + view + margin;

    ctx.save();
    ctx.beginPath(); ctx.rect(b.x, b.y, b.w, b.h); ctx.clip();
    ctx.fillStyle = '#1c2528';
    ctx.fillRect(b.x, b.y, b.w, b.h);

    // Shelves -- the actual store structure. Real obstacles: block
    // movement AND sightlines, so ducking down an aisle is a genuine move.
    this.floorShelves.forEach(s => {
      if (!visible(s.x + s.w / 2, s.y + s.h / 2)) return;
      const [sx, sy] = toPx(s.x, s.y);
      const sw = toPxLen(s.w), sh = toPxLen(s.h);
      ctx.fillStyle = '#3a4a3a';
      ctx.fillRect(sx, sy, sw, sh);
      ctx.strokeStyle = '#243024'; ctx.lineWidth = 2;
      ctx.strokeRect(sx, sy, sw, sh);
      // Shelf rows -- a few horizontal ticks read as stocked shelving
      ctx.strokeStyle = 'rgba(212,165,116,0.25)'; ctx.lineWidth = 1;
      for (let ty = sy + sh * 0.16; ty < sy + sh * 0.95; ty += sh * 0.16) {
        ctx.beginPath(); ctx.moveTo(sx + 2, ty); ctx.lineTo(sx + sw - 2, ty); ctx.stroke();
      }
    });

    // Counters along the outer edges, each with a clerk standing there --
    // where a distraction actually happens now, not a point marker in
    // open floor.
    ctx.font = '12px VT323, monospace';
    ctx.textAlign = 'center';
    this.floorZones().forEach(z => {
      if (!visible(z.x, z.y)) return;
      const [zx, zy] = toPx(z.x, z.y);
      const cw = toPxLen(30), ch2 = toPxLen(10);
      ctx.fillStyle = '#8a6a3f';
      ctx.fillRect(zx - cw / 2, zy - ch2 / 2, cw, ch2);
      ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1.5;
      ctx.strokeRect(zx - cw / 2, zy - ch2 / 2, cw, ch2);
      // The clerk -- a small standing figure behind the counter
      const clerkY = z.edge === 'bottom' ? zy + ch2 * 0.9 : zy - ch2 * 0.9;
      ctx.fillStyle = 'rgba(20,16,12,0.9)';
      ctx.beginPath(); ctx.arc(zx, clerkY - 6, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(zx - 3, clerkY - 3, 6, 9);
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillText(z.name.toUpperCase(), zx, z.edge === 'bottom' ? zy + ch2 * 1.6 + 10 : zy - ch2 * 1.6 - 4);
    });

    if (visible(12, 75)) {
      const [ex, ey] = toPx(12, 75);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillText('ENTRANCE', ex, ey - 20);
    }
    if (visible(this.floorRegister.x, this.floorRegister.y)) {
      const [rx, ry] = toPx(this.floorRegister.x, this.floorRegister.y);
      const rw = toPxLen(14), rh = toPxLen(22);
      ctx.fillStyle = '#d4a574';
      ctx.fillRect(rx - rw / 2, ry - rh / 2, rw, rh);
      ctx.fillStyle = '#0e1416';
      ctx.font = '10px VT323, monospace';
      ctx.fillText('REGISTER', rx, ry + rh / 2 + 14);
    }

    // Cones, drawn before the guard bodies that own them
    this.floorGuards.forEach(g => {
      if (!visible(g.x, g.y)) return;
      const [gx, gy] = toPx(g.x, g.y);
      const rangePx = toPxLen(g.range);
      ctx.save();
      ctx.translate(gx, gy);
      ctx.rotate(g.angle);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, rangePx, -g.halfAngle, g.halfAngle);
      ctx.closePath();
      const alert = g.state === 'investigate' || g.state === 'pause';
      ctx.fillStyle = g.frozen ? 'rgba(120,120,140,0.16)' : alert ? 'rgba(231,76,60,0.22)' : 'rgba(241,196,15,0.14)';
      ctx.fill();
      ctx.restore();
    });

    this.floorHotspots.forEach(h => {
      if (!visible(h.x, h.y)) return;
      const [hx, hy] = toPx(h.x, h.y);
      ctx.beginPath();
      ctx.arc(hx, hy, 7, 0, Math.PI * 2);
      ctx.fillStyle = h.triggered ? h.color + '33' : h.color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });

    this.floorAmbient.forEach(a => { if (visible(a.x, a.y)) this.drawAmbientEvent(a, toPx); });

    this.floorGuards.forEach(g => {
      if (!visible(g.x, g.y)) return;
      const [gx, gy] = toPx(g.x, g.y);
      if (g.state === 'investigate' || g.state === 'return') {
        // Motion streak trailing behind the direction of travel — makes a
        // guard actually running to a distraction read as running.
        const back = g.angle + Math.PI;
        ctx.strokeStyle = 'rgba(138,154,172,0.5)'; ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(gx, gy);
        ctx.lineTo(gx + Math.cos(back) * 16, gy + Math.sin(back) * 16);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(gx, gy, 8, 0, Math.PI * 2);
      ctx.fillStyle = g.state === 'investigate' || g.state === 'pause' ? '#7a3a3a' : '#3a4a5a';
      ctx.fill();
      ctx.strokeStyle = g.state === 'pause' ? '#e05a4a' : '#8a9aac';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });

    // Order-of-march arrows: a colored line + arrowhead from wherever a
    // character currently is to wherever you last sent them, so it's
    // visible at a glance who's headed where even after you've switched to
    // directing someone else.
    this.floorChars.forEach(ch => {
      if (ch.pulled) return;
      const dist = Math.hypot(ch.tx - ch.x, ch.ty - ch.y);
      if (dist < 1.5) return;
      const [sx, sy] = toPx(ch.x, ch.y);
      const [ex, ey] = toPx(ch.tx, ch.ty);
      const ang = Math.atan2(ey - sy, ex - sx);
      ctx.strokeStyle = ch.color + 'aa';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 5]);
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = ch.color;
      ctx.save();
      ctx.translate(ex, ey);
      ctx.rotate(ang);
      ctx.beginPath();
      ctx.moveTo(9, 0); ctx.lineTo(-4, -6); ctx.lineTo(-4, 6);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    });

    this.floorChars.forEach(ch => {
      if (ch.pulled) return;
      const [cx, cy] = toPx(ch.x, ch.y);
      if (ch.id === this.floorActiveId) {
        ctx.beginPath();
        ctx.arc(cx, cy, 13, 0, Math.PI * 2);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(cx, cy, 9, 0, Math.PI * 2);
      ctx.fillStyle = ch.color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });

    ctx.restore();
  }

  // Purely cosmetic — a tomato that rolls off a display and squishes, or a
  // shopping-cart pile-up that materializes with a CRASH. Nothing here
  // affects heat, guards, or cash; it's just the store falling apart a bit.
  drawAmbientEvent(a, toPx) {
    const ctx = this.ctx;
    const p = a.t / a.duration;

    if (a.type === 'tomato') {
      const rollP = Math.min(1, p / 0.55);
      const x = a.x + a.rollX * rollP, y = a.y + a.rollY * rollP;
      const [px, py] = toPx(x, y);
      if (p < 0.55) {
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(a.t * 0.35);
        ctx.fillStyle = '#c0392b';
        ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#4a7c3f';
        ctx.fillRect(-1.5, -8, 3, 3);
        ctx.restore();
      } else {
        const splatP = (p - 0.55) / 0.45;
        ctx.globalAlpha = Math.max(0, 1 - splatP * 0.8);
        ctx.fillStyle = '#c0392b';
        ctx.beginPath();
        ctx.ellipse(px, py, 9 + splatP * 5, 4 + splatP * 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#8e2a20'; ctx.lineWidth = 1;
        for (let i = 0; i < 5; i++) {
          const ang = (i / 5) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px + Math.cos(ang) * (10 + splatP * 8), py + Math.sin(ang) * (5 + splatP * 4));
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
    } else {
      const [px, py] = toPx(a.x, a.y);
      const settleWobble = a.t < 20 ? Math.sin(a.t * 1.4) * (20 - a.t) * 0.15 : 0;
      ctx.save();
      ctx.translate(px, py);
      [-14, 0, 14, 7].forEach((ox, i) => {
        ctx.save();
        ctx.rotate((i % 2 === 0 ? 1 : -1) * 0.3 + settleWobble * 0.02);
        ctx.strokeStyle = '#8a9aac'; ctx.lineWidth = 2;
        ctx.strokeRect(ox - 9, -7 + (i > 2 ? 6 : 0), 18, 14);
        ctx.restore();
      });
      ctx.restore();

      const textP = p < 0.15 ? p / 0.15 : p > 0.75 ? Math.max(0, 1 - (p - 0.75) / 0.25) : 1;
      ctx.globalAlpha = textP;
      ctx.fillStyle = '#f1c40f';
      ctx.font = 'bold 16px VT323, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('CRASH', px, py - 26);
      ctx.globalAlpha = 1;
    }
  }

  showResult(cfg) {
    this.showOverlay('heist-result');
    document.getElementById('heist-result-title').textContent = cfg.title;
    const whoEl = document.getElementById('heist-result-who');
    if (cfg.who) {
      whoEl.textContent = `${cfg.who.name} — ${cfg.who.origin}`;
      whoEl.style.color = cfg.who.color;
      whoEl.classList.remove('hidden');
    } else {
      whoEl.classList.add('hidden');
    }
    const body = document.getElementById('heist-result-body');
    body.innerHTML = '';
    (cfg.lines || []).forEach(line => {
      const p = document.createElement('p');
      p.className = 'heist-result-line';
      p.textContent = line;
      body.appendChild(p);
    });
    const stats = document.getElementById('heist-result-stats');
    stats.innerHTML = '';
    (cfg.stats || []).forEach(([label, value]) => {
      const p = document.createElement('p');
      p.className = 'cannon-stat';
      p.textContent = `${label}: ${value}`;
      stats.appendChild(p);
    });
    const btn = document.getElementById('heist-result-continue');
    btn.textContent = cfg.buttonLabel || 'Continue';
    btn.onclick = () => {
      if (!cfg.onContinue) return;
      const go = cfg.onContinue;
      cfg.onContinue = null;   // guard against a double-fire from the number keys
      go();
    };
  }

  // ------------------------------------------------
  // PHASE 2 — THE REGISTER (lockpick)
  // ------------------------------------------------

  // The lock, reimagined as a labyrinth: roll a ball on two axes at once
  // through a real maze -- randomized-DFS carves a "perfect maze" (every
  // cell reachable by exactly one path, real dead ends, no loops) into a
  // grid, walls are real rectangles you physically corner around. Two
  // rounds of direct feedback shaped this version specifically:
  // "the holes should also be in the correct path... place them
  // throughout the maze so the user has to navigate them as they collect
  // the money" -- so holes are scattered randomly across EVERY cell,
  // solution path included, offset within the cell rather than dead
  // center so there's always room to thread past if you're paying
  // attention. And "make the maze 5-10 times bigger... it should be a
  // challenge" -- 10x24 = 240 cells vs. the 6x8 = 48 before (5x), with the
  // camera following the ball instead of trying to show the whole thing
  // at once. Cash ($1/$5/$10/$20/$100) is scattered the same random way,
  // so the run is really about how much you grab on the way, not just
  // reaching the end fast. The goal is a diamond.
  mazeCols = 10; mazeRows = 24; mazeCell = 15; mazeWallT = 2.2;
  mazeCamView = 80; // world units visible in the viewport at once
  floorCamView = 100; // ditto, for the store floor
  // The bridge jump-out is only offered for a window in the middle of the
  // bridge stretch -- not from the moment the chase starts. sirens is a
  // 0-1 progress fraction; the bridge is sirens < 0.5.
  jumpOutMin = 0.16; jumpOutMax = 0.34;

  mazeCellCenter(r, c) {
    const s = this.mazeCell;
    return { x: (c + 0.5) * s, y: (r + 0.5) * s };
  }

  generateMazeLayout() {
    const COLS = this.mazeCols, ROWS = this.mazeRows, CELL = this.mazeCell, T = this.mazeWallT;
    const grid = [];
    for (let r = 0; r < ROWS; r++) {
      grid.push([]);
      for (let c = 0; c < COLS; c++) grid[r].push({ N: true, S: true, E: true, W: true, visited: false });
    }
    // Randomized depth-first carve -- the standard "perfect maze" algorithm.
    const startC = Math.floor(Math.random() * COLS);
    const stack = [{ r: 0, c: startC }];
    grid[0][startC].visited = true;
    while (stack.length) {
      const { r, c } = stack[stack.length - 1];
      const opts = [];
      if (r > 0 && !grid[r - 1][c].visited) opts.push({ r: r - 1, c, dir: 'N' });
      if (r < ROWS - 1 && !grid[r + 1][c].visited) opts.push({ r: r + 1, c, dir: 'S' });
      if (c > 0 && !grid[r][c - 1].visited) opts.push({ r, c: c - 1, dir: 'W' });
      if (c < COLS - 1 && !grid[r][c + 1].visited) opts.push({ r, c: c + 1, dir: 'E' });
      if (!opts.length) { stack.pop(); continue; }
      const pick = opts[Math.floor(Math.random() * opts.length)];
      const opp = { N: 'S', S: 'N', E: 'W', W: 'E' };
      grid[r][c][pick.dir] = false;
      grid[pick.r][pick.c][opp[pick.dir]] = false;
      grid[pick.r][pick.c].visited = true;
      stack.push({ r: pick.r, c: pick.c });
    }

    const start = { r: 0, c: startC };
    const goal = { r: ROWS - 1, c: Math.floor(Math.random() * COLS) };

    // Solve it (BFS -- a perfect maze has exactly one route) so the
    // checkpoint system can track real progress along it.
    const key = (r, c) => r + ',' + c;
    const q = [start], parent = { [key(start.r, start.c)]: null };
    while (q.length) {
      const cur = q.shift();
      if (cur.r === goal.r && cur.c === goal.c) break;
      const cell = grid[cur.r][cur.c];
      const nbrs = [];
      if (!cell.N) nbrs.push({ r: cur.r - 1, c: cur.c });
      if (!cell.S) nbrs.push({ r: cur.r + 1, c: cur.c });
      if (!cell.W) nbrs.push({ r: cur.r, c: cur.c - 1 });
      if (!cell.E) nbrs.push({ r: cur.r, c: cur.c + 1 });
      nbrs.forEach(n => { if (!(key(n.r, n.c) in parent)) { parent[key(n.r, n.c)] = cur; q.push(n); } });
    }
    const path = [];
    for (let cur = goal; cur; cur = parent[key(cur.r, cur.c)]) path.unshift(cur);
    const pathSet = new Set(path.map(p => key(p.r, p.c)));

    // Walls as real rectangles -- each shared edge drawn exactly once.
    const walls = [];
    for (let c = 0; c < COLS; c++) if (grid[0][c].N) walls.push({ x: c * CELL, y: -T / 2, w: CELL, h: T });
    for (let r = 0; r < ROWS; r++) if (grid[r][0].W) walls.push({ x: -T / 2, y: r * CELL, w: T, h: CELL });
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const cell = grid[r][c];
      if (cell.E) walls.push({ x: (c + 1) * CELL - T / 2, y: r * CELL, w: T, h: CELL });
      if (cell.S) walls.push({ x: c * CELL, y: (r + 1) * CELL - T / 2, w: CELL, h: T });
    }

    // Holes AND cash, scattered randomly across every cell (path included),
    // offset within the cell instead of dead-center. Bumped up from 4.5%
    // to 6.5% per hole per cell on direct feedback ("add more holes to
    // make it slightly more difficult") -- still spaced apart so a bad
    // pair can't combine into a real blockage.
    const startKey = key(start.r, start.c), goalKey = key(goal.r, goal.c);
    const holes = [], cash = [];
    const holeCells = new Set();
    const denomTable = [
      [0.40, 1], [0.65, 5], [0.85, 10], [0.95, 20], [1.01, 100],
    ];
    const pickDenom = () => { const roll = Math.random(); return denomTable.find(d => roll < d[0])[1]; };
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const k = key(r, c);
      if (k === startKey || k === goalKey) continue;
      const p = this.mazeCellCenter(r, c);
      if (Math.random() < 0.065) {
        const maxOff = CELL * 0.24;
        const x = p.x + (Math.random() * 2 - 1) * maxOff, y = p.y + (Math.random() * 2 - 1) * maxOff;
        // Skip if this lands too close to an existing hole -- avoids an
        // unlucky pair combining into a real blockage.
        if (holes.some(h => Math.hypot(h.x - x, h.y - y) < 8)) continue;
        holes.push({ x, y, r: 1.8 + Math.random() * 0.3 });
        holeCells.add(k);
      } else if (Math.random() < 0.20) {
        cash.push({ x: p.x, y: p.y, value: pickDenom(), collected: false });
      }
    }

    // Extra obstacle types, both placed ON the solution path (a perfect
    // maze has exactly one route through a given cell, so there's no way
    // to dodge around either by taking a different corridor -- you have
    // to actually deal with them). The jump-gap/ramp mechanic that used to
    // be here got pulled entirely -- direct feedback was that the
    // placements never read as coherent, and rather than keep guessing at
    // it, it's gone.
    //
    // Moving holes: patrol back and forth across their cell instead of
    // sitting still -- a timing dodge, not a fixed-position one.
    //
    // Fire gates: a real vertical barrier, not a circle -- posts on both
    // sides, filled with flame and impassable while closed, open and
    // empty between posts the rest of the cycle. You watch the rhythm and
    // time a roll through instead of solving it once and being done.
    const usedCells = new Set([startKey, goalKey, ...holeCells]);
    const pathInterior = path.slice(6, path.length - 6); // keep these off the immediate start/goal cells

    const movingHoles = [];
    for (let tries = 0; movingHoles.length < 8 && tries < 400 && pathInterior.length; tries++) {
      const cell = pathInterior[Math.floor(Math.random() * pathInterior.length)];
      const k = key(cell.r, cell.c);
      if (usedCells.has(k)) continue;
      usedCells.add(k);
      const p = this.mazeCellCenter(cell.r, cell.c);
      const axis = Math.random() < 0.5 ? 'x' : 'y';
      movingHoles.push({
        baseX: p.x, baseY: p.y, x: p.x, y: p.y, r: 1.9,
        axis, amp: CELL * 0.24, speed: 0.02 + Math.random() * 0.02, phase: Math.random() * Math.PI * 2,
      });
    }

    const gates = [];
    for (let tries = 0; gates.length < 4 && tries < 400 && pathInterior.length; tries++) {
      const cell = pathInterior[Math.floor(Math.random() * pathInterior.length)];
      const k = key(cell.r, cell.c);
      if (usedCells.has(k)) continue;
      usedCells.add(k);
      const p = this.mazeCellCenter(cell.r, cell.c);
      const period = 130 + Math.floor(Math.random() * 60);
      const gw = CELL * 0.62, gh = CELL * 0.86;
      gates.push({
        x: p.x - gw / 2, y: p.y - gh / 2, w: gw, h: gh, period,
        openFrac: 0.4, phase: Math.floor(Math.random() * period), active: true,
      });
    }

    const startP = this.mazeCellCenter(start.r, start.c), goalP = this.mazeCellCenter(goal.r, goal.c);
    return {
      grid, walls, holes, cash, path, pathKeys: pathSet, movingHoles, gates,
      worldW: COLS * CELL, worldH: ROWS * CELL,
      start: startP, goal: { x: goalP.x, y: goalP.y, r: 4.5 },
    };
  }

  startRegister() {
    this.stopLoop();
    this.hideOverlays();
    this.phase = 'maze';
    const t = HEIST_TUNING.maze;
    const layout = this.generateMazeLayout();

    this.mazeTiltX = 0;
    this.mazeTiltY = 0;
    this.mazeUseTilt = false;
    this._mazeOrientBase = null;
    this._mazeGotOrientEvent = false;

    this.mech = {
      kind: 'maze',
      layout,
      ball: { x: layout.start.x, y: layout.start.y, vx: 0, vy: 0 },
      resets: 0,
      completed: false,
      // Falling in a hole sends you back to the furthest point on the
      // SOLUTION path you actually reached, not all the way to the start
      // -- but only a point that was actually clear when you passed it.
      // Banking a checkpoint mid-hazard would just respawn you back into
      // it forever (a real bug in an earlier pass: same coordinates,
      // instant re-death, every single retry).
      checkpoint: { x: layout.start.x, y: layout.start.y },
      maxPathIndex: 0,
      camX: layout.start.x, camY: layout.start.y,
      cashCollected: 0,
      // Real stakes: three lives, not unlimited retries against the
      // clock. Lose one every time you fall in a hole or get caught by a
      // fire gate; lose all three and the job's over right there --
      // straight to the getaway, same as running out of time.
      lives: 3,
    };

    // Distraction work buys you a little breathing room — every hotspot the
    // Erics actually triggered on the floor is worth a second before anyone
    // looks over at the counter.
    const triggeredCount = (this.floorHotspots || []).filter(h => h.triggered).length;
    const bonusSeconds = Math.min(10, triggeredCount);
    this.mech.timeLeft = (t.timeLimit + bonusSeconds) * 60;
    this.mech.bonusSeconds = bonusSeconds;

    this.input.onDown = null;
    this.input.onUp = null;
    document.getElementById('heist-maze-pads').classList.remove('hidden', 'tilt-active');
    document.getElementById('heist-maze-tilt-btn').textContent = 'Try tilt — 10x cash, unlimited lives';
    this.showHud(
      'The lock — a real maze, not a diagram',
      'Grab cash on the way to the diamond. Holes are everywhere, not just wrong turns -- watch the roll.',
      `+${bonusSeconds}s bought by the distractions`
    );
    this.mazeLoop();
  }

  resolveWallCollision(ball, r, wall) {
    const closestX = Math.max(wall.x, Math.min(ball.x, wall.x + wall.w));
    const closestY = Math.max(wall.y, Math.min(ball.y, wall.y + wall.h));
    const dx = ball.x - closestX, dy = ball.y - closestY;
    const dist = Math.hypot(dx, dy);
    if (dist >= r || dist < 0.0001) return;
    const push = r - dist, nx = dx / dist, ny = dy / dist;
    ball.x += nx * push;
    ball.y += ny * push;
    const vDotN = ball.vx * nx + ball.vy * ny;
    if (vDotN < 0) { ball.vx -= vDotN * nx; ball.vy -= vDotN * ny; }
  }

  // Distance from a point to the nearest edge of a rectangle (0 if the
  // point is inside it) -- used for the fire gates, which are a real
  // vertical barrier now instead of a circle.
  pointRectDist(px, py, r) {
    const closestX = Math.max(r.x, Math.min(px, r.x + r.w));
    const closestY = Math.max(r.y, Math.min(py, r.y + r.h));
    return Math.hypot(px - closestX, py - closestY);
  }

  // Which cell (r, c) the ball is currently in, and if that cell is on the
  // solution path, its index there -- used both for the checkpoint and (via
  // maxPathIndex) so a hole can never bank a checkpoint ahead of where the
  // ball has genuinely, safely been.
  mazeCellIndexAt(layout, x, y) {
    const s = this.mazeCell;
    const c = Math.floor(x / s), r = Math.floor(y / s);
    if (r < 0 || r >= this.mazeRows || c < 0 || c >= this.mazeCols) return -1;
    if (!layout.pathKeys.has(r + ',' + c)) return -1;
    return layout.path.findIndex(p => p.r === r && p.c === c);
  }

  mazeLoop() {
    const m = this.mech;
    if (!m || m.kind !== 'maze') return;
    const t = HEIST_TUNING.maze, ball = m.ball, layout = m.layout;
    this._frame++;

    if (!m.completed) {
      ball.vx += this.mazeTiltX * t.accel;
      ball.vy += this.mazeTiltY * t.accel;
      ball.vx *= t.friction;
      ball.vy *= t.friction;
      ball.x += ball.vx;
      ball.y += ball.vy;

      layout.walls.forEach(w => this.resolveWallCollision(ball, t.ballRadius, w));

      // Moving holes patrol their cell; fire gates cycle open/closed on
      // their own timer -- both real-time hazards, not fixed obstacles.
      layout.movingHoles.forEach(h => {
        const off = Math.sin(this._frame * h.speed + h.phase) * h.amp;
        if (h.axis === 'x') { h.x = h.baseX + off; h.y = h.baseY; }
        else { h.x = h.baseX; h.y = h.baseY + off; }
      });
      layout.gates.forEach(g2 => {
        const t2 = (this._frame + g2.phase) % g2.period;
        g2.active = t2 > g2.period * g2.openFrac;
      });

      // Camera follows the ball -- the maze is way bigger than any one
      // screen now, clamped so it never shows past the maze's own edges.
      const view = this.mazeCamView;
      m.camX = Math.max(view / 2, Math.min(layout.worldW - view / 2, ball.x));
      m.camY = Math.max(view / 2, Math.min(layout.worldH - view / 2, ball.y));

      // Cash: collect on contact, no separate confirm -- rolling through it
      // is the whole point.
      layout.cash.forEach(c => {
        if (c.collected) return;
        if (Math.hypot(ball.x - c.x, ball.y - c.y) < t.ballRadius + 3) {
          c.collected = true;
          // Tilt pays out 10x -- a real incentive to actually use it,
          // not just a cute alternate control scheme. Direct feedback:
          // "tilt is way more fun."
          const value = this.mazeUseTilt ? c.value * 10 : c.value;
          m.cashCollected += value;
          this.cash += value;
        }
      });

      // Bank a checkpoint only on a frame where the ball is actually clear
      // of every hazard -- see the note on m.checkpoint above.
      const idx = this.mazeCellIndexAt(layout, ball.x, ball.y);
      if (idx > m.maxPathIndex) {
        const margin = 2;
        const nearHazard = layout.holes.some(h => Math.hypot(ball.x - h.x, ball.y - h.y) < h.r + t.ballRadius + margin) ||
          layout.movingHoles.some(h => Math.hypot(ball.x - h.x, ball.y - h.y) < h.r + t.ballRadius + margin) ||
          layout.gates.some(g2 => g2.active && this.pointRectDist(ball.x, ball.y, g2) < t.ballRadius + margin);
        if (!nearHazard) { m.maxPathIndex = idx; m.checkpoint = { x: ball.x, y: ball.y }; }
      }

      const inHole =
        layout.holes.find(h => Math.hypot(ball.x - h.x, ball.y - h.y) < h.r) ||
        layout.movingHoles.find(h => Math.hypot(ball.x - h.x, ball.y - h.y) < h.r) ||
        layout.gates.find(g2 => g2.active && this.pointRectDist(ball.x, ball.y, g2) < t.ballRadius);
      if (inHole) {
        m.resets++;
        // Tilt also gets unlimited lives -- falling still costs you
        // whatever cash you were carrying (real stakes stay real), it
        // just never actually ends the run.
        if (!this.mazeUseTilt) m.lives--;
        // Whatever cash you'd grabbed this run spills out right where you
        // fell -- real stakes for pushing your luck, but not gone for
        // good: it's sitting there as a pile if you make it back.
        let dropLine = '';
        if (m.cashCollected > 0) {
          const dropped = m.cashCollected;
          this.cash -= dropped;
          m.cashCollected = 0;
          layout.cash.push({ x: ball.x, y: ball.y, value: dropped, collected: false, dropped: true });
          dropLine = ` Dropped $${dropped} right there.`;
        }
        if (m.lives <= 0 && !this.mazeUseTilt) {
          // Out of chances -- the job's over right here, straight to the
          // getaway, same as running out of time.
          m.outOfLives = true;
          this.setHudHint(`Down through the floor.${dropLine} That was the last one.`, 'Out of chances.');
          this.drawMazeScene();
          this.endMaze();
          return;
        }
        ball.x = m.checkpoint.x; ball.y = m.checkpoint.y; ball.vx = 0; ball.vy = 0;
        this.setHudHint(
          this.mazeUseTilt
            ? `Down through the floor.${dropLine} Tilt mode -- unlimited lives, keep going.`
            : `Down through the floor.${dropLine} ${m.lives} ${m.lives === 1 ? 'life' : 'lives'} left.`,
          `+${m.bonusSeconds}s bought by the distractions`);
      }

      if (Math.hypot(ball.x - layout.goal.x, ball.y - layout.goal.y) < layout.goal.r) {
        m.completed = true;
        m.doneTimer = 40;
        this.setHudHint('The diamond. Worth the whole trip.', `$${m.cashCollected} grabbed along the way`);
      }

      m.timeLeft--;
      if (m.timeLeft <= 0) { m.timeLeft = 0; this.endMaze(); return; }
      document.getElementById('heist-hud-meta').textContent =
        `$${m.cashCollected} grabbed · ${(m.timeLeft / 60).toFixed(1)}s before somebody looks over`;
    } else {
      m.doneTimer--;
      if (m.doneTimer <= 0) { this.endMaze(); return; }
    }

    this.drawMazeScene();
    this._af = requestAnimationFrame(() => this.mazeLoop());
  }

  endMaze() {
    this.stopLoop();
    this.hideHud();
    document.getElementById('heist-maze-pads').classList.add('hidden');
    const m = this.mech;
    const secondsLeft = Math.max(0, m.timeLeft / 60);
    // The diamond bonus only pays out if you actually reached it; the
    // loose cash you grabbed along the way (m.cashCollected) is yours
    // either way -- it's already in this.cash from the moment you rolled
    // over it, win or lose.
    const diamondBonus = m.completed
      ? HEIST_TUNING.cashMazeComplete + Math.round(secondsLeft * HEIST_TUNING.cashPerSecondLeft)
      : 0;
    this.cash += diamondBonus;
    this.mazeCompleted = m.completed;
    this.mech = null;
    this.phase = 'register-result';

    const lines = m.completed
      ? ['The ball drops onto the diamond and the whole thing lights up.',
         'You take what you grabbed on the way and the stone itself.']
      : m.outOfLives
      ? ['Down through the floor one too many times. Three strikes and the drawer stays shut.',
         'Whatever you were holding when you fell the last time is gone with it.']
      : ['The ball is still rolling around in there when you run out of time.',
         'Somebody in the back has stopped talking. You keep what you already grabbed.'];

    this.showResult({
      title: m.completed ? 'Got the diamond' : m.outOfLives ? 'Out of chances' : 'Out of time',
      who: null,
      lines,
      stats: [
        ['Dropped down the floor', `${m.resets} ${m.resets === 1 ? 'time' : 'times'}`],
        ['Cash grabbed in the maze', `$${m.cashCollected}`],
        ['Diamond + time bonus', `$${diamondBonus}`],
        ['Total in the bag', `$${this.cash}`],
      ],
      buttonLabel: 'Out the door',
      onContinue: () => this.startGetaway(),
    });
  }

  // ------------------------------------------------
  // PHASE 3 — GETAWAY
  // ------------------------------------------------

  startGetaway() {
    this.stopLoop();
    this.hideOverlays();
    this.phase = 'getaway';

    const driver = getHeistCrew(this.assign.lookout);
    const cfg = HEIST_TUNING.getaway[driver.id];

    this.mech = {
      kind: 'getaway', driver, cfg,
      lane: 1, laneY: 0, dist: 0, speed: cfg.speed,
      obstacles: [], spawnTimer: 40, offset: 0, bgOffset: 0,
      hitFlash: 0, invuln: 0, crashes: 0, sirens: 0,
      airborne: false, jumpVy: 0, jumpHeight: 0, flipAngle: 0, flips: 0, bestFlips: 0,
      jumpUnlocked: false,
      // Elapsed real time drives the run now, not a distance to a finish
      // line -- capture is inevitable at HEIST_TUNING.getaway.duration
      // seconds no matter what. heat is how close: drifts up on its own,
      // pushed back down by good play.
      elapsed: 0, durationFrames: HEIST_TUNING.getaway.duration * 60,
      heat: HEIST_TUNING.getaway.heat.start,
      // Pickups: nitro charges (burn for a speed burst), stacked permanent
      // speed bonus from speed powerups (each one also lights the exhaust
      // for good), gun/rocket ammo, live shots in flight, explosion
      // particles, the helicopter (null until it shows up), jumped-off
      // flag. Cop cars spawn in the normal obstacle mix and flip into
      // "chasing" once they're actually behind you -- no separate spawn
      // clock needed.
      nitro: 0, nitroActive: 0, speedBonus: 0, fireTrail: false,
      gunAmmo: 0, rocketAmmo: 0, shots: [], particles: [],
      heli: null, heliDone: false, jumpedOff: false,
      // Guaranteed pickups: relying purely on random spawn chance meant a
      // run could easily end without ever handing you a gun (confirmed --
      // "I never got the ability to shoot the guns" was bad luck on a
      // ~4% chance per spawn, not a bug, but a mechanic nobody ever sees
      // isn't much of a mechanic). Each of the four pickup types is
      // guaranteed to appear at least once, spaced through the run,
      // independent of the random spawns that still happen on top.
      pickupQueue: ['gun', 'nitro', 'rocket', 'speedpwr'].sort(() => Math.random() - 0.5),
      nextGuaranteedAt: 0,
      laneUp: () => { const g = this.mech; if (g && g.lane > 0) g.lane--; },
      laneDown: () => { const g = this.mech; if (g && g.lane < 2) g.lane++; },
    };
    this.mech.nextGuaranteedAt = this.mech.durationFrames * 0.12;
    this.mech.laneY = this.laneCenterY(1);
    this.getawayJumpHeld = false;
    this.jumpedOffBridge = false;

    // The chase can cost you at most 40% of what you walked out with. Losing
    // the entire take to a phase whose ending is scripted anyway would just be
    // punishing — the crashes need to sting, not erase the whole act.
    this.bagFloor = Math.round(this.cash * 0.6);

    this.showHud(
      `Getaway — ${driver.name} driving`,
      'Swipe up/down for lanes. FIRE shoots backward at whoever\'s chasing you. ROCKET arms an aim -- drag it yourself, press ROCKET again to fire.',
      cfg.label
    );
    this.input.onDown = null;
    this.input.onUp = null;
    document.getElementById('heist-getaway-controls').classList.remove('hidden');
    // Jump comes in a little later -- direct feedback: "the jump button
    // is there from the start, that should only come in later." Lanes and
    // dodging first, everything else layers on as the run goes.
    document.getElementById('heist-jump-btn').classList.add('hidden');
    // Jump-out button's actual visibility is handled by
    // updateGetawayButtons() below, gated to the jumpOutMin/Max window --
    // not available from the start.
    this.updateGetawayButtons();
    this.getawayLoop();
  }

  // Keeps the button row honest about what you're actually carrying:
  // nitro dims out at 0 charges, fire/rocket are hidden entirely until
  // you've picked up ammo for them (no point cluttering the screen with a
  // button that does nothing), and the bridge-only jump-out disappears
  // the moment you're off the bridge.
  updateGetawayButtons() {
    const g = this.mech;
    if (!g || g.kind !== 'getaway') return;
    const nitroBtn = document.getElementById('heist-nitro-btn');
    nitroBtn.disabled = g.nitro <= 0 || g.nitroActive > 0;
    document.getElementById('heist-nitro-count').textContent = g.nitro;
    const fireBtn = document.getElementById('heist-fire-btn');
    fireBtn.classList.toggle('hidden', g.gunAmmo <= 0);
    document.getElementById('heist-fire-count').textContent = g.gunAmmo;
    const rocketBtn = document.getElementById('heist-rocket-btn');
    rocketBtn.classList.toggle('hidden', g.rocketAmmo <= 0 && !g.aiming);
    // Stays clickable while aiming -- pressing it again is what fires.
    // (Was `disabled = !!g.aiming`, which meant the second press this
    // whole mechanic depends on couldn't even register.)
    rocketBtn.classList.toggle('armed', !!g.aiming);
    document.getElementById('heist-rocket-label').textContent = g.aiming ? 'FIRE!' : 'ROCKET';
    document.getElementById('heist-rocket-count').textContent = g.aiming ? '' : g.rocketAmmo;
    document.getElementById('heist-jumpout-btn').classList.toggle('hidden',
      g.jumpedOff || g.sirens < this.jumpOutMin || g.sirens > this.jumpOutMax);
    document.getElementById('heist-jump-btn').classList.toggle('hidden', !g.jumpUnlocked);
  }

  laneCenterY(lane) {
    const H = this.canvas.height;
    const roadTop = H * 0.52, roadBot = H * 0.94;
    const laneH = (roadBot - roadTop) / 3;
    return roadTop + laneH * (lane + 0.5);
  }

  getawayLoop() {
    const g = this.mech;
    if (!g || g.kind !== 'getaway') return;
    this._frame++;

    // Aiming a rocket drops the world into bullet-time -- everything
    // else keeps moving (just barely) so it reads as slowed down, not
    // paused, while the countdown itself still runs in real time.
    if (g.aiming) {
      g.aiming.timer--;
      if (g.aiming.timer <= 0) this.confirmGetawayAim();
    }
    // Clearly slowed, not frozen -- direct feedback was "I don't know
    // that the bullet time thing worked," which at a near-full stop reads
    // as the game hanging rather than a deliberate effect.
    const slow = g.aiming ? 0.24 : 1;

    g.elapsed += slow;
    g.dist += g.speed * slow;
    g.offset += g.speed * slow;
    g.bgOffset += g.speed * 0.28 * slow;
    if (g.hitFlash > 0) g.hitFlash--;
    if (g.invuln > 0) g.invuln--;
    g.sirens = Math.min(1, g.elapsed / g.durationFrames);

    // Heat only ever drifts up on its own -- capture is coming regardless
    // -- good play (nitro, taking out a cruiser or the chopper) is what
    // buys you a lower number at the end, not a way to avoid it outright.
    const heatCfg = HEIST_TUNING.getaway.heat;
    g.heat = Math.min(100, g.heat + (heatCfg.driftPerSecond / 60) * slow);

    if (!g.jumpUnlocked && g.elapsed > 480) {
      g.jumpUnlocked = true;
      document.getElementById('heist-jump-btn').classList.remove('hidden');
      this.setHudHint('Jump unlocked. Hold it in the air to flip.', g.cfg.label);
    }

    // Ease toward the target lane instead of snapping — reads as driving.
    const targetY = this.laneCenterY(g.lane);
    g.laneY += (targetY - g.laneY) * 0.22;

    // Jump: a simple parabola. Holding the button while airborne spins the
    // car; landing mid-spin banks whatever full rotations you completed.
    if (g.airborne) {
      g.jumpVy += 0.16;
      g.jumpHeight += g.jumpVy;
      if (this.getawayJumpHeld) g.flipAngle += 0.32;
      if (g.jumpHeight >= 0) {
        g.jumpHeight = 0; g.jumpVy = 0; g.airborne = false;
        const fullFlips = Math.floor(g.flipAngle / (Math.PI * 2) + 0.15);
        if (fullFlips > 0) {
          g.flips += fullFlips;
          g.bestFlips = Math.max(g.bestFlips, fullFlips);
          this.cash += fullFlips * 30;
          this.setHudHint(`${fullFlips === 1 ? 'A flip!' : fullFlips + ' flips!'} +$${fullFlips * 30}`, g.cfg.label);
        }
        g.flipAngle = 0;
      }
    }

    // Nitro: a fixed-length burn, applied as a speed multiplier rather
    // than a one-time add, so it cleanly expires on its own.
    if (g.nitroActive > 0) g.nitroActive--;
    g.speed = (g.cfg.speed + g.speedBonus) * (g.nitroActive > 0 ? 1.7 : 1);

    if (!g.aiming) {
      g.spawnTimer--;
      if (g.spawnTimer <= 0) {
        g.spawnTimer = g.cfg.spawn + Math.floor(Math.random() * 22);
        this.spawnGetawayObstacle();
      }

      // Force-spawn the next guaranteed pickup regardless of the random
      // roll above, spaced through the run so you actually see all four.
      if (g.pickupQueue.length > 0 && g.elapsed >= g.nextGuaranteedAt) {
        const type = g.pickupQueue.shift();
        g.obstacles.push({ kind: 'pickup', type, lane: Math.floor(Math.random() * 3), x: this.canvas.width + 80, hit: false });
        g.nextGuaranteedAt += g.durationFrames * 0.20;
      }

    }

    // The helicopter shows up once the heat's high enough and stays for
    // the rest of the run unless you take it down with a rocket.
    if (!g.heli && !g.heliDone && g.sirens >= 0.5) this.spawnGetawayHeli();
    if (g.heli) this.updateGetawayHeli(slow);

    // Bullets down cop cars. Rockets are resolved instantly at
    // confirmGetawayAim() instead of flying as a projectile -- see the aim
    // mechanic above.
    g.shots.forEach(s => { s.x += s.vx * slow; });
    g.shots.forEach(s => {
      if (s.dead) return;
      g.obstacles.forEach(o => {
        if (o.kind !== 'cop' || o.destroyed) return;
        if (Math.abs(s.x - o.x) < 30 && o.lane === s.lane) {
          o.destroyed = true; s.dead = true;
          this.cash += 25;
          // Taking out a chaser is supposed to buy the heat back down --
          // was defined in HEIST_TUNING but never actually applied here,
          // so shooting cops did nothing but earn cash. Heat just kept
          // climbing regardless, which is why it stopped feeling like it
          // mattered.
          g.heat = Math.max(0, g.heat - HEIST_TUNING.getaway.heat.copKillSub);
          this.spawnGetawayBurst(o.x, this.laneCenterY(o.lane));
          this.setHudHint('Cruiser down. Another one’s already rolling.', g.cfg.label);
        }
      });
    });
    g.shots = g.shots.filter(s => !s.dead && s.x > -200 && s.x < this.canvas.width + 200);

    g.particles.forEach(p => { p.x += p.vx * slow; p.y += p.vy * slow; p.vy += 0.25 * slow; p.life -= slow; });
    g.particles = g.particles.filter(p => p.life > 0);

    const px = this.canvas.width * 0.22;
    // Cop cars join the chase the moment they're actually behind you --
    // direct feedback on the previous version (which spawned them behind
    // and had them close in fast): "it would make sense to have them
    // sitting in the road and then they join the chase when you pass
    // them. Then you can shoot multiple of them." So a cop approaches
    // like any other hazard, and the instant it crosses behind your
    // position it stops scrolling with the world and eases into a
    // trailing slot instead -- staying there indefinitely, shootable,
    // instead of zipping past and despawning. Multiple can stack up.
    const chasingCops = g.obstacles.filter(o => o.kind === 'cop' && o.chasing && !o.destroyed);
    g.obstacles.forEach(o => {
      if (o.kind === 'cop' && o.chasing && !o.destroyed) {
        const idx = chasingCops.indexOf(o);
        const slot = idx === -1 ? chasingCops.length : idx;
        const targetX = px - 60 - slot * 42;
        o.x += (targetX - o.x) * 0.05 * slow;
      } else {
        o.x -= g.speed * slow;
      }
      if (o.kind === 'cop' && !o.chasing && !o.destroyed && o.x < px - 20 && chasingCops.length < 5) {
        o.chasing = true;
      }
      if (o.destroyed) return;
      if (g.aiming) return; // attention's on the reticle, not the road
      if (o.hit || g.airborne) return; // jumped clean over it
      if (Math.abs(o.x - px) < 44 && Math.abs(this.laneCenterY(o.lane) - g.laneY) < 34) {
        if (o.kind === 'pickup') {
          o.hit = true;
          this.applyGetawayPickup(o.type);
          this.updateGetawayButtons();
          return;
        }
        o.hit = true;
        if (g.invuln <= 0) {
          g.invuln = 45;
          g.hitFlash = 22;
          g.crashes++;
          const extra = o.type === 'spikes' ? HEIST_TUNING.getaway.heat.crashAdd * 0.75 : 0;
          g.heat = Math.min(100, g.heat + HEIST_TUNING.getaway.heat.crashAdd + extra);
          this.cash = Math.max(this.bagFloor, this.cash - HEIST_TUNING.cashLostPerCrash);
          if (o.type === 'spikes') this.setHudHint('Spike strip. That one’s going to slow you down.', g.cfg.label);
        }
      }
    });
    g.obstacles = g.obstacles.filter(o => {
      // Actively chasing cops persist regardless of x -- that's the whole
      // point, they hang back instead of scrolling off like everything
      // else.
      if (o.kind === 'cop' && o.chasing && !o.destroyed) return true;
      return o.x > -120 && !(o.destroyed && o.x < px - 40);
    });

    const where = g.sirens < 0.5 ? 'across the Brooklyn Bridge' : 'through Chinatown';
    document.getElementById('heist-hud-meta').textContent =
      `$${this.cash} in the bag · Heat ${Math.round(g.heat)}% · ${where}`;
    this.updateGetawayButtons();

    if (g.elapsed >= g.durationFrames) {
      this.crashes = g.crashes;
      this.bestFlips = g.bestFlips;
      this.finalHeat = g.heat;
      this.stopLoop();
      this.hideHud();
      document.getElementById('heist-getaway-controls').classList.add('hidden');
      document.getElementById('heist-jumpout-btn').classList.add('hidden');
      this.mech = null;
      this.showEnding();
      return;
    }

    this.drawStreetScene();
    this._af = requestAnimationFrame(() => this.getawayLoop());
  }

  spawnGetawayObstacle() {
    // Cop cars are back in the normal ahead-of-you traffic mix -- direct
    // feedback on the behind-spawning version: "I didn't have a problem
    // with them chasing you... it would make sense to have them sitting
    // in the road and then they join the chase when you pass them." So a
    // cop spawns and approaches exactly like any other hazard; it's the
    // getawayLoop movement code that turns it into a real chaser the
    // moment it's actually behind you (see the "joins the chase" comment
    // there) -- not a separate spawn system.
    const hazardKinds = ['cab', 'cart', 'pothole', 'dumpster', 'cones', 'cones', 'cab', 'spikes', 'cop'];
    const roll = Math.random();
    const lane = Math.floor(Math.random() * 3);
    const W = this.canvas.width;
    if (roll < 0.16) {
      // A pickup instead of a hazard -- nitro most common, rockets rarest.
      const pickupRoll = Math.random();
      const type = pickupRoll < 0.35 ? 'nitro' : pickupRoll < 0.6 ? 'speedpwr' : pickupRoll < 0.85 ? 'gun' : 'rocket';
      this.mech.obstacles.push({ kind: 'pickup', type, lane, x: W + 80, hit: false });
      return;
    }
    const type = hazardKinds[Math.floor(Math.random() * hazardKinds.length)];
    this.mech.obstacles.push({
      kind: type === 'cop' ? 'cop' : 'hazard', type, lane, x: W + 80, hit: false, destroyed: false, chasing: false,
    });
    // A second obstacle sometimes, but never filling every lane — there is
    // always a gap to steer into.
    if (Math.random() < 0.35) {
      let other = Math.floor(Math.random() * 3);
      if (other === lane) other = (lane + 1) % 3;
      const type2 = hazardKinds[Math.floor(Math.random() * hazardKinds.length)];
      this.mech.obstacles.push({
        kind: type2 === 'cop' ? 'cop' : 'hazard', type: type2,
        lane: other, x: W + 80 + 40 + Math.random() * 90, hit: false, destroyed: false, chasing: false,
      });
    }
  }

  // Cop car destroyed by gunfire doesn't just vanish -- radio traffic, and
  // another one is already rolling. Force one back into the mix soon.
  applyGetawayPickup(type) {
    const g = this.mech;
    if (type === 'nitro') {
      g.nitro = Math.min(3, g.nitro + 1);
      this.setHudHint('Nitro canister. Hit NITRO for a burst.', g.cfg.label);
    } else if (type === 'speedpwr') {
      g.speedBonus = Math.min(2.4, g.speedBonus + 0.6);
      g.fireTrail = true;
      this.setHudHint('Engine kit. Faster for the rest of the run.', g.cfg.label);
    } else if (type === 'gun') {
      g.gunAmmo += 6;
      this.setHudHint('Picked up a gun. FIRE to take out a cruiser.', g.cfg.label);
    } else if (type === 'rocket') {
      g.rocketAmmo += 2;
      this.setHudHint('Rocket launcher. Save it for the chopper.', g.cfg.label);
    }
  }

  spawnGetawayBurst(x, y) {
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2, speed = 1.5 + Math.random() * 4;
      this.mech.particles.push({
        x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed - 1,
        life: 24 + Math.floor(Math.random() * 12),
        color: Math.random() < 0.5 ? '#e8b32a' : '#e05a4a',
      });
    }
  }

  spawnGetawayHeli() {
    const g = this.mech;
    g.heli = {
      x: this.canvas.width + 100, y: this.canvas.height * 0.28,
      destroyed: false, dropTimer: 90,
    };
    this.setHudHint('A helicopter joins in. Rockets only.', g.cfg.label);
  }

  updateGetawayHeli(slow) {
    const g = this.mech, heli = g.heli;
    if (heli.destroyed) {
      // Shot down: tumble toward the road trailing fire, then it's gone
      // for good -- a real "goes down in flames," not a silent despawn.
      heli.fallVy += 0.35 * slow;
      heli.y += heli.fallVy * slow;
      heli.x -= 1.5 * slow;
      heli.spin = (heli.spin || 0) + heli.fallSpin * slow;
      if (this._frame % 3 === 0) {
        this.mech.particles.push({
          x: heli.x + (Math.random() - 0.5) * 20, y: heli.y + (Math.random() - 0.5) * 10,
          vx: (Math.random() - 0.5) * 1.5, vy: 0.5 + Math.random(),
          life: 20 + Math.floor(Math.random() * 10),
          color: Math.random() < 0.6 ? '#e2622c' : '#8a8a8a',
        });
      }
      if (heli.y > this.canvas.height * 0.52) {
        this.spawnGetawayBurst(heli.x, this.canvas.height * 0.52);
        g.heli = null;
      }
      return;
    }
    const targetX = this.canvas.width * 0.62;
    heli.x += (targetX - heli.x) * 0.04 * slow;
    if (!g.aiming) heli.y = this.canvas.height * 0.28 + Math.sin(this._frame / 45) * 22;
    if (g.aiming) return; // holds still enough to actually aim at
    heli.dropTimer--;
    if (heli.dropTimer <= 0) {
      heli.dropTimer = 130 + Math.floor(Math.random() * 60);
      const lane = Math.floor(Math.random() * 3);
      g.obstacles.push({ kind: 'hazard', type: 'pothole', lane, x: this.canvas.width * 0.75, hit: false, destroyed: false });
    }
  }

  // ------------------------------------------------
  // ENDING — scripted capture, then the Act 3 stub
  // ------------------------------------------------

  showEnding() {
    this.phase = 'ending';
    this.stopLoop();

    const driver = getHeistCrew(this.assign.lookout);
    let flavor;
    if (this.jumpedOffBridge) {
      // A different way to get caught, not a way out of it -- "it should
      // not make you get away, you still get caught." The river scene
      // stays (it's a genuinely different visual beat), the outcome
      // doesn't: no escape ending here anymore.
      this.riverLoop();
      flavor = `${driver.name} doesn't slow down -- can't. You and the bag go off the rail and into the East River instead. They fish you out three blocks downstream, soaked through, with company already waiting on the bank.`;
    } else {
      this.bustLoop();
      const heat = this.finalHeat != null ? this.finalHeat : 100;
      flavor = heat < 45
        ? `${driver.name} nearly made it. It takes them longer than it should to even find the car.`
        : heat < 75
        ? `${driver.name} took ${this.crashes} ${this.crashes === 1 ? 'hit' : 'hits'} on the way. They're on you before the engine cools.`
        : `${driver.name} never really had a chance to lose them. The block is swarmed inside a minute.`;
      if (this.bestFlips > 0) {
        flavor += ` Somewhere over the East River, the car did a ${this.bestFlips === 1 ? 'full flip' : this.bestFlips + '-flip'}. Nobody asked it to.`;
      }
    }

    document.getElementById('heist-ending-flavor').textContent = flavor;
    document.getElementById('heist-ending-take').textContent = `$${this.cash}`;
    this.showOverlay('heist-ending');

    document.getElementById('heist-ending-continue').onclick = () => {
      if (this.phase !== 'ending') return;
      this.showAct3Stub();
    };
  }

  // Red-and-blue wash over the frozen street. Campy, not grim.
  bustLoop() {
    this._frame++;
    this.drawBustScene();
    this._af = requestAnimationFrame(() => this.bustLoop());
  }

  // Dark water, a slow current of ripples, nobody chasing you into it.
  riverLoop() {
    this._frame++;
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#0a1424'); sky.addColorStop(1, '#0e2438');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(150,190,220,0.12)'; ctx.lineWidth = 2;
    for (let i = 0; i < 7; i++) {
      const ry = (H * 0.2 + i * 60 + (this._frame * 0.6) % 60) % H;
      ctx.beginPath();
      for (let x = 0; x < W; x += 20) ctx.lineTo(x, ry + Math.sin(x * 0.02 + this._frame * 0.03 + i) * 6);
      ctx.stroke();
    }
    this._af = requestAnimationFrame(() => this.riverLoop());
  }

  showAct3Stub() {
    this.phase = 'act3';
    this.showOverlay('heist-act3');
    document.getElementById('heist-act3-continue').onclick = () => {
      if (this.phase !== 'act3') return;
      this.finish();
    };
  }

  finish() {
    this.phase = 'done';
    this.stopLoop();
    this.hideHud();
    this.hideOverlays();
    if (this._resizeHandler) window.removeEventListener('resize', this._resizeHandler);
    this.onComplete({
      heistCash: this.cash,
      mazeCompleted: this.mazeCompleted,
      crashes: this.crashes,
      assignments: { ...this.assign },
      caught: true,
    });
  }

  // ================================================
  // RENDERING
  // ================================================

  // --- the hideout: an old sugar factory on the Williamsburg waterfront
  drawWarehouse() {
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    const flicker = 0.9 + 0.1 * Math.sin(this._frame / 7) + 0.04 * Math.sin(this._frame / 2.3);

    ctx.fillStyle = '#120d0b';
    ctx.fillRect(0, 0, W, H);

    // Brick wall
    const bh = 16, bw = 40;
    for (let y = 0, row = 0; y < H * 0.82; y += bh, row++) {
      for (let x = (row % 2 ? -bw / 2 : 0); x < W; x += bw) {
        const n = (Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1;
        const v = 26 + Math.abs(n) * 16;
        ctx.fillStyle = `rgb(${Math.floor(v + 20)},${Math.floor(v * 0.62)},${Math.floor(v * 0.5)})`;
        ctx.fillRect(x + 1, y + 1, bw - 2, bh - 2);
      }
    }
    // Vignette down the wall
    const wash = ctx.createLinearGradient(0, 0, 0, H);
    wash.addColorStop(0, 'rgba(0,0,0,0.72)');
    wash.addColorStop(0.45, 'rgba(0,0,0,0.18)');
    wash.addColorStop(1, 'rgba(0,0,0,0.78)');
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, W, H);

    // Tall arched industrial windows, cold blue night behind them
    const winCount = Math.max(2, Math.round(W / 300));
    const gap = W / winCount;
    for (let i = 0; i < winCount; i++) {
      const cx = gap * (i + 0.5);
      const ww = Math.min(150, gap * 0.5), wh = H * 0.42, top = H * 0.10;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(cx - ww / 2, top + wh);
      ctx.lineTo(cx - ww / 2, top + ww / 2);
      ctx.arc(cx, top + ww / 2, ww / 2, Math.PI, 0);
      ctx.lineTo(cx + ww / 2, top + wh);
      ctx.closePath();
      ctx.clip();
      const g = ctx.createLinearGradient(0, top, 0, top + wh);
      g.addColorStop(0, '#26405e');
      g.addColorStop(0.6, '#16293f');
      g.addColorStop(1, '#0d1826');
      ctx.fillStyle = g;
      ctx.fillRect(cx - ww / 2, top, ww, wh);
      // Distant skyline slice + a couple of lit windows
      ctx.fillStyle = '#0a1220';
      ctx.fillRect(cx - ww / 2, top + wh * 0.55, ww, wh * 0.45);
      for (let k = 0; k < 6; k++) {
        const lx = cx - ww / 2 + 10 + ((k * 37) % (ww - 20));
        const ly = top + wh * 0.58 + (k % 3) * 12;
        ctx.fillStyle = k % 2 ? '#d4a574' : '#8fb4d8';
        ctx.globalAlpha = 0.55;
        ctx.fillRect(lx, ly, 4, 6);
        ctx.globalAlpha = 1;
      }
      // Muntins
      ctx.strokeStyle = '#0b0908';
      ctx.lineWidth = 4;
      for (let gx = cx - ww / 2; gx <= cx + ww / 2; gx += ww / 3) {
        ctx.beginPath(); ctx.moveTo(gx, top); ctx.lineTo(gx, top + wh); ctx.stroke();
      }
      for (let gy = top; gy <= top + wh; gy += wh / 5) {
        ctx.beginPath(); ctx.moveTo(cx - ww / 2, gy); ctx.lineTo(cx + ww / 2, gy); ctx.stroke();
      }
      ctx.restore();
      // Frame
      ctx.strokeStyle = '#241713';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(cx - ww / 2, top + wh);
      ctx.lineTo(cx - ww / 2, top + ww / 2);
      ctx.arc(cx, top + ww / 2, ww / 2, Math.PI, 0);
      ctx.lineTo(cx + ww / 2, top + wh);
      ctx.stroke();
    }

    // Concrete floor
    ctx.fillStyle = '#1b1614';
    ctx.fillRect(0, H * 0.82, W, H * 0.18);
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 2;
    for (let x = 0; x < W; x += 120) {
      ctx.beginPath(); ctx.moveTo(x, H * 0.82); ctx.lineTo(x - 40, H); ctx.stroke();
    }

    // Hanging bulb + light cone over the middle of the room
    const bx = W * 0.5, by = H * 0.30;
    ctx.strokeStyle = '#2a211c';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(bx, 0); ctx.lineTo(bx, by); ctx.stroke();
    const cone = ctx.createRadialGradient(bx, by, 8, bx, by, H * 0.62);
    cone.addColorStop(0, `rgba(255,214,150,${0.30 * flicker})`);
    cone.addColorStop(1, 'rgba(255,214,150,0)');
    ctx.fillStyle = cone;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx - W * 0.42, H);
    ctx.lineTo(bx + W * 0.42, H);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = `rgba(255,226,170,${flicker})`;
    ctx.beginPath(); ctx.arc(bx, by, 7, 0, Math.PI * 2); ctx.fill();

    // Corkboard with the plan pinned to it
    const cbw = Math.min(260, W * 0.3), cbh = cbw * 0.66;
    const cbx = W * 0.5 - cbw / 2, cby = H * 0.50;
    ctx.fillStyle = '#5a3f26';
    ctx.fillRect(cbx - 6, cby - 6, cbw + 12, cbh + 12);
    ctx.fillStyle = '#8a6a3f';
    ctx.fillRect(cbx, cby, cbw, cbh);
    ctx.fillStyle = '#cfd8e6';
    ctx.fillRect(cbx + 14, cby + 12, cbw * 0.5, cbh * 0.72);
    ctx.strokeStyle = '#3b5c86';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 5; i++) {
      ctx.strokeRect(cbx + 20 + (i % 2) * 26, cby + 20 + i * 12, 30 + (i % 3) * 22, 9);
    }
    ctx.fillStyle = '#c0392b';
    ctx.beginPath(); ctx.arc(cbx + cbw * 0.72, cby + 20, 4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cbx + cbw * 0.86, cby + cbh * 0.6, 4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(200,60,45,0.8)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cbx + cbw * 0.72, cby + 20);
    ctx.lineTo(cbx + cbw * 0.86, cby + cbh * 0.6);
    ctx.stroke();

    // Four silhouettes around the board
    const figs = [W * 0.5 - cbw * 0.75, W * 0.5 - cbw * 0.5, W * 0.5 + cbw * 0.55, W * 0.5 + cbw * 0.8];
    figs.forEach((fx, i) => {
      this.drawSilhouette(fx, H * 0.86, 1 + (i % 2) * 0.07, 'rgba(8,6,5,0.92)');
    });
  }

  drawSilhouette(x, baseY, scale, color) {
    const ctx = this.ctx;
    const h = 92 * scale;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, baseY - h, 12 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(x - 15 * scale, baseY - h + 10 * scale, 30 * scale, h * 0.55);
    ctx.fillRect(x - 12 * scale, baseY - h * 0.4, 10 * scale, h * 0.4);
    ctx.fillRect(x + 2 * scale, baseY - h * 0.4, 10 * scale, h * 0.4);
  }


  // --- the register close-up
  mazeBounds() {
    // Centered in the space actually available between the HUD strip up
    // top and the D-pad down below -- a fixed "15% from the top" offset
    // left a lot of dead air underneath on a tall phone screen, since the
    // board's width (not height) is what caps its size there. Direct
    // feedback: "very high on the screen, not really balanced."
    const W = this.canvas.width, H = this.canvas.height;
    const top = H * 0.10, bottom = H * 0.86;
    const availH = bottom - top;
    const side = Math.min(W * 0.92, availH);
    return { x: (W - side) / 2, y: top + (availH - side) / 2, w: side, h: side };
  }

  drawMazeScene() {
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    const m = this.mech;
    const b = this.mazeBounds();

    ctx.fillStyle = '#0e1315';
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.strokeStyle = '#4a3a28'; ctx.lineWidth = 6;
    ctx.strokeRect(b.x, b.y, b.w, b.h);

    if (!m) { ctx.restore(); return; }
    const layout = m.layout;

    // Camera-relative projection -- the maze is much bigger than the
    // viewport now, so this maps a window of world units around the ball
    // (m.camX/camY) into the board rect instead of the whole 0-100 board
    // mapping directly to the screen.
    const view = this.mazeCamView;
    const camMinX = m.camX - view / 2, camMinY = m.camY - view / 2;
    const toPx = (x, y) => [b.x + ((x - camMinX) / view) * b.w, b.y + ((y - camMinY) / view) * b.h];
    const toPxLen = (v) => (v / view) * b.w;
    const margin = 6;
    const visible = (x, y) => x > camMinX - margin && x < camMinX + view + margin && y > camMinY - margin && y < camMinY + view + margin;

    ctx.beginPath(); ctx.rect(b.x, b.y, b.w, b.h); ctx.clip();
    const boardGrad = ctx.createLinearGradient(b.x, b.y, b.x + b.w, b.y + b.h);
    boardGrad.addColorStop(0, '#2a2018');
    boardGrad.addColorStop(1, '#1c150f');
    ctx.fillStyle = boardGrad;
    ctx.fillRect(b.x, b.y, b.w, b.h);

    // The maze walls themselves -- real rectangles forming real corridors,
    // dead ends and all, the same wooden-labyrinth-toy construction as the
    // very first pass, just generated instead of hand-placed switchbacks,
    // and only the ones actually in view get drawn.
    layout.walls.forEach(w => {
      if (!visible(w.x, w.y)) return;
      const [wx, wy] = toPx(w.x, w.y);
      ctx.fillStyle = '#6a5a44';
      ctx.fillRect(wx, wy, toPxLen(w.w), toPxLen(w.h));
      ctx.strokeStyle = '#3a2f22'; ctx.lineWidth = 1;
      ctx.strokeRect(wx, wy, toPxLen(w.w), toPxLen(w.h));
    });

    // Holes -- scattered randomly across every cell, correct path included,
    // offset within the cell so there's room to thread past.
    layout.holes.forEach(h => {
      if (!visible(h.x, h.y)) return;
      const [hx, hy] = toPx(h.x, h.y);
      const r = toPxLen(h.r);
      const g = ctx.createRadialGradient(hx, hy, r * 0.1, hx, hy, r);
      g.addColorStop(0, '#000'); g.addColorStop(1, '#1a1008');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(hx, hy, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
      ctx.stroke();
    });

    // Moving holes -- same pit, but it's actually sliding back and forth,
    // ringed so it reads as "watch this one" rather than a static hole.
    layout.movingHoles.forEach(h => {
      if (!visible(h.x, h.y)) return;
      const [hx, hy] = toPx(h.x, h.y);
      const r = toPxLen(h.r);
      const g = ctx.createRadialGradient(hx, hy, r * 0.1, hx, hy, r);
      g.addColorStop(0, '#000'); g.addColorStop(1, '#2a0f0f');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(hx, hy, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#e05a4a'; ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 2]);
      ctx.beginPath(); ctx.arc(hx, hy, r + 2, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    });

    // Fire gates -- a real vertical barrier now, not a circle. Two dark
    // posts always visible so you can see where the gate IS even when
    // it's open; a wall of flame fills the gap between them while closed,
    // and disappears (posts only, nothing blocking) when it isn't. Direct
    // feedback: it needs to be obvious what this is at a glance.
    layout.gates.forEach(g2 => {
      if (!visible(g2.x + g2.w / 2, g2.y + g2.h / 2)) return;
      const [gx2, gy2] = toPx(g2.x, g2.y);
      const gw = toPxLen(g2.w), gh = toPxLen(g2.h);
      const postW = Math.max(3, gw * 0.14);
      if (g2.active) {
        const flicker = 0.85 + Math.sin(this._frame * 0.9 + g2.phase) * 0.15;
        const fg = ctx.createLinearGradient(gx2, gy2, gx2, gy2 + gh);
        fg.addColorStop(0, `rgba(255,242,192,${flicker})`);
        fg.addColorStop(0.5, `rgba(226,98,44,${flicker})`);
        fg.addColorStop(1, `rgba(200,60,40,${flicker * 0.9})`);
        ctx.fillStyle = fg;
        ctx.fillRect(gx2 + postW, gy2, gw - postW * 2, gh);
        // A few flame licks along the top edge so it reads as fire, not a
        // flat orange rectangle
        for (let i = 0; i < 4; i++) {
          const fx = gx2 + postW + (gw - postW * 2) * ((i + 0.5) / 4);
          const fh = (8 + Math.sin(this._frame * 0.5 + i * 1.7) * 5) * flicker;
          ctx.beginPath();
          ctx.moveTo(fx - 4, gy2);
          ctx.quadraticCurveTo(fx, gy2 - fh, fx + 4, gy2);
          ctx.closePath();
          ctx.fillStyle = `rgba(255,210,120,${flicker * 0.9})`;
          ctx.fill();
        }
      }
      ctx.fillStyle = g2.active ? '#3a2418' : '#2a2420';
      ctx.fillRect(gx2, gy2, postW, gh);
      ctx.fillRect(gx2 + gw - postW, gy2, postW, gh);
      ctx.strokeStyle = g2.active ? '#1a0f08' : 'rgba(224,90,74,0.3)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(gx2, gy2, postW, gh);
      ctx.strokeRect(gx2 + gw - postW, gy2, postW, gh);
    });

    // Cash -- bills sized and colored by denomination, gone once collected.
    // A dropped pile (spilled from a hole fall) renders as a stack of
    // bills instead of one, so it reads as "everything you were
    // carrying," not just another pickup.
    const cashColor = { 1: '#7ec89a', 5: '#7ec89a', 10: '#d4c574', 20: '#d4a574', 100: '#e0c04a' };
    layout.cash.forEach(c => {
      if (c.collected || !visible(c.x, c.y)) return;
      const [cx, cy] = toPx(c.x, c.y);
      if (c.dropped) {
        const w2 = toPxLen(5.4), h2 = toPxLen(3.2);
        [-2, 0, 2].forEach((off, i) => {
          ctx.fillStyle = i === 1 ? '#e0c04a' : '#c9a84a';
          ctx.fillRect(cx - w2 / 2 + off, cy - h2 / 2 - off * 0.6, w2, h2);
          ctx.strokeStyle = '#1a2e1f'; ctx.lineWidth = 1;
          ctx.strokeRect(cx - w2 / 2 + off, cy - h2 / 2 - off * 0.6, w2, h2);
        });
        ctx.fillStyle = '#1a2e1f';
        ctx.font = '10px VT323, monospace'; ctx.textAlign = 'center';
        ctx.fillText('$' + c.value, cx, cy + 3.5);
        return;
      }
      const scale = 0.55 + Math.min(1, c.value / 100) * 0.5;
      const w2 = toPxLen(4.6) * scale, h2 = toPxLen(2.8) * scale;
      ctx.fillStyle = cashColor[c.value] || '#7ec89a';
      ctx.fillRect(cx - w2 / 2, cy - h2 / 2, w2, h2);
      ctx.strokeStyle = '#1a2e1f'; ctx.lineWidth = 1;
      ctx.strokeRect(cx - w2 / 2, cy - h2 / 2, w2, h2);
      ctx.fillStyle = '#1a2e1f';
      ctx.font = `${Math.max(8, 9 * scale)}px VT323, monospace`; ctx.textAlign = 'center';
      ctx.fillText('$' + c.value, cx, cy + 3 * scale);
    });

    // Goal — a diamond, not a dashed circle.
    const [gx, gy] = toPx(layout.goal.x, layout.goal.y);
    const gr = toPxLen(layout.goal.r);
    if (visible(layout.goal.x, layout.goal.y)) {
      const sparkle = 0.7 + Math.sin(this._frame * 0.08) * 0.3;
      const dg = ctx.createRadialGradient(gx, gy, 1, gx, gy, gr * 1.4);
      dg.addColorStop(0, `rgba(140,220,255,${0.55 * sparkle})`);
      dg.addColorStop(1, 'rgba(140,220,255,0)');
      ctx.fillStyle = dg;
      ctx.beginPath(); ctx.arc(gx, gy, gr * 1.4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(gx, gy - gr); ctx.lineTo(gx + gr * 0.75, gy - gr * 0.15);
      ctx.lineTo(gx, gy + gr); ctx.lineTo(gx - gr * 0.75, gy - gr * 0.15);
      ctx.closePath();
      const gemGrad = ctx.createLinearGradient(gx - gr, gy - gr, gx + gr, gy + gr);
      gemGrad.addColorStop(0, '#e8faff'); gemGrad.addColorStop(0.5, '#9fd8f5'); gemGrad.addColorStop(1, '#5aa8cc');
      ctx.fillStyle = m.completed ? '#2ecc71' : gemGrad;
      ctx.fill();
      ctx.strokeStyle = '#2a5a70'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = m.completed ? '#2ecc71' : '#8ab8cc';
      ctx.font = '11px VT323, monospace'; ctx.textAlign = 'center';
      ctx.fillText('DIAMOND', gx, gy + gr + 16);
    }

    // Ball
    const [bx2, by2] = toPx(m.ball.x, m.ball.y);
    const baseBr = toPxLen(HEIST_TUNING.maze.ballRadius);
    ctx.beginPath();
    ctx.arc(bx2, by2, baseBr, 0, Math.PI * 2);
    const ballGrad = ctx.createRadialGradient(bx2 - baseBr * 0.3, by2 - baseBr * 0.3, baseBr * 0.1, bx2, by2, baseBr);
    ballGrad.addColorStop(0, '#f0e8d8'); ballGrad.addColorStop(1, '#a89878');
    ctx.fillStyle = ballGrad;
    ctx.fill();
    ctx.strokeStyle = '#5a4a30'; ctx.lineWidth = 1.5; ctx.stroke();

    ctx.restore();

    // Pressure timer
    const frac = Math.max(0, m.timeLeft / ((HEIST_TUNING.maze.timeLimit + (m.bonusSeconds || 0)) * 60));
    const tw = W * 0.72, tx = W * 0.14, ty = H * 0.06;
    ctx.fillStyle = '#191919';
    ctx.fillRect(tx, ty, tw, 14);
    ctx.fillStyle = frac > 0.45 ? '#7ec89a' : frac > 0.2 ? '#d4a574' : '#e05a4a';
    ctx.fillRect(tx, ty, tw * frac, 14);
    ctx.strokeStyle = '#5a4a3a'; ctx.lineWidth = 2;
    ctx.strokeRect(tx, ty, tw, 14);

    // Lives -- three hearts, one goes dark each time you fall. Lose the
    // last one and it's straight to the getaway. Own row below the timer
    // bar rather than beside it -- there's no room to the side on a
    // narrow phone screen.
    for (let i = 0; i < 3; i++) {
      const hx = tx + 10 + i * 22, hy = ty + 28;
      const filled = i < m.lives;
      ctx.fillStyle = filled ? '#e05a4a' : 'rgba(90,74,58,0.4)';
      ctx.beginPath();
      ctx.moveTo(hx, hy + 5);
      ctx.bezierCurveTo(hx - 9, hy - 4, hx - 9, hy + 8, hx, hy + 12);
      ctx.bezierCurveTo(hx + 9, hy + 8, hx + 9, hy - 4, hx, hy + 5);
      ctx.closePath();
      ctx.fill();
    }
  }

  // --- the getaway street
  drawStreetScene() {
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    const g = this.mech;
    // First half of the run: the Brooklyn Bridge. Second half: Chinatown.
    const onBridge = g.sirens < 0.5;

    const sky = ctx.createLinearGradient(0, 0, 0, H * 0.52);
    if (onBridge) { sky.addColorStop(0, '#0a1020'); sky.addColorStop(1, '#26324a'); }
    else { sky.addColorStop(0, '#170a1e'); sky.addColorStop(1, '#3a1c2c'); }
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H * 0.52);

    if (onBridge) this.drawBridgeBackdrop(g, W, H);
    else this.drawChinatownBackdrop(g, W, H);

    // Road
    const roadTop = H * 0.52, roadBot = H * 0.94;
    ctx.fillStyle = '#20232a';
    ctx.fillRect(0, roadTop, W, roadBot - roadTop);
    ctx.fillStyle = '#2b2f38';
    ctx.fillRect(0, roadBot, W, H - roadBot);

    // Lane dashes
    const laneH = (roadBot - roadTop) / 3;
    ctx.fillStyle = '#8a8470';
    for (let l = 1; l < 3; l++) {
      const y = roadTop + laneH * l - 2;
      for (let x = -((g.offset * 1.0) % 90); x < W; x += 90) {
        ctx.fillRect(x, y, 46, 4);
      }
    }
    // Curbs
    ctx.fillStyle = '#3a3f48';
    ctx.fillRect(0, roadTop - 6, W, 6);
    ctx.fillRect(0, roadBot, W, 6);

    // Obstacles
    g.obstacles.forEach(o => this.drawObstacle(o));

    // Shots in flight -- bullets only now; rockets resolve instantly at
    // the reticle instead of traveling as a projectile.
    g.shots.forEach(s => {
      ctx.fillStyle = '#ffd36a';
      ctx.fillRect(s.x - 10, s.y - 2, 16, 4);
    });

    // Explosion particles
    g.particles.forEach(p => {
      ctx.globalAlpha = Math.max(0, p.life / 30);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 3, p.y - 3, 6, 6);
    });
    ctx.globalAlpha = 1;

    // Helicopter
    if (g.heli) this.drawHeli(g.heli);

    // Getaway car
    const px = W * 0.22;
    const shake = g.hitFlash > 0 ? (Math.random() - 0.5) * 8 : 0;
    this.drawGetawayCar(px + shake, g.laneY + shake, g);

    // Light-bar glow around every cop actively chasing (there can be
    // several stacked up now) -- it used to be a fixed decorative shape
    // with no object behind it at all, which is why shooting "the car
    // chasing you" did nothing. Now it follows the real ones.
    g.obstacles.forEach(o => {
      if (o.kind !== 'cop' || !o.chasing || o.destroyed) return;
      const cy = this.laneCenterY(o.lane);
      const blue = Math.floor(this._frame / 6) % 2 === 0;
      const glow = ctx.createRadialGradient(o.x, cy - 20, 4, o.x, cy - 20, 110);
      glow.addColorStop(0, blue ? 'rgba(74,123,216,0.28)' : 'rgba(216,74,74,0.28)');
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(o.x - 130, cy - 150, 260, 260);
    });

    // Heat bar -- not "how far to the finish," how close to caught. Always
    // drifting up; good play buys it back down, never stops it outright.
    const pw = W * 0.7, pxx = W * 0.15, py = H * 0.045;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(pxx - 4, py - 4, pw + 8, 18);
    ctx.fillStyle = '#191919';
    ctx.fillRect(pxx, py, pw, 10);
    const heatFrac = Math.min(1, g.heat / 100);
    ctx.fillStyle = heatFrac < 0.45 ? '#7ec89a' : heatFrac < 0.75 ? '#d4a574' : '#e05a4a';
    ctx.fillRect(pxx, py, pw * heatFrac, 10);
    ctx.fillStyle = '#c8b89c';
    ctx.font = '10px VT323, monospace'; ctx.textAlign = 'center';
    ctx.fillText('HEAT', pxx + pw / 2, py + 9);

    if (g.hitFlash > 0) {
      ctx.fillStyle = `rgba(224,90,74,${0.16 * (g.hitFlash / 22)})`;
      ctx.fillRect(0, 0, W, H);
    }

    if (g.aiming) this.drawGetawayReticle(g.aiming, W, H);
  }

  // A pulsing bullseye you drag over the target, plus a shrinking ring
  // showing how much of the 3 seconds is left before it fires anyway.
  drawGetawayReticle(aim, W, H) {
    const ctx = this.ctx, g = this.mech;
    ctx.fillStyle = 'rgba(6,10,16,0.35)';
    ctx.fillRect(0, 0, W, H);

    // Highlight anything actually hittable -- this is the "you can see
    // what it can hit" part. It's still on the player to drag the
    // reticle onto one; nothing here moves it for them.
    const pulseRing = 22 + Math.sin(this._frame * 0.25) * 4;
    const targets = [];
    if (g.heli && !g.heli.destroyed) targets.push({ x: g.heli.x, y: g.heli.y });
    g.obstacles.forEach(o => { if (o.kind === 'cop' && !o.destroyed) targets.push({ x: o.x, y: this.laneCenterY(o.lane) }); });
    targets.forEach(tgt => {
      ctx.beginPath(); ctx.arc(tgt.x, tgt.y, pulseRing, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(126,200,154,0.75)'; ctx.lineWidth = 2.5;
      ctx.setLineDash([5, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    });

    const pulse = 1 + Math.sin(this._frame * 0.3) * 0.08;
    [26, 17, 8].forEach((r, i) => {
      ctx.beginPath(); ctx.arc(aim.x, aim.y, r * pulse, 0, Math.PI * 2);
      ctx.strokeStyle = i % 2 === 0 ? '#e05a4a' : '#f0e8d8';
      ctx.lineWidth = 3;
      ctx.stroke();
    });
    ctx.beginPath(); ctx.moveTo(aim.x - 34, aim.y); ctx.lineTo(aim.x + 34, aim.y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(aim.x, aim.y - 34); ctx.lineTo(aim.x, aim.y + 34); ctx.stroke();

    // Countdown ring -- 5 real seconds (300 frames), ticking at normal
    // speed regardless of the bullet-time slowdown around it.
    const frac = aim.timer / 300;
    ctx.beginPath();
    ctx.arc(aim.x, aim.y, 40, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
    ctx.strokeStyle = frac > 0.3 ? '#7ec89a' : '#e05a4a';
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.fillStyle = '#f0e8d8';
    ctx.font = '16px VT323, monospace'; ctx.textAlign = 'center';
    ctx.fillText('drag onto a target, hit ROCKET again to fire', W / 2, H * 0.1);
  }

  // Gothic stone towers, catenary main cables, a fan of hanger cables --
  // the actual Brooklyn Bridge shape, scrolling past at two parallax depths.
  drawBridgeBackdrop(g, W, H) {
    const ctx = this.ctx, baseY = H * 0.52;
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (let i = 0; i < 40; i++) {
      const sx = ((i * 97 - g.bgOffset * 0.05) % (W + 40) + W + 40) % (W + 40) - 20;
      ctx.fillRect(sx, (i * 53) % (H * 0.3), i % 6 === 0 ? 2 : 1, i % 6 === 0 ? 2 : 1);
    }
    const drawTower = (cx, scale) => {
      const towH = 150 * scale, towW = 26 * scale, roadY = baseY;
      const topY = roadY - towH;
      ctx.fillStyle = `rgba(160,150,132,${0.5 + scale * 0.35})`;
      ctx.fillRect(cx - towW * 1.6, topY, towW, towH);
      ctx.fillRect(cx + towW * 0.6, topY, towW, towH);
      ctx.fillStyle = `rgba(20,25,40,${0.5 + scale * 0.35})`;
      [cx - towW * 1.1, cx + towW * 1.1].forEach(archX => {
        ctx.beginPath(); ctx.arc(archX, topY + towH * 0.22, towW * 0.55, Math.PI, 0); ctx.fill();
        ctx.fillRect(archX - towW * 0.55, topY + towH * 0.22, towW * 1.1, towH * 0.5);
      });
      // Main cable sag between the two towers
      ctx.strokeStyle = `rgba(180,170,150,${0.4 + scale * 0.4})`;
      ctx.lineWidth = 2 * scale;
      ctx.beginPath();
      ctx.moveTo(cx - towW * 1.6, topY + 10);
      ctx.quadraticCurveTo(cx, topY + towH * 0.55, cx + towW * 1.6, topY + 10);
      ctx.stroke();
    };
    const spacing = 620;
    for (let cx = -((g.bgOffset * 0.55) % spacing) - spacing; cx < W + spacing; cx += spacing) {
      drawTower(cx, 1.0);
    }
    for (let cx = -((g.bgOffset * 0.3) % (spacing * 1.4)) - spacing; cx < W + spacing; cx += spacing * 1.4) {
      drawTower(cx + spacing * 0.6, 0.55);
    }
    // A hint of the river far below, past the rail
    ctx.fillStyle = 'rgba(30,60,110,0.25)';
    ctx.fillRect(0, baseY - 4, W, 4);
  }

  // Warm, dense, lantern-strung — the turn onto Canal Street.
  drawChinatownBackdrop(g, W, H) {
    const ctx = this.ctx, baseY = H * 0.52;
    const drawRow = (off, scale, colors, baseAlpha) => {
      const bw = 78 * scale;
      const start = -((off % bw) + bw);
      for (let x = start, i = 0; x < W + bw; x += bw, i++) {
        const seed = Math.abs(Math.floor((x + off) / bw));
        const h = (70 + ((seed * 41) % 80)) * scale;
        const c = colors[seed % colors.length];
        ctx.globalAlpha = baseAlpha;
        ctx.fillStyle = c;
        ctx.fillRect(x, baseY - h, bw - 5, h);
        // Pagoda-ish upturned roofline on every third building
        if (seed % 3 === 0) {
          ctx.beginPath();
          ctx.moveTo(x - 4, baseY - h);
          ctx.lineTo(x + (bw - 5) / 2, baseY - h - 14 * scale);
          ctx.lineTo(x + bw + 1, baseY - h);
          ctx.closePath();
          ctx.fill();
        }
        // Lit signage — a warm glowing block, red or gold
        ctx.globalAlpha = 1;
        ctx.fillStyle = seed % 2 === 0 ? 'rgba(224,74,74,0.55)' : 'rgba(224,180,74,0.5)';
        ctx.fillRect(x + 6, baseY - h + 14 * scale, bw - 22, 10 * scale);
        ctx.fillStyle = 'rgba(255,220,150,0.3)';
        for (let k = 0; k < 3; k++) ctx.fillRect(x + 8 + k * 18, baseY - h + 32 * scale, 8, 9);
      }
      ctx.globalAlpha = 1;
    };
    drawRow(g.bgOffset * 0.4, 1.3, ['#241522', '#2a1a1a'], 0.55);
    drawRow(g.bgOffset, 1.0, ['#1c1018', '#221414'], 0.9);

    // Lanterns strung across the street, bobbing gently
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      const lx = ((i * 210 - g.bgOffset * 0.8) % (W + 260) + W + 260) % (W + 260) - 130;
      const ly = baseY * 0.28 + Math.sin(this._frame / 40 + i) * 6;
      ctx.beginPath(); ctx.moveTo(lx - 60, ly - 20); ctx.lineTo(lx + 60, ly - 10); ctx.stroke();
      [-30, 0, 30].forEach(dx => {
        const bob = Math.sin(this._frame / 30 + i + dx) * 3;
        const cy = ly - 16 + (dx / 60) * -10 + bob;
        ctx.fillStyle = '#d8442e';
        ctx.beginPath(); ctx.ellipse(lx + dx, cy, 8, 10, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#f1c40f';
        ctx.fillRect(lx + dx - 1, cy - 12, 2, 4);
      });
    }
  }

  drawObstacle(o) {
    if (o.destroyed) return; // the burst particles are doing the talking now
    const ctx = this.ctx;
    const y = this.laneCenterY(o.lane);
    const x = o.x;
    ctx.globalAlpha = o.hit ? 0.45 : 1;
    switch (o.type) {
      case 'cop':
        ctx.fillStyle = '#1c2430';
        ctx.fillRect(x - 36, y - 16, 72, 30);
        ctx.fillStyle = Math.floor(this._frame / 6) % 2 === 0 ? '#4a7bd8' : '#d84a4a';
        ctx.fillRect(x - 10, y - 24, 20, 8);
        ctx.fillStyle = '#1b1f24';
        ctx.fillRect(x - 22, y - 12, 20, 12);
        ctx.fillRect(x + 4, y - 12, 20, 12);
        ctx.fillStyle = '#fff';
        ctx.font = '10px VT323, monospace'; ctx.textAlign = 'center';
        ctx.fillText('NYPD', x, y + 8);
        ctx.fillStyle = '#111';
        ctx.fillRect(x - 28, y + 12, 14, 7);
        ctx.fillRect(x + 14, y + 12, 14, 7);
        break;
      case 'nitro':
        ctx.fillStyle = '#2f6fae';
        ctx.fillRect(x - 10, y - 18, 20, 34);
        ctx.fillStyle = '#8fcfff';
        ctx.fillRect(x - 6, y - 14, 12, 10);
        ctx.fillStyle = '#fff';
        ctx.font = '10px VT323, monospace'; ctx.textAlign = 'center';
        ctx.fillText('N2O', x, y + 12);
        break;
      case 'speedpwr':
        ctx.fillStyle = '#e8c93a';
        ctx.beginPath();
        ctx.moveTo(x - 3, y - 18); ctx.lineTo(x + 9, y - 2); ctx.lineTo(x, y - 2);
        ctx.lineTo(x + 3, y + 18); ctx.lineTo(x - 9, y + 2); ctx.lineTo(x, y + 2);
        ctx.closePath(); ctx.fill();
        break;
      case 'gun':
        // Was two flat grey rectangles -- read as a blob on a phone
        // screen. An actual rifle silhouette instead, curved magazine
        // included, same as the FIRE button icon.
        ctx.save();
        ctx.translate(x, y);
        ctx.fillStyle = '#3a322a';
        ctx.fillRect(-26, -3, 38, 6);          // barrel + body
        ctx.fillRect(10, -5, 5, 10);           // muzzle
        ctx.fillRect(-32, -1, 10, 5);          // stock
        ctx.fillRect(-16, -9, 16, 7);          // receiver top / sight
        ctx.beginPath();                        // pistol grip
        ctx.moveTo(-15, 3); ctx.lineTo(-8, 3); ctx.lineTo(-10, 15); ctx.lineTo(-17, 15);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#5a4a30';
        ctx.beginPath();                        // the curved banana magazine
        ctx.moveTo(-2, 3);
        ctx.quadraticCurveTo(4, 16, -5, 23);
        ctx.quadraticCurveTo(-9, 14, -7, 3);
        ctx.closePath(); ctx.fill();
        ctx.restore();
        break;
      case 'rocket':
        ctx.fillStyle = '#8a4a3a';
        ctx.fillRect(x - 8, y - 20, 16, 34);
        ctx.fillStyle = '#c8402f';
        ctx.beginPath(); ctx.moveTo(x - 8, y - 20); ctx.lineTo(x, y - 32); ctx.lineTo(x + 8, y - 20); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#e2622c';
        ctx.fillRect(x - 10, y + 14, 6, 8); ctx.fillRect(x + 4, y + 14, 6, 8);
        break;
      case 'cab':
        ctx.fillStyle = '#e8b32a';
        ctx.fillRect(x - 36, y - 16, 72, 30);
        ctx.fillStyle = '#1b1f24';
        ctx.fillRect(x - 22, y - 12, 20, 12);
        ctx.fillRect(x + 4, y - 12, 20, 12);
        ctx.fillStyle = '#fff';
        ctx.fillRect(x - 8, y - 24, 16, 7);
        ctx.fillStyle = '#111';
        ctx.fillRect(x - 28, y + 12, 14, 7);
        ctx.fillRect(x + 14, y + 12, 14, 7);
        break;
      case 'cart':
        ctx.fillStyle = '#b8bcc4';
        ctx.fillRect(x - 24, y - 8, 48, 22);
        ctx.fillStyle = '#c1443a';
        ctx.beginPath();
        ctx.moveTo(x - 34, y - 12);
        ctx.lineTo(x + 34, y - 12);
        ctx.lineTo(x, y - 38);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#eee';
        ctx.fillRect(x - 2, y - 38, 4, 26);
        break;
      case 'pothole':
        ctx.fillStyle = '#0a0c0f';
        ctx.beginPath();
        ctx.ellipse(x, y + 6, 30, 11, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#3a3f48';
        ctx.lineWidth = 3;
        ctx.stroke();
        break;
      case 'dumpster':
        ctx.fillStyle = '#3f6b47';
        ctx.fillRect(x - 30, y - 18, 60, 34);
        ctx.fillStyle = '#2e5135';
        ctx.fillRect(x - 32, y - 22, 64, 7);
        break;
      case 'spikes': {
        // This is a top-down road with lanes stacked vertically on
        // screen and the car driving along x -- a strip laid along x
        // (the old version) only blocked a car-length of travel, not
        // the lane itself. A real spike strip goes *across* the lane it
        // sits in, ends touching the lane's top/bottom edges, so there's
        // no way through that lane without rolling over it. Reoriented
        // to run along y instead, spikes fanned out sideways (into the
        // direction a tire would actually cross them) off a center rail.
        const H = this.canvas.height;
        const roadTop = H * 0.52, roadBot = H * 0.94;
        const laneH = (roadBot - roadTop) / 3;
        const half = laneH / 2 - 4; // just short of the lane divider lines
        ctx.fillStyle = '#8a2a20';
        ctx.fillRect(x - 5, y - half, 10, half * 2);
        ctx.fillStyle = '#c8402f';
        ctx.fillRect(x - 2, y - half, 4, half * 2);
        const n = Math.max(3, Math.round((half * 2) / 10));
        for (let i = 0; i < n; i++) {
          const sy = y - half + (i + 0.5) * (half * 2 / n);
          ctx.fillStyle = '#d8d8d0';
          ctx.beginPath();
          ctx.moveTo(x - 5, sy - 3); ctx.lineTo(x - 5, sy + 3); ctx.lineTo(x - 17, sy);
          ctx.closePath(); ctx.fill();
          ctx.beginPath();
          ctx.moveTo(x + 5, sy - 3); ctx.lineTo(x + 5, sy + 3); ctx.lineTo(x + 17, sy);
          ctx.closePath(); ctx.fill();
        }
        break;
      }
      case 'cones':
      default:
        for (let i = -1; i <= 1; i++) {
          ctx.fillStyle = '#e2622c';
          ctx.beginPath();
          ctx.moveTo(x + i * 18 - 8, y + 12);
          ctx.lineTo(x + i * 18 + 8, y + 12);
          ctx.lineTo(x + i * 18, y - 14);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.fillRect(x + i * 18 - 5, y - 1, 10, 4);
        }
        break;
    }
    ctx.globalAlpha = 1;
  }

  drawGetawayCar(x, y, g) {
    const ctx = this.ctx;
    const jumpH = g.jumpHeight || 0;
    // Shadow stays on the ground and shrinks/fades with height, so the jump
    // actually reads as height rather than the car just floating.
    const shadowScale = Math.max(0.35, 1 - Math.abs(jumpH) / 90);
    ctx.globalAlpha = shadowScale;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(x, y + 18, 44 * shadowScale, 8 * shadowScale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.save();
    ctx.translate(x, y + jumpH);
    if (g.flipAngle) ctx.rotate(g.flipAngle);
    ctx.translate(-x, -(y + jumpH));
    const cy = y + jumpH;

    const body = g.invuln > 0 && Math.floor(this._frame / 4) % 2 === 0 ? '#8a2b22' : '#b23227';
    ctx.fillStyle = body;
    ctx.fillRect(x - 44, cy - 16, 88, 32);
    ctx.fillStyle = '#c8402f';
    ctx.fillRect(x - 30, cy - 26, 54, 12);
    ctx.fillStyle = '#1b2a33';
    ctx.fillRect(x - 26, cy - 24, 22, 9);
    ctx.fillRect(x + 2, cy - 24, 20, 9);
    ctx.fillStyle = '#111';
    ctx.fillRect(x - 34, cy + 14, 16, 8);
    ctx.fillRect(x + 18, cy + 14, 16, 8);
    // Cash bag on the roof rack, because of course it is
    ctx.fillStyle = '#d9c9a3';
    ctx.fillRect(x + 26, cy - 34, 16, 12);
    ctx.fillStyle = '#4a4038';
    ctx.font = '11px VT323, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('$', x + 34, cy - 25);
    // Headlight wash forward
    const hl = ctx.createLinearGradient(x + 44, cy, x + 180, cy);
    hl.addColorStop(0, 'rgba(255,240,200,0.22)');
    hl.addColorStop(1, 'rgba(255,240,200,0)');
    ctx.fillStyle = hl;
    ctx.fillRect(x + 44, cy - 18, 140, 36);

    // Fire out the back — permanent once you've picked up a speed kit,
    // and bigger/brighter while a nitro burst is actively burning.
    if (g.fireTrail || g.nitroActive > 0) {
      const boost = g.nitroActive > 0;
      const flicker = 0.7 + Math.sin(this._frame * (boost ? 1.4 : 0.7)) * 0.3;
      const len = (boost ? 70 : 34) * flicker;
      [-7, 7].forEach(dy => {
        ctx.beginPath();
        ctx.moveTo(x - 44, cy + dy - 5);
        ctx.lineTo(x - 44 - len, cy + dy);
        ctx.lineTo(x - 44, cy + dy + 5);
        ctx.closePath();
        const fg = ctx.createLinearGradient(x - 44, cy, x - 44 - len, cy);
        fg.addColorStop(0, boost ? '#fff2c0' : '#ffd36a');
        fg.addColorStop(1, 'rgba(224,90,74,0)');
        ctx.fillStyle = fg;
        ctx.fill();
      });
    }
    ctx.restore();
  }

  drawHeli(heli) {
    const ctx = this.ctx, x = heli.x, y = heli.y;
    const spin = this._frame * 1.4;
    ctx.save();
    if (heli.destroyed) {
      // Tumbling, not flying -- rotor still visible but no longer level.
      ctx.translate(x, y);
      ctx.rotate(heli.spin || 0);
      ctx.translate(-x, -y);
    } else {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(x, this.canvas.height * 0.52 - 4, 30, 6, 0, 0, Math.PI * 2); ctx.fill();
    }
    // Rotor
    ctx.strokeStyle = heli.destroyed ? 'rgba(60,40,30,0.5)' : 'rgba(20,20,20,0.5)'; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - Math.cos(spin) * 46, y - 16 - Math.sin(spin) * 6);
    ctx.lineTo(x + Math.cos(spin) * 46, y - 16 + Math.sin(spin) * 6);
    ctx.stroke();
    // Body
    ctx.fillStyle = heli.destroyed ? '#241c18' : '#2a3138';
    ctx.beginPath(); ctx.ellipse(x, y, 34, 14, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#4a7bd8';
    ctx.fillRect(x + 8, y - 8, 16, 10);
    ctx.fillStyle = '#1c2228';
    ctx.fillRect(x - 6, y + 10, 4, 16); ctx.fillRect(x - 34, y + 20, 44, 4);
    // Tail
    ctx.fillStyle = heli.destroyed ? '#241c18' : '#2a3138';
    ctx.fillRect(x - 50, y - 3, 20, 6);
    ctx.beginPath(); ctx.moveTo(x - 50, y - 10); ctx.lineTo(x - 50, y + 10); ctx.lineTo(x - 60, y); ctx.closePath(); ctx.fill();
    if (heli.destroyed) {
      // Flame licking off the body, on top of the trailing smoke particles.
      const flicker = 0.7 + Math.sin(this._frame * 1.1) * 0.3;
      const fg = ctx.createRadialGradient(x, y, 2, x, y, 26 * flicker);
      fg.addColorStop(0, 'rgba(255,210,120,0.85)');
      fg.addColorStop(1, 'rgba(224,90,74,0)');
      ctx.fillStyle = fg;
      ctx.beginPath(); ctx.arc(x, y, 26 * flicker, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  // --- the bust: the street, frozen, under police lights
  drawBustScene() {
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    ctx.fillStyle = '#0a0d14';
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = '#131a2a';
    ctx.fillRect(0, H * 0.52, W, H * 0.48);
    ctx.fillStyle = '#0d1220';
    for (let x = 0; x < W; x += 120) {
      const h = 90 + ((x * 13) % 120);
      ctx.fillRect(x, H * 0.52 - h, 108, h);
    }

    const blue = Math.floor(this._frame / 10) % 2 === 0;
    const c1 = blue ? 'rgba(74,123,216,0.34)' : 'rgba(216,74,74,0.34)';
    const c2 = blue ? 'rgba(216,74,74,0.20)' : 'rgba(74,123,216,0.20)';
    let g1 = ctx.createRadialGradient(W * 0.2, H * 0.55, 10, W * 0.2, H * 0.55, W * 0.7);
    g1.addColorStop(0, c1); g1.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g1; ctx.fillRect(0, 0, W, H);
    let g2 = ctx.createRadialGradient(W * 0.82, H * 0.58, 10, W * 0.82, H * 0.58, W * 0.7);
    g2.addColorStop(0, c2); g2.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g2; ctx.fillRect(0, 0, W, H);

    // Four sets of hands up
    [0.32, 0.44, 0.56, 0.68].forEach((f, i) => {
      const x = W * f, baseY = H * 0.93, s = 1 + (i % 2) * 0.05;
      ctx.fillStyle = 'rgba(6,8,12,0.94)';
      ctx.beginPath();
      ctx.arc(x, baseY - 96 * s, 12 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(x - 15 * s, baseY - 86 * s, 30 * s, 52 * s);
      ctx.fillRect(x - 12 * s, baseY - 34 * s, 10 * s, 34 * s);
      ctx.fillRect(x + 2 * s, baseY - 34 * s, 10 * s, 34 * s);
      // Arms up
      ctx.fillRect(x - 26 * s, baseY - 132 * s, 9 * s, 50 * s);
      ctx.fillRect(x + 17 * s, baseY - 132 * s, 9 * s, 50 * s);
    });
  }
}

let heistGame = null;
