/**
 * THE JAIL — ACT 3 MINI-GAMES
 * =============================
 *
 * Three self-contained classes, one per leader. Shared contract:
 *
 *   new JailRhythmGame(host, charId, onDone)
 *   new JailBenchGame(host, charId, onDone)
 *   new JailTripGame(host, charId, onDone)
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
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) this.audioCtx = new Ctx();
    } catch (e) { this.audioCtx = null; }
    if (this.audioCtx) {
      if (this.audioCtx.state === 'suspended') this.audioCtx.resume().catch(() => {});
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
    osc.connect(gain).connect(ctx.destination);
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
    src.connect(filt).connect(gain).connect(ctx.destination);
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
    osc.connect(gain).connect(ctx.destination);
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
    this._btnHandlers = [];
    for (let lane = 0; lane < 3; lane++) {
      const btn = document.getElementById(`jail-rhythm-btn-${lane}`);
      if (!btn) continue;
      const down = (e) => { e.preventDefault(); btn.classList.add('pressed'); this._hitLane(lane); };
      const up = () => btn.classList.remove('pressed');
      btn.addEventListener('pointerdown', down);
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointerleave', up);
      btn.addEventListener('pointercancel', up);
      this._btnHandlers.push({ btn, down, up });
    }
  }

  _hitLane(lane) {
    if (this.finished) return;
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
    const w = Math.min(W * 0.92, 520);
    const h = H * 0.86;
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
      jailRoundRectPath(ctx, nx - laneW * 0.32, ny - 7, laneW * 0.64, 14, 6);
      ctx.fill();
      ctx.restore();
    });

    ctx.restore();

    for (let i = 0; i < 3; i++) {
      const cx = b.x + laneW * (i + 0.5);
      ctx.beginPath();
      ctx.arc(cx, judgeY, 12, 0, Math.PI * 2);
      ctx.strokeStyle = jailAlpha(laneColors[i], 0.7);
      ctx.lineWidth = 2;
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
    (this._btnHandlers || []).forEach(({ btn, down, up }) => {
      btn.removeEventListener('pointerdown', down);
      btn.removeEventListener('pointerup', up);
      btn.removeEventListener('pointerleave', up);
      btn.removeEventListener('pointercancel', up);
    });
    document.getElementById('jail-rhythm-hud').classList.add('hidden');
    if (this.audioCtx) { try { this.audioCtx.close(); } catch (e) { /* ignore */ } }
  }
}

// ====================================================================
// 5b. LUIGI — bench press
// ====================================================================

class JailBenchGame {
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

    this.setIndex = 0;
    this.sets = [
      { targetReps: 8, baseRate: 1.15, plates: 1 },
      { targetReps: 6, baseRate: 0.95, plates: 2 },
      { targetReps: 4, baseRate: 0.78, plates: 3 },
    ].map(s => ({ ...s, pushRate: s.baseRate, reps: 0 }));
    this.dropRate = 0.91;

    this.barY = 0;
    this.holding = false;
    this.reachedTop = false;
    this.repStart = performance.now();
    this.stallTimer = 0;
    this.shaking = false;
    this.form = 100;
    this.lastBottomTime = 0;
    this.totalReps = 0;
    this.allRepScores = [];
    this.finished = false;
    this.lastFrameT = performance.now();
    this.failFlash = 0;
    this.setBanner = { t: 90, text: this._setBannerText() };

