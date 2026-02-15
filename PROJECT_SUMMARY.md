# Mauss Gave Me a Cookie - Project Summary

**Live Site:** https://maussgavemeacookie.com
**Last Updated:** February 15, 2026

## Philosophy & Purpose

A personal website embodying the philosophy of the early, free internet - a gift economy approach inspired by Marcel Mauss and David Graeber. The site deliberately goes against modern internet trends:

- **No frameworks** - Vanilla HTML, CSS, and JavaScript only
- **No dark patterns** - No analytics tracking beyond basic GoatCounter
- **No optimization obsession** - Things exist because they're interesting, not optimized
- **Handcrafted & expressive** - Each piece can have custom typography, effects, backgrounds
- **Non-hierarchical** - Content organized by interest, not chronology
- **Collaborative** - Structure approachable for non-coders working with Claude Code

**Name origin:** Play on "If You Give a Mouse a Cookie" referencing Mauss's work on gift economies.

**Key principle (Neil Postman):** The medium influences content, so the form of the site is part of the point.

---

## Current Structure

### Tech Stack
- **Pure vanilla** HTML5, CSS3, JavaScript (ES6+)
- **No build process** - Direct file serving
- **GitHub Pages** hosting with custom domain
- **GoatCounter** for privacy-friendly analytics

### Directory Organization
```
maussgavemeacookie/
├── index.html                    # Homepage
├── css/
│   ├── base.css                 # Typography, resets, design system
│   ├── layout.css               # Grid, spacing, responsive
│   ├── moods.css                # Atmospheric presets
│   └── posts/
│       └── your-valentine-future.css
├── js/
│   ├── core.js                  # Scroll utilities
│   └── effects.js               # Scroll effects, parallax
├── posts/
│   ├── table-for-one/
│   │   └── index.html          # Addiction recovery essay
│   ├── cape-town-bonzaya/
│   │   └── index.html          # Journalism piece
│   └── your-valentine-future/
│       ├── index.html          # Interactive fortune game
│       ├── game.js
│       ├── fortunes.js
│       └── images/
└── images/
```

---

## Current Content

### 1. Homepage
- **Featured section** - Prominent purple card at top highlighting current feature
- **Category sections:**
  - Personal Essays & Commentary (2 posts)
  - News Analysis & Predictions (empty)
  - Daily Thoughts (empty)
  - Games, Fun & Exploration (1 game)

### 2. Personal Essays

**"Table for one; drying myself with a wet towel"**
- Published: 2023
- Topic: Addiction and recovery
- Style: Honest, reflective with emoji section breaks (🙂🙃🙂, 😐🤥😐, 😔😶😔, 😌😋😌)
- Presentation: Straightforward, focused on readability

**"Life, Death and Meth in Cape Town"**
- Published: 2014
- Topic: Buying drugs with local musician during semester abroad
- Style: Narrative journalism revealing systemic poverty/gang issues in post-apartheid Cape Town
- Presentation: Text-based with potential for mood transitions

### 3. Interactive Game

**"Your Valentine Future"**
- **URL:** `/posts/your-valentine-future/`
- **Format:** Interactive decision-tree fortune teller game
- **Theme:** Dark mystical Salem aesthetic with purple/black colors
- **Gameplay:**
  1. Initial yes/no to play
  2. Choose a sense (sight, smell, taste, hearing, touch, LOVE)
  3. Enter who you trust (text input)
  4. Choose a season (winter, spring, summer, fall, rainy, dry, LOVE)
  5. Receive fortune based on combinations

- **Fortune Types:** 8 themed fortunes + 1 mundane
  - Forbidden Love, Unrequited Love, Passionate Love, Sweet Love
  - Chaotic Love, Lost Love, New Love, Self Love
  - Each has: category, fortune text, blessing/curse (randomly shown), action, share text

- **Features:**
  - Animated character (cupidman, cupidzen) with spinning/smoke/lightning effects
  - Tent background with mystical atmosphere
  - Fortune card download as PNG (1080x1080)
  - Web Share API + clipboard fallback
  - Fully mobile-optimized
  - User wrote all fortune text (unhinged, campy voice)

- **Visual Effects:**
  - Variable spin speed (accelerates each question)
  - Billowing purple smoke clouds
  - Sharp lightning on final question
  - Candlelight flicker overlay
  - Floating mystical sparks

---

## Design System

### CSS Architecture
- **Custom properties** for colors, spacing, typography
- **Mood system** - Reusable atmospheric classes (bright, dark, tense, calm)
- **Scene-based structure** - Posts divided into semantic sections with data attributes
- **Progressive enhancement** - Works as plain text without JavaScript
- **Fluid typography** - Uses clamp() for responsive scaling

### Visual Identity
- **Primary palette:** Purple gradient mysticism for interactive features
- **Typography:** Serif body text, sans-serif headings
- **Spacing:** Consistent scale using CSS custom properties
- **Responsive:** Mobile-first with clean breakpoints

---

## What Works Well

1. **Gift economy ethos** - Site genuinely feels handcrafted and generous
2. **Valentine game virality** - Friends loved it, drove traffic
3. **Mobile experience** - Fortune game works beautifully on phones
4. **Vanilla approach** - Easy to iterate, no build complexity
5. **Atmospheric effects** - Smoke, lightning, spinning create magic
6. **User agency** - Decision tree feels personal and fun
7. **Shareability** - Download card feature enables social spread

---

## Technical Achievements

- **CSV workflow** for non-technical fortune editing
- **Canvas-based card generation** for downloads
- **Responsive fortune cards** that match downloaded quality
- **Complex animations** without libraries
- **Scene system** for narrative posts with mood transitions
- **Data-driven fortune selection** (6 senses × 7 seasons → 8 themes)

---

## Potential Expansion Areas

### Content
- Fill out empty category sections (News Analysis, Daily Thoughts)
- More interactive experiences/games
- Seasonal rotations for featured content
- User-generated fortune submissions
- More personal essays with custom visual treatments

### Interactive Features
- Other fortune/oracle systems (tarot, I Ching, etc.)
- Choose-your-own-adventure stories
- Interactive poetry/art
- Mini-games with gift economy theme
- Collaborative projects with friends

### Technical
- Scene-based post template for rich narrative experiences
- More mood presets and visual effects library
- Simple CMS for easier content updates
- RSS feed for new posts
- Comment system (maybe webmentions?)

### Community
- Guest posts from friends
- Collaborative fortune writing
- User fortune submissions
- Share statistics/leaderboards
- Easter eggs and secrets

---

## Current Stats

- **GoatCounter Analytics:** https://maussgavemeacookie.goatcounter.com
- **Tracking:** Page views, unique visitors, referrers, devices
- **Privacy-focused:** No personal data collection

---

## Philosophy for Next Projects

Should maintain:
- ✅ Handcrafted feel
- ✅ No frameworks
- ✅ Gift economy spirit
- ✅ Playful, experimental
- ✅ Mobile-friendly
- ✅ Shareable

Could explore:
- Different types of interactivity
- Collaborative/social elements
- Seasonal/temporary content
- More experimental visual treatments
- Cross-linking between pieces

---

## Technical Notes for Claude

- All code is vanilla JS/CSS/HTML
- Files are directly editable
- Git workflow: commit → push → GitHub Pages deploys automatically
- Custom domain via Cloudflare
- Images can be large (character images ~7-9MB PNGs)
- Mobile-first responsive design critical
- User wants to maintain approachable structure for non-coders
