/**
 * ACT 3 — SHELVED CONTENT (the single-ally fight/weapon arc)
 * =============================================================
 *
 * This is the first-pass Act 3: pick one of three recruiters, two short
 * "days before" beats where you could find a weapon, then a timing-based
 * fight against Big Steve. It's been replaced by the yard/dialogue/
 * mini-game structure in jail.js — three simultaneous friendship tracks
 * instead of one exclusive ally and a single climactic fight.
 *
 * NOT LOADED by index.html. Nothing here runs. Kept intact (not deleted)
 * because the underlying beat — Big Steve, a fight, prep that matters —
 * is still a good idea for a *later* addition, just not as the structure
 * of the whole act. See the note at the bottom of this file for the
 * shape a revival would probably take.
 *
 * To revive any of this you would need, at minimum:
 *   1. A caller — something to instantiate a fight the way `pickPath` /
 *      `showActivity2` used to, from wherever it now makes sense in the
 *      new yard flow (see the "Big Steve as a shared fourth beat" note
 *      below for the leading candidate).
 *   2. The `#jail-fight-hud` markup back in play — it's still in
 *      index.html, commented out with a pointer to this file.
 *   3. A reason for a fight to exist at all in the new three-track
 *      structure — right now the yard is a deliberately safe hub with no
 *      fail state (see JAIL_REDESIGN_PLAN.md §3, "the yard is a safe hub
 *      with no fail state" and §7's revival note).
 *
 * A REVIVAL PATH WORTH NOTING BUT NOT BUILT:
 * Big Steve could come back as a *shared* optional fourth beat — all
 * three leaders have an opinion about him, and the fight becomes a final
 * yard event that pays friendship to whichever leader(s) you backed going
 * in. That fits the new three-track structure much better than being the
 * one exclusive climax did, and reuses everything below almost as-is —
 * the only real change is what `this.path` means (who you're backing for
 * this one fight, not who you spent the whole act with).
 */

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

// ------------------------------------------------------------------
// The shelved methods below were all on JailGame. If reviving them,
// mix this object's methods back onto the class (or copy them in) and
// wire a caller per the notes above. Left as plain functions here so
// this file can sit unloaded without side effects.
// ------------------------------------------------------------------

const JailShelvedFight = {
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
  },

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
        { label: `Take it (${flavor.weaponName})`, onClick: () => { this.weapon = true; this.showWeaponResult(true); } },
        { label: 'Keep your head down', onClick: () => { this.weapon = false; this.showWeaponResult(false); } },
      ],
    });
  },

  showWeaponResult(took) {
    const flavor = JAIL_PATH_FLAVOR[this.path];
    if (took) {
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
        body: [`${flavor.ally} shrugs like they expected that. "Your funeral," they say, which is not encouraging, but at least nobody's looking twice at you tonight.`],
        choices: [{ label: 'Tomorrow, then', onClick: () => this.showFightIntro() }],
      });
    }
  },

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
  },

  startFight() {
    this.phase = 'fight';
    this.hideOverlays();
    document.getElementById('jail-fight-hud').classList.remove('hidden');
    this.fight = {
      playerHp: 3, maxPlayerHp: 3, oppHp: 4, maxOppHp: 4,
      beat: null, beatWindow: 46, beatTimer: 0, nextBeatIn: 60,
      flashPlayer: 0, flashOpp: 0, resolvedThisFrame: false,
      log: 'Big Steve squares up.',
    };
    this.updateFightHud();
    this.fightLoop();
  },

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
  },

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
  },

  fightLoop() {
    if (this.phase !== 'fight') return;
    this._frame++;
    const f = this.fight;
    if (f.flashPlayer > 0) f.flashPlayer--;
    if (f.flashOpp > 0) f.flashOpp--;
    if (!f.beat) {
      if (f.nextBeatIn > 0) { f.nextBeatIn--; }
      else { f.beat = { type: Math.random() < 0.55 ? 'attack' : 'opening' }; f.beatTimer = f.beatWindow; }
    } else {
      f.beatTimer--;
      if (f.beatTimer <= 0) {
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
  },

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
  },

  drawFightScene() {
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    const f = this.fight;
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#2a2420'); sky.addColorStop(1, '#161210');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(180,180,170,0.15)'; ctx.lineWidth = 2;
    for (let x = 0; x < W; x += 22) { ctx.beginPath(); ctx.moveTo(x, H * 0.3); ctx.lineTo(x + 14, H * 0.62); ctx.stroke(); }
    const groundY = H * 0.78;
    ctx.fillStyle = '#3a342c'; ctx.fillRect(0, groundY, W, H - groundY);
    const px = W * 0.28, py = groundY;
    const shakeX = f.flashPlayer > 0 ? (Math.random() - 0.5) * 8 : 0;
    ctx.fillStyle = f.flashPlayer > 0 ? '#e05a4a' : '#c8b89c';
    ctx.beginPath(); ctx.ellipse(px + shakeX, py - 46, 16, 34, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(px + shakeX, py - 88, 14, 0, Math.PI * 2); ctx.fill();
    if (this.weapon) {
      ctx.strokeStyle = '#d8d8d0'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(px + 14 + shakeX, py - 55); ctx.lineTo(px + 34 + shakeX, py - 40); ctx.stroke();
    }
    const ox = W * 0.72, oy = groundY;
    ctx.fillStyle = f.flashOpp > 0 ? '#e05a4a' : '#7ea0c8';
    ctx.beginPath(); ctx.ellipse(ox, oy - 56, 24, 44, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(ox, oy - 108, 18, 0, Math.PI * 2); ctx.fill();
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
  },

  endFight(won) {
    this.phase = 'fightEnd';
    this.stopLoop();
    document.getElementById('jail-fight-hud').classList.add('hidden');
    const flavor = JAIL_PATH_FLAVOR[this.path];
    this.showDialogue({
      title: won ? 'Big Steve sits down' : 'You go down',
      sub: won ? 'Nobody saw that coming, including you' : "It's not the last fight you'll be in here, just the first",
      body: won
        ? [
            this.weapon ? `It wasn't close, and everyone knows why. ${flavor.cheer}` : `It was closer than it should have been, but it's over. ${flavor.cheer}`,
            `${flavor.ally} is already telling a version of this story that gets better every time you hear it.`,
          ]
        : [
            `You're upright again by the time a CO wanders over, which is the only part of this anyone official cares about. ${flavor.cheer}`,
            `${flavor.ally} tells you it's a long sentence and there's time to run it back. That is somehow supposed to help.`,
          ],
      choices: [{ label: 'And then?', onClick: () => this.finish(won) }],
    });
  },
};