    this._bindInput();
    document.getElementById('jail-bench-hud').classList.remove('hidden');
    this._updateHud();
    this._loop();
  }

  _setBannerText() {
    const s = this.sets[this.setIndex];
    return `SET ${this.setIndex + 1} — TARGET ${s.targetReps} REPS`;
  }

  _bindInput() {
    const btn = document.getElementById('jail-bench-btn');
    const down = (e) => { e.preventDefault(); if (this.finished) return; this.holding = true; btn.classList.add('pressed'); };
    const up = () => { this.holding = false; btn.classList.remove('pressed'); };
    btn.addEventListener('pointerdown', down);
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointerleave', up);
    btn.addEventListener('pointercancel', up);
    this._btn = btn; this._down = down; this._up = up;

    this._keyDownH = (e) => { if (e.code === 'Space') { e.preventDefault(); if (!this.finished) this.holding = true; } };
    this._keyUpH = (e) => { if (e.code === 'Space') this.holding = false; };
    window.addEventListener('keydown', this._keyDownH);
    window.addEventListener('keyup', this._keyUpH);

    this._canvasDown = () => { if (!this.finished) this.holding = true; };
    this._canvasUp = () => { this.holding = false; };
    this.canvas.addEventListener('pointerdown', this._canvasDown);
    this.canvas.addEventListener('pointerup', this._canvasUp);
    this.canvas.addEventListener('pointerleave', this._canvasUp);
    this.canvas.addEventListener('pointercancel', this._canvasUp);
  }

  _loop() {
    const now = performance.now();
    const dt = Math.min(48, now - this.lastFrameT);
    this.lastFrameT = now;
    if (!this.finished) this._update(dt, now);
    this._updateHud();
    this._draw();
    if (this.finished) return;
    this._af = requestAnimationFrame(() => this._loop());
  }

  _update(dt, now) {
    if (this.setBanner.t > 0) this.setBanner.t--;
    const s = this.sets[this.setIndex];

    if (this.holding) {
      const inStickZone = this.barY > 0.66;
      const stuck = inStickZone && s.pushRate < this.dropRate * 0.78;
      let rate = s.pushRate;
      if (stuck) {
        rate *= 0.14;
        this.stallTimer += dt;
        this.shaking = true;
      } else {
        this.stallTimer = 0;
        this.shaking = false;
      }
      const wasBelowTop = this.barY < 0.95;
      this.barY = Math.min(1, this.barY + rate * dt / 1000);
      if (wasBelowTop && this.barY >= 0.95) this.reachedTop = true;
      if (this.stallTimer > 1500) this.form = Math.max(0, this.form - dt * 0.02);
    } else {
      const wasAboveBottom = this.barY > 0.08;
      this.barY = Math.max(0, this.barY - this.dropRate * dt / 1000);
      this.stallTimer = 0; this.shaking = false;
      if (wasAboveBottom && this.barY <= 0.08 && this.reachedTop) {
        this._completeRep(now);
      } else if (this.barY <= 0.08 && now - this.lastBottomTime < 260 && !this.reachedTop) {
        // Bounced off the chest without ever locking out — cheap reps cost form.
        this.form = Math.max(0, this.form - 6);
        this.failFlash = 8;
      }
      if (this.barY <= 0.08) this.lastBottomTime = now;
    }

    if (this.form <= 0 && !this.finished) {
      this.failFlash = 16;
      this._advanceSet();
    }
  }

  _completeRep(now) {
    const s = this.sets[this.setIndex];
    const dur = now - this.repStart;
    this.repStart = now;
    const repScore = jailClamp(1 - Math.abs(dur - 2000) / 900, 0, 1);
    s.reps++;
    this.allRepScores.push(repScore);
    this.totalReps++;
    this.reachedTop = false;
    s.pushRate *= 0.93;

    const b = this._bounds();
    this.particles.burst(b.x + b.w * 0.5, b.y + b.h * 0.35, this.char.color, repScore > 0.7 ? 18 : 10,
      { speed: repScore > 0.7 ? 3.6 : 2, life: 30, upBias: 1.4 });
    this.floaters.add(b.x + b.w * 0.5, b.y + b.h * 0.28,
      repScore > 0.85 ? 'LOCKOUT!' : repScore > 0.5 ? 'Rep.' : 'Sloppy.', this.char.color, { size: 16, life: 34 });

    if (s.reps >= s.targetReps) this._advanceSet();
  }

  _advanceSet() {
    if (this.setIndex >= this.sets.length - 1) { this._end(); return; }
    this.setIndex++;
    this.barY = 0; this.holding = false; this.reachedTop = false;
    this.form = 100; this.stallTimer = 0; this.shaking = false;
    this.repStart = performance.now();
    this.setBanner = { t: 90, text: this._setBannerText() };
  }

  _bounds() {
    const W = this.canvas.width, H = this.canvas.height;
    return { x: W * 0.08, y: H * 0.06, w: W * 0.84, h: H * 0.7 };
  }

  _updateHud() {
    const s = this.sets[this.setIndex];
    const repsEl = document.getElementById('jail-bench-reps');
    if (repsEl) repsEl.textContent = `SET ${this.setIndex + 1}/3 — ${s.reps}/${s.targetReps} REPS`;
    const formEl = document.getElementById('jail-bench-form-fill');
    if (formEl) {
      formEl.style.width = `${Math.round(this.form)}%`;
      formEl.style.background = this.form > 60 ? '#7ec89a' : this.form > 30 ? '#f4c542' : '#e05a4a';
    }
  }

  _draw() {
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    const b = this._bounds();
    const s = this.sets[this.setIndex];
    const shakeAmt = (this.shaking || this.failFlash > 0) && !this._reduced ? (this.shaking ? 3.5 : 5) : 0;
    const shakeX = shakeAmt ? (Math.random() - 0.5) * shakeAmt : 0;
    const shakeY = shakeAmt ? (Math.random() - 0.5) * shakeAmt * 0.4 : 0;

    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#1c1712'); bg.addColorStop(1, '#0e0b08');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    if (this.failFlash > 0) { ctx.fillStyle = `rgba(224,90,74,${this.failFlash / 16 * 0.18})`; ctx.fillRect(0, 0, W, H); this.failFlash--; }

    ctx.save();
    ctx.translate(shakeX, shakeY);

    const benchY = b.y + b.h * 0.62;
    const benchX = b.x + b.w * 0.5;
    ctx.fillStyle = '#3a322a';
    ctx.fillRect(benchX - b.w * 0.22, benchY, b.w * 0.44, b.h * 0.08);
    ctx.fillStyle = '#231d18';
    ctx.fillRect(benchX - b.w * 0.18, benchY + b.h * 0.08, b.w * 0.02, b.h * 0.16);
    ctx.fillRect(benchX + b.w * 0.16, benchY + b.h * 0.08, b.w * 0.02, b.h * 0.16);

    ctx.fillStyle = this.char.color;
    ctx.beginPath(); ctx.ellipse(benchX, benchY - b.h * 0.02, b.w * 0.16, b.h * 0.045, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(benchX - b.w * 0.2, benchY - b.h * 0.02, b.h * 0.04, 0, Math.PI * 2); ctx.fill();

    const railTop = b.y + b.h * 0.08, railBottom = benchY - b.h * 0.05;
    const barPy = railBottom - this.barY * (railBottom - railTop);
    const barW = b.w * 0.62;
    const plateR = 10 + s.plates * 6;
    ctx.strokeStyle = '#8a8a8a'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(benchX - barW / 2, barPy); ctx.lineTo(benchX + barW / 2, barPy); ctx.stroke();
    [-1, 1].forEach(side => {
      for (let p = 0; p < s.plates; p++) {
        const px = benchX + side * (barW / 2 - 6 - p * 9);
        ctx.fillStyle = '#26221e';
        ctx.beginPath(); ctx.arc(px, barPy, plateR, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#4a4038'; ctx.lineWidth = 2; ctx.stroke();
      }
    });

    if (this.shaking || this.form < 35) {
      ctx.strokeStyle = 'rgba(200,190,170,0.55)';
      ctx.lineWidth = 6; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(b.x + b.w * 0.92, b.y + b.h * 0.05);
      ctx.lineTo(benchX + barW / 2 + 6, barPy - 4);
      ctx.stroke();
    }

    const cadence = ((performance.now() - this.repStart) % 2000) / 2000;
    ctx.save();
    ctx.translate(b.x + b.w * 0.5, b.y + b.h * 0.92);
    ctx.strokeStyle = jailAlpha(this.char.color, 0.5);
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(0, 0, 14, -Math.PI / 2, -Math.PI / 2 + cadence * Math.PI * 2); ctx.stroke();
    ctx.restore();

    this.particles.draw(ctx);
    this.floaters.draw(ctx);
    this.particles.update();
    this.floaters.update();

    ctx.restore();

    if (this.setBanner.t > 0) {
      const a = Math.min(1, this.setBanner.t / 20);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, H * 0.42, W, H * 0.12);
      ctx.fillStyle = this.char.color;
      ctx.font = 'bold 26px VT323, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(this.setBanner.text, W / 2, H * 0.49);
      ctx.restore();
    }
  }

  _end() {
    this.finished = true;
    const repFrac = jailClamp(this.totalReps / 18, 0, 1);
    const avgRepScore = this.allRepScores.length
      ? this.allRepScores.reduce((a, b) => a + b, 0) / this.allRepScores.length : 0;
    const friendshipGain = Math.round(45 * (0.6 * repFrac + 0.4 * avgRepScore));
    this.destroy();
    this.onDone({
      grade: jailGradeFromGain(friendshipGain),
      friendshipGain,
      stats: [
        ['Total reps', `${this.totalReps}/18`],
        ['Avg tempo score', `${Math.round(avgRepScore * 100)}%`],
        ['Friendship', `+${friendshipGain}`],
      ],
      detail: { totalReps: this.totalReps, avgRepScore },
    });
  }

  destroy() {
    if (this._af) cancelAnimationFrame(this._af);
    this._af = null;
    this._btn.removeEventListener('pointerdown', this._down);
    this._btn.removeEventListener('pointerup', this._up);
    this._btn.removeEventListener('pointerleave', this._up);
    this._btn.removeEventListener('pointercancel', this._up);
    window.removeEventListener('keydown', this._keyDownH);
    window.removeEventListener('keyup', this._keyUpH);
    this.canvas.removeEventListener('pointerdown', this._canvasDown);
    this.canvas.removeEventListener('pointerup', this._canvasUp);
    this.canvas.removeEventListener('pointerleave', this._canvasUp);
    this.canvas.removeEventListener('pointercancel', this._canvasUp);
    document.getElementById('jail-bench-hud').classList.add('hidden');
  }
}

