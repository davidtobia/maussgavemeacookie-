/**
 * THE TRANSPLANT TRAIL — SOUND
 * =============================
 *
 * Everything is synthesized with Web Audio: a little chiptune sequencer
 * for music, and one-shot effects. No audio files.
 *
 *   TTAudio.music('trail')      switch songs (crossfades; null = silence)
 *   TTAudio.sfx('punch')        one-shot effect (some take opts)
 *   TTAudio.loop('engine')      continuous sound -> { set(pitch, vol), stop() }
 *   TTAudio.ctx / TTAudio.raw   shared context + a unity-gain bus, for games
 *                               that synthesize their own (rush, rhythm)
 *
 * Phones only allow audio after a tap, so nothing plays until the first
 * pointer/key event; the requested song starts then. Mute is a small
 * button in the corner, remembered between visits.
 */

const TT_NOTE = (() => {
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const cache = {};
  return (name) => {
    if (cache[name]) return cache[name];
    const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
    if (!m) return 0;
    const midi = 12 * (+m[3] + 1) + base[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
    return (cache[name] = 440 * Math.pow(2, (midi - 69) / 12));
  };
})();

// Songs. Each channel is a space-separated step list: a note ("C5", "F#4",
// "Bb3"), "." rest, "-" hold the previous note. `div` = steps per beat.
// Drum letters: k kick, s snare, h hat, o open hat, c crash.
const TT_SONGS = {
  // Jaunty, folksy -- an Oregon Trail homage, in C.
  trail: {
    bpm: 116, swing: 0.1, space: 0.18,
    lead: { inst: 'pulse', div: 2, vol: 0.9, notes:
      'C5 - E5 G5 A5 G5 E5 C5  D5 - F5 A5 G5 - - .  E5 - G5 C6 B5 A5 G5 E5  F5 E5 D5 - C5 - - .  ' +
      'A4 C5 F5 - E5 D5 C5 A4  G4 B4 D5 G5 F5 E5 D5 B4  C5 E5 G5 E5 F5 A5 G5 F5  E5 - D5 - C5 - - .' },
    harm: { inst: 'pulse12', div: 2, vol: 0.45, notes:
      'E4 - . . C4 - . .  F4 - . . B3 - . .  G4 - . . E4 - . .  A4 - . . G4 - . .  ' +
      'F4 - . . A4 - . .  D4 - . . B3 - . .  E4 - . . A4 - . .  G4 - F4 - E4 - . .' },
    bass: { inst: 'tri', div: 2, notes:
      'C3 . G3 . C3 . G3 .  D3 . A3 . G2 . D3 .  C3 . G3 . E3 . G3 .  F2 . C3 . C3 . G2 .  ' +
      'F2 . C3 . F2 . C3 .  G2 . D3 . G2 . B2 .  C3 . G3 . F2 . A2 .  G2 . B2 . C3 . . .' },
    drums: { div: 4, notes: 'k . h . s . h . k . h k s . h .' },
  },
  // Cannon: the trail theme, wound up.
  cannon: { ref: 'trail', bpm: 138, swing: 0 },
  // Bodega: fast, bouncy, A minor.
  bodega: {
    bpm: 152, space: 0.1,
    lead: { inst: 'pulse', div: 2, notes:
      'A4 . C5 A4 D5 . C5 A4  G4 . A4 C5 E5 D5 C5 .  A4 . C5 A4 D5 . E5 G5  A5 G5 E5 D5 C5 . A4 .' },
    bass: { inst: 'tri', div: 2, notes:
      'A2 A3 A2 A3 G2 G3 G2 G3  F2 F3 F2 F3 E2 E3 G2 G3  A2 A3 A2 A3 G2 G3 G2 G3  F2 F3 G2 G3 A2 . A2 .' },
    drums: { div: 4, notes: 'k . h k s . h . k . h k s . h h' },
  },
  // The mushroom: same tune, melting.
  bodegaTrip: { ref: 'bodega', bpm: 112, space: 0.5, leadInst: 'warble', bassInst: 'warbleBass', drums: { div: 4, notes: 'k . . . s . . h k . . . s . o .' } },
  // Liberty Island: calm water, D major, no drums.
  liberty: {
    bpm: 84, space: 0.4,
    lead: { inst: 'bell', div: 2, notes:
      'F#5 - - A5 G5 - E5 -  D5 - - - . . . .  F#5 - - A5 B5 - A5 -  G5 - F#5 - E5 - - -' },
    pad: { inst: 'pad', div: 2, notes:
      'D4 - - - - - - -  B3 - - - - - - -  G3 - - - - - - -  A3 - - - - - - -' },
    bass: { inst: 'tri', div: 2, notes:
      'D3 - - - - - - -  B2 - - - - - - -  G2 - - - - - - -  A2 - - - - - - -' },
  },
  // Jet ski: driving, triumphant, G major.
  jetski: {
    bpm: 142, space: 0.15,
    lead: { inst: 'pulse', div: 2, notes:
      'G5 . D5 G5 A5 B5 A5 G5  E5 . C5 E5 G5 A5 G5 E5  D5 . B4 D5 G5 A5 B5 D6  C6 B5 A5 G5 A5 - - .' },
    harm: { inst: 'pulse12', div: 2, vol: 0.5, notes:
      'B4 - - - D5 - - -  G4 - - - C5 - - -  G4 - - - B4 - - -  E5 - - - F#5 - - -' },
    bass: { inst: 'tri', div: 2, notes:
      'G2 G3 G2 G3 G2 G3 G2 G3  C2 C3 C2 C3 C2 C3 C2 C3  G2 G3 G2 G3 D2 D3 D2 D3  A2 A3 A2 A3 D2 D3 D2 D3' },
    drums: { div: 4, notes: 'k . h . s . h k k . h . s . h .' },
  },
  // Heist: spy minor, D.
  heist: {
    bpm: 118, space: 0.25,
    lead: { inst: 'pulse12', div: 2, notes:
      'D5 . . D5 E5 . F5 .  E5 . . D5 C#5 . . .  D5 . . D5 E5 . F5 .  G5 F5 E5 D5 C#5 . A4 .' },
    bass: { inst: 'tri', div: 2, notes:
      'D2 . A2 . D2 . A2 .  A1 . E2 . A1 . C#2 .  D2 . A2 . D2 . A2 .  Bb1 . F2 . A1 . E2 .' },
    drums: { div: 4, notes: 'k . h h s . h . k k h . s . h h' },
  },
  // Jail yard: bluesy E minor shuffle.
  jail: {
    bpm: 88, swing: 0.2, space: 0.3,
    lead: { inst: 'pulse', div: 2, vol: 0.8, notes:
      'E5 . G5 A5 Bb5 A5 G5 E5  D5 . E5 - - . . .  E5 . G5 A5 Bb5 A5 G5 A5  B5 A5 G5 E5 D5 E5 - .' },
    bass: { inst: 'tri', div: 2, notes:
      'E2 . B2 . D3 . B2 .  A2 . E3 . G3 . E3 .  E2 . B2 . D3 . B2 .  B1 . F#2 . A2 . B2 .' },
    drums: { div: 4, notes: 'k . . h s . . h k . k h s . . h' },
  },
  // Junkyard Olympics: aggressive C minor.
  junkyard: {
    bpm: 152, space: 0.1,
    lead: { inst: 'saw', div: 2, notes:
      'C5 C5 . C5 Eb5 . C5 G5  F5 . Eb5 . D5 . G4 .  C5 C5 . C5 Eb5 . G5 Bb5  Ab5 G5 F5 Eb5 D5 . G4 .' },
    bass: { inst: 'tri', div: 2, notes:
      'C2 C2 C3 C2 C2 C3 C2 C3  Ab1 Ab1 Ab2 Ab1 G1 G1 G2 G1  C2 C2 C3 C2 C2 C3 C2 C3  F1 F1 F2 F1 G1 G1 G2 B1' },
    drums: { div: 4, notes: 'k . s k k . s . k . s k k s s s' },
  },
  // Chasing her: a dream. Cascading bells over long pads, F lydian.
  trolley: {
    bpm: 76, space: 0.55,
    lead: { inst: 'bell', div: 2, notes:
      'A5 C6 E6 C6 G5 B5 D6 B5  F5 A5 C6 A5 E5 G5 B5 G5  A5 C6 E6 G6 F6 E6 D6 C6  B5 G5 E5 G5 B5 D6 C6 B5' },
    pad: { inst: 'pad', div: 2, notes:
      'F4 - - - - - - -  D4 - - - - - - -  A4 - - - - - - -  G4 - - - - - - -' },
    bass: { inst: 'tri', div: 2, vol: 0.7, notes:
      'F2 - - - - - - -  D2 - - - - - - -  F2 - - - - - - -  G2 - - - - - - -' },
  },
  // ...and the dream gone wrong: same shape, minor, detuned, pounding.
  trolleyDark: {
    bpm: 150, space: 0.2,
    lead: { inst: 'saw', div: 2, notes:
      'Ab5 C6 Eb6 C6 G5 Bb5 D6 Bb5  F5 Ab5 C6 Ab5 G5 B5 D6 B5  Ab5 C6 Eb6 G6 F6 Eb6 D6 C6  B5 G5 D5 G5 B5 D6 C6 B5' },
    bass: { inst: 'tri', div: 2, notes:
      'F2 F2 F3 F2 Eb2 Eb2 Eb3 Eb2  Db2 Db2 Db3 Db2 G1 G1 G2 G1  F2 F2 F3 F2 Eb2 Eb2 Eb3 Eb2  Db2 Db2 G1 G1 G1 G2 G1 G2' },
    drums: { div: 4, notes: 'k . h k s . h . k k h . s . s s' },
  },
  // New friend: fanfare.
  friend: {
    bpm: 128, space: 0.2,
    lead: { inst: 'pulse', div: 2, notes:
      'C5 E5 G5 C6 - G5 C6 E6  D6 - C6 - B5 - G5 -  A5 C6 F6 - E6 - C6 -  D6 - B5 G5 C6 - - .' },
    harm: { inst: 'pulse12', div: 2, vol: 0.5, notes:
      'E4 - G4 - E4 - G4 -  G4 - B4 - D5 - B4 -  F4 - A4 - G4 - E4 -  G4 - F4 - E4 - - .' },
    bass: { inst: 'tri', div: 2, notes:
      'C3 G3 C3 G3 C3 G3 C3 G3  G2 D3 G2 D3 G2 D3 G2 D3  F2 C3 F2 C3 C3 G3 C3 G3  G2 D3 G2 B2 C3 . . .' },
    drums: { div: 4, notes: 'k . h . s . h . k . h k s . h h' },
  },
};

// Which song plays on which screen (games can override with TTAudio.music).
const TT_SCREEN_SONGS = {
  'load-screen': 'trail', 'main-menu': 'trail', 'chapter-select': 'trail', 'character-select': 'trail',
  'player-name': 'trail', 'character-info': 'trail', 'premise': 'trail', 'nyc-arrival': 'trail',
  'trail-screen': 'trail', 'apartment-hunt': 'trail',
  'bodega-game': 'bodega', 'rush-game': null, 'liberty-scene': 'liberty', 'jetski-game': 'jetski',
  'cannon-game': 'cannon', 'heist-game': 'heist', 'jail-game': 'jail',
};

// A short silent WAV, built once (for the iOS media-session trick).
const TT_SILENT_WAV = (() => {
  const n = 2205, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const w = (o, str) => { for (let i = 0; i < str.length; i++) v.setUint8(o + i, str.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 22050, true); v.setUint32(28, 44100, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, n * 2, true);
  let bin = ''; const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return 'data:audio/wav;base64,' + btoa(bin);
})();

const TTAudio = {
  ctx: null, out: null, musicBus: null, master: null,
  muted: false,
  _want: undefined, _song: null, _timer: null, _noise: null, _waves: {},

  init() {
    try { this.muted = localStorage.getItem('tt-muted') === '1'; } catch (e) { /* private mode */ }
    // iOS only lets audio start inside certain gestures -- touchend and
    // click count, touchstart/pointerdown don't -- so listen on all of
    // them and keep trying until the context is actually running.
    const unlock = () => { this._ensure(); this._unlockIOS(); };
    ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'click', 'keydown'].forEach(ev =>
      document.addEventListener(ev, unlock, { capture: true, passive: true }));
    // Play as media, so the iPhone ring/silent switch doesn't mute it.
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* older iOS */ }
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend().catch(() => {});
      else this.ctx.resume().catch(() => {});
    });
    this._want = 'trail'; // the title theme, from the first tap
    this._buildButton();
    // Every menu button clicks.
    document.addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('button');
      if (b && !b.disabled && !b.classList.contains('trail-chip') && b.id !== 'tt-mute') this.sfx('click');
    }, true);
  },

  _ensure() {
    if (this.ctx) {
      if (this.ctx.state !== 'running' && this.ctx.state !== 'closed' && !document.hidden) this.ctx.resume().catch(() => {});
      return true;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return false;
    try { this.ctx = new Ctx(); } catch (e) { return false; }
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = this.muted ? 0 : 1.3;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp).connect(c.destination);
    this.musicBus = c.createGain(); this.musicBus.gain.value = 0.26; this.musicBus.connect(this.master);
    this.out = c.createGain(); this.out.gain.value = 2.2; this.out.connect(this.master);
    // Games that mix their own sound (rush, rhythm) at their original level.
    this.raw = c.createGain(); this.raw.gain.value = 1; this.raw.connect(this.master);
    // A soft echo the music sends into, for space.
    this.delay = c.createDelay(1); this.delay.delayTime.value = 0.32;
    const fb = c.createGain(); fb.gain.value = 0.32;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
    this.delay.connect(lp).connect(fb).connect(this.delay);
    this.delayOut = c.createGain(); this.delayOut.gain.value = 0.6;
    lp.connect(this.delayOut).connect(this.musicBus);
    // Shared white noise.
    const len = c.sampleRate;
    this._noise = c.createBuffer(1, len, c.sampleRate);
    const d = this._noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    if (this._want !== undefined) { const w = this._want; this._want = undefined; this.music(w); }
    return true;
  },

  // Older iOS (no navigator.audioSession): a silent looping <audio> tag,
  // started inside a gesture, flips the page into the media audio
  // session so Web Audio plays with the silent switch on. Also play one
  // silent buffer through the context itself, the classic unlock.
  _unlockIOS() {
    if (!this.ctx) return;
    if (!this._silentBuf) {
      try {
        const b = this.ctx.createBuffer(1, 1, 22050);
        const src = this.ctx.createBufferSource();
        src.buffer = b; src.connect(this.ctx.destination); src.start(0);
        this._silentBuf = true;
      } catch (e) { /* ignore */ }
    }
    if (!this._mediaTag && !navigator.audioSession) {
      const a = document.createElement('audio');
      a.setAttribute('playsinline', '');
      a.loop = true;
      a.src = TT_SILENT_WAV;
      const p = a.play();
      if (p && p.then) p.then(() => { this._mediaTag = a; }).catch(() => {});
    }
  },

  _buildButton() {
    const b = document.createElement('button');
    b.id = 'tt-mute';
    b.className = 'tt-mute';
    b.setAttribute('aria-label', 'Sound on or off');
    const paint = () => { b.textContent = this.muted ? 'SOUND OFF' : 'SOUND ON'; b.classList.toggle('off', this.muted); };
    paint();
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      this.muted = !this.muted;
      try { localStorage.setItem('tt-muted', this.muted ? '1' : '0'); } catch (er) { /* ignore */ }
      this._ensure();
      if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 1.3, this.ctx.currentTime, 0.03);
      paint();
    });
    ['pointerdown', 'touchstart'].forEach(ev => b.addEventListener(ev, (e) => e.stopPropagation(), { passive: true }));
    document.body.appendChild(b);
  },

  onScreen(id) {
    if (id in TT_SCREEN_SONGS) this.music(TT_SCREEN_SONGS[id]);
  },

  // ------------------------------------------------------------ music

  music(name) {
    if (!this.ctx) { this._want = name; return; }
    if (this._song && this._song.name === name) return;
    const c = this.ctx, now = c.currentTime;
    if (this._song) {
      const old = this._song;
      old.gain.gain.setTargetAtTime(0, now, 0.25);
      setTimeout(() => { try { old.gain.disconnect(); } catch (e) { /* ignore */ } }, 1500);
      this._song = null;
    }
    clearInterval(this._timer);
    if (!name || !TT_SONGS[name]) return;
    const song = this._resolve(name);
    const gain = c.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.setTargetAtTime(1, now, 0.2);
    gain.connect(this.musicBus);
    const send = c.createGain(); send.gain.value = song.space || 0; send.connect(this.delay); gain.connect(send);
    const beat = 60 / song.bpm;
    const chans = ['lead', 'harm', 'pad', 'bass', 'drums'].filter(k => song[k]).map(k => ({
      key: k, def: song[k], steps: song[k].notes.trim().split(/\s+/), i: 0, t: now + 0.08, dt: beat / song[k].div,
    }));
    this._song = { name, gain, song, chans, send };
    this._timer = setInterval(() => this._schedule(), 25);
    this._schedule();
  },

  _resolve(name) {
    const s = TT_SONGS[name];
    if (!s.ref) return s;
    const base = TT_SONGS[s.ref];
    const out = { ...base, ...s };
    ['lead', 'harm', 'pad', 'bass'].forEach(k => { if (base[k]) out[k] = { ...base[k] }; });
    if (s.leadInst && out.lead) out.lead.inst = s.leadInst;
    if (s.leadInst && out.harm) out.harm.inst = s.leadInst;
    if (s.bassInst && out.bass) out.bass.inst = s.bassInst;
    if (s.drums) out.drums = s.drums;
    return out;
  },

  _schedule(until) {
    const st = this._song;
    if (!st) return;
    const horizon = until || this.ctx.currentTime + 0.18;
    st.chans.forEach(ch => {
      while (ch.t < horizon) {
        const idx = ch.i % ch.steps.length;
        const tok = ch.steps[idx];
        const swing = st.song.swing && ch.def.div === 2 && idx % 2 === 1 ? st.song.swing * ch.dt : 0;
        const t = ch.t + swing;
        if (ch.key === 'drums') { if (tok !== '.') this._drum(tok, t, st.gain); }
        else if (tok !== '.' && tok !== '-') {
          let hold = 1;
          while (ch.steps[(idx + hold) % ch.steps.length] === '-' && hold < ch.steps.length) hold++;
          this._note(ch.def.inst, TT_NOTE(tok), t, hold * ch.dt, (ch.def.vol || 1), st.gain);
        }
        ch.t += ch.dt; ch.i++;
      }
    });
  },

  _wave(duty) {
    if (this._waves[duty]) return this._waves[duty];
    const n = 32, re = new Float32Array(n), im = new Float32Array(n);
    for (let k = 1; k < n; k++) im[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
    return (this._waves[duty] = this.ctx.createPeriodicWave(re, im));
  },

  _env(g, t, peak, a, d, sus, len, r) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.setTargetAtTime(peak * sus, t + a, d);
    g.gain.setTargetAtTime(0.0001, t + Math.max(a, len), r);
  },

  _note(inst, f, t, len, vol, dest) {
    const c = this.ctx;
    const g = c.createGain();
    g.connect(dest);
    const end = t + len + 1.6;
    const osc = (type, freq, detune) => {
      const o = c.createOscillator();
      if (type === 'pulse25') o.setPeriodicWave(this._wave(0.25));
      else if (type === 'pulse12') o.setPeriodicWave(this._wave(0.125));
      else o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (detune) o.detune.value = detune;
      o.start(t); o.stop(end);
      return o;
    };
    if (inst === 'pulse' || inst === 'pulse12') {
      const o = osc(inst === 'pulse' ? 'pulse25' : 'pulse12', f);
      if (len > 0.3) this._vibrato(o, t + 0.18, end, 5.5, f * 0.006);
      o.connect(g); this._env(g, t, 0.16 * vol, 0.004, 0.09, 0.6, len * 0.92, 0.04);
    } else if (inst === 'saw') {
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200; lp.Q.value = 4;
      const o1 = osc('sawtooth', f, -8), o2 = osc('sawtooth', f, 8);
      o1.connect(lp); o2.connect(lp); lp.connect(g);
      this._env(g, t, 0.07 * vol, 0.004, 0.08, 0.5, len * 0.9, 0.04);
    } else if (inst === 'tri' || inst === 'warbleBass') {
      const o = osc('triangle', f);
      if (inst === 'warbleBass') this._vibrato(o, t, end, 3, f * 0.03);
      o.connect(g); this._env(g, t, 0.36 * vol, 0.004, 0.12, 0.7, len * 0.9, 0.05);
    } else if (inst === 'bell') {
      const o1 = osc('sine', f), o2 = osc('sine', f * 3.01), o3 = osc('triangle', f * 2);
      const g2 = c.createGain(); g2.gain.value = 0.18; o2.connect(g2).connect(g);
      const g3 = c.createGain(); g3.gain.value = 0.12; o3.connect(g3).connect(g);
      o1.connect(g);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.2 * vol, t + 0.006);
      g.gain.setTargetAtTime(0.0001, t + 0.006, 0.45);
    } else if (inst === 'pad') {
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1300;
      [-9, 0, 9].forEach(dt => osc('sawtooth', f, dt).connect(lp));
      lp.connect(g);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.05 * vol, t + Math.min(0.6, len * 0.4));
      g.gain.setTargetAtTime(0.0001, t + len, 0.4);
    } else if (inst === 'warble') {
      const o = osc('sine', f), o2 = osc('triangle', f * 1.005);
      this._vibrato(o, t, end, 4.5, f * 0.035); this._vibrato(o2, t, end, 3.1, f * 0.05);
      o.connect(g); o2.connect(g);
      this._env(g, t, 0.2 * vol, 0.03, 0.2, 0.7, len, 0.15);
    }
  },

  _vibrato(o, t, end, rate, depth) {
    const c = this.ctx, l = c.createOscillator(), lg = c.createGain();
    l.frequency.value = rate; lg.gain.value = depth;
    l.connect(lg).connect(o.frequency);
    l.start(t); l.stop(end);
  },

  _drum(k, t, dest) {
    const c = this.ctx;
    if (k === 'k') {
      const o = c.createOscillator(), g = c.createGain();
      o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      g.gain.setValueAtTime(0.55, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      o.connect(g).connect(dest); o.start(t); o.stop(t + 0.2);
    } else if (k === 's') {
      this._noiseHit(t, 0.12, 0.28, 'bandpass', 1900, dest);
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'triangle'; o.frequency.setValueAtTime(200, t); o.frequency.exponentialRampToValueAtTime(120, t + 0.06);
      g.gain.setValueAtTime(0.15, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
      o.connect(g).connect(dest); o.start(t); o.stop(t + 0.1);
    } else if (k === 'h') this._noiseHit(t, 0.03, 0.09, 'highpass', 7500, dest);
    else if (k === 'o') this._noiseHit(t, 0.16, 0.08, 'highpass', 6500, dest);
    else if (k === 'c') this._noiseHit(t, 0.8, 0.12, 'highpass', 5000, dest);
  },

  _noiseHit(t, dur, vol, type, freq, dest, freq1) {
    const c = this.ctx;
    const src = c.createBufferSource(); src.buffer = this._noise;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t);
    if (freq1) f.frequency.exponentialRampToValueAtTime(freq1, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(dest || this.out);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
  },

  // ------------------------------------------------------------ effects

  _tone(type, f0, f1, dur, vol, t, opts) {
    const c = this.ctx;
    t = t || c.currentTime;
    const o = c.createOscillator(), g = c.createGain();
    if (type === 'pulse') o.setPeriodicWave(this._wave(0.25)); else o.type = type;
    o.frequency.setValueAtTime(Math.max(1, f0), t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    if (opts && opts.vib) this._vibrato(o, t, t + dur, opts.vib, opts.depth || f0 * 0.05);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    let node = o;
    if (opts && opts.filter) {
      const f = c.createBiquadFilter(); f.type = opts.filter; f.frequency.value = opts.freq || 1200; if (opts.q) f.Q.value = opts.q;
      o.connect(f); node = f;
    }
    node.connect(g).connect(this.out);
    o.start(t); o.stop(t + dur + 0.05);
  },

  _arp(notes, step, type, vol, t, len) {
    t = t || this.ctx.currentTime;
    notes.forEach((n, i) => this._tone(type, TT_NOTE(n), TT_NOTE(n), len || step * 1.6, vol, t + i * step));
  },

  sfx(name, opts) {
    if (!this._ensure() || this.muted) return;
    const c = this.ctx, t = c.currentTime, o = opts || {};
    const r = (a, b) => a + Math.random() * (b - a);
    switch (name) {
      case 'click':   this._tone('pulse', 880, 880, 0.04, 0.2); break;
      case 'select':  this._tone('pulse', 660, 660, 0.05, 0.12); this._tone('pulse', 990, 990, 0.08, 0.12, t + 0.05); break;
      case 'toast':   this._tone('triangle', 880, 880, 0.08, 0.16); this._tone('triangle', 1320, 1320, 0.14, 0.14, t + 0.07); break;
      case 'arrive':  this._arp(['C5', 'E5', 'G5', 'C6'], 0.08, 'pulse', 0.12); break;
      case 'coin':    this._tone('pulse', 988, 988, 0.07, 0.14); this._tone('pulse', 1319, 1319, 0.28, 0.14, t + 0.07); break;
      case 'catch': {
        const p = Math.pow(2, Math.min(o.combo || 0, 12) / 12);
        this._tone('pulse', 620 * p, 940 * p, 0.09, 0.3); break;
      }
      case 'bad':     this._tone('square', 160, 80, 0.22, 0.16, t, { filter: 'lowpass', freq: 900 }); this._noiseHit(t, 0.1, 0.2, 'lowpass', 700); break;
      case 'powerup': this._arp(['C5', 'E5', 'G5', 'C6', 'E6', 'G6', 'C7'], 0.045, 'pulse', 0.12); break;
      case 'trip':    this._tone('sine', 300, 1600, 1.2, 0.22, t, { vib: 7, depth: 120 }); this._tone('triangle', 1500, 200, 1.4, 0.16, t + 0.3, { vib: 5, depth: 90 }); break;
      case 'buzzer':  this._tone('square', 196, 180, 0.7, 0.16, t, { filter: 'lowpass', freq: 1400 }); this._tone('square', 233, 215, 0.7, 0.1, t, { filter: 'lowpass', freq: 1400 }); break;
      case 'jump':    this._tone('pulse', 320, 640, 0.12, 0.12); break;
      case 'boing':   this._tone('sine', 220, 700, 0.12, 0.25); this._tone('sine', 700, 330, 0.22, 0.2, t + 0.12, { vib: 18, depth: 30 }); break;
      case 'land':    this._noiseHit(t, 0.12, 0.25, 'lowpass', 500); this._tone('sine', 110, 50, 0.14, 0.3); break;
      case 'slap':    this._noiseHit(t, 0.07, 0.5, 'bandpass', 2400); this._tone('triangle', 300, 120, 0.08, 0.2); break;
      case 'trip-up': this._noiseHit(t, 0.07, 0.5, 'bandpass', 2400); this._tone('square', 300, 90, 0.3, 0.12, t + 0.05, { filter: 'lowpass', freq: 1200 }); break;
      case 'tick':    this._tone('pulse', 1500, 1500, 0.025, 0.1); break;
      case 'punch':   this._noiseHit(t, 0.1, 0.55, 'lowpass', 1100); this._tone('sine', 140, 45, 0.14, 0.45); break;
      case 'swish':   this._noiseHit(t, 0.2, 0.32, 'bandpass', 700, null, 5200); break;
      case 'stab':    this._noiseHit(t, 0.06, 0.4, 'highpass', 3000); this._tone('sawtooth', 900, 300, 0.08, 0.08); break;
      case 'gun':     this._noiseHit(t, 0.16, 0.7, 'lowpass', 3500, null, 400); this._tone('square', 180, 40, 0.12, 0.25); this._noiseHit(t, 0.02, 0.5, 'highpass', 5000); break;
      case 'splat':   this._noiseHit(t, 0.28, 0.5, 'lowpass', 900, null, 180); this._tone('sine', 120, 38, 0.22, 0.35); this._noiseHit(t + 0.05, 0.12, 0.25, 'bandpass', 500); break;
      case 'scream': {
        const f = r(650, 1050);
        this._tone('sawtooth', f, f * 0.55, r(0.45, 0.7), 0.3, t, { vib: r(7, 11), depth: f * 0.06, filter: 'bandpass', freq: 1300, q: 2 });
        break;
      }
      case 'oof':     this._tone('square', 240, 110, 0.18, 0.12, t, { filter: 'lowpass', freq: 1000 }); this._noiseHit(t, 0.08, 0.3, 'lowpass', 800); break;
      case 'ko':      this._tone('pulse', 523, 523, 0.06, 0.1); this._tone('pulse', 784, 784, 0.12, 0.1, t + 0.05); break;
      case 'explosion': this._noiseHit(t, 1.1, 0.8, 'lowpass', 1600, null, 120); this._tone('sine', 80, 28, 0.9, 0.55); break;
      case 'crunch':  this._noiseHit(t, 0.5, 0.7, 'bandpass', 900, null, 200); for (let i = 0; i < 6; i++) this._noiseHit(t + i * 0.05 + r(0, 0.03), 0.04, 0.4, 'highpass', 2500); this._tone('sine', 70, 30, 0.6, 0.5); break;
      case 'whoosh':  this._noiseHit(t, 0.5, 0.35, 'bandpass', 300, null, 2200); break;
      case 'splash':  this._noiseHit(t, 0.6, 0.45, 'highpass', 900, null, 3000); for (let i = 0; i < 5; i++) this._tone('sine', r(500, 900), r(900, 1400), 0.06, 0.06, t + 0.1 + i * 0.07); break;
      case 'chime':   this._tone('sine', 1319, 1319, 0.5, 0.16); this._tone('sine', 1760, 1760, 0.6, 0.12, t + 0.08); break;
      case 'perfect': this._arp(['E6', 'G6', 'B6', 'E7'], 0.05, 'sine', 0.16, t, 0.4); break;
      case 'fail':    ['G4', 'F#4', 'F4'].forEach((n, i) => this._tone('square', TT_NOTE(n), TT_NOTE(n) * 0.97, i === 2 ? 0.5 : 0.18, 0.1, t + i * 0.2, { filter: 'lowpass', freq: 1500 })); break;
      case 'fanfare': this._arp(['G4', 'C5', 'E5'], 0.1, 'pulse', 0.13); this._tone('pulse', TT_NOTE('G5'), TT_NOTE('G5'), 0.6, 0.13, t + 0.3, { vib: 6, depth: 6 }); this._tone('triangle', TT_NOTE('C4'), TT_NOTE('C4'), 0.9, 0.2, t + 0.3); break;
      case 'reveal':  this._arp(['C4', 'G4', 'C5', 'E5', 'G5'], 0.07, 'triangle', 0.18); this._noiseHit(t + 0.35, 0.6, 0.12, 'highpass', 5000); break;
      case 'lever':   this._noiseHit(t, 0.03, 0.4, 'bandpass', 3000); this._tone('square', 200, 140, 0.06, 0.1); break;
      case 'stomp':   this._tone('sine', 75, 26, 0.5, 0.7); this._noiseHit(t, 0.35, 0.5, 'lowpass', 400); break;
      case 'squish':  this._noiseHit(t, 0.3, 0.4, 'lowpass', 700, null, 150); this._tone('sine', 300, 90, 0.25, 0.25, t, { vib: 25, depth: 40 }); break;
      case 'coinflip': for (let i = 0; i < 7; i++) this._tone('pulse', 1800, 1800, 0.02, 0.08, t + i * (0.05 + i * 0.012)); break;
      case 'zero':    this._tone('square', 110, 55, 0.9, 0.18, t, { filter: 'lowpass', freq: 800 }); break;
      case 'morph':   this._tone('sawtooth', 700, 70, 1.6, 0.12, t, { vib: 4, depth: 60, filter: 'lowpass', freq: 1800 }); this._tone('sawtooth', 707, 66, 1.6, 0.1, t, { vib: 3, depth: 50, filter: 'lowpass', freq: 1800 }); break;
      case 'shimmer': this._arp(['A5', 'C6', 'E6', 'A6', 'E6', 'C6'], 0.06, 'sine', 0.08, t, 0.5); break;
      case 'pop':     this._tone('sine', r(600, 900), r(200, 300), 0.08, 0.2); break;
      case 'engine-rev': this._tone('sawtooth', 90, 260, 0.4, 0.08, t, { filter: 'lowpass', freq: 900 }); break;
    }
  },

  // ------------------------------------------------------------ loops

  // Continuous sounds a game keeps adjusting: handle.set(pitch 0..1+, vol 0..1)
  loop(kind) {
    if (!this._ensure()) return { set() {}, stop() {} };
    const c = this.ctx, g = c.createGain();
    g.gain.value = 0;
    g.connect(this.out);
    const nodes = [];
    let set;
    if (kind === 'engine') {
      const o1 = c.createOscillator(), o2 = c.createOscillator(), lp = c.createBiquadFilter();
      o1.type = 'sawtooth'; o2.type = 'square'; lp.type = 'lowpass'; lp.frequency.value = 700; lp.Q.value = 3;
      o1.connect(lp); o2.connect(lp); lp.connect(g);
      o1.start(); o2.start(); nodes.push(o1, o2);
      set = (p, v) => {
        const now = c.currentTime;
        o1.frequency.setTargetAtTime(55 + p * 110, now, 0.08);
        o2.frequency.setTargetAtTime(27.5 + p * 55, now, 0.08);
        lp.frequency.setTargetAtTime(500 + p * 1400, now, 0.1);
        g.gain.setTargetAtTime(0.07 * v, now, 0.1);
      };
    } else if (kind === 'rumble') {
      const src = c.createBufferSource(); src.buffer = this._noise; src.loop = true;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220;
      const o = c.createOscillator(); o.type = 'square'; o.frequency.value = 46;
      const og = c.createGain(); og.gain.value = 0.25;
      src.connect(lp).connect(g); o.connect(og).connect(lp);
      src.start(); o.start(); nodes.push(src, o);
      set = (p, v) => { const now = c.currentTime; o.frequency.setTargetAtTime(38 + p * 30, now, 0.1); g.gain.setTargetAtTime(0.5 * v, now, 0.12); };
    } else if (kind === 'chop') {
      const src = c.createBufferSource(); src.buffer = this._noise; src.loop = true;
      const bp = c.createBiquadFilter(); bp.type = 'lowpass'; bp.frequency.value = 600;
      const am = c.createGain(); am.gain.value = 0;
      const lfo = c.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 13;
      const lg = c.createGain(); lg.gain.value = 0.5;
      lfo.connect(lg).connect(am.gain);
      src.connect(bp).connect(am).connect(g);
      src.start(); lfo.start(); nodes.push(src, lfo);
      set = (p, v) => { const now = c.currentTime; lfo.frequency.setTargetAtTime(11 + p * 6, now, 0.1); g.gain.setTargetAtTime(0.6 * v, now, 0.1); };
    } else if (kind === 'siren') {
      const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = 820;
      const lfo = c.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 1.6;
      const lg = c.createGain(); lg.gain.value = 140;
      lfo.connect(lg).connect(o.frequency);
      o.connect(g); o.start(); lfo.start(); nodes.push(o, lfo);
      set = (p, v) => { g.gain.setTargetAtTime(0.05 * v, c.currentTime, 0.2); };
    } else {
      return { set() {}, stop() {} };
    }
    return {
      set,
      stop: () => {
        g.gain.setTargetAtTime(0, c.currentTime, 0.08);
        setTimeout(() => { nodes.forEach(n => { try { n.stop(); } catch (e) { /* ignore */ } }); try { g.disconnect(); } catch (e) { /* ignore */ } }, 500);
      },
    };
  },
};

document.addEventListener('DOMContentLoaded', () => TTAudio.init());
