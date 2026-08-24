/**
 * THE TRANSPLANT TRAIL - WSP CANNON GAME v5
 * Vertical camera. Pendulum aim. Cooldown-based flaps. Rivers. Altitude zones.
 */

const CANNON_UPGRADES = {
  strength: [
    { id: 'standard',   label: 'Standard Cannon',  cost: 0,    velocity: 4,  desc: 'Gets you there... maybe' },
    { id: 'reinforced', label: 'Reinforced Cannon', cost: 350,  velocity: 6,  desc: 'More oomph' },
    { id: 'industrial', label: 'Industrial Cannon', cost: 900,  velocity: 8,  desc: 'Serious hardware' },
    { id: 'nuclear',    label: 'Nuclear Option',    cost: 2000, velocity: 10, desc: 'Unregulated' },
  ],
  accuracy: [
    { id: 'untrained', label: 'Wild Guess',    cost: 0,    swingSpeed: 0.60, desc: 'Needle goes brrr' },
    { id: 'practiced', label: 'Practiced Eye', cost: 250,  swingSpeed: 0.40, desc: 'Slightly less chaotic' },
    { id: 'precise',   label: 'Laser Focus',  cost: 650,  swingSpeed: 0.24, desc: 'You read Sun Tzu' },
    { id: 'surgical',  label: 'Surgical Aim', cost: 1400, swingSpeed: 0.13, desc: 'Touch grass later' },
  ],
  suit: [
    { id: 'naked',   label: 'Just Vibes',   cost: 0,    flapForce: 2.5, cooldownFrames: 62, drag: 0.24, desc: 'Barely works. One weak flap/sec. You will land.' },
    { id: 'pigeon',  label: 'Pigeon Wings', cost: 250,  flapForce: 4,   cooldownFrames: 40, drag: 0.14, desc: 'Real lift — stay up much longer.' },
    { id: 'eagle',   label: 'Eagle Suit',   cost: 600,  flapForce: 6,   cooldownFrames: 22, drag: 0.07, desc: 'Strong, sustained lift. Built for endurance flights.' },
    { id: 'jetpack', label: 'Jetpack',      cost: 1200, flapForce: 15,  cooldownFrames: 6,  drag: 0.03, desc: 'Near-infinite flight. Only damage stops you.' },
  ],
  rocket: [
    { id: 'none',  label: 'No Rocket',    cost: 0,   boost: 0  },
    { id: 'small', label: 'Small Rocket', cost: 350, boost: 10 },
    { id: 'big',   label: 'Big Rocket',   cost: 900, boost: 22 },
  ],
  bonus: [
    { id: 'none',        label: 'No Bonus',      cost: 0,    desc: 'Flying free' },
    { id: 'coin_magnet', label: 'Coin Magnet',   cost: 300,  desc: 'Auto-collect nearby coins' },
    { id: 'bouncy_legs', label: 'Bouncy Legs',   cost: 600,  desc: 'Bounces go further and higher' },
    { id: 'rat_whisp',   label: 'Rat Whisperer', cost: 1000, desc: 'Rat mode is faster and longer' },
  ],
};

const TARGET_BOROUGHS = [
  {
    id: 'hoboken', name: 'Hoboken, NJ', angle: 290, minBlocks: 120, color: '#e67e22',
    river: { name: 'Hudson River', atBlock: 55, width: 80, bridge: 'sully' },
    unlock: {
      title: 'Giant Cannoli + MAGA Girlfriend',
      text: 'Dom hands you a cannoli the size of a pool noodle and says "this is what freedom tastes like." He also introduces you to your new MAGA Girlfriend. She has strong opinions about the PATH train and refers to Manhattan as "the city."',
    },
  },
  {
    id: 'brooklyn-heights', name: 'Brooklyn Heights', angle: 145, minBlocks: 300, color: '#3498db',
    river: { name: 'East River', atBlock: 130, width: 95, bridge: 'brooklyn_bridge' },
    unlock: {
      title: 'Park Slope Food Co-op + Legal Summons',
      text: 'You receive a Park Slope Food Co-op membership ($25 initiation, 2.75 hrs/month mandatory). You also receive a Summons to Appear Before the High Court of Bisexuals in Monogamous Cis Partnerships to Discuss Whether Sabra Hummus Is Ethical. Attendance is mandatory.',
    },
  },
  {
    id: 'bushwick', name: 'Bushwick', angle: 110, minBlocks: 550, color: '#9b59b6',
    river: { name: 'East River', atBlock: 130, width: 95, bridge: 'brooklyn_bridge' },
    unlock: {
      title: 'Septum Piercing + ENM Marriage Reshuffle Goodybag',
      text: 'Someone pierces your septum before you even land. The goodybag contains one Tarot Card Gift Set, a laminated ENM Marriage Reshuffle Worksheet, two oat milk espresso coupons, and a zine called "Who Even Owns Feelings." You are now legally polyam-adjacent.',
    },
  },
  {
    id: 'astoria', name: 'Astoria, Queens', angle: 35, minBlocks: 800, color: '#2ecc71',
    river: { name: 'East River', atBlock: 160, width: 110, bridge: 'queensboro' },
    unlock: {
      title: 'Reasonable Rent + Boring Personality',
      text: 'Your new apartment is $1,150/month for a two-bedroom with a real kitchen. In exchange, you receive a Boring Personality. You own a cast iron pan. You go to bed at 10:30. You are at peace. A Greek grandfather hands you a beer before you even knock.',
    },
  },
];

const GROUND_ENTITY_TYPES = new Set([
  'dumpster','rat_dumpster','hydrant','subway_grate','hotdog_cart','manhole','cab_ground',
  'pizza_man','drunk_vomit','stroller_launcher','greek_grandpa',
]);
const ARC_TYPES     = new Set(['pizza_arc','vomit_arc','baby_arc','plate_arc']);
const LAUNCHER_TYPES = new Set(['pizza_man','drunk_vomit','stroller_launcher','greek_grandpa']);
const LAUNCH_INTERVALS = { pizza_man: 65, drunk_vomit: 80, stroller_launcher: 75, greek_grandpa: 68 };
const LAUNCHER_ARC  = { pizza_man: 'pizza_arc', drunk_vomit: 'vomit_arc', stroller_launcher: 'baby_arc', greek_grandpa: 'plate_arc' };

// ============================================
// CANNON GAME CLASS
// ============================================

class CannonGame {
  constructor(gameState, onComplete) {
    this.gameState  = gameState;
    this.onComplete = onComplete;
    this.canvas = document.getElementById('cannon-canvas');
    this.ctx    = this.canvas.getContext('2d');

    this.ts = {
      currentTurn: 0, boroughBucks: 0, totalDistance: 0,
      targetBorough: null, unlocks: [], highScores: {},
      strength: 0, accuracy: 0, suit: 0, rocket: 0, bonus: 0,
    };

    this.aim = { active: false, angle: 15, dir: 1, phase: 'angle', power: 0, powerDir: 1 };
    this.flight      = null;
    this._aimAF      = null;
    this._flightAF   = null;
    this._frame      = 0;
    this._tapHandler = null;
  }

  init() {
    const resize = () => {
      const rect = this.canvas.parentElement.getBoundingClientRect();
      this.canvas.width  = rect.width  || window.innerWidth;
      this.canvas.height = rect.height || window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);
    const dispatch = (e) => { e.preventDefault(); if (this._tapHandler) this._tapHandler(e); };
    this.canvas.addEventListener('click',      dispatch);
    this.canvas.addEventListener('touchstart', dispatch, { passive: false });
    this.drawWSPNight();
    this.showOverlay('cannon-wisemen');
    document.getElementById('cannon-wisemen-continue').onclick = () => this.afterWisemen();
  }

  showOverlay(id) {
    document.querySelectorAll('#cannon-game .cannon-overlay').forEach(el => el.classList.add('hidden'));
    const el = document.getElementById(id);
    if (el) el.classList.remove('hidden');
  }

  hideOverlays() {
    document.querySelectorAll('#cannon-game .cannon-overlay').forEach(el => el.classList.add('hidden'));
  }

  afterWisemen() {
    this.showOverlay('cannon-features');
    this.renderFeaturesScreen();
  }

  // ============================================
  // FEATURES SCREEN
  // ============================================

  renderFeaturesScreen() {
    const el = document.getElementById('cannon-features-dynamic');
    if (!el) return;
    const cats = [
      { key: 'strength', label: 'Cannon Strength' },
      { key: 'accuracy', label: 'Cannon Accuracy' },
      { key: 'suit',     label: 'Flight Suit'     },
      { key: 'rocket',   label: 'Rocket Power'    },
      { key: 'bonus',    label: 'Special Bonus'   },
    ];
    const maxLvl = { strength: 3, accuracy: 3, suit: 3, rocket: 2, bonus: 3 };
    let html = '<div class="cannon-feat-bars">';
    cats.forEach(c => {
      const pct  = (this.ts[c.key] / maxLvl[c.key]) * 100;
      const tier = CANNON_UPGRADES[c.key][this.ts[c.key]];
      html += `<div class="cannon-feat-row">
        <div class="cannon-feat-label">${c.label}</div>
        <div class="cannon-feat-bar-wrap"><div class="cannon-feat-bar" style="width:${pct}%"></div></div>
        <div class="cannon-feat-tier">${tier.label}</div>
      </div>`;
    });
    html += '</div>';
    if (this.ts.unlocks.length > 0) {
      html += '<div class="cannon-feat-unlocks"><div class="cannon-feat-unlocks-title">Collected</div>';
      this.ts.unlocks.forEach(id => {
        const b = TARGET_BOROUGHS.find(b => b.id === id);
        if (b) html += `<div class="cannon-feat-unlock-entry" style="border-color:${b.color}"><span style="color:${b.color}">${b.name}</span> — ${b.unlock.title}</div>`;
      });
      html += '</div>';
    }
    html += `<div class="cannon-feat-stats">
      <span class="cannon-feat-stat">Bucks: <span class="cannon-feat-val">$${this.ts.boroughBucks}</span></span>
      <span class="cannon-feat-stat">Distance: <span class="cannon-feat-val">${this.ts.totalDistance} blocks</span></span>
      <span class="cannon-feat-stat">Turn: <span class="cannon-feat-val">${this.ts.currentTurn}</span></span>
    </div>`;
    el.innerHTML = html;
    document.getElementById('cannon-features-map-btn').onclick    = () => this.showMapOverlay();
    document.getElementById('cannon-features-launch-btn').onclick = () => {
      if (this.ts.currentTurn === 0) this.ts.currentTurn = 1;
      this.showLocationSelect();
    };
  }

