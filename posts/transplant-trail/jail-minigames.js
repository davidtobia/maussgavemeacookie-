/**
 * THE JAIL — ACT 3 MINI-GAMES
 * =============================
 *
 * Three self-contained classes, one per leader. Shared contract:
 *
 *   new JailRhythmGame(host, charId, onDone)
 *   (Luigi's game lives in jail-junkyard.js)
 *   (SBF's game lives in jail-trolley.js)
 *
 * `host` is the JailGame instance — these classes read host.canvas/ctx and
 * nothing else off it; they own their own input bindings, their own
 * requestAnimationFrame loop, and their own teardown (`destroy()`).
 * `onDone(result)` fires exactly once, with:
 *
 *   { grade, friendshipGain, stats: [[label, value], ...], detail: {...} }
 *
 * `grade` is one of 'bail'|'weak'|'ok'|'great'|'perfect', derived from
 * friendshipGain by jailGradeFromGain() below. Every game caps its own
 * contribution at +45 so the three are worth the same regardless of how
 * hard any individual player finds a given mechanic.
 *
 * None of these three files contain a line of authored dialogue — the
 * `stats`/label strings and canvas labels below are functional UI text
 * (accuracy %, rep counts, a clock), the same category as a button label
 * elsewhere in this codebase, not narrative copy.
 */

// ------------------------------------------------------------------
// SHARED HELPERS
// ------------------------------------------------------------------

function jailGradeFromGain(gain) {
  if (gain <= 0) return 'bail';
  if (gain <= 11) return 'weak';
  if (gain <= 22) return 'ok';
  if (gain <= 33) return 'great';
  return 'perfect';
}

function jailClamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function jailShade(hex, pct) {
  const n = parseInt(hex.slice(1), 16);
  const clamp8 = (v) => jailClamp(v, 0, 255);
  const r = clamp8((n >> 16) + Math.round(255 * pct / 100));
  const g = clamp8(((n >> 8) & 0xff) + Math.round(255 * pct / 100));
  const b = clamp8((n & 0xff) + Math.round(255 * pct / 100));
  return `#${(1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1)}`;
}