// ====================================================================
// 5c. SAM BANKMAN-FRIED — the trip
// ====================================================================

class JailTripGame {
  constructor(host, charId, onDone) {
    this.host = host;
    this.charId = charId;
    this.onDone = onDone;
    this.char = JAIL_CHARACTERS.find(c => c.id === charId);
    this.canvas = host.canvas;
    this.ctx = host.ctx;
    this._af = null;
    this._frame = 0;
    this._reduced = jailReducedMotion();
    this.particles = new JailParticles();
    this.floaters = new JailFloaters();

    this.worldW = 140;
    this.worldH = 420;
    this.viewH = 150;

    this.player = { x: 70, y: 405 };
    this.speed = 0.62;
    this.camY = this.player.y;
    this.padX = 0; this.padY = 0;

    this.timeLeftMs = 100000;
    this.utils = 0;
    this.utilMultiplier = 1;
    this.rescued = false;
    this.ended = false;
    this.shakeTimer = 0;
    this.activeBet = null;

    this._buildObjectives();
    this._bindInput();

    document.getElementById('jail-trip-hud').classList.remove('hidden');
    this._updateHud();
    this._lastT = performance.now();
    this._loop();
  }

  roadX(y) { return this.worldW / 2 + Math.sin(y * 0.018) * 30; }

