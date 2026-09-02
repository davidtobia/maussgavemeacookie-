# Act 3 Redesign: "The Yard" — implementation plan

Produced by a dedicated Opus planning pass on 2026-09-01, based on the direction given verbatim that session. Not yet implemented. Read this in full before starting build work on jail.js.

## 0. What the arc becomes

```
intake (1 authored panel)
  → YARD (explorable hub, camera-follow, three unlabeled crowd-clusters)
      → discover a leader (proximity, diegetic — no intro cutscene)
      → dialogue tree (owner-authored, per-character, ± friendship)
      → that character's mini-game
      → shared result panel (performance → friendship, "run it back")
      → post-game dialogue (branches on performance)
      → back to YARD  ×3, in any order
  → release-day summary: three friendship tracks, tiers, outcome text
  → finish() → gameState.nycFriends
```

The single-ally structure (`showPathChoice` → `JAIL_PATH_FLAVOR`), the weapon beat, and the Big Steve fight all come out of the live path. Three simultaneous tracks replace them.

---

## 1. File plan

### New files

| File | Role | Who owns it |
|---|---|---|
| `posts/transplant-trail/jail-data.js` | All authored content: characters, dialogue trees, rhythm chart, bet prompts, tier labels, outcome text. **Zero game logic.** | Project owner |
| `posts/transplant-trail/jail-minigames.js` | `JailRhythmGame`, `JailBenchGame`, `JailTripGame` — three self-contained classes, each `constructor(host, charId, onDone)` | Engine |
| `posts/transplant-trail/jail-shelved.js` | The parked fight/weapon code. **Not referenced by index.html.** | Dormant |

### Modified files

- `posts/transplant-trail/jail.js` — becomes orchestration: infra (kept), intake, yard phase, dialogue-tree engine, friendship model, result/summary panels.
- `posts/transplant-trail/index.html` — new script tags + new HUD/overlay blocks inside `#jail-game`.
- `css/posts/transplant-trail.css` — append after line 2244.
- `posts/transplant-trail/trail.js` — rewrite the `startJailGame` callback (lines 1077-1098).
- `posts/transplant-trail/game.js` — new save fields in `freshRunState()` (line 59), the save block (~496), the load block (~535).

Script order in index.html (line 741 area), with version bumps:

```html
<script src="jail-data.js?v=1"></script>
<script src="jail-minigames.js?v=1"></script>
<script src="jail.js?v=3"></script>
```

`jail-data.js` must load first — `jail.js` reads it at construction time for validation.

---

## 2. `jail-data.js` — the authoring surface

