# Cupid Cookie's Fortune Game

A campy, interactive fortune-telling game where players answer questions to receive personalized love fortunes.

## How to Edit Fortunes

All fortunes are stored in **`fortunes.js`** - open that file to edit, add, or remove fortunes.

### Structure

The file contains three main sections:

1. **BORING_FORTUNES** - Simple, mundane fortunes for players who say "no"
2. **THEMED_FORTUNES** - Organized by 8 love themes (each has 2-3 variations)
3. **THEME_MAP** - Maps sense + season combinations to themes

### The 8 Love Themes

1. **forbiddenLove** (black cards, 🖤) - Star-crossed, taboo romance
2. **unrequitedLove** (grey cards, 💙) - Pining, longing, one-sided
3. **passionateLove** (red cards, ❤️‍🔥) - Intense, fiery, consuming
4. **sweetLove** (pink cards, 💕) - Innocent, tender, pure
5. **chaoticLove** (purple cards, 💜) - Messy, dramatic, beautiful disaster
6. **lostLove** (navy cards, 💔) - Nostalgic, what could have been
7. **newLove** (gold cards, ✨) - Fresh starts, butterflies, possibility
8. **selfLove** (gradient cards, 🌟) - Independence, self-worth (the secret best ending!)

### Adding New Fortunes

Just add to the arrays in `fortunes.js`:

```javascript
forbiddenLove: [
  "Your existing fortune here...",
  "Your existing fortune here...",
  "Your new fortune here!"  // Add this line
],
```

### Changing Card Colors

Edit the `THEME_STYLES` object in `fortunes.js`:

```javascript
forbiddenLove: {
  cardColor: '#1a1a1a',      // Background color
  textColor: '#fff',          // Text color
  borderColor: '#8b0000',     // Border color
  emoji: '🖤'                  // Card emoji
},
```

### Remapping Combinations

To change which sense + season leads to which theme, edit the `THEME_MAP`:

```javascript
'touch-winter': 'forbiddenLove',  // Touch + Winter = Forbidden Love
'touch-summer': 'passionateLove', // Touch + Summer = Passionate Love
```

## Game Flow

1. Player asked: "Do you want to play my game?"
   - **No** → Random boring fortune (beige card)
   - **Yes** → Continue to questions

2. Three Questions (if yes):
   - Pick a sense: sight, smell, taste, hearing, touch, LOVE
   - Who do you trust: [type name - doesn't affect outcome, just engagement]
   - Choose a season: winter, spring, summer, fall, rainy, dry, LOVE

3. Fortune generated based on sense + season combination

4. Player can share or play again

## Special Combos

- **LOVE + LOVE** = Self Love theme (the secret best ending!)
- **LOVE sense** = Always intense themes (forbidden, passionate, chaotic)
- **Smell sense** = Often nostalgic (lost love)

## Tone Guidelines

The fortunes should be:
- **Campy** - Over-the-top, dramatic, self-aware
- **Brief** - 1-2 sentences max
- **Visual** - Use strong imagery
- **Sincere underneath** - Camp is serious fun, not mockery
- **Love-focused** - Even the boring ones can hint at connection

## Files

- `index.html` - Game interface
- `fortunes.js` - **EDIT THIS** - All fortune data
- `game.js` - Game logic (don't need to edit unless changing flow)
- `../../css/posts/fortune-cookie.css` - Styling

## Testing Locally

Just open `index.html` in your browser - no build process needed!
