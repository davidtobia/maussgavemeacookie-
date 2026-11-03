/**
 * THE TRANSPLANT TRAIL - TRAIL GAME ENGINE
 * Canvas-based animation system for the main trail gameplay
 */

class TrailGame {
  constructor(gameState) {
    this.gameState = gameState; // Reference to main game state
    this.canvas = document.getElementById('trail-canvas');
    this.ctx = this.canvas.getContext('2d');

    // Trail state
    this.state = {
      running: false,
      paused: false,
      currentDay: 1,
      currentDate: new Date(2026, this.getStartMonth(), 1),
      landmarkIndex: 0, // Current position in LANDMARKS array
      milesFromLandmark: 0, // Distance traveled since last landmark
      milesPerLandmark: 9, // Distance between landmarks -- was 15, cut down alongside the faster hour-tick above (see update()'s frameCounter comment)
      transportation: 'walk', // Start with walking
      spendingMode: 'trader-joes', // Default to middle option
      vibeWeather: this.randomVibeWeather(),
      lastEventDay: 0,
      animationFrame: 0,
      hoursElapsed: 0
    };

    // Pending callback after event box is dismissed
    this.pendingAfterEvent = null;

    // Animation settings
    this.scrollSpeed = 1;
    this.backgroundOffset = 0;
    this.spriteFrame = 0;
    this.frameCounter = 0;

    // Weather particles (rain/snow/leaves) and street life (pedestrians,
    // passing traffic) -- both lazily populated the first time they're
    // drawn, since canvas size isn't known until setupCanvas() runs.
    this.weatherParticles = [];
    this._weatherParticleKind = null;
    this.streetActors = [];

    this.init();
  }

  getStartMonth() {
    const monthMap = {
      'february': 1,
      'march': 2,
      'april': 3,
      'may': 4,
      'june': 5
    };
    return monthMap[this.gameState.departureMonth] || 4;
  }

  // Was a flat uniform pick across all 6 -- could roll a blizzard in July
  // or an August heat wave in February, completely disconnected from
  // the game's own calendar. Weighted by the actual current month now
  // (0 = Jan same as Date), so real-weather categories only show up
  // anywhere near their real season; the two that aren't season-bound
  // (a major event, the subway just being weird) stay available
  // year-round. `this.state` doesn't exist yet the first time this is
  // called (it's still being constructed), so this falls back to the
  // chosen departure month for that one call.
  seasonalWeatherWeight(id, month) {
    switch (id) {
      case 'blizzard':     return [3, 3, 1, 0, 0, 0, 0, 0, 0, 0, 1, 3][month];
      case 'august':       return [0, 0, 0, 0, 1, 2, 3, 3, 2, 0, 0, 0][month];
      case 'perfect-fall': return [0, 0, 1, 2, 1, 0, 0, 0, 2, 3, 2, 0][month];
      case 'raining':      return [1, 1, 2, 3, 2, 1, 1, 1, 2, 2, 1, 1][month];
      default:              return 1; // major-event, subway-weird -- not seasonal
    }
  }

