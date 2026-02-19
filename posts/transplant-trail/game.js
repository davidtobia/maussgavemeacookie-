/**
 * THE TRANSPLANT TRAIL - GAME LOGIC
 * Screen navigation and game state management
 */

class TransplantTrail {
  constructor() {
    this.state = {
      currentScreen: 'load-screen',
      selectedCharacter: null,
      playerName: null,
      gameStarted: false,
      departureMonth: null,
      money: 0,
      aura: 100,
      inventory: {}
    };

    this.init();
  }

  init() {
    // Load screen - press any key or click to continue
    this.setupLoadScreen();

    // Main menu navigation
    this.setupMainMenu();

    // Character selection
    this.setupCharacterSelect();

    // Keyboard navigation
    this.setupKeyboardControls();
  }

  // ============================================
  // SCREEN MANAGEMENT
  // ============================================

  showScreen(screenId) {
    // Hide all screens
    document.querySelectorAll('.screen').forEach(screen => {
      screen.classList.remove('active');
    });

    // Show target screen
    const screen = document.getElementById(screenId);
    if (screen) {
      screen.classList.add('active');
      this.state.currentScreen = screenId;
    }
  }

  // ============================================
  // LOAD SCREEN
  // ============================================

  setupLoadScreen() {
    const loadScreen = document.getElementById('load-screen');

    const advance = () => {
      this.showScreen('main-menu');
    };

    // Click to continue
    loadScreen.addEventListener('click', advance);

    // Enter key to continue (only on load screen, not when typing in inputs)
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && this.state.currentScreen === 'load-screen' && e.target.tagName !== 'INPUT') {
        advance();
      }
    });
  }

  // ============================================
  // MAIN MENU
  // ============================================

  setupMainMenu() {
    const menuOptions = document.querySelectorAll('#main-menu .menu-option');

    menuOptions.forEach(option => {
      option.addEventListener('click', () => {
        const action = option.dataset.action;
        this.handleMainMenuAction(action);
      });
    });
  }

  handleMainMenuAction(action) {
    switch(action) {
      case 'start':
        this.startGame();
        break;
      case 'learn':
        this.showLearnAboutTrail();
        break;
      case 'leaderboard':
        this.showLeaderboard();
        break;
      case 'sound':
        this.toggleSound();
        break;
    }
  }

  startGame() {
    this.state.gameStarted = true;
    this.showCharacterSelect();
  }

  showLearnAboutTrail() {
    // TODO: Add info screen about the trail
    alert('Learn about the trail - Coming soon!');
  }

  showLeaderboard() {
    // TODO: Add leaderboard
    alert('Leaderboard - Coming soon!');
  }

  toggleSound() {
    // TODO: Add sound toggle
    alert('Sound toggle - Coming soon!');
  }

  // ============================================
  // CHARACTER SELECT
  // ============================================

  showCharacterSelect() {
    this.showScreen('character-select');
  }

  setupCharacterSelect() {
    // Handled inline in HTML
  }

  selectCharacter(characterId) {
    const character = getCharacter(characterId);
    this.state.selectedCharacter = character;
    this.state.money = character.money;
    this.state.inventory = {};

    this.showPlayerName();
  }

  showPlayerName() {
    this.showScreen('player-name');
    setTimeout(() => {
      const input = document.getElementById('player-name-input');
      input.value = '';
      input.focus();
      input.onkeydown = (e) => {
        if (e.key === 'Enter') this.confirmPlayerName();
      };
    }, 100);
  }

  confirmPlayerName() {
    const input = document.getElementById('player-name-input');
    const name = input.value.trim();
    if (!name) return;
    this.state.playerName = name;
    this.showCharacterInfo();
  }

  showCharacterInfo() {
    const character = this.state.selectedCharacter;
    const infoContent = document.querySelector('#character-info .info-content');

    infoContent.innerHTML = `
      <h2 class="character-name">${character.name} from ${character.origin}</h2>
      <div class="character-stats" style="margin: 60px 0;">
        <div class="stat-line">Starting Money: $${character.money}</div>
        <div class="stat-line">Score Multiplier: ${character.difficulty}x</div>
      </div>
    `;

    this.showScreen('character-info');
  }

  backToCharacterSelect() {
    this.state.selectedCharacter = null;
    this.showCharacterSelect();
  }

  showCharacterComparison() {
    this.showScreen('character-comparison');
  }

  // ============================================
  // SUPPLIES STORE
  // ============================================

  showPremise() {
    this.showScreen('premise');

    document.querySelectorAll('#premise .menu-option').forEach(btn => {
      btn.onclick = () => {
        this.state.departureMonth = btn.dataset.month;
        this.showNYCArrival();
      };
    });
  }


  showNYCArrival() {
    this.showScreen('nyc-arrival');

    const character = this.state.selectedCharacter;
    const city = character.origin.split(',')[0];

    const textEl = document.getElementById('adams-text');
    const btn = document.getElementById('adams-advance');
    const shopItems = document.getElementById('adams-shop-items');
    const shopFooter = document.getElementById('adams-shop-footer');

    const showShop = (category, nextFn) => {
      shopItems.classList.remove('hidden');
      shopFooter.classList.remove('hidden');
      shopItems.innerHTML = '';

      STORE_CATEGORIES[category].forEach(item => {
        if (!this.state.inventory[item.id]) this.state.inventory[item.id] = 0;
        const row = document.createElement('div');
        row.className = 'adams-item-row';
        row.innerHTML = `
          <span class="adams-item-name">${item.name}</span>
          <span class="adams-item-price">$${item.price}</span>
          <div class="item-controls">
            <button class="quantity-btn" onclick="game.adamsChangeQty('${item.id}', -1)">−</button>
            <span class="item-quantity" id="qty-${item.id}">0</span>
            <button class="quantity-btn" onclick="game.adamsChangeQty('${item.id}', 1)">+</button>
          </div>
        `;
        shopItems.appendChild(row);
      });

      this.updateStoreTotal();
      btn.textContent = 'Done';
      btn.onclick = () => {
        shopItems.classList.add('hidden');
        shopFooter.classList.add('hidden');
        nextFn();
      };
    };

    // Stage machine
    const stage2 = () => {
      textEl.textContent = `Oh bet! I once walked from Mecca, the New York of the Kingdom of Saudi Arabia, to Medina, the New York of the Kingdom of Saudi Arabia.`;
      btn.textContent = 'Continue';
      btn.onclick = stage3;
    };

    const stage3 = () => {
      textEl.textContent = `You look like a table cloth. Buy some drip?`;
      btn.textContent = 'Show me.';
      btn.onclick = () => showShop('clothing', stage4);
    };

    const stage4 = () => {
      textEl.textContent = `Before I let you get on your way, you need some other stuff.`;
      btn.textContent = 'Okay.';
      btn.onclick = () => showShop('other', stage5);
    };

    const stage5 = () => {
      textEl.textContent = `Aight. Good luck out there. And remember — plant-based.`;
      btn.textContent = 'Hit the trail.';
      btn.onclick = () => this.leaveStore();
    };

    // Start
    textEl.textContent = `Welcome to New Yawk! This is the ${city} of New Yawk!`;
    btn.textContent = 'Continue';
    btn.onclick = () => {
      textEl.textContent = `New Yorkers get around!`;
      btn.textContent = 'Show me.';
      btn.onclick = () => showShop('transport', stage2);
    };
  }

  adamsChangeQty(itemId, delta) {
    const item = getStoreItem(itemId);
    if (!item) return;
    const currentQty = this.state.inventory[itemId] || 0;
    const newQty = Math.max(0, currentQty + delta);
    if (item.maxQuantity && newQty > item.maxQuantity) return;
    const newSpent = this.calculateSpent() + (delta * item.price);
    if (newSpent > this.state.selectedCharacter.money) return;
    this.state.inventory[itemId] = newQty;
    document.getElementById(`qty-${itemId}`).textContent = newQty;
    this.updateStoreTotal();
  }

  // ============================================
  // STORE
  // ============================================

  calculateSpent() {
    let total = 0;
    for (const itemId in this.state.inventory) {
      const item = getStoreItem(itemId);
      if (!item) continue;
      const qty = this.state.inventory[itemId];
      total += item.price * qty;
    }
    return total;
  }

  updateStoreTotal() {
    const character = this.state.selectedCharacter;
    const spent = this.calculateSpent();
    const remaining = character.money - spent;

    document.getElementById('spent-amount').textContent = `$${spent}`;
    document.getElementById('remaining-amount').textContent = `$${remaining}`;
  }

  leaveStore() {
    const spent = this.calculateSpent();
    const character = this.state.selectedCharacter;
    this.state.money = character.money - spent;

    console.log('Inventory:', this.state.inventory);
    console.log('Money remaining:', this.state.money);

    // Start the trail
    this.startTrail();
  }


  // ============================================
  // TRAIL
  // ============================================

  startTrail() {
    // Show trail screen
    this.showScreen('trail-screen');

    // Initialize trail game with current game state
    trailGame = new TrailGame(this.state);
    trailGame.start();
  }

  // ============================================
  // KEYBOARD CONTROLS
  // ============================================

  setupKeyboardControls() {
    // Number key selection for menus
    document.addEventListener('keydown', (e) => {
      if (e.key >= '1' && e.key <= '9') {
        const num = parseInt(e.key);
        const currentScreen = document.querySelector('.screen.active');

        if (!currentScreen) return;

        // Find menu options in current screen
        const options = currentScreen.querySelectorAll('.menu-option, .character-option');
        if (options[num - 1]) {
          options[num - 1].click();
        }
      }
    });
  }
}

// Initialize game when page loads
let game;
document.addEventListener('DOMContentLoaded', () => {
  game = new TransplantTrail();
});
