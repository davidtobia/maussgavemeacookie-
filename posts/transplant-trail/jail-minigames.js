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
    this.holding = [null, null, null];
    this.touchLane = {};
    this.served = 0; this.slips = 0; this.champagne = 0;
    this.stun = null;          // { kind: 'served'|'slip', until }
    this.callout = null;       // big centered text { text, t0 }
    this.section = -1;
    this.backup = 0;           // 0..1 backup dancers on stage

    // The dancer eases toward an "energy" set by how well you're playing.
    this.danceEnergy = 0.3;
    this._danceTarget = 0.3;

    this._buildChart();
    this._startAudio();
    this._bindInput();

    document.getElementById('jail-rhythm-hud').classList.remove('hidden');
    this._updateHud();
    this._loop();
  }

  _buildChart() {
    const chart = JAIL_RHYTHM_CHART;
    this.barMs = (60000 / chart.bpm) * 4;
    const slotMs = this.barMs / 8;
    this.notes = [];
    chart.bars.forEach((bar, bi) => {
      for (let s = 0; s < 8; s++) {
        const c = bar[s];
        const t = chart.offsetMs + bi * this.barMs + s * slotMs;
        if ('012'.includes(c)) {
          let len = 0;
          while (bar[s + 1 + len] === '-') len++;
          this.notes.push({ lane: +c, t, kind: len ? 'hold' : 'tap', end: len ? t + len * slotMs : t, judged: false });
        } else if ('ghi'.includes(c)) this.notes.push({ lane: 'ghi'.indexOf(c), t, kind: 'gold', judged: false });
        else if ('xyz'.includes(c)) this.notes.push({ lane: 'xyz'.indexOf(c), t, kind: 'subpoena', judged: false });
        else if (c === 'o') this.notes.push({ lane: 1, t, kind: 'oil', judged: false });
      }
    });
    const worth = { tap: 100, hold: 125, gold: 300 };
    this.maxPossible = this.notes.reduce((a, n) => a + (worth[n.kind] || 0), 0);
    this.chartEndMs = chart.offsetMs + chart.bars.length * this.barMs + 1000;
    this.leadMs = 1500;
  }

  // ------------------------------------------------------------ audio

  _startAudio() {
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

  // A beat in D minor: kick on the beat, hats on the off-beats, a clap on
  // 2 and 4, and a bass riff. The remix doubles the kick and lifts the bass.
  _scheduleAudio() {
    const chart = JAIL_RHYTHM_CHART;
    const eighth = 60000 / chart.bpm / 2;
    const elapsedMs = (this.audioCtx.currentTime - this.audioStartCtxTime) * 1000 + 120;
    const riff = [73.4, 0, 73.4, 87.3, 0, 98, 87.3, 0, 65.4, 0, 65.4, 73.4, 0, 87.3, 98, 110];
    while (this._beatIdx * eighth < elapsedMs && this._beatIdx * eighth < this.chartEndMs) {
      const i = this._beatIdx;
      const when = this.audioStartCtxTime + (i * eighth) / 1000;
      const bar = Math.floor((i * eighth - chart.offsetMs) / this.barMs);
      const remix = bar >= 8;
      if (i % 2 === 0 || (remix && i % 8 === 7)) this._playKick(when);
      else this._playHat(when);
      if (i % 4 === 2) this._playClap(when);
      const f = riff[i % 16];
      if (f) this._playBass(when, f * (remix ? 1.5 : 1));
      this._beatIdx++;
    }
  }

  _playKick(when) {
    const ctx = this.audioCtx;
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.frequency.setValueAtTime(130, when);
    osc.frequency.exponentialRampToValueAtTime(45, when + 0.09);
    gain.gain.setValueAtTime(0.9, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + 0.16);
    osc.connect(gain).connect(TTAudio.raw);
    osc.start(when); osc.stop(when + 0.18);
  }

  _noise(when, dur, vol, type, freq) {
    const ctx = this.audioCtx;
    const src = ctx.createBufferSource(); src.buffer = TTAudio._noise;
    const filt = ctx.createBiquadFilter(); filt.type = type; filt.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, when); gain.gain.exponentialRampToValueAtTime(0.001, when + dur);
    src.connect(filt).connect(gain).connect(TTAudio.raw);
    src.start(when, Math.random() * 0.5); src.stop(when + dur + 0.02);
  }

  _playHat(when) { this._noise(when, 0.04, 0.2, 'highpass', 6500); }
  _playClap(when) { this._noise(when, 0.12, 0.35, 'bandpass', 1600); this._noise(when + 0.012, 0.1, 0.25, 'bandpass', 1300); }

  _playBass(when, f) {
    const ctx = this.audioCtx;
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = 'square';
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
    osc.frequency.setValueAtTime(f, when);
    gain.gain.setValueAtTime(0.001, when);
    gain.gain.linearRampToValueAtTime(0.18, when + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, when + 0.24);
    osc.connect(lp).connect(gain).connect(TTAudio.raw);
    osc.start(when); osc.stop(when + 0.26);
  }

  // ------------------------------------------------------------ input

  _bindInput() {
    const keyLane = (e) => ({ j: 0, k: 1, l: 2, arrowleft: 0, arrowdown: 1, arrowright: 2 })[e.key.toLowerCase()];
    this._keyDownH = (e) => {
      const lane = keyLane(e);
      if (lane == null) return;
      e.preventDefault();
      if (!e.repeat) this._hitLane(lane);
    };
    this._keyUpH = (e) => { const lane = keyLane(e); if (lane != null) this._releaseLane(lane); };
    window.addEventListener('keydown', this._keyDownH);
    window.addEventListener('keyup', this._keyUpH);
    const laneAt = (clientX) => {
      const rect = this.canvas.getBoundingClientRect();
      const x = (clientX - rect.left) * (this.canvas.width / (rect.width || 1));
      const b = this._bounds();
      return jailClamp(Math.floor((x - b.x) / (b.w / 3)), 0, 2);
    };
    this._canvasDownH = (e) => {
      if (e.pointerType === 'touch') return;
      e.preventDefault();
      this._mouseLane = laneAt(e.clientX);
      this._hitLane(this._mouseLane);
    };
    this._canvasUpH = (e) => {
      if (e.pointerType === 'touch' || this._mouseLane == null) return;
      this._releaseLane(this._mouseLane); this._mouseLane = null;
    };
    this._canvasTouchH = (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        const lane = laneAt(t.clientX);
        this.touchLane[t.identifier] = lane;
        this._hitLane(lane);
      }
    };
    this._canvasTouchEndH = (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        const lane = this.touchLane[t.identifier];
        delete this.touchLane[t.identifier];
        if (lane != null) this._releaseLane(lane);
      }
    };
    this.canvas.addEventListener('pointerdown', this._canvasDownH);
    window.addEventListener('pointerup', this._canvasUpH);
    this.canvas.addEventListener('touchstart', this._canvasTouchH, { passive: false });
    this.canvas.addEventListener('touchend', this._canvasTouchEndH, { passive: false });
    this.canvas.addEventListener('touchcancel', this._canvasTouchEndH, { passive: false });
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
    if (best && (best.kind === 'subpoena' || best.kind === 'oil') && bestDist <= 130) {
      best.judged = true;
      this._trap(best);
      return;
    }
    if (!best || bestDist > 150) {
      this._breakCombo();
      this._flashJudge(lane, 'MISS', '#7a6a5a');
      return;
    }
    best.judged = true;
    let grade, score, color;
    if (bestDist <= 55) { grade = 'PERFECT'; score = 100; color = '#f4c542'; }
    else if (bestDist <= 100) { grade = 'GREAT'; score = 70; color = '#7ec89a'; }
    else { grade = 'OK'; score = 35; color = '#6ab0d8'; }
    if (best.kind === 'gold') {
      score *= 3; this.champagne++;
      TTAudio.sfx('coin');
      this._spray(lane);
      this.floaters.add(this._laneX(lane), this._judgeY() - 60, 'CHAMPAGNE!', '#f4c542', { size: 22, life: 40 });
    }
    if (best.kind === 'hold') { best.held = true; this.holding[lane] = best; score = Math.round(score * 0.5); }
    this._addCombo();
    this.earned += score;
    this._danceTarget = jailClamp(0.45 + (grade === 'PERFECT' ? 0.4 : grade === 'GREAT' ? 0.25 : 0.1) + this.combo * 0.02, 0, 1);
    this._flashJudge(lane, grade, color);
    this._hitFx(lane, color, grade === 'PERFECT');
  }

  _releaseLane(lane) {
    const h = this.holding[lane];
    if (!h) return;
    this.holding[lane] = null;
    const t = this.now();
    if (t < h.end - 110) {
      h.dropped = true;
      this._breakCombo();
      this._flashJudge(lane, 'LET GO', '#ff8a6a');
    } else this._holdDone(h);
  }

  _holdDone(h) {
    if (h.done) return;
    h.done = true;
    this.earned += 75;
    this._flashJudge(h.lane, 'HELD!', '#f4c542');
    this._hitFx(h.lane, '#f4c542', true);
  }

  _addCombo() {
    this.combo++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    const ad = JAIL_RHYTHM_CHART.adlibs[this.combo];
    if (ad) { this._call(ad); TTAudio.sfx('ko'); }
  }

  _breakCombo() {
    if (this.combo >= 6) this.floaters.add(this.canvas.width / 2, this.canvas.height * 0.35, 'THE ENTOURAGE LEAVES', '#ff8a6a', { size: 18, life: 50 });
    this.combo = 0;
    this._danceTarget = 0.08;
    this.missShake = 8;
  }

  // Tapped a subpoena or the baby oil.
  _trap(n) {
    this._breakCombo();
    this.earned = Math.max(0, this.earned - 150);
    if (n.kind === 'subpoena') {
      this.served++;
      this.stun = { kind: 'served', until: this.now() + this.barMs * 0.5 };
      this._call('SERVED!', '#ff5a4a');
      TTAudio.sfx('fail');
    } else {
      this.slips++;
      this.stun = { kind: 'slip', until: this.now() + this.barMs * 0.5 };
      this._call('SLIPPED IN THE BABY OIL', '#f4e8a0');
      TTAudio.sfx('squish');
    }
    this.missShake = 14;
  }

  _call(text, color) { this.callout = { text, color: color || '#ffffff', t0: this.now() }; }

  _flashJudge(lane, text, color) { this.judgeFlash = { lane, text, color, t: 22 }; }

  _laneX(lane) { const b = this._bounds(); return b.x + (b.w / 3) * (lane + 0.5); }
  _judgeY() { const b = this._bounds(); return b.y + b.h * 0.8; }

  _hitFx(lane, color, perfect) {
    const px = this._laneX(lane), py = this._judgeY();
    this.particles.burst(px, py, color, perfect ? 16 : 9, { speed: perfect ? 3.4 : 2.2, life: perfect ? 34 : 22, upBias: 1.2 });
    if (perfect) this.perfectFlash = 10;
  }

  _spray(lane) {
    const px = this._laneX(lane), py = this._judgeY();
    this.particles.burst(px, py - 10, '#f8f0c0', 30, { speed: 5, life: 40, upBias: 3, gravity: 0.12 });
  }

  _bounds() {
    const W = this.canvas.width, H = this.canvas.height;
    const w = Math.min(W * 0.94, 520);
    const h = H * 0.9;
    return { x: (W - w) / 2, y: H * 0.05, w, h };
  }

  // ------------------------------------------------------------ dancer

  // One chibi dancer, posed by `move`. Energy scales how hard he goes.
  _drawDancer(cx, groundY, scale, t, move, alpha) {
    const ctx = this.ctx;
    const e = this.danceEnergy;
    const beat = 60000 / JAIL_RHYTHM_CHART.bpm;
    const ph = ((t % (beat / 2)) / (beat / 2) + 1) % 1;       // eighth-note phase
    const beatN = Math.floor(t / beat);
    const col = this.char.color;
    const stun = this.stun && t < this.stun.until ? this.stun.kind : null;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx, groundY);
    ctx.scale(scale, scale);
    let bodyRot = 0, lift = Math.max(0, Math.sin(ph * Math.PI * 2)) * (4 + e * 14);
    let armL = -2.2, armR = -0.9, twerk = 0, slide = 0, lying = false;
    if (stun === 'slip') { bodyRot = -1.4; lift = 0; armL = -2.8; armR = -0.2; }
    else if (stun === 'served') { lift = 0; armL = 1.9; armR = 1.25; }
    else if (move === 'bop') {
      twerk = Math.sin(ph * Math.PI * 4) * (5 + e * 26);
      const up = jailClamp((e - 0.3) / 0.7, 0, 1);
      armL = -1.6 - up * 0.9 + Math.sin(ph * Math.PI * 2) * 0.3; armR = -1.5 + up * 0.9 - Math.sin(ph * Math.PI * 2) * 0.3;
    } else if (move === 'robot') {
      const P = Math.PI;
      const poses = [[P, 0], [-P / 2, P / 2], [P / 2, -P / 2], [P, -P / 2]]; // hard right angles, snapping on the beat
      [armL, armR] = poses[beatN % 4];
      bodyRot = (beatN % 2 ? 0.08 : -0.08); lift = 0;
    } else if (move === 'sprinkler') {
      armL = -2.4; // hand behind the head
      const tick = Math.floor((t / (beat / 4)) % 8);
      armR = -0.3 - (tick < 6 ? tick * 0.18 : 0);
      twerk = Math.sin(ph * Math.PI * 2) * 6;
    } else if (move === 'helicopter') {
      bodyRot = (t / 1000) * (4 + e * 8); lift = 30;
      armL = -3.1; armR = -0.05;
    } else if (move === 'worm') {
      lying = true;
    }
    slide = 0;
    ctx.translate(slide, -lift);
    ctx.rotate(bodyRot);
    if (lying) {
      ctx.fillStyle = col;
      for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(-50 + i * 20, -14 - Math.max(0, Math.sin(t / 120 - i)) * 18, 13, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
      return;
    }
    // legs
    ctx.fillStyle = jailShade(col, -45);
    ctx.fillRect(-24, -2, 15, 36); ctx.fillRect(9, -2, 15, 36);
    // booty
    ctx.save(); ctx.translate(0, -22); ctx.rotate(twerk * 0.012);
    ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(0, 8 + Math.abs(twerk) * 0.5, 36, 24, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // torso: white suit in the remix
    ctx.fillStyle = this.remix ? '#f4f0ea' : jailShade(col, 15);
    jailRoundRectPath(ctx, -20, -74, 40, 56, 14); ctx.fill();
    // gold chain
    ctx.strokeStyle = '#f4c542'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, -70, 12, 0.3, Math.PI - 0.3); ctx.stroke();
    // arms
    ctx.strokeStyle = this.remix ? '#e0dcd4' : jailShade(col, -20);
    ctx.lineWidth = 10; ctx.lineCap = 'round';
    const arm = (sx, a) => { ctx.beginPath(); ctx.moveTo(sx, -60); ctx.lineTo(sx + Math.cos(a) * 34, -60 + Math.sin(a) * 34); ctx.stroke(); };
    arm(-18, armL); arm(18, armR);
    if (stun === 'served') { // a subpoena slapped on his chest
      ctx.fillStyle = '#f2f2f2'; ctx.fillRect(-14, -66, 28, 34);
      ctx.fillStyle = '#c03030'; ctx.fillRect(-10, -60, 20, 3); ctx.fillRect(-10, -52, 16, 2); ctx.fillRect(-10, -46, 18, 2);
    }
    // head + shades
    ctx.fillStyle = '#8a5a3a'; ctx.beginPath(); ctx.arc(0, -90, 21, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0c0c0c'; jailRoundRectPath(ctx, -17, -94, 34, 10, 4); ctx.fill();
    if (stun === 'slip') { ctx.fillStyle = '#fff'; ctx.font = 'bold 20px VT323, monospace'; ctx.fillText('@_@', -14, -100); }
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
    const chart = JAIL_RHYTHM_CHART;
    // Section changes: new move, its callout; the remix flips the look.
    const bar = Math.floor((t - chart.offsetMs) / this.barMs);
    const sec = jailClamp(Math.floor(bar / 4), 0, chart.sections.length - 1);
    if (bar >= 0 && sec !== this.section) {
      this.section = sec;
      const S = chart.sections[sec];
      this._call(S.call, S.remix ? '#f4c542' : '#ffffff');
      if (S.remix) { this.remix = true; TTAudio.sfx('powerup'); } else TTAudio.sfx('select');
    }
    this.notes.forEach(n => {
      if (n.judged) {
        if (n.kind === 'hold' && n.held && !n.dropped && !n.done && t >= n.end) {
          this.holding[n.lane] = null; this._holdDone(n);
        }
        return;
      }
      if (t - n.t > 150) {
        n.judged = true;
        if (n.kind === 'subpoena' || n.kind === 'oil') return; // dodged
        this._breakCombo();
      }
    });
    this.danceEnergy += (this._danceTarget - this.danceEnergy) * 0.08;
    this.backup += ((this.combo >= 8 ? 1 : 0) - this.backup) * 0.06;
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
    const shakeX = this.missShake > 0 ? (Math.random() - 0.5) * this.missShake : 0;

    const bg = ctx.createLinearGradient(0, 0, 0, H);
    if (this.remix) {
      const hue = (t / 20) % 360;
      bg.addColorStop(0, `hsl(${hue},55%,16%)`); bg.addColorStop(1, `hsl(${(hue + 60) % 360},60%,8%)`);
    } else { bg.addColorStop(0, '#160a1c'); bg.addColorStop(1, '#0a0610'); }
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    // spotlights sweeping in the remix
    if (this.remix) {
      for (let i = 0; i < 2; i++) {
        const a = Math.sin(t / 700 + i * 2) * 0.5;
        ctx.save(); ctx.translate(W * (0.25 + i * 0.5), 0); ctx.rotate(a);
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, 'rgba(255,240,200,0.18)'); g.addColorStop(1, 'rgba(255,240,200,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(10, 0); ctx.lineTo(140, H); ctx.lineTo(-140, H); ctx.fill();
        ctx.restore();
      }
    }

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

    // Dancers: him in the middle, the entourage either side when you're hot.
    const S = JAIL_RHYTHM_CHART.sections[Math.max(0, this.section)];
    const groundY = b.y + b.h * 0.6; // above the tap line, behind the falling notes
    const move = this.section < 0 ? 'bop' : (this.danceEnergy < 0.15 && !this.stun ? 'worm' : S.move);
    if (this.backup > 0.02) {
      [-1, 1].forEach(side => this._drawDancer(b.x + b.w / 2 + side * (b.w * 0.33 + (1 - this.backup) * b.w * 0.4), groundY + 10, 0.75, t + 120, S.move, 0.5 * this.backup));
    }
    this._drawDancer(b.x + b.w / 2, groundY, 1.25 + this.danceEnergy * 0.2, t, move, 0.8);

    const judgeY = this._judgeY();
    const padR = Math.min(laneW * 0.4, 52);
    const beatPhase = (t % (this.barMs / 4)) / (this.barMs / 4);
    const pulse = 1 + (1 - beatPhase) * 0.12;
    ctx.save();
    ctx.strokeStyle = jailAlpha(this.char.color, 0.9);
    ctx.lineWidth = 3 * pulse;
    ctx.shadowColor = this.char.color; ctx.shadowBlur = 12 * pulse;
    ctx.beginPath(); ctx.moveTo(b.x, judgeY); ctx.lineTo(b.x + b.w, judgeY); ctx.stroke();
    ctx.restore();

    const yAt = (nt) => b.y + (1 - (nt - t) / this.leadMs) * (judgeY - b.y);
    this.notes.forEach(n => {
      const nx = b.x + laneW * (n.lane + 0.5);
      if (n.kind === 'hold' && !n.dropped && !n.done) {
        // the tail: a bar from the head up to its end
        const y0 = n.held ? judgeY : yAt(n.t), y1 = Math.max(b.y - 20, yAt(n.end));
        if (y0 > b.y - 20 && n.end - t < this.leadMs + 2000) {
          ctx.fillStyle = jailAlpha(laneColors[n.lane], 0.55);
          jailRoundRectPath(ctx, nx - padR * 0.32, y1, padR * 0.64, Math.max(4, y0 - y1), padR * 0.3); ctx.fill();
        }
      }
      if (n.judged) return;
      const dt = n.t - t;
      if (dt > this.leadMs || dt < -200) return;
      const ny = yAt(n.t);
      if (ny < b.y - 20) return;
      this._drawNote(n, nx, ny, padR, laneColors[n.lane], t);
    });

    ctx.restore();

    for (let i = 0; i < 3; i++) {
      const cx = b.x + laneW * (i + 0.5);
      const press = Math.max(this.lanePress[i], this.holding[i] ? 0.8 : 0);
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
      const a = jf.t / 22;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(b.x + laneW * (jf.lane + 0.5), judgeY - 40);
      ctx.scale(0.85 + (1 - a) * 0.35, 0.85 + (1 - a) * 0.35);
      ctx.font = 'bold 22px VT323, monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = jf.color;
      ctx.fillText(jf.text, 0, 0);
      ctx.restore();
    }

    ctx.restore();

    // Big callout: section names, ad-libs, SERVED.
    if (this.callout) {
      const age = (t - this.callout.t0) / 1000;
      if (age > 1.6) this.callout = null;
      else {
        const pop = age < 0.15 ? age / 0.15 : 1;
        ctx.save();
        ctx.globalAlpha = age > 1.2 ? (1.6 - age) / 0.4 : 1;
        ctx.translate(W / 2 + (Math.random() - 0.5) * 4, H * 0.3);
        ctx.rotate(-0.06);
        ctx.scale(pop * 1.1, pop * 1.1);
        const size = Math.min(48, W / (this.callout.text.length * 0.55));
        ctx.font = `bold ${size}px VT323, monospace`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = 6; ctx.strokeStyle = '#000'; ctx.strokeText(this.callout.text, 0, 0);
        ctx.fillStyle = this.callout.color; ctx.fillText(this.callout.text, 0, 0);
        ctx.restore();
      }
    }

    if (this.perfectFlash > 0) {
      ctx.fillStyle = `rgba(244,197,66,${(this.perfectFlash / 10) * 0.12})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (this.stun && t < this.stun.until && this.stun.kind === 'slip') {
      ctx.fillStyle = 'rgba(255,240,170,0.12)'; ctx.fillRect(0, 0, W, H);
    }
  }

  _drawNote(n, nx, ny, padR, color, t) {
    const ctx = this.ctx, r = padR * 0.72;
    ctx.save();
    if (n.kind === 'subpoena') {
      ctx.translate(nx, ny); ctx.rotate(Math.sin(t / 150 + n.t) * 0.15);
      ctx.fillStyle = '#f2f2f2'; ctx.fillRect(-r * 0.75, -r, r * 1.5, r * 2);
      ctx.fillStyle = '#c03030'; ctx.fillRect(-r * 0.55, -r * 0.7, r * 1.1, 4);
      ctx.fillStyle = '#888'; for (let i = 0; i < 4; i++) ctx.fillRect(-r * 0.55, -r * 0.35 + i * r * 0.32, r * (0.7 + (i % 2) * 0.3), 2.5);
      ctx.strokeStyle = '#ff3a3a'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(0, 0, r * 1.2, 0, Math.PI * 2); ctx.moveTo(-r * 0.85, -r * 0.85); ctx.lineTo(r * 0.85, r * 0.85); ctx.stroke();
    } else if (n.kind === 'oil') {
      ctx.translate(nx, ny);
      ctx.fillStyle = '#f4e8a0'; jailRoundRectPath(ctx, -r * 0.55, -r * 0.9, r * 1.1, r * 1.8, 6); ctx.fill();
      ctx.fillStyle = '#ff9ac0'; ctx.fillRect(-r * 0.3, -r * 1.25, r * 0.6, r * 0.4);
      ctx.fillStyle = '#7ab0e0'; ctx.fillRect(-r * 0.45, -r * 0.2, r * 0.9, r * 0.5);
      ctx.strokeStyle = '#ff3a3a'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(0, 0, r * 1.2, 0, Math.PI * 2); ctx.moveTo(-r * 0.85, -r * 0.85); ctx.lineTo(r * 0.85, r * 0.85); ctx.stroke();
    } else if (n.kind === 'gold') {
      ctx.translate(nx, ny);
      ctx.shadowColor = '#f4c542'; ctx.shadowBlur = 18;
      ctx.fillStyle = '#f4c542'; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#2a5a2a'; jailRoundRectPath(ctx, -r * 0.22, -r * 0.7, r * 0.44, r * 1.3, 4); ctx.fill();
      ctx.fillStyle = '#f4f0d0'; ctx.fillRect(-r * 0.22, -r * 0.1, r * 0.44, r * 0.3);
    } else {
      ctx.shadowColor = color; ctx.shadowBlur = 10;
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(nx, ny, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath(); ctx.arc(nx, ny, padR * 0.34, 0, Math.PI * 2); ctx.fill();
      if (n.kind === 'hold') { ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(nx, ny, r * 0.82, 0, Math.PI * 2); ctx.stroke(); }
    }
    ctx.restore();
  }

  _end() {
    this.finished = true;
    const accuracy = this.maxPossible > 0 ? jailClamp(this.earned / this.maxPossible, 0, 1) : 0;
    const friendshipGain = Math.round(45 * jailClamp((accuracy - 0.3) / 0.55, 0, 1));
    this.destroy();
    this.onDone({
      grade: jailGradeFromGain(friendshipGain),
      friendshipGain,
      stats: [
        ['Accuracy', `${Math.round(accuracy * 100)}%`],
        ['Max combo', `${this.maxCombo}x`],
        ['Champagne', String(this.champagne)],
        ['Subpoenaed', String(this.served)],
        ['Slipped', String(this.slips)],
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
    window.removeEventListener('keyup', this._keyUpH);
    window.removeEventListener('pointerup', this._canvasUpH);
    this.canvas.removeEventListener('pointerdown', this._canvasDownH);
    this.canvas.removeEventListener('touchstart', this._canvasTouchH);
    this.canvas.removeEventListener('touchend', this._canvasTouchEndH);
    this.canvas.removeEventListener('touchcancel', this._canvasTouchEndH);
    document.getElementById('jail-rhythm-hud').classList.add('hidden');
  }
}
