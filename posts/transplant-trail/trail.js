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
      milesPerLandmark: 50, // Distance between landmarks
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

    // Update scroll position
    this.backgroundOffset += this.scrollSpeed;
    if (this.backgroundOffset > this.canvas.width) {
      this.backgroundOffset = 0;
    }

    // Update sprite animation frame (every 10 frames)
    if (this.frameCounter % 10 === 0) {
      this.spriteFrame = (this.spriteFrame + 1) % 4;
    }

    // Advance time (every 10 frames = ~1 hour of game time, so ~4 seconds = 1 day)
    if (this.frameCounter % 10 === 0) {
      this.advanceTime();
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

    // Different sprites based on transportation mode
    switch(this.state.transportation) {
      case 'walk':
        this.renderWalkingPerson(x, y);
        break;
      case 'bike':
        this.renderBiker(x, y);
        break;
      case 'subway':
        this.renderSubwayIcon(x, y);
        break;
      case 'uber':
        this.renderCar(x, y);
        break;
      default:
        this.renderWalkingPerson(x, y);
    }
  }

  renderWalkingPerson(x, y) {
    const colors = ['#d4a574', '#c49464', '#d4a574', '#c49464'];
    this.ctx.fillStyle = colors[this.spriteFrame];

    // Head
    this.ctx.fillRect(x + 20, y - 60, 20, 20);
    // Body
    this.ctx.fillRect(x + 15, y - 40, 30, 30);
    // Legs (animate)
    const legOffset = this.spriteFrame % 2 === 0 ? 5 : -5;
    this.ctx.fillRect(x + 15, y - 10, 10, 20); // Left leg
    this.ctx.fillRect(x + 35 + legOffset, y - 10, 10, 20); // Right leg

    // Suitcase
    this.ctx.fillStyle = '#8B4513';
    this.ctx.fillRect(x + 50, y - 25, 15, 20);
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

  renderCar(x, y) {
    // Simple car (top-down view)
    this.ctx.fillStyle = '#FFD700'; // Yellow (taxi/uber)
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

    // Hourly costs (transportation) — Chase Sapphire, the travel card
    if (transport && transport.cost > 0) {
      this.gameState.balances.chaseSapphire -= transport.cost / 24;
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

    // Change weather occasionally (20% chance)
    if (Math.random() < 0.2) {
      this.state.vibeWeather = this.randomVibeWeather();
    }
  }

  reachLandmark() {
    // Arrived at next landmark
    this.state.paused = true;
    this.state.landmarkIndex++;
    this.state.milesFromLandmark = 0;

    const landmark = this.getCurrentLandmark();
    console.log('Reached:', landmark.name);

    // Handle different landmark types
    if (landmark.id === 'murray-hill') {
      this.apartmentHunt();
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
      this.showEvent(apt.successText, () => this.start());
    } else {
      this.state.currentDay += 1;
      this.gameState.aura -= 5;
      game.showScreen('trail-screen');
      this.showEvent(apt.failText, () => this.apartmentHunt());
    }
  }

  lTrainCrossing() {
    // TODO: Build L train crossing mechanic
    this.showEvent('You need to cross into Brooklyn via the L Train! (Crossing mechanic coming next)');
  }

  reachDestination() {
    this.stop();
    this.showEvent('🎉 You made it to the Brooklyn Mirage! Calculating your score...');
    // TODO: Show final score screen
  }

  dailyExpenses() {
    const spendingMode = SPENDING_MODES.find(m => m.id === this.state.spendingMode);
    if (!spendingMode) return;

    // Daily food/living costs — Chase Freedom, the everyday card
    this.gameState.balances.chaseFreedom -= spendingMode.dailyCost;

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
    // 20% chance of event per day
    if (Math.random() < 0.2) {
      this.triggerRandomEvent();
    }
    this.state.lastEventDay = this.state.currentDay;
  }

  triggerRandomEvent() {
    const events = [
      "You stepped in a puddle. Aura -5.",
      "Someone complimented your outfit. Aura +10.",
      "The L train broke down. Lost 2 hours.",
      "You found $20 on the street!",
      "A pigeon pooped on you. Aura -15.",
      `${this.gameState.playerName} twisted their ankle.`,
      "You discovered an amazing taco spot. Aura +5.",
      "Your phone died. You got lost for 3 hours."
    ];

    const event = events[Math.floor(Math.random() * events.length)];
    this.showEvent(event);

    // Apply event effects
    if (event.includes("puddle")) this.gameState.aura -= 5;
    if (event.includes("complimented")) this.gameState.aura += 10;
    if (event.includes("$20")) this.gameState.balances.chaseFreedom += 20;
    if (event.includes("pigeon")) this.gameState.aura -= 15;
    if (event.includes("taco")) this.gameState.aura += 5;
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
    // TODO: Death screen
    alert('Your aura hit zero. Game over!');
    this.stop();
  }

  // ============================================
  // MENU ACTIONS
  // ============================================

  continueTrail() {
    this.toggleMenu();
  }

  checkSupplies() {
    // TODO: Show inventory screen
    alert(`Inventory: ${JSON.stringify(this.gameState.inventory)}`);
  }

  lookAtMap() {
    // TODO: Show map screen
    alert('Map view - Coming soon!');
  }

  changeTransportation() {
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
        game.showScreen('trail-screen');
        this.start();
      };

      container.appendChild(btn);
    });
  }

  changeSpending() {
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
    // Rest for a day, recover aura
    this.gameState.aura = Math.min(100, this.gameState.aura + 20);
    this.state.currentDay++;
    alert('You rested. Aura +20. Time advanced 1 day.');
    this.toggleMenu();
  }

  workGig() {
    // TODO: Launch minigame
    alert('Work gig minigame - Coming soon!');
  }

  goOut() {
    // Going out costs money but boosts aura
    const cost = 50;
    if (this.gameState.money >= cost) {
      this.gameState.money -= cost;
      this.gameState.aura += 15;
      alert('You went out! -$50, Aura +15');
    } else {
      alert('Not enough money to go out.');
    }
    this.toggleMenu();
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

    // Card balances
    const b = this.gameState.balances;
    document.getElementById('trail-cash').textContent = `$0`;
    document.getElementById('trail-freedom').textContent = `$${Math.floor(b.chaseFreedom)}`;
    document.getElementById('trail-sapphire').textContent = `$${Math.floor(b.chaseSapphire)}`;
    document.getElementById('trail-dads-amex').textContent = `$${Math.floor(b.dadsAmex)}`;
    document.getElementById('trail-bilt').textContent = `$${Math.floor(b.bilt)}`;

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
