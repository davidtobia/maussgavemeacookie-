/**
 * THE TRANSPLANT TRAIL - GAME LOGIC
 * Screen navigation and game state management
 */

class TransplantTrail {
  constructor() {
    this.state = {
      currentScreen: 'load-screen',
      selectedCharacter: null,
      gameStarted: false,
      inventory: {},
      money: 0,
      squad: []
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

    // Enter key to continue
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && this.state.currentScreen === 'load-screen') {
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
    this.populateCharacterOptions();
  }

  populateCharacterOptions() {
    const container = document.querySelector('.character-options');
    container.innerHTML = '';

    // Add each character as an option
    getAllCharacters().forEach((character, index) => {
      const button = document.createElement('button');
      button.className = 'character-option';
      button.dataset.characterId = character.id;
      button.innerHTML = `${index + 1}. Be ${character.name} from ${character.origin}`;

      button.addEventListener('click', () => {
        this.selectCharacter(character.id);
      });

      container.appendChild(button);
    });

    // Add "learn more" option
    const learnButton = document.createElement('button');
    learnButton.className = 'character-option';
    learnButton.innerHTML = `${getAllCharacters().length + 1}. Find out the differences between these choices`;
    learnButton.addEventListener('click', () => {
      this.showCharacterComparison();
    });
    container.appendChild(learnButton);
  }

  setupCharacterSelect() {
    // This is now handled by populateCharacterOptions
  }

  selectCharacter(characterId) {
    const character = getCharacter(characterId);
    this.state.selectedCharacter = character;
    this.state.money = character.money;
    this.state.inventory = { ...character.startingItems };

    this.showCharacterInfo();
  }

  showCharacterInfo() {
    const character = this.state.selectedCharacter;
    const infoContent = document.querySelector('#character-info .info-content');

    infoContent.innerHTML = `
      <h2 class="character-name">${character.name}</h2>
      <p class="character-description">${character.description}</p>

      <div class="character-stats">
        <div class="stat-line">Starting Money: $${character.money}</div>
        <div class="stat-line">Vibes: ${'★'.repeat(character.vibes)}${'☆'.repeat(5 - character.vibes)}</div>
        <div class="stat-line">Audacity: ${'★'.repeat(character.audacity)}${'☆'.repeat(5 - character.audacity)}</div>
        <div class="stat-line">Difficulty Multiplier: ${character.difficulty}x</div>
      </div>

      <div class="special-ability">
        <div class="ability-title">Special Ability: ${character.specialAbility.name}</div>
        <p>${character.specialAbility.description}</p>
      </div>

      ${character.restrictions && character.restrictions.length > 0 ? `
        <div class="character-restrictions">
          <p style="margin-top: 20px;">Restrictions:</p>
          ${character.restrictions.map(r => `<p style="padding-left: 20px;">• ${r}</p>`).join('')}
        </div>
      ` : ''}
    `;

    this.showScreen('character-info');

    // Continue to store after viewing character info
    const continueHandler = (e) => {
      if (e.key === 'Enter' || e.type === 'click') {
        document.removeEventListener('keydown', continueHandler);
        document.querySelector('#character-info').removeEventListener('click', continueHandler);
        this.goToStore();
      }
    };

    document.addEventListener('keydown', continueHandler);
    document.querySelector('#character-info').addEventListener('click', continueHandler);
  }

  showCharacterComparison() {
    // TODO: Show comparison screen
    alert('Character comparison - Coming soon!');
  }

  // ============================================
  // SUPPLIES STORE
  // ============================================

  goToStore() {
    const character = this.state.selectedCharacter;

    // Check if character skips store (Delivery Driver)
    if (character.skipStore) {
      alert(character.storeMessage);
      this.startTrail();
      return;
    }

    // Show special message for Aristocrat
    if (character.specialStoreMessage) {
      // TODO: Display this in the store UI
    }

    this.showSuppliesStore();
  }

  showSuppliesStore() {
    this.showScreen('supplies-store');
    this.populateStore();
  }

  populateStore() {
    const storeContent = document.querySelector('.store-content');
    const character = this.state.selectedCharacter;

    storeContent.innerHTML = `
      <div class="store-header">
        <div class="store-location">Big Box Store - ${character.origin}</div>
        <div class="store-date">Before you depart</div>
        <div class="money-display">You have: $${this.state.money}</div>
        ${character.specialStoreMessage ? `<p style="margin-top: 20px; font-size: 20px;">${character.specialStoreMessage}</p>` : ''}
      </div>

      <div class="store-items">
        <!-- Store items will be populated here -->
      </div>

      <button class="menu-option" style="margin-top: 30px;" onclick="game.finishShopping()">
        Done shopping - Hit the trail
      </button>
    `;

    // TODO: Add store items (phone charger, content materials, outfits, medicine, etc.)
  }

  finishShopping() {
    this.startTrail();
  }

  // ============================================
  // TRAIL
  // ============================================

  startTrail() {
    // TODO: Start the actual trail game
    alert('Trail starts here! (Coming soon)');
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
