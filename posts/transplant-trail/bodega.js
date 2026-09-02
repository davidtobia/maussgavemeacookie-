/**
 * THE TRANSPLANT TRAIL - BODEGA MINI-GAME
 * Falling items catcher. Triggered after signing apartment lease.
 */

const BODEGA_ITEMS = [
  { label: 'Chopped Cheese', good: true,  color: '#c8860a', points: 10 },
  { label: 'Tamagotchi Vape', good: true,  color: '#8e44ad', points: 10 },
  { label: 'Broccoli',        good: true,  color: '#27ae60', points: 10 },
  { label: 'Bodega Cat',      good: false, color: '#e67e22', points: -5 },
  { label: 'Poop',            good: false, color: '#6d4c41', points: -5 },
  { label: 'Mouthwash',       good: false, color: '#2980b9', points: -5 },
];

class BodegaGame {
  constructor(gameState, onComplete) {
    this.gameState = gameState;
    this.onComplete = onComplete;
    this.canvas = null;
    this.ctx = null;
    this.score = 0;
    this.timeLeft = 45;
    this.items = [];
    this.basketX = 200;
    // Catch feedback: a catch used to just tick the DOM score text with
    // nothing happening on the canvas itself -- same "the number changed
    // somewhere off to the side" gap as everywhere else in this pass.
    // particles: a burst of sparkles (good) or scattering crumbs (bad) at
    // the catch point. popups: the +10/-5 itself, floating up and fading,
    // so the point value is a thing that happens AT the bag, not just a
    // running total. bagPunch/bagShake: a quick scale-pop or side-jitter
    // on the bag graphic itself, decaying every frame.
    this.particles = [];
    this.popups = [];
    this.bagPunch = 0;
    this.bagShake = 0;
    // Chaos catches: catching the cat or the poop used to cost -5 points
    // and nothing else, same as mouthwash -- no different from any other
    // miss. Direct request: make the bad ones actually hurt in a way
    // that's fun, not just a worse number. Cat: a giant version jumps in
    // and takes the basket out of your control for ~2s (it visibly
    // topples over -- input is ignored while catInvasion is active,
    // not just visually disabled). Poop: a splatter blooms over the
    // screen and blocks your view of falling items, then fades.
    this.catInvasion = null; // { timer, maxTimer, x }
    this.poopSplat = null;   // { timer, maxTimer, blobs }
    this.basketLocked = false;
    this.basketTilt = 0;
    this.frameCounter = 0;
    this.animFrame = null;
    this.running = false;
    this.timerInterval = null;
    this._keyHandler = null;
  }

  init() {
    this.canvas = document.getElementById('bodega-canvas');
    this.ctx = this.canvas.getContext('2d');

    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width  = rect.width  || window.innerWidth;
    this.canvas.height = rect.height || (window.innerHeight - 80);
    this.basketX = this.canvas.width / 2;

    // Preload background image; render once ready
    this.bgImage = new Image();
    this.bgImage.onload = () => this.renderBackground();
    // Was a 2.3MB PNG at the same pixel dimensions -- on mobile it very
    // plausibly never finished downloading inside a 45-second play
    // session, so the black fallback fill in renderBackground() was all
    // that ever showed. Recompressed to a ~410KB JPEG (no transparency
    // needed for a background photo) at the same resolution.
    this.bgImage.src = 'images/bodega-bg.jpg';

    this.showPhase('intro');
    document.getElementById('bodega-intro-text').textContent =
      `Before you move in, you need the essentials. Catch the chopped cheese, the tamagotchi vape, and some vegetables. Do NOT bring home a bodega cat, poop, or mouthwash.`;
    document.getElementById('bodega-start-btn').textContent = `Let's go.`;
    document.getElementById('bodega-start-btn').onclick = () => this.startCatching();
  }

