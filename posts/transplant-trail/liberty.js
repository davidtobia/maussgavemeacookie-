/**
 * THE TRANSPLANT TRAIL - LIBERTY ISLAND
 * =====================================
 * Where the rush run drops you, finished or wiped out. Modeled on Oregon
 * Trail's river crossings: the Statue of Liberty (cracked out, bug-eyed,
 * smoking -- same drawing as the rush finale, rushDrawStatue() in
 * rush.js) talks to you, and you pick how to get off the island:
 *
 *   1. Pay for the ferry      -- costs LIBERTY_FERRY_COST, that's it
 *   2. Steal a jet ski        -- the jet ski race (jetski.js)
 *   3. Steal a helicopter     -- minigame, not built yet
 *
 * Whichever way you cross, you come ashore at Battery Park and the trail
 * resumes heading north to Washington Square Park.
 *
 * All of the statue's dialogue lives in LIBERTY_LINES below. The
 * [PLACEHOLDER] entries are slots for real writing.
 */

const LIBERTY_FERRY_COST = 500;

const LIBERTY_LINES = {
  intro:         '[PLACEHOLDER -- you just slammed into the Statue of Liberty and slid down her. She looks at you.]',
  introWipedOut: '[PLACEHOLDER -- you wash up on Liberty Island after wiping out. She finds you.]',
  choose:        '[PLACEHOLDER -- she asks how you plan to get off her island.]',
  ferry:         '[PLACEHOLDER -- you pay for the ferry.]',
  notBuilt:      'Not built yet -- pick something else for now.',
  arrive:        'Battery Park.', // trail event once you come ashore; '' to skip
};

class LibertyScene {
  // opts: { wipedOut, charge(amount) }
  constructor(gameState, opts, onDone) {
    this.gameState = gameState;
    this.opts = opts || {};
    this.onDone = onDone;
    this.t = 0;
    this.look = null; // which prop her eyes are on (follows the hovered choice)
    this._af = null;
  }