  // ============================================
  // MAP OVERLAY
  // ============================================

  showMapOverlay() {
    document.getElementById('cannon-map').classList.remove('hidden');
    this.drawMapCanvas();
    document.getElementById('cannon-map-close').onclick = () => document.getElementById('cannon-map').classList.add('hidden');
  }

  drawMapCanvas() {
    const mc = document.getElementById('cannon-map-canvas');
    if (!mc) return;
    const w = mc.width = 380, h = mc.height = 380, ctx = mc.getContext('2d');
    const cx = w / 2, cy = h / 2;
    ctx.fillStyle = '#080820'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#1a1a3a'; ctx.lineWidth = 1;
    for (let i = 0; i < w; i += 20) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, h); ctx.stroke(); }
    for (let i = 0; i < h; i += 20) { ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(w, i); ctx.stroke(); }
    ctx.strokeStyle = '#2a2a4a'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(w, cy); ctx.stroke();
    ctx.fillStyle = '#333'; ctx.font = '14px VT323'; ctx.textAlign = 'center';
    ctx.fillText('N', cx, 14); ctx.fillText('S', cx, h - 2);
    ctx.fillText('W', 12, cy + 5); ctx.fillText('E', w - 6, cy + 5);

    TARGET_BOROUGHS.forEach(b => {
      const rad  = ((b.angle - 90) * Math.PI) / 180;
      const dist = Math.min(80 + b.minBlocks / 13, 155);
      const tx = cx + Math.cos(rad) * dist, ty = cy + Math.sin(rad) * dist;
      const got = this.ts.unlocks.includes(b.id);
      const hs  = this.ts.highScores[b.id];

      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = got ? b.color : b.color + '55'; ctx.lineWidth = got ? 2.5 : 1.5;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(tx, ty); ctx.stroke();
      ctx.setLineDash([]);

      if (got) {
        ctx.shadowColor = b.color; ctx.shadowBlur = 12;
        ctx.fillStyle = b.color;
        ctx.beginPath(); ctx.arc(tx, ty, 9, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#000'; ctx.font = 'bold 12px VT323'; ctx.textAlign = 'center';
        ctx.fillText('✓', tx, ty + 4);
        ctx.fillStyle = b.color; ctx.font = 'bold 14px VT323';
        ctx.fillText(b.name, tx, ty + 22);
        ctx.fillStyle = '#666'; ctx.font = '12px VT323';
        ctx.fillText('DONE' + (hs ? ' · best: ' + hs + ' blk' : ''), tx, ty + 35);
        ctx.fillStyle = '#555'; ctx.font = '11px VT323';
        ctx.fillText('(beat your score)', tx, ty + 47);
      } else {
        ctx.fillStyle = b.color + '88';
        ctx.beginPath(); ctx.arc(tx, ty, 5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = b.color + 'aa'; ctx.font = '14px VT323';
        ctx.fillText(b.name, tx, ty + 18);
        ctx.fillStyle = '#555'; ctx.font = '12px VT323';
        ctx.fillText(b.minBlocks + ' blocks', tx, ty + 30);
      }
    });
    ctx.fillStyle = '#d4a574'; ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = '12px VT323'; ctx.textAlign = 'center'; ctx.fillText('WSP', cx, cy + 20);
  }

  // ============================================
  // LOCATION SELECT — explicit click, not a spinner
  // ============================================

  showLocationSelect() {
    this.hideOverlays();
    this.showOverlay('cannon-location');
    const list = document.getElementById('cannon-location-list');
    list.innerHTML = '';
    TARGET_BOROUGHS.forEach(b => {
      const got = this.ts.unlocks.includes(b.id);
      const hs  = this.ts.highScores[b.id];
      const btn = document.createElement('button');
      btn.className = 'menu-option cannon-location-btn';
      btn.style.borderLeftColor = b.color;
      btn.innerHTML = `<span style="color:${b.color}">${got ? '✓ ' : ''}${b.name}</span>` +
        `<span class="cannon-location-sub">${b.minBlocks} blocks${hs ? ' · best ' + hs : ''}</span>`;
      btn.onclick = () => {
        this.ts.targetBorough = b.id;
        this.startAnglePhase();
      };
      list.appendChild(btn);
    });
  }

  // ============================================
  // ANGLE PHASE — pick launch elevation, then power
  // ============================================

  static get MIN_ANGLE() { return 15; }
  static get MAX_ANGLE() { return 70; }

  startAnglePhase() {
    if (this._aimAF)    { cancelAnimationFrame(this._aimAF);    this._aimAF    = null; }
    if (this._flightAF) { cancelAnimationFrame(this._flightAF); this._flightAF = null; }
    this.aim.active = true; this.aim.angle = CannonGame.MIN_ANGLE; this.aim.dir = 1;
    this.aim.phase = 'angle'; this.aim.power = 0; this.aim.powerDir = 1;
    this.hideOverlays();
    document.getElementById('cannon-aim').classList.remove('hidden');
    document.getElementById('cannon-aim-turn').textContent = `Turn ${this.ts.currentTurn}`;
    const target = TARGET_BOROUGHS.find(b => b.id === this.ts.targetBorough);
    document.getElementById('cannon-aim-hint').textContent =
      `Target: ${target ? target.name : '?'} — Tap to lock launch angle`;
    this._tapHandler = () => this.handleAimTap();
    this.aimLoop();
  }

  handleAimTap() {
    if (this.aim.phase === 'angle') {
      this.aim.phase = 'power';
      this.aim.power = 0;
      this.aim.powerDir = 1;
      document.getElementById('cannon-aim-hint').textContent = `Angle locked: ${Math.round(this.aim.angle)}° — Tap at full power!`;
    } else if (this.aim.phase === 'power') {
      this.aim.active = false; this.aim.phase = 'done';
      this._tapHandler = null;
      cancelAnimationFrame(this._aimAF);
      document.getElementById('cannon-aim').classList.add('hidden');
      this.launchFlight(this.aim.power, this.aim.angle);
    }
  }

  aimLoop() {
    if (!this.aim.active) return;
    const acc = CANNON_UPGRADES.accuracy[this.ts.accuracy];
    if (this.aim.phase === 'angle') {
      this.aim.angle += acc.swingSpeed * this.aim.dir;
      if (this.aim.angle >= CannonGame.MAX_ANGLE) { this.aim.angle = CannonGame.MAX_ANGLE; this.aim.dir = -1; }
      if (this.aim.angle <= CannonGame.MIN_ANGLE) { this.aim.angle = CannonGame.MIN_ANGLE; this.aim.dir =  1; }
    } else if (this.aim.phase === 'power') {
      // Oscillates instead of holding at 100 — waiting forever is no longer free;
      // you have to time the tap near the top of the swing.
      this.aim.power += this.aim.powerDir * 1.8;
      if (this.aim.power >= 100) { this.aim.power = 100; this.aim.powerDir = -1; }
      if (this.aim.power <= 45)  { this.aim.power = 45;  this.aim.powerDir = 1; }
    }
    this.drawAimCanvas(this.canvas.width, this.canvas.height);
    this._aimAF = requestAnimationFrame(() => this.aimLoop());
  }

  // You're aiming FROM Washington Square Park's concrete plaza, out over the
  // rooftops toward wherever you're targeting — not a disconnected menu screen.
  drawAimBackdrop(W, H, gy, px, color) {
    const ctx = this.ctx;

    // Daytime sky
    const sky = ctx.createLinearGradient(0, 0, 0, gy);
    sky.addColorStop(0, '#4a86c8'); sky.addColorStop(1, '#cfe9f7');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, gy);

    // Distant skyline receding toward the target, tinted by its color
    for (let i = 0; i < 11; i++) {
      const bw = W * 0.78 / 11;
      const bx = W * 0.28 + i * bw;
      const bh = 34 + ((i * 47) % 90);
      ctx.fillStyle = i % 2 === 0 ? 'rgba(58,68,96,0.55)' : 'rgba(58,68,96,0.4)';
      ctx.fillRect(bx, gy - bh, bw - 5, bh);
    }
    ctx.fillStyle = color + '33';
    ctx.fillRect(W * 0.28, gy - 6, W * 0.72, 6);

    // River band between the park and the far shore
    ctx.fillStyle = 'rgba(70,120,190,0.55)';
    ctx.fillRect(W * 0.55, gy - 3, W * 0.45, 3);

    // WSP concrete plaza, foreground
    ctx.fillStyle = '#8f8c81'; ctx.fillRect(0, gy, W * 0.34, H - gy);
    ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 1;
    for (let x = 0; x < W * 0.34; x += 22) { ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x, H); ctx.stroke(); }
    ctx.fillStyle = '#3a6a3a'; ctx.fillRect(W * 0.34, gy, W * 0.06, H - gy); // grass strip at plaza edge

    // Washington Square Arch, sitting right behind the cannon
    const aw = 100, ax = px - aw * 0.35, ay = gy - 128;
    ctx.fillStyle = '#d8d3c2';
    ctx.fillRect(ax, ay + 50, 18, 78);
    ctx.fillRect(ax + aw - 18, ay + 50, 18, 78);
    ctx.beginPath(); ctx.arc(ax + aw / 2, ay + 50, aw / 2, Math.PI, 0); ctx.fill();
    ctx.fillStyle = sky;
    ctx.fillRect(ax + 18, ay + 50, aw - 36, 78);
    ctx.beginPath(); ctx.arc(ax + aw / 2, ay + 50, aw / 2 - 18, Math.PI, 0); ctx.fill();

    // Cannon platform
    ctx.fillStyle = '#3a3a3a'; ctx.fillRect(px - 16, gy - 6, 32, 10);
  }

  drawAimCanvas(W, H) {
    const ctx = this.ctx;
    const target = TARGET_BOROUGHS.find(b => b.id === this.ts.targetBorough);
    const color = target ? target.color : '#d4a574';
    const gy = H * 0.82, px = W * 0.15;

    this.drawAimBackdrop(W, H, gy, px, color);

    // Elevation arc from MIN_ANGLE to MAX_ANGLE
    const R = Math.min(W, H) * 0.34;
    const toRad = (deg) => ((-deg) * Math.PI) / 180;
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(px, gy, R, toRad(CannonGame.MAX_ANGLE), toRad(CannonGame.MIN_ANGLE));
    ctx.stroke();

    // Barrel needle at current/locked angle
    const barrelDeg = this.aim.angle;
    const br = toRad(barrelDeg);
    const bx = px + Math.cos(br) * R, by = gy + Math.sin(br) * R;
    const nc = this.aim.phase === 'power' ? '#e74c3c' : '#f1c40f';
    ctx.shadowColor = nc; ctx.shadowBlur = 14;
    ctx.strokeStyle = nc; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(px, gy); ctx.lineTo(bx, by); ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.fillStyle = nc; ctx.font = '20px VT323'; ctx.textAlign = 'left';
    ctx.fillText(Math.round(barrelDeg) + '°', px + R * 0.5, gy - R * 0.55);

    // Target label up top
    if (target) {
      ctx.fillStyle = color; ctx.font = '22px VT323'; ctx.textAlign = 'center';
      ctx.fillText(target.name, W / 2, H * 0.14);
      ctx.fillStyle = '#888'; ctx.font = '14px VT323';
      ctx.fillText(target.minBlocks + ' blocks to unlock', W / 2, H * 0.14 + 22);
    }

    // Power bar
    if (this.aim.phase === 'power') {
      const pct = this.aim.power / 100;
      const bw = 220, bh = 24, bcx = W / 2, bby = H * 0.62;
      const bbx = bcx - bw / 2;
      ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.fillRect(bbx - 3, bby - 3, bw + 6, bh + 6);
      const pc = pct < 0.4 ? '#2ecc71' : pct < 0.75 ? '#f39c12' : '#e74c3c';
      ctx.fillStyle = pc; ctx.fillRect(bbx, bby, bw * pct, bh);
      ctx.strokeStyle = '#555'; ctx.lineWidth = 1; ctx.strokeRect(bbx, bby, bw, bh);
      ctx.fillStyle = '#fff'; ctx.font = '20px VT323'; ctx.textAlign = 'center';
      ctx.fillText('POWER: ' + Math.round(this.aim.power) + '%', bcx, bby + bh - 2);
    }
  }

  // ============================================
  // FLIGHT
  // ============================================

  launchFlight(power, angleDeg) {
    const str = CANNON_UPGRADES.strength[this.ts.strength];
    const sut = CANNON_UPGRADES.suit[this.ts.suit];
    const rkt = CANNON_UPGRADES.rocket[this.ts.rocket];
    const bon = CANNON_UPGRADES.bonus[this.ts.bonus];
    const speed = str.velocity * (0.5 + (power / 100) * 0.5);
    const launchAngle = ((angleDeg != null ? angleDeg : 45) * Math.PI) / 180;
    const targetB = TARGET_BOROUGHS.find(b => b.id === this.ts.targetBorough);

    this.flight = {
      vx: speed * Math.cos(launchAngle),
      vy: speed * Math.sin(launchAngle),  // world space: positive = upward
      worldY: 25,                          // 0=ground, positive=up
      cameraY: 0,                          // scrolled camera offset
      gravity: 0.075,
      drag: sut.drag,
      flapForce: sut.flapForce,
      flapCooldown: 0,
      flapCooldownMax: sut.cooldownFrames,
      suitId: sut.id,
      rocketLeft: rkt.boost > 0 ? 1 : 0,
      rocketBoost: rkt.boost,
      bonusId: bon.id,
      distance: 0, bgOffset: 0,
      damage: 0, coins: 0,
      entities: [], spawnTimer: 0,
      landed: false, sliding: false,
      ratMode: false, ratVx: 0,
      prideTimer: 0,
      flapFlash: 0,
      shakeX: 0, shakeY: 0,
      river: targetB ? { ...targetB.river, crossed: false, active: false, timer: 0 } : null,
      riverEventTimer: 0,
    };

    const hud = document.getElementById('cannon-flight-hud');
    if (this.flight.rocketLeft > 0) {
      hud.classList.remove('hidden');
      document.getElementById('cannon-boost-btn').onclick = () => this.useRocket();
    } else { hud.classList.add('hidden'); }

    this._tapHandler = () => this.handleFlap();
    this._frame = 0;
    this.flightLoop();
  }

  handleFlap() {
    const f = this.flight;
    if (!f || f.landed || f.ratMode) return;
    if (f.flapCooldown > 0) return;
    f.vy += f.flapForce;
    if (f.vy > 20) f.vy = 20;
    f.flapCooldown = f.flapCooldownMax;
    f.flapFlash = 10;
  }

  useRocket() {
    const f = this.flight; if (!f || f.rocketLeft <= 0) return;
    f.rocketLeft--;
    f.vx += f.rocketBoost;
    f.vy += f.rocketBoost * 0.45;
    document.getElementById('cannon-flight-hud').classList.add('hidden');
  }

  flightLoop() {
    if (!this.flight || this.flight.landed) return;
    this._frame++;
    if (this.flight.flapCooldown > 0) this.flight.flapCooldown--;
    if (this.flight.flapFlash > 0)    this.flight.flapFlash--;
    this.flight.shakeX *= 0.72;
    this.flight.shakeY *= 0.72;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.updateFlight();
    this.renderFlight();
    if (this.flight && this.flight.landed) { this.endFlight(); }
    else { this._flightAF = requestAnimationFrame(() => this.flightLoop()); }
  }

  // World Y → screen Y
  wToS(wy) {
    return this.canvas.height * 0.76 - wy + this.flight.cameraY;
  }

  updateFlight() {
    const f = this.flight, H = this.canvas.height, W = this.canvas.width;

    // Camera lerp: follow player upward, never below ground view
    const targetCamY = Math.max(0, f.worldY - H * 0.38);
    f.cameraY += (targetCamY - f.cameraY) * 0.07;

    // River trigger
    if (f.river && !f.river.crossed) {
      const inRiver = f.distance >= f.river.atBlock && f.distance < f.river.atBlock + f.river.width;
      if (inRiver && !f.river.active) {
        f.river.active = true;
        f.riverEventTimer = 140;
      }
      if (!inRiver && f.river.active && f.distance >= f.river.atBlock + f.river.width) {
        f.river.active = false;
        f.river.crossed = true;
      }
    }
    if (f.riverEventTimer > 0) f.riverEventTimer--;

    // ---- RAT MODE ----
    if (f.ratMode) {
      f.ratVx *= (f.bonusId === 'rat_whisp' ? 0.9775 : 0.975);
      f.worldY = 0; f.cameraY = 0;
      f.distance += f.ratVx * 0.4; f.bgOffset += f.ratVx * 0.9;
      f.spawnTimer++;
      if (f.spawnTimer % 55 === 0) this.spawnGround();
      this.updateLaunchersAndArcs();
      f.entities = f.entities.filter(e => { e.x -= f.ratVx * 0.8 + 1; return e.x > -120; });
      this.checkCollisions(true);
      if (f.ratVx < 0.4) f.landed = true;
      return;
    }

    // ---- SLIDING ----
    if (f.sliding) {
      const fr = f.bonusId === 'bouncy_legs' ? 0.958 : 0.930;
      f.vx *= fr;
      f.worldY = 0; f.cameraY = 0;
      f.distance += f.vx * 0.5; f.bgOffset += f.vx * 0.9;
      f.spawnTimer++;
      if (f.spawnTimer % 80 === 0) this.spawnGround();
      this.updateLaunchersAndArcs();
      f.entities = f.entities.filter(e => { e.x -= f.vx * 0.8 + 1; return e.x > -120; });
      this.checkCollisions(true);
      if (f.vx < 0.4) f.landed = true;
      return;
    }

    // ---- AIRBORNE ----
    // Fatigue: past ~40s of flight, a gentle extra pull kicks in and ramps up over
    // the next minute or so. Backstops naked/pigeon/eagle so a flight can't run
    // forever even with perfect play and good luck. Jetpack's lift is strong enough
    // to outlast even this — by design, it's the one tier where only a hazard hit
    // ends the flight.
    const fatigue = this._frame > 2400 ? Math.min(0.30, (this._frame - 2400) / 10000) : 0;
    f.vy -= f.gravity + fatigue;
    f.vx *= (1 - f.drag * 0.018);
    f.worldY += f.vy;

    const dx = Math.max(0, f.vx);
    f.distance += dx * 0.5; f.bgOffset += dx * 0.9;

    // Coin magnet
    if (f.bonusId === 'coin_magnet') {
      f.entities.forEach(e => {
        if (e.type === 'coin' && !e.collected) {
          const dxM = 80 - e.x, dyM = f.worldY - (e.worldY || 80);
          if (Math.sqrt(dxM * dxM + dyM * dyM) < 110) {
            e.x += dxM * 0.12;
            if (e.worldY !== undefined) e.worldY += dyM * 0.12;
          }
        }
      });
    }

    // Ground collision
    if (f.worldY <= 0) {
      const bm = f.bonusId === 'bouncy_legs' ? 0.55 : 0.40;
      if (Math.abs(f.vy) > 2.0 && f.vx > 1.5) {
        f.worldY = 0;
        const bounceVy = Math.abs(f.vy) * bm;
        f.vy = bounceVy;
        f.vx *= 0.88;
        const impact = Math.min(bounceVy, 14);
        f.shakeX = (Math.random() - 0.5) * impact * 2;
        f.shakeY = impact * 1.4;
      } else if (f.vx > 1.5) {
        f.worldY = 0; f.vy = 0; f.sliding = true;
      } else {
        f.worldY = 0; f.landed = true;
      }
      return;
    }

    if (f.vx < 0.2 && f.worldY < 10) { f.worldY = 0; f.landed = true; return; }

    f.spawnTimer++;
    // Spawn rate ramps up with distance — a long endurance flight gets busier, not
    // calmer — but starts dense and generous right out of the cannon (no more
    // barren first few seconds before anything shows up).
    const skyInterval = Math.max(22, 42 - Math.floor(f.distance / 250));
    const groundInterval = Math.max(40, 70 - Math.floor(f.distance / 250));
    if (f.spawnTimer % skyInterval === 0) this.spawnSky();
    if (f.spawnTimer % groundInterval === 0 && f.distance > 15) this.spawnGround();
    this.updateLaunchersAndArcs();
    f.entities = f.entities.filter(e => {
      e.x -= dx * 0.85 + 1.5;
      if (e.isArc && e.arcWorldY !== undefined && e.arcWorldY < -10) return false;
      return e.x > -120;
    });
    this.checkCollisions(false);
  }

  updateLaunchersAndArcs() {
    const f = this.flight, newArcs = [];
    f.entities.forEach(e => {
      if (LAUNCHER_TYPES.has(e.type)) {
        e.lastShot = (e.lastShot || 0) + 1;
        if (e.lastShot >= (LAUNCH_INTERVALS[e.type] || 70)) {
          e.lastShot = 0;
          newArcs.push({
            type: LAUNCHER_ARC[e.type], x: e.x,
            arcWorldY: 18, arcVy: 8 + Math.random() * 5,
            isArc: true, collected: false, rotation: 0,
          });
        }
      }
      if (e.isArc) {
        e.arcVy = (e.arcVy || 0) - 0.22;
        e.arcWorldY = (e.arcWorldY || 0) + e.arcVy;
        if (e.rotation !== undefined) e.rotation += 0.1;
      }
    });
    f.entities.push(...newArcs);
  }

  spawnSky() {
    const W = this.canvas.width, r = Math.random();
    // Front-loaded generous: mostly coins/powerups, only a small slice of hazards
    // right out of the cannon. Danger grows the longer a flight runs (below).
    // Currency/utility pickups are frequent (reward, no effect on how far a shot
    // goes); movement-boost pickups (ring/light_cloud/pigeon_flock/updraft) are
    // kept rarer on purpose — they used to be common enough that one incidental
    // hit alone covered the gap a bad shot left, making skill/power irrelevant.
    let type;
    if      (r < 0.42) type = 'coin';
    else if (r < 0.52) type = 'pretzel';
    else if (r < 0.58) type = 'rainbow_cloud';
    else if (r < 0.65) type = 'ring';
    else if (r < 0.72) type = 'light_cloud';
    else if (r < 0.77) type = 'pigeon_flock';
    else if (r < 0.83) type = 'updraft';
    else if (r < 0.90) type = 'dark_cloud';
    else if (r < 0.95) type = 'pigeon_obs';
    else               type = 'helicopter';

    // Long flights get meaner: occasionally upgrade a benign pickup into a hazard,
    // scaling with distance. Keeps endurance suits (eagle/jetpack) from being a free ride.
    const hazardBias = Math.min(0.35, this.flight.distance / 3000);
    const escalate = { coin: 'dark_cloud', ring: 'pigeon_obs', light_cloud: 'helicopter', pretzel: 'pigeon_obs' };
    if (escalate[type] && Math.random() < hazardBias) type = escalate[type];

    const minWY = { coin:40, ring:50, light_cloud:70, dark_cloud:90, rainbow_cloud:200,
      pretzel:50, pigeon_flock:80, pigeon_obs:70, helicopter:220, updraft:25 };
    const base = minWY[type] || 50;

    // Band tracks the player's CURRENT altitude at a fixed width, so climbing high
    // doesn't thin out hazard density (it used to — the higher you went, the more
    // spread out spawns got, making altitude a free escape from danger).
    const spread = 260;
    const low = Math.max(base, this.flight.worldY - spread * 0.5);
    const worldY = low + Math.random() * spread;
    this.flight.entities.push({ type, x: W + 60, worldY, collected: false });
  }

  spawnGround() {
    const W = this.canvas.width, r = Math.random();
    const borough = this.ts.targetBorough;
    let type;
    if      (borough === 'hoboken'          && r < 0.45) type = r < 0.25 ? 'pizza_man' : 'drunk_vomit';
    else if (borough === 'bushwick'         && r < 0.40) type = 'drunk_vomit';
    else if (borough === 'brooklyn-heights' && r < 0.40) type = 'stroller_launcher';
    else if (borough === 'astoria'          && r < 0.40) type = 'greek_grandpa';
    else {
      if      (r < 0.18) type = 'dumpster';
      else if (r < 0.32) type = 'rat_dumpster';
      else if (r < 0.46) type = 'hydrant';
      else if (r < 0.58) type = 'subway_grate';
      else if (r < 0.70) type = 'hotdog_cart';
      else if (r < 0.82) type = 'manhole';
      else                type = 'cab_ground';
    }
    this.flight.entities.push({ type, x: W + 60, groundEnt: true, lastShot: 0, collected: false });
  }

  checkCollisions(groundOnly) {
    const f = this.flight, px = 80;
    const py = groundOnly ? this.wToS(0) : this.wToS(f.worldY);

    f.entities.forEach(e => {
      if (e.collected) return;
      if (LAUNCHER_TYPES.has(e.type)) return;
      const isArc    = ARC_TYPES.has(e.type);
      const isGround = e.groundEnt && !isArc;
      if (!groundOnly && isGround) return;
      if ( groundOnly && !isGround && !isArc) return;

      const esy = isArc ? this.wToS(e.arcWorldY || 0) : isGround ? this.wToS(0) : this.wToS(e.worldY || 80);
      if (Math.abs(px - e.x) > 34 || Math.abs(py - esy) > 32) return;

      e.collected = true;
      switch (e.type) {
        case 'coin':          f.coins++; this.ts.boroughBucks += 5; break;
        case 'ring':          f.vx += 6; break;
        case 'light_cloud':   f.vy += 10; break;
        case 'updraft':       f.vy += 13; break;
        case 'pretzel':       f.flapCooldown = 0; break;
        case 'pigeon_flock':  f.vx += 4; f.vy += 4; break;
        case 'rainbow_cloud': f.prideTimer = 130; this.ts.boroughBucks += 20; break;
        case 'dark_cloud':    f.vx *= 0.58; f.vy *= 0.55; break;
        case 'pigeon_obs':    f.damage += 12; f.vy -= 5; f.vx -= 1.5; break;
        case 'helicopter':    f.damage += 22; f.vy -= 7; f.vx -= 2; break;
        case 'pizza_arc':     f.damage += 15; f.vx -= 2; f.vy -= 3; break;
        case 'vomit_arc':     f.damage += 10; f.vx *= 0.62; break;
        case 'baby_arc':      f.damage += 25; f.vy -= 6; f.vx -= 3; break;
        case 'plate_arc':     f.damage += 18; f.vx -= 2.5; f.vy -= 2.5; break;
        case 'hydrant':       f.vy += 15; f.worldY = Math.max(f.worldY, 5); f.sliding = false; break;
        case 'subway_grate':  f.vx += 5; f.sliding = false; f.vy += 4; f.worldY = Math.max(f.worldY, 5); break;
        case 'hotdog_cart':   f.vy += 8; f.vx += 3; f.sliding = false; f.worldY = Math.max(f.worldY, 5); break;
        case 'dumpster':      f.vx = 0; f.ratVx = 0; f.landed = true; break;
        case 'rat_dumpster':  f.ratMode = true; f.ratVx = Math.max(f.vx, f.ratVx) * 0.85; f.vx = 0; f.sliding = false; f.worldY = 0; break;
        case 'manhole':       f.vx *= 0.5; if (f.ratMode) f.ratVx *= 0.5; break;
        case 'cab_ground':    f.vx *= 0.4; f.damage += 15; break;
      }
      if (f.damage >= 100) { f.damage = 100; f.landed = true; }
    });
  }

  // ============================================
  // FLIGHT RENDERING
  // ============================================

  renderFlight() {
    const f = this.flight, { width: W, height: H } = this.canvas, ctx = this.ctx;

    ctx.save();
    ctx.translate(Math.round(f.shakeX), Math.round(f.shakeY));

    const groundScreenY = this.wToS(0);
    const playerScreenY = (f.ratMode || f.sliding) ? groundScreenY : this.wToS(f.worldY);

    this.renderFlightBg(W, H, f.bgOffset, f.worldY, f.cameraY);

    // Ground or river
    if (f.river && f.river.active) {
      this.renderRiverZone(W, H, groundScreenY, f.river);
    } else {
      const gsy = Math.min(groundScreenY, H - 1);
      if (gsy < H) {
        ctx.fillStyle = '#4a7c3f'; ctx.fillRect(0, gsy, W, H - gsy);
        ctx.fillStyle = '#666';    ctx.fillRect(0, gsy, W, 6);
      }
    }

    this.renderYardageMarkers(W, H, f.bgOffset, f.distance, groundScreenY);

    // Entities
    f.entities.forEach(e => {
      if (e.collected) return;
      if (e.groundEnt || LAUNCHER_TYPES.has(e.type)) this.renderGroundEnt(e, groundScreenY);
      else if (e.isArc) this.renderArcEnt(e);
      else this.renderSkyEnt(e);
    });

    if (f.ratMode) this.renderRat(80, groundScreenY);
    else           this.renderPlayer(80, playerScreenY, f);

    ctx.restore();

    // Pride
    if (f.prideTimer > 0) {
      f.prideTimer--;
      ctx.globalAlpha = Math.min(1, f.prideTimer / 40);
      const txt = 'HAPPY PRIDE!', colors = ['#e74c3c','#e67e22','#f1c40f','#2ecc71','#3498db','#9b59b6'];
      ctx.font = 'bold 38px VT323'; ctx.textAlign = 'center';
      for (let i = 0; i < txt.length; i++) {
        ctx.fillStyle = colors[i % colors.length];
        ctx.fillText(txt[i], W / 2 - txt.length * 10 + i * 21, H * 0.27);
      }
      ctx.globalAlpha = 1;
    }

    if (f.riverEventTimer > 0) this.renderRiverEventBanner(W, H, f);
    this.renderHUD(W, H, f);
  }

  renderFlightBg(W, H, offset, worldY, cameraY) {
    const ctx = this.ctx;
    const alt = Math.max(0, worldY);

    // Sky gradient — altitude zones
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    if (alt < 350) {
      const t = alt / 350;
      sky.addColorStop(0, `rgb(${Math.round(55 + 45 * t)},${Math.round(110 + 60 * (1-t))},${Math.round(215 - 25 * t)})`);
      sky.addColorStop(1, '#b8e8f8');
    } else if (alt < 900) {
      const t = (alt - 350) / 550;
      sky.addColorStop(0, `rgb(${Math.round(22 + 33*(1-t))},${Math.round(55 + 35*(1-t))},${Math.round(155 + 45*t)})`);
      sky.addColorStop(1, `rgb(${Math.round(50*(1-t)+10)},${Math.round(130*(1-t)+20)},200)`);
    } else {
      // Above clouds — space-like
      sky.addColorStop(0, '#080818');
      sky.addColorStop(0.6, '#0d0d2e');
      sky.addColorStop(1, '#12123a');
    }
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);

    // Stars above cloud layer
    if (alt > 600) {
      const sa = Math.min(1, (alt - 600) / 400);
      ctx.fillStyle = `rgba(255,255,255,${sa * 0.85})`;
      for (let i = 0; i < 70; i++) {
        const sx = ((i * 131.3 - offset * 0.04) % (W + 40) + W + 40) % (W + 40) - 20;
        const sy = (i * 89.7) % (H * 0.72);
        ctx.fillRect(sx, sy, i % 5 === 0 ? 2 : 1.5, i % 5 === 0 ? 2 : 1.5);
      }
    }

    // Cloud layer
    const cloudWorldY = 420;
    const cloudSY = this.wToS(cloudWorldY);
    if (cloudSY > -80 && cloudSY < H + 80) {
      const cloudAlpha = alt < cloudWorldY ? 0.65 : Math.max(0.1, 1 - (alt - cloudWorldY) / 400);
      ctx.fillStyle = `rgba(190,215,235,${cloudAlpha})`;
      for (let i = 0; i < 10; i++) {
        const cx2 = ((i * 260 - offset * 0.28) % (W + 340) + W + 340) % (W + 340) - 130;
        const cy2 = cloudSY + Math.sin(i * 1.7) * 25;
        ctx.beginPath(); ctx.arc(cx2, cy2, 48, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx2 + 44, cy2 + 12, 32, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx2 - 44, cy2 + 12, 32, 0, Math.PI * 2); ctx.fill();
      }
    }

    // Buildings (fade out as altitude rises)
    if (cameraY < 250) {
      const groundSY = this.wToS(0);
      const bAlpha = Math.max(0, 1 - cameraY / 250);
      ctx.globalAlpha = bAlpha;
      ctx.fillStyle = '#3a3a5c';
      for (let i = 0; i < 14; i++) {
        const bx = ((i * 155 - offset * 0.11) % (W + 200) + W + 200) % (W + 200) - 100;
        const bh = 55 + Math.sin(i * 1.9) * 28;
        ctx.fillRect(bx, groundSY - bh, 115, bh);
        ctx.fillStyle = 'rgba(255,205,70,0.32)';
        for (let rr = 0; rr < 3; rr++) for (let c = 0; c < 4; c++)
          if ((i + rr + c) % 2 === 0) ctx.fillRect(bx + 7 + c * 26, groundSY - bh + 8 + rr * 17, 13, 9);
        ctx.fillStyle = '#3a3a5c';
      }
      ctx.fillStyle = '#242438';
      for (let i = 0; i < 9; i++) {
        const bx = ((i * 220 - offset * 0.28) % (W + 280) + W + 280) % (W + 280) - 140;
        const bh = 95 + Math.cos(i * 2.3) * 42;
        ctx.fillRect(bx, groundSY - bh, 155, bh);
      }
      ctx.globalAlpha = 1;
    }
  }

  renderRiverZone(W, H, groundScreenY, river) {
    const ctx = this.ctx;
    const gsy = Math.min(groundScreenY, H - 1);
    if (gsy >= H) return;

    // Water fill
    ctx.fillStyle = '#1a3a6e'; ctx.fillRect(0, gsy, W, H - gsy);

    // Animated waves
    ctx.strokeStyle = 'rgba(80,140,230,0.35)'; ctx.lineWidth = 2;
    for (let i = 0; i < 7; i++) {
      const wy = gsy + 14 + i * 20;
      ctx.beginPath();
      for (let wx = 0; wx < W; wx += 3) {
        const wvy = wy + Math.sin(wx / 38 + this._frame * 0.06 + i * 0.9) * 4.5;
        wx === 0 ? ctx.moveTo(wx, wvy) : ctx.lineTo(wx, wvy);
      }
      ctx.stroke();
    }
    // Water surface line
    ctx.strokeStyle = '#4a8ac4'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, gsy); ctx.lineTo(W, gsy); ctx.stroke();

    this.renderBridge(W, H, groundScreenY, river.bridge);
  }

  renderBridge(W, H, groundScreenY, type) {
    const ctx = this.ctx;
    const gsy = Math.min(groundScreenY, H - 1);
    const bx = W * 0.56;

    if (type === 'brooklyn_bridge') {
      const towerH = 130, tow = 22, towerY = gsy - towerH;
      const t1 = bx, t2 = bx + 170;

      [t1, t2].forEach(tx => {
        ctx.fillStyle = '#c8b89a'; ctx.fillRect(tx - tow/2, towerY, tow, towerH);
        // Gothic arches
        ctx.fillStyle = '#1a3a6e';
        ctx.beginPath(); ctx.arc(tx, towerY + 28, 8, Math.PI, 0); ctx.fill();
        ctx.fillRect(tx - 8, towerY + 14, 16, 22);
        ctx.beginPath(); ctx.arc(tx, towerY + 65, 6, Math.PI, 0); ctx.fill();
        ctx.fillRect(tx - 6, towerY + 52, 12, 18);
      });

      // Main suspension cables
      ctx.strokeStyle = '#9a9a8a'; ctx.lineWidth = 2.5;
      const cty = towerY + 8;
      ctx.beginPath(); ctx.moveTo(t1, cty); ctx.quadraticCurveTo((t1+t2)/2, cty + 52, t2, cty); ctx.stroke();

      // Hanger cables
      ctx.strokeStyle = '#787868'; ctx.lineWidth = 1;
      for (let i = 0; i <= 10; i++) {
        const hx = t1 + (t2 - t1) * i / 10;
        const htY = cty + Math.pow((i / 5 - 1), 2) * 52;
        ctx.beginPath(); ctx.moveTo(hx, htY); ctx.lineTo(hx, gsy); ctx.stroke();
      }

      // Road deck
      ctx.fillStyle = '#4a4a4a'; ctx.fillRect(t1 - 18, gsy - 9, t2 - t1 + 36, 9);
      ctx.fillStyle = '#d4a574'; ctx.font = 'bold 16px VT323'; ctx.textAlign = 'center';
      ctx.fillText('BROOKLYN BRIDGE', (t1 + t2) / 2, towerY - 12);

    } else if (type === 'queensboro') {
      const startX = bx - 50, span = 200;

      ctx.strokeStyle = '#8a8a78'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(startX, gsy); ctx.lineTo(startX + span, gsy); ctx.stroke();

      // Truss structure
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 7; i++) {
        const x1 = startX + i * 28, x2 = startX + (i+1) * 28, topY = gsy - 55;
        ctx.beginPath(); ctx.moveTo(x1, gsy); ctx.lineTo(x2, topY); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x1, topY); ctx.lineTo(x2, gsy); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x1, topY); ctx.lineTo(x2, topY); ctx.stroke();
      }

      // Roosevelt Island
      const isX = startX + span / 2;
      ctx.fillStyle = '#2a5a2a'; ctx.fillRect(isX - 22, gsy, 44, 14);
      ctx.fillStyle = '#d4a574'; ctx.font = '12px VT323'; ctx.textAlign = 'center';
      ctx.fillText('Roosevelt Is.', isX, gsy - 4);
      ctx.font = 'bold 16px VT323'; ctx.fillText('QUEENSBORO BRIDGE', isX, gsy - 65);

    } else if (type === 'sully') {
      const px2 = W * 0.48, planeY = gsy + 20;

      // Fuselage
      ctx.fillStyle = '#e8e8e8'; ctx.beginPath(); ctx.ellipse(px2, planeY, 58, 13, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#aaa'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(px2, planeY, 58, 13, 0, 0, Math.PI * 2); ctx.stroke();

      // Wings
      ctx.fillStyle = '#cccccc';
      ctx.beginPath(); ctx.moveTo(px2 - 12, planeY - 3); ctx.lineTo(px2 - 12, planeY - 32); ctx.lineTo(px2 + 28, planeY - 3); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(px2 - 12, planeY + 3); ctx.lineTo(px2 - 12, planeY + 32); ctx.lineTo(px2 + 28, planeY + 3); ctx.closePath(); ctx.fill();

      // Tail fin
      ctx.fillStyle = '#bbbbbb';
      ctx.beginPath(); ctx.moveTo(px2 - 52, planeY - 2); ctx.lineTo(px2 - 52, planeY - 26); ctx.lineTo(px2 - 32, planeY - 2); ctx.closePath(); ctx.fill();

      // Water splash
      ctx.strokeStyle = 'rgba(80,140,220,0.55)'; ctx.lineWidth = 3;
      for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI;
        ctx.beginPath();
        ctx.moveTo(px2 + Math.cos(angle) * 62, planeY + Math.sin(angle) * 10);
        ctx.lineTo(px2 + Math.cos(angle) * 84, planeY + Math.sin(angle) * 20 - 18);
        ctx.stroke();
      }
      ctx.fillStyle = '#d4a574'; ctx.font = 'bold 17px VT323'; ctx.textAlign = 'center';
      ctx.fillText('Miracle on the Hudson', px2, planeY - 42);
      ctx.fillStyle = '#888'; ctx.font = '14px VT323';
      ctx.fillText('Sully landed here. It\'s fine.', px2, planeY - 25);
    }
  }

  renderRiverEventBanner(W, H, f) {
    const ctx = this.ctx;
    const t = f.riverEventTimer;
    const alpha = Math.min(1, t / 30) * (t > 10 ? 1 : t / 10);
    const riverName = f.river ? f.river.name.toUpperCase() : 'RIVER';
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(0,15,70,0.88)';
    ctx.fillRect(0, H * 0.34, W, 76);
    ctx.strokeStyle = '#5dade2'; ctx.lineWidth = 2;
    ctx.strokeRect(0, H * 0.34, W, 76);
    ctx.fillStyle = '#5dade2'; ctx.font = 'bold 44px VT323'; ctx.textAlign = 'center';
    ctx.fillText('CROSSING THE ' + riverName + '!', W / 2, H * 0.34 + 48);
    ctx.globalAlpha = 1;
  }

  renderYardageMarkers(W, H, bgOffset, distance, groundScreenY) {
    const ctx = this.ctx;
    const gsy = Math.min(groundScreenY, H - 1);
    if (gsy >= H) return;

    // bgOffset / distance ≈ 1.8, so 100 blocks ≈ 180 bgOffset units
    const bgPer100 = 180;
    const markFirst = Math.floor(bgOffset / bgPer100);

    for (let m = Math.max(1, markFirst - 1); m <= markFirst + Math.ceil(W / bgPer100) + 2; m++) {
      const markerBg = m * bgPer100;
      const sx = W + (markerBg - bgOffset);
      if (sx < -20 || sx > W + 20) continue;
      const blockLabel = m * 100;
      ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);
      ctx.beginPath(); ctx.moveTo(sx, gsy - 55); ctx.lineTo(sx, gsy); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.font = '13px VT323'; ctx.textAlign = 'center';
      ctx.fillText(blockLabel + ' BLK', sx, gsy - 60);
    }
  }

  renderSkyEnt(e) {
    const ctx = this.ctx, f = this._frame;
    const sy = this.wToS(e.worldY || 150);
    const ex = e.x;
    switch (e.type) {
      case 'coin': {
        const bob = Math.sin(f * 0.1 + ex * 0.05) * 3;
        ctx.fillStyle = '#f1c40f'; ctx.beginPath(); ctx.arc(ex, sy + bob, 10, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#c8860a'; ctx.font = 'bold 13px VT323'; ctx.textAlign = 'center'; ctx.fillText('$', ex, sy + bob + 5);
        break;
      }
      case 'ring':
        ctx.strokeStyle = '#3498db'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.ellipse(ex, sy, 16, 8, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#3498db'; ctx.font = '12px VT323'; ctx.textAlign = 'center'; ctx.fillText('SPEED', ex, sy + 22);
        break;
      case 'light_cloud':
        ctx.fillStyle = 'rgba(215,240,255,0.92)';
        ctx.beginPath(); ctx.arc(ex, sy, 22, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(ex + 19, sy + 5, 15, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(ex - 19, sy + 5, 15, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#7ec8e3'; ctx.font = '11px VT323'; ctx.textAlign = 'center'; ctx.fillText('BOUNCE', ex, sy + 36);
        break;
      case 'dark_cloud':
        ctx.fillStyle = 'rgba(55,55,75,0.92)';
        ctx.beginPath(); ctx.arc(ex, sy, 22, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(ex + 19, sy + 5, 15, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(ex - 19, sy + 5, 15, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#f1c40f'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(ex+2,sy+10); ctx.lineTo(ex-4,sy+22); ctx.lineTo(ex+2,sy+22); ctx.lineTo(ex-4,sy+34); ctx.stroke();
        break;
      case 'rainbow_cloud': {
        const rc = ['#e74c3c','#e67e22','#f1c40f','#2ecc71','#3498db','#9b59b6'];
        rc.forEach((c,i)=>{ctx.strokeStyle=c;ctx.lineWidth=3;ctx.beginPath();ctx.arc(ex,sy+12,20+i*5,Math.PI,0);ctx.stroke();});
        ctx.fillStyle='rgba(255,255,255,0.92)';
        ctx.beginPath();ctx.arc(ex,sy,17,0,Math.PI*2);ctx.fill();
        ctx.beginPath();ctx.arc(ex+14,sy+4,12,0,Math.PI*2);ctx.fill();
        ctx.beginPath();ctx.arc(ex-14,sy+4,12,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#555';ctx.font='11px VT323';ctx.textAlign='center';ctx.fillText('PRIDE',ex,sy+30);
        break;
      }
      case 'pretzel':
        ctx.strokeStyle='#c8860a';ctx.lineWidth=4;
        ctx.beginPath();ctx.arc(ex,sy,10,0,Math.PI*2);ctx.stroke();
        ctx.beginPath();ctx.moveTo(ex-6,sy+5);ctx.bezierCurveTo(ex-16,sy-10,ex+4,sy-16,ex+4,sy);ctx.stroke();
        ctx.beginPath();ctx.moveTo(ex+6,sy+5);ctx.bezierCurveTo(ex+16,sy-10,ex-4,sy-16,ex-4,sy);ctx.stroke();
        ctx.fillStyle='#2ecc71';ctx.font='11px VT323';ctx.textAlign='center';ctx.fillText('FLAP RESET',ex,sy+22);
        break;
      case 'pigeon_flock': {
        const wb=Math.sin(f*0.27)*6;
        for(let i=0;i<4;i++){const ox=(i-1.5)*16,oy=(i%2)*8;
          ctx.fillStyle='#aaa';ctx.beginPath();ctx.ellipse(ex+ox,sy+oy,9,5,0,0,Math.PI*2);ctx.fill();
          ctx.fillStyle='#ccc';
          ctx.beginPath();ctx.ellipse(ex+ox-9,sy+oy-wb,7,3,-0.3,0,Math.PI*2);ctx.fill();
          ctx.beginPath();ctx.ellipse(ex+ox+9,sy+oy-wb,7,3,0.3,0,Math.PI*2);ctx.fill();}
        ctx.fillStyle='#2ecc71';ctx.font='12px VT323';ctx.textAlign='center';ctx.fillText('DRAFT',ex,sy+26);
        break;
      }
      case 'pigeon_obs': {
        const wb2=Math.sin(f*0.27)*7;
        ctx.fillStyle='#999';ctx.beginPath();ctx.ellipse(ex,sy,13,7,0,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#aaa';
        ctx.beginPath();ctx.ellipse(ex-13,sy-wb2,9,4,-0.3,0,Math.PI*2);ctx.fill();
        ctx.beginPath();ctx.ellipse(ex+13,sy-wb2,9,4,0.3,0,Math.PI*2);ctx.fill();
        ctx.strokeStyle='rgba(231,76,60,0.4)';ctx.lineWidth=2;
        ctx.beginPath();ctx.arc(ex,sy,21,0,Math.PI*2);ctx.stroke();
        break;
      }
      case 'helicopter': {
        const rA=(f*0.22)%(Math.PI*2);
        ctx.fillStyle='#2c3e50';ctx.fillRect(ex-28,sy-11,56,22);ctx.fillRect(ex+28,sy-5,26,11);
        ctx.save();ctx.translate(ex,sy-14);ctx.rotate(rA);
        ctx.fillStyle='#555';ctx.fillRect(-34,-2,68,4);ctx.restore();
        ctx.fillStyle='#3498db';ctx.fillRect(ex-19,sy-9,15,12);
        ctx.strokeStyle='rgba(231,76,60,0.4)';ctx.lineWidth=2;
        ctx.beginPath();ctx.arc(ex,sy,36,0,Math.PI*2);ctx.stroke();
        break;
      }
      case 'updraft':
        ctx.strokeStyle='rgba(46,204,113,0.5)';ctx.lineWidth=2;
        for(let i=0;i<3;i++){ctx.beginPath();ctx.moveTo(ex+(i-1)*10,sy+22);ctx.lineTo(ex+(i-1)*10,sy-22);ctx.stroke();}
        ctx.fillStyle='rgba(46,204,113,0.14)';ctx.beginPath();ctx.arc(ex,sy,20,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#2ecc71';ctx.font='13px VT323';ctx.textAlign='center';ctx.fillText('UP',ex,sy+6);
        break;
    }
  }

  renderArcEnt(e) {
    const ctx = this.ctx;
    const sy = this.wToS(e.arcWorldY || 0);
    const ex = e.x;
    switch (e.type) {
      case 'pizza_arc':
        ctx.save();ctx.translate(ex,sy);ctx.rotate(e.rotation||0);
        ctx.fillStyle='#f5c842';ctx.beginPath();ctx.arc(0,0,14,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#c0392b';ctx.beginPath();ctx.arc(-4,-3,4,0,Math.PI*2);ctx.fill();
        ctx.beginPath();ctx.arc(5,4,3,0,Math.PI*2);ctx.fill();
        ctx.strokeStyle='#c8860a';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,14,0,Math.PI*2);ctx.stroke();
        ctx.restore();break;
      case 'vomit_arc':
        ctx.fillStyle='rgba(100,180,40,0.88)';
        ctx.beginPath();ctx.moveTo(ex,sy-10);ctx.lineTo(ex+8,sy-3);ctx.lineTo(ex+12,sy+6);
        ctx.lineTo(ex+4,sy+12);ctx.lineTo(ex-6,sy+10);ctx.lineTo(ex-10,sy+2);ctx.lineTo(ex-5,sy-7);
        ctx.closePath();ctx.fill();break;
      case 'baby_arc':
        ctx.fillStyle='#f8b4b4';ctx.beginPath();ctx.ellipse(ex,sy,8,11,0,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#f9c8a0';ctx.beginPath();ctx.arc(ex,sy-13,7,0,Math.PI*2);ctx.fill();
        ctx.strokeStyle='#f9c8a0';ctx.lineWidth=2;
        ctx.beginPath();ctx.moveTo(ex-8,sy-5);ctx.lineTo(ex-14,sy-10);ctx.stroke();
        ctx.beginPath();ctx.moveTo(ex+8,sy-5);ctx.lineTo(ex+14,sy-10);ctx.stroke();break;
      case 'plate_arc':
        ctx.save();ctx.translate(ex,sy);ctx.rotate(e.rotation||0);
        ctx.fillStyle='#f0ede0';ctx.beginPath();ctx.ellipse(0,0,18,5,0,0,Math.PI*2);ctx.fill();
        ctx.strokeStyle='#bbb';ctx.lineWidth=1.5;ctx.beginPath();ctx.ellipse(0,0,18,5,0,0,Math.PI*2);ctx.stroke();
        ctx.restore();
        ctx.fillStyle='#e67e22';ctx.font='11px VT323';ctx.textAlign='center';ctx.fillText('OPA',ex,sy-10);break;
    }
  }

  renderGroundEnt(e, groundScreenY) {
    const ctx = this.ctx, y = groundScreenY, ex = e.x;
    switch (e.type) {
      case 'dumpster':
        ctx.fillStyle='#2d7d2d';ctx.fillRect(ex-24,y-22,48,22);
        ctx.fillStyle='#1a4d1a';ctx.fillRect(ex-24,y-26,48,6);
        ctx.fillStyle='#aaa';ctx.font='13px VT323';ctx.textAlign='center';ctx.fillText('STOP',ex,y-6);break;
      case 'rat_dumpster':
        ctx.fillStyle='#5a3d10';ctx.fillRect(ex-24,y-22,48,22);
        ctx.fillStyle='#3d2a0a';ctx.fillRect(ex-24,y-26,48,6);
        ctx.fillStyle='#e74c3c';ctx.beginPath();ctx.arc(ex-7,y-15,3,0,Math.PI*2);ctx.fill();
        ctx.beginPath();ctx.arc(ex+7,y-15,3,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#e67e22';ctx.font='12px VT323';ctx.textAlign='center';ctx.fillText('RAT',ex,y-2);break;
      case 'hydrant':
        ctx.fillStyle='#c0392b';ctx.fillRect(ex-7,y-18,14,18);ctx.fillRect(ex-12,y-12,24,8);
        ctx.fillStyle='#e74c3c';ctx.fillRect(ex-4,y-22,8,5);
        ctx.fillStyle='#3498db';ctx.font='12px VT323';ctx.textAlign='center';ctx.fillText('UP!',ex,y-28);break;
      case 'subway_grate':
        ctx.fillStyle='#444';ctx.fillRect(ex-20,y-5,40,5);
        for(let i=0;i<6;i++) ctx.fillRect(ex-19+i*7,y-5,3,5);
        ctx.strokeStyle='rgba(241,196,15,0.7)';ctx.lineWidth=1.5;
        for(let i=0;i<3;i++){const sx2=ex-8+i*8;ctx.beginPath();ctx.moveTo(sx2,y-5);ctx.bezierCurveTo(sx2-3,y-15,sx2+3,y-22,sx2,y-30);ctx.stroke();}
        break;
      case 'hotdog_cart':
        ctx.fillStyle='#e74c3c';ctx.fillRect(ex-20,y-28,40,28);
        ctx.fillStyle='#f1c40f';ctx.fillRect(ex-22,y-36,44,10);
        ctx.fillStyle='#fff';ctx.font='10px VT323';ctx.textAlign='center';ctx.fillText('HOT DOG',ex,y-14);
        ctx.fillStyle='#555';
        ctx.beginPath();ctx.arc(ex-12,y,7,0,Math.PI*2);ctx.fill();
        ctx.beginPath();ctx.arc(ex+12,y,7,0,Math.PI*2);ctx.fill();break;
      case 'manhole':
        ctx.fillStyle='#555';ctx.beginPath();ctx.ellipse(ex,y-3,18,5,0,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#333';ctx.beginPath();ctx.ellipse(ex,y-3,13,4,0,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#e74c3c';ctx.font='11px VT323';ctx.textAlign='center';ctx.fillText('TRAP',ex,y-14);break;
      case 'cab_ground':
        ctx.fillStyle='#FFD700';ctx.fillRect(ex-28,y-20,56,20);
        ctx.fillStyle='#87CEEB';ctx.fillRect(ex-23,y-18,20,12);ctx.fillRect(ex+5,y-18,17,12);
        ctx.fillStyle='#333';
        ctx.beginPath();ctx.arc(ex-16,y,7,0,Math.PI*2);ctx.fill();
        ctx.beginPath();ctx.arc(ex+16,y,7,0,Math.PI*2);ctx.fill();break;
      case 'pizza_man': {
        ctx.fillStyle='#d4a574';ctx.beginPath();ctx.arc(ex,y-30,8,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#fff';ctx.fillRect(ex-7,y-22,14,18);
        ctx.strokeStyle='#d4a574';ctx.lineWidth=3;
        ctx.beginPath();ctx.moveTo(ex+7,y-18);ctx.lineTo(ex+18,y-32);ctx.stroke();
        ctx.fillStyle='#f5c842';ctx.beginPath();ctx.arc(ex+20,y-35,8,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#c0392b';ctx.beginPath();ctx.arc(ex+18,y-37,2.5,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#555';ctx.font='10px VT323';ctx.textAlign='center';ctx.fillText('PIZZA!',ex,y-44);break;
      }
      case 'drunk_vomit': {
        const sw=Math.sin(this._frame*0.07)*4;
        ctx.fillStyle='#c49870';ctx.beginPath();ctx.arc(ex+sw,y-30,8,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#6a4a8a';ctx.fillRect(ex+sw-7,y-22,14,18);
        ctx.fillStyle='rgba(100,180,40,0.7)';
        ctx.beginPath();ctx.moveTo(ex+sw,y-25);ctx.lineTo(ex+sw+3,y-22);ctx.lineTo(ex+sw-3,y-22);ctx.closePath();ctx.fill();
        ctx.fillStyle='#555';ctx.font='10px VT323';ctx.textAlign='center';ctx.fillText('BLEURGH',ex,y-44);break;
      }
      case 'stroller_launcher': {
        ctx.fillStyle='#d4a574';ctx.beginPath();ctx.arc(ex-10,y-28,7,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#2c3e50';ctx.fillRect(ex-16,y-21,12,16);
        ctx.fillStyle='#1a1a2a';ctx.fillRect(ex,y-18,22,12);
        ctx.strokeStyle='#555';ctx.lineWidth=1.5;
        ctx.beginPath();ctx.moveTo(ex,y-18);ctx.lineTo(ex-8,y-22);ctx.stroke();
        ctx.fillStyle='#444';
        ctx.beginPath();ctx.arc(ex+4,y,5,0,Math.PI*2);ctx.fill();
        ctx.beginPath();ctx.arc(ex+18,y,5,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#f8b4b4';ctx.beginPath();ctx.arc(ex+11,y-22,5,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#555';ctx.font='10px VT323';ctx.textAlign='center';ctx.fillText('LAUNCH',ex+5,y-36);break;
      }
      case 'greek_grandpa': {
        ctx.fillStyle='#bdc3c7';ctx.beginPath();ctx.arc(ex,y-30,7,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#ecf0f1';ctx.fillRect(ex-7,y-23,14,18);
        ctx.strokeStyle='#bdc3c7';ctx.lineWidth=3;
        ctx.beginPath();ctx.moveTo(ex+7,y-16);ctx.lineTo(ex+18,y-30);ctx.stroke();
        ctx.save();ctx.translate(ex+22,y-33);ctx.rotate((this._frame*0.08)%(Math.PI*2));
        ctx.fillStyle='#f0ede0';ctx.beginPath();ctx.ellipse(0,0,10,3,0,0,Math.PI*2);ctx.fill();
        ctx.restore();
        ctx.fillStyle='#e67e22';ctx.font='10px VT323';ctx.textAlign='center';ctx.fillText('OPA!',ex,y-44);break;
      }
    }
  }

  renderPlayer(x, y, f) {
    const ctx = this.ctx;
    ctx.save(); ctx.translate(x, y);
    // Tilt: positive vy = going up = nose up (negative tilt)
    const tilt = Math.max(-0.42, Math.min(0.42, -f.vy * 0.022));
    ctx.rotate(tilt);

    if (f.flapFlash > 0) { ctx.shadowColor = '#3498db'; ctx.shadowBlur = 20; }

    ctx.fillStyle = '#c49870'; ctx.fillRect(-8, -14, 16, 12);
    ctx.fillStyle = '#d4a574'; ctx.fillRect(-6, -26, 12, 12);
    ctx.fillStyle = '#333'; ctx.fillRect(-4, -22, 3, 3); ctx.fillRect(1, -22, 3, 3);

    if (f.suitId === 'pigeon' || f.suitId === 'eagle') {
      const span = f.suitId === 'eagle' ? 34 : 23;
      const bob  = f.flapFlash > 0 ? -16 : Math.sin(this._frame * 0.18) * 5;
      ctx.fillStyle = f.suitId === 'eagle' ? '#8B4513' : '#bbb';
      ctx.beginPath(); ctx.moveTo(-8, -8); ctx.lineTo(-span, -8 - bob); ctx.lineTo(-span * 0.5, 0); ctx.fill();
      ctx.beginPath(); ctx.moveTo(8, -8);  ctx.lineTo(span, -8 - bob);  ctx.lineTo(span * 0.5, 0); ctx.fill();
    }
    if (f.suitId === 'jetpack') {
      ctx.fillStyle = '#777'; ctx.fillRect(-14, -10, 8, 18); ctx.fillRect(6, -10, 8, 18);
      const fl = f.flapFlash > 0 ? 22 + Math.random() * 10 : 7 + Math.random() * 5;
      ctx.fillStyle = f.flapFlash > 0 ? '#e74c3c' : '#e67e22';
      ctx.beginPath(); ctx.moveTo(-10, 8); ctx.lineTo(-14, 8 + fl); ctx.lineTo(-6, 8); ctx.fill();
      ctx.beginPath(); ctx.moveTo(10, 8);  ctx.lineTo(14, 8 + fl);  ctx.lineTo(6, 8);  ctx.fill();
    }
    if (f.suitId !== 'naked') { ctx.fillStyle = '#7f5a3d'; ctx.beginPath(); ctx.arc(0, -22, 8, Math.PI, 0); ctx.fill(); }
    ctx.fillStyle = '#4a4a4a'; ctx.fillRect(-6, -2, 5, 12); ctx.fillRect(1, -2, 5, 12);
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  renderRat(x, y) {
    const ctx = this.ctx;
    ctx.save(); ctx.translate(x, y + Math.sin(this._frame * 0.3) * 2);
    ctx.fillStyle = '#888'; ctx.beginPath(); ctx.ellipse(0, -8, 14, 9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#999'; ctx.beginPath(); ctx.ellipse(14, -10, 9, 7, 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e74c3c'; ctx.beginPath(); ctx.arc(18, -13, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#c0392b'; ctx.beginPath(); ctx.ellipse(12, -16, 4, 5, -0.4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#777'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-14, -8); ctx.bezierCurveTo(-24, -8, -26, -2, -20, 0); ctx.stroke();
    const lb = Math.sin(this._frame * 0.5) * 4;
    ctx.fillStyle = '#777';
    ctx.fillRect(-8, -1, 4, 6+lb); ctx.fillRect(-2, -1, 4, 6-lb); ctx.fillRect(4, -1, 4, 6+lb); ctx.fillRect(10, -1, 4, 6-lb);
    ctx.restore();
  }

  renderHUD(W, H, f) {
    const ctx = this.ctx;

    // Top-left panel
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, 245, 72);
    ctx.fillStyle = '#fff'; ctx.font = '20px VT323'; ctx.textAlign = 'left';
    ctx.fillText('Distance: ' + Math.floor(f.distance) + ' blocks', 10, 22);

    if (f.ratMode) {
      ctx.fillStyle = '#e74c3c'; ctx.fillText('RAT MODE', 10, 44);
      ctx.fillStyle = '#888'; ctx.font = '16px VT323'; ctx.fillText('Speed: ' + f.ratVx.toFixed(1), 10, 62);
    } else {
      // Flap cooldown bar
      const cdPct = f.flapCooldownMax > 0 ? (1 - f.flapCooldown / f.flapCooldownMax) : 1;
      const bw = 160;
      ctx.fillStyle = '#111'; ctx.fillRect(10, 28, bw, 13);
      ctx.fillStyle = cdPct >= 1 ? '#2ecc71' : '#f39c12';
      ctx.fillRect(10, 28, bw * cdPct, 13);
      ctx.fillStyle = '#ccc'; ctx.font = '14px VT323';
      const fLabel = f.suitId === 'naked'
        ? (cdPct >= 1 ? 'FLAP (weak)' : 'cooling...')
        : (cdPct >= 1 ? 'FLAP READY' : 'FLAP: ' + Math.round(cdPct * 100) + '%');
      ctx.fillText(fLabel, 10, 52);
    }

    if (f.coins > 0) { ctx.fillStyle = '#f1c40f'; ctx.font = '17px VT323'; ctx.fillText('Coins: ' + f.coins, 10, 68); }

    if (f.damage > 0) {
      ctx.fillStyle = f.damage < 40 ? '#f39c12' : '#e74c3c';
      ctx.font = '20px VT323'; ctx.textAlign = 'right';
      ctx.fillText('Damage: ' + Math.floor(f.damage) + '%', W - 10, 22);
    }

    // Turn
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(W/2 - 72, 6, 144, 26);
    ctx.fillStyle = '#d4a574'; ctx.font = '18px VT323'; ctx.textAlign = 'center';
    ctx.fillText('Turn ' + this.ts.currentTurn, W/2, 24);

    // Target borough
    if (this.ts.targetBorough) {
      const tb = TARGET_BOROUGHS.find(b => b.id === this.ts.targetBorough);
      if (tb) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(W/2 - 115, H - 34, 230, 28);
        ctx.fillStyle = tb.color; ctx.font = '18px VT323'; ctx.textAlign = 'center';
        const hs = this.ts.highScores[tb.id];
        const done = this.ts.unlocks.includes(tb.id);
        ctx.fillText((done ? '✓ ' : '') + tb.name + (hs ? ' · best ' + hs : ''), W/2, H - 14);
      }
    }

    if (f.sliding) {
      ctx.fillStyle = 'rgba(241,196,15,0.88)'; ctx.font = '26px VT323'; ctx.textAlign = 'center';
      ctx.fillText('SLIDING', W/2, H * 0.83);
    }

    // Altitude indicator
    if (f.worldY > 150) {
      const zone = f.worldY > 900 ? 'ABOVE CLOUDS' : f.worldY > 400 ? 'CLOUD LAYER' : 'LOW SKY';
      const zoneColor = f.worldY > 900 ? '#9b59b6' : f.worldY > 400 ? '#7ec8e3' : '#d4a574';
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(W - 175, 32, 165, 32);
      ctx.fillStyle = zoneColor; ctx.font = '17px VT323'; ctx.textAlign = 'right';
      ctx.fillText(zone + ' +' + Math.round(f.worldY) + 'm', W - 10, 50);
    }
  }

  // ============================================
  // END OF FLIGHT
  // ============================================

  endFlight() {
    cancelAnimationFrame(this._flightAF);
    document.getElementById('cannon-flight-hud').classList.add('hidden');
    this._tapHandler = null;

    const distance = Math.floor(this.flight.distance);
    const earned   = Math.floor(distance * 0.8);
    this.ts.boroughBucks  += earned;
    this.ts.totalDistance += distance;

    // High score
    const bid = this.ts.targetBorough;
    if (bid) {
      const prev = this.ts.highScores[bid] || 0;
      if (distance > prev) this.ts.highScores[bid] = distance;
    }

    let newUnlock = null;
    const aimed = TARGET_BOROUGHS.find(b => b.id === this.ts.targetBorough);
    if (aimed && distance >= aimed.minBlocks && !this.ts.unlocks.includes(aimed.id)) {
      this.ts.unlocks.push(aimed.id);
      newUnlock = aimed;
    }

    this.flight = null;
    this.showTurnResults(distance, earned, newUnlock);
  }

  showTurnResults(distance, earned, newUnlock) {
    this.showOverlay('cannon-results');
    document.getElementById('cannon-results-distance').textContent = distance;
    document.getElementById('cannon-results-earned').textContent   = earned;
    document.getElementById('cannon-results-total').textContent    = this.ts.boroughBucks;

    const unlockEl = document.getElementById('cannon-results-unlock');
    if (newUnlock) {
      unlockEl.innerHTML = `
        <div class="cannon-unlock-borough" style="border-color:${newUnlock.color};color:${newUnlock.color}">
          UNLOCKED: ${newUnlock.name}
        </div>
        <div class="cannon-unlock-title">${newUnlock.unlock.title}</div>
        <div class="cannon-unlock-text">${newUnlock.unlock.text}</div>`;
      unlockEl.classList.remove('hidden');
    } else { unlockEl.classList.add('hidden'); }

    const allDone = this.ts.unlocks.length === TARGET_BOROUGHS.length;
    document.getElementById('cannon-results-next-label').textContent =
      allDone ? 'Keep flying (you legend)' : 'Upgrade gear';
    document.getElementById('cannon-results-continue').onclick = () => {
      this.ts.currentTurn++;
      this.showUpgradeShop();
    };
  }

  // ============================================
  // UPGRADE SHOP
  // ============================================

  showUpgradeShop() {
    this.showOverlay('cannon-shop');
    this.renderShop();
  }

  renderShop() {
    const ts = this.ts;
    document.getElementById('cannon-shop-bucks').textContent = ts.boroughBucks;
    document.getElementById('cannon-shop-turn').textContent  = `Turn ${ts.currentTurn}`;

    const container = document.getElementById('cannon-shop-upgrades');
    container.innerHTML = '';

    const maxLvl = { strength: 3, accuracy: 3, suit: 3, rocket: 2, bonus: 3 };
    const pbDiv = document.createElement('div'); pbDiv.className = 'cannon-shop-bars';
    ['strength','accuracy','suit','rocket','bonus'].forEach((k, i) => {
      const pct = (ts[k] / maxLvl[k]) * 100;
      const labels = ['Strength','Accuracy','Suit','Rocket','Bonus'];
      pbDiv.innerHTML += `<div class="cannon-feat-row"><div class="cannon-feat-label">${labels[i]}</div><div class="cannon-feat-bar-wrap"><div class="cannon-feat-bar" style="width:${pct}%"></div></div></div>`;
    });
    container.appendChild(pbDiv);

    const cats = [
      { key: 'strength', label: 'Cannon Strength' }, { key: 'accuracy', label: 'Accuracy' },
      { key: 'suit',     label: 'Flight Suit'      }, { key: 'rocket',  label: 'Rocket'    },
      { key: 'bonus',    label: 'Special Bonus'    },
    ];
    cats.forEach(cat => {
      const tiers = CANNON_UPGRADES[cat.key], current = ts[cat.key], next = current + 1;
      const sec = document.createElement('div'); sec.className = 'cannon-shop-section';
      const lbl = document.createElement('div'); lbl.className = 'cannon-shop-cat'; lbl.textContent = cat.label; sec.appendChild(lbl);
      const own = document.createElement('div'); own.className = 'cannon-shop-owned';
      const cur = tiers[current];
      let ownText = 'Equipped: ' + cur.label;
      if (cat.key === 'suit') ownText += ` — force ${cur.flapForce}, ${cur.cooldownFrames}f cooldown`;
      own.textContent = ownText;
      sec.appendChild(own);
      if (next < tiers.length) {
        const tier = tiers[next], can = ts.boroughBucks >= tier.cost;
        const btn = document.createElement('button');
        btn.className = 'menu-option' + (can ? '' : ' cannon-shop-locked'); btn.disabled = !can;
        btn.textContent = `Upgrade: ${tier.label} — $${tier.cost}`;
        if (tier.desc) { const d = document.createElement('span'); d.className = 'cannon-shop-desc'; d.textContent = ` (${tier.desc})`; btn.appendChild(d); }
        btn.onclick = () => { if (ts.boroughBucks >= tier.cost) { ts.boroughBucks -= tier.cost; ts[cat.key] = next; this.renderShop(); } };
        sec.appendChild(btn);
      } else {
        const mx = document.createElement('div'); mx.className = 'cannon-shop-maxed'; mx.textContent = 'Maxed out'; sec.appendChild(mx);
      }
      container.appendChild(sec);
    });

    if (ts.unlocks.length > 0) {
      const uSec = document.createElement('div'); uSec.className = 'cannon-shop-section';
      const uLbl = document.createElement('div'); uLbl.className = 'cannon-shop-cat'; uLbl.textContent = 'Collected'; uSec.appendChild(uLbl);
      ts.unlocks.forEach(id => {
        const b = TARGET_BOROUGHS.find(b => b.id === id); if (!b) return;
        const row = document.createElement('div'); row.className = 'cannon-shop-owned';
        row.innerHTML = `<span style="color:${b.color}">${b.name}:</span> ${b.unlock.title}`;
        uSec.appendChild(row);
      });
      container.appendChild(uSec);
    }

    document.getElementById('cannon-shop-continue').onclick = () => this.showLocationSelect();
    document.getElementById('cannon-shop-continue').textContent = 'Keep flying';
    const exitBtn = document.getElementById('cannon-shop-exit');
    if (exitBtn) exitBtn.onclick = () => this.onComplete({
      boroughBucks: this.ts.boroughBucks,
      unlocks: this.ts.unlocks.slice(),
      totalDistance: this.ts.totalDistance,
    });
  }

  drawWSPNight() {
    const { width: W, height: H } = this.canvas, ctx = this.ctx;
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#080814'); sky.addColorStop(1, '#121228');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    for (let i = 0; i < 80; i++) ctx.fillRect((i * 131.3) % W, (i * 89.7) % (H * 0.65), 1.5, 1.5);
    const aw = 130, ax = W/2 - 65, ay = H * 0.22;
    ctx.fillStyle = '#c8b89a';
    ctx.fillRect(ax, ay+65, 22, 108); ctx.fillRect(ax+aw-22, ay+65, 22, 108);
    ctx.beginPath(); ctx.arc(ax+aw/2, ay+80, aw/2, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#080814'; ctx.beginPath(); ctx.arc(ax+aw/2, ay+80, aw/2-14, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#06060e'; ctx.fillRect(ax+24, ay+65, aw-48, 108);
    ctx.fillStyle = '#141e14'; ctx.fillRect(0, H*0.76, W, H*0.24);
    ctx.fillStyle = '#444'; ctx.fillRect(0, H*0.78, W, 10);
  }
}

let cannonGame = null;