  showPhase(phase) {
    // Overlays sit on top of the always-visible canvas
    document.getElementById('bodega-intro').classList.toggle('hidden', phase !== 'intro');
    document.getElementById('bodega-gamble').classList.toggle('hidden', phase !== 'gamble');
    // HUD + legend only show during catching
    document.getElementById('bodega-hud').classList.toggle('hidden', phase !== 'catching');
    document.getElementById('bodega-legend').classList.toggle('hidden', phase !== 'catching');
  }

  // ============================================
  // CATCHING PHASE
  // ============================================

  startCatching() {
    this.showPhase('catching');
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width  = rect.width;
    this.canvas.height = rect.height;
    this.basketX = this.canvas.width / 2;
    this.particles = [];
    this.popups = [];
    this.setupControls();
    // Every other mini-game in this app re-syncs its canvas size on
    // resize (heist.js/cannon.js both do); bodega never did. The canvas
    // dimensions were only ever set once here, but mobile browsers
    // routinely resize the viewport shortly after load as the address
    // bar auto-collapses -- when that happens, the canvas's actual
    // CSS-rendered box changes (100dvh reacts to it) but the drawing
    // buffer (canvas.width/height, and everything computed off it, like
    // the basket's y-position near the bottom) stays pinned to whatever
    // it was at this exact moment. Direct feedback: "bodega game is cut
    // off. can't see the basket on mobile."
    this._resizeHandler = () => {
      const r = this.canvas.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const prevW = this.canvas.width || r.width;
      this.canvas.width  = r.width;
      this.canvas.height = r.height;
      // Keep the basket's relative position instead of snapping to
      // center on every resize, which would be jarring mid-catch.
      this.basketX = this.basketX * (r.width / prevW);
    };
    window.addEventListener('resize', this._resizeHandler);
    this.running = true;
    this.timerInterval = setInterval(() => this.tickTimer(), 1000);
    this.gameLoop();
  }