  roadHalfWidth(y) {
    if (y < 60) return 8 + (y / 60) * 6;
    return 14;
  }

  _buildObjectives() {
    // Hand-placed level geometry (not authored content) — ~15 markers
    // whose full-clear detour cost runs well past the 100s clock, per the
    // plan's explicit tuning target: a good run gets most but not all.
    const defs = [
      { type: 'shrimp', y: 380, side: 1, dist: 16 },
      { type: 'shrimp', y: 340, side: -1, dist: 15 },
      { type: 'shrimp', y: 300, side: 1, dist: 17 },
      { type: 'shrimp', y: 250, side: -1, dist: 16 },
      { type: 'shrimp', y: 200, side: 1, dist: 15 },
      { type: 'shrimp', y: 150, side: -1, dist: 17 },
      { type: 'lobster', y: 365, side: -1, dist: 32 },
      { type: 'lobster', y: 280, side: 1, dist: 34 },
      { type: 'lobster', y: 220, side: -1, dist: 33 },
      { type: 'lobster', y: 165, side: 1, dist: 35 },
      { type: 'bet', y: 355, side: 1, dist: 4, betIdx: 0 },
      { type: 'bet', y: 260, side: -1, dist: 4, betIdx: 1 },
      { type: 'bet', y: 175, side: 1, dist: 4, betIdx: 2 },
      { type: 'term', y: 320, side: -1, dist: 58 },
      { type: 'term', y: 190, side: 1, dist: 60 },
    ];
    this.objectives = defs.map((d, i) => ({
      id: `obj${i}`, type: d.type, betIdx: d.betIdx,
      x: this.roadX(d.y) + d.side * d.dist, y: d.y,
      r: d.type === 'shrimp' ? 6 : d.type === 'lobster' ? 7 : d.type === 'bet' ? 6 : 7,
      holdNeeded: d.type === 'shrimp' ? 1500 : d.type === 'lobster' ? 3000 : 0,
      holdMs: 0, done: false,
    }));
  }