This is the load-bearing decision. The file opens with an authoring guide comment (the owner's actual documentation), then four exported globals. Nothing in here is called by name from engine code except the four top-level constants — everything else is walked generically.

### 2a. Characters

```js
const JAIL_CHARACTERS = [
  {
    id: 'diddy',
    name: '[PLACEHOLDER NAME]',
    tag: '[PLACEHOLDER ONE-LINE SUBTITLE]',
    color: '#c86ab0',              // dot, entourage tint, speaker chip, HUD bar
    minigame: 'rhythm',            // 'rhythm' | 'bench' | 'trip'
    yard: { x: 46, y: 34, entourage: 5, turfR: 16 },
    discoverToast: '[PLACEHOLDER: line shown the first time you get close]',
  },
  { id: 'mangione', name: '[PLACEHOLDER NAME]', /* ... */ minigame: 'bench',
    yard: { x: 140, y: 88, entourage: 3, turfR: 14 } },
  { id: 'sbf',      name: '[PLACEHOLDER NAME]', /* ... */ minigame: 'trip',
    yard: { x: 30, y: 100, entourage: 2, turfR: 12 } },
];
```

### 2b. Dialogue trees — schema

Per character, an ordered list of **conversations**. Conversation 0 is the intro (terminates in the mini-game). Conversation 1 is the post-game reaction. 2+ are optional deepening chats, gated. Each conversation is a flat map of nodes keyed by id.

```js
const JAIL_DIALOGUE = {
  diddy: [
    {
      id: 'intro',
      requires: {},                        // always available
      start: 'd0',
      nodes: {

        'd0': {
          speaker: 'diddy',                // 'diddy' | 'player' | 'narrator'
          sub: '[PLACEHOLDER SUBTITLE]',   // optional; header line under the name
          lines: [
            '[PLACEHOLDER LINE 1]',
            '[PLACEHOLDER LINE 2]',
          ],
          choices: [
            {
              label: '[PLACEHOLDER CHOICE A]',
              effects: { friendship: +2, flags: ['diddy_played_along'] },
              next: 'd1a',
            },
            {
              label: '[PLACEHOLDER CHOICE B]',
              effects: { friendship: -1 },
              next: 'd1b',
            },
            {
              label: '[PLACEHOLDER CHOICE C — only if you saw the boombox]',
              requires: { flag: 'yard_saw_boombox' },
              effects: { friendship: +4 },
              next: 'd1c',
            },
          ],
        },

        // No `choices` → engine renders one "Continue" that follows `next`.
        'd1a': {
          speaker: 'narrator',
          lines: '[PLACEHOLDER LINE]',     // a bare string is allowed
          next: 'd_end',
        },

        // Terminal node. Every path must reach one of these.
        'd_end': {
          speaker: 'diddy',
          lines: ['[PLACEHOLDER LINE]'],
          end: { minigame: true, label: '[PLACEHOLDER BUTTON LABEL]' },
        },
      },
    },

    {
      id: 'postgame',
      requires: { minigameDone: true },
      start: 'dp0',
      nodes: {
        'dp0': {
          speaker: 'diddy',
          lines: ['[PLACEHOLDER — reaction to a strong run]'],
          requires: { lastGrade: ['great', 'perfect'] },
          altNode: 'dp0_bad',              // shown instead if requires fails
          choices: [ /* ... */ ],
        },
        'dp0_bad': { speaker: 'diddy', lines: ['[PLACEHOLDER — reaction to a weak run]'],
                     choices: [ /* ... */ ] },
      },
    },

    {
      id: 'deep1',
      requires: { friendshipAtLeast: 45, convoDone: 'postgame' },
      start: 'dd0',
      nodes: { /* ... */ },
    },
  ],

  mangione: [ /* same shape */ ],
  sbf:      [ /* same shape */ ],
};
```

**Condition object** (`requires`) — one shared evaluator, `checkRequires(cond, charId)`. Every key optional; all present keys must pass (AND only — no OR; if you need OR, author two nodes). Supported keys:

```
flag / flags        string or array — all must be set
notFlag / notFlags  none may be set
friendshipAtLeast   number, this character
friendshipBelow     number, this character
otherFriendship     { sbf: 40, mangione: 10 }  — cross-character gating
minigameDone        true/false, this character
lastGrade           array of 'bail'|'weak'|'ok'|'great'|'perfect'
convoDone           conversation id on this character
```

**Effects object** (`effects`) — one shared applier, `applyEffects(fx, charId)`:

```
friendship        +n / -n on the current character
friendshipOther   { mangione: -3 }  — how rivalry works, purely opt-in per choice
flags             array to set
clearFlags        array to unset
aura              +n / -n on the existing gameState.aura
```

**Authoring conveniences the engine supports** (documented in the file header, so the owner can write less):
- `lines` may be a string or an array of strings.
- A node with no `choices` renders a single Continue following node-level `next`.
- A choice with no `effects` is a pure branch.
- `title` defaults to the speaker's `name`; `speaker: 'narrator'` renders with no name chip.
- A choice may carry `lockedLabel` — when its `requires` fails it renders greyed and disabled instead of hidden (use for "you can see what you're missing" moments).

**`validateJailDialogue()` — build this, it matters.** Runs once on `JailGame` construction (and callable from the console). Walks every character → conversation → node and console-errors on: a `next`/`start`/`altNode` pointing at a missing node id; a node with neither `choices`, `next`, nor `end`; an unreachable node; a conversation with no reachable terminal; an `effects.friendshipOther` naming an unknown character. The owner will be hand-editing a large object literal and a typo'd `next` would otherwise silently dead-end a playthrough. This is the single highest-value 60 lines in the plan.

### 2c. Other authored content in the same file

```js
const JAIL_INTAKE = { title: '[PLACEHOLDER]', sub: '[PLACEHOLDER]',
                      lines: ['[PLACEHOLDER]'], button: '[PLACEHOLDER]' };

const JAIL_TIERS = [                       // friendship thresholds, low → high
  { min:  0, label: '[PLACEHOLDER TIER 0]' },
  { min: 20, label: '[PLACEHOLDER TIER 1]' },
  { min: 40, label: '[PLACEHOLDER TIER 2]' },
  { min: 60, label: '[PLACEHOLDER TIER 3]' },   // <- "actually a friend"
  { min: 80, label: '[PLACEHOLDER TIER 4]' },
];

const JAIL_OUTCOMES = {
  perCharacter: { diddy: ['[PLACEHOLDER T0]', /* ...5 entries, one per tier */] },
  release: ['[PLACEHOLDER 0 FRIENDS]', '[PLACEHOLDER 1]', '[PLACEHOLDER 2]', '[PLACEHOLDER 3]'],
};

const JAIL_YARD_FLAVOR = [                 // optional ambient interactables
  { id: 'boombox', x: 62, y: 20, r: 6,
    title: '[PLACEHOLDER]', lines: ['[PLACEHOLDER]'],
    setsFlag: 'yard_saw_boombox' },
  // ~4 of these. Pure flavor + a flag, which is how exploring the yard
  // first unlocks extra dialogue choices later. No score of their own.
];

const JAIL_RHYTHM_CHART = { bpm: 104, offsetMs: 0, bars: [ '0.1.2.2.', /* ... */ ] };
const JAIL_BETS = [ { prompt: '[PLACEHOLDER]', a: { label: '[PLACEHOLDER]', p: 0.5 },
                                                b: { label: '[PLACEHOLDER]', p: 0.2 } } ];
```

---

## 3. The yard phase (jail.js)

Reuse the heist floor pattern **verbatim in structure**. New methods on `JailGame`:

`yardLayout()` · `startYard()` · `yardLoop()` · `drawYardScene()` · `yardBounds()` · `yardClick(px,py)` · `yardPushOffProps(e,r)` · `yardToast(text,ms)` · `updateYardHud()` · `enterConversation(charId)`

### World and camera

- World: **180 × 120** logical units. `yardCamView = 90`. (Keep world > camView on both axes or the camera clamp `Math.max(view/2, Math.min(worldW - view/2, x))` inverts.)
- **Copy `floorBounds()` (heist.js:981-1000) including its square-side logic and its comment.** The yard does `Math.hypot` proximity checks for discovery and approach radii in logical units — that is exactly the bug class that comment documents. A non-square render rect would make the approach radius reach further in one axis than the drawn ring.
- `toPx` / `toPxLen` / `visible()` copied from `drawFloorScene()` (heist.js:1314-1319).

### Movement and input

Player is the only controlled entity. Reuse `floorClick`'s screen→world unprojection exactly (heist.js:1002-1012), and the `floorLoop` move-toward-target step (heist.js:1147-1158): tap the ground to set `tx/ty`, walk there, push out of props. Tap-to-move (not a d-pad) because the yard is a hub — precision doesn't matter, and it costs zero new input surface. Add WASD/arrows as a desktop nicety that nudges `tx/ty`.

### Props (solid, `yardPushOffProps` = the floor's `floorPushOffShelves`)

Handball wall, bleachers, three picnic tables, a weight-pile platform, a phone-bank wall run, and the perimeter fence as four thin rects. No line-of-sight system — no guards hunt you here. **Recommendation: the yard is a safe hub with no fail state.** The heist already owns stealth; repeating it would be filler, and the yard's job is to deliver dialogue and mini-games.

### How the three leaders are "visually marked"

Three-layer read, tuned for a small canvas:

1. **Ambient population.** ~18 generic inmate dots, radius 6px, muted `#6b6157`, slow random-walk targets. They are the noise the signal reads against.
2. **The cluster is the marker.** A leader is a radius-11 dot in their `color`, plus `entourage` satellite dots (radius 7, `color` at 45% alpha) idling in a loose ring around them, plus a faint ground tint disc of `turfR` in that color. At any zoom, a colored cluster in a field of grey singles reads instantly as "something is happening there" — far more legibly than a sprite difference would. It also *is* the fiction: these are the guys with people around them.
3. **No name until you're close.** Three radii, all in world units:
   - `> 26` — cluster only, no label. You do not know who that is.
   - `≤ 26` (**discover**) — name label + tier pip fade in over ~20 frames, `discoverToast` fires once, character is marked `discovered: true` and appears in the HUD friendship strip for the first time.
   - `≤ 9` (**approach**) — a pulsing ring draws on their dot, an on-canvas prompt appears, and the `#jail-yard-approach` HUD button un-hides with the label `Talk to {name}`.

Tapping a discovered leader's dot directly also walks you to them and auto-enters at arrival (set `pendingApproach = charId`, checked in the loop the same way `pendingHotspot` is at heist.js:1154).

### Backing out

- The dialogue overlay's root node always renders a final leave button. If the author supplied one it uses their label; if not the engine appends a default `Walk away` choice. Guaranteed, never a trap.
- Deeper nodes: leaving is only offered where the author sets `canLeave: true`. Default is `true` at depth 0 and `false` after — conversations get some commitment without ever being inescapable at the door.
- Abandoning mid-tree stores `resumeNodeId` for that conversation; re-approaching resumes there rather than restarting. Friendship effects already applied stay applied.
- Returning from a conversation restores your yard position exactly (`this.yard` persists on the instance; `startYard()` only rebuilds when `this.yard` is null).

### Leaving the yard

A gate marker at the yard door, always walkable-to. Approaching it opens a confirm panel. Before all three intro conversations + mini-games are done it warns you what you're leaving on the table (named, per character); after, it's a clean exit. Never hard-locked — a player who hates one of the mini-games can still finish the act.

---

## 4. The dialogue engine (jail.js)

Small — ~150 lines. Methods:

```
nextConvoFor(charId)         first conversation whose `requires` passes and isn't done
startConversation(charId, convoId)
renderNode()                 resolves altNode, filters choices, calls showDialogue()
chooseOption(i)              applyEffects → next | end
applyEffects(fx, charId)
checkRequires(cond, charId)
endConversation(end)         { minigame } | { returnToYard } | { flags }
```

`showDialogue()` (jail.js:126-150) is kept almost as-is. Two additions: a speaker chip element colored by `JAIL_CHARACTERS[].color`, and support for disabled choices (`lockedLabel`). A friendship-delta pip (`+2`) flashes in the corner when a choice applies a non-zero `friendship`, so the score is never opaque — the player can always see that a choice mattered and by how much.

`end.minigame: true` → `stopYardLoop()`, phase `'minigame'`, instantiate the class named by that character's `minigame` field.

---

## 5. The three mini-games (`jail-minigames.js`)

All three share one contract:

```js
new JailRhythmGame(host, charId, onDone)
// host provides: canvas, ctx, gameState, showOverlay/hideOverlays, stopLoop
// onDone({ grade, friendshipGain, stats: [[label, value], ...], detail: {...} })
```

`grade` is one of `bail | weak | ok | great | perfect`, derived from `friendshipGain` (0 / 1-11 / 12-22 / 23-33 / 34-45). Every game caps its friendship contribution at **+45**, so all three are worth the same and no one is punished for finding a given mechanic hard.

The shared `#jail-result` panel shows the raw stats **and the arithmetic**: e.g. `Accuracy 78% → +31 friendship`. Legibility over mystery. "Run it back" replays for free, and **the best run counts, not the latest** — these are three brand-new untested mechanics, and a punishing first attempt shouldn't permanently cost you a friend.

---

### 5a. Diddy — three-lane rhythm game

**Mechanic.** Three vertical lanes; notes travel top→bottom toward a judgment bar at ~78% height. Three big buttons under it (reuse `.jail-fight-btn` styling, generalized to `.jail-btn`), plus J/K/L and ←/↓/→ on desktop.

**Chart format** (in `jail-data.js`, retimable by the owner without touching code): `bars` is an array of 8-character strings, one per bar, each char an eighth-note slot — `0`, `1`, `2` for a lane, `.` for a rest. `'0.1.2.2.'` is literally readable as a rhythm. ~40 bars at 104 BPM ≈ 92 seconds; recommend trimming to ~30 bars (~70s) for a first pass.

**Timing.** Windows measured in ms from the note's target time: **PERFECT ±55, GREAT ±100, OK ±150**, miss beyond. Timestamp the input inside the `pointerdown`/`keydown` handler with `performance.now()` — never on the next rAF, that's a free 16ms of jitter.

**Audio.** No audio assets exist in this project. Recommendation: a tiny WebAudio `JailBeat` — kick (sine 55Hz, fast decay), hat (short noise burst), one bass note per bar. No asset, works offline, fits the handcrafted ethos. Two hard requirements: (1) create/resume the `AudioContext` inside the click handler that launched the game or iOS silently blocks it; (2) **schedule and judge everything off `audioCtx.currentTime`, never off rAF frame counts**, using the standard 25ms-interval / 100ms-lookahead scheduler, or audio and visuals will drift apart within 30 seconds. If WebAudio is unavailable, fall back to `performance.now()` and run silent — the chart still plays.

**Scoring.** perfect 100 / great 70 / ok 35 / miss 0, times a combo multiplier that steps up 0.1 every 10 consecutive non-misses, capped at 2.0x. `accuracy = earned / maxPossible`.

**No fail state.** It's a friendship gauge, not a wall.

**Friendship:** `round(45 * clamp((accuracy - 0.35) / 0.55, 0, 1))`. 35% accuracy earns nothing; 90%+ earns the full 45.

---

### 5b. Luigi — bench press

**Mechanic chosen: one-button hold/release, tempo-scored, three sets of increasing weight.**

Justification for this over the alternatives: pure button-mashing is unfair across devices and input methods and is a solved, uninteresting mechanic. A single power meter with one timed stop is over in two seconds and has no arc. Hold/release gives you a *physical* mapping (hold = push, release = lower), produces the actual drama of benching (the sticking point), and needs exactly one input, which is the right amount of control surface for a two-minute side game on a phone.

**Spec.**
- `barY ∈ [0,1]`, 0 = chest, 1 = lockout. Holding: `barY += pushRate * dt`. Released: `barY -= dropRate * dt`.
- A rep completes on the transition `barY ≥ 0.95` → `barY ≤ 0.08`.
- **Fatigue:** `pushRate` decays ~7% per completed rep within a set, and the base drops each set as Luigi adds plates. Sets are 3, with target reps roughly 8 / 6 / 4.
- **The sticking point:** when `pushRate` decays below `dropRate` while `barY` is in the top third, the bar stalls and visibly shakes. That's the moment of drama and it's emergent from the numbers, not scripted.
- **Tempo is the skill.** A beat pip pulses at a fixed interval. The ideal rep takes `targetRepMs = 2000` end to end. `repScore = clamp(1 - |dur - target| / 900, 0, 1)`. Rushing (bouncing off the chest) and grinding both score poorly.
- **Form meter** drains on a bounce (direction reversal below 0.08 above a speed threshold) or a stall exceeding 1.5s. Form at 0 ends *that set only* — the spotter racks it. You keep the reps you got and move to the next set. Failing a set is never a run-ender.

**Input:** one big `#jail-bench-btn` HOLD button, plus Space and pointerdown anywhere on the canvas. Wire it with the press/release shape from `bindFightInput` (jail.js:316-335), which already handles `pointerleave`/`pointercancel` correctly.

**Draw:** side view — bench, body, barbell tracking `barY`, plate discs sized by set weight, Luigi at the head with an animated spotter arm. Rectangles and arcs, same as `drawFightScene`.

**Friendship:** `round(45 * (0.6 * repFrac + 0.4 * avgRepScore))`, where `repFrac = clamp(totalReps / 18, 0, 1)`. Volume is most of it; form is the rest. Both shown in the result panel.

---

### 5c. Sam Bankman-Fried — the trip

**Format chosen: top-down traversal, camera-follow, over a long vertical world.** Not a side-scroller.

Justification: (1) the codebase has two proven top-down camera implementations (`floorLoop`, `mazeLoop`) and zero platformers — a side-scroller means new gravity, jump-arc, and one-way-collision code plus a lot of feel tuning, all of it new risk on the most content-heavy of the three games; (2) the whole point here is *optional side objectives that pull you off the path*, and "off the path" barely means anything on a 1D scroll axis but means everything in 2D space; (3) mobile input is already solved for top-down movement here.

**Input:** continuous-velocity d-pad (`#jail-trip-pad`, copying the `.heist-pad-btn` press/release binding at heist.js:435-452) + WASD/arrows. Not tilt.

**World.** ~120 wide × 420 tall. A winding rainbow **road** runs bottom (start) to top (the castle gate). Off-road is a shifting void where movement drops to **0.55×**. That is the entire distraction tax, made physical rather than abstract: side objectives sit off-road at increasing distances, and going for one literally costs you road speed to get there and back.

**The constraint is one clock.** `tripTime` starts at ~100s. Reach the castle before it expires → Caroline rescued. Expire → you come down on the yard floor, Caroline not rescued, but you keep every Util you earned.

**Four side-objective types, all simultaneously available, none mutually exclusive:**

| Objective | Placement | Cost | Reward |
|---|---|---|---|
| **Shrimp pool** — hold 1.5s to relieve suffering | near-road, common (~6) | ~4s each | +1 Util |
| **Lobster pot** — hold 3s to take it off the boil | mid-distance (~4) | ~8s each | +3 Utils |
| **Portfolio bet** — an authored two-option hypothetical wager, resolved by a roll | on/near road (~3) | 0s to take, **−8s and −4 Utils on a loss** | +6 Utils on a win |
| **Polyamorous tech term sheet** — a pickup | far off-road (1-2) | ~12s | **×1.3 multiplier on all future Utils**, permanent for the run |

The bets are the only thing that can go negative, which is the "plus-EV" joke made mechanical — positive expected value, high variance, capable of wrecking a run. The term sheet is a real investment decision: only worth it if you take it *early* and then collect a lot afterward.

**Tuning target, stated explicitly:** place ~14 objectives whose full-clear detour cost totals ~150s against a 100s clock. You cannot do everything. A good run gets 60-70% of them. That ratio is the thing to tune.

**Rendering.** Hue-cycled palette: `hue = (frame * 0.7 + worldY * 2) % 360` fed into `hsl()`. A wobble applied inside the projection (`x + sin(frame*0.03 + y*0.1) * amp`) — cheap, and reads as psychedelic without shaders. Keep `amp` modest and **respect `prefers-reduced-motion` by dropping it to 0**. The top ~60 units desaturate toward dark stone, the road narrows, the void closes in, and no side objectives spawn — that is literally the "rainbow → dark castle" transition, and it gives the finale a clean run at the gate. Caroline is a marker at the top; touching it ends the run.

**No enemies or hazards in v1.** The clock plus the off-road slow is already two pressures; adding a third means building a combat system inside a side game.

**Friendship — two scores mapping to two different things, and this is the design payoff:**

```
rescued (bool)  → +25 flat, sets flag 'sbf_rescued_caroline'
utils   (int)   → round(20 * clamp(utils / 30, 0, 1))
                                                    cap 45, same as the others
```

So you can max Utils and let Caroline burn, or rescue her with nothing to show for it. Sam's post-game conversation branches four ways on `rescued × utilsTier`. The "distraction" isn't a trap — it's a competing value system, which is the actual joke, and the owner gets four distinct authoring slots out of it.

---

## 6. Friendship system and the new win condition

**Model.** `this.friendship = { diddy: 10, mangione: 10, sbf: 10 }`, scale 0-100, starting at 10. Tiers from `JAIL_TIERS` at 0/20/40/60/80. **Tier 3 (60+) is "actually a friend."**

**Budget, so the numbers are designed rather than accidental:**

| Source | Swing |
|---|---|
| Intro conversation choices | ~+10 total available |
| Mini-game (best run) | 0 to +45 |
| Post-game conversation | ~+10 |
| Optional deepening conversations (tier-gated) | ~+8 each |

Reaching tier 3 (60) requires a decent mini-game run *plus* engaging with the dialogue. Reaching tier 4 (80) requires the optional conversations, which are themselves gated at 45 — so the top tier is only available to someone who did well early and then came back. Bailing on a mini-game caps you around tier 2.

**Do the tracks conflict?** By default, no — the owner's stated goal is "impress them all," so all three are simultaneously maxable. The only conflict is **opt-in and data-driven**: `effects.friendshipOther` lets any individual authored choice cost you with another leader. If the owner wants a real rivalry, they write it into specific choices; the engine never imposes one. **Recommendation: no time/day limit in v1.** A cap would create real tension but it multiplies tuning risk across three untested mini-games; if it's wanted later, day-gate the optional conversations rather than the core loop.

**Player-facing readout.** A persistent top strip in the yard: one row per *discovered* character — colored dot, name, a thin fill bar, and the tier label from `JAIL_TIERS`. Undiscovered characters show nothing at all (preserving the discovery beat). Plus the `+2` delta pip flashing on the dialogue panel whenever a choice moves a score.

**Success at the end of the arc.** No winner/loser. The release-day summary shows all three tracks with their tier labels and `JAIL_OUTCOMES.perCharacter[id][tierIndex]`, then a closing line from `JAIL_OUTCOMES.release[friendCount]` where `friendCount = number of characters at ≥60`. 3/3 is the stated goal; 1-2 is partial; 0 is its own outcome.

**Handoff:**

```js
onComplete({
  jailFriendship: { diddy: 72, mangione: 41, sbf: 58 },
  jailFlags: [...],
  nycFriends: ['diddy'],          // ids at tier >= 3 — the Act 4 handle
  jailFriendCount: 1,
  jailDone: true,
  jailWon: friendCount === 3,     // kept for save-format compatibility only
  jailPath: null,                 // dead field, kept so old saves still load
});
```

**Integration edits:** add `jailFriendship: null`, `jailFlags: null`, `nycFriends: []` to `freshRunState()` (game.js:59-74) and to both the save block (~496) and load block (~535), defaulting to null/`[]` for saves that predate them. In `trail.js:1089-1091`, drop the `jailWon` ternary and pull the outcome copy from `JAIL_OUTCOMES.release[friendCount]` so the owner authors it.

---

## 7. Shelving the fight and the weapon beats

**Kept dormant, moved out of the way, not deleted.**

Move `showActivity1`, `showActivity2`, `showWeaponResult`, `showFightIntro`, `startFight`, `bindFightInput`, `resolveFightInput`, `fightLoop`, `updateFightHud`, `drawFightScene`, `endFight`, and the `JAIL_PATH_FLAVOR` constant into `jail-shelved.js`, with a header comment stating why it's parked and exactly what reviving it needs: a caller, the `#jail-fight-hud` markup, and a reason for a fight to exist in the new structure. **`index.html` does not load this file.**

Move it rather than leave it commented in place: `jail.js` is about to roughly triple in size, and 200 lines of unreachable code sitting in the middle of the new yard/dialogue engine is exactly the kind of thing a future session helpfully rewires by accident.

`#jail-fight-hud` markup (index.html:695-712) stays, wrapped in an HTML comment with a pointer to `jail-shelved.js`. The `.jail-fight-*` CSS (transplant-trail.css:2142-2244) stays as-is; generalize `.jail-fight-btn` into a `.jail-btn` base class that the new rhythm/bench buttons share, keeping `.jail-fight-btn` as an alias.

`JAIL_RECRUITERS` (jail.js:13-47) is superseded by `JAIL_CHARACTERS` and is first-pass placeholder prose the owner is replacing anyway — it goes, preserved in git history rather than in the tree.

**A revival path worth noting but not building:** Big Steve could come back as a *shared* fourth beat — all three leaders have an opinion about him, and the fight becomes an optional finale paying friendship to whoever backed you. That fits the new three-track structure much better than being the climax did.

---

## 8. Open questions that genuinely need the owner

1. **Day/time limit in the yard?** Recommendation: none in v1. But if you want scarcity to force choosing between them, that's a structural decision to make before the tuning pass, not after.
2. **Should any two leaders be genuinely opposed?** The engine supports it per-choice via `friendshipOther`. Which pairs, if any, and how hard?
3. **Is "a friend" 60+, and is act success all three or two of three?**
4. **Rhythm game audio** — is a synthesized beat acceptable, or do you want to supply a track (and is one licensable for a public site)?
5. **Does the player character speak?** Are choice labels spoken lines or intents? Both work; pick one convention before authoring or the trees will read inconsistently.
6. **SBF's split** — should rescuing Caroline be worth more than Utils, or does Sam genuinely value Utils more? Currently 25/20 in Caroline's favor; inverting it is funnier and worth a call.
7. **Fixed order or player-chosen for the three?** Recommendation: player-chosen — but that means each intro conversation must not assume the others happened, or must gate on flags.
8. **What does a "friend" mean in Act 4?** Is `nycFriends: ['diddy']` enough, or does a friend need carried state (a favor owed, an item, a phone number)?
9. **Retries** — unlimited with best-run-counts (recommended), or one shot each?
10. **Should the yard have any way to get in trouble at all,** or is it purely a safe hub?

---

## 9. Suggested build order

Each slice is independently playable and testable via the existing `?jail=1` debug jump (game.js:197-217). Add a `window.JAIL_DEBUG = { startAt: 'yard'|'rhythm'|'bench'|'trip', friendship: {...} }` read in `init()` in slice 1 — with three new mini-games to iterate on, booting straight into one pays for itself immediately.

**Slice 1 — the authoring loop, end to end.** `jail-data.js` schema + `validateJailDialogue()` + the dialogue engine + friendship model + result/summary panels + save integration. The yard is a *stub*: three static tappable dots, no camera, no walking. Terminal nodes just `returnToYard`. Two-node placeholder trees. This is the smallest thing that proves the owner can write dialogue and see it work — and it's the thing everything else depends on.

**Slice 2 — the real yard.** World, camera-follow, props, walking, ambient population, entourage clusters, discovery/approach radii, HUD strip, toast, flavor points and their flags. Exploration becomes real.

**Slice 3 — bench press.** Simplest of the three (one input) and it validates the shared minigame → result → friendship handoff plumbing all three depend on. Build `#jail-result` here.

**Slice 4 — rhythm game,** including the WebAudio beat and the chart format.

**Slice 5 — the trip,** in two passes: (a) traversal + clock + castle + Caroline, rescue-only; (b) the four side-objective types and Utils.

**Slice 6 — polish.** Optional deepening conversations, tier-keyed outcome text, the `jail-shelved.js` move, `trail.js` message rewrite, tuning across all three.

A session with partial budget should stop at a slice boundary. Slices 1-3 alone are a complete, shippable version of the arc with one working mini-game.

---

### Critical Files for Implementation
- `/Users/davidtobia/maussgavemeacookie/posts/transplant-trail/jail.js`
- `/Users/davidtobia/maussgavemeacookie/posts/transplant-trail/heist.js` (lines 773-1480: `startFloor`/`floorClick`/`floorBounds`/`floorLoop`/`drawFloorScene`; lines 428-452: d-pad binding)
- `/Users/davidtobia/maussgavemeacookie/posts/transplant-trail/index.html` (lines 678-713, 734-742)
- `/Users/davidtobia/maussgavemeacookie/css/posts/transplant-trail.css` (lines 2088-2244)
- `/Users/davidtobia/maussgavemeacookie/posts/transplant-trail/trail.js` (lines 1077-1098) and `/Users/davidtobia/maussgavemeacookie/posts/transplant-trail/game.js` (lines 59-74, ~496, ~535)