  setupControls() {
    // basketLocked (set during a cat invasion) ignores all movement
    // input, not just visually disables it -- the whole point of the
    // penalty is a real few seconds of lost control, not a cosmetic
    // wobble.
    this.canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (this.basketLocked) return;
      const rect = this.canvas.getBoundingClientRect();
      this.basketX = e.touches[0].clientX - rect.left;
    }, { passive: false });

    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (this.basketLocked) return;
      const rect = this.canvas.getBoundingClientRect();
      this.basketX = e.touches[0].clientX - rect.left;
    }, { passive: false });

    this.canvas.addEventListener('mousemove', (e) => {
      if (this.basketLocked) return;
      const rect = this.canvas.getBoundingClientRect();
      this.basketX = e.clientX - rect.left;
    });

    this._keyHandler = (e) => {
      if (!this.running || this.basketLocked) return;
      const step = 30;
      if (e.key === 'ArrowLeft')  this.basketX = Math.max(70, this.basketX - step);
      if (e.key === 'ArrowRight') this.basketX = Math.min(this.canvas.width - 70, this.basketX + step);
    };
    document.addEventListener('keydown', this._keyHandler);
  }

  tickTimer() {
    if (!this.running) return;
    this.timeLeft--;
    const s = this.timeLeft.toString().padStart(2, '0');
    document.getElementById('bodega-timer').textContent = `0:${s}`;
    if (this.timeLeft <= 0) this.endCatching();
  }

  getSpawnRate() {
    if (this.timeLeft > 30) return 90;
    if (this.timeLeft > 15) return 60;
    return 38;
  }

  getFallSpeed() {
    if (this.timeLeft > 30) return 2.5;
    if (this.timeLeft > 15) return 4.0;
    return 6.0;
  }

  spawnItem() {
    const item = BODEGA_ITEMS[Math.floor(Math.random() * BODEGA_ITEMS.length)];
    const w = 80;
    const margin = w / 2 + 5;
    this.items.push({
      ...item,
      x: margin + Math.random() * (this.canvas.width - margin * 2),
      y: -54,
      w,
      h: 42,
      speed: this.getFallSpeed() + Math.random() * 0.6
    });
  }

  gameLoop() {
    if (!this.running) return;
    this.frameCounter++;

    if (this.frameCounter % this.getSpawnRate() === 0) {
      this.spawnItem();
    }

    this.items.forEach(item => { item.y += item.speed; });

    const basketY = this.canvas.height - 85;
    const halfW   = 68;

    this.items = this.items.filter(item => {
      const caught =
        item.y + item.h >= basketY &&
        item.y          <= basketY + 30 &&
        item.x          >  this.basketX - halfW &&
        item.x          <  this.basketX + halfW;

      if (caught) {
        this.score = Math.max(0, this.score + item.points);
        document.getElementById('bodega-score').textContent = `Score: ${this.score}`;
        this.spawnCatchFx(item);
        return false;
      }
      return item.y < this.canvas.height + 60;
    });

    this.updateFx();
    this.render();
    this.animFrame = requestAnimationFrame(() => this.gameLoop());
  }

  // A good catch pops the bag and throws a gold sparkle burst; a bad one
  // jolts the bag sideways and scatters a few dark crumbs -- same catch,
  // opposite feeling, purely so the moment itself carries some weight
  // instead of only the running total changing.
  spawnCatchFx(item) {
    const x = this.basketX, y = this.canvas.height - 85;
    const n = 10;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = 1.2 + Math.random() * 3;
      this.particles.push({
        x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed - 1.5,
        life: 20 + Math.floor(Math.random() * 14),
        maxLife: 34,
        color: item.good ? (Math.random() < 0.5 ? '#f1c40f' : item.color) : (Math.random() < 0.5 ? '#5d4037' : '#8a8a8a'),
      });
    }
    this.popups.push({
      x, y: y - 20, text: (item.points > 0 ? '+' : '') + item.points,
      life: 46, maxLife: 46, good: item.good,
    });
    if (item.good) this.bagPunch = 1;
    else this.bagShake = 1;

    if (item.label === 'Bodega Cat') this.triggerCatInvasion();
    if (item.label === 'Poop') this.triggerPoopSplat();
  }

  // ~130 frames at 60fps is "two seconds" as asked for. Locks basket
  // input for the whole thing, not just while the cat is at full size --
  // losing control during the leap-in/leap-out feels like part of the
  // same chaos instead of a separate mechanic.
  triggerCatInvasion() {
    this.catInvasion = { timer: 130, maxTimer: 130, x: this.basketX };
    this.basketLocked = true;
  }

  // A handful of overlapping blob shapes at random spots -- placed once
  // here, not regenerated every frame, so the splatter reads as a single
  // "hit" rather than noise.
  triggerPoopSplat() {
    const w = this.canvas.width, h = this.canvas.height;
    const blobs = [];
    const n = 6 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      blobs.push({
        x: Math.random() * w,
        y: h * 0.08 + Math.random() * h * 0.6,
        r: 36 + Math.random() * 60,
        rot: Math.random() * Math.PI * 2,
      });
    }
    this.poopSplat = { timer: 100, maxTimer: 100, blobs };
  }

  updateFx() {
    this.particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += 0.2; p.life--; });
    this.particles = this.particles.filter(p => p.life > 0);
    this.popups.forEach(p => { p.y -= 0.7; p.life--; });
    this.popups = this.popups.filter(p => p.life > 0);
    this.bagPunch *= 0.82;
    this.bagShake *= 0.78;

    if (this.catInvasion) {
      this.catInvasion.timer--;
      if (this.catInvasion.timer <= 0) { this.catInvasion = null; this.basketLocked = false; }
    }
    if (this.poopSplat) {
      this.poopSplat.timer--;
      if (this.poopSplat.timer <= 0) this.poopSplat = null;
    }
    // Basket topples toward a fixed lean while locked, rights itself
    // when control comes back -- same easing pattern as bagPunch/
    // bagShake above.
    const targetTilt = this.basketLocked ? 0.5 : 0;
    this.basketTilt += (targetTilt - this.basketTilt) * 0.15;
  }

  // ============================================
  // RENDERING
  // ============================================

  renderBackground() {
    const { width, height } = this.canvas;
    const ctx = this.ctx;

    if (this.bgImage && this.bgImage.complete && this.bgImage.naturalWidth > 0) {
      // Scale image to cover canvas (center-crop)
      const imgAR = this.bgImage.naturalWidth / this.bgImage.naturalHeight;
      const canAR = width / height;
      let sx, sy, sw, sh;
      if (imgAR > canAR) {
        sh = this.bgImage.naturalHeight;
        sw = sh * canAR;
        sx = (this.bgImage.naturalWidth - sw) / 2;
        sy = 0;
      } else {
        sw = this.bgImage.naturalWidth;
        sh = sw / canAR;
        sx = 0;
        sy = (this.bgImage.naturalHeight - sh) / 2;
      }
      ctx.drawImage(this.bgImage, sx, sy, sw, sh, 0, 0, width, height);

      // Slight darkening so items pop against the detailed background
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.fillRect(0, 0, width, height);
    } else {
      // Fallback if image hasn't loaded yet
      ctx.fillStyle = '#060606';
      ctx.fillRect(0, 0, width, height);
    }
  }

  drawItemShape(ctx, item) {
    const x  = item.x - item.w / 2;
    const y  = item.y;
    const w  = item.w;
    const h  = item.h;
    const cx = item.x;

    ctx.save();

    switch (item.label) {

      case 'Chopped Cheese': {
        // Top bread
        ctx.fillStyle = '#c4975a';
        ctx.fillRect(x + 4, y, w - 8, 11);
        // Sesame seeds
        ctx.fillStyle = '#f0dab0';
        for (let s = 0; s < 5; s++) ctx.fillRect(x + 9 + s * 11, y + 3, 4, 2);
        // Meat
        ctx.fillStyle = '#b5451b';
        ctx.fillRect(x + 4, y + 11, w - 8, 6);
        // Cheese
        ctx.fillStyle = '#f5c242';
        ctx.fillRect(x + 4, y + 17, w - 8, 6);
        // Filling extras
        ctx.fillStyle = '#c8860a';
        ctx.fillRect(x + 4, y + 23, w - 8, h - 34);
        // Bottom bread
        ctx.fillStyle = '#c4975a';
        ctx.fillRect(x + 4, y + h - 11, w - 8, 11);
        break;
      }

      case 'Tamagotchi Vape': {
        ctx.fillStyle = '#8e44ad';
        ctx.fillRect(x + 22, y + 2, w - 44, h - 4);
        // Rounded feel via extra rects
        ctx.fillRect(x + 18, y + 6,  w - 36, h - 12);
        // Screen
        ctx.fillStyle = '#c39bd3';
        ctx.fillRect(x + 24, y + 5, w - 48, 18);
        ctx.fillStyle = '#f0e6f6';
        ctx.fillRect(x + 26, y + 7, 8, 5);
        ctx.fillStyle = '#7d3c98';
        ctx.fillRect(x + 36, y + 9, 4, 4);
        // Buttons
        ctx.fillStyle = '#6c3483';
        ctx.beginPath(); ctx.arc(cx - 6, y + h - 9, 3, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx,     y + h - 9, 3, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx + 6, y + h - 9, 3, 0, Math.PI * 2); ctx.fill();
        // Mouthpiece tip
        ctx.fillStyle = '#5b2c6f';
        ctx.fillRect(x + w - 22, y + h / 2 - 3, 6, 6);
        break;
      }

      case 'Broccoli': {
        // Stem
        ctx.fillStyle = '#1e8449';
        ctx.fillRect(cx - 5, y + 22, 10, h - 22);
        // Florets
        ctx.fillStyle = '#27ae60';
        ctx.beginPath(); ctx.arc(cx,      y + 14, 13, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#2ecc71';
        ctx.beginPath(); ctx.arc(cx - 10, y + 18, 9,  0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx + 10, y + 18, 9,  0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#82e0aa';
        ctx.beginPath(); ctx.arc(cx - 3,  y + 7,  5,  0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx + 5,  y + 9,  4,  0, Math.PI * 2); ctx.fill();
        break;
      }

      case 'Bodega Cat': {
        this.drawCatShape(ctx, cx, y, h);
        break;
      }

      case 'Poop': {
        ctx.fillStyle = '#5d4037';
        ctx.beginPath(); ctx.ellipse(cx, y + h - 5,  20, 7,  0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#6d4c41';
        ctx.beginPath(); ctx.ellipse(cx, y + h - 17, 15, 10, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#795548';
        ctx.beginPath(); ctx.ellipse(cx, y + h - 28, 11, 9,  0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#8d6e63';
        ctx.beginPath(); ctx.arc(cx, y + h - 36, 7, Math.PI, 0, false); ctx.fill();
        ctx.beginPath(); ctx.arc(cx + 2, y + h - 37, 5, Math.PI, 0, false); ctx.fill();
        // Shine
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.beginPath(); ctx.ellipse(cx - 5, y + h - 30, 3, 2, -0.5, 0, Math.PI * 2); ctx.fill();
        // Flies
        ctx.fillStyle = '#444';
        ctx.beginPath(); ctx.arc(cx - 17, y + 8,  2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx + 15, y + 6,  2, 0, Math.PI * 2); ctx.fill();
        break;
      }

      case 'Mouthwash': {
        // Body
        ctx.fillStyle = '#2980b9';
        ctx.fillRect(cx - 13, y + 5, 26, h - 7);
        // Shoulder
        ctx.fillRect(cx - 10, y + 2, 20, 5);
        // Cap
        ctx.fillStyle = '#1a5276';
        ctx.fillRect(cx - 8, y - 1, 16, 6);
        // Label
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(cx - 11, y + 13, 22, 16);
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillRect(cx - 8,  y + 16, 16, 2);
        ctx.fillRect(cx - 6,  y + 20, 12, 2);
        // Liquid fill
        ctx.fillStyle = 'rgba(93,188,210,0.5)';
        ctx.fillRect(cx - 12, y + 24, 24, h - 26);
        // Shine
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.fillRect(cx - 10, y + 6, 4, h - 14);
        break;
      }

      default:
        ctx.fillStyle = item.color;
        ctx.fillRect(x, y, w, h);
    }

    ctx.restore();
  }

  // Shared with the giant invasion cat (drawCatInvasion()) via a scale
  // transform on the caller's ctx -- same shape at any size instead of
  // two versions of the same drawing to keep in sync.
  drawCatShape(ctx, cx, y, h) {
    // Body
    ctx.fillStyle = '#e67e22';
    ctx.beginPath();
    ctx.ellipse(cx, y + h - 14, 24, 12, 0, 0, Math.PI * 2); ctx.fill();
    // Head
    ctx.beginPath(); ctx.arc(cx, y + 12, 12, 0, Math.PI * 2); ctx.fill();
    // Ears
    ctx.fillStyle = '#d35400';
    ctx.beginPath();
    ctx.moveTo(cx - 12, y + 6); ctx.lineTo(cx - 18, y - 5); ctx.lineTo(cx - 4, y + 3);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + 12, y + 6); ctx.lineTo(cx + 18, y - 5); ctx.lineTo(cx + 4, y + 3);
    ctx.closePath(); ctx.fill();
    // Inner ears
    ctx.fillStyle = '#f0a070';
    ctx.beginPath();
    ctx.moveTo(cx - 12, y + 4); ctx.lineTo(cx - 16, y - 2); ctx.lineTo(cx - 6, y + 2);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + 12, y + 4); ctx.lineTo(cx + 16, y - 2); ctx.lineTo(cx + 6, y + 2);
    ctx.closePath(); ctx.fill();
    // Eyes (yellow + slit pupil)
    ctx.fillStyle = '#f9ca24';
    ctx.beginPath(); ctx.ellipse(cx - 4, y + 12, 3, 3.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + 4, y + 12, 3, 3.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath(); ctx.ellipse(cx - 4, y + 12, 1.2, 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + 4, y + 12, 1.2, 3, 0, 0, Math.PI * 2); ctx.fill();
    // Nose
    ctx.fillStyle = '#e84393';
    ctx.beginPath(); ctx.arc(cx, y + 16, 1.5, 0, Math.PI * 2); ctx.fill();
    // Tabby stripes on body
    ctx.fillStyle = '#d35400';
    ctx.fillRect(cx - 22, y + h - 24, 3, 12);
    ctx.fillRect(cx + 19, y + h - 24, 3, 12);
  }

  // The cat leaps up from below, holds huge and dominant in view for the
  // middle stretch (with a claw-swipe accent near where it landed --
  // that's the "swipes at your basket" beat), then leaps back off.
  // basketLocked (set in triggerCatInvasion) is what actually removes
  // control; this is purely the visual.
  drawCatInvasion(ctx) {
    const inv = this.catInvasion;
    const { width, height } = this.canvas;
    const t = 1 - inv.timer / inv.maxTimer; // 0 -> 1 across the whole event
    const offY = height + 160;
    const midY = height * 0.4;
    let catY, scale;
    if (t < 0.18) {
      const p = t / 0.18;
      const ease = 1 - Math.pow(1 - p, 3);
      catY = offY + (midY - offY) * ease;
      scale = 0.7 + 2.6 * ease;
    } else if (t < 0.82) {
      catY = midY + Math.sin((t - 0.18) * 20) * 5;
      scale = 3.3;
    } else {
      const p = (t - 0.82) / 0.18;
      const ease = Math.pow(p, 3);
      catY = midY + (offY - midY) * ease;
      scale = 3.3 - 2.6 * ease;
    }
    const vigAlpha = t < 0.18 ? (t / 0.18) * 0.4 : t > 0.82 ? ((1 - t) / 0.18) * 0.4 : 0.4;
    const catX = Math.min(width - 50, Math.max(50, inv.x));

    ctx.save();
    ctx.fillStyle = `rgba(10,6,4,${vigAlpha})`;
    ctx.fillRect(0, 0, width, height);
    ctx.translate(catX, catY);
    ctx.scale(scale, scale);
    ctx.translate(-catX, -catY);
    this.drawCatShape(ctx, catX, catY - 20, 42);
    ctx.restore();

    // Claw-swipe accent, timed to roughly when the basket actually gets
    // knocked (right after landing).
    if (t > 0.16 && t < 0.34) {
      const swipeAlpha = 1 - Math.abs(t - 0.25) / 0.09;
      ctx.save();
      ctx.globalAlpha = Math.max(0, swipeAlpha) * 0.8;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(catX - 40 + i * 14, height - 130);
        ctx.lineTo(catX + 40 + i * 14, height - 70);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // Blooms in fast ("splat!"), holds, dissipates -- one set of blob
  // positions generated once in triggerPoopSplat() so it reads as a
  // single impact rather than randomized noise every frame.
  drawPoopSplat(ctx) {
    const s = this.poopSplat;
    const p = 1 - s.timer / s.maxTimer;
    let alpha;
    if (p < 0.08) alpha = p / 0.08;
    else if (p < 0.55) alpha = 1;
    else alpha = Math.max(0, 1 - (p - 0.55) / 0.45);

    ctx.save();
    ctx.globalAlpha = alpha;
    s.blobs.forEach(b => {
      ctx.fillStyle = '#2f2019';
      for (let i = 0; i < 4; i++) {
        const a = b.rot + i * 1.6;
        const dx = Math.cos(a) * b.r * 1.15, dy = Math.sin(a) * b.r * 0.85;
        ctx.beginPath(); ctx.arc(b.x + dx, b.y + dy, 6 + (i % 2) * 6, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = '#4a3327';
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rot);
      ctx.beginPath(); ctx.ellipse(0, 0, b.r, b.r * 0.72, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    });
    ctx.restore();
  }

  render() {
    const { width, height } = this.canvas;
    const ctx = this.ctx;

    this.renderBackground();

    // Falling items
    this.items.forEach(item => {
      // Drop shadow
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(item.x - item.w / 2 + 4, item.y + 4, item.w, item.h);

      this.drawItemShape(ctx, item);

      // Colored border: gold for good, red for bad
      if (item.good) {
        ctx.strokeStyle = 'rgba(212,165,116,0.85)';
        ctx.lineWidth = 2;
      } else {
        ctx.strokeStyle = 'rgba(231,76,60,0.7)';
        ctx.lineWidth = 1.5;
      }
      ctx.strokeRect(item.x - item.w / 2, item.y, item.w, item.h);

      // Small label below item
      ctx.textAlign = 'center';
      ctx.font = '14px VT323';
      ctx.fillStyle = item.good ? '#d4a574' : '#e74c3c';
      ctx.fillText(item.label, item.x, item.y + item.h + 14);
    });

    // Shopping bag -- was two goalpost bars with a rail between them,
    // which read as nothing in particular. basketY/the ~140px span stay
    // where they were (gameLoop()'s catch hit-test uses the same
    // basketY and a fixed halfW=68 independent of this draw call, so
    // catch range is unchanged -- only the visual is).
    const basketY = height - 85;
    const cx = this.basketX;
    const topW = 132, botW = 108, bagH = 66;

    // A good catch pops the whole bag up in scale for an instant; a bad one
    // jolts it sideways -- both purely visual, both decaying back to normal
    // over a few frames (see updateFx()). The catch hit-test above already
    // ran against the un-punched basketX/basketY, so this never touches
    // what actually counts as a catch.
    ctx.save();
    const shakeOffset = Math.sin(this.frameCounter * 1.4) * 9 * this.bagShake;
    const punchScale = 1 + 0.16 * this.bagPunch;
    ctx.translate(cx + shakeOffset, basketY);
    ctx.scale(punchScale, punchScale);
    // Topples over while the cat's got the basket -- basketTilt eases
    // toward its target in updateFx(), same pattern as bagShake/bagPunch.
    ctx.rotate(this.basketTilt);
    ctx.translate(-cx, -basketY);

    ctx.fillStyle = '#c8935a';
    ctx.beginPath();
    ctx.moveTo(cx - topW / 2, basketY);
    ctx.lineTo(cx + topW / 2, basketY);
    ctx.lineTo(cx + botW / 2, basketY + bagH);
    ctx.lineTo(cx - botW / 2, basketY + bagH);
    ctx.closePath();
    ctx.fill();

    // Folded side panel, like a paper bag's visible seam
    ctx.fillStyle = '#a97a44';
    ctx.beginPath();
    ctx.moveTo(cx - topW / 2, basketY);
    ctx.lineTo(cx - topW / 2 + 20, basketY);
    ctx.lineTo(cx - botW / 2 + 16, basketY + bagH);
    ctx.lineTo(cx - botW / 2, basketY + bagH);
    ctx.closePath();
    ctx.fill();

    // Crease near the top opening
    ctx.strokeStyle = '#8a6238';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - topW / 2 + 4, basketY + 11);
    ctx.lineTo(cx + topW / 2 - 4, basketY + 11);
    ctx.stroke();

    // Two handles
    ctx.strokeStyle = '#5a3f22';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(cx - topW / 4, basketY - 6, 11, 13, 0, Math.PI, 0, true);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(cx + topW / 4, basketY - 6, 11, 13, 0, Math.PI, 0, true);
    ctx.stroke();
    ctx.restore();

    // Catch particles -- sparkle burst for a good grab, scattered crumbs
    // for a bad one.
    this.particles.forEach(p => {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 2.5, p.y - 2.5, 5, 5);
    });
    ctx.globalAlpha = 1;

    // The point value itself, floating up off the bag and fading -- the
    // score changing is no longer something that only happens in the DOM
    // off to the side.
    this.popups.forEach(p => {
      ctx.globalAlpha = Math.min(1, p.life / (p.maxLife * 0.6));
      ctx.font = 'bold 20px VT323';
      ctx.textAlign = 'center';
      ctx.fillStyle = p.good ? '#7ec89a' : '#e74c3c';
      ctx.fillText(p.text, p.x, p.y);
      ctx.globalAlpha = 1;
    });

    // Both chaos overlays draw last, on top of everything -- the poop
    // splat is supposed to actually block your view of falling items,
    // and the cat is supposed to dominate the screen while it's here.
    if (this.poopSplat) this.drawPoopSplat(ctx);
    if (this.catInvasion) this.drawCatInvasion(ctx);
  }

  endCatching() {
    this.running = false;
    clearInterval(this.timerInterval);
    if (this.animFrame)   cancelAnimationFrame(this.animFrame);
    if (this._keyHandler) document.removeEventListener('keydown', this._keyHandler);
    if (this._resizeHandler) window.removeEventListener('resize', this._resizeHandler);
    this.showResults();
  }

  // ============================================
  // RESULTS
  // ============================================
  // Used to be a two-step "gamble": pick a dialogue line, then a second
  // popup to see what it "won" you. It wasn't actually a gamble --
  // there was no randomness, option 3 was always strictly the best
  // pick every single time, so it was just an extra required tap
  // standing between the player and a score they'd already earned.
  // Direct feedback: "the ones in the supermarket game... just got in
  // the way." Down to one result, one button.
  showResults() {
    this.showPhase('gamble');
    const earned = this.score;
    // Was crediting checkingAccount 1:1 same as the cannon game's
    // Borough Bucks -- between the two, minigame winnings alone could
    // keep a player's checking comfortably above the heist trigger
    // (checkingAccount <= 150) indefinitely. Running out of money is
    // supposed to be the inevitable path to the heist, not something
    // good minigame play can dodge. bodegaScore is a pure score now, not
    // spendable cash -- same reversal as cannon's boroughBucks.
    this.gameState.bodegaScore = (this.gameState.bodegaScore || 0) + earned;

    document.getElementById('bodega-gamble-text').textContent = earned > 0
      ? `Bag's packed. You made off with $${earned} worth of groceries.`
      : `Bag's packed, but you dropped more than you caught. Nothing extra this trip.`;

    // Checking can go negative for the first time right here (rent plus a
    // grocery run, this early), and nothing in the game had ever
    // reassured the player that's expected, not a mistake. Eric isn't
    // physically in this scene -- he sold the gear back at the very
    // start -- so this plays as him checking in from wherever he is,
    // same over-the-top voice as the opening shop.
    const ericLine = document.getElementById('bodega-gamble-eric');
    if (this.gameState.checkingAccount < 0) {
      ericLine.textContent = `Somewhere, Eric feels this. "You're fine," he says, to no one in particular. "That's what the card's for. Don't even think about it. I love you."`;
      ericLine.classList.remove('hidden');
    } else {
      ericLine.classList.add('hidden');
    }

    const choices = document.getElementById('bodega-gamble-choices');
    choices.innerHTML = '';
    const btn = document.createElement('button');
    btn.className = 'menu-option';
    btn.style.marginTop = '20px';
    btn.textContent = 'Continue';
    btn.onclick = () => this.onComplete(earned);
    choices.appendChild(btn);
  }
}

let bodegaGame = null;
