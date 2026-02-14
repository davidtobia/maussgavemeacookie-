/**
 * FORTUNE COOKIE GAME - GAME LOGIC
 * Conversation flow and fortune selection
 */

class FortuneCookieGame {
  constructor() {
    this.state = {
      stage: 'intro',
      wantsToPlay: null,
      sense: null,
      trusted: null,
      season: null,
      fortune: null,
      theme: null,
      questionCount: 0  // Track for escalating speed
    };

    this.conversationContainer = document.getElementById('conversation');
    this.inputContainer = document.getElementById('input-container');
    this.init();
  }

  init() {
    this.addMascotMessage("hello, lover... WELCOME to my fortune tent. I know the question you seek, what you must know. Will your day be filled with LOVE. Or with DANGER. Play my game?");
    this.showYesNoButtons();
  }

  showLoadingCharacter(isFinal = false) {
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'loading-character' + (isFinal ? ' final' : ' zen');
    loadingDiv.id = 'loading-character';

    // Variable spin speed based on question count
    const spinSpeed = Math.max(0.4, 2 - (this.state.questionCount * 0.4)); // 2s → 1.6s → 1.2s → 0.8s → 0.4s
    loadingDiv.style.setProperty('--spin-speed', spinSpeed + 's');

    const img = document.createElement('img');
    img.src = 'images/cupidzen.png';
    img.alt = 'Consulting the spirits...';

    loadingDiv.appendChild(img);

    // Add billowing smoke effect
    const smokeContainer = document.createElement('div');
    smokeContainer.className = 'smoke-billows';
    loadingDiv.appendChild(smokeContainer);

    // Create multiple billowing smoke clouds
    for (let i = 0; i < 12; i++) {
      setTimeout(() => {
        const cloud = document.createElement('div');
        cloud.className = 'smoke-cloud';

        const size = Math.random() * 150 + 100;
        const isPurple = Math.random() > 0.3;
        cloud.style.width = size + 'px';
        cloud.style.height = size + 'px';
        cloud.style.backgroundColor = isPurple
          ? `rgba(138, 43, 226, ${0.15 + Math.random() * 0.15})`
          : `rgba(200, 180, 255, ${0.1 + Math.random() * 0.1})`;

        cloud.style.left = (Math.random() * 100) + '%';
        cloud.style.top = (Math.random() * 100) + '%';
        cloud.style.animationDelay = (Math.random() * 2) + 's';
        cloud.style.animationDuration = (3 + Math.random() * 2) + 's';

        smokeContainer.appendChild(cloud);
      }, i * 100);
    }

    // Add sharp lightning for final transition
    if (isFinal) {
      const lightningContainer = document.createElement('div');
      lightningContainer.className = 'lightning-strikes';
      loadingDiv.appendChild(lightningContainer);

      // Create screen flash overlay
      const flash = document.createElement('div');
      flash.className = 'screen-flash';
      lightningContainer.appendChild(flash);

      // Create multiple lightning bolt paths
      for (let i = 0; i < 3; i++) {
        setTimeout(() => {
          const bolt = document.createElement('div');
          bolt.className = 'lightning-crack';

          // Random position
          const left = (Math.random() * 60 + 20) + '%';
          const top = (Math.random() * 60 + 20) + '%';
          bolt.style.left = left;
          bolt.style.top = top;

          // Random rotation
          bolt.style.transform = `rotate(${Math.random() * 360}deg)`;

          lightningContainer.appendChild(bolt);

          // Add glow around strike point
          const glow = document.createElement('div');
          glow.className = 'lightning-glow';
          glow.style.left = left;
          glow.style.top = top;
          lightningContainer.appendChild(glow);
        }, i * 300);
      }
    }

    this.conversationContainer.appendChild(loadingDiv);
    this.scrollToBottom();
  }

  removeLoadingCharacter() {
    const loading = document.getElementById('loading-character');
    if (loading) {
      loading.remove();
    }
  }

  addMascotMessage(text, delay = 0) {
    setTimeout(() => {
      const bubble = document.createElement('div');
      bubble.className = 'message mascot-message';
      bubble.innerHTML = `<div class="bubble">${text}</div>`;
      this.conversationContainer.appendChild(bubble);
      this.scrollToBottom();
    }, delay);
  }

  addPlayerMessage(text) {
    const bubble = document.createElement('div');
    bubble.className = 'message player-message';
    bubble.innerHTML = `<div class="bubble">${text}</div>`;
    this.conversationContainer.appendChild(bubble);
    this.scrollToBottom();
  }

  scrollToBottom() {
    this.conversationContainer.scrollTop = this.conversationContainer.scrollHeight;
  }

  showYesNoButtons() {
    this.inputContainer.innerHTML = `
      <button class="choice-btn yes-btn" onclick="game.handleYesNo(true)">Yes!</button>
      <button class="choice-btn no-btn" onclick="game.handleYesNo(false)">No thanks</button>
    `;
  }

