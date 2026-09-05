/**
 * THE TRANSPLANT TRAIL - GAME LOGIC
 * Screen navigation and game state management
 */

const CHAPTERS = [
  {
    id: 1,
    title: 'Your Big Move',
    landmarkIndex: 0,
  },
  {
    id: 2,
    title: 'Your New Beginning in the center of the Universe: Murray Hill',
    landmarkIndex: 1,
  },
  {
    id: 3,
    title: 'You Meet A Local and Learn Nothing Happens in the Eye of the Storm (other than dinner reservations and crowded bars)',
    landmarkIndex: 3,
  },
  {
    id: 4,
    title: 'You Get What You Give - Finding Love in an Unusual Place',
    landmarkIndex: 7,
  },
  {
    id: 5,
    title: 'Three Strangers Named Eric Have a Proposal',
    landmarkIndex: 7,
  },
  {
    id: 6,
    title: 'Everybody in Here Wants Something From You',
    landmarkIndex: 7,
  },
];

class TransplantTrail {
  constructor() {
    this.state = {
      currentScreen: 'load-screen',
      selectedCharacter: null,
      playerName: null,
      gameStarted: false,
      departureMonth: null,
      checkingAccount: 0,
      balances: { cash: 0, chaseFreedom: 0, chaseSapphire: 0, dadsAmex: 0, bilt: 0 },
      ...this.freshRunState(),
    };

    this.init();
  }

  // Every run-scoped progression flag, in one place -- selectCharacter()
  // (starting/restarting a game without a full page reload) needs to
  // reset all of these, not just balances/inventory, or a second
  // playthrough in the same tab carries over stale flags from the first.
  freshRunState() {
    return {
      dadsAmexCancelled: false,
      wisemenJoined: false,
      wiseEricsPitched: false,
      heistDone: false,
      heistAssignments: null,
      jailDone: false,
      jailWon: false,
      jailPath: null,
      jailFriendship: null,
      jailFlags: null,
      nycFriends: [],
      aura: 100,
      inventory: {},
      bodegaScore: 0,
      boroughBucks: 0,
      cannonProgress: null,
      zoomiesScore: 0,
      bodegaDone: false,
      zoomiesOffered: false,
    };
  }