  _bindInput() {
    const keyMap = {
      arrowup: ['y', -1], w: ['y', -1], arrowdown: ['y', 1], s: ['y', 1],
      arrowleft: ['x', -1], a: ['x', -1], arrowright: ['x', 1], d: ['x', 1],
    };
    this._kd = (e) => {
      const m = keyMap[e.key.toLowerCase()]; if (!m) return;
      if (m[0] === 'x') this.padX = m[1]; else this.padY = m[1];
    };
    this._ku = (e) => {
      const m = keyMap[e.key.toLowerCase()]; if (!m) return;
      if (m[0] === 'x' && this.padX === m[1]) this.padX = 0;
      if (m[0] === 'y' && this.padY === m[1]) this.padY = 0;
    };
    window.addEventListener('keydown', this._kd);
    window.addEventListener('keyup', this._ku);

    this._padHandlers = [];
    document.querySelectorAll('#jail-trip-pad .heist-pad-btn').forEach(btn => {
      const axis = btn.dataset.axis, dir = parseFloat(btn.dataset.dir);
      const press = (e) => { e.preventDefault(); btn.classList.add('pressed'); if (axis === 'x') this.padX = dir; else this.padY = dir; };
      const release = () => { btn.classList.remove('pressed'); if (axis === 'x') this.padX = 0; else this.padY = 0; };
      btn.addEventListener('pointerdown', press);
      btn.addEventListener('pointerup', release);
      btn.addEventListener('pointerleave', release);
      btn.addEventListener('pointercancel', release);
      this._padHandlers.push({ btn, press, release });
    });

    this._betHandlers = [];
    ['a', 'b'].forEach(k => {
      const btn = document.getElementById(`jail-trip-bet-${k}`);
      const fn = () => this._resolveBet(k);
      btn.addEventListener('click', fn);
      this._betHandlers.push({ btn, fn });
    });
  }

  _loop() {
    const now = performance.now();
    const dt = Math.min(48, now - this._lastT);
    this._lastT = now;
    if (!this.ended) this._update(dt);
    this._updateHud();
    this._draw();
    if (this.ended) return;
    this._af = requestAnimationFrame(() => this._loop());
  }

  _update(dt) {
    this._frame++;
    if (this.shakeTimer > 0) this.shakeTimer--;

    if (!this.activeBet) {
      this.timeLeftMs -= dt;
      if (this.timeLeftMs <= 0) { this.timeLeftMs = 0; this._end(false); return; }

      const mx = this.padX, my = this.padY;
      if (mx || my) {
        const len = Math.hypot(mx, my) || 1;
        const rx = this.roadX(this.player.y);
        const hw = this.roadHalfWidth(this.player.y);
        const onRoad = Math.abs(this.player.x - rx) < hw;
        const spd = this.speed * (onRoad ? 1 : 0.55) * (dt / 16.67);
        this.player.x += (mx / len) * spd;
        this.player.y += (my / len) * spd;
      }
      this.player.x = jailClamp(this.player.x, 4, this.worldW - 4);
      this.player.y = jailClamp(this.player.y, 4, this.worldH - 4);

      if (this.player.y < 14) { this._end(true); return; }

      this.objectives.forEach(o => {
        if (o.done) return;
        const d = Math.hypot(o.x - this.player.x, o.y - this.player.y);
        const near = d < o.r + 3;
        if (o.type === 'bet') { if (near) this._openBet(o); return; }
        if (o.type === 'term') { if (near) this._collectTerm(o); return; }
        if (near) {
          o.holdMs += dt;
          if (o.holdMs >= o.holdNeeded) this._completeHold(o);
        } else {
          o.holdMs = Math.max(0, o.holdMs - dt * 2);
        }
      });
    }

    this.particles.update();
    this.floaters.update();

    const targetCamY = jailClamp(this.player.y, this.viewH / 2, this.worldH - this.viewH / 2);
    this.camY += (targetCamY - this.camY) * 0.14;
  }

  _completeHold(o) {
    o.done = true;
    const gain = o.type === 'shrimp' ? 1 : 3;
    this._addUtils(gain);
    const [px, py] = this._project(o.x, o.y);
    this.floaters.add(px, py - 16, `+${gain} Util${gain > 1 ? 's' : ''}`, '#f4c542', { size: 15 });
    this.particles.burst(px, py, o.type === 'shrimp' ? '#e08a5a' : '#c85a4a', 14, { speed: 2.6, life: 28, upBias: 1 });
  }