  handleYesNo(answer) {
    this.addPlayerMessage(answer ? "Yes!" : "No thanks");
    this.state.wantsToPlay = answer;

    if (!answer) {
      this.zenTransition(() => this.endGameBoring());
    } else {
      this.state.questionCount++;
      this.zenTransition(() => this.askSense());
    }
  }

  askSense() {
    this.addMascotMessage("yes.... Yes...", 500);
    this.addMascotMessage("FIRST I MUST ask... as I always do... Pick a sense that you trust.", 1500);

    setTimeout(() => {
      this.inputContainer.innerHTML = `
        <div class="choice-grid">
          <button class="choice-btn" onclick="game.handleSense('sight')">👁️ Sight</button>
          <button class="choice-btn" onclick="game.handleSense('smell')">👃 Smell</button>
          <button class="choice-btn" onclick="game.handleSense('taste')">👅 Taste</button>
          <button class="choice-btn" onclick="game.handleSense('hearing')">👂 Hearing</button>
          <button class="choice-btn" onclick="game.handleSense('touch')">✋ Touch</button>
          <button class="choice-btn" onclick="game.handleSense('LOVE')">💕 LOVE</button>
        </div>
      `;
    }, 1500);
  }

  handleSense(sense) {
    this.state.sense = sense;
    const display = sense === 'LOVE' ? '💕 LOVE' : sense.charAt(0).toUpperCase() + sense.slice(1);
    this.addPlayerMessage(display);
    this.state.questionCount++;
    this.zenTransition(() => this.askTrusted());
  }

  zenTransition(callback, isFinal = false) {
    this.inputContainer.innerHTML = '';
    this.showLoadingCharacter(isFinal);
    this.addMascotMessage("I am thinking, I am learning. These things... I SEE. about.... YOU!", 200);

    setTimeout(() => {
      this.removeLoadingCharacter();
      callback();
    }, 3500);  // Longer for comedic effect
  }