  init() {
    this.canvas = document.getElementById('liberty-canvas');
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

    this.textEl = document.getElementById('liberty-text');
    this.choicesEl = document.getElementById('liberty-choices');
    this._talk();

    let last = performance.now();
    const frame = (now) => {
      this.t += Math.min(0.1, (now - last) / 1000);
      last = now;
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
  }

  // ------------------------------------------------------------------
  // DIALOGUE
  // ------------------------------------------------------------------

  _say(text, buttons) {
    this.textEl.textContent = text;
    this.choicesEl.innerHTML = '';
    buttons.forEach((b, i) => {
      const btn = document.createElement('button');
      btn.className = 'menu-option';
      btn.textContent = buttons.length > 1 ? `${i + 1}. ${b.label}` : b.label;
      btn.onclick = b.onClick;
      if (b.look) {
        btn.addEventListener('pointerenter', () => { this.look = b.look; });
        btn.addEventListener('pointerleave', () => { this.look = null; });
        btn.addEventListener('focus', () => { this.look = b.look; });
      }
      this.choicesEl.appendChild(btn);
    });
  }

  _talk() {
    this._say(this.opts.wipedOut ? LIBERTY_LINES.introWipedOut : LIBERTY_LINES.intro, [
      { label: 'Continue', onClick: () => this._choose() },
    ]);
  }

  _choose() {
    this.look = null;
    this._say(LIBERTY_LINES.choose, [
      { label: `Pay for the ferry ($${LIBERTY_FERRY_COST})`, look: 'ferry', onClick: () => this._ferry() },
      { label: 'Steal a jet ski', look: 'jetski', onClick: () => this._finish('jetski') },
      { label: 'Steal a helicopter', look: 'heli', onClick: () => this._notBuilt() },
    ]);
  }

  _ferry() {
    this.look = 'ferry';
    if (this.opts.charge) this.opts.charge(LIBERTY_FERRY_COST);
    this.ferryLeaving = this.t;
    this._say(`${LIBERTY_LINES.ferry}\n\n-$${LIBERTY_FERRY_COST}`, [
      { label: 'Continue', onClick: () => this._finish('ferry') },
    ]);
  }

  _notBuilt() {
    this._say(LIBERTY_LINES.notBuilt, [
      { label: 'Back', onClick: () => this._choose() },
    ]);
  }

  _finish(via) {
    this.destroy();
    this.onDone({ via });
  }

  // ------------------------------------------------------------------
  // RENDER -- harbor at dusk; the three ways off the island sit where
  // you can see them: the ferry at the dock (left), a jet ski bobbing
  // off the shore (right), a helicopter on a pad behind her.
  // ------------------------------------------------------------------

  render() {
    const ctx = this.ctx, W = this.W, H = this.H, t = this.t;
    if (!ctx || !W) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const panelTop = H * 0.62;
    const gy = Math.round(H * 0.56);                    // island surface
    const s = Math.min((gy - 24) / 540, W / 520);       // statue fills the sky
    const sx = W * 0.55;

    // sky
    const g = ctx.createLinearGradient(0, 0, 0, gy);
    g.addColorStop(0, '#1d1640'); g.addColorStop(0.55, '#7a3a6a'); g.addColorStop(1, '#f08a5d');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // Manhattan across the water
    for (let i = 0; i < 26; i++) {
      const bw = W / 22, bh = (20 + rushHash(i + 900) * 90) * s * 1.4;
      ctx.fillStyle = '#3b2550';
      ctx.fillRect(i * bw - 6, gy - 30 * s - bh, bw - 2, bh + 30 * s);
      ctx.fillStyle = 'rgba(255,214,120,0.55)';
      for (let r = 0; r < 4; r++) if (rushHash(i * 13 + r) > 0.6) ctx.fillRect(i * bw + 2, gy - 30 * s - bh + 6 + r * 9, 3, 4);
    }
    // water
    ctx.fillStyle = '#23305e'; ctx.fillRect(0, gy - 14 * s, W, H);
    ctx.fillStyle = 'rgba(255,170,110,0.35)';
    for (let i = 0; i < 30; i++) {
      const wx = (rushHash(i) * W * 1.2 + t * 14 * (i % 3 + 1)) % (W + 40) - 20;
      ctx.fillRect(wx, gy + (rushHash(i + 40) * (H - gy)), 22, 2);
    }
    // island
    const ix0 = W * 0.2, ix1 = W * 0.86;
    ctx.fillStyle = '#5b6b3a'; ctx.fillRect(ix0, gy, ix1 - ix0, 10 * s + 6);
    ctx.fillStyle = '#7f7a6a'; ctx.fillRect(ix0, gy + 10 * s + 6, ix1 - ix0, 26 * s);

    // helicopter on a pad, behind her
    const hx = W * 0.77, hy = gy;
    ctx.fillStyle = '#d9d3c4'; ctx.fillRect(hx - 44 * s, hy - 4 * s, 88 * s, 4 * s);
    this._heli(hx, hy - 4 * s, s * 1.7, this.look === 'heli');

    // the statue
    const look = this._lookPoint(W, gy, s);
    rushDrawStatue(ctx, sx, gy, s, t, look.x, look.y);

    // you, small, at her feet
    this._player(W * 0.3, gy, s * 1.5);

    // ferry at the dock (left) -- pulls away once you've paid
    const fx = W * 0.02 - (this.ferryLeaving ? (t - this.ferryLeaving) * 40 : 0);
    this._ferry(fx, gy + 8 * s, s * 1.6, this.look === 'ferry');
    // jet ski bobbing off the right shore
    this._jetski(W * 0.93, gy + 14 * s + Math.sin(t * 2.4) * 3, s * 1.8, this.look === 'jetski');

    // fade the bottom into the dialogue panel
    const fade = ctx.createLinearGradient(0, panelTop - 40, 0, panelTop + 10);
    fade.addColorStop(0, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(0,0,0,0.85)');
    ctx.fillStyle = fade; ctx.fillRect(0, panelTop - 40, W, H - panelTop + 40);
  }

  _lookPoint(W, gy, s) {
    if (this.look === 'ferry') return { x: W * 0.1, y: gy };
    if (this.look === 'jetski') return { x: W * 0.93, y: gy + 14 * s };
    if (this.look === 'heli') return { x: W * 0.77, y: gy - 30 * s };
    // otherwise, you -- with a slow lazy drift so she reads as alive
    return { x: W * 0.3 + Math.sin(this.t * 0.7) * 30, y: gy - 40 * s };
  }

  _glow(x, y, r, on) {
    if (!on) return;
    const ctx = this.ctx;
    ctx.fillStyle = `rgba(255,228,107,${0.25 + 0.15 * Math.sin(this.t * 8)})`;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }

  _player(x, gy, s) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, gy);
    ctx.strokeStyle = '#2b2b3a'; ctx.lineWidth = 6 * s; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-3 * s, -16 * s); ctx.lineTo(-5 * s, 0); ctx.moveTo(3 * s, -16 * s); ctx.lineTo(6 * s, 0); ctx.stroke();
    ctx.fillStyle = '#27b7c9'; ctx.fillRect(-8 * s, -32 * s, 16 * s, 18 * s);
    ctx.fillStyle = '#f0c8a0'; ctx.beginPath(); ctx.arc(2 * s, -39 * s, 7.5 * s, 0, 6.3); ctx.fill();
    ctx.fillStyle = '#3a2a1e'; ctx.beginPath(); ctx.arc(1 * s, -41 * s, 7.5 * s, Math.PI * 0.9, Math.PI * 1.95); ctx.fill();
    // a little sway -- still feeling it
    ctx.restore();
    ctx.lineCap = 'butt';
  }

  _ferry(x, y, s, on) {
    const ctx = this.ctx;
    this._glow(x + 40 * s, y - 10 * s, 70 * s, on);
    ctx.fillStyle = '#f2f2ee'; ctx.fillRect(x, y - 18 * s, 90 * s, 18 * s);
    ctx.fillStyle = '#1f4f8a'; ctx.fillRect(x - 4 * s, y - 4 * s, 98 * s, 8 * s);
    ctx.fillStyle = '#e8e4d8'; ctx.fillRect(x + 12 * s, y - 32 * s, 60 * s, 14 * s);
    ctx.fillStyle = '#7fb7e6';
    for (let k = 0; k < 5; k++) ctx.fillRect(x + 16 * s + k * 11 * s, y - 29 * s, 7 * s, 6 * s);
    ctx.fillStyle = '#c8402c'; ctx.fillRect(x + 66 * s, y - 42 * s, 6 * s, 10 * s);
  }

  _jetski(x, y, s, on) {
    const ctx = this.ctx;
    this._glow(x, y - 6 * s, 36 * s, on);
    ctx.fillStyle = '#e8402c';
    ctx.beginPath(); ctx.moveTo(x - 22 * s, y); ctx.lineTo(x + 24 * s, y); ctx.lineTo(x + 16 * s, y - 9 * s); ctx.lineTo(x - 18 * s, y - 9 * s); ctx.fill();
    ctx.fillStyle = '#f4f4f4'; ctx.fillRect(x - 6 * s, y - 14 * s, 12 * s, 5 * s);
    ctx.strokeStyle = '#222'; ctx.lineWidth = 2 * s;
    ctx.beginPath(); ctx.moveTo(x + 8 * s, y - 9 * s); ctx.lineTo(x + 12 * s, y - 18 * s); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(x - 26 * s, y + 1, 54 * s, 2);
  }

  _heli(x, y, s, on) {
    const ctx = this.ctx;
    this._glow(x, y - 14 * s, 44 * s, on);
    ctx.fillStyle = '#2d3a4a';
    ctx.beginPath(); ctx.ellipse(x, y - 14 * s, 18 * s, 11 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(x + 10 * s, y - 17 * s, 30 * s, 5 * s);
    ctx.fillRect(x + 36 * s, y - 24 * s, 4 * s, 12 * s);
    ctx.fillStyle = '#9fd3ff'; ctx.beginPath(); ctx.ellipse(x - 7 * s, y - 16 * s, 8 * s, 6 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#2d3a4a'; ctx.lineWidth = 2 * s;
    ctx.beginPath(); ctx.moveTo(x - 14 * s, y); ctx.lineTo(x + 14 * s, y); ctx.moveTo(x, y - 25 * s); ctx.lineTo(x, y - 29 * s); ctx.stroke();
    const blade = Math.sin(this.t * (on ? 30 : 1.5)) * 34 * s;
    ctx.beginPath(); ctx.moveTo(x - blade, y - 29 * s); ctx.lineTo(x + blade, y - 29 * s); ctx.stroke();
  }
}

let libertyScene = null;