  randomVibeWeather() {
    const month = this.state ? this.state.currentDate.getMonth() : this.getStartMonth();
    const pool = [];
    VIBE_WEATHER.forEach(w => {
      const weight = Math.max(0, this.seasonalWeatherWeight(w.id, month));
      for (let i = 0; i < weight; i++) pool.push(w.id);
    });
    if (pool.length === 0) return VIBE_WEATHER[0].id;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  getCurrentLandmark() {
    return LANDMARKS[this.state.landmarkIndex];
  }

  getNextLandmark() {
    return LANDMARKS[Math.min(this.state.landmarkIndex + 1, LANDMARKS.length - 1)];
  }

  init() {
    this.setupCanvas();
    this.setupControls();
  }

  // The canvas fills whatever space the HUD leaves it. Listeners are
  // bound once for the page (a new TrailGame is made per run/resume, and
  // each used to stack its own copies) and act on the current trailGame.
  setupCanvas() {
    this.fitCanvas();
    if (TrailGame._bound) return;
    TrailGame._bound = true;
    const fit = () => { if (trailGame) trailGame.fitCanvas(); };
    window.addEventListener('resize', fit);
    if (window.ResizeObserver) new ResizeObserver(fit).observe(this.canvas);
  }

  fitCanvas() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (w && h && (this.canvas.width !== w || this.canvas.height !== h)) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.weatherParticles = [];
    }
  }

  setupControls() {
    if (TrailGame._controlsBound) return;
    TrailGame._controlsBound = true;
    // Space/Enter dismisses a story popup -- only while the trail is the
    // screen you're on, so it never eats keys anywhere else.
    document.addEventListener('keydown', (e) => {
      if (!trailGame || game.state.currentScreen !== 'trail-screen') return;
      if (e.key !== ' ' && e.key !== 'Enter') return;
      if (document.getElementById('trail-event').classList.contains('hidden')) return;
      e.preventDefault();
      trailGame.dismissEvent();
    });
    document.getElementById('trail-event').addEventListener('click', () => {
      if (trailGame && !document.getElementById('trail-event').classList.contains('hidden')) trailGame.dismissEvent();
    });
  }

  dismissEvent() {
    TTAudio.sfx('click');
    const eventBox = document.getElementById('trail-event');
    eventBox.classList.add('hidden');
    this.state.paused = false;
    if (this.pendingAfterEvent) {
      const cb = this.pendingAfterEvent;
      this.pendingAfterEvent = null;
      cb();
    }
  }

  start() {
    const wasRunning = this.state.running;
    this.state.running = true;
    this.state.paused = false;
    this._chipKey = null;
    this.fitCanvas();
    this.updateStatusDisplay();
    if (!wasRunning) this.gameLoop();
  }

  stop() {
    this.state.running = false;
  }

  // ============================================
  // GAME LOOP
  // ============================================

  gameLoop() {
    if (!this.state.running) return;

    // Clear canvas
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    if (!this.state.paused) {
      this.update();
    }

    this.render();

    requestAnimationFrame(() => this.gameLoop());
  }

  update() {
    this.frameCounter++;

    // Update sprite animation frame (every 10 frames)
    if (this.frameCounter % 10 === 0) {
      this.spriteFrame = (this.spriteFrame + 1) % 4;
    }

    // Advance time (every 55 frames = ~0.92 real seconds per game hour).
    // Was 90 frames (~1.5s/hour, ~36 real seconds per game day) -- direct
    // feedback: "the time passes really slow (like the days) and it also
    // takes a long time to travel between the stops... here the
    // mini-games are the draw, not the trail." Combined with
    // milesPerLandmark below, a landmark now takes roughly 2.5-3x less
    // real time at any given transport speed.
    if (this.frameCounter % 55 === 0) {
      this.advanceTime();
    }

    // Scroll speed tied to transport — slow walk, fast cab
    const transport = TRANSPORTATION_MODES.find(m => m.id === this.state.transportation);
    const travelSpeed = transport ? transport.speed : 0.5;
    this.backgroundOffset += travelSpeed * 0.8;
    if (this.backgroundOffset > this.canvas.width) {
      this.backgroundOffset = 0;
    }

    // Check if reached next landmark
    if (this.state.milesFromLandmark >= this.state.milesPerLandmark) {
      this.reachLandmark();
    }

    // Random events (check every day)
    if (this.state.currentDay > this.state.lastEventDay) {
      this.checkRandomEvent();
    }

    this.updateWeatherParticles();
  }

  render() {
    // Render background layers (parallax)
    this.renderBackground();

    // Ambient street life (pedestrians, cabs, a delivery cyclist) --
    // drawn before the player so the player sprite reads as the one
    // thing actually in focus.
    this.renderForeground();

    // Render character/vehicle sprite
    this.renderCharacter();

    // Weather sits on top of everything, like it's between the camera
    // and the whole scene.
    this.renderWeatherEffects();
  }

  // Sky/building/street palette per neighborhood -- was one fixed purple
  // skyline everywhere regardless of which landmark you were actually
  // near. Colors and silhouette shape only (no new copy) -- Midtown runs
  // tall and uniform, the Village/Soho stay low and varied, Williamsburg
  // runs wide and industrial, the Mirage goes full neon.
  landmarkPalette() {
    const palettes = {
      'entry':                 { skyTop: '#232833', skyBottom: '#1c2230', building: '#39404d', street: '#3a3f4a', accent: '#8a93a3' },
      'murray-hill':            { skyTop: '#241d2e', skyBottom: '#1c1624', building: '#5a3f35', street: '#4a3428', accent: '#c98f5a' },
      'midtown':                { skyTop: '#141c33', skyBottom: '#0d1424', building: '#22355c', street: '#2a2f3d', accent: '#8fc8ff' },
      'washington-square-park': { skyTop: '#1c2a24', skyBottom: '#141f1a', building: '#3f5240', street: '#3a3428', accent: '#7ea87e' },
      'union-square':           { skyTop: '#2c1f18', skyBottom: '#1f150f', building: '#6b4226', street: '#4a3020', accent: '#e2882c' },
      'west-village':           { skyTop: '#241f2c', skyBottom: '#191420', building: '#4a3628', street: '#3a2c20', accent: '#c9a05a' },
      'soho':                   { skyTop: '#1f1a1a', skyBottom: '#161212', building: '#5c4230', street: '#403428', accent: '#caa06a' },
      'les':                    { skyTop: '#2a1830', skyBottom: '#1c1022', building: '#7a2f5a', street: '#402038', accent: '#e2622c' },
      'williamsburg':           { skyTop: '#2c1c14', skyBottom: '#1f130c', building: '#8a4a2c', street: '#4a3020', accent: '#d4783a' },
      'mirage':                 { skyTop: '#2a1240', skyBottom: '#180a2a', building: '#5a1a5a', street: '#2a1040', accent: '#e24ac8' },
    };
    return palettes[this.getCurrentLandmark().id] || palettes['entry'];
  }

  renderBackground() {
    const { width, height } = this.canvas;
    const p = this.landmarkPalette();
    const landmark = this.getCurrentLandmark();

    // Sky gradient
    const gradient = this.ctx.createLinearGradient(0, 0, 0, height * 0.6);
    gradient.addColorStop(0, p.skyTop);
    gradient.addColorStop(1, p.skyBottom);
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, width, height * 0.6);

    // Buildings silhouette (parallax layer 1 - slow)
    const tall = landmark.id === 'midtown';
    const low = landmark.id === 'west-village' || landmark.id === 'soho';
    const wide = landmark.id === 'williamsburg';
    const spacing = wide ? 190 : 150;
    const baseW = wide ? 160 : 120;
    for (let i = -1; i < 10; i++) {
      const x = (i * spacing) - (this.backgroundOffset * 0.3);
      const baseHeight = tall ? 190 : low ? 70 : 100;
      const variance = tall ? 30 : low ? 20 : 50;
      const buildingHeight = baseHeight + Math.sin(i * 0.5 + landmark.id.length) * variance;
      this.ctx.fillStyle = p.building;
      this.ctx.fillRect(x, height * 0.4 - buildingHeight, baseW, buildingHeight);
      // Scattered lit windows
      this.ctx.fillStyle = p.accent;
      for (let wy = 10; wy < buildingHeight - 10; wy += 18) {
        for (let wx = 6; wx < baseW - 6; wx += 20) {
          if ((i * 7 + Math.floor(wy) + Math.floor(wx)) % 5 === 0) {
            this.ctx.fillRect(x + wx, height * 0.4 - buildingHeight + wy, 6, 8);
          }
        }
      }
    }

    // Street level (parallax layer 2 - medium)
    this.ctx.fillStyle = p.street;
    this.ctx.fillRect(0, height * 0.6, width, height * 0.4);

    // Street details (parallax layer 3 - fast)
    this.ctx.fillStyle = '#d4a574';
    for (let i = -1; i < 20; i++) {
      const x = (i * 100) - this.backgroundOffset;
      // Street lines
      this.ctx.fillRect(x, height * 0.7, 60, 3);
    }
  }

  // Ambient pedestrians/traffic -- was an empty stub. Positions are a
  // pure function of backgroundOffset (same scrolling approach the
  // buildings/street-lines above already use) rather than tracked,
  // mutated per-frame state, so there's no drift/accumulation to get
  // wrong -- only which actor goes in which slot is randomized once,
  // lazily, the first time this runs.
  ensureStreetActors() {
    if (this.streetActors.length > 0) return;
    const kinds = ['pedestrian', 'pedestrian', 'cab', 'pedestrian', 'delivery-cyclist', 'pedestrian', 'cab', 'pedestrian'];
    this.streetActors = kinds.map(kind => ({
      kind,
      seed: Math.random(),
      color: kind === 'cab' ? (Math.random() < 0.5 ? '#FFD700' : '#2c2c2c') : null,
    }));
  }

  renderForeground() {
    this.ensureStreetActors();
    const { width, height } = this.canvas;
    this.streetActors.forEach((a, i) => {
      const spacing = a.kind === 'pedestrian' ? 140 : 260;
      const factor = a.kind === 'pedestrian' ? 0.9 : 1.5;
      let x = ((i * spacing + a.seed * spacing) - this.backgroundOffset * factor) % (width + spacing * 2);
      if (x < -spacing) x += (width + spacing * 2);
      const y = a.kind === 'pedestrian' ? height * 0.74 : height * 0.66;
      if (a.kind === 'pedestrian') this.drawPedestrianSilhouette(x, y, a);
      else if (a.kind === 'cab') this.drawPassingCab(x, y, a.color);
      else if (a.kind === 'delivery-cyclist') this.drawDeliveryCyclist(x, y, a);
    });
  }

  drawPedestrianSilhouette(x, y, a) {
    const ctx = this.ctx;
    const bob = Math.sin(this.frameCounter * 0.15 + a.seed * 10) * 2;
    ctx.fillStyle = 'rgba(20,16,24,0.55)';
    ctx.beginPath();
    ctx.arc(x, y - 34 + bob, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(x - 4, y - 29 + bob, 8, 16);
    ctx.fillRect(x - 4, y - 13 + bob, 3, 12);
    ctx.fillRect(x + 1, y - 13 + bob, 3, 12);
  }

  drawPassingCab(x, y, color) {
    const ctx = this.ctx;
    ctx.fillStyle = color || '#FFD700';
    ctx.fillRect(x - 22, y - 12, 44, 16);
    ctx.fillStyle = '#111';
    ctx.fillRect(x - 16, y - 20, 32, 10);
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath(); ctx.arc(x - 14, y + 4, 4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 14, y + 4, 4, 0, Math.PI * 2); ctx.fill();
  }

  drawDeliveryCyclist(x, y, a) {
    const ctx = this.ctx;
    const bob = Math.sin(this.frameCounter * 0.2 + a.seed * 10) * 1.5;
    ctx.strokeStyle = 'rgba(20,16,24,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x - 8, y + 6, 6, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(x + 8, y + 6, 6, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 8, y + 6); ctx.lineTo(x, y - 6 + bob); ctx.lineTo(x + 8, y + 6);
    ctx.stroke();
    ctx.fillStyle = '#3a6ea5';
    ctx.fillRect(x - 4, y - 14 + bob, 8, 8);
  }

  // ============================================
  // WEATHER VISUALS
  // ============================================
  // Was numbers-only (speedMod/vibeMod) with zero visual reflection of
  // what the weather actually was. Falling particles for rain/snow/fall
  // leaves, a shimmer wash for heat -- purely visual, no new copy.

  weatherKind() {
    switch (this.state.vibeWeather) {
      case 'raining':      return 'rain';
      case 'blizzard':      return 'snow';
      case 'perfect-fall':  return 'leaves';
      case 'august':        return 'heat';
      default:               return null; // major-event / subway-weird -- not a visual weather state
    }
  }

  ensureWeatherParticles() {
    const kind = this.weatherKind();
    if (this._weatherParticleKind === kind && (this.weatherParticles.length > 0 || !kind)) return;
    this._weatherParticleKind = kind;
    this.weatherParticles = [];
    if (!kind || kind === 'heat') return;
    const { width, height } = this.canvas;
    const w = width || 400, h = height || 400;
    const count = kind === 'snow' ? 55 : kind === 'rain' ? 90 : 16;
    for (let i = 0; i < count; i++) {
      this.weatherParticles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        speed: kind === 'rain' ? 8 + Math.random() * 6 : kind === 'snow' ? 1 + Math.random() * 1.5 : 0.6 + Math.random() * 0.8,
        drift: kind === 'snow' ? (Math.random() - 0.5) * 0.6 : kind === 'leaves' ? (Math.random() - 0.5) * 1.2 : 0,
        len: kind === 'rain' ? 10 + Math.random() * 10 : 0,
        size: kind === 'snow' ? 1.5 + Math.random() * 2 : kind === 'leaves' ? 3 + Math.random() * 2 : 0,
        angle: Math.random() * Math.PI * 2,
      });
    }
  }

  updateWeatherParticles() {
    const kind = this.weatherKind();
    this.ensureWeatherParticles();
    if (!kind || kind === 'heat') return;
    const { width, height } = this.canvas;
    this.weatherParticles.forEach(p => {
      p.y += p.speed;
      p.x += p.drift;
      if (kind === 'leaves') p.angle += 0.02;
      if (p.y > height) { p.y = -10; p.x = Math.random() * width; }
      if (p.x > width) p.x = 0;
      if (p.x < 0) p.x = width;
    });
  }

  renderWeatherEffects() {
    const kind = this.weatherKind();
    if (!kind) return;
    this.ensureWeatherParticles();
    const { width, height } = this.canvas;
    const ctx = this.ctx;

    if (kind === 'rain') {
      ctx.strokeStyle = 'rgba(180,200,230,0.5)';
      ctx.lineWidth = 1.5;
      this.weatherParticles.forEach(p => {
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - 3, p.y + p.len);
        ctx.stroke();
      });
    } else if (kind === 'snow') {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      this.weatherParticles.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      });
      // Low-visibility haze
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(0, 0, width, height);
    } else if (kind === 'leaves') {
      ctx.fillStyle = '#c96a2e';
      this.weatherParticles.forEach(p => {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      });
    } else if (kind === 'heat') {
      ctx.fillStyle = 'rgba(255,150,60,0.07)';
      ctx.fillRect(0, height * 0.5, width, height * 0.5);
    }
  }

  renderCharacter() {
    const { width, height } = this.canvas;
    const x = width / 2 - 30;
    const y = height * 0.65;

    // Different sprites based on transportation mode. This switch used to
    // check for 'bike'/'uber', but TRANSPORTATION_MODES (trail-data.js)
    // actually uses 'bank-bike'/'electric-bike' and 'yellow-cab'/'app-car'/
    // 'own-car' -- none of those ever matched, so every mode except walk
    // and subway silently fell through to the walking sprite. Picking a
    // faster transport had zero visual payoff. Fixed to the real ids, and
    // renderCar() now takes a color so a cab/app car/personal car don't
    // all look like the same yellow taxi.
    switch(this.state.transportation) {
      case 'walk':
        this.renderWalkingPerson(x, y);
        break;
      case 'bank-bike':
      case 'electric-bike':
        this.renderBiker(x, y);
        break;
      case 'subway':
        this.renderSubwayIcon(x, y);
        break;
      case 'yellow-cab':
        this.renderCar(x, y, '#FFD700');
        break;
      case 'app-car':
        this.renderCar(x, y, '#2c2c2c');
        break;
      case 'own-car':
        this.renderCar(x, y, '#7f8c8d');
        break;
      case 'showtime-express':
        this.renderShowtimeExpress(x, y);
        break;
      case 'pogo-stick':
        this.renderPogoStick(x, y);
        break;
      default:
        this.renderWalkingPerson(x, y);
    }
  }

  getOutfitConfig(inventory) {
    // Priority: most expensive / prestigious item wins
    if (inventory['chanel']          > 0) return { top: '#111',    bottom: '#111',    label: 'chanel'         };
    if (inventory['rag-and-bone']    > 0) return { top: '#2c3e50', bottom: '#1a252f', label: 'rag-and-bone'   };
    if (inventory['todd-snyder']     > 0) return { top: '#5d4e37', bottom: '#3d3320', label: 'todd-snyder'    };
    if (inventory['aritzia']         > 0) return { top: '#c9b8a8', bottom: '#a09080', label: 'aritzia'        };
    if (inventory['patagonia-vest']  > 0) return { top: '#4a5568', bottom: '#4a5568', label: 'patagonia-vest', vest: '#2d6a4f' };
    if (inventory['thrift']          > 0) return { top: '#c0392b', bottom: '#8e44ad', label: 'thrift'         };
    if (inventory['scotch-and-soda'] > 0) return { top: '#2980b9', bottom: '#2471a3', label: 'scotch-and-soda' };
    if (inventory['allsaints']       > 0) return { top: '#2d2d2d', bottom: '#1a1a1a', label: 'allsaints'      };
    if (inventory['bonobos']         > 0) return { top: '#2e86c1', bottom: '#c4a862', label: 'bonobos'        };
    if (inventory['zara']            > 0) return { top: '#e91e63', bottom: '#c2185b', label: 'zara'           };
    if (inventory['gap']             > 0) return { top: '#1565c0', bottom: '#0d47a1', label: 'gap'            };
    return { top: '#d4a574', bottom: '#b8935a', label: null };
  }

  renderWalkingPerson(x, y) {
    const ctx = this.ctx;
    const inv = this.gameState.inventory;
    const outfit = this.getOutfitConfig(inv);
    const hasZyn = (inv['zyn'] || 0) > 0;
    const skin = this.spriteFrame % 2 === 0 ? '#d4a574' : '#c49464';
    const legOffset = this.spriteFrame % 2 === 0 ? 5 : -5;

    // Head
    ctx.fillStyle = skin;
    ctx.fillRect(x + 20, y - 60, 20, 20);

    // Minimal face (eyes)
    ctx.fillStyle = '#3d2b1f';
    ctx.fillRect(x + 24, y - 54, 3, 3);
    ctx.fillRect(x + 33, y - 54, 3, 3);

    // Zyn cheek bulge (lower right side of face)
    if (hasZyn) {
      ctx.fillStyle = '#c8a070';
      ctx.beginPath();
      ctx.ellipse(x + 37, y - 46, 5, 4, 0.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Hair
    ctx.fillStyle = '#5d4037';
    ctx.fillRect(x + 20, y - 62, 20, 5);

    // Body (base shirt / pants)
    ctx.fillStyle = outfit.top;
    ctx.fillRect(x + 15, y - 40, 30, 20); // torso
    ctx.fillStyle = outfit.bottom;
    ctx.fillRect(x + 15, y - 20, 30, 10); // lower body

    // --- Brand-specific overlays ---

    if (outfit.label === 'chanel') {
      // White collar
      ctx.fillStyle = '#f0ece4';
      ctx.fillRect(x + 22, y - 40, 16, 4);
      // White cuffs
      ctx.fillRect(x + 14, y - 24, 4, 4);
      ctx.fillRect(x + 42, y - 24, 4, 4);
    }

    if (outfit.label === 'patagonia-vest') {
      // Green quilted vest over the shirt
      ctx.fillStyle = outfit.vest;
      ctx.fillRect(x + 17, y - 38, 26, 22);
      // Quilting horizontal lines
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fillRect(x + 17, y - 31, 26, 1);
      ctx.fillRect(x + 17, y - 23, 26, 1);
      // Vest opening (V-neck center gap)
      ctx.fillStyle = outfit.top;
      ctx.fillRect(x + 27, y - 38, 6, 14);
    }

    if (outfit.label === 'scotch-and-soda') {
      // Checkered pattern on torso
      ctx.fillStyle = '#1a5276';
      for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 2; col++) {
          if ((row + col) % 2 === 0) {
            ctx.fillRect(x + 15 + col * 15, y - 40 + row * 10, 15, 10);
          }
        }
      }
    }

    if (outfit.label === 'allsaints') {
      // Diagonal zipper line
      ctx.fillStyle = '#666';
      for (let i = 0; i < 6; i++) {
        ctx.fillRect(x + 27 + i, y - 40 + i * 3, 2, 2);
      }
    }

    if (outfit.label === 'gap') {
      // White chest stripe
      ctx.fillStyle = '#fff';
      ctx.fillRect(x + 20, y - 32, 20, 3);
    }

    if (outfit.label === 'thrift') {
      // Mismatched pocket square
      ctx.fillStyle = '#f1c40f';
      ctx.fillRect(x + 18, y - 38, 8, 8);
    }

    if (outfit.label === 'todd-snyder') {
      // Button placket
      ctx.fillStyle = '#7a6548';
      ctx.fillRect(x + 29, y - 38, 2, 18);
      ctx.fillStyle = '#8a7558';
      for (let b = 0; b < 3; b++) ctx.fillRect(x + 28, y - 35 + b * 6, 4, 2);
    }

    // Legs
    ctx.fillStyle = outfit.bottom;
    ctx.fillRect(x + 15, y - 10, 10, 20);
    ctx.fillRect(x + 35 + legOffset, y - 10, 10, 20);

    // Shoes
    ctx.fillStyle = '#2c2c2c';
    ctx.fillRect(x + 13, y + 10, 13, 5);
    ctx.fillRect(x + 33 + legOffset, y + 10, 13, 5);

    // Suitcase (right hand)
    ctx.fillStyle = '#8B4513';
    ctx.fillRect(x + 50, y - 25, 15, 20);
    ctx.fillStyle = '#6d3510';
    ctx.fillRect(x + 51, y - 28, 13, 4);

    // Zyn tin (left hand, circular)
    if (hasZyn) {
      ctx.fillStyle = '#2980b9';
      ctx.beginPath();
      ctx.ellipse(x + 8, y - 12, 6, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ecf0f1';
      ctx.beginPath();
      ctx.ellipse(x + 8, y - 13, 5, 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#bdc3c7';
      ctx.beginPath();
      ctx.ellipse(x + 8, y - 13, 5, 2, 0, 0, Math.PI);
      ctx.fill();
    }

    // Gun (right hip, tucked in waistband)
    if ((inv['gun'] || 0) > 0) {
      ctx.fillStyle = '#222';
      ctx.fillRect(x + 44, y - 20, 5, 9);  // grip
      ctx.fillRect(x + 44, y - 22, 11, 4); // slide / barrel
      ctx.fillStyle = '#444';
      ctx.fillRect(x + 45, y - 21, 9, 2);  // slide detail
      ctx.fillStyle = '#111';
      ctx.fillRect(x + 54, y - 21, 2, 3);  // barrel tip
    }

    // Cocaine (small white baggie in breast pocket)
    if ((inv['cocaine'] || 0) > 0) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(x + 17, y - 38, 7, 9);  // baggie body
      ctx.fillStyle = '#ddd';
      ctx.fillRect(x + 18, y - 39, 5, 3);  // twist top
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillRect(x + 19, y - 36, 2, 5);  // shine
    }

    // Adderall (orange pill bottle, other breast pocket) -- was
    // purchasable in the store for real money and had zero payoff,
    // cosmetic or otherwise, unlike zyn/gun/cocaine right above it.
    if ((inv['adderall'] || 0) > 0) {
      ctx.fillStyle = '#e2822c';
      ctx.fillRect(x - 24, y - 38, 6, 9);   // bottle body
      ctx.fillStyle = '#f0e6d4';
      ctx.fillRect(x - 24, y - 40, 6, 3);   // cap
    }
  }

  renderBiker(x, y) {
    this.ctx.fillStyle = '#d4a574';
    // Person on bike
    this.ctx.fillRect(x + 20, y - 60, 15, 15); // Head
    this.ctx.fillRect(x + 15, y - 45, 25, 20); // Body leaning forward

    // Bike
    this.ctx.fillStyle = '#555';
    this.ctx.beginPath();
    this.ctx.arc(x + 10, y, 12, 0, Math.PI * 2); // Front wheel
    this.ctx.arc(x + 45, y, 12, 0, Math.PI * 2); // Back wheel
    this.ctx.fill();
    // Frame
    this.ctx.strokeStyle = '#555';
    this.ctx.lineWidth = 3;
    this.ctx.beginPath();
    this.ctx.moveTo(x + 10, y);
    this.ctx.lineTo(x + 28, y - 30);
    this.ctx.lineTo(x + 45, y);
    this.ctx.stroke();
  }

  // A subway car up on an elevated track, and in its shadow on the
  // ground underneath, three breakdancers going: a headspin, a windmill,
  // a freeze.
  renderShowtimeExpress(x, y) {
    const ctx = this.ctx, f = this.frameCounter;
    const tx = x - 60, ty = y - 118;
    // the shadow it throws on the ground
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(tx - 6, y - 8, 182, 10);
    // el structure: deck and two pillars
    ctx.fillStyle = '#4a4f5a';
    ctx.fillRect(tx - 10, ty + 44, 190, 8);
    ctx.fillRect(tx + 2, ty + 52, 8, y - ty - 52);
    ctx.fillRect(tx + 160, ty + 52, 8, y - ty - 52);
    // dancers, silhouetted, with a faint outline so they read on any ground
    const sil = (fn) => {
      ctx.save(); ctx.strokeStyle = 'rgba(255,220,160,0.55)'; ctx.lineWidth = 3;
      ctx.fillStyle = '#0b0b0b'; fn(true); ctx.restore();
      ctx.save(); ctx.fillStyle = '#0b0b0b'; fn(false); ctx.restore();
    };
    const box = (outline, x0, y0, w, h) => outline ? ctx.strokeRect(x0, y0, w, h) : ctx.fillRect(x0, y0, w, h);
    const head = (outline, hx, hy) => { ctx.beginPath(); ctx.arc(hx, hy, 5, 0, Math.PI * 2); outline ? ctx.stroke() : ctx.fill(); };
    const d1 = tx + 40, d2 = tx + 85, d3 = tx + 130;
    // headspin: upside down, legs scissoring round
    sil((o) => { head(o, d1, y - 5); ctx.translate(d1, y - 10); ctx.rotate(f * 0.35); box(o, -3, -18, 6, 18); box(o, -14, -21, 28, 4); });
    // windmill: body rolling, legs sweeping
    sil((o) => { ctx.translate(d2, y - 8); ctx.rotate(Math.sin(f * 0.2) * 1.2); box(o, -14, -4, 28, 7); box(o, 10, -18 + Math.sin(f * 0.4) * 6, 5, 14); head(o, -16, 0); });
    // freeze: one-hand stand, legs kicked out, popping between two poses
    const pose = Math.floor(f / 24) % 2;
    sil((o) => { box(o, d3 - 2, y - 18, 5, 18); box(o, d3 - (pose ? 18 : 2), y - 28, 20, 6); head(o, d3 + (pose ? -6 : 10), y - 22); });
    // the car
    ctx.fillStyle = '#c9ced6'; ctx.fillRect(tx, ty, 170, 44);
    ctx.fillStyle = '#9aa1ab'; ctx.fillRect(tx, ty + 38, 170, 6);
    ctx.fillStyle = '#ff6319'; ctx.fillRect(tx, ty + 30, 170, 5);
    ctx.fillStyle = '#2b3440';
    for (let i = 0; i < 5; i++) ctx.fillRect(tx + 10 + i * 32, ty + 8, 22, 16);
    // someone flipping past the windows, showtime-style
    ctx.fillStyle = '#d4a574';
    const wi = Math.floor(f / 18) % 5;
    ctx.fillRect(tx + 16 + wi * 32, ty + 12 + (f % 18 < 9 ? 0 : 4), 10, 8);
    ctx.fillStyle = '#ff6319';
    ctx.beginPath(); ctx.arc(tx + 160, ty + 16, 7, 0, Math.PI * 2); ctx.fill();
  }

  // Bouncing along on a pogo stick.
  renderPogoStick(x, y) {
    const ctx = this.ctx;
    const b = Math.abs(Math.sin(this.frameCounter * 0.22)) * 34;
    const px = x + 30, base = y - b;
    // stick and spring
    ctx.strokeStyle = '#444'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(px, base - 70); ctx.lineTo(px, base - 18); ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i <= 6; i++) ctx.lineTo(px + (i % 2 ? 5 : -5), base - 18 + i * (18 - b * 0.25) / 6);
    ctx.stroke();
    ctx.fillStyle = '#e8402c'; ctx.fillRect(px - 14, base - 72, 28, 4); // handlebar
    ctx.fillRect(px - 12, base - 26, 24, 3);                             // foot pegs
    // rider
    ctx.fillStyle = '#d4a574';
    ctx.fillRect(px - 7, base - 92, 14, 14);      // head
    ctx.fillRect(px - 10, base - 78, 20, 32);     // body
    ctx.fillRect(px - 9, base - 46, 6, 20);       // legs
    ctx.fillRect(px + 3, base - 46, 6, 20);
    // ground shadow shrinks as you go up
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(px, y, 16 - b * 0.2, 4, 0, 0, Math.PI * 2); ctx.fill();
  }

  renderSubwayIcon(x, y) {
    // Subway circle icon
    this.ctx.fillStyle = '#FF6319'; // MTA orange
    this.ctx.beginPath();
    this.ctx.arc(x + 30, y - 30, 30, 0, Math.PI * 2);
    this.ctx.fill();

    // Letter (L train)
    this.ctx.fillStyle = '#fff';
    this.ctx.font = 'bold 40px VT323';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('L', x + 30, y - 15);
  }

  renderCar(x, y, color = '#FFD700') {
    // Simple car (top-down view)
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x, y - 40, 60, 35);

    // Windows
    this.ctx.fillStyle = '#87CEEB';
    this.ctx.fillRect(x + 5, y - 35, 25, 25);
    this.ctx.fillRect(x + 35, y - 35, 20, 25);

    // Wheels
    this.ctx.fillStyle = '#333';
    this.ctx.fillRect(x - 5, y - 35, 8, 12);
    this.ctx.fillRect(x - 5, y - 15, 8, 12);
    this.ctx.fillRect(x + 57, y - 35, 8, 12);
    this.ctx.fillRect(x + 57, y - 15, 8, 12);
  }

  // ============================================
  // TIME & PROGRESSION
  // ============================================

  // Real-world asymmetry: snow mostly slows street traffic, not trains
  // running underground; rain is worse on a bike than in a cab; heat
  // wears out a walk or a bike ride, not a ride with AC; a "subway being
  // weird" day is specifically bad for the subway and nothing else.
  // Returns null for weather that doesn't have this kind of asymmetry
  // (perfect fall, a major event) so advanceTime() falls back to that
  // weather's own flat speedMod.
  weatherTransportMod(weatherId, transportId) {
    const isSubway = transportId === 'subway';
    const isWalkBike = transportId === 'walk' || transportId === 'bank-bike' || transportId === 'electric-bike';
    const isCar = transportId === 'yellow-cab' || transportId === 'app-car' || transportId === 'own-car';
    switch (weatherId) {
      case 'blizzard':
        if (isSubway) return 0.95;
        if (isWalkBike) return 0.35;
        if (isCar) return 0.4;
        return 0.6;
      case 'raining':
        if (isSubway) return 1.0;
        if (isWalkBike) return 0.7;
        if (isCar) return 0.85;
        return 0.85;
      case 'august':
        if (isSubway) return 0.9;
        if (isWalkBike) return 0.65;
        if (isCar) return 0.9;
        return 0.8;
      case 'subway-weird':
        return isSubway ? 0.4 : 1.0;
      default:
        return null;
    }
  }

  advanceTime() {
    // Advance by 1 hour
    this.state.hoursElapsed++;
    this.state.currentDate.setHours(this.state.currentDate.getHours() + 1);

    // Check if it's a new day
    if (this.state.currentDate.getHours() === 0) {
      this.state.currentDay++;
      this.onNewDay();
    }

    // Update miles traveled based on transportation mode
    const transport = TRANSPORTATION_MODES.find(m => m.id === this.state.transportation);
    const speed = transport ? transport.speed : 1;

    // Apply vibe weather modifier -- was one flat speedMod hitting every
    // transportation mode equally, so a blizzard slowed the subway
    // exactly as much as a cab. Direct correction: "if it's snowing the
    // car goes slow and the subway still works." weatherTransportMod()
    // gives the weather types with a real asymmetry (blizzard, rain,
    // heat, the subway-specific "weird" day) a per-mode multiplier;
    // anything it returns null for (perfect fall, a major event -- both
    // uniform by nature) falls back to the flat speedMod already on the
    // weather entry.
    const weather = VIBE_WEATHER.find(w => w.id === this.state.vibeWeather);
    const perModeMod = weather ? this.weatherTransportMod(weather.id, this.state.transportation) : null;
    const speedMod = perModeMod != null ? perModeMod : (weather ? weather.speedMod : 1);

    const milesThisHour = speed * speedMod;
    this.state.milesFromLandmark += milesThisHour;

    // Hourly costs (transportation) — checking first, then Sapphire.
    // Uber Credit (store.js, $100/unit) was purchasable and did nothing
    // -- an app-car ride never actually checked for it. Now it offsets
    // app-car's hourly cost directly instead of charging Sapphire, and
    // drains proportionally (this hour's cost as a fraction of $100)
    // until it runs out, at which point normal charging resumes.
    if (transport && transport.cost > 0) {
      const hourlyCost = transport.cost / 24;
      const credit = this.gameState.inventory['uber-credit'] || 0;
      if (this.state.transportation === 'app-car' && credit > 0) {
        this.gameState.inventory['uber-credit'] = Math.max(0, credit - hourlyCost / 100);
      } else {
        this.chargeExpense(hourlyCost, 'chaseSapphire');
      }
    }

    this.updateStatusDisplay();
  }

  onNewDay() {
    // Daily expenses (spending mode)
    this.dailyExpenses();

    // Check aura
    this.checkAura();

    // Dad's AMEX: if maxed out and not already cancelled, trigger the event
    if (!this.gameState.dadsAmexCancelled && this.gameState.balances.dadsAmex <= 0) {
      this.gameState.dadsAmexCancelled = true;
      this.showEvent(`Your dad just called. "I'm cancelling the card. You need to figure this out yourself." The AMEX is dead.`);
    }

    // Change weather occasionally (20% chance). VIBE_WEATHER (trail-data.js)
    // defines a vibeMod (and, for august heat, a healthMod) on every entry
    // -- neither was ever read anywhere, so weather only ever affected
    // travel speed, not the "vibe" it's named for. Applied once, right as
    // the weather actually turns, rather than every day it's in effect --
    // a continuous daily drain on top of the existing -1/day decay and
    // spending-mode vibeEffect would compound hard over a multi-day
    // blizzard; a one-time jolt when it changes reads as "the weather
    // just turned bad" without threatening to snowball a run.
    if (Math.random() < 0.2) {
      const prevWeather = this.state.vibeWeather;
      const newWeather = this.randomVibeWeather();
      if (newWeather !== prevWeather) {
        this.state.vibeWeather = newWeather;
        const w = VIBE_WEATHER.find(x => x.id === newWeather);
        if (w) this.gameState.aura += (w.vibeMod || 0) + (w.healthMod || 0);
        const mode = TRANSPORTATION_MODES.find(m => m.id === this.state.transportation);
        if (mode && mode.unavailableWeather && mode.unavailableWeather.includes(newWeather)) {
          this.state.transportation = 'walk';
          this.toast(`Weather: ${w.name}. No ${mode.name} today -- walking.`);
        } else if (w) {
          this.toast(`Weather: ${w.name}`);
        }
      }
    }
  }

  reachLandmark() {
    // Arrived at next landmark
    this.state.paused = true;
    this.state.landmarkIndex++;
    this.state.milesFromLandmark = 0;

    // Save if this is a chapter boundary (ch3 = Union Square, ch4 = LES)
    this.checkChapterSave();

    const landmark = this.getCurrentLandmark();
    TTAudio.sfx('arrive');

    // The heist trigger was an hour/money-based timer layered with
    // three separate flags (wisemenJoined, wiseEricsPitched,
    // wisemenJoinedAtHour) -- too many moving parts, and it kept finding
    // new ways to fail (a stale wisemenJoinedAtHour after a restart, a
    // stuck wiseEricsPitched from an abandoned session). Direct
    // correction, and this is now literally what the code does: "it
    // ends, you walk a little, then the heist." The very next landmark
    // you reach after the wisemen join IS the trigger -- no timer, no
    // money threshold, nothing else that can drift out of sync. The
    // williamsburg/mirage check right after is a redundant last-resort
    // backstop only -- it should never actually be the one that fires.
    // Also requires landmarkIndex > 3 (past Washington Square Park) --
    // found live: "I think this version of the game skipped the cannon
    // scene." Root cause was worse than just cannon -- if wisemenJoined
    // is ever true this early (stale save data, or any future bug),
    // this check alone would fire at the very first landmark reached
    // (Murray Hill), hijacking what should have been the apartment hunt
    // and routing straight into the heist before apartment hunt, bodega,
    // AND cannon ever ran. wisemenJoined can only ever become
    // legitimately true through the cannon game's own completion, which
    // can't happen before reaching WSP (landmarkIndex 3) -- so gating on
    // landmark position can't block any real trigger, only the buggy
    // premature one. Reproduced and verified fixed with a headless
    // simulation before shipping this, not just reasoned about.
    if (this.gameState.wisemenJoined && !this.gameState.heistDone && !this.gameState.wiseEricsPitched && this.state.landmarkIndex > 3) {
      this.gameState.wiseEricsPitched = true;
      this.showWiseEricsPitch();
      return;
    }
    if ((landmark.id === 'williamsburg' || landmark.id === 'mirage') && !this.gameState.heistDone) {
      this.gameState.wisemenJoined = true;
      this.gameState.wiseEricsPitched = true;
      this.showWiseEricsPitch();
      return;
    }

    // Handle different landmark types. 'fort' and the generic fallback
    // used to always show a mandatory tap-to-dismiss popup for pure
    // flavor text with zero unique info beyond what the status bar's
    // own "next landmark" readout already shows. Harmless at the old
    // pacing (landmarks were rare) -- but landmarks come 2.5-3x more
    // often now (see update()'s frameCounter/milesPerLandmark comments),
    // so this turned into "you have to tap to continue after every
    // landmark." reachLandmark() pauses unconditionally at the top of
    // this method; these two branches now explicitly undo that instead
    // of relying on a popup dismissal to do it, so the trail just keeps
    // walking through them.
    if (landmark.id === 'murray-hill') {
      this.apartmentHunt();
    } else if (landmark.id === 'midtown' && this.gameState.bodegaDone) {
      this.showRushOffer();
    } else if (landmark.id === 'washington-square-park') {
      this.showEvent('You arrive at Washington Square Park. Three figures are waiting by the arch.', () => this.startCannonGame());
    } else if (landmark.type === 'fort') {
      this.state.paused = false;
    } else if (landmark.type === 'destination') {
      this.reachDestination();
    } else {
      this.state.paused = false;
    }
  }

  apartmentHunt() {
    this.stop();
    game.showScreen('apartment-hunt');

    // Setup apartment hunting options
    document.querySelectorAll('#apartment-hunt .menu-option').forEach(btn => {
      btn.onclick = () => {
        const apartmentType = btn.dataset.apartment;
        this.resolveApartmentHunt(apartmentType);
      };
    });
  }

  resolveApartmentHunt(apartmentType) {
    const apartments = {
      'railroad': {
        cost: 1100,
        brokerFee: 0,
        auraEffect: -8,
        successRate: 0.7,
        failText: 'Listing already taken.',
        successText: 'You got it.'
      },
      'subdivision': {
        cost: 1400,
        brokerFee: 0,
        auraEffect: -12,
        successRate: 0.5,
        failText: 'Someone else got it.',
        successText: 'You signed the lease.'
      },
      'studio': {
        cost: 2200,
        brokerFee: 0,
        auraEffect: 0,
        successRate: 0.3,
        failText: 'Too competitive. They went with someone else.',
        successText: 'You got the studio.'
      },
      'one-bed': {
        cost: 3200,
        brokerFee: 3200,
        auraEffect: 10,
        successRate: 0.9,
        failText: 'They want higher income verification.',
        successText: 'You secured it.'
      },
      'penthouse': {
        cost: 8500,
        brokerFee: 8500,
        auraEffect: 25,
        successRate: 1.0,
        successText: 'Easy.',
        failText: '' // Can't fail
      }
    };

    const apt = apartments[apartmentType];
    if (!apt) return;

    // Roll for success
    const success = Math.random() < apt.successRate;

    if (success) {
      // Rent goes on BILT — can go negative, that's the joke
      const totalCost = apt.cost + apt.brokerFee;
      this.gameState.balances.bilt -= totalCost;
      this.gameState.aura += apt.auraEffect;
      game.showScreen('trail-screen');
      this.showEvent(apt.successText, () => this.startBodegaGame());
    } else {
      this.state.currentDay += 1;
      this.gameState.aura -= 5;
      game.showScreen('trail-screen');
      this.showEvent(apt.failText, () => this.apartmentHunt());
    }
  }

  startBodegaGame() {
    this.stop();
    game.showScreen('bodega-game');
    bodegaGame = new BodegaGame(this.gameState, (earned, card) => {
      // a vehicle earned on the report card is your ride from here
      if (card && card.reward) this.state.transportation = card.reward.id;
      // Save chapter 2 checkpoint after bodega completes
      this.gameState.bodegaDone = true;
      game.saveChapter(2, this.getTrailStateSnapshot());
      game.showScreen('trail-screen');
      this.start();
    });
    bodegaGame.init();
  }

  startCannonGame() {
    this.stop();
    game.showScreen('cannon-game');
    cannonGame = new CannonGame(this.gameState, (result) => {
      // Was crediting checkingAccount 1:1 -- between this and bodega's
      // score doing the same thing, a well-played cannon run alone could
      // put a player comfortably above the heist trigger
      // (checkingAccount <= 150) for the rest of the game. That's
      // backwards: nobody is supposed to reach the Mirage without the
      // heist -- running out of money is the intended path, not an edge
      // case, and it's supposed to happen shortly after this. Borough
      // Bucks are a score now, not spendable cash.
      if (result && result.boroughBucks) {
        this.gameState.boroughBucks = (this.gameState.boroughBucks || 0) + result.boroughBucks;
      }
      // wisemenJoined has to be set before the chapter-3 snapshot below,
      // not after -- saveChapter() reads gameState synchronously, so a
      // save taken first would freeze wisemenJoined: false into that
      // checkpoint even on a run where the wisemen actually did join,
      // and resuming chapter 3 later would silently lose it (and with
      // it, any chance of the heist ever triggering for that resumed
      // run).
      if (result && result.wisemenJoined) {
        this.gameState.wisemenJoined = true;
      }
      // Save chapter 3 checkpoint after cannon game completes
      game.saveChapter(3, this.getTrailStateSnapshot());
      game.showScreen('trail-screen');
      if (result && result.wisemenJoined) {
        this.showEvent("Big Tony, Ruhul, and Dmitri fall in step behind you. You've earned New York.", () => this.start());
      } else {
        this.start();
      }
    });
    cannonGame.init();
  }

  // ============================================
  // THE WISE ERICS' MONEY-MAKING SCHEME
  // ============================================

  startHeistGame() {
    this.stop();
    game.showScreen('heist-game');
    heistGame = new HeistGame(this.gameState, (result) => {
      // Whatever survived the arrest is real money, same as the cannon game's
      // Borough Bucks.
      if (result && result.heistCash) {
        this.gameState.checkingAccount += result.heistCash;
      }
      this.gameState.heistDone = true;
      if (result) this.gameState.heistAssignments = result.assignments;
      // The heist (maze + floor + getaway, easily the longest single
      // set piece in the game) had no checkpoint of its own -- finishing
      // it bought you nothing; quitting right after dropped you back to
      // chapter 3 or 4 and made you replay the whole thing. Chapter 5
      // saves right where the other mini-games already do, immediately
      // on completion.
      game.saveChapter(5, this.getTrailStateSnapshot());
      // Straight into Act 3 -- no "out on your own recognizance" detour
      // back to the trail anymore now that there's somewhere for the
      // arrest to actually lead.
      this.startJailGame();
    });
    heistGame.init();
  }

  startJailGame() {
    game.showScreen('jail-game');
    jailGame = new JailGame(this.gameState, (result) => {
      this.gameState.jailDone = true;
      this.gameState.jailWon = !!(result && result.jailWon); // dead field, kept only for old-save compatibility
      this.gameState.jailPath = result ? result.jailPath : null; // dead field, same reason
      this.gameState.jailFriendship = result ? result.jailFriendship : null;
      this.gameState.jailFlags = result ? result.jailFlags : [];
      this.gameState.nycFriends = result ? result.nycFriends : [];
      // Chapter 6: the jail arc is its own checkpoint too, same reasoning
      // as chapter 5 -- it's a real chunk of content (yard exploration,
      // three dialogue trees, three mini-games), not something you want
      // to redo because you closed the tab right after finishing it.
      game.saveChapter(6, this.getTrailStateSnapshot());
      this.showEnding(result ? result.jailFriendCount : 0);
    });
    jailGame.init();
  }

  // The end of what's built: the jail's release line, then back to the
  // title. (Used to drop you back onto the trail, walking on into an
  // unbuilt L-train crossing and a "coming soon" Mirage.)
  showEnding(friendCount) {
    this.stop();
    game.showScreen('trail-screen');
    if (friendCount == null) friendCount = (this.gameState.nycFriends || []).length;
    const outcome = JAIL_OUTCOMES.release[friendCount] || JAIL_OUTCOMES.release[0];
    this.showEvent(`${outcome} Act 4 is coming soon.`, () => game.showMainMenu());
  }

  showWiseEricsPitch() {
    this.showEvent(
      `Big Tony, Ruhul, and Dmitri find you on a stoop doing math on your phone that isn't working out. "We got an idea," Tony says, sitting down uninvited. "You're gonna love it. Or you already hate it. Either way, sit down." (You're already sitting.)`,
      () => this.showWiseEricsChoice()
    );
  }

  showWiseEricsChoice() {
    const box = document.getElementById('wise-erics-choice');
    box.classList.remove('hidden');
    this.state.paused = true;
    const proceed = () => {
      box.classList.add('hidden');
      this.state.paused = false;
      this.startHeistGame();
    };
    document.getElementById('wise-erics-yes').onclick = proceed;
    document.getElementById('wise-erics-ofcourse').onclick = proceed;
    document.getElementById('wise-erics-implicitly').onclick = proceed;
  }

  // One-time offer at Midtown, after bodega -- see reachLandmark().
  showRushOffer() {
    const box = document.getElementById('rush-choice');
    box.classList.remove('hidden');
    this.state.paused = true;
    document.getElementById('rush-yes').onclick = () => {
      box.classList.add('hidden');
      this.startRushGame();
    };
    document.getElementById('rush-no').onclick = () => {
      box.classList.add('hidden');
      this.state.paused = false;
    };
  }

  startRushGame() {
    this.stop();
    game.showScreen('rush-game');
    rushGame = new RushGame(this.gameState, (result) => {
      // Score only -- never touches checkingAccount/aura/balances. A
      // wipeout (out of hearts before the finish) costs trail time
      // instead, same addHours pattern the random-event pool uses.
      if (result) {
        this.gameState.rushScore = Math.max(this.gameState.rushScore || 0, result.score || 0);
        if (result.wipedOut) {
          this.state.hoursElapsed += RUSH_WIPEOUT_HOURS;
          this.state.currentDate.setHours(this.state.currentDate.getHours() + RUSH_WIPEOUT_HOURS);
        }
      }
      this.startLibertyScene(!!(result && result.wipedOut));
    });
    rushGame.init();
  }

  // Finished or wiped out, the rush run leaves you on Liberty Island
  // (liberty.js). Crossing back drops you at Battery Park, and the trail
  // resumes north to Washington Square Park.
  startLibertyScene(wipedOut) {
    this.stop();
    game.showScreen('liberty-scene');
    libertyScene = new LibertyScene(this.gameState, {
      wipedOut,
      charge: (amount) => this.chargeExpense(amount, 'chaseSapphire'),
    }, (out) => {
      if (out.via === 'jetski') this.startJetskiGame();
      else this.arriveBatteryPark();
    });
    libertyScene.init();
  }

  // Steal a jet ski: the whale-launched water-slope race (jetski.js),
  // which splashes down at Battery Park. Score only.
  startJetskiGame() {
    this.stop();
    game.showScreen('jetski-game');
    jetskiGame = new JetskiGame(this.gameState, (result) => {
      if (result) this.gameState.jetskiScore = Math.max(this.gameState.jetskiScore || 0, result.score || 0);
      this.arriveBatteryPark();
    });
    jetskiGame.init();
  }

  arriveBatteryPark() {
    game.showScreen('trail-screen');
    this.state.paused = false;
    this.start();
    if (LIBERTY_LINES.arrive) this.showEvent(LIBERTY_LINES.arrive);
  }

  getTrailStateSnapshot() {
    return {
      landmarkIndex: this.state.landmarkIndex,
      transportation: this.state.transportation,
      spendingMode: this.state.spendingMode,
      currentDay: this.state.currentDay,
      currentDate: this.state.currentDate.toISOString(),
      vibeWeather: this.state.vibeWeather,
      hoursElapsed: this.state.hoursElapsed,
      milesFromLandmark: 0,
    };
  }

  checkChapterSave() {
    // Auto-save ch4 when reaching LES (index 7).
    // ch2 is saved by startBodegaGame callback; ch3 by startCannonGame callback.
    const chapterMap = { 7: 4 };
    const chNum = chapterMap[this.state.landmarkIndex];
    if (chNum) {
      game.saveChapter(chNum, this.getTrailStateSnapshot());
    }
  }

  reachDestination() {
    this.stop();
    // Was "Calculating your score..." with no score screen ever following
    // it -- a real dead end dressed up as if something was about to
    // happen. This landmark sits past the jail arc in the sequence and
    // still has nothing built for it, so the message is honest about
    // that instead of promising a screen that doesn't exist.
    this.showEvent('🎉 You made it to the Brooklyn Mirage! That\'s as far as the trail goes right now -- the rest is coming soon.');
  }

  dailyExpenses() {
    const spendingMode = SPENDING_MODES.find(m => m.id === this.state.spendingMode);
    if (!spendingMode) return;

    // Daily food/living: Dad's AMEX until he cancels it, then checking,
    // then Freedom. (Nothing ever charged the AMEX before, so his
    // cancel-the-card call could never happen.)
    this.chargeExpense(spendingMode.dailyCost, 'chaseFreedom', true);

    // Vibes from how you eat and how you get around (transport vibeEffect
    // was in the data and the descriptions but never applied).
    const transport = TRANSPORTATION_MODES.find(m => m.id === this.state.transportation);
    this.gameState.aura += spendingMode.vibeEffect + (transport ? transport.vibeEffect || 0 : 0);
  }

  checkAura() {
    // Aura naturally decays
    this.gameState.aura -= 1;

    // Check if anyone dies (aura = health)
    if (this.gameState.aura <= 0) {
      this.handleDeath();
    }
  }

  // ============================================
  // RANDOM EVENTS
  // ============================================

  checkRandomEvent() {
    // Was a flat 20% chance per day -- at ~1.5 real seconds/game-hour
    // that's ~36 real seconds/day, so an *average* wait of roughly 5
    // days, close to 3 real minutes, between anything actually
    // happening. Direct feedback: "you are just walking and walking and
    // nothing really happens." Bumped to 40% (the event pool grew
    // alongside it -- see triggerRandomEvent -- so more frequent doesn't
    // just mean more repetitive).
    if (Math.random() < 0.4) {
      this.triggerRandomEvent();
    }
    this.state.lastEventDay = this.state.currentDay;
  }

  triggerRandomEvent() {
    // Was a flat text array matched afterward by scanning for substrings
    // ("$20", "puddle", etc.) to decide what effect to apply -- fragile
    // (a future event whose text happened to contain another event's
    // trigger word would silently misfire the wrong effect) and two
    // entries ("lost 2 hours" / "lost 3 hours") promised a time cost
    // that was never actually applied -- pure flavor text, no effect,
    // same "promises something that doesn't happen" issue as
    // reachDestination()'s old ending. Each event carries its own real
    // effect directly now, and there are more of them.
    const addHours = (h) => {
      this.state.hoursElapsed += h;
      this.state.currentDate.setHours(this.state.currentDate.getHours() + h);
    };
    const events = [
      { text: 'You stepped in a puddle. Aura -5.', apply: () => { this.gameState.aura -= 5; } },
      { text: 'Someone complimented your outfit. Aura +10.', apply: () => { this.gameState.aura += 10; } },
      { text: 'The L train broke down. Lost 2 hours.', apply: () => addHours(2) },
      { text: 'You found $20 on the street!', apply: () => { this.gameState.balances.chaseFreedom += 20; } },
      { text: 'A pigeon pooped on you. Aura -15.', apply: () => { this.gameState.aura -= 15; } },
      { text: `${this.gameState.playerName} twisted an ankle. Aura -8.`, apply: () => { this.gameState.aura -= 8; } },
      { text: 'You discovered an amazing taco spot. Aura +5.', apply: () => { this.gameState.aura += 5; } },
      { text: 'Your phone died. You got lost for 3 hours.', apply: () => addHours(3) },
      { text: 'A stranger asks if you know a good dermatologist. You do not. Aura -3.', apply: () => { this.gameState.aura -= 3; } },
      { text: 'A stranger holds the subway door for you. Aura +6.', apply: () => { this.gameState.aura += 6; } },
      { text: 'You get seated immediately at a place with a line out the door. Aura +12.', apply: () => { this.gameState.aura += 12; } },
      { text: 'Every Citi Bike dock on the block is full. You wait it out. Lost 1 hour.', apply: () => addHours(1) },
      { text: 'You get invited to a rooftop thing you weren\'t expecting. Aura +8.', apply: () => { this.gameState.aura += 8; } },
      { text: 'Your card gets declined at the register for a second, then goes through. Aura -6.', apply: () => { this.gameState.aura -= 6; } },
    ];

    const event = events[Math.floor(Math.random() * events.length)];
    this.toast(event.text);
    event.apply();
  }

  // Non-blocking note over the scene; queued so two never overlap.
  toast(text) {
    this.toastQueue = this.toastQueue || [];
    this.toastQueue.push(text);
    if (!this._toasting) this._nextToast();
  }

  _nextToast() {
    const el = document.getElementById('trail-toast');
    const text = this.toastQueue.shift();
    if (!text) { this._toasting = false; return; }
    this._toasting = true;
    TTAudio.sfx('toast');
    el.textContent = text;
    el.classList.remove('hidden');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      el.classList.add('hidden');
      this._toastTimer = setTimeout(() => this._nextToast(), 400);
    }, 3600);
  }

  showEvent(text, onDismiss = null) {
    const eventBox = document.getElementById('trail-event');
    const eventText = document.getElementById('event-text');

    eventText.textContent = text;
    eventBox.classList.remove('hidden');
    this.state.paused = true;
    this.pendingAfterEvent = onDismiss;
  }

  handleDeath() {
    this.stop();
    // Was a dead end -- stop() plus an event with no dismiss callback left
    // the player on a frozen canvas with no menu and no way to do
    // anything else. Same recovery path returnToChapterSelect() already
    // uses elsewhere: dismissing the event now sends you to chapter
    // select instead of softlocking the tab.
    this.showEvent('Your aura hit zero. You have been absorbed by the city.', () => {
      game.showChapterSelect();
    });
  }

  // ============================================
  // ON-SCREEN PICKERS (transportation + food)
  // ============================================
  // There's no menu: the two things you can actually change on the trail
  // sit on the main screen as tap-to-pick chips. Rebuilt only when what's
  // available changes (weather, an unlock), so a tap is never lost to a
  // re-render mid-press.

  renderPickers() {
    const inv = this.gameState.inventory || {};
    const unlocked = this.gameState.unlockedVehicles || [];
    const weather = this.state.vibeWeather;
    const key = [this.state.transportation, this.state.spendingMode, weather, unlocked.join(','),
      inv.metrocard > 0, inv['bank-bike'] > 0].join('|');
    if (key === this._chipKey) return;
    this._chipKey = key;

    const tWrap = document.getElementById('trail-transport-chips');
    tWrap.innerHTML = '';
    TRANSPORTATION_MODES.forEach(mode => {
      if (mode.requiresUnlock && !unlocked.includes(mode.id)) return;
      const btn = document.createElement('button');
      btn.className = 'trail-chip' + (mode.id === this.state.transportation ? ' active' : '');
      const needs = mode.requiresItem && !(inv[mode.requiresItem] > 0) ? getStoreItem(mode.requiresItem) : null;
      const rained = mode.unavailableWeather && mode.unavailableWeather.includes(weather);
      const speed = '▮'.repeat(Math.max(1, Math.round(mode.speed * 2))).slice(0, 5);
      const sub = needs ? `needs ${needs.name}` : rained ? 'not in this weather' : `${speed} ${mode.cost ? '$' + mode.cost + '/day' : 'free'}`;
      btn.innerHTML = `${mode.name}<small>${sub}</small>`;
      btn.disabled = !!(needs || rained);
      btn.onclick = () => this.pickTransport(mode);
      tWrap.appendChild(btn);
    });

    const sWrap = document.getElementById('trail-spending-chips');
    sWrap.innerHTML = '';
    SPENDING_MODES.forEach(mode => {
      const btn = document.createElement('button');
      btn.className = 'trail-chip' + (mode.id === this.state.spendingMode ? ' active' : '');
      btn.innerHTML = `${mode.name}<small>$${mode.dailyCost}/day</small>`;
      btn.onclick = () => { TTAudio.sfx('click'); this.state.spendingMode = mode.id; this.updateStatusDisplay(); };
      sWrap.appendChild(btn);
    });
    const active = tWrap.querySelector('.active');
    if (active && active.scrollIntoView) active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  pickTransport(mode) {
    if (mode.id === this.state.transportation) return;
    TTAudio.sfx('select');
    this.state.transportation = mode.id;
    // Rain's surge pricing on an app car, charged once when you book it.
    if (mode.id === 'app-car' && this.state.vibeWeather === 'raining') {
      this.chargeExpense(20, 'chaseSapphire');
      this.toast('Surge pricing. -$20 on Sapphire.');
    }
    this.updateStatusDisplay();
  }

  // ============================================
  // FINANCES
  // ============================================

  // Drain checking first; any remainder goes on the fallback credit card.
  // dadFirst: Dad's AMEX covers it first while it has allowance left.
  chargeExpense(amount, fallbackCard, dadFirst) {
    const b = this.gameState.balances;
    if (dadFirst && !this.gameState.dadsAmexCancelled && b.dadsAmex > 0) {
      const fromDad = Math.min(amount, b.dadsAmex);
      b.dadsAmex -= fromDad;
      amount -= fromDad;
      if (amount <= 0) return;
    }
    if (this.gameState.checkingAccount > 0) {
      const fromChecking = Math.min(amount, this.gameState.checkingAccount);
      this.gameState.checkingAccount -= fromChecking;
      const remainder = amount - fromChecking;
      if (remainder > 0) {
        this.gameState.balances[fallbackCard] -= remainder;
      }
    } else {
      this.gameState.balances[fallbackCard] -= amount;
    }
  }

  // ============================================
  // UI UPDATES
  // ============================================

  updateStatusDisplay() {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    document.getElementById('trail-date').textContent = `${months[this.state.currentDate.getMonth()]} ${this.state.currentDate.getDate()}, 2026`;

    const weather = VIBE_WEATHER.find(w => w.id === this.state.vibeWeather);
    document.getElementById('trail-weather').textContent = weather ? weather.name : this.state.vibeWeather;

    const aura = jailClamp(this.gameState.aura, 0, 100);
    document.getElementById('trail-aura').textContent = aura > 75 ? 'Immaculate' : aura > 50 ? 'Good' : aura > 25 ? 'Mid' : 'Cooked';
    const fill = document.getElementById('trail-aura-fill');
    fill.style.width = `${aura}%`;
    fill.style.background = aura > 50 ? '#7ec89a' : aura > 25 ? '#f4c542' : '#e05a4a';

    const money = (id, v) => {
      const el = document.getElementById(id);
      el.textContent = v < 0 ? `-$${Math.floor(-v)}` : `$${Math.floor(v)}`;
      el.classList.toggle('neg', v < 0);
    };
    const b = this.gameState.balances;
    money('trail-checking', this.gameState.checkingAccount);
    money('trail-freedom', b.chaseFreedom);
    money('trail-sapphire', b.chaseSapphire);
    money('trail-dads-amex', this.gameState.dadsAmexCancelled ? 0 : b.dadsAmex);
    money('trail-bilt', b.bilt);

    document.getElementById('trail-landmark').textContent = this.getNextLandmark().name;
    const left = Math.max(0, this.state.milesPerLandmark - this.state.milesFromLandmark);
    document.getElementById('trail-miles').textContent = `${Math.ceil(left)} mi`;
    document.getElementById('trail-progress-fill').style.width = `${jailClamp(this.state.milesFromLandmark / this.state.milesPerLandmark, 0, 1) * 100}%`;
    this.renderRoute();
    this.renderPickers();
  }

  renderRoute() {
    const el = document.getElementById('trail-route');
    const here = this.state.landmarkIndex;
    if (el.dataset.here === String(here)) return;
    el.dataset.here = String(here);
    el.innerHTML = '';
    LANDMARKS.forEach((lm, i) => {
      if (i > 0) {
        const seg = document.createElement('span');
        seg.className = 'trail-route-seg' + (i <= here ? ' done' : '');
        el.appendChild(seg);
      }
      const dot = document.createElement('span');
      dot.className = 'trail-route-dot' + (i < here ? ' done' : i === here ? ' here' : '');
      dot.title = lm.name;
      el.appendChild(dot);
    });
  }
}

// Global trail game instance
let trailGame;
