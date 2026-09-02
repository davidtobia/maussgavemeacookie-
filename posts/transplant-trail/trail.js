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
      milesPerLandmark: 15, // Distance between landmarks
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

  randomVibeWeather() {
    const weather = VIBE_WEATHER[Math.floor(Math.random() * VIBE_WEATHER.length)];
    return weather.id;
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

  setupCanvas() {
    // Set canvas size to match container
    const resizeCanvas = () => {
      const container = this.canvas.parentElement;
      const rect = container.getBoundingClientRect();
      this.canvas.width = rect.width;
      this.canvas.height = rect.height - 200; // Leave room for status bar
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
  }

  setupControls() {
    // Spacebar or Enter to dismiss event or toggle menu
    document.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();

        const eventBox = document.getElementById('trail-event');
        if (!eventBox.classList.contains('hidden')) {
          this.dismissEvent();
          return;
        }

        if (this.state.running) {
          this.toggleMenu();
        }
      }
    });

    // Tap to dismiss event on mobile
    document.getElementById('trail-event').addEventListener('click', () => {
      const eventBox = document.getElementById('trail-event');
      if (!eventBox.classList.contains('hidden')) {
        this.dismissEvent();
      }
    });

    // Tap canvas to open menu
    this.canvas.addEventListener('click', () => {
      if (!this.state.running) return;
      const eventBox = document.getElementById('trail-event');
      if (!eventBox.classList.contains('hidden')) return;
      this.toggleMenu();
    });
  }

  dismissEvent() {
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
    this.state.running = true;
    this.state.paused = false;
    this.updateStatusDisplay();
    this.gameLoop();
  }

  stop() {
    this.state.running = false;
  }

  toggleMenu() {
    const menu = document.getElementById('trail-menu');
    this.state.paused = !this.state.paused;

    if (this.state.paused) {
      menu.classList.remove('hidden');
    } else {
      menu.classList.add('hidden');
    }
  }

  closeMenu() {
    document.getElementById('trail-menu').classList.add('hidden');
    this.state.paused = false;
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

    // Advance time (every 90 frames = ~1.5 real seconds per game hour)
    if (this.frameCounter % 90 === 0) {
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
  }

  render() {
    // Render background layers (parallax)
    this.renderBackground();

    // Render character/vehicle sprite
    this.renderCharacter();

    // Render foreground
    this.renderForeground();
  }

  renderBackground() {
    const { width, height } = this.canvas;

    // Sky gradient
    const gradient = this.ctx.createLinearGradient(0, 0, 0, height * 0.6);
    gradient.addColorStop(0, '#1a1a2e');
    gradient.addColorStop(1, '#16213e');
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, width, height * 0.6);

    // Buildings silhouette (parallax layer 1 - slow)
    this.ctx.fillStyle = '#0f3460';
    for (let i = -1; i < 10; i++) {
      const x = (i * 150) - (this.backgroundOffset * 0.3);
      const buildingHeight = 100 + Math.sin(i * 0.5) * 50;
      this.ctx.fillRect(x, height * 0.4 - buildingHeight, 120, buildingHeight);
    }

    // Street level (parallax layer 2 - medium)
    this.ctx.fillStyle = '#533483';
    this.ctx.fillRect(0, height * 0.6, width, height * 0.4);

    // Street details (parallax layer 3 - fast)
    this.ctx.fillStyle = '#d4a574';
    for (let i = -1; i < 20; i++) {
      const x = (i * 100) - this.backgroundOffset;
      // Street lines
      this.ctx.fillRect(x, height * 0.7, 60, 3);
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

  renderForeground() {
    // Could add foreground elements here (trash cans, fire hydrants, etc.)
  }

  // ============================================
  // TIME & PROGRESSION
  // ============================================

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

    // Apply vibe weather modifier
    const weather = VIBE_WEATHER.find(w => w.id === this.state.vibeWeather);
    const speedMod = weather ? weather.speedMod : 1;

    const milesThisHour = speed * speedMod;
    this.state.milesFromLandmark += milesThisHour;

    // Hourly costs (transportation) — checking first, then Sapphire
    if (transport && transport.cost > 0) {
      this.chargeExpense(transport.cost / 24, 'chaseSapphire');
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

    // The Wise Erics (Big Tony, Ruhul, Dmitri) pitch a way to make cash once
    // you're actually running low, but only after they've joined you post-cannon.
    if (this.gameState.wisemenJoined && !this.gameState.wiseEricsPitched && this.gameState.checkingAccount <= 150) {
      this.gameState.wiseEricsPitched = true;
      this.showWiseEricsPitch();
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
    console.log('Reached:', landmark.name);

    // Handle different landmark types
    if (landmark.id === 'murray-hill') {
      this.apartmentHunt();
    } else if (landmark.id === 'washington-square-park') {
      this.showEvent('You arrive at Washington Square Park. Three figures are waiting by the arch.', () => this.startCannonGame());
    } else if (landmark.type === 'fort') {
      this.showEvent(`You reached ${landmark.name}! You can rest and resupply here.`);
    } else if (landmark.type === 'crossing') {
      this.lTrainCrossing();
    } else if (landmark.type === 'destination') {
      this.reachDestination();
    } else {
      this.showEvent(`You reached ${landmark.name}.`);
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
    bodegaGame = new BodegaGame(this.gameState, () => {
      // Save chapter 2 checkpoint after bodega completes
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
      // Save chapter 3 checkpoint after cannon game completes
      game.saveChapter(3, this.getTrailStateSnapshot());
      game.showScreen('trail-screen');
      if (result && result.wisemenJoined) {
        this.gameState.wisemenJoined = true;
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
      this.gameState.jailWon = !!(result && result.jailWon);
      this.gameState.jailPath = result ? result.jailPath : null;
      // Chapter 6: the jail arc is its own checkpoint too, same reasoning
      // as chapter 5 -- it's a real chunk of content (recruitment arc +
      // two activity beats + a fight), not something you want to redo
      // because you closed the tab right after finishing it.
      game.saveChapter(6, this.getTrailStateSnapshot());
      game.showScreen('trail-screen');
      const outcome = result && result.jailWon
        ? 'You walk out of the yard still standing. Word travels fast in a building this size.'
        : "You walk out of the yard, eventually, on your own legs. That's the part that counts.";
      this.showEvent(
        `${outcome} Act 4 is coming soon.`,
        () => this.start()
      );
    });
    jailGame.init();
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

  lTrainCrossing() {
    // TODO: Build L train crossing mechanic
    this.showEvent('You need to cross into Brooklyn via the L Train! (Crossing mechanic coming next)');
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

    // Daily food/living costs — checking first, then Freedom
    this.chargeExpense(spendingMode.dailyCost, 'chaseFreedom');

    // Apply vibe effect from spending mode
    this.gameState.aura += spendingMode.vibeEffect;
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
    this.showEvent(event.text);
    event.apply();
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
  // MENU ACTIONS
  // ============================================

  continueTrail() {
    this.toggleMenu();
  }

  checkSupplies() {
    this.toggleMenu();
    const inv = this.gameState.inventory;
    const items = Object.entries(inv)
      .filter(([, qty]) => qty > 0)
      .map(([id, qty]) => `${id.replace(/-/g, ' ')} x${qty}`)
      .join(', ');
    this.showEvent(items ? `You have: ${items}` : 'Your bags are empty.');
  }

  lookAtMap() {
    this.toggleMenu();
    const current = this.getCurrentLandmark();
    const next = this.getNextLandmark();
    const miles = Math.floor(this.state.milesPerLandmark - this.state.milesFromLandmark);
    this.showEvent(`You are near ${current.name}. Next stop: ${next.name} (${miles} miles).`);
  }

  changeTransportation() {
    this.closeMenu();
    this.stop();
    game.showScreen('transportation-select');

    // Get available transportation modes for this character
    const characterId = this.gameState.selectedCharacter.id;
    const weather = this.state.vibeWeather;
    const availableModes = getAvailableTransport(characterId, weather);

    // Populate options
    const container = document.getElementById('transport-options');
    container.innerHTML = '';

    availableModes.forEach((mode, index) => {
      const btn = document.createElement('button');
      btn.className = 'menu-option';
      btn.dataset.transport = mode.id;
      btn.innerHTML = `${index + 1}. ${mode.name} — ${mode.description}`;

      btn.onclick = () => {
        this.state.transportation = mode.id;
        // Rain's own VIBE_WEATHER entry describes "App Car surge pricing
        // (+$20)" as one of its effects -- wasn't wired to an actual
        // charge anywhere. One-time hit at the moment you book it during
        // rain, same as a real surge fare.
        if (mode.id === 'app-car' && weather === 'raining') {
          this.chargeExpense(20, 'chaseSapphire');
        }
        game.showScreen('trail-screen');
        this.start();
      };

      container.appendChild(btn);
    });
  }

  changeSpending() {
    this.closeMenu();
    this.stop();
    game.showScreen('spending-select');

    // Setup buttons
    document.querySelectorAll('#spending-select .menu-option').forEach(btn => {
      btn.onclick = () => {
        this.state.spendingMode = btn.dataset.spending;
        game.showScreen('trail-screen');
        this.start();
      };
    });
  }

  rest() {
    this.toggleMenu();
    // Used to just add aura and skip a day for free -- no daily cost, no
    // decay, no death check -- which made it strictly better than doing
    // nothing every single time and let you spam it to sit at max aura
    // forever at zero risk, undercutting the entire aura-pressure system.
    // A rest day is still a day: it still costs that day's spending-mode
    // charge and still applies the normal -1 decay before the rest bonus
    // lands, same as a day spent actually walking.
    this.dailyExpenses();
    this.checkAura();
    if (!this.state.running) return; // died from the day's own costs -- handleDeath() already took over
    this.gameState.aura = Math.min(100, this.gameState.aura + 20);
    this.state.currentDay++;
    this.showEvent('You stayed in and doom-scrolled. Aura +20. One day lost.');
  }

  workGig() {
    this.toggleMenu();
    this.showEvent('Work gig — coming soon.');
  }

  // Was only reachable by fully backing out to the main menu and hitting
  // "Choose chapter" -- no way to see or jump to a checkpoint without
  // leaving the trail entirely. Same screen, reachable from the pause
  // menu now. Jumping backward still means losing anything past your
  // last save, same as "Continue" always has -- that's the save system,
  // not new behavior.
  returnToChapterSelect() {
    this.closeMenu();
    this.stop();
    game.showChapterSelect();
  }

  goOut() {
    this.toggleMenu();
    this.chargeExpense(50, 'chaseFreedom');
    this.gameState.aura += 15;
    this.showEvent('You went out. -$50 on Freedom. Aura +15.');
  }

  // ============================================
  // FINANCES
  // ============================================

  // Drain checking first; any remainder goes on the fallback credit card
  chargeExpense(amount, fallbackCard) {
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
    // Date
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const dateStr = `${months[this.state.currentDate.getMonth()]} ${this.state.currentDate.getDate()}, 2026`;
    document.getElementById('trail-date').textContent = dateStr;

    // Vibe Weather
    const weather = VIBE_WEATHER.find(w => w.id === this.state.vibeWeather);
    document.getElementById('trail-weather').textContent = weather ? weather.name : this.state.vibeWeather;

    // Aura
    const auraText = this.gameState.aura > 75 ? 'Immaculate' :
                     this.gameState.aura > 50 ? 'Good' :
                     this.gameState.aura > 25 ? 'Mid' : 'Cooked';
    document.getElementById('trail-aura').textContent = auraText;

    // Checking account and card balances
    const b = this.gameState.balances;
    document.getElementById('trail-checking').textContent = `$${Math.floor(this.gameState.checkingAccount)}`;
    document.getElementById('trail-freedom').textContent = `$${Math.floor(b.chaseFreedom)}`;
    document.getElementById('trail-sapphire').textContent = `$${Math.floor(b.chaseSapphire)}`;
    document.getElementById('trail-dads-amex').textContent = `$${Math.floor(b.dadsAmex)}`;
    document.getElementById('trail-bilt').textContent = `$${Math.floor(b.bilt)}`;

    // Chapter progress -- a live, always-visible readout (not another
    // popup) of how far into the game you are, mirroring the same
    // boundaries the save system checkpoints at (see CHAPTERS in
    // game.js / saveChapter call sites) so "Chapter 3" here always means
    // the same thing as chapter 3 in the chapter-select menu.
    const chapterNum = this.gameState.jailDone ? 6
      : this.gameState.heistDone ? 5
      : this.state.landmarkIndex >= 7 ? 4
      : this.state.landmarkIndex >= 3 ? 3
      : this.state.landmarkIndex >= 1 ? 2
      : 1;
    document.getElementById('trail-chapter').textContent = `${chapterNum} of ${CHAPTERS.length}`;

    // Next landmark
    const nextLandmark = this.getNextLandmark();
    document.getElementById('trail-landmark').textContent = nextLandmark.name;

    // Miles to go
    const milesToGo = Math.floor(this.state.milesPerLandmark - this.state.milesFromLandmark);
    document.getElementById('trail-miles').textContent = `${milesToGo} miles`;

    // Transportation
    const transport = TRANSPORTATION_MODES.find(m => m.id === this.state.transportation);
    document.getElementById('trail-transport').textContent = transport ? transport.name : 'Walk';

    // Spending
    const spending = SPENDING_MODES.find(m => m.id === this.state.spendingMode);
    document.getElementById('trail-spending').textContent = spending ? spending.name : 'Normal';
  }
}

// Global trail game instance
let trailGame;
