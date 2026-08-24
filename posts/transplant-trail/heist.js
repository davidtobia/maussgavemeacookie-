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
  tony: { rounds: 3, speed: 2.4, zone: 24, roundTime: 5.0 },
  ruhul: {
    rounds: 4,
    rate: 1.0,
    bands: [[58, 94], [60, 92], [62, 90], [64, 88]],
  },
  dmitri: { thrust: 0.26, grav: 0.17, damp: 0.90, zoneH: 22, duration: 14, target: 5.5 },
  register: {
    timeLimit: 25,
    missPenalty: 3,
    tumblers: [
      { speed: 1.7, width: 28 },
      { speed: 2.1, width: 24 },
      { speed: 2.5, width: 20 },
      { speed: 2.9, width: 18 },
    ],
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
  cashPerDistractionPoint: 1.5,   // 0-100 score => up to $150 each
  cashPerTumbler: 120,
  cashPerSecondLeft: 8,
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
    this.distractionScores = {};
    this.crashes = 0;
    this.tumblersSet = 0;

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
    this.showIntro();
  }

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width = rect.width || window.innerWidth;
    this.canvas.height = rect.height || window.innerHeight;
  }

  bindInput() {
    if (this._bound) return;
    this._bound = true;

    const press = (y) => {
      if (this.input.down) return;
      this.input.down = true;
      this.input.tapY = y;
      if (this.input.onDown) this.input.onDown(y);
    };
    const release = () => {
      if (!this.input.down) return;
      this.input.down = false;
      if (this.input.onUp) this.input.onUp();
    };

    this.canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const r = this.canvas.getBoundingClientRect();
      press(e.clientY - r.top);
    });
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);

    document.addEventListener('keydown', (e) => {
      if (!this.isActiveScreen()) return;
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        if (!e.repeat) press(this.canvas.height / 2);
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
        text: 'Four tumblers on the register drawer. Set them all before anyone counts the seconds.' },
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
      this.startDistraction(0);
    };
  }

  // ------------------------------------------------
  // PHASE 1 — DISTRACTIONS
  // ------------------------------------------------

  startDistraction(index) {
    this.stopLoop();
    this.hideOverlays();
    this.distractionIndex = index;
    const roleId = index === 0 ? 'distractionA' : 'distractionB';
    const crew = getHeistCrew(this.assign[roleId]);
    this.currentDistraction = { roleId, crew };
    this.phase = 'distraction';

    if (crew.id === 'tony') this.runTonyDistraction(crew, roleId);
    else if (crew.id === 'ruhul') this.runRuhulDistraction(crew, roleId);
    else this.runDmitriDistraction(crew, roleId);
  }

  // --- Big Tony: reflex. Fast sweep, narrow window, three shoves.
  runTonyDistraction(crew, roleId) {
    const t = HEIST_TUNING.tony;
    const roleName = HEIST_ROLES.find(r => r.id === roleId).name;
    this.showHud(
      `${roleName} — ${crew.name}`,
      'TAP when the marker is in the red band. Tony does not wait.',
      `Shove 1 of ${t.rounds}`
    );

    this.mech = {
      kind: 'tony', crew, roleId,
      pos: 0, dir: 1, round: 0, hits: 0, rounds: t.rounds,
      zoneCenter: 30 + Math.random() * 40,
      flash: 0, flashGood: false, doneTimer: 0,
    };
    this.input.onDown = () => this.tonyTap();
    this.tonyLoop();
  }

  tonyTap() {
    const m = this.mech;
    if (!m || m.kind !== 'tony' || m.doneTimer > 0) return;
    const t = HEIST_TUNING.tony;
    const hit = Math.abs(m.pos - m.zoneCenter) < t.zone / 2;
    if (hit) m.hits++;
    m.flash = 18;
    m.flashGood = hit;
    m.round++;
    m.zoneCenter = 26 + Math.random() * 48;
    m.pos = Math.random() * 100;
    if (m.round >= m.rounds) {
      m.doneTimer = 45;
    } else {
      this.setHudHint(hit ? 'Landed. Go again.' : 'Missed — he is already committed to the next one.',
        `Shove ${m.round + 1} of ${m.rounds}`);
    }
  }

  tonyLoop() {
    const m = this.mech;
    if (!m || m.kind !== 'tony') return;
    const t = HEIST_TUNING.tony;
    this._frame++;
    if (m.flash > 0) m.flash--;
    if (m.doneTimer > 0) {
      m.doneTimer--;
      if (m.doneTimer === 0) {
        this.endDistraction(Math.round((m.hits / m.rounds) * 100),
          `${m.hits} of ${m.rounds} shoves landed.`);
        return;
      }
    } else {
      m.pos += t.speed * m.dir;
      if (m.pos >= 100) { m.pos = 100; m.dir = -1; }
      if (m.pos <= 0) { m.pos = 0; m.dir = 1; }
    }
    this.drawStoreScene();
    this.drawSweepGauge(m.pos, m.zoneCenter, t.zone, '#e05a4a', m.flash, m.flashGood,
      `${m.hits} landed`);
    this._af = requestAnimationFrame(() => this.tonyLoop());
  }

  // --- Ruhul: charm. Hold to build the patter, let go before you oversell it.
  runRuhulDistraction(crew, roleId) {
    const t = HEIST_TUNING.ruhul;
    const roleName = HEIST_ROLES.find(r => r.id === roleId).name;
    this.showHud(
      `${roleName} — ${crew.name}`,
      'HOLD to keep talking. RELEASE inside the green band. Wide band — he has room to work.',
      `Beat 1 of ${t.rounds}`
    );

    this.mech = {
      kind: 'ruhul', crew, roleId,
      meter: 0, round: 0, quality: [], rounds: t.rounds,
      band: t.bands[0], oversold: 0, flash: 0, flashGood: false, doneTimer: 0,
    };
    this.input.onUp = () => this.ruhulRelease();
    this.ruhulLoop();
  }

  ruhulRelease() {
    const m = this.mech;
    if (!m || m.kind !== 'ruhul' || m.doneTimer > 0) return;
    if (m.meter <= 2) return; // stray click, not a real release
    const [lo, hi] = m.band;
    let q = 0;
    if (m.meter >= lo && m.meter <= hi) {
      // Landing anywhere in the band works; landing high in it works better.
      q = 0.6 + 0.4 * ((m.meter - lo) / (hi - lo));
    }
    m.quality.push(q);
    m.flash = 18;
    m.flashGood = q > 0;
    this.advanceRuhulRound();
  }

  advanceRuhulRound() {
    const m = this.mech, t = HEIST_TUNING.ruhul;
    m.round++;
    m.meter = 0;
    m.band = t.bands[Math.min(m.round, t.bands.length - 1)];
    if (m.round >= m.rounds) {
      m.doneTimer = 45;
    } else {
      this.setHudHint(
        m.flashGood ? 'That landed. Keep him going.' : 'Oversold it. He resets and tries another angle.',
        `Beat ${m.round + 1} of ${m.rounds}`
      );
    }
  }

  ruhulLoop() {
    const m = this.mech;
    if (!m || m.kind !== 'ruhul') return;
    const t = HEIST_TUNING.ruhul;
    this._frame++;
    if (m.flash > 0) m.flash--;
    if (m.doneTimer > 0) {
      m.doneTimer--;
      if (m.doneTimer === 0) {
        const avg = m.quality.reduce((a, b) => a + b, 0) / m.rounds;
        const landed = m.quality.filter(q => q > 0).length;
        this.endDistraction(Math.round(avg * 100), `${landed} of ${m.rounds} beats landed clean.`);
        return;
      }
    } else if (this.input.down) {
      m.meter += t.rate;
      if (m.meter >= 100) {
        // Went past the point of being charming. No penalty beyond the reset.
        m.meter = 100;
        m.quality.push(0);
        m.flash = 18; m.flashGood = false;
        this.advanceRuhulRound();
      }
    } else {
      m.meter = Math.max(0, m.meter - t.rate * 0.5);
    }
    this.drawStoreScene();
    this.drawFillGauge(m.meter, m.band, '#5dc46a', m.flash, m.flashGood,
      `${m.quality.filter(q => q > 0).length} landed`);
    this._af = requestAnimationFrame(() => this.ruhulLoop());
  }

  // --- Dmitri: the stall. Not a lure — hold a person in place, indefinitely.
  runDmitriDistraction(crew, roleId) {
    const t = HEIST_TUNING.dmitri;
    const roleName = HEIST_ROLES.find(r => r.id === roleId).name;
    this.showHud(
      `${roleName} — ${crew.name}`,
      'HOLD and release to keep the needle inside the box. Bank enough seconds and nobody goes anywhere.',
      'Stalled: 0.0s'
    );

    this.mech = {
      kind: 'dmitri', crew, roleId,
      y: 45, vy: 0, inZone: 0, t: 0,
      duration: t.duration * 60, target: t.target,
    };
    this.dmitriLoop();
  }

  dmitriZoneCenter(f) {
    return 50 + 26 * Math.sin(f / 70) + 9 * Math.sin(f / 29);
  }

  dmitriLoop() {
    const m = this.mech;
    if (!m || m.kind !== 'dmitri') return;
    const t = HEIST_TUNING.dmitri;
    this._frame++;
    m.t++;

    const zc = this.dmitriZoneCenter(m.t);
    m.vy += this.input.down ? t.thrust : -t.grav;
    m.vy *= t.damp;
    m.y += m.vy;
    if (m.y < 0) { m.y = 0; m.vy = 0; }
    if (m.y > 100) { m.y = 100; m.vy = 0; }
    const inside = Math.abs(m.y - zc) < t.zoneH / 2;
    if (inside) m.inZone++;

    const banked = m.inZone / 60;
    this.setHudHint(
      inside ? 'He is still asking the question. Hold it there.' : 'The needle drifted. Get it back in the box.',
      `Stalled: ${banked.toFixed(1)}s / ${t.target.toFixed(1)}s`
    );

    if (m.t >= m.duration) {
      const score = Math.round(Math.min(1, banked / t.target) * 100);
      this.endDistraction(score, `${banked.toFixed(1)} seconds of a conversation nobody could leave.`);
      return;
    }

    this.drawStoreScene();
    this.drawStallGauge(m.y, zc, t.zoneH, inside, banked, t.target, '#6f9be0');
    this._af = requestAnimationFrame(() => this.dmitriLoop());
  }

  endDistraction(score, summary) {
    this.stopLoop();
    this.hideHud();
    this.mech = null;
    const { crew, roleId } = this.currentDistraction;
    const earned = Math.round(score * HEIST_TUNING.cashPerDistractionPoint);
    this.cash += earned;
    this.distractionScores[roleId] = score;
    this.phase = 'distraction-result';

    const grade = score >= 85 ? 'Textbook.' : score >= 55 ? 'Good enough. Nobody looked at the counter.' :
      score >= 25 ? 'Messy, but the counter was clear for a second.' :
      'Barely a distraction. You will be working faster than planned.';

    this.showResult({
      title: `${HEIST_ROLES.find(r => r.id === roleId).name} — done`,
      who: crew,
      lines: [summary, grade],
      stats: [['Performance', `${score} / 100`], ['Take so far', `$${this.cash}`]],
      buttonLabel: this.distractionIndex === 0 ? 'Next distraction' : 'Get to the register',
      onContinue: () => {
        if (this.distractionIndex === 0) this.startDistraction(1);
        else this.startRegister();
      },
    });
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

  startRegister() {
    this.stopLoop();
    this.hideOverlays();
    this.phase = 'register';
    const t = HEIST_TUNING.register;

    this.mech = {
      kind: 'register',
      index: 0,
      tumblers: t.tumblers.map((tb, i) => ({
        ...tb,
        pos: Math.random() * 100,
        dir: Math.random() < 0.5 ? 1 : -1,
        center: 25 + Math.random() * 50,
        set: false,
      })),
      timeLeft: t.timeLimit * 60,
      flash: 0, flashGood: false, doneTimer: 0, failed: false,
    };

    // Distraction quality buys you a little breathing room — the better the
    // Erics did, the longer before anyone looks over at the counter.
    const avgDist = (this.distractionScores.distractionA + this.distractionScores.distractionB) / 2;
    const bonusSeconds = Math.round((avgDist / 100) * 5);
    this.mech.timeLeft += bonusSeconds * 60;
    this.mech.bonusSeconds = bonusSeconds;

    this.showHud(
      'The register — four tumblers',
      'TAP to set each tumbler when the pin crosses the lit band.',
      `+${bonusSeconds}s bought by the distractions`
    );
    this.input.onDown = () => this.registerTap();
    this.registerLoop();
  }

  registerTap() {
    const m = this.mech;
    if (!m || m.kind !== 'register' || m.doneTimer > 0) return;
    const tb = m.tumblers[m.index];
    if (!tb) return;
    const hit = Math.abs(tb.pos - tb.center) < tb.width / 2;
    m.flash = 16;
    m.flashGood = hit;
    if (hit) {
      tb.set = true;
      m.index++;
      if (m.index >= m.tumblers.length) {
        m.doneTimer = 40;
      } else {
        this.setHudHint(`Tumbler ${m.index} set. ${m.tumblers.length - m.index} to go.`);
      }
    } else {
      // A miss costs seconds, not the run. There is no dead end here.
      m.timeLeft -= HEIST_TUNING.register.missPenalty * 60;
      tb.center = 22 + Math.random() * 56;
      this.setHudHint(`Slipped. -${HEIST_TUNING.register.missPenalty}s.`);
    }
  }

  registerLoop() {
    const m = this.mech;
    if (!m || m.kind !== 'register') return;
    this._frame++;
    if (m.flash > 0) m.flash--;

    if (m.doneTimer > 0) {
      m.doneTimer--;
      if (m.doneTimer === 0) { this.endRegister(); return; }
    } else {
      m.timeLeft--;
      if (m.timeLeft <= 0) { m.timeLeft = 0; m.failed = true; this.endRegister(); return; }
      const tb = m.tumblers[m.index];
      if (tb) {
        tb.pos += tb.speed * tb.dir;
        if (tb.pos >= 100) { tb.pos = 100; tb.dir = -1; }
        if (tb.pos <= 0) { tb.pos = 0; tb.dir = 1; }
      }
      document.getElementById('heist-hud-meta').textContent =
        `${(m.timeLeft / 60).toFixed(1)}s before somebody looks over`;
    }

    this.drawRegisterScene();
    this._af = requestAnimationFrame(() => this.registerLoop());
  }

  endRegister() {
    this.stopLoop();
    this.hideHud();
    const m = this.mech;
    const set = m.tumblers.filter(t => t.set).length;
    const secondsLeft = Math.max(0, m.timeLeft / 60);
    const earned = set * HEIST_TUNING.cashPerTumbler +
      Math.round(secondsLeft * HEIST_TUNING.cashPerSecondLeft);
    this.cash += earned;
    this.tumblersSet = set;
    this.mech = null;
    this.phase = 'register-result';

    const lines = set === m.tumblers.length
      ? ['The drawer comes open with a sound like a cash register, because it is one.',
         'You take what fits and leave what does not.']
      : ['The drawer only ever comes half open. You get an arm in and grab what you can reach.',
         'Somebody in the back has stopped talking.'];

    this.showResult({
      title: set === m.tumblers.length ? 'Drawer open' : 'Drawer half open',
      who: null,
      lines,
      stats: [
        ['Tumblers set', `${set} / ${m.tumblers.length}`],
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
    this.input.onDown = (y) => {
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
      tumblersSet: this.tumblersSet,
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

  // --- the target store interior, used behind both distractions
  drawStoreScene() {
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    ctx.fillStyle = '#131a1c';
    ctx.fillRect(0, 0, W, H);

    // Fluorescent ceiling
    ctx.fillStyle = '#1d282b';
    ctx.fillRect(0, 0, W, H * 0.16);
    for (let i = 0; i < 4; i++) {
      const lx = W * (0.14 + i * 0.24);
      ctx.fillStyle = '#e8f4f0';
      ctx.globalAlpha = 0.85;
      ctx.fillRect(lx - 46, H * 0.09, 92, 8);
      ctx.globalAlpha = 1;
      const g = ctx.createRadialGradient(lx, H * 0.11, 6, lx, H * 0.11, H * 0.5);
      g.addColorStop(0, 'rgba(220,240,235,0.16)');
      g.addColorStop(1, 'rgba(220,240,235,0)');
      ctx.fillStyle = g;
      ctx.fillRect(lx - W * 0.3, H * 0.09, W * 0.6, H * 0.7);
    }

    // Shelving with product blocks
    const shelfTop = H * 0.22, shelfH = H * 0.34;
    ctx.fillStyle = '#222e31';
    ctx.fillRect(0, shelfTop, W, shelfH);
    const colors = ['#c1443a', '#d4a574', '#4f8f5e', '#c9a227', '#7a6bb5', '#3f7f9c'];
    for (let r = 0; r < 4; r++) {
      const y = shelfTop + 10 + r * (shelfH / 4);
      ctx.fillStyle = '#171f21';
      ctx.fillRect(0, y + shelfH / 4 - 14, W, 5);
      for (let x = 8; x < W; x += 19) {
        const idx = Math.abs(Math.floor(Math.sin(x * 3.1 + r * 7.7) * 97)) % colors.length;
        ctx.fillStyle = colors[idx];
        ctx.globalAlpha = 0.75;
        ctx.fillRect(x, y, 13, shelfH / 4 - 26);
        ctx.globalAlpha = 1;
      }
    }

    // Floor
    ctx.fillStyle = '#1a2224';
    ctx.fillRect(0, shelfTop + shelfH, W, H - shelfTop - shelfH);
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    for (let x = 0; x < W + 200; x += 70) {
      ctx.beginPath();
      ctx.moveTo(x, shelfTop + shelfH);
      ctx.lineTo(x - 90, H);
      ctx.stroke();
    }

    // Counter + register on the right, clerk being pulled away from it
    const cx = W * 0.78, cy = shelfTop + shelfH;
    ctx.fillStyle = '#2c2320';
    ctx.fillRect(cx - 10, cy - 10, W * 0.3, H * 0.14);
    ctx.fillStyle = '#4a4038';
    ctx.fillRect(cx + 30, cy - 42, 62, 34);
    ctx.fillStyle = '#7ec8a0';
    ctx.fillRect(cx + 38, cy - 36, 46, 12);

    const crew = this.currentDistraction ? this.currentDistraction.crew : null;
    // The clerk, drifting toward whatever is happening
    const sway = Math.sin(this._frame / 30) * 8;
    this.drawSilhouette(W * 0.62 + sway, cy + H * 0.11, 0.95, '#0d1416');
    // The Eric doing the work, in their own color
    if (crew) {
      const bob = crew.id === 'tony' ? Math.sin(this._frame / 5) * 5 :
        crew.id === 'ruhul' ? Math.sin(this._frame / 18) * 3 : 0;
      this.drawSilhouette(W * 0.42 + bob, cy + H * 0.11, 1.02, crew.color + 'dd');
    }
    // You, at the edge of frame, waiting
    this.drawSilhouette(W * 0.92, cy + H * 0.12, 1.0, '#0a1012');

    ctx.fillStyle = 'rgba(0,0,0,0.34)';
    ctx.fillRect(0, H * 0.72, W, H * 0.28);
  }

  // Horizontal sweeping gauge (Tony, and reused conceptually by the register)
  drawSweepGauge(pos, center, width, color, flash, flashGood, subLabel) {
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    const bx = W * 0.12, bw = W * 0.76, by = H * 0.80, bh = 34;

    ctx.fillStyle = 'rgba(0,0,0,0.78)';
    ctx.fillRect(bx - 8, by - 8, bw + 16, bh + 16);
    ctx.fillStyle = '#191919';
    ctx.fillRect(bx, by, bw, bh);

    const zx = bx + ((center - width / 2) / 100) * bw;
    const zw = (width / 100) * bw;
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.34;
    ctx.fillRect(zx, by, zw, bh);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(zx, by, zw, bh);

    const mx = bx + (pos / 100) * bw;
    ctx.fillStyle = flash > 0 ? (flashGood ? '#8ef0a0' : '#ff7b6b') : '#ffffff';
    ctx.fillRect(mx - 3, by - 10, 6, bh + 20);

    ctx.strokeStyle = '#5a4a3a';
    ctx.lineWidth = 2;
    ctx.strokeRect(bx, by, bw, bh);

    ctx.fillStyle = '#d4a574';
    ctx.font = '20px VT323, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(subLabel || '', bx, by - 16);

    if (flash > 0) {
      ctx.fillStyle = flashGood ? 'rgba(140,240,160,0.10)' : 'rgba(255,110,90,0.10)';
      ctx.fillRect(0, 0, W, H);
    }
  }

  // Vertical fill meter with a release band (Ruhul)
  drawFillGauge(meter, band, color, flash, flashGood, subLabel) {
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    const gw = 62, gh = H * 0.46;
    const gx = W * 0.10, gy = H * 0.30;

    ctx.fillStyle = 'rgba(0,0,0,0.78)';
    ctx.fillRect(gx - 10, gy - 34, gw + 20, gh + 52);
    ctx.fillStyle = '#191919';
    ctx.fillRect(gx, gy, gw, gh);

    const [lo, hi] = band;
    const byTop = gy + gh * (1 - hi / 100);
    const bandH = gh * ((hi - lo) / 100);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.30;
    ctx.fillRect(gx, byTop, gw, bandH);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(gx, byTop, gw, bandH);

    const fh = gh * (meter / 100);
    ctx.fillStyle = flash > 0 ? (flashGood ? '#8ef0a0' : '#ff7b6b') : color;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(gx + 4, gy + gh - fh, gw - 8, fh);
    ctx.globalAlpha = 1;

    ctx.strokeStyle = '#5a4a3a';
    ctx.strokeRect(gx, gy, gw, gh);

    ctx.fillStyle = '#d4a574';
    ctx.font = '20px VT323, monospace';
    ctx.textAlign = 'left';
    ctx.fillText('PATTER', gx, gy - 12);
    ctx.fillText(subLabel || '', gx, gy + gh + 24);

    // Hold indicator
    ctx.fillStyle = this.input.down ? '#5dc46a' : '#4a4038';
    ctx.fillRect(gx, gy + gh + 34, gw, 10);
  }

  // Vertical needle held inside a drifting box (Dmitri)
  drawStallGauge(y, zoneCenter, zoneH, inside, banked, target, color) {
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    const gw = 74, gh = H * 0.50;
    const gx = W * 0.09, gy = H * 0.26;

    ctx.fillStyle = 'rgba(0,0,0,0.78)';
    ctx.fillRect(gx - 10, gy - 34, gw + 20, gh + 74);
    ctx.fillStyle = '#191919';
    ctx.fillRect(gx, gy, gw, gh);

    const toY = (v) => gy + gh * (1 - v / 100);
    const zTop = toY(zoneCenter + zoneH / 2);
    const zH = gh * (zoneH / 100);
    ctx.fillStyle = inside ? color : '#4a4038';
    ctx.globalAlpha = 0.30;
    ctx.fillRect(gx, zTop, gw, zH);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = inside ? color : '#6a5a4a';
    ctx.lineWidth = 2;
    ctx.strokeRect(gx, zTop, gw, zH);

    ctx.fillStyle = inside ? '#8ef0a0' : '#ffffff';
    ctx.fillRect(gx - 6, toY(y) - 3, gw + 12, 6);

    ctx.strokeStyle = '#5a4a3a';
    ctx.strokeRect(gx, gy, gw, gh);

    ctx.fillStyle = '#d4a574';
    ctx.font = '20px VT323, monospace';
    ctx.textAlign = 'left';
    ctx.fillText('THE QUESTION', gx, gy - 12);

    // Banked-seconds bar
    const pw = gw, ph = 12, py = gy + gh + 18;
    ctx.fillStyle = '#191919';
    ctx.fillRect(gx, py, pw, ph);
    ctx.fillStyle = color;
    ctx.fillRect(gx, py, pw * Math.min(1, banked / target), ph);
    ctx.strokeStyle = '#5a4a3a';
    ctx.strokeRect(gx, py, pw, ph);

    ctx.fillStyle = this.input.down ? color : '#4a4038';
    ctx.fillRect(gx, py + 20, gw, 10);
  }

  // --- the register close-up
  drawRegisterScene() {
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    const m = this.mech;

    ctx.fillStyle = '#0e1315';
    ctx.fillRect(0, 0, W, H);

    // Counter surface and register body
    ctx.fillStyle = '#241d18';
    ctx.fillRect(0, H * 0.62, W, H * 0.38);
    ctx.fillStyle = '#3c332b';
    ctx.fillRect(W * 0.14, H * 0.16, W * 0.72, H * 0.50);
    ctx.fillStyle = '#20282a';
    ctx.fillRect(W * 0.18, H * 0.20, W * 0.64, H * 0.40);

    // Drawer at the bottom, easing open as tumblers set
    const openFrac = m ? m.tumblers.filter(t => t.set).length / m.tumblers.length : 0;
    ctx.fillStyle = '#4a4038';
    ctx.fillRect(W * 0.22, H * 0.60 - 6, W * 0.56, 22 + openFrac * 26);
    if (openFrac > 0) {
      ctx.fillStyle = '#7ec89a';
      for (let i = 0; i < Math.round(openFrac * 8); i++) {
        ctx.fillRect(W * 0.26 + i * 24, H * 0.60 + 4, 18, 8 + openFrac * 10);
      }
    }

    if (!m) return;

    // Tumbler stack
    const n = m.tumblers.length;
    const bx = W * 0.22, bw = W * 0.56;
    const top = H * 0.24, rowH = (H * 0.32) / n;
    ctx.textAlign = 'left';
    m.tumblers.forEach((tb, i) => {
      const by = top + i * rowH, bh = rowH * 0.6;
      const active = i === m.index;
      ctx.fillStyle = '#141a1c';
      ctx.fillRect(bx, by, bw, bh);

      if (tb.set) {
        ctx.fillStyle = 'rgba(126,200,154,0.30)';
        ctx.fillRect(bx, by, bw, bh);
        ctx.strokeStyle = '#7ec89a';
        ctx.lineWidth = 2;
        ctx.strokeRect(bx, by, bw, bh);
        ctx.fillStyle = '#7ec89a';
        ctx.font = '20px VT323, monospace';
        ctx.fillText('SET', bx + bw + 12, by + bh * 0.75);
      } else {
        const zx = bx + ((tb.center - tb.width / 2) / 100) * bw;
        const zw = (tb.width / 100) * bw;
        ctx.fillStyle = active ? 'rgba(212,165,116,0.34)' : 'rgba(120,110,100,0.12)';
        ctx.fillRect(zx, by, zw, bh);
        ctx.strokeStyle = active ? '#d4a574' : '#4a4038';
        ctx.lineWidth = 2;
        ctx.strokeRect(zx, by, zw, bh);
        if (active) {
          const mx = bx + (tb.pos / 100) * bw;
          ctx.fillStyle = m.flash > 0 ? (m.flashGood ? '#8ef0a0' : '#ff7b6b') : '#ffffff';
          ctx.fillRect(mx - 3, by - 6, 6, bh + 12);
        }
        ctx.strokeStyle = '#3a322c';
        ctx.lineWidth = 1;
        ctx.strokeRect(bx, by, bw, bh);
      }
      ctx.fillStyle = tb.set ? '#7ec89a' : active ? '#d4a574' : '#5a5048';
      ctx.font = '20px VT323, monospace';
      ctx.fillText(`${i + 1}`, bx - 20, by + bh * 0.75);
    });

    // Pressure timer across the top
    const frac = Math.max(0, m.timeLeft / (HEIST_TUNING.register.timeLimit * 60 + (m.bonusSeconds || 0) * 60));
    const tw = W * 0.72, tx = W * 0.14, ty = H * 0.10;
    ctx.fillStyle = '#191919';
    ctx.fillRect(tx, ty, tw, 16);
    ctx.fillStyle = frac > 0.45 ? '#7ec89a' : frac > 0.2 ? '#d4a574' : '#e05a4a';
    ctx.fillRect(tx, ty, tw * frac, 16);
    ctx.strokeStyle = '#5a4a3a';
    ctx.lineWidth = 2;
    ctx.strokeRect(tx, ty, tw, 16);

    if (m.flash > 0) {
      ctx.fillStyle = m.flashGood ? 'rgba(140,240,160,0.10)' : 'rgba(255,110,90,0.12)';
      ctx.fillRect(0, 0, W, H);
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
