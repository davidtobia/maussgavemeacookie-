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
    timeLimit: 35,
    accel: 0.028,
    friction: 0.965,
    ballRadius: 3.0,
  },
  getaway: {
    // Whichever Eric ended up on Lookout is the one behind the wheel. Distance
    // is in world pixels, so distance/speed/60 is the run in seconds:
    // Tony ~24s of fast dense traffic, Ruhul ~20s because he knows a street,
    // Dmitri ~26s at one unchanging speed with the most room between hazards.
    tony:   { speed: 9.0, spawn: 34, distance: 13000, label: 'Big Tony drives.' },
    ruhul:  { speed: 7.4, spawn: 44, distance: 9000,  label: 'Ruhul knows a shortcut.' },
    dmitri: { speed: 6.6, spawn: 56, distance: 10500, label: 'Dmitri drives. Dmitri always drives like this.' },
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
    this.selectedCrew = null;
    this.crashes = 0;
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
    this.showIntro();
  }

  // Two real, simultaneous fingers: left thumb (wherever it lands on the
  // left half of the screen) sets X-tilt from its vertical position, right
  // thumb sets Y-tilt the same way on the right half — like turning both
  // knobs on a wooden labyrinth toy. Only does anything during 'maze'.
  // Mouse position is the desktop fallback: it drives both axes at once.
  bindMazeInput() {
    this.mazeTiltX = 0;
    this.mazeTiltY = 0;
    this.mazeUseTilt = false;
    this._mazeTouches = {}; // identifier -> { side: 'left'|'right' }
    this._mazeOrientBase = null; // calibration baseline, set on enabling tilt

    const setFromTouch = (t) => {
      const r = this.canvas.getBoundingClientRect();
      const side = this._mazeTouches[t.identifier];
      if (!side) return;
      const ny = ((t.clientY - r.top) / r.height - 0.5) * 2.4;
      const clamped = Math.max(-1, Math.min(1, ny));
      if (side.side === 'left') this.mazeTiltX = clamped;
      else this.mazeTiltY = clamped;
    };

    this.canvas.addEventListener('touchstart', (e) => {
      if (this.phase !== 'maze' || this.mazeUseTilt) return;
      e.preventDefault();
      const r = this.canvas.getBoundingClientRect();
      Array.from(e.changedTouches).forEach(t => {
        const side = (t.clientX - r.left) < r.width / 2 ? 'left' : 'right';
        this._mazeTouches[t.identifier] = { side };
        setFromTouch(t);
      });
    }, { passive: false });

    this.canvas.addEventListener('touchmove', (e) => {
      if (this.phase !== 'maze' || this.mazeUseTilt) return;
      e.preventDefault();
      Array.from(e.changedTouches).forEach(t => {
        if (this._mazeTouches[t.identifier]) setFromTouch(t);
      });
    }, { passive: false });

    const endTouch = (e) => {
      if (this.phase !== 'maze' || this.mazeUseTilt) return;
      Array.from(e.changedTouches).forEach(t => {
        const side = this._mazeTouches[t.identifier];
        delete this._mazeTouches[t.identifier];
        if (side && side.side === 'left') this.mazeTiltX = 0;
        else if (side) this.mazeTiltY = 0;
      });
    };
    this.canvas.addEventListener('touchend', endTouch);
    this.canvas.addEventListener('touchcancel', endTouch);

    // Desktop fallback — single cursor drives both axes at once.
    this.canvas.addEventListener('mousemove', (e) => {
      if (this.phase !== 'maze' || this.mazeUseTilt) return;
      if (Object.keys(this._mazeTouches).length > 0) return; // real touch wins
      const r = this.canvas.getBoundingClientRect();
      this.mazeTiltX = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width - 0.5) * 2.4));
      this.mazeTiltY = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height - 0.5) * 2.4));
    });

    // Real device tilt. Calibrated against whatever angle you're already
    // holding the phone at when tilt mode turns on — you don't have to hold
    // it dead flat, wherever it starts becomes "neutral."
    window.addEventListener('deviceorientation', (e) => {
      if (this.phase !== 'maze' || !this.mazeUseTilt) return;
      if (e.beta === null || e.gamma === null) return;
      if (!this._mazeOrientBase) this._mazeOrientBase = { beta: e.beta, gamma: e.gamma };
      const dGamma = e.gamma - this._mazeOrientBase.gamma; // left/right
      const dBeta = e.beta - this._mazeOrientBase.beta;   // front/back
      this.mazeTiltX = Math.max(-1, Math.min(1, dGamma / 22));
      this.mazeTiltY = Math.max(-1, Math.min(1, dBeta / 22));
    });
  }

  // iOS 13+ gates DeviceOrientationEvent behind an explicit permission
  // request that MUST be called synchronously from a user gesture — this is
  // called directly from the "Tilt my phone" button's click handler.
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
    this.selectedCrew = null;
    this.assign = { distractionA: null, distractionB: null, lookout: null };
    this.renderRoleUI();

    document.getElementById('heist-roles-confirm').onclick = () => {
      if (this.phase !== 'roles') return;
      if (!this.assignmentComplete()) return;
      this.showBriefing();
    };
    document.getElementById('heist-roles-clear').onclick = () => {
      if (this.phase !== 'roles') return;
      this.assign = { distractionA: null, distractionB: null, lookout: null };
      this.selectedCrew = null;
      this.renderRoleUI();
    };
  }

  assignmentComplete() {
    return HEIST_ROLES.every(r => this.assign[r.id]);
  }

  assignedRoleOf(crewId) {
    return HEIST_ROLES.find(r => this.assign[r.id] === crewId) || null;
  }

  renderRoleUI() {
    const crewRow = document.getElementById('heist-crew-row');
    crewRow.innerHTML = '';
    HEIST_CREW.forEach(c => {
      const role = this.assignedRoleOf(c.id);
      const card = document.createElement('button');
      card.className = 'heist-crew-card';
      if (this.selectedCrew === c.id) card.classList.add('selected');
      if (role) card.classList.add('assigned');
      card.style.borderColor = c.color;
      card.innerHTML = `
        <div class="heist-crew-name" style="color:${c.color}">${c.name}</div>
        <div class="heist-crew-origin">${c.origin}</div>
        <div class="heist-crew-verb">Plays on: ${c.verb}</div>
        <div class="heist-crew-slotline">${role ? role.name : 'Unassigned'}</div>`;
      card.onclick = () => {
        // Clicking an already-placed Eric pulls them back out of their slot.
        if (role) this.assign[role.id] = null;
        this.selectedCrew = this.selectedCrew === c.id ? null : c.id;
        this.renderRoleUI();
      };
      crewRow.appendChild(card);
    });

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
      const slot = document.createElement('button');
      slot.className = 'heist-role-slot';
      if (occupant) slot.classList.add('filled');
      slot.innerHTML = `
        <div class="heist-role-name">${r.name}</div>
        <div class="heist-role-sub">${r.sub}</div>
        <div class="heist-role-filled" style="${occupant ? `color:${occupant.color}` : ''}">
          ${occupant ? occupant.name : '— empty —'}
        </div>`;
      slot.onclick = () => {
        if (occupant && !this.selectedCrew) {
          // Tap a filled slot with nobody picked up: empty it.
          this.assign[r.id] = null;
          this.renderRoleUI();
          return;
        }
        if (!this.selectedCrew) return;
        const prev = this.assignedRoleOf(this.selectedCrew);
        if (prev) this.assign[prev.id] = null;
        this.assign[r.id] = this.selectedCrew;
        this.selectedCrew = null;
        this.renderRoleUI();
      };
      roleRow.appendChild(slot);
    });

    const hint = document.getElementById('heist-roles-hint');
    if (this.assignmentComplete()) {
      hint.textContent = 'Everyone has a job. Who you put where changes how their part of the job actually plays.';
    } else if (this.selectedCrew) {
      hint.textContent = `${getHeistCrew(this.selectedCrew).name} is picked up. Now choose a slot.`;
    } else {
      hint.textContent = 'Choose a name, then choose their slot. Tap a placed name again to pull them back.';
    }
    document.getElementById('heist-roles-confirm').disabled = !this.assignmentComplete();
  }

  // ------------------------------------------------
  // PHASE 0c — BRIEFING (the corkboard)
  // ------------------------------------------------

  showBriefing() {
    this.phase = 'briefing';
    this.showOverlay('heist-briefing');
    const list = document.getElementById('heist-plan-list');
    list.innerHTML = '';

    const rows = [
      { label: 'Thief', who: this.gameState.playerName || 'You', color: '#d4a574',
        text: 'Two thumbs on the register lock. Roll it to the shear line before anyone counts the seconds.' },
    ];
    HEIST_ROLES.forEach(r => {
      const c = getHeistCrew(this.assign[r.id]);
      rows.push({
        label: r.name,
        who: c.name,
        color: c.color,
        text: r.id === 'lookout' ? c.getawayBlurb : c.distractionBlurb,
      });
    });

    rows.forEach(row => {
      const el = document.createElement('div');
      el.className = 'heist-plan-row';
      el.innerHTML = `
        <div class="heist-plan-role">${row.label}</div>
        <div class="heist-plan-who" style="color:${row.color}">${row.who}</div>
        <div class="heist-plan-text">${row.text}</div>`;
      list.appendChild(el);
    });

    document.getElementById('heist-briefing-go').onclick = () => {
      if (this.phase !== 'briefing') return;
      this.startFloor();
    };
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

  floorZones() {
    return [
      { id: 'deli',     name: 'Deli Counter',   x: 34, y: 24 },
      { id: 'fish',     name: 'Fish Counter',   x: 58, y: 22 },
      { id: 'produce',  name: 'Produce Section', x: 30, y: 78 },
      { id: 'frozen',   name: 'Frozen Aisle',   x: 62, y: 80 },
      { id: 'checkout', name: 'Self-Checkout',  x: 78, y: 30 },
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
        produce: '[Tony at the produce section — line to be written]',
        frozen: '[Tony at the frozen aisle — line to be written]',
        checkout: '[Tony at self-checkout — line to be written]',
      },
      ruhul: {
        deli: '[Ruhul at the deli counter — line to be written]',
        fish: '[Ruhul at the fish counter — line to be written]',
        produce: '[Ruhul at the produce section — line to be written]',
        frozen: '[Ruhul at the frozen aisle — line to be written]',
        checkout: '[Ruhul at self-checkout — line to be written]',
      },
      dmitri: {
        deli: '[Dmitri at the deli counter — line to be written]',
        fish: '[Dmitri at the fish counter — line to be written]',
        produce: '[Dmitri at the produce section — line to be written]',
        frozen: '[Dmitri at the frozen aisle — line to be written]',
        checkout: '[Dmitri at self-checkout — line to be written]',
      },
    };
    return lines[crewId][zoneId];
  }

  startFloor() {
    this.stopLoop();
    this.hideOverlays();
    this.hideHud();
    this.phase = 'floor';

    const distractors = HEIST_ROLES.filter(r => r.id !== 'lookout')
      .map(r => getHeistCrew(this.assign[r.id]));

    // Everyone present starts at the entrance, staggered a little so they
    // aren't stacked on the same pixel.
    this.floorChars = [
      { id: 'thief', name: this.gameState.playerName || 'You', color: '#d4a574',
        x: 8, y: 50, tx: 8, ty: 50, speed: 0.62, heat: 0, pulled: false, isThief: true },
      ...distractors.map((c, i) => ({
        id: c.id, name: c.name, color: c.color, crew: c,
        x: 8, y: 50 + (i === 0 ? -8 : 8), tx: 8, ty: 50 + (i === 0 ? -8 : 8),
        speed: c.id === 'tony' ? 0.74 : c.id === 'dmitri' ? 0.5 : 0.62,
        heat: 0, pulled: false, isThief: false,
      })),
    ];
    this.floorActiveId = 'thief';

    // Each distractor gets one hotspot per zone, offset slightly so two
    // colors at the "same" zone don't sit on top of each other.
    this.floorHotspots = [];
    distractors.forEach((c, i) => {
      const jitter = i === 0 ? -3.5 : 3.5;
      this.floorZones().forEach(z => {
        this.floorHotspots.push({
          crewId: c.id, color: c.color, zoneId: z.id, zoneName: z.name,
          x: z.x + jitter, y: z.y + jitter * 0.6,
          triggered: false,
        });
      });
    });

    this.floorRegister = { x: 90, y: 50, r: 6 };

    // Fixed posts, each sweeping its own cone on its own clock so they don't
    // all turn in sync.
    // Two edge patrols (walking the full height, facing inward) so hugging a
    // wall isn't a free path anymore, plus one center patrol so the middle
    // still needs real timing rather than being the obviously-safe route.
    this.floorGuards = [
      { x: 15, y: 14, patrolAxis: 'y', patrolFixed: 15, patrolMin: 14, patrolMax: 86,
        patrolDir: 1, speed: 0.34, facing: 0, range: 24, halfAngle: 0.55, angle: 0,
        state: 'patrol', targetX: 0, targetY: 0, pauseTimer: 0, runSpeed: 0,
        homeX: 15, homeY: 14, frozen: false, freezeTimer: 0 },
      { x: 85, y: 86, patrolAxis: 'y', patrolFixed: 85, patrolMin: 14, patrolMax: 86,
        patrolDir: -1, speed: 0.34, facing: Math.PI, range: 24, halfAngle: 0.55, angle: Math.PI,
        state: 'patrol', targetX: 0, targetY: 0, pauseTimer: 0, runSpeed: 0,
        homeX: 85, homeY: 86, frozen: false, freezeTimer: 0 },
      { x: 34, y: 50, patrolAxis: 'x', patrolFixed: 50, patrolMin: 34, patrolMax: 66,
        patrolDir: 1, speed: 0.26, facing: -Math.PI / 2, range: 24, halfAngle: 0.6, angle: -Math.PI / 2,
        state: 'patrol', targetX: 0, targetY: 0, pauseTimer: 0, runSpeed: 0,
        homeX: 34, homeY: 50, frozen: false, freezeTimer: 0 },
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
      'Tap a crew icon above to take control of them, then tap the floor to send them there.';

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
    const W = this.canvas.width, H = this.canvas.height;
    return { x: W * 0.06, y: H * 0.16, w: W * 0.88, h: H * 0.76 };
  }

  floorClick(px, py) {
    if (this.phase !== 'floor') return;
    const active = this.floorChars.find(c => c.id === this.floorActiveId);
    if (!active || active.pulled) return;

    const b = this.floorBounds();
    const x = ((px - b.x) / b.w) * 100;
    const y = ((py - b.y) / b.h) * 100;
    if (x < -5 || x > 105 || y < -5 || y > 105) return;

    // Hit-test the active character's own, untriggered hotspots first.
    if (!active.isThief) {
      const spot = this.floorHotspots.find(h =>
        h.crewId === active.id && !h.triggered && Math.hypot(h.x - x, h.y - y) < 5);
      if (spot) {
        active.tx = spot.x; active.ty = spot.y; active.pendingHotspot = spot;
        return;
      }
    }
    active.tx = Math.max(2, Math.min(98, x));
    active.ty = Math.max(2, Math.min(98, y));
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

    if (char.id === 'tony') {
      // Loud: everyone within range runs over, hard and short.
      nearGuards.filter(({ d }) => d < 42).forEach(({ g }) => sendToInvestigate(g, 90));
      this.cash += 70;
    } else if (char.id === 'ruhul') {
      // Charm: just the nearest one, but they stick around much longer.
      if (nearGuards[0] && nearGuards[0].d < 55) sendToInvestigate(nearGuards[0].g, 260);
      this.cash += 85;
    } else {
      // The stall: doesn't lure anyone anywhere. Freezes the nearest guard
      // in place, wherever they currently are — they just stop walking.
      if (nearGuards[0] && nearGuards[0].d < 50) {
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

  floorLoop() {
    if (this.phase !== 'floor') return;
    this._frame++;
    this.updateAmbient();

    // Move every present, un-pulled character toward its own target.
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
    });

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
        g.angle = g.facing;
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
        }
      } else if (g.state === 'pause') {
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
    });

    // Heat: anyone (present, un-pulled) inside any guard's cone heats up;
    // otherwise cools down.
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
        return Math.abs(diff) < g.halfAngle;
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
    const toPx = (x, y) => [b.x + (x / 100) * b.w, b.y + (y / 100) * b.h];

    ctx.fillStyle = '#0e1416';
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = '#1c2528';
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 3;
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    for (let gx = 10; gx < 100; gx += 10) {
      const [px] = toPx(gx, 0);
      ctx.beginPath(); ctx.moveTo(px, b.y); ctx.lineTo(px, b.y + b.h); ctx.stroke();
    }

    ctx.font = '13px VT323, monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.textAlign = 'center';
    this.floorZones().forEach(z => {
      const [zx, zy] = toPx(z.x, z.y);
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.strokeRect(zx - 30, zy - 22, 60, 44);
      ctx.fillText(z.name.toUpperCase(), zx, zy - 28);
    });

    const [ex, ey] = toPx(6, 50);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillText('ENTRANCE', ex, ey - 40);
    const [rx, ry] = toPx(this.floorRegister.x, this.floorRegister.y);
    ctx.fillStyle = '#d4a574';
    ctx.fillRect(rx - 16, ry - 22, 32, 44);
    ctx.fillStyle = '#0e1416';
    ctx.font = '11px VT323, monospace';
    ctx.fillText('REGISTER', rx, ry + 40);

    // Cones, drawn before the guard bodies that own them
    this.floorGuards.forEach(g => {
      const [gx, gy] = toPx(g.x, g.y);
      const rangePx = (g.range / 100) * b.w;
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
      const [hx, hy] = toPx(h.x, h.y);
      ctx.beginPath();
      ctx.arc(hx, hy, 7, 0, Math.PI * 2);
      ctx.fillStyle = h.triggered ? h.color + '33' : h.color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });

    this.floorAmbient.forEach(a => this.drawAmbientEvent(a, toPx));

    this.floorGuards.forEach(g => {
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
    // Anything an Eric actually SAYS is the author's to write, not this file's.
    if (cfg.who) {
      const q = document.createElement('p');
      q.className = 'cannon-wiseman-line';
      q.textContent = '[Dialogue — to be written]';
      body.appendChild(q);
    }
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

  // The lock, reimagined as a labyrinth: tilt the board on two axes at once
  // (two thumbs, or mouse position on desktop) to roll a ball from the pins'
  // resting position to the shear line without dropping it down through the
  // housing. Real momentum, real holes, no scripted safety net beyond time.
  mazeLayout() {
    return {
      start: { x: 8, y: 12 },
      goal: { x: 50, y: 90, r: 6 },
      walls: [
        { x: 0,  y: 20, w: 70, h: 6 },  // gap on the right
        { x: 30, y: 46, w: 70, h: 6 },  // gap on the left
        { x: 0,  y: 72, w: 70, h: 6 },  // gap on the right
      ],
      holes: [
        { x: 78, y: 33, r: 4.2 },
        { x: 18, y: 59, r: 4.2 },
      ],
    };
  }

  startRegister() {
    this.stopLoop();
    this.hideOverlays();
    this.phase = 'maze';
    const t = HEIST_TUNING.maze;
    const layout = this.mazeLayout();

    this.mazeTiltX = 0;
    this.mazeTiltY = 0;
    this.mazeUseTilt = false;
    this._mazeTouches = {};
    this._mazeOrientBase = null;

    this.mech = {
      kind: 'maze',
      layout,
      ball: { x: layout.start.x, y: layout.start.y, vx: 0, vy: 0 },
      resets: 0,
      completed: false,
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
    this.showMazeChoice();
  }

  // Tilt needs an explicit, synchronous user gesture on iOS to unlock the
  // permission — so ask before the ball starts rolling instead of guessing.
  showMazeChoice() {
    this.showOverlay('heist-maze-choice');
    const hasOrientation = typeof window.DeviceOrientationEvent !== 'undefined';
    const tiltBtn = document.getElementById('heist-maze-choice-tilt');
    const note = document.getElementById('heist-maze-choice-note');
    tiltBtn.classList.toggle('hidden', !hasOrientation);
    note.textContent = hasOrientation
      ? 'Tilt rolls the ball like a real labyrinth toy. Thumbs work everywhere, including desktop.'
      : "This device doesn't seem to support tilt — thumbs it is.";

    tiltBtn.onclick = () => {
      this.requestTiltPermission((granted) => {
        if (this.phase !== 'maze') return;
        if (granted) {
          this.mazeUseTilt = true;
          this.beginMazeLoop('Tilt your phone left/right and forward/back to roll the ball.');
        } else {
          note.textContent = "Couldn't get tilt permission — using thumbs instead.";
          this.mazeUseTilt = false;
          this.beginMazeLoop('Two thumbs: left tilts left/right, right tilts up/down. (Mouse on desktop.)');
        }
      });
    };
    document.getElementById('heist-maze-choice-thumbs').onclick = () => {
      this.mazeUseTilt = false;
      this.beginMazeLoop('Two thumbs: left tilts left/right, right tilts up/down. (Mouse on desktop.)');
    };
  }

  beginMazeLoop(hint) {
    this.hideOverlays();
    const m = this.mech;
    this.showHud(
      'The lock — roll it to the shear line',
      hint,
      `+${m.bonusSeconds}s bought by the distractions`
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
      ball.x = Math.max(t.ballRadius, Math.min(100 - t.ballRadius, ball.x));
      ball.y = Math.max(t.ballRadius, Math.min(100 - t.ballRadius, ball.y));
      layout.walls.forEach(w => this.resolveWallCollision(ball, t.ballRadius, w));

      const inHole = layout.holes.find(h => Math.hypot(ball.x - h.x, ball.y - h.y) < h.r);
      if (inHole) {
        m.resets++;
        ball.x = layout.start.x; ball.y = layout.start.y; ball.vx = 0; ball.vy = 0;
        this.setHudHint('Down through the housing. Back to the start.',
          `+${m.bonusSeconds}s bought by the distractions`);
      }

      if (Math.hypot(ball.x - layout.goal.x, ball.y - layout.goal.y) < layout.goal.r) {
        m.completed = true;
        m.doneTimer = 40;
      }

      m.timeLeft--;
      if (m.timeLeft <= 0) { m.timeLeft = 0; this.endMaze(); return; }
      document.getElementById('heist-hud-meta').textContent =
        `${(m.timeLeft / 60).toFixed(1)}s before somebody looks over`;
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
    const m = this.mech;
    const secondsLeft = Math.max(0, m.timeLeft / 60);
    const earned = m.completed
      ? HEIST_TUNING.cashMazeComplete + Math.round(secondsLeft * HEIST_TUNING.cashPerSecondLeft)
      : Math.round(HEIST_TUNING.cashMazeComplete * 0.2);
    this.cash += earned;
    this.mazeCompleted = m.completed;
    this.mech = null;
    this.phase = 'register-result';

    const lines = m.completed
      ? ['The ball drops onto the shear line and the whole cylinder turns at once.',
         'You take what fits and leave what does not.']
      : ['The ball is still rolling around in there when you run out of time.',
         'Somebody in the back has stopped talking.'];

    this.showResult({
      title: m.completed ? 'Drawer open' : 'Out of time',
      who: null,
      lines,
      stats: [
        ['Dropped down the housing', `${m.resets} ${m.resets === 1 ? 'time' : 'times'}`],
        ['Seconds spare', secondsLeft.toFixed(1)],
        ['Register take', `$${earned}`],
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
      laneUp: () => { const g = this.mech; if (g && g.lane > 0) g.lane--; },
      laneDown: () => { const g = this.mech; if (g && g.lane < 2) g.lane++; },
    };
    this.mech.laneY = this.laneCenterY(1);

    // The chase can cost you at most 40% of what you walked out with. Losing
    // the entire take to a phase whose ending is scripted anyway would just be
    // punishing — the crashes need to sting, not erase the whole act.
    this.bagFloor = Math.round(this.cash * 0.6);

    this.showHud(
      `Getaway — ${driver.name} driving`,
      'Tap the top or bottom of the screen (or arrow keys) to change lanes.',
      cfg.label
    );
    this.input.onDown = (x, y) => {
      const g = this.mech;
      if (!g || g.kind !== 'getaway') return;
      if (y < this.canvas.height / 2) g.laneUp();
      else g.laneDown();
    };
    this.getawayLoop();
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

    g.dist += g.speed;
    g.offset += g.speed;
    g.bgOffset += g.speed * 0.28;
    if (g.hitFlash > 0) g.hitFlash--;
    if (g.invuln > 0) g.invuln--;
    g.sirens = Math.min(1, g.dist / g.cfg.distance);

    // Ease toward the target lane instead of snapping — reads as driving.
    const targetY = this.laneCenterY(g.lane);
    g.laneY += (targetY - g.laneY) * 0.22;

    g.spawnTimer--;
    if (g.spawnTimer <= 0) {
      g.spawnTimer = g.cfg.spawn + Math.floor(Math.random() * 22);
      this.spawnGetawayObstacle();
    }

    const px = this.canvas.width * 0.22;
    g.obstacles.forEach(o => {
      o.x -= g.speed;
      if (o.hit) return;
      if (Math.abs(o.x - px) < 44 && Math.abs(this.laneCenterY(o.lane) - g.laneY) < 34) {
        o.hit = true;
        if (g.invuln <= 0) {
          g.invuln = 45;
          g.hitFlash = 22;
          g.crashes++;
          this.cash = Math.max(this.bagFloor, this.cash - HEIST_TUNING.cashLostPerCrash);
        }
      }
    });
    g.obstacles = g.obstacles.filter(o => o.x > -120);

    document.getElementById('heist-hud-meta').textContent =
      `$${this.cash} in the bag · ${Math.round(g.sirens * 100)}% of the way to the bridge`;

    if (g.dist >= g.cfg.distance) {
      this.crashes = g.crashes;
      this.stopLoop();
      this.hideHud();
      this.mech = null;
      this.showEnding();
      return;
    }

    this.drawStreetScene();
    this._af = requestAnimationFrame(() => this.getawayLoop());
  }

  spawnGetawayObstacle() {
    const kinds = ['cab', 'cart', 'pothole', 'dumpster', 'cones'];
    const type = kinds[Math.floor(Math.random() * kinds.length)];
    const lane = Math.floor(Math.random() * 3);
    this.mech.obstacles.push({ type, lane, x: this.canvas.width + 80, hit: false });
    // A second obstacle sometimes, but never filling every lane — there is
    // always a gap to steer into.
    if (Math.random() < 0.35) {
      let other = Math.floor(Math.random() * 3);
      if (other === lane) other = (lane + 1) % 3;
      this.mech.obstacles.push({
        type: kinds[Math.floor(Math.random() * kinds.length)],
        lane: other, x: this.canvas.width + 80 + 40 + Math.random() * 90, hit: false,
      });
    }
  }

  // ------------------------------------------------
  // ENDING — scripted capture, then the Act 3 stub
  // ------------------------------------------------

  showEnding() {
    this.phase = 'ending';
    this.stopLoop();
    this.bustLoop();

    const driver = getHeistCrew(this.assign.lookout);
    const clean = this.crashes === 0;
    const flavor = clean
      ? `${driver.name} drove it clean. Not one scratch on the car. It will be photographed from six angles later tonight.`
      : `${driver.name} took ${this.crashes} ${this.crashes === 1 ? 'hit' : 'hits'} on the way out. Every one of them is on a doorbell camera.`;

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
    const W = this.canvas.width, H = this.canvas.height;
    const side = Math.min(W * 0.86, H * 0.72);
    return { x: (W - side) / 2, y: H * 0.15, w: side, h: side };
  }

  drawMazeScene() {
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    const m = this.mech;
    const b = this.mazeBounds();
    const toPx = (x, y) => [b.x + (x / 100) * b.w, b.y + (y / 100) * b.h];
    const toPxLen = (v) => (v / 100) * b.w;

    ctx.fillStyle = '#0e1315';
    ctx.fillRect(0, 0, W, H);

    // The board itself — subtly tilted-looking via a gradient, so it reads
    // as a physical thing you're rocking, not a flat diagram.
    ctx.save();
    ctx.translate(b.x + b.w / 2, b.y + b.h / 2);
    ctx.rotate((this.mazeTiltX - this.mazeTiltY) * 0.02);
    ctx.translate(-(b.x + b.w / 2), -(b.y + b.h / 2));
    const boardGrad = ctx.createLinearGradient(b.x, b.y, b.x + b.w, b.y + b.h);
    boardGrad.addColorStop(0, '#2a2018');
    boardGrad.addColorStop(1, '#1c150f');
    ctx.fillStyle = boardGrad;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = '#4a3a28'; ctx.lineWidth = 6;
    ctx.strokeRect(b.x, b.y, b.w, b.h);

    if (!m) { ctx.restore(); return; }
    const layout = m.layout;

    // Holes
    layout.holes.forEach(h => {
      const [hx, hy] = toPx(h.x, h.y);
      const r = toPxLen(h.r);
      const g = ctx.createRadialGradient(hx, hy, r * 0.1, hx, hy, r);
      g.addColorStop(0, '#000'); g.addColorStop(1, '#1a1008');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(hx, hy, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.stroke();
    });

    // Walls
    layout.walls.forEach(w => {
      const [wx, wy] = toPx(w.x, w.y);
      ctx.fillStyle = '#6a5a44';
      ctx.fillRect(wx, wy, toPxLen(w.w), toPxLen(w.h));
      ctx.strokeStyle = '#3a2f22'; ctx.lineWidth = 2;
      ctx.strokeRect(wx, wy, toPxLen(w.w), toPxLen(w.h));
    });

    // Goal
    const [gx, gy] = toPx(layout.goal.x, layout.goal.y);
    const gr = toPxLen(layout.goal.r);
    ctx.strokeStyle = m.completed ? '#2ecc71' : '#d4a574';
    ctx.lineWidth = 3;
    ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.arc(gx, gy, gr, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = m.completed ? '#2ecc71' : '#8a7a5a';
    ctx.font = '11px VT323, monospace'; ctx.textAlign = 'center';
    ctx.fillText('SHEAR LINE', gx, gy + gr + 16);

    // Ball
    const [bx2, by2] = toPx(m.ball.x, m.ball.y);
    const br = toPxLen(HEIST_TUNING.maze.ballRadius);
    ctx.beginPath();
    ctx.arc(bx2, by2, br, 0, Math.PI * 2);
    const ballGrad = ctx.createRadialGradient(bx2 - br * 0.3, by2 - br * 0.3, br * 0.1, bx2, by2, br);
    ballGrad.addColorStop(0, '#f0e8d8'); ballGrad.addColorStop(1, '#a89878');
    ctx.fillStyle = ballGrad;
    ctx.fill();
    ctx.strokeStyle = '#5a4a30'; ctx.lineWidth = 1.5; ctx.stroke();

    ctx.restore();

    // Pressure timer, drawn outside the tilt transform so it stays level
    const frac = Math.max(0, m.timeLeft / ((HEIST_TUNING.maze.timeLimit + (m.bonusSeconds || 0)) * 60));
    const tw = W * 0.72, tx = W * 0.14, ty = H * 0.06;
    ctx.fillStyle = '#191919';
    ctx.fillRect(tx, ty, tw, 14);
    ctx.fillStyle = frac > 0.45 ? '#7ec89a' : frac > 0.2 ? '#d4a574' : '#e05a4a';
    ctx.fillRect(tx, ty, tw * frac, 14);
    ctx.strokeStyle = '#5a4a3a'; ctx.lineWidth = 2;
    ctx.strokeRect(tx, ty, tw, 14);

    // Two control zones, faintly marked at the bottom on mobile so the split
    // is discoverable without reading the hint text.
    if ('ontouchstart' in window && !this.mazeUseTilt) {
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fillRect(0, H * 0.9, W / 2, H * 0.1);
      ctx.fillRect(W / 2, H * 0.9, W / 2, H * 0.1);
      ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(W / 2, H * 0.9); ctx.lineTo(W / 2, H); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.font = '13px VT323, monospace'; ctx.textAlign = 'center';
      ctx.fillText('LEFT / RIGHT', W * 0.25, H * 0.965);
      ctx.fillText('UP / DOWN', W * 0.75, H * 0.965);
    }
  }

  // --- the getaway street
  drawStreetScene() {
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    const g = this.mech;

    // Night sky
    const sky = ctx.createLinearGradient(0, 0, 0, H * 0.52);
    sky.addColorStop(0, '#0a1020');
    sky.addColorStop(1, '#2a2036');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H * 0.52);

    // Parallax building silhouettes
    const drawBuildings = (off, scale, color, baseY) => {
      ctx.fillStyle = color;
      const bw = 90 * scale;
      const start = -((off % bw) + bw);
      for (let x = start, i = 0; x < W + bw; x += bw, i++) {
        const seed = Math.abs(Math.floor((x + off) / bw));
        const h = (60 + ((seed * 37) % 90)) * scale;
        ctx.fillRect(x, baseY - h, bw - 6, h);
        ctx.fillStyle = 'rgba(255,220,150,0.35)';
        for (let k = 0; k < 4; k++) {
          if ((seed + k) % 3 === 0) ctx.fillRect(x + 8 + (k % 2) * 22, baseY - h + 10 + k * 16, 8, 10);
        }
        ctx.fillStyle = color;
      }
    };
    drawBuildings(g.bgOffset * 0.4, 1.4, '#141b2c', H * 0.52);
    drawBuildings(g.bgOffset, 1.0, '#0d1220', H * 0.53);

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

    // Getaway car
    const px = W * 0.22;
    const shake = g.hitFlash > 0 ? (Math.random() - 0.5) * 8 : 0;
    this.drawGetawayCar(px + shake, g.laneY + shake, g);

    // Sirens chasing from the left, closing as the run goes on
    const sx = -60 + g.sirens * (W * 0.16);
    const blue = Math.floor(this._frame / 8) % 2 === 0;
    ctx.fillStyle = '#151821';
    ctx.fillRect(sx, this.laneCenterY(1) - 16, 70, 30);
    ctx.fillStyle = blue ? '#4a7bd8' : '#d84a4a';
    ctx.fillRect(sx + 22, this.laneCenterY(1) - 24, 26, 8);
    const glow = ctx.createRadialGradient(sx + 35, this.laneCenterY(1) - 20, 4, sx + 35, this.laneCenterY(1) - 20, 130);
    glow.addColorStop(0, blue ? 'rgba(74,123,216,0.30)' : 'rgba(216,74,74,0.30)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(sx - 100, this.laneCenterY(1) - 150, 300, 300);

    // Progress bar
    const pw = W * 0.7, pxx = W * 0.15, py = H * 0.045;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(pxx - 4, py - 4, pw + 8, 18);
    ctx.fillStyle = '#191919';
    ctx.fillRect(pxx, py, pw, 10);
    ctx.fillStyle = '#d4a574';
    ctx.fillRect(pxx, py, pw * Math.min(1, g.dist / g.cfg.distance), 10);

    if (g.hitFlash > 0) {
      ctx.fillStyle = `rgba(224,90,74,${0.16 * (g.hitFlash / 22)})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  drawObstacle(o) {
    const ctx = this.ctx;
    const y = this.laneCenterY(o.lane);
    const x = o.x;
    ctx.globalAlpha = o.hit ? 0.45 : 1;
    switch (o.type) {
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
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(x, y + 18, 44, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    const body = g.invuln > 0 && Math.floor(this._frame / 4) % 2 === 0 ? '#8a2b22' : '#b23227';
    ctx.fillStyle = body;
    ctx.fillRect(x - 44, y - 16, 88, 32);
    ctx.fillStyle = '#c8402f';
    ctx.fillRect(x - 30, y - 26, 54, 12);
    ctx.fillStyle = '#1b2a33';
    ctx.fillRect(x - 26, y - 24, 22, 9);
    ctx.fillRect(x + 2, y - 24, 20, 9);
    ctx.fillStyle = '#111';
    ctx.fillRect(x - 34, y + 14, 16, 8);
    ctx.fillRect(x + 18, y + 14, 16, 8);
    // Cash bag on the roof rack, because of course it is
    ctx.fillStyle = '#d9c9a3';
    ctx.fillRect(x + 26, y - 34, 16, 12);
    ctx.fillStyle = '#4a4038';
    ctx.font = '11px VT323, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('$', x + 34, y - 25);
    // Headlight wash forward
    const hl = ctx.createLinearGradient(x + 44, y, x + 180, y);
    hl.addColorStop(0, 'rgba(255,240,200,0.22)');
    hl.addColorStop(1, 'rgba(255,240,200,0)');
    ctx.fillStyle = hl;
    ctx.fillRect(x + 44, y - 18, 140, 36);
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