  _collectTerm(o) {
    o.done = true;
    this.utilMultiplier *= 1.3;
    const [px, py] = this._project(o.x, o.y);
    this.floaters.add(px, py - 16, '×1.3 UTILS', '#a86ad8', { size: 16, life: 50 });
    this.particles.burst(px, py, '#a86ad8', 22, { speed: 3.4, life: 36, upBias: 1.4 });
  }

  _addUtils(n) { this.utils = Math.max(0, Math.round(this.utils + n * this.utilMultiplier)); }

  _openBet(o) {
    if (this.activeBet) return;
    this.activeBet = o;
    const bet = JAIL_BETS[o.betIdx % JAIL_BETS.length];
    document.getElementById('jail-trip-bet-prompt').textContent = bet.prompt;
    document.getElementById('jail-trip-bet-a').textContent = bet.a.label;
    document.getElementById('jail-trip-bet-b').textContent = bet.b.label;
    document.getElementById('jail-trip-bet-panel').classList.remove('hidden');
  }

  _resolveBet(which) {
    const o = this.activeBet;
    if (!o) return;
    const bet = JAIL_BETS[o.betIdx % JAIL_BETS.length];
    const opt = bet[which];
    const win = Math.random() < opt.p;
    const [px, py] = this._project(o.x, o.y);
    if (win) {
      this._addUtils(6);
      this.floaters.add(px, py - 16, '+6 Utils', '#7ec89a', { size: 16 });
      this.particles.burst(px, py, '#7ec89a', 20, { speed: 3.2, life: 32, upBias: 1.2 });
    } else {
      this.timeLeftMs = Math.max(0, this.timeLeftMs - 8000);
      this.utils = Math.max(0, this.utils - 4);
      this.floaters.add(px, py - 16, '-8s / -4 Utils', '#e05a4a', { size: 15 });
      if (!this._reduced) this.shakeTimer = 12;
    }
    o.done = true;
    this.activeBet = null;
    document.getElementById('jail-trip-bet-panel').classList.add('hidden');
  }

  _updateHud() {
    const clockEl = document.getElementById('jail-trip-clock');
    if (clockEl) {
      const s = Math.max(0, Math.ceil(this.timeLeftMs / 1000));
      clockEl.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      clockEl.classList.toggle('jail-trip-clock-low', s <= 15);
    }
    const utilEl = document.getElementById('jail-trip-utils');
    if (utilEl) utilEl.textContent = `${this.utils} Util${this.utils === 1 ? '' : 's'}${this.utilMultiplier > 1 ? ` (×${this.utilMultiplier.toFixed(2)})` : ''}`;
  }

  _bounds() {
    const W = this.canvas.width, H = this.canvas.height;
    const h = H * 0.94;
    const w = Math.min(W * 0.9, this.worldW * (h / this.viewH));
    return { x: (W - w) / 2, y: H * 0.02, w, h };
  }

  _project(wx, wy) {
    const b = this._bounds();
    const camMinY = this.camY - this.viewH / 2;
    const scale = b.h / this.viewH;
    const wob = this._reduced ? 0 : Math.sin(this._frame * 0.03 + wy * 0.1) * 3.5;
    return [b.x + (wx / this.worldW) * b.w + wob, b.y + (wy - camMinY) * scale];
  }