  init() {
    if (this.maybeDebugJump()) return;

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

    // The canvas mini-games (cannon, heist, bodega) all have touch-action:
    // none on the canvas itself and on their screen container, but the
    // first pass at this only went that far and it wasn't enough -- still
    // zoomable. touch-action doesn't reliably block a pinch that starts
    // with one finger on an element that has it and one finger on
    // something outside that subtree (a HUD element positioned via fixed/
    // absolute layout can end up a sibling in the DOM, not a descendant),
    // and iOS Safari has a long history of not fully honoring
    // user-scalable=no on the viewport meta either. Locking touch-action
    // on <html> and <body> themselves is the one place a stray second
    // finger can't be outside the locked subtree -- everything on screen
    // during a canvas game is inside it. Restored the moment you're back
    // on a reading screen, where pinch/double-tap zoom is still wanted.
    const CANVAS_GAME_SCREENS = new Set(['cannon-game', 'heist-game', 'bodega-game', 'jail-game']);
    const lockZoom = CANVAS_GAME_SCREENS.has(screenId);
    document.documentElement.classList.toggle('game-zoom-lock', lockZoom);
    document.body.classList.toggle('game-zoom-lock', lockZoom);
    const viewport = document.querySelector('meta[name="viewport"]');
    if (viewport) {
      viewport.setAttribute('content', lockZoom
        ? 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no'
        : 'width=device-width, initial-scale=1.0');
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
    const saves = this.loadSaves();
    const hasSave = (saves.latestChapter || 0) >= 2;
    const container = document.querySelector('#main-menu .menu-options');
    container.innerHTML = '';

    const actions = [
      { label: 'Travel the trail', action: 'start' },
      ...(hasSave ? [{ label: 'Continue', action: 'continue' }] : []),
      ...(hasSave ? [{ label: 'Choose chapter', action: 'chapters' }] : []),
      // "Learn about the trail" cut -- dead stub, no content ever
      // written, and the game already explains itself inline (premise
      // screen, event text). "See the leaderboard" and "Turn sound off"
      // stay even though both are still stubs -- a local personal-best
      // leaderboard is real, buildable work (see the note where
      // showLeaderboard() used to alert()), and sound is planned.
      { label: 'See the leaderboard', action: 'leaderboard' },
      { label: 'Turn sound off', action: 'sound' },
    ];

    actions.forEach((a, i) => {
      const btn = document.createElement('button');
      btn.className = 'menu-option';
      btn.dataset.action = a.action;
      btn.textContent = `${i + 1}. ${a.label}`;
      btn.addEventListener('click', () => this.handleMainMenuAction(a.action));
      container.appendChild(btn);
    });
  }

  handleMainMenuAction(action) {
    switch(action) {
      case 'start':       this.startGame(); break;
      case 'continue':    this.continueGame(); break;
      case 'chapters':    this.showChapterSelect(); break;
      case 'leaderboard': this.showLeaderboard(); break;
      case 'sound':       this.toggleSound(); break;
    }
  }

  // Dev-only shortcut for playtesting one chapter without playing the
  // whole game up to it: ?<chapter>=1 in the URL seeds a default
  // character and boots straight into that chapter, skipping everything
  // before it. Not a real game feature -- just a fast way to get eyes on
  // new content while it's actively being iterated on.
  maybeDebugJump() {
    const params = new URLSearchParams(window.location.search);
    const targets = ['apartment', 'bodega', 'cannon', 'heist', 'jail']; // 'zoomies' pulled -- see reachLandmark() in trail.js
    const target = targets.find(t => params.get(t) === '1') || null;
    if (!target) return false;
    // This runs synchronously inside the TransplantTrail constructor --
    // but `game = new TransplantTrail()` (bottom of this file) hasn't
    // finished assigning the global yet at this point, and each of these
    // chapter-start methods (trail.js) calls game.showScreen(...). Calling
    // one from here directly hit `game` still undefined, threw, and
    // silently aborted before any screen change -- which looked exactly
    // like "the link just goes to the beginning of the game." Deferring
    // one tick lets the constructor finish and `game` get assigned first.
    setTimeout(() => {
      this.selectCharacter('remote-worker');
      this.state.playerName = 'Tester';
      this.state.departureMonth = 'may';
      trailGame = new TrailGame(this.state);
      if (target === 'apartment')     trailGame.apartmentHunt();
      else if (target === 'bodega')   trailGame.startBodegaGame();
      else if (target === 'cannon')   trailGame.startCannonGame();
      else if (target === 'heist')    trailGame.startHeistGame();
      else if (target === 'jail')     trailGame.startJailGame();
    }, 0);
    return true;
  }

  showMainMenu() {
    this.setupMainMenu();
    this.showScreen('main-menu');
  }

  startGame() {
    this.state.gameStarted = true;
    this.showCharacterSelect();
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
    this.state.checkingAccount = character.checkingAccount;
    this.state.balances = { ...character.balances };
    // Resets every run-scoped progression flag (wisemenJoined,
    // heistDone, etc.) -- was only resetting balances/inventory here,
    // so restarting a game in the same tab
    // (main menu -> "Travel the trail" again) carried stale progression
    // flags forward from whatever the previous playthrough left them at.
    Object.assign(this.state, this.freshRunState());

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

    const totalMoney = getTotalMoney(character);
    infoContent.innerHTML = `
      <h2 class="character-name">${character.name} from ${character.origin}</h2>
      <div class="character-stats" style="margin: 30px 0;">
        <div class="stat-line">Checking: $${character.checkingAccount}</div>
        <div class="stat-line">Total credit: $${totalMoney}</div>
        <div class="stat-line">Score Multiplier: ${character.difficulty}x</div>
      </div>
      <div class="character-portrait ${character.id}"></div>
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
      textEl.textContent = `You're ready to hit these streets! I've packed up all your goodies in this popular knapsack with many different locations. I love you`;

      const kissPrompt = document.createElement('p');
      kissPrompt.textContent = 'Do you want to kiss Eric?';
      kissPrompt.style.marginTop = '20px';
      btn.parentNode.insertBefore(kissPrompt, btn);

      btn.textContent = '1. Yes';
      btn.style.marginTop = '10px';
      btn.onclick = () => this.leaveStore();

      const noBtn = document.createElement('button');
      noBtn.className = 'menu-option';
      noBtn.textContent = '2. No';
      noBtn.onclick = () => this.leaveStore();
      btn.insertAdjacentElement('afterend', noBtn);
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
    if (newSpent < 0) return;
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
    const spent = this.calculateSpent();
    const remaining = this.state.balances.chaseSapphire - spent;

    document.getElementById('spent-amount').textContent = `$${spent}`;
    document.getElementById('remaining-amount').textContent = `$${remaining}`;
  }

  leaveStore() {
    const spent = this.calculateSpent();
    this.state.balances.chaseSapphire -= spent;

    // Start the trail
    this.startTrail();
  }


  // ============================================
  // CHAPTERS & SAVE SYSTEM
  // ============================================

  loadSaves() {
    try {
      return JSON.parse(localStorage.getItem('transplant-saves') || '{}');
    } catch (e) {
      return {};
    }
  }

  saveChapter(chapterNum, trailStateSnapshot) {
    const saves = this.loadSaves();
    saves[`ch${chapterNum}`] = {
      characterId: this.state.selectedCharacter.id,
      playerName: this.state.playerName,
      departureMonth: this.state.departureMonth,
      checkingAccount: this.state.checkingAccount,
      balances: { ...this.state.balances },
      dadsAmexCancelled: this.state.dadsAmexCancelled,
      wisemenJoined: this.state.wisemenJoined,
      wiseEricsPitched: this.state.wiseEricsPitched,
      heistDone: this.state.heistDone || false,
      heistAssignments: this.state.heistAssignments || null,
      jailDone: this.state.jailDone || false,
      jailWon: this.state.jailWon || false,
      jailPath: this.state.jailPath || null,
      jailFriendship: this.state.jailFriendship || null,
      jailFlags: this.state.jailFlags || null,
      nycFriends: this.state.nycFriends || [],
      aura: this.state.aura,
      inventory: { ...this.state.inventory },
      bodegaScore: this.state.bodegaScore || 0,
      boroughBucks: this.state.boroughBucks || 0,
      cannonProgress: this.state.cannonProgress || null,
      trailState: trailStateSnapshot,
    };
    saves.latestChapter = Math.max(saves.latestChapter || 1, chapterNum);
    localStorage.setItem('transplant-saves', JSON.stringify(saves));
  }

  continueGame() {
    const saves = this.loadSaves();
    this.resumeChapter(saves.latestChapter || 1);
  }

  resumeChapter(chapterNum) {
    if (chapterNum === 1) {
      this.showCharacterSelect();
      return;
    }

    const saves = this.loadSaves();
    const save = saves[`ch${chapterNum}`];
    if (!save) { this.showChapterSelect(); return; }

    // Restore game state
    this.state.selectedCharacter  = getCharacter(save.characterId);
    this.state.playerName         = save.playerName;
    this.state.departureMonth     = save.departureMonth;
    this.state.checkingAccount    = save.checkingAccount;
    this.state.balances           = { ...save.balances };
    this.state.dadsAmexCancelled  = save.dadsAmexCancelled || false;
    this.state.wisemenJoined      = save.wisemenJoined || false;
    this.state.wiseEricsPitched   = save.wiseEricsPitched || false;
    this.state.heistDone          = save.heistDone || false;
    this.state.heistAssignments   = save.heistAssignments || null;
    this.state.jailDone           = save.jailDone || false;
    this.state.jailWon            = save.jailWon || false;
    this.state.jailPath           = save.jailPath || null;
    this.state.jailFriendship     = save.jailFriendship || null;
    this.state.jailFlags          = save.jailFlags || null;
    this.state.nycFriends         = save.nycFriends || [];
    this.state.aura               = save.aura;
    this.state.inventory          = { ...save.inventory };
    this.state.bodegaScore        = save.bodegaScore || 0;
    this.state.boroughBucks       = save.boroughBucks || 0;
    this.state.cannonProgress     = save.cannonProgress || null;

    this.showScreen('trail-screen');
    trailGame = new TrailGame(this.state);

    // Restore trail state on top of defaults
    const ts = save.trailState;
    trailGame.state.landmarkIndex      = ts.landmarkIndex;
    trailGame.state.transportation     = ts.transportation;
    trailGame.state.spendingMode       = ts.spendingMode;
    trailGame.state.currentDay         = ts.currentDay;
    trailGame.state.currentDate        = new Date(ts.currentDate);
    trailGame.state.vibeWeather        = ts.vibeWeather;
    trailGame.state.hoursElapsed       = ts.hoursElapsed || 0;
    trailGame.state.milesFromLandmark  = 0;

    trailGame.start();
  }

  showChapterSelect() {
    const saves = this.loadSaves();
    this.showScreen('chapter-select');

    const container = document.getElementById('chapter-options');
    container.innerHTML = '';

    CHAPTERS.forEach((ch, i) => {
      const unlocked = ch.id === 1 || !!saves[`ch${ch.id}`];
      const btn = document.createElement('button');
      btn.className = 'menu-option' + (unlocked ? '' : ' chapter-locked');
      btn.disabled = !unlocked;
      btn.textContent = `${i + 1}. ${ch.title}`;
      if (unlocked) btn.onclick = () => this.resumeChapter(ch.id);
      container.appendChild(btn);
    });
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
  // Dev shortcuts (?apartment=1, ?bodega=1, ?cannon=1, ?heist=1, ?jail=1)
  // are handled inside the constructor via maybeDebugJump() -- see game.js
  // above. (There used to be a second, older ?scene=bodega/cannon/heist
  // mechanism here too, with its own divergent dev-character setup and a
  // cannon path that skipped startCannonGame() entirely -- meaning
  // wisemenJoined never got set, so completing it wouldn't actually chain
  // into the heist the way real play does. Consolidated onto the one
  // path that's actually been tested.)
});
