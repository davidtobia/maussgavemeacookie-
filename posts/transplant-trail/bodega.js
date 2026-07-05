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
    this.showPhase('intro');
    document.getElementById('bodega-intro-text').textContent =
      `Before you move in, you need the essentials. Catch the chopped cheese, the tamagotchi vape, and some vegetables. Do NOT bring home a bodega cat, poop, or mouthwash.`;
    document.getElementById('bodega-start-btn').textContent = `Let's go.`;
    document.getElementById('bodega-start-btn').onclick = () => this.startCatching();
  }

  showPhase(phase) {
    ['intro', 'catching', 'gamble'].forEach(p => {
      const el = document.getElementById(`bodega-${p}`);
      el.classList.toggle('hidden', p !== phase);
    });
  }

  // ============================================
  // CATCHING PHASE
  // ============================================

  startCatching() {
    this.showPhase('catching');
    this.canvas = document.getElementById('bodega-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.canvas.width = this.canvas.offsetWidth;
    this.canvas.height = this.canvas.offsetHeight;
    this.basketX = this.canvas.width / 2;
    this.setupControls();
    this.running = true;
    this.timerInterval = setInterval(() => this.tickTimer(), 1000);
    this.gameLoop();
  }

  setupControls() {
    // Touch: basket follows finger
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

    // Mouse: basket follows cursor
    this.canvas.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      this.basketX = e.clientX - rect.left;
    });

    // Keyboard: arrow keys
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
    if (this.timeLeft > 30) return 90;  // slow
    if (this.timeLeft > 15) return 60;  // medium
    return 38;                           // fast
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
      y: -45,
      w,
      h: 38,
      speed: this.getFallSpeed() + Math.random() * 0.6
    });
  }

  gameLoop() {
    if (!this.running) return;
    this.frameCounter++;

    if (this.frameCounter % this.getSpawnRate() === 0) {
      this.spawnItem();
    }

    // Move items
    this.items.forEach(item => { item.y += item.speed; });

    // Collision detection
    const basketY  = this.canvas.height - 85;
    const halfW    = 68;

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

  render() {
    const { width, height } = this.canvas;
    const ctx = this.ctx;

    // Bodega background
    ctx.fillStyle = '#060606';
    ctx.fillRect(0, 0, width, height);

    // Back wall (lighter)
    ctx.fillStyle = '#0e0e0e';
    ctx.fillRect(0, 0, width, height * 0.78);

    // Shelves
    ctx.fillStyle = '#2a1f0e';
    for (let i = 0; i < 3; i++) {
      ctx.fillRect(0, height * (0.18 + i * 0.2), width, 5);
    }

    // Falling items
    this.items.forEach(item => {
      const x = item.x - item.w / 2;

      // Drop shadow
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(x + 3, item.y + 3, item.w, item.h);

      // Item background
      ctx.fillStyle = item.color;
      ctx.fillRect(x, item.y, item.w, item.h);

      // Gold border on good items
      if (item.good) {
        ctx.strokeStyle = '#d4a574';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x, item.y, item.w, item.h);
      }

      // Label (split long names across two lines)
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      const words = item.label.split(' ');
      if (words.length === 1) {
        ctx.font = '15px VT323';
        ctx.fillText(item.label, item.x, item.y + 25);
      } else {
        ctx.font = '13px VT323';
        ctx.fillText(words[0], item.x, item.y + 15);
        ctx.fillText(words.slice(1).join(' '), item.x, item.y + 28);
      }
    });

    // Basket / arms
    const basketY = height - 85;
    const armW = 16;

    ctx.fillStyle = '#d4a574';
    ctx.fillRect(this.basketX - 70, basketY,      armW, 58); // left arm
    ctx.fillRect(this.basketX + 54, basketY,      armW, 58); // right arm
    ctx.fillRect(this.basketX - 70, basketY + 52, 140,  10); // floor

    // Slightly darker hands at top of arms
    ctx.fillStyle = '#b8935a';
    ctx.fillRect(this.basketX - 70, basketY,      armW, 10);
    ctx.fillRect(this.basketX + 54, basketY,      armW, 10);
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
    this.onComplete(finalScore);
  }
}

let bodegaGame = null;
