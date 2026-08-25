/**
 * THE TRANSPLANT TRAIL - ACT 3: THE JAIL
 * Heavy-dialogue recruitment arc (three cellblock philosophies), a couple
 * of short "days before" beats where a weapon can actually be found, and
 * a timing-based yard fight where that weapon matters.
 *
 * First pass -- built off one message describing the whole arc (three
 * named recruiters, jail activities, a fight that rewards prep). Structure
 * and pacing are a first cut, not load-bearing the way the heist's tuning
 * is -- expect this to need real iteration once it's actually played.
 */

const JAIL_RECRUITERS = [
  {
    id: 'mangione',
    name: 'Luigi',
    tag: 'Cellblock C, self-appointed',
    body: [
      "He's already mid-sentence when you sit down, like the sentence started before you got here and you're just now catching up. Something about verticals. Something about the spine of the system and how somebody has to find it and press.",
      "“You get it,” he says, though you haven't said anything yet. “You're already halfway there just by being in this room. I've got a zine. I've got a whole -- okay, I don't have a following yet. But I have the *shape* of one. That's the hard part.”",
      "He never finishes the thought about the spine. He starts a new one instead, about vertical integration, or maybe verticality, or maybe he means something else entirely and the word just sounded right.",
    ],
    pitchLabel: 'Side with Luigi -- incoherent anti-establishment',
  },
  {
    id: 'diddy',
    name: 'Diddy',
    tag: 'Somehow already has a corner suite',
    body: [
      "He's got three guys standing near him who aren't talking to anyone, including him. That's the point. He waves you over like you already work for him.",
      "“See, this is what I do,” he says, gesturing at the room like it's a party he's throwing. “I find talent. I *develop* it. You've got a look. You've got a whole energy. Stick with me and in here, you're somebody. Out there too, eventually, probably.”",
      "He asks your name twice and forgets it both times, but says it like it's the most important name he's heard all week either way.",
    ],
    pitchLabel: 'Side with Diddy -- status-seeking narcissism',
  },
  {
    id: 'sbf',
    name: 'Sam',
    tag: 'Reading something with footnotes',
    body: [
      "His hair looks like it's never once been introduced to a comb, in here or before. He's doing math on the back of a commissary form when you walk up, and he keeps doing it while he talks to you, which is somehow the most honest thing about him.",
      "“Okay so -- technically,” he says, “the expected value of an alliance here is just really favorable. I've modeled it. If you help me, and I help enough other people eventually, the marginal utility basically rounds to you being a good person. It's just math.”",
      "You ask what he actually wants. He says it's complicated, then explains it for four straight minutes without simplifying it once.",
    ],
    pitchLabel: 'Side with Sam -- effective altruism',
  },
];

// Cosmetic-only flavor keyed off which recruiter you sided with -- doesn't
// change the mechanics of the activities or the fight, just how the same
// beats are described and what the weapon looks like if you find one.
const JAIL_PATH_FLAVOR = {
  mangione: {
    ally: 'Luigi',
    weaponName: 'a shiv ground down from a spork over three nights',
    weaponFlavor: "Luigi calls it “praxis.” It's a sharpened spork.",
    cheer: 'Luigi is somewhere behind you yelling something about systems.',
  },
  diddy: {
    ally: 'Diddy',
    weaponName: 'a roll of quarters wrapped in a tube sock',
    weaponFlavor: 'Diddy insists on calling it "the accessory."',
    cheer: "Diddy's guys are filming this. You're not sure on what.",
  },
  sbf: {
    ally: 'Sam',
    weaponName: 'a lock loaded into a sock, acquired through a very confident bet',
    weaponFlavor: 'Sam ran the numbers on this exact fight and says you’re "plus-EV now."',
    cheer: 'Sam is narrating the fight in expected-value terms nobody asked for.',
  },
};

