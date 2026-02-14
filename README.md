# Mauss Gave Me a Cookie

A gift to the internet. A personal website embodying the philosophy of the early, free internet - a gift economy approach inspired by Marcel Mauss and David Graeber.

**🌐 Live Site:** https://davidtobia.github.io/maussgavemeacookie-/

## Philosophy

This site deliberately goes against modern internet trends:
- **No frameworks** - Just vanilla HTML, CSS, and JavaScript
- **No dark patterns** - No tracking, no analytics, no monetization
- **No optimization** - Each post is handcrafted and exists because it's interesting, not because it's optimized
- **Non-hierarchical** - Posts aren't organized chronologically or by popularity; they exist as equals
- **Collaborative** - The structure is designed to be approachable for non-coders working with Claude Code

Following Neil Postman's insight from "Amusing Ourselves to Death," the medium influences content, so the form of this site is part of its point. Each post can have custom typography, scroll effects, and background moods that change based on content tone.

## Project Structure

```
maussgavemeacookie/
├── index.html                 # Homepage
├── css/
│   ├── base.css              # Core typography, resets, shared styles
│   ├── layout.css            # Grid, spacing, responsive patterns
│   ├── moods.css             # Reusable mood/atmosphere classes
│   └── posts/                # Per-post custom stylesheets
│       ├── table-for-one.css
│       └── cape-town-bonzaya.css
├── js/
│   ├── core.js               # Minimal utilities (scroll detection)
│   ├── effects.js            # Reusable scroll effects, parallax
│   └── posts/                # Per-post custom JavaScript
│       └── cape-town-bonzaya.js
├── posts/
│   ├── table-for-one/
│   │   └── index.html
│   └── cape-town-bonzaya/
│       └── index.html
└── README.md                  # This file
```

## How to Add a New Post

1. **Create a post directory**
   ```bash
   mkdir -p posts/your-post-slug
   ```

2. **Create the HTML file** (`posts/your-post-slug/index.html`)
   - Copy an existing post as a template
   - Update the `<title>` and `<meta>` tags
   - Update the relative paths to CSS/JS files (use `../../`)
   - Write your content

3. **Create custom CSS** (optional)
   ```bash
   touch css/posts/your-post-slug.css
   ```
   - Add any custom styles specific to your post
   - Link it in your HTML file

4. **Create custom JavaScript** (optional)
   ```bash
   touch js/posts/your-post-slug.js
   ```
   - Add any custom scroll effects or interactions
   - Link it in your HTML file

5. **Add to homepage** (`index.html`)
   - Add a new post card in the `.posts-grid` section
   - Include a title, description, and `data-mood` attribute

## Available Moods

Moods control the atmospheric background and color scheme of scenes. Use the `data-mood` attribute on `<section class="scene">` elements or post cards.

Available moods:
- **bright** - Optimistic, light, energetic (yellow/warm tones)
- **dark** - Somber, reflective, heavy (dark backgrounds)
- **tense** - Anxious, nervous, on edge (red/pink undertones)
- **calm** - Peaceful, serene, restful (blue tones)
- **hopeful** - Looking forward, possibility (green tones)
- **melancholic** - Wistful, nostalgic, bittersweet (purple tones)
- **neutral** - Clear, straightforward (white/clean)

Example:
```html
<section class="scene" data-mood="calm">
  <div class="scene-content">
    <p>Your content here...</p>
  </div>
</section>
```

## Available Scroll Effects

Add scroll-based interactions using the `data-scroll-behavior` attribute:

- **parallax** - Element moves at different speed while scrolling
  - Add `data-parallax-speed="0.5"` to control speed (0.5 = half speed)
- **fade-in** - Element fades in when entering viewport
- **emphasize** - Text gradually becomes bolder as you scroll through it
- **scale** - Element scales up/down while scrolling
  - Add `data-scale-min="0.8"` and `data-scale-max="1.2"` to control range

Example:
```html
<p data-scroll-behavior="fade-in">This text will fade in</p>
<div data-scroll-behavior="parallax" data-parallax-speed="0.3">
  Slower scrolling element
</div>
```

## CSS Custom Properties

You can override these variables in your custom CSS files:

### Typography
- `--font-serif` - Body text font
- `--font-sans` - Heading font
- `--font-size-base` to `--font-size-5xl` - Size scale
- `--line-height-tight` to `--line-height-loose` - Line heights

### Spacing
- `--space-xs` to `--space-4xl` - Spacing scale

### Colors
- `--color-text` - Primary text color
- `--color-text-light` - Secondary text color
- `--color-background` - Background color
- `--color-accent` - Link color

### Layout
- `--max-width-text` - Maximum width for readable text (65ch)
- `--max-width-wide` - Maximum width for wide content (90rem)

## Testing Locally

No build process needed! Just open the HTML files in your browser:

```bash
# Open homepage
open index.html

# Or use a local server for better testing
python3 -m http.server 8000
# Then visit http://localhost:8000
```

## Scene-Based Structure

Posts can be divided into semantic `<section class="scene">` elements, each with its own mood and scroll behavior. This allows different parts of your narrative to have distinct visual feels.

Example:
```html
<section class="scene" data-mood="bright">
  <div class="scene-content">
    <h2>Opening Scene</h2>
    <p>Happy, optimistic content...</p>
  </div>
</section>

<section class="scene" data-mood="tense">
  <div class="scene-content">
    <h2>Conflict</h2>
    <p>Tense, anxious content...</p>
  </div>
</section>

<section class="scene" data-mood="calm">
  <div class="scene-content">
    <h2>Resolution</h2>
    <p>Peaceful, resolved content...</p>
  </div>
</section>
```

The mood transitions happen automatically as you scroll, based on which scene is most prominently in view.

## Progressive Enhancement

The site is built with progressive enhancement in mind:
- All posts work perfectly as plain HTML without CSS or JavaScript
- CSS adds visual styling and moods
- JavaScript adds scroll effects and mood transitions
- Each layer enhances the experience but isn't required

## Collaboration with Claude Code

This site is designed to be easy to modify with Claude Code, even if you're not a coder:

1. **To add a post**: Say "I want to add a new post called [title]"
2. **To change moods**: Say "Make this section feel more [adjective]"
3. **To add effects**: Say "I want this text to [effect description]"
4. **To adjust colors**: Say "Make the bright mood more [color/feeling]"

The structure is organized so that each post lives in its own directory, making it clear what files belong to what content.

## Design Principles

- **Handcrafted**: Each post is individually crafted HTML. Make one post a poem, another a visual essay, another a murder mystery - the structure doesn't constrain.
- **Expressive**: Scene/mood system provides building blocks for rich experiences without constraining creativity.
- **Anti-modern**: No analytics, no tracking, no monetization, no frameworks, no build process.
- **Gift economy**: Each post is a complete, standalone gift. Structure embodies generosity.

## License

This is a gift. Do what you want with it.
