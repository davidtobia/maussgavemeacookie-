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
    this.bgImage.src = 'images/bodega-bg.png';

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
    this.setupControls();
    this.running = true;
    this.timerInterval = setInterval(() => this.tickTimer(), 1000);
    this.gameLoop();
  }

  setupControls() {
    this.canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const rect = this.canvas.getBoundingClientRect();
      this.basketX = e.touches[0].clientX - rect.left;
    }, { passive: false });

    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const rect = this.canvas.getBoundingClientRect();
      this.basketX = e.touches[0].clientX - rect.left;
    }, { passive: false });

    this.canvas.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      this.basketX = e.clientX - rect.left;
    });

    this._keyHandler = (e) => {
      if (!this.running) return;
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
        return false;
      }
      return item.y < this.canvas.height + 60;
    });

    this.render();
    this.animFrame = requestAnimationFrame(() => this.gameLoop());
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

    // Basket / arms
    const basketY = height - 85;
    ctx.fillStyle = '#d4a574';
    ctx.fillRect(this.basketX - 70, basketY,      16, 58);
    ctx.fillRect(this.basketX + 54, basketY,      16, 58);
    ctx.fillRect(this.basketX - 70, basketY + 52, 140, 10);
    ctx.fillStyle = '#b8935a';
    ctx.fillRect(this.basketX - 70, basketY,      16, 10);
    ctx.fillRect(this.basketX + 54, basketY,      16, 10);
  }

  endCatching() {
    this.running = false;
    clearInterval(this.timerInterval);
    if (this.animFrame)   cancelAnimationFrame(this.animFrame);
    if (this._keyHandler) document.removeEventListener('keydown', this._keyHandler);
    this.showGamble();
  }

  // ============================================
  // GAMBLE PHASE
  // ============================================

  showGamble() {
    this.showPhase('gamble');
    document.getElementById('bodega-gamble-text').textContent =
      `You got the goods. Score: ${this.score}. Now — what do you say to the bodega guy on the way out?`;

    const choices = document.getElementById('bodega-gamble-choices');
    choices.innerHTML = '';

    const options = [
      { label: '1. "Thank you"',       multiplier: 1 },
      { label: '2. "Thank you boss"',   multiplier: 2 },
      { label: '3. "Habibi, shukran"', multiplier: 3 },
    ];

    options.forEach(opt => {
      const btn = document.createElement('button');
      btn.className = 'menu-option';
      btn.textContent = opt.label;
      btn.onclick = () => this.applyGamble(opt.multiplier);
      choices.appendChild(btn);
    });
  }

  applyGamble(multiplier) {
    const finalScore = this.score * multiplier;
    this.gameState.bodegaScore = (this.gameState.bodegaScore || 0) + finalScore;

    const choices = document.getElementById('bodega-gamble-choices');
    choices.innerHTML = '';

    const result = document.createElement('p');
    result.className = 'bodega-splash-text';
    result.style.marginTop = '20px';
    result.textContent = `Good choice. You get ${finalScore} points.`;
    choices.appendChild(result);

    const btn = document.createElement('button');
    btn.className = 'menu-option';
    btn.style.marginTop = '20px';
    btn.textContent = 'Continue';
    btn.onclick = () => this.onComplete(finalScore);
    choices.appendChild(btn);
  }
}

let bodegaGame = null;
