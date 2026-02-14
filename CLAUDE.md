# maussgavemeacookie - Claude Code Instructions

## Project Overview

Personal website called "Mauss Gave Me a Cookie" - a handcrafted, anti-modern approach to web publishing that embodies gift economy principles inspired by Marcel Mauss and David Graeber.

**Philosophy:** Each post is a gift to the internet. No frameworks, no dark patterns, no optimization for engagement. Handcrafted HTML/CSS/JS only.

**Live Status:** ✅ DEPLOYED!
- Live URL: https://davidtobia.github.io/maussgavemeacookie-/
- GitHub: https://github.com/davidtobia/maussgavemeacookie-
- Deployed: February 14, 2026

## Site Structure

```
maussgavemeacookie/
├── index.html              # Homepage with 4 category sections
├── images/                 # Photos and mascot
│   ├── mascot.png         # Cookie character (top of homepage)
│   ├── hero.jpg           # Mountain landscape header
│   ├── bg-essays.jpg      # Background for Personal Essays section
│   ├── bg-news.jpg        # Background for News section
│   ├── bg-thoughts.jpg    # Background for Daily Thoughts section
│   └── bg-games.jpg       # Background for Games section
├── css/
│   ├── base.css           # Typography, colors, design system
│   ├── layout.css         # Grid, responsive patterns
│   ├── moods.css          # Atmospheric presets (currently disabled)
│   ├── redacted.css       # Black bar redaction styling
│   └── posts/             # Per-post custom styles
├── js/
│   ├── core.js            # Scroll utilities
│   ├── effects.js         # Scroll effects (mostly disabled due to bugs)
│   └── posts/             # Per-post custom JavaScript
├── posts/
│   ├── table-for-one/     # Personal essay on addiction/recovery
│   └── cape-town-bonzaya/ # Journalism piece (names redacted for privacy)
├── CLAUDE.md              # This file
└── README.md              # Documentation for collaborators
```

## Content Categories

Homepage is organized into 4 sections:

1. **Personal Essays & Commentary** - Long-form writing (2 posts currently)
2. **News Analysis & Predictions** - Coming soon
3. **Daily Thoughts** - Coming soon (will have comments enabled)
4. **Games, Fun & Exploration** - Coming soon (murder mystery game planned!)

## Important Design Decisions

### Privacy & Redactions
- Cape Town post uses `<span class="redacted"></span>` to black-bar names
- NO actual names in HTML source (SEO-safe, respects privacy)
- CSS creates visual black bars with `redacted.css`

### Photos
- All from Patagonia trip
- Hero image: IMG_3938.jpg (mountain peaks)
- Category backgrounds: 8% opacity, subtle atmosphere
- Mascot: Cute cookie character with milk glass

### JavaScript/Effects
- Scroll effects currently disabled (were causing bugs/jumping)
- Mood system exists but not active
- Site works perfectly without JS (progressive enhancement)

### Text Placeholders
- Post descriptions: "In progress"
- Empty categories: "Coming soon"
- No AI-generated placeholder text (per user preference)

## Tech Stack & Philosophy

**Current:**
- Vanilla HTML/CSS/JS only
- No frameworks, no build process
- Static site (no backend)
- Local development: `python3 -m http.server 8000`

**Planned for Deployment:**
- GitHub Pages (free hosting)
- GoatCounter (free, privacy-friendly analytics)
- Giscus (GitHub Discussions for comments)
- Custom domain: maussgavemeacookie.com

## How to Add New Posts

1. Create directory: `posts/post-slug/`
2. Create `posts/post-slug/index.html`
3. (Optional) Create `css/posts/post-slug.css`
4. (Optional) Create `js/posts/post-slug.js`
5. Add post card to homepage in appropriate category section
6. Use existing posts as templates

## How to Add Photos

1. Save image to `images/` folder
2. Reference in HTML: `<img src="images/filename.jpg" alt="description">`
3. For HEIC/HEIF images from iPhone: Convert with `sips -s format jpeg input.HEIC --out output.jpg`
4. Optimize large images to keep repo size down

## Murder Mystery Game Plans

**Planned features:**
- Character selection (detective/journalist/scientist perspectives)
- Choice-driven narrative with consequences
- Primary documents to unlock and read
- Mini-games: ciphers, evidence matching, timeline puzzles
- Multiple endings based on player choices
- Save state to localStorage (browser-local)
- All client-side JavaScript (no backend needed)
- Set in a future world (to be designed)

**Implementation:** Can be built entirely with vanilla JS, works perfectly on static hosting.

## Deployment Checklist

- [x] Initialize git repository
- [x] Create GitHub repository
- [x] Push code to GitHub
- [x] Enable GitHub Pages in repo settings
- [x] Add `.nojekyll` file (disable Jekyll processing)
- [x] Test live site - IT'S LIVE!
- [ ] Purchase custom domain (maussgavemeacookie.com)
- [ ] Configure custom domain on GitHub Pages
- [ ] Set up GoatCounter analytics
- [ ] Add Giscus comments to Daily Thoughts section
- [ ] Add tip button (Ko-fi or Stripe)
- [x] Update README with live URL

## What Won't Work on GitHub Pages

- Server-side code (PHP, Python, Node.js)
- Databases (PostgreSQL, MySQL)
- Custom backend/API
- Multiplayer game state
- Private repository without GitHub Pro

**But everything we've planned works fine!**

## Commands Reference

```bash
# Local development server
python3 -m http.server 8000
# Then open http://localhost:8000

# Convert HEIC to JPG
sips -s format jpeg input.HEIC --out output.jpg

# Check image dimensions
sips -g pixelWidth -g pixelHeight image.jpg

# Future: Git workflow (after deployment)
git add .
git commit -m "Update content"
git push
```

## Known Issues

- Scroll effects were buggy (jumping at bottom of page) - currently disabled
- Mood transitions were causing layout shifts - currently disabled
- These can be re-enabled and fixed later if desired

## User Preferences

- **No AI-generated placeholder text** - use "In progress" or "Coming soon"
- **No emojis** unless explicitly requested
- **Privacy-respecting** - redact real names, no tracking
- **Anti-modern** - no frameworks, hand-crafted approach
- **Gift economy** - each post is a gift, not optimized for engagement

## Next Session Tasks

1. Deploy to GitHub Pages
2. Get live URL
3. Set up custom domain (if ready)
4. Add analytics and comments (optional)

## Contact & Collaboration

This is a personal project designed to be managed through Claude Code. The structure allows non-coders to work with Claude to add content, adjust styling, and build new features iteratively.

---

Last updated: 2026-02-14