  _draw() {
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    const b = this._bounds();
    const camMinY = this.camY - this.viewH / 2;
    const scale = b.h / this.viewH;
    const hue = (this._frame * 0.7) % 360;
    const shakeX = this.shakeTimer > 0 && !this._reduced ? (Math.random() - 0.5) * 7 : 0;

    ctx.fillStyle = '#05040a';
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.translate(shakeX, 0);
    ctx.beginPath(); ctx.rect(b.x, b.y, b.w, b.h); ctx.clip();

    const bandH = 18;
    for (let wy = camMinY - bandH; wy < camMinY + this.viewH + bandH; wy += bandH) {
      const py = b.y + (wy - camMinY) * scale;
      const desat = jailClamp(1 - (60 - wy) / 60, 0, 1);
      const bandHue = (hue + wy * 1.4) % 360;
      const sat = wy < 60 ? 15 + desat * 55 : 65;
      const light = wy < 60 ? 8 + desat * 8 : 14;
      ctx.fillStyle = `hsl(${bandHue}, ${sat}%, ${light}%)`;
      ctx.fillRect(b.x, py, b.w, bandH * scale + 1);
    }

    for (let wy = Math.max(0, camMinY - bandH); wy < camMinY + this.viewH + bandH; wy += 4) {
      const rx = this.roadX(wy), hw = this.roadHalfWidth(wy);
      const [lx, ly] = this._project(rx - hw, wy);
      const [rxp] = this._project(rx + hw, wy);
      const rHue = (hue + wy * 2) % 360;
      const sat = wy < 60 ? 20 + jailClamp(1 - (60 - wy) / 60, 0, 1) * 50 : 70;
      ctx.fillStyle = `hsl(${rHue}, ${sat}%, ${wy < 60 ? 22 : 38}%)`;
      ctx.fillRect(lx, ly, Math.max(1, rxp - lx), 4 * scale + 1);
    }

    this.objectives.forEach(o => {
      if (o.done) return;
      const [px, py] = this._project(o.x, o.y);
      if (py < b.y - 20 || py > b.y + b.h + 20) return;
      ctx.save();
      ctx.translate(px, py);
      if (o.type === 'shrimp') { ctx.fillStyle = '#e08a5a'; ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill(); }
      else if (o.type === 'lobster') { ctx.fillStyle = '#c85a4a'; ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill(); }
      else if (o.type === 'bet') { ctx.fillStyle = '#f4c542'; ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(7, 6); ctx.lineTo(-7, 6); ctx.closePath(); ctx.fill(); }
      else if (o.type === 'term') { ctx.fillStyle = '#a86ad8'; ctx.fillRect(-6, -8, 12, 16); }
      if (o.holdNeeded > 0 && o.holdMs > 0) {
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, 11, -Math.PI / 2, -Math.PI / 2 + (o.holdMs / o.holdNeeded) * Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
    });

    if (camMinY < 30) {
      const [px, py] = this._project(this.roadX(15), 15);
      const glow = 0.6 + Math.sin(this._frame * 0.08) * 0.4;
      ctx.save();
      ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 14 * glow;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(px, py, 8, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    if (this._frame % 2 === 0 && !this._reduced) {
      const [ppx, ppy] = this._project(this.player.x, this.player.y);
      this.particles.list.push({ x: ppx, y: ppy, vx: 0, vy: 0.3, gravity: 0, life: 16, maxLife: 16, color: `hsl(${hue},80%,60%)`, r: 3 });
    }
    this.particles.draw(ctx);

    const [ppx, ppy] = this._project(this.player.x, this.player.y);
    ctx.save();
    ctx.shadowColor = `hsl(${hue},90%,65%)`; ctx.shadowBlur = 10;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(ppx, ppy, 6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    this.floaters.draw(ctx);

    ctx.restore(); // clip + shake

    ctx.save();
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.min(W, H) * 0.65);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, `hsla(${(hue + 180) % 360}, 60%, 4%, 0.55)`);
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  _end(rescued) {
    this.ended = true;
    this.rescued = rescued;
    const utilsScore = Math.round(20 * jailClamp(this.utils / 30, 0, 1));
    const friendshipGain = Math.min(45, (rescued ? 25 : 0) + utilsScore);
    this.destroy();
    this.onDone({
      grade: jailGradeFromGain(friendshipGain),
      friendshipGain,
      stats: [
        ['Caroline', rescued ? 'Rescued' : 'Not rescued'],
        ['Utils banked', `${this.utils}`],
        ['Friendship', `+${friendshipGain}`],
      ],
      detail: { rescued, utils: this.utils },
    });
  }

  destroy() {
    if (this._af) cancelAnimationFrame(this._af);
    this._af = null;
    window.removeEventListener('keydown', this._kd);
    window.removeEventListener('keyup', this._ku);
    (this._padHandlers || []).forEach(({ btn, press, release }) => {
      btn.removeEventListener('pointerdown', press);
      btn.removeEventListener('pointerup', release);
      btn.removeEventListener('pointerleave', release);
      btn.removeEventListener('pointercancel', release);
    });
    (this._betHandlers || []).forEach(({ btn, fn }) => btn.removeEventListener('click', fn));
    document.getElementById('jail-trip-hud').classList.add('hidden');
    document.getElementById('jail-trip-bet-panel').classList.add('hidden');
  }
}