  askTrusted() {
    this.addMascotMessage("As expected.... The unexpected !", 500);
    this.addMascotMessage("Hmmmm... something I must know... Who do you trust? (Type a name)", 1500);

    setTimeout(() => {
      this.inputContainer.innerHTML = `
        <input type="text" id="trust-input" placeholder="Type a name..." />
        <button class="choice-btn" onclick="game.handleTrusted()">Submit</button>
      `;
      document.getElementById('trust-input').focus();
      document.getElementById('trust-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') this.handleTrusted();
      });
    }, 1500);
  }

  handleTrusted() {
    const input = document.getElementById('trust-input');
    const name = input.value.trim() || 'yourself';
    this.state.trusted = name;
    this.addPlayerMessage(name);
    this.state.questionCount++;
    this.zenTransition(() => this.askSeason());
  }

  askSeason() {
    const name = this.state.trusted;
    this.addMascotMessage(`Ah, ${name}. A wise choice. A strange choice. A DANGEROUS choice`, 500);
    this.addMascotMessage("FINAL QUESTION. Choose the season where you find comfort", 1500);

    setTimeout(() => {
      this.inputContainer.innerHTML = `
        <div class="choice-grid">
          <button class="choice-btn" onclick="game.handleSeason('winter')">❄️ Winter</button>
          <button class="choice-btn" onclick="game.handleSeason('spring')">🌸 Spring</button>
          <button class="choice-btn" onclick="game.handleSeason('summer')">☀️ Summer</button>
          <button class="choice-btn" onclick="game.handleSeason('fall')">🍂 Fall</button>
          <button class="choice-btn" onclick="game.handleSeason('rainy')">🌧️ Rainy</button>
          <button class="choice-btn" onclick="game.handleSeason('dry')">🏜️ Dry</button>
          <button class="choice-btn" onclick="game.handleSeason('LOVE')">the season of LOVE</button>
        </div>
      `;
    }, 1500);
  }

  handleSeason(season) {
    this.state.season = season;
    const seasonEmoji = {
      'winter': '❄️',
      'spring': '🌸',
      'summer': '☀️',
      'fall': '🍂',
      'rainy': '🌧️',
      'dry': '🏜️',
      'LOVE': '💕'
    };
    this.addPlayerMessage(`${seasonEmoji[season]} ${season.charAt(0).toUpperCase() + season.slice(1)}`);

    // Use final transition with lightning
    this.zenTransition(() => this.generateFortune(), true);
  }

  generateFortune() {
    // Look up theme based on sense + season combination
    const key = `${this.state.sense}-${this.state.season}`;
    const theme = THEME_MAP[key];
    this.state.theme = theme;

    // Get random fortune object from theme
    const fortunes = THEMED_FORTUNES[theme];
    const fortune = fortunes[Math.floor(Math.random() * fortunes.length)];
    this.state.fortune = fortune;

    this.addMascotMessage("Your fortune has been revealed...", 500);
    setTimeout(() => {
      this.showFortuneCard();
    }, 1000);
  }

  endGameBoring() {
    this.addMascotMessage("Ok here's your cookie dude", 500);

    setTimeout(() => {
      const fortune = BORING_FORTUNES[Math.floor(Math.random() * BORING_FORTUNES.length)];
      this.state.fortune = fortune;
      this.state.theme = 'boring';
      this.showFortuneCard();
    }, 2000);
  }

  showFortuneCard() {
    const style = THEME_STYLES[this.state.theme];
    const fortune = this.state.fortune;

    this.inputContainer.innerHTML = '';

    const card = document.createElement('div');
    card.className = 'fortune-card';
    card.style.background = style.cardColor;
    card.style.color = style.textColor;
    card.style.borderColor = style.borderColor;

    // Randomly pick blessing or curse
    const showBlessing = Math.random() > 0.5;

    card.innerHTML = `
      <div class="fortune-category">${fortune.category}</div>
      <div class="fortune-emoji">${style.emoji}</div>
      <div class="fortune-text">${fortune.fortune}</div>
      <div class="fortune-fate ${showBlessing ? 'is-blessing' : 'is-curse'}">
        ${showBlessing ? fortune.blessing : fortune.curse}
      </div>
      <div class="fortune-action">${fortune.action}</div>
      <div class="fortune-share-text">${fortune.shareText}</div>
      <div class="fortune-footer">
        <button class="action-btn" onclick="game.downloadCard()">Download Card</button>
        <button class="action-btn" onclick="game.shareFortune()">Share Text</button>
        <button class="action-btn" onclick="game.reset()">Play Again</button>
      </div>
    `;

    card.id = 'fortune-card-to-download';

    this.conversationContainer.appendChild(card);
    this.scrollToBottom();
  }

  downloadCard() {
    const card = document.getElementById('fortune-card-to-download');
    const style = THEME_STYLES[this.state.theme];

    // Create canvas
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    // Set canvas size (square card)
    canvas.width = 1080;
    canvas.height = 1080;

    // Draw background with gradient/color
    if (style.cardColor.includes('gradient')) {
      // For gradients, use a solid approximation
      ctx.fillStyle = '#764ba2';
    } else {
      ctx.fillStyle = style.cardColor;
    }
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw border
    ctx.strokeStyle = style.borderColor;
    ctx.lineWidth = 8;
    ctx.strokeRect(20, 20, canvas.width - 40, canvas.height - 40);

    // Set text properties
    ctx.fillStyle = style.textColor;
    ctx.textAlign = 'center';

    // Draw category
    ctx.font = 'bold 32px Arial';
    ctx.fillText(this.state.fortune.category, canvas.width / 2, 100);

    // Draw emoji
    ctx.font = '120px Arial';
    ctx.fillText(style.emoji, canvas.width / 2, 240);

    // Draw fortune text (wrap text)
    ctx.font = 'italic 40px Georgia';
    this.wrapText(ctx, this.state.fortune.fortune, canvas.width / 2, 320, canvas.width - 120, 50);

    // Draw blessing/curse (randomly chosen same as display)
    const showBlessing = card.querySelector('.fortune-fate').classList.contains('is-blessing');
    const fateText = showBlessing ? this.state.fortune.blessing : this.state.fortune.curse;
    ctx.font = 'bold 32px Arial';
    this.wrapText(ctx, fateText, canvas.width / 2, 580, canvas.width - 120, 42);

    // Draw action
    ctx.font = '28px Arial';
    this.wrapText(ctx, this.state.fortune.action, canvas.width / 2, 720, canvas.width - 120, 36);

    // Draw share text
    ctx.font = 'italic 24px Georgia';
    ctx.globalAlpha = 0.8;
    this.wrapText(ctx, this.state.fortune.shareText, canvas.width / 2, 880, canvas.width - 120, 32);
    ctx.globalAlpha = 1;

    // Draw website URL at bottom
    ctx.font = 'bold 20px Arial';
    ctx.fillText('maussgavemeacookie.com', canvas.width / 2, 1040);

    // Download
    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = 'my-valentine-fortune.png';
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
    });
  }

  wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = text.split(' ');
    let line = '';
    let currentY = y;

    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' ';
      const metrics = ctx.measureText(testLine);
      const testWidth = metrics.width;

      if (testWidth > maxWidth && n > 0) {
        ctx.fillText(line, x, currentY);
        line = words[n] + ' ';
        currentY += lineHeight;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line, x, currentY);
  }

  shareFortune() {
    const fortune = this.state.fortune;
    const text = `${fortune.category}\n\n"${fortune.fortune}"\n\n${fortune.shareText}\n\nDiscover YOUR Valentine future: maussgavemeacookie.com/posts/fortune-cookie/`;

    if (navigator.share) {
      navigator.share({
        title: 'Your Valentine Future',
        text: text
      });
    } else {
      // Fallback: copy to clipboard
      navigator.clipboard.writeText(text).then(() => {
        alert('Fortune copied to clipboard!');
      });
    }
  }

  reset() {
    this.state = {
      stage: 'intro',
      wantsToPlay: null,
      sense: null,
      trusted: null,
      season: null,
      fortune: null,
      theme: null
    };

    this.conversationContainer.innerHTML = '';
    this.inputContainer.innerHTML = '';
    this.init();
  }
}

// Initialize game when page loads
let game;
document.addEventListener('DOMContentLoaded', () => {
  game = new FortuneCookieGame();
});