function jailAlpha(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 0xff},${n & 0xff},${a})`;
}

function jailReducedMotion() {
  try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
  catch (e) { return false; }
}

// A canvas roundRect polyfill — supported natively almost everywhere this
// game runs, but this keeps a note-hit from silently no-op'ing anywhere it
// isn't.
function jailRoundRectPath(ctx, x, y, w, h, r) {
  if (typeof ctx.roundRect === 'function') { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); return; }
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Small burst-particle pool, screen-px space, reused by all three games so
// "a hit does something satisfying" doesn't get reinvented three times.
class JailParticles {
  constructor() { this.list = []; }
  burst(x, y, color, count, opts) {
    opts = opts || {};
    const speed = opts.speed || 2.2, life = opts.life || 26;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.9);
      this.list.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - (opts.upBias || 0),
        gravity: opts.gravity != null ? opts.gravity : 0.05,
        life, maxLife: life, color, r: (opts.r || 2.4) * (0.6 + Math.random() * 0.8),
      });
    }
  }
  update() {
    this.list.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += p.gravity; p.life--; });
    this.list = this.list.filter(p => p.life > 0);
  }
  draw(ctx) {
    this.list.forEach(p => {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1;
  }
}

// Floating text popups ("+3 Utils", "PERFECT!", "Rep.") — screen-px space.
class JailFloaters {
  constructor() { this.list = []; }
  add(x, y, text, color, opts) {
    opts = opts || {};
    if (!text) return;
    this.list.push({
      x, y, text, color, life: opts.life || 40, maxLife: opts.life || 40,
      vy: opts.vy != null ? opts.vy : -0.55, size: opts.size || 16,
    });
  }
  update() { this.list.forEach(f => { f.y += f.vy; f.life--; }); this.list = this.list.filter(f => f.life > 0); }
  draw(ctx) {
    this.list.forEach(f => {
      const t = 1 - f.life / f.maxLife;
      const pop = t < 0.15 ? t / 0.15 : 1;
      ctx.save();
      ctx.globalAlpha = Math.max(0, f.life / f.maxLife);
      ctx.translate(f.x, f.y);
      ctx.scale(pop, pop);
      ctx.font = `bold ${f.size}px VT323, monospace`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, 0, 0);
      ctx.restore();
    });
  }
}

// ====================================================================
// 5a. DIDDY — three-lane rhythm game
// ====================================================================

class JailRhythmGame {
  constructor(host, charId, onDone) {
    this.host = host;
    this.charId = charId;
    this.onDone = onDone;
    this.char = JAIL_CHARACTERS.find(c => c.id === charId);
    this.canvas = host.canvas;
    this.ctx = host.ctx;
    this._af = null;
    this._reduced = jailReducedMotion();
    this.particles = new JailParticles();
    this.floaters = new JailFloaters();

    this.combo = 0;
    this.maxCombo = 0;
    this.earned = 0;
    this.judgeFlash = null;
    this.perfectFlash = 0;
    this.missShake = 0;
    this.finished = false;
    this.lanePress = [0, 0, 0];

    // The dancer — eases toward a target "energy" level driven by recent
    // hit quality, so the character actually performs better the better
    // you're playing instead of just sitting there as scenery.
    this.danceEnergy = 0.3;
    this._danceTarget = 0.3;

    this._buildChart();
    this.maxPossible = this.notes.length * 100;
    this._startAudio();
    this._bindInput();

    document.getElementById('jail-rhythm-hud').classList.remove('hidden');
    this._updateHud();
    this._loop();
  }

  _buildChart() {
    const chart = JAIL_RHYTHM_CHART;
    const barMs = (60000 / chart.bpm) * 4;
    const slotMs = barMs / 8;
    this.notes = [];
    chart.bars.forEach((bar, bi) => {
      for (let s = 0; s < 8; s++) {
        const c = bar[s];
        if (c === '0' || c === '1' || c === '2') {
          this.notes.push({ lane: parseInt(c, 10), t: chart.offsetMs + bi * barMs + s * slotMs, judged: false });
        }
      }
    });
    this.chartEndMs = chart.offsetMs + chart.bars.length * barMs + 1200;
    this.leadMs = 1500;
  }

  _startAudio() {
    this.audioCtx = null;
    this.perfOrigin = performance.now();
    // The shared context (sound.js), so the mute button covers the beat.
    this.audioCtx = TTAudio._ensure() ? TTAudio.ctx : null;
    if (this.audioCtx) {
      this.audioStartCtxTime = this.audioCtx.currentTime + 0.05;
      this._beatIdx = 0;
      this._schedulerTimer = setInterval(() => this._scheduleAudio(), 25);
    }
  }

  now() {
    if (this.audioCtx) return (this.audioCtx.currentTime - this.audioStartCtxTime) * 1000;
    return performance.now() - this.perfOrigin;
  }

  _scheduleAudio() {
    const beatMs = 60000 / JAIL_RHYTHM_CHART.bpm;
    const lookaheadMs = 100;
    const elapsedMs = (this.audioCtx.currentTime - this.audioStartCtxTime) * 1000 + lookaheadMs;
    while (this._beatIdx * (beatMs / 2) < elapsedMs && this._beatIdx * (beatMs / 2) < this.chartEndMs) {
      const idx = this._beatIdx;
      const when = this.audioStartCtxTime + (idx * (beatMs / 2)) / 1000;
      if (idx % 4 === 0) this._playKick(when); else this._playHat(when);
      if (idx % 16 === 0) this._playBass(when);
      this._beatIdx++;
    }
  }

  _playKick(when) {
    const ctx = this.audioCtx;
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, when);
    osc.frequency.exponentialRampToValueAtTime(45, when + 0.09);
    gain.gain.setValueAtTime(0.9, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + 0.16);
    osc.connect(gain).connect(TTAudio.raw);
    osc.start(when); osc.stop(when + 0.18);
  }

  _playHat(when) {
    const ctx = this.audioCtx;
    const n = Math.floor(ctx.sampleRate * 0.04);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const filt = ctx.createBiquadFilter(); filt.type = 'highpass'; filt.frequency.value = 6000;
    const gain = ctx.createGain(); gain.gain.setValueAtTime(0.22, when);
    src.connect(filt).connect(gain).connect(TTAudio.raw);
    src.start(when);
  }

  _playBass(when) {
    const ctx = this.audioCtx;
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(73.4, when);
    gain.gain.setValueAtTime(0.001, when);
    gain.gain.linearRampToValueAtTime(0.28, when + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, when + 0.5);
    osc.connect(gain).connect(TTAudio.raw);
    osc.start(when); osc.stop(when + 0.55);
  }

  _bindInput() {
    this._keyDownH = (e) => {
      const map = { j: 0, k: 1, l: 2, arrowleft: 0, arrowdown: 1, arrowright: 2 };
      const lane = map[e.key.toLowerCase()];
      if (lane == null) return;
      e.preventDefault();
      this._hitLane(lane);
    };
    window.addEventListener('keydown', this._keyDownH);
    // Tap (or click) the lane's circle directly -- the separate J/K/L
    // button row is gone. Anywhere in a lane's column counts, so a
    // slightly-off thumb still registers as that lane; pointerdown
    // covers touch and mouse both, and each finger is its own event so
    // two-lane chords work on a phone.
    const laneAt = (clientX) => {
      const rect = this.canvas.getBoundingClientRect();
      const x = (clientX - rect.left) * (this.canvas.width / (rect.width || 1));
      const b = this._bounds();
      return jailClamp(Math.floor((x - b.x) / (b.w / 3)), 0, 2);
    };
    // Mouse/pen via pointerdown; touch via touchstart with preventDefault
    // (the reliable way to stop iOS double-tap zoom eating fast taps).
    this._canvasDownH = (e) => {
      if (e.pointerType === 'touch') return;
      e.preventDefault();
      this._hitLane(laneAt(e.clientX));
    };
    this._canvasTouchH = (e) => {
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) this._hitLane(laneAt(e.changedTouches[i].clientX));
    };
    this._canvasTouchEndH = (e) => e.preventDefault();
    this.canvas.addEventListener('pointerdown', this._canvasDownH);
    this.canvas.addEventListener('touchstart', this._canvasTouchH, { passive: false });
    this.canvas.addEventListener('touchend', this._canvasTouchEndH, { passive: false });
  }

  _hitLane(lane) {
    if (this.finished) return;
    this.lanePress[lane] = 1;
    const t = this.now();
    let best = null, bestDist = Infinity;
    this.notes.forEach(n => {
      if (n.judged || n.lane !== lane) return;
      const d = Math.abs(n.t - t);
      if (d < bestDist) { bestDist = d; best = n; }
    });
    if (!best || bestDist > 150) {
      this.combo = 0;
      this._danceTarget = 0.08;
      this._flashJudge(lane, 'MISS', '#7a6a5a');
      return;
    }
    best.judged = true;
    let grade, score, color;
    if (bestDist <= 55) { grade = 'PERFECT'; score = 100; color = '#f4c542'; }
    else if (bestDist <= 100) { grade = 'GREAT'; score = 70; color = '#7ec89a'; }
    else { grade = 'OK'; score = 35; color = '#6ab0d8'; }
    this.combo++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    const mult = 1 + Math.min(10, Math.floor(this.combo / 10)) * 0.1;
    this.earned += score * mult;
    // The higher the combo, the harder the character goes.
    this._danceTarget = jailClamp(0.45 + (grade === 'PERFECT' ? 0.4 : grade === 'GREAT' ? 0.25 : 0.1) + this.combo * 0.02, 0, 1);
    this._flashJudge(lane, grade, color);
    this._hitFx(lane, color, grade === 'PERFECT');
  }

  _flashJudge(lane, text, color) { this.judgeFlash = { lane, text, color, t: 22 }; }

  _hitFx(lane, color, perfect) {
    const b = this._bounds();
    const laneW = b.w / 3;
    const px = b.x + laneW * (lane + 0.5);
    const py = b.y + b.h * 0.78;
    this.particles.burst(px, py, color, perfect ? 16 : 9, { speed: perfect ? 3.4 : 2.2, life: perfect ? 34 : 22, upBias: 1.2 });
    if (perfect) this.floaters.add(px, py - 22, 'PERFECT!', color, { life: 30, size: 15 });
    if (perfect && !this._reduced) this.perfectFlash = 10;
  }

  _bounds() {
    const W = this.canvas.width, H = this.canvas.height;
    const w = Math.min(W * 0.94, 520);
    const h = H * 0.9;
    return { x: (W - w) / 2, y: H * 0.05, w, h };
  }

  // A cute, reactive chibi dancer behind the lanes -- the whole point is
  // this game "spiritually" being a Mario-Party rhythm minigame, and
  // those always sell the beat through a character, not just abstract
  // lanes. Twerk motion + how hard the character's going both scale with
  // this.danceEnergy, which eases toward a target set by recent hit
  // quality (see _hitLane / the miss-timeout in _loop) -- play well and
  // the character visibly goes off; whiff a run of notes and it deflates.
  _drawDancer(t, b) {
    const ctx = this.ctx;
    const cx = b.x + b.w / 2;
    const groundY = b.y + b.h * 0.9;
    const e = this.danceEnergy;

    const beatMs = (60000 / JAIL_RHYTHM_CHART.bpm) / 2;
    const phase = ((t % beatMs) / beatMs + 1) % 1;
    const bounce = Math.sin(phase * Math.PI * 2) * (6 + e * 16);
    const twerk = Math.sin(phase * Math.PI * 4) * (5 + e * 26);
    const scale = 0.92 + e * 0.16;
    const wobble = this.missShake > 0 && !this._reduced ? (Math.random() - 0.5) * this.missShake * 0.6 : 0;

    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.translate(cx + wobble, groundY - Math.max(0, bounce));
    ctx.scale(scale, scale);

    // Legs, planted
    ctx.fillStyle = jailShade(this.char.color, -45);
    ctx.fillRect(-24, -2, 15, 36);
    ctx.fillRect(9, -2, 15, 36);

    // Booty — the twerk element, oscillating on double time
    ctx.save();
    ctx.translate(0, -22);
    ctx.rotate(twerk * 0.012);
    ctx.fillStyle = this.char.color;
    ctx.beginPath();
    ctx.ellipse(0, 8 + Math.abs(twerk) * 0.5, 36, 24, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Torso
    ctx.fillStyle = jailShade(this.char.color, 15);
    jailRoundRectPath(ctx, -20, -74, 40, 56, 14);
    ctx.fill();

    // Arms — thrown up celebrating at high energy, hanging low and sad
    // when the run's going badly.
    const armLift = jailClamp((e - 0.3) / 0.7, 0, 1);
    const armX = -20 - armLift * 12, armY = -55 - armLift * 40;
    ctx.strokeStyle = jailShade(this.char.color, -20);
    ctx.lineWidth = 10; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-18, -58); ctx.lineTo(armX, armY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(18, -58); ctx.lineTo(-armX, armY); ctx.stroke();

    // Head + shades — a chibi silhouette, not a likeness
    ctx.fillStyle = '#d9a878';
    ctx.beginPath(); ctx.arc(0, -90, 21, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0c0c0c';
    jailRoundRectPath(ctx, -17, -94, 34, 10, 4);
    ctx.fill();

    ctx.restore();
  }

  _updateHud() {
    const acc = this.maxPossible > 0 ? jailClamp(this.earned / this.maxPossible, 0, 1) : 0;
    const comboEl = document.getElementById('jail-rhythm-combo');
    if (comboEl) comboEl.textContent = this.combo > 1 ? `${this.combo}x COMBO` : '';
    const accEl = document.getElementById('jail-rhythm-acc');
    if (accEl) accEl.textContent = `${Math.round(acc * 100)}%`;
  }

  _loop() {
    const t = this.now();
    this.notes.forEach(n => {
      if (!n.judged && t - n.t > 150) {
        n.judged = true;
        this.combo = 0;
        this._danceTarget = 0.08;
        if (!this._reduced) this.missShake = 8;
      }
    });
    this.danceEnergy += (this._danceTarget - this.danceEnergy) * 0.08;
    if (this.judgeFlash) { this.judgeFlash.t--; if (this.judgeFlash.t <= 0) this.judgeFlash = null; }
    if (this.perfectFlash > 0) this.perfectFlash--;
    if (this.missShake > 0) this.missShake--;
    for (let i = 0; i < 3; i++) this.lanePress[i] *= 0.82;
    this.particles.update();
    this.floaters.update();
    this._updateHud();
    this._draw(t);

    if (t > this.chartEndMs) { this._end(); return; }
    this._af = requestAnimationFrame(() => this._loop());
  }

  _draw(t) {
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    const b = this._bounds();
    const shakeX = this.missShake > 0 && !this._reduced ? (Math.random() - 0.5) * this.missShake : 0;

    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#160a1c'); bg.addColorStop(1, '#0a0610');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.translate(shakeX, 0);

    ctx.save();
    ctx.beginPath(); ctx.rect(b.x, b.y, b.w, b.h); ctx.clip();
    const laneW = b.w / 3;
    const laneColors = [jailShade(this.char.color, 20), this.char.color, jailShade(this.char.color, -20)];
    for (let i = 0; i < 3; i++) {
      const lg = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
      lg.addColorStop(0, 'rgba(10,6,16,0)');
      lg.addColorStop(1, jailAlpha(laneColors[i], 0.16));
      ctx.fillStyle = lg;
      ctx.fillRect(b.x + laneW * i, b.y, laneW, b.h);
    }
    for (let i = 0; i <= 3; i++) {
      ctx.strokeStyle = jailAlpha(this.char.color, 0.35);
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(b.x + laneW * i, b.y); ctx.lineTo(b.x + laneW * i, b.y + b.h); ctx.stroke();
    }

    this._drawDancer(t, b);

    const barMs = (60000 / JAIL_RHYTHM_CHART.bpm) * 4;
    const beatPhase = (t % (barMs / 4)) / (barMs / 4);
    const pulse = 1 + (1 - beatPhase) * 0.12;
    const judgeY = b.y + b.h * 0.78;
    // The tap targets: one big circle per lane, sized for a thumb.
    const padR = Math.min(laneW * 0.4, 52);
    ctx.save();
    ctx.strokeStyle = jailAlpha(this.char.color, 0.9);
    ctx.lineWidth = 3 * pulse;
    ctx.shadowColor = this.char.color; ctx.shadowBlur = 12 * pulse;
    ctx.beginPath(); ctx.moveTo(b.x, judgeY); ctx.lineTo(b.x + b.w, judgeY); ctx.stroke();
    ctx.restore();

    this.notes.forEach(n => {
      if (n.judged) return;
      const dt = n.t - t;
      if (dt > this.leadMs || dt < -200) return;
      const prog = 1 - dt / this.leadMs;
      const ny = b.y + prog * (judgeY - b.y);
      if (ny < b.y - 20) return;
      const nx = b.x + laneW * (n.lane + 0.5);
      ctx.save();
      ctx.shadowColor = laneColors[n.lane]; ctx.shadowBlur = 10;
      ctx.fillStyle = laneColors[n.lane];
      ctx.beginPath(); ctx.arc(nx, ny, padR * 0.72, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath(); ctx.arc(nx, ny, padR * 0.34, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    ctx.restore();

    for (let i = 0; i < 3; i++) {
      const cx = b.x + laneW * (i + 0.5);
      const press = this.lanePress[i];
      ctx.beginPath();
      ctx.arc(cx, judgeY, padR * (1 - press * 0.12), 0, Math.PI * 2);
      ctx.fillStyle = jailAlpha(laneColors[i], 0.14 + press * 0.5);
      ctx.fill();
      ctx.strokeStyle = jailAlpha(laneColors[i], 0.95);
      ctx.lineWidth = 3 + press * 3;
      ctx.stroke();
    }

    this.particles.draw(ctx);
    this.floaters.draw(ctx);

    if (this.judgeFlash) {
      const jf = this.judgeFlash;
      const cx = b.x + laneW * (jf.lane + 0.5);
      const a = jf.t / 22;
      const scale = 0.85 + (1 - a) * 0.35;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(cx, judgeY - 40);
      ctx.scale(scale, scale);
      ctx.font = 'bold 22px VT323, monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = jf.color;
      ctx.fillText(jf.text, 0, 0);
      ctx.restore();
    }

    ctx.restore();

    if (this.perfectFlash > 0) {
      ctx.fillStyle = `rgba(244,197,66,${(this.perfectFlash / 10) * 0.12})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  _end() {
    this.finished = true;
    const accuracy = this.maxPossible > 0 ? jailClamp(this.earned / this.maxPossible, 0, 1) : 0;
    const friendshipGain = Math.round(45 * jailClamp((accuracy - 0.35) / 0.55, 0, 1));
    this.destroy();
    this.onDone({
      grade: jailGradeFromGain(friendshipGain),
      friendshipGain,
      stats: [
        ['Accuracy', `${Math.round(accuracy * 100)}%`],
        ['Max combo', `${this.maxCombo}x`],
        ['Friendship', `+${friendshipGain}`],
      ],
      detail: { accuracy, maxCombo: this.maxCombo },
    });
  }

  destroy() {
    if (this._af) cancelAnimationFrame(this._af);
    this._af = null;
    if (this._schedulerTimer) clearInterval(this._schedulerTimer);
    window.removeEventListener('keydown', this._keyDownH);
    this.canvas.removeEventListener('pointerdown', this._canvasDownH);
    this.canvas.removeEventListener('touchstart', this._canvasTouchH);
    this.canvas.removeEventListener('touchend', this._canvasTouchEndH);
    document.getElementById('jail-rhythm-hud').classList.add('hidden');
  }
}