class JailGame {
  constructor(gameState, onComplete) {
    this.gameState = gameState;
    this.onComplete = onComplete;

    this.canvas = document.getElementById('jail-canvas');
    this.ctx = this.canvas.getContext('2d');

    this.phase = 'idle';
    this.path = null;        // 'mangione' | 'diddy' | 'sbf'
    this.weapon = false;     // found during the activities beat
    this.tookAmex = false;   // unused hook, mirrors the rest of the save shape

    this._af = null;
    this._frame = 0;
    this._bound = false;
  }

  // ------------------------------------------------
  // INFRASTRUCTURE -- same shape as HeistGame's
  // ------------------------------------------------

  init() {
    this.resize();
    this._resizeHandler = () => this.resize();
    window.addEventListener('resize', this._resizeHandler);
    this.bindFightInput();
    this.showIntake();
  }

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width = rect.width || window.innerWidth;
    this.canvas.height = rect.height || window.innerHeight;
  }

  stopLoop() {
    if (this._af) { cancelAnimationFrame(this._af); this._af = null; }
  }

  showOverlay(id) {
    document.querySelectorAll('#jail-game .jail-overlay').forEach(el => el.classList.add('hidden'));
    const el = document.getElementById(id);
    if (el) el.classList.remove('hidden');
  }

  hideOverlays() {
    document.querySelectorAll('#jail-game .jail-overlay').forEach(el => el.classList.add('hidden'));
  }

  // Generic dialogue renderer -- everything narrative (intake, each
  // recruiter's pitch, the activities, the ending) goes through this one
  // overlay instead of a dedicated screen per beat. `choices` is an array
  // of { label, onClick }; omit for a plain single "Continue".
  showDialogue({ title, sub, body, choices }) {
    document.getElementById('jail-dialogue-title').textContent = title || '';
    document.getElementById('jail-dialogue-sub').textContent = sub || '';
    const bodyEl = document.getElementById('jail-dialogue-body');
    bodyEl.innerHTML = '';
    (body || []).forEach(line => {
      const p = document.createElement('p');
      p.className = 'heist-narration';
      p.innerHTML = line;
      bodyEl.appendChild(p);
    });

    const choicesEl = document.getElementById('jail-dialogue-choices');
    choicesEl.innerHTML = '';
    const list = choices && choices.length ? choices : [{ label: 'Continue', onClick: () => {} }];
    list.forEach(c => {
      const btn = document.createElement('button');
      btn.className = 'menu-option';
      btn.textContent = c.label;
      btn.onclick = c.onClick;
      choicesEl.appendChild(btn);
    });

    this.showOverlay('jail-dialogue');
  }

  // ------------------------------------------------
  // PHASE 1 -- INTAKE
  // ------------------------------------------------

  showIntake() {
    this.phase = 'intake';
    this.stopLoop();
    this.showDialogue({
      title: 'Intake',
      sub: 'Rikers Island, or a building the game is politely not naming outright',
      body: [
        'Your things go into a manila envelope. The money you managed to keep is still technically yours, which nobody can quite explain.',
        "A guard reads your name off the sheet like it's the fortieth name he's read today, because it is. Somewhere past the second set of doors, the room gets loud in the specific way a room gets loud when everyone in it already knows each other and you don't.",
      ],
      choices: [{ label: 'Into the block', onClick: () => this.showRecruiter(0) }],
    });
  }

  // ------------------------------------------------
  // PHASE 2 -- THE YARD: three pitches, then a choice
  // ------------------------------------------------

  showRecruiter(i) {
    this.phase = 'yard';
    const r = JAIL_RECRUITERS[i];
    if (!r) { this.showPathChoice(); return; }
    this.showDialogue({
      title: r.name,
      sub: r.tag,
      body: r.body,
      choices: [{ label: 'Hear the next one out', onClick: () => this.showRecruiter(i + 1) }],
    });
  }

  showPathChoice() {
    this.phase = 'choice';
    this.showDialogue({
      title: 'Everybody wants a piece of you',
      sub: "One of them is going to have your back later. Pick.",
      body: ['You can only really run with one of these for as long as you’re in here.'],
      choices: JAIL_RECRUITERS.map(r => ({
        label: r.pitchLabel,
        onClick: () => this.pickPath(r.id),
      })),
    });
  }

  pickPath(id) {
    this.path = id;
    this.showActivity1();
  }

  // ------------------------------------------------
  // PHASE 3 -- "THE DAYS BEFORE": two short beats, the second one is
  // where a weapon can actually be found (a real, deterministic choice
  // with a real cost -- not a coin flip dressed up as a decision; that
  // exact bait-and-switch just got cut out of the bodega minigame this
  // same session, no reason to reintroduce it here).
  // ------------------------------------------------

  showActivity1() {
    this.phase = 'activity1';
    const flavor = JAIL_PATH_FLAVOR[this.path];
    this.showDialogue({
      title: 'Yard time',
      sub: `Running with ${flavor.ally} now`,
      body: [
        `${flavor.ally} has opinions about how you should spend your one hour outside today, and none of them are "just walk around."`,
        'Mostly it’s harmless. You trade a phone charger for two honey buns. Somebody’s cousin’s cousin knows somebody who knows you. This is apparently how everyone here is related to everyone else.',
      ],
      choices: [{ label: 'Next day', onClick: () => this.showActivity2() }],
    });
  }

  showActivity2() {
    this.phase = 'activity2';
    const flavor = JAIL_PATH_FLAVOR[this.path];
    this.showDialogue({
      title: 'A quiet offer',
      sub: 'Somebody knows a guy who knows a guy',
      body: [
        `${flavor.ally} pulls you aside. There's a way to walk into the yard tomorrow carrying something you didn't walk in with. It's not subtle if a CO decides to look, but nobody's been looking this week.`,
        'Word is Big Steve is running the yard again tomorrow. Word is Big Steve is always running the yard.',
      ],
      choices: [
        {
          label: `Take it (${flavor.weaponName})`,
          onClick: () => { this.weapon = true; this.showWeaponResult(true); },
        },
        {
          label: 'Keep your head down',
          onClick: () => { this.weapon = false; this.showWeaponResult(false); },
        },
      ],
    });
  }

  showWeaponResult(took) {
    const flavor = JAIL_PATH_FLAVOR[this.path];
    if (took) {
      // Real cost, not a dice roll -- carrying something into the yard
      // costs you standing with the guards, which is the honest price
      // of the edge it buys you in the fight.
      this.gameState.aura = Math.max(0, this.gameState.aura - 8);
      this.showDialogue({
        title: 'Got it',
        body: [
          `${flavor.weaponFlavor}`,
          'A CO looks right at you walking it back to your bunk and says nothing. That’s worse, somehow, than getting stopped.',
        ],
        choices: [{ label: 'Tomorrow, then', onClick: () => this.showFightIntro() }],
      });
    } else {
      this.showDialogue({
        title: 'Pass',
        body: [
          `${flavor.ally} shrugs like they expected that. "Your funeral," they say, which is not encouraging, but at least nobody's looking twice at you tonight.`,
        ],
        choices: [{ label: 'Tomorrow, then', onClick: () => this.showFightIntro() }],
      });
    }
  }

  // ------------------------------------------------
  // PHASE 4 -- THE FIGHT
  // ------------------------------------------------

  showFightIntro() {
    this.phase = 'fightIntro';
    const flavor = JAIL_PATH_FLAVOR[this.path];
    this.showDialogue({
      title: 'Big Steve',
      sub: 'Nobody actually knows why he’s the one everybody has to go through',
      body: [
        'He is, in fact, just a guy. Big, sure. But the legend is doing most of the work here, the way legends always are.',
        this.weapon
          ? `You've got ${flavor.weaponName} tucked in your waistband and ${flavor.ally} at your shoulder. That’s something.`
          : `You’ve got nothing but your hands and whatever ${flavor.ally} is yelling from the fence line. That'll have to be enough.`,
      ],
      choices: [{ label: 'Step up', onClick: () => this.startFight() }],
    });
  }

  startFight() {
    this.phase = 'fight';
    this.hideOverlays();
    document.getElementById('jail-fight-hud').classList.remove('hidden');

    this.fight = {
      playerHp: 3, maxPlayerHp: 3,
      oppHp: 4, maxOppHp: 4,
      beat: null,        // { type: 'attack' | 'opening' }
      beatWindow: 46,     // frames a beat stays live once it appears
      beatTimer: 0,
      nextBeatIn: 60,     // brief beat before the first prompt so the HUD has time to render
      flashPlayer: 0,
      flashOpp: 0,
      resolvedThisFrame: false,
      log: 'Big Steve squares up.',
    };
    this.updateFightHud();
    this.fightLoop();
  }

  bindFightInput() {
    if (this._bound) return;
    this._bound = true;
    const punch = document.getElementById('jail-punch-btn');
    const dodge = document.getElementById('jail-dodge-btn');
    const wire = (el, fn) => {
      el.addEventListener('pointerdown', (e) => {
        if (this.phase !== 'fight') return;
        e.preventDefault();
        el.classList.add('pressed');
        fn();
      });
      const up = () => el.classList.remove('pressed');
      el.addEventListener('pointerup', up);
      el.addEventListener('pointerleave', up);
      el.addEventListener('pointercancel', up);
    };
    wire(punch, () => this.resolveFightInput('punch'));
    wire(dodge, () => this.resolveFightInput('dodge'));
  }

  resolveFightInput(action) {
    const f = this.fight;
    if (!f || !f.beat) return;
    if (action === 'punch' && f.beat.type === 'opening') {
      const dmg = this.weapon ? 2 : 1;
      f.oppHp = Math.max(0, f.oppHp - dmg);
      f.flashOpp = 10;
      f.log = this.weapon ? 'Solid hit -- the weight in your hand does the rest.' : 'You catch him clean.';
      f.beat = null;
      f.nextBeatIn = 50;
    } else if (action === 'dodge' && f.beat.type === 'attack') {
      f.log = 'You slip it.';
      f.beat = null;
      f.nextBeatIn = 50;
    }
    // Wrong button for the current beat does nothing -- the beat just
    // keeps ticking down toward its own resolution below.
  }

  fightLoop() {
    if (this.phase !== 'fight') return;
    this._frame++;
    const f = this.fight;

    if (f.flashPlayer > 0) f.flashPlayer--;
    if (f.flashOpp > 0) f.flashOpp--;

    if (!f.beat) {
      if (f.nextBeatIn > 0) {
        f.nextBeatIn--;
      } else {
        f.beat = { type: Math.random() < 0.55 ? 'attack' : 'opening' };
        f.beatTimer = f.beatWindow;
      }
    } else {
      f.beatTimer--;
      if (f.beatTimer <= 0) {
        // Beat expired unresolved.
        if (f.beat.type === 'attack') {
          f.playerHp = Math.max(0, f.playerHp - 1);
          f.flashPlayer = 14;
          f.log = 'Too slow -- he gets through.';
        } else {
          f.log = 'Opening closes. Nothing there.';
        }
        f.beat = null;
        f.nextBeatIn = 50;
      }
    }

    this.updateFightHud();
    this.drawFightScene();

    if (f.oppHp <= 0) { this.endFight(true); return; }
    if (f.playerHp <= 0) { this.endFight(false); return; }

    this._af = requestAnimationFrame(() => this.fightLoop());
  }

  updateFightHud() {
    const f = this.fight;
    document.getElementById('jail-fight-player-bar').style.width = `${(f.playerHp / f.maxPlayerHp) * 100}%`;
    document.getElementById('jail-fight-opp-bar').style.width = `${(f.oppHp / f.maxOppHp) * 100}%`;
    document.getElementById('jail-fight-log').textContent = f.log;
    const prompt = document.getElementById('jail-fight-prompt');
    if (f.beat) {
      prompt.textContent = f.beat.type === 'attack' ? 'DODGE!' : 'PUNCH!';
      prompt.className = 'jail-fight-prompt ' + (f.beat.type === 'attack' ? 'jail-prompt-attack' : 'jail-prompt-opening');
    } else {
      prompt.textContent = '';
      prompt.className = 'jail-fight-prompt';
    }
  }

  drawFightScene() {
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    const f = this.fight;

    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#2a2420'); sky.addColorStop(1, '#161210');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);

    // Fence line
    ctx.strokeStyle = 'rgba(180,180,170,0.15)'; ctx.lineWidth = 2;
    for (let x = 0; x < W; x += 22) {
      ctx.beginPath(); ctx.moveTo(x, H * 0.3); ctx.lineTo(x + 14, H * 0.62); ctx.stroke();
    }

    const groundY = H * 0.78;
    ctx.fillStyle = '#3a342c'; ctx.fillRect(0, groundY, W, H - groundY);

    // Player silhouette (left)
    const px = W * 0.28, py = groundY;
    const shakeX = f.flashPlayer > 0 ? (Math.random() - 0.5) * 8 : 0;
    ctx.fillStyle = f.flashPlayer > 0 ? '#e05a4a' : '#c8b89c';
    ctx.beginPath(); ctx.ellipse(px + shakeX, py - 46, 16, 34, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(px + shakeX, py - 88, 14, 0, Math.PI * 2); ctx.fill();
    if (this.weapon) {
      ctx.strokeStyle = '#d8d8d0'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(px + 14 + shakeX, py - 55); ctx.lineTo(px + 34 + shakeX, py - 40); ctx.stroke();
    }

    // Big Steve (right) -- bigger, because that's the joke
    const ox = W * 0.72, oy = groundY;
    ctx.fillStyle = f.flashOpp > 0 ? '#e05a4a' : '#7ea0c8';
    ctx.beginPath(); ctx.ellipse(ox, oy - 56, 24, 44, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(ox, oy - 108, 18, 0, Math.PI * 2); ctx.fill();

    // Center telegraph
    if (f.beat) {
      const frac = f.beatTimer / f.beatWindow;
      ctx.save();
      ctx.translate(W / 2, H * 0.28);
      ctx.strokeStyle = f.beat.type === 'attack' ? '#e05a4a' : '#7ec89a';
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(0, 0, 30, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2); ctx.stroke();
      ctx.fillStyle = ctx.strokeStyle;
      ctx.font = 'bold 20px VT323, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(f.beat.type === 'attack' ? '←' : '•', 0, 2);
      ctx.restore();
    }
  }

  endFight(won) {
    this.phase = 'fightEnd';
    this.stopLoop();
    document.getElementById('jail-fight-hud').classList.add('hidden');
    const flavor = JAIL_PATH_FLAVOR[this.path];

    this.showDialogue({
      title: won ? 'Big Steve sits down' : 'You go down',
      sub: won
        ? 'Nobody saw that coming, including you'
        : "It's not the last fight you'll be in here, just the first",
      body: won
        ? [
            this.weapon
              ? `It wasn't close, and everyone knows why. ${flavor.cheer}`
              : `It was closer than it should have been, but it's over. ${flavor.cheer}`,
            `${flavor.ally} is already telling a version of this story that gets better every time you hear it.`,
          ]
        : [
            `You're upright again by the time a CO wanders over, which is the only part of this anyone official cares about. ${flavor.cheer}`,
            `${flavor.ally} tells you it's a long sentence and there's time to run it back. That is somehow supposed to help.`,
          ],
      choices: [{ label: 'And then?', onClick: () => this.finish(won) }],
    });
  }

  finish(won) {
    this.phase = 'done';
    this.stopLoop();
    this.hideOverlays();
    if (this._resizeHandler) window.removeEventListener('resize', this._resizeHandler);
    this.onComplete({
      jailWon: won,
      jailPath: this.path,
      jailWeapon: this.weapon,
    });
  }
}

let jailGame = null;
