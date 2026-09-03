# ZOOMIES v3 — Gameplay Design

## 0. Diagnosis first: why v2 isn't fun (this drives everything below)

The "I don't understand the gameplay" reaction has four specific, fixable causes — not a vibes problem:

1. **The curves are cosmetic.** `update()` does `this.playerX += this.steerDir * STEER_SPEED * dt` and nothing else. There is no centrifugal force, no curve pull — a comment claims there is, but the code doesn't implement it. Meanwhile the road violently swings sideways on screen because `_project` offsets by `seg.worldX - this.playerX`. So the player sees dramatic motion that their input has no relationship to. **That specific mismatch — big visual motion, no mechanical consequence — is what "disorienting and unclear" feels like from the inside.** It's the number one bug.

2. **There is nothing to aim at.** Coins are scattered at `off: (Math.random() - 0.5) * 1.3` — pure noise. The entire legibility mechanism of Sonic special stages / OutRun is that pickups form a *readable line* that tells you where to steer two seconds before you get there. Random scatter can't do that. Replacing scatter with an authored ribbon is the single highest-value change in this document.

3. **Obstacles are unreadable.** `hop` vs `dodge` differ only by fill color on the same ellipse. At speed that's invisible. The player is being asked to make a binary decision from a cue they can't perceive.

4. **The best-looking thing in the game is non-interactive.** The Vessel leap freezes forward motion, auto-jumps, sets invincibility, and awards free coins for 90 frames. The player does nothing. The moment the game gets most spectacular is the moment it stops being a game.

Also: speed ramps on distance alone, so nothing the player does changes how fast the world moves. In a Sonic-idiom game, **speed is the reward**. That connection is missing entirely.

---

## 1. The unifying frame: RUSH, not coins

**Meta-goal across the whole run: a single RUSH meter (0→1) that never resets between beats.** Coins are gone.

Why this and not a score:
- It is literally the drug. The mechanic and the fiction are the same object, so it needs no explanation.
- A bar that fills and makes the world faster/louder/brighter is understood in under a second by everyone.
- It gives all six beats one shared success/fail language, which is what stitches them into one run instead of six stapled minigames. Beats are self-contained in **verb**; continuous in **state**.
- It replaces a death state. **The run has no fail-out.** You always reach Little Island. What varies is how fast, how bright, and how high rush peaked. This matches the "fun spectacle, not a PSA" mandate, and matters because the user is writing the comedown themselves — the game shouldn't pre-judge the player before their copy runs.

**Rush drives, all at once (this is the feedback loop):**

| rush | speed | world |
|---|---|---|
| 0.0–0.33 | `baseSpeed` | muted saturation, short ball trail, short spikes, narrow FOV |
| 0.33–0.66 | +35% | full saturation, speed-lines start, spikes extend |
| 0.66–1.0 | +75% | color-cycling on accent hues, chromatic aberration, persistent glowing ribbon trailing the player, camera FOV widens, screen-edge glow |

Rush decays slowly on its own (~0.04/sec) so idling drops you, and each beat's verb pumps it. Failing a beat's action drops it ~0.15 (a visible fraction of a tier). **The punishment is the world getting duller, not a game over.** That is a real, felt consequence with zero narrative cost.

The tier thresholds should be *visible in a screenshot* — a player showing a friend their phone should be able to point at it.

---

## 2. The one control scheme, learned once

Currently there are three controls with overlapping meanings. Cut to two, never overloaded:

- **Steer:** hold left half / right half of canvas. Keep as-is.
- **Act:** the existing action button. **Its label is the legibility hook** — changes per beat (`JUMP` / `HOLD` / `LEAP`) and pulses when the game wants input.

Each beat uses exactly one of tap-events or held-state, never both at once. Cut hold-to-charge spin dash entirely — it's a second meaning on one input, it stops you steering, and it's a Sonic idiom with no player-facing motivation here. Speed comes from the beat verb, not a charge button.

Keyboard fallback (←/→, Space) stays for desktop testing.

---

## 3. Five engine changes (build these before any beat)

**E1 — Segment elevation.** Segments get `y`. Camera rides `groundYAt(playerZ) + cameraHeight + playerAirY`; `_project` subtracts it. Unlocks the Bethesda stairs, the Vessel helix, Little Island's variable-height caps, and makes jumps actually feel like jumps (currently a jump only offsets the sprite's screen-y — the world doesn't move).

**E2 — Per-segment path width.** `seg.w` replaces the global road width. The current road is far wider than the off-road threshold anywhere, so steering has no stakes. Narrow paths (the Ramble's footpaths, Little Island's spans) create stakes; wide plazas create relief.

**E3 — The ribbon replaces scattered coins.** One continuous authored line of pickups per beat, hand-specified as deliberate S-curves/spirals/forks, drawn as a connected glowing line into the distance — not isolated dots. **This is the legibility system for the entire game.**

**E4 — Shape-coded obstacles, one global rule, never violated:**
> **Anything you must JUMP is LOW AND WIDE. Anything you must STEER AROUND is TALL AND NARROW.**

Learnable from one instance, readable at any distance, colorblind-safe, survives color-cycling at high rush.

**E5 — Instant off-path consequence.** Not a speed multiplier decay. Leaving the path = shake + hit-flash + rush drops a tier + snapped back to the edge. Immediate and unmissable.

**Architecture:** replace the zone array and growing if-chains with a `ZOOMIES_BEATS` array: `{ id, title, palette, build(), update(g, dt), renderBackdrop(), renderScenery(), onEnter(), onExit() }`. Dispatch on the active beat.

---

## 4. THE SIX BEATS

### BEAT 1 — Central Park: Alice in Wonderland (teach)

**Verb:** steer to thread the ribbon — a lazy S-weave of glowing mushroom-caps. No obstacles for ~4s. Rush raises speed, which raises the weave's difficulty without new rules. One low bronze bench crosses the path at the end (`JUMP` pulses); that's the whole tutorial, taught by geometry.

**Legibility:** open under an arching elm canopy framing a giant seated bronze figure at the end, with a glowing line leading straight to it.

**Fail/success:** deliberately no-fail. Punishment here would be a design error. Missed pickups just mean rush stays low.

**Visual identity:** seated bronze figure on a domed mushroom cap, flanked by a tall-eared rabbit and a stovepipe-hatted figure; ring of six low bronze mushroom domes the ribbon runs through; hex-paver plaza; Conservatory Water on one side (flat blue ellipse, 5-6 white triangle sailboats); double rows of arching elms; daylight but drug-saturated.

**Transition:** path runs under the mushroom ring, canopy closes fully (~0.5s green darkening) and opens into the Ramble. The canopy closing *is* the wipe.

### BEAT 2 — Central Park: The Ramble (test — decision under speed)

**Verb:** the path forks every ~1.5s around a rock/tree; hold left or right at speed. One branch clear and ribboned, the other shorter but costs a jump or thins into a thicket.

**Cheap fork implementation:** don't build a graph — shrink path width, place a wide obstacle at center, draw two dirt paths visibly diverging around it and rejoining. Mechanically it's "dodge a central obstacle." Visually it's a fork.

**Legibility:** the ribbon visibly bends down one side at each fork. Later in the beat it starts lying — splitting into two branches, one denser but gated.

**Fail/success:** real risk, soft fail. Hitting the rock = big shake, rush drops a full tier, speed halves ~1s, shunted to one side. No restart. **This is where "compelling" gets earned or the direction fails — you'll know here.**

**Visual identity:** crooked unmilled-log zigzag railings with cross-braces (the single most Ramble-specific cheap detail); grey-blue angular schist outcrops as fork-splitters; the Ramble Arch used once as a midpoint gate (narrow tall stone arch between two rock walls); a plank bridge near the end; dappled light blobs scrolling toward camera (the *only* beat with dapple); closed/fogged horizon (the *only* beat you can't see far in) — contrasts hard against beat 1's long view and beat 3's open water.

**Transition:** trees thin, fog lifts, horizon snaps wide open with Bow Bridge visible in the distance. Closed → wide open costs nothing and is a genuine gasp beat.

### BEAT 3 — Central Park: The Lake (timing — spectacle peak of the park)

**Verb:** rhythm-tap to skip across the water. Fixed sine bounce; ~180ms window at each surface contact. Tap on contact — perfect (±60ms) → `PERFECT` floater, big bounce, rush up; good → small bounce; miss → sink, slow, lose rush, `SPLASH!` (already a sanctioned string elsewhere in this codebase).

**The key detail — don't lose this in implementation:** while bouncing you still steer, and the ribbon arcs *upward* — pickups sit at bounce-apex height, so a good bounce collects them and a bad one passes underneath. A perfect chain lifts you high enough to **skim over the top of Bow Bridge instead of passing under it** — a visible, earned, wordless difference between playing well and badly.

**Legibility:** first water contact shows a ripple ring expanding in sync with the button pulsing (the standard rhythm-game "ring closing on target" affordance). First bounce is free/shown before it counts.

**Fail/success:** real risk, forgiving. Missing costs rush + a slowdown, never the run.

**Visual identity:** Bow Bridge (shallow cast-iron arch, repeating circle/scroll balustrade pattern, small urn finials along the top rail); water as horizontal reflected-color bands with specular sparkle, pushed toward magenta/cyan interference at high rush; your own bounce ripples persist behind you; small rowboats with two stick-figure occupants that rock when you pass close; skyline (the only park beat with one) — San Remo's twin towers, the Beresford's three towers, Belvedere Castle to the north, Bethesda Terrace + the Angel of the Waters fountain at the far shore; weeping willows trailing to the waterline.

**Transition:** land at Bethesda Terrace, run up the terrace stairs (first showpiece for the new elevation system), burst out of the park west side over ~4s as trees→buildings, dirt→pavement, day→night. **The Central Park slice ends here.**

### BEAT 4 — Lincoln Center (showoff — the ballet spin)

**Verb:** hold to spin, release to launch. Road ends in a circle around the Revson Fountain. Hold locks a pirouette — steering disabled, forward speed fixed, scene rotates, rush pours in per revolution. An exit gate marker rotates counter to you; release when it hits the top of the screen. Longer hold = more banked rush, but the window keeps sliding — greedy-hold-vs-clean-release tension.

**Cheap implementation:** don't build a circular track — keep the track scrolling forward, apply a ramping `ctx.rotate` about screen center to the whole scene during the spin. Pickups spawn in a fixed-radius ring, collected per revolution. Radial motion-blur via repeat-drawing the road at rotated alpha.

**Legibility:** ribbon spirals inward toward the fountain like water down a drain; road ends in a ring; button flips to `HOLD` with a rotating arrow; the fountain's central jet visibly rises with each revolution — a progress bar built into the world.

**Fail/success:** low risk, opt-in depth. One revolution is fine. Four-plus with a nailed exit is where the payoff lives. A blown release costs rush and gives a wobbly exit, nothing more.

**Visual identity:** white travertine plaza, night, warm-lit (the palette flip from park-green to cream/gold/black is the biggest contrast in the run); the Met's five tall round-topped arches dead ahead with two abstract color masses (red, yellow) in the flanking arches; Revson Fountain center (black basin, pulsing white jet, ring of smaller jets); Koch Theater and Geffen Hall as symmetric evenly-spaced-pier facades (the only symmetric composition in the run — that's why it reads as Lincoln Center); ballerina silhouettes en pointe ringing the plaza, rotating with you and **multiplying with each revolution** — the beat's soul and tonal joke.

**Transition:** release fires west down 65th Street — dead-straight dark corridor, decelerating, ~4s no-interaction spectacle with west-side neon growing, ending at Hudson Yards where the Vessel rises. **This breather is load-bearing pacing** — calm needed after the spin's chaos, before verticality.

### BEAT 5 — The Vessel (the vertical beat — hardest)

**Verb:** metronomic jump-timing on an ascending helix. Track becomes a spiral staircase: constant hard curve, rising elevation, narrowing width. Every flight-to-flight landing is a gap you must jump. Steering stays active since helix radius varies.

**Why it self-tunes:** you can see where you'll be in five seconds — flights stacked overhead, done ones falling away below. Because the real Vessel widens toward the top, the helix radius grows as you climb, so jump rhythm naturally accelerates. **Difficulty ramps for free out of the geometry, no tuning curve needed.**

**Implementation:** helix track — constant curve (~0.9), increasing elevation, slightly narrowing width, gap flags every N segments where ground isn't drawn. Render other flights by projecting the same helix path at z-offsets of ±1/±2 revolutions — the honeycomb-lattice look comes from the structure being the path repeated.

**Legibility:** camera tilts up on entry, shows the whole structure with the route in glowing edge-lines spiraling to the top. First gap is wide, slow, with a shadow landing marker. `JUMP` is already known from beats 1 and 3 by this point.

**Fail/success:** real risk, the run's only genuine fall. Missing a gap drops you one level, big rush hit, rejoin — not a death. Keep it short: ~18s, 10-12 gaps.

**Visual identity:** copper/bronze everything (the one metal beat); horizontal stair-tread lines on the path surface instead of rumble strips (scrolling fast — sells speed better than anything else in the run); triangular under-structure hanging beneath each flight's edge; hexagonal landings; night sky, Hudson Yards towers with lit windows, view opening as you rise.

**Transition:** launch off the rim into a long, slow, held jump over the Hudson at max height, camera pitching down over ~3s as Little Island's caps come into view below. **The current auto-leap set-piece has the right instinct in the wrong place — this is where it belongs.** Make this the *only* fully non-interactive moment in the run: earned because it's the climax, and it's a descent into the finale.

### BEAT 6 — Little Island (finale — synthesis)

**Verb:** hop between discrete platform tops, choosing your landing. Loop: land on a cap → brief steer window to aim at one of 2-3 next caps → tap to leap → airtime → land. Combines steering (1), route choice (2), and jump timing (3/5) into one loop, plus the run's only real aerial control.

**Why it's the right finale:** the high route is only physically reachable at high rush, with the ribbon strung across it — **the level literally opens up in proportion to how well you've played,** which retroactively justifies the whole rush meter.

**Implementation:** keep the segment track as an invisible spine for forward progress/projection; at hop moments the "ground" is a set of authored discrete caps at (x, y, z). Player is airborne between them; landing is a proximity check against the nearest cap at arrival z. Missing drops to the low boardwalk level — never the water, never a death — losing rush and rejoining.

**Fail/success:** medium risk, generous. Should feel triumphant, not punishing — deliberately softer than the Vessel.

**Visual identity:** the tulip pots (the entire identity) — shallow inverted-cone cups, wide ellipse top tapering to a narrow stem, 4-6 vertical rib lines, scalloped rim; dozens receding at varying heights; two-tone (white stem, green planted top with small trees); the Amph (curved stepped seating) near the end; zigzag gangway bridges to shore; the Hudson at night below, black with light-streaks; the Vessel still visible on the horizon (ties beats 5 and 6); the Statue of Liberty tiny on the southern horizon downriver.

**Transition:** last leap to the highest cap. Land, hold ~3s looking downriver, cut to results, back to the trail. **The user writes the comedown from there.**

---

## 5. Pacing / structure

**Total: ~90s.**

| Beat | Time | Character |
|---|---|---|
| Alice | 12s | teach, no-fail |
| Ramble | 18s | test, real risk |
| Lake | 15s | timing, park climax |
| Bethesda → park exit | 4s | transition |
| Lincoln Center | 12s | showoff, opt-in depth |
| 65th St corridor | 4s | breather (load-bearing) |
| Vessel | 18s | hardest, vertical |
| Rim leap | 3s | pure spectacle |
| Little Island | 15s | synthesis finale |
| Ending hold | 3s | — |

Ratio: ~75% interactive / ~15% low-interaction transition / ~10% pure spectacle. Trim to ~90s in tuning.

**HUD — cut to almost nothing.** Three things only: (1) the rush meter, preferably a screen-edge glow rather than a rectangle; (2) a 1.5s location title card on each beat entry, then gone — the cheapest, most direct answer to "I want people to very clearly know where they are"; (3) the action button label. Delete the coin counter.

**Results:** report peak rush tier and landmarks hit, not coins. Copy stays `[PLACEHOLDER]`.

---

## 6. Build order

**Confirming Central Park first — but the slice must be all three park beats, not just Alice.** Beat 1 alone is deliberately no-fail/teaching; shipping it alone would prove the visuals and prove nothing about fun. The fair test is **Alice → Ramble → Lake, end to end, with the rush meter and seamless transitions** — ~45s, roughly a third of the run by time but **100% of the mechanical vocabulary** (track-the-line, choose-under-speed, hit-the-timing). If that isn't fun, no amount of Vessel will save it. If it is, the remaining three beats are variations on proven verbs plus an elevation system already built for the slice.

**Slice must include:**
1. All five engine changes (E1-E5) plus the rush meter driving speed and saturation.
2. Beat 1 complete (canopy tunnel, statue + rabbit + hatter, mushroom ring, Conservatory Water + sailboats, hex plaza, one taught jump).
3. Beat 2 complete (rustic railings, outcrop forks, the Ramble Arch gate, dapple, fog, plank bridge).
4. Beat 3 complete (bounce rhythm with PERFECT/SPLASH!, ripple rings, Bow Bridge over/under split, rowboats, San Remo/Beresford/Belvedere, Bethesda arrival).
5. All three transitions seamless (canopy-close, fog-lift reveal, terrace stairs).
6. Results stub showing peak rush.

**Explicitly cut from the slice:** Lincoln Center, the corridor, the Vessel, Little Island, and any trail.js reward integration beyond a stub.

**Sub-order:** engine (E1-E5) → Beat 1 (smallest complete loop, validates the ribbon) → Beat 3 (riskiest new mechanic — find out early if the bounce rhythm works) → Beat 2 → transitions → polish pass on rush's visual tiers.

---

## 7. Preserve vs. cut

**Preserve:**
- `_project()` and the P3D constants — correct, and the thing the user liked. Extend with worldY/cameraY, don't replace.
- The segment array and curve double-integration in `_buildZone` — correct standard technique.
- The far→near render loop with per-segment trapezoids and per-segment sprite lists — correct painter's ordering.
- **The centerline-dash fix, the near-sprite cull, and the coin radius cap** — real bug fixes from actual screenshot debugging. Don't regress them; the same near-camera scale spike will bite every new sprite type.
- The abstract spin-ball player and its bank/trail/spike rendering.
- Particles, floaters, hitFlash, shake, the alpha-hex helper.
- Hold-left-half / hold-right-half continuous steering.
- The DOM/CSS (`#zoomies-hud`, `#zoomies-action-btn`, `#zoomies-charge-wrap`) — the charge bar repurposes cleanly as the rush meter.
- The trail.js one-time-offer integration. Don't touch.

**Cut / replace:**
- **The entire synthwave/vaporwave look — neon grid, retro sun stripes, gradient sky, per-zone palettes.** This actively fights the new direction. "I want people to very clearly know where they are" is incompatible with generic vaporwave furniture over every location. **The drug look must come from saturation, chromatic aberration, motion smear and color-cycling applied to recognizable real places — not from replacing places with vaporwave scenery.** This is the most important cut in the plan.
- The three-zone/curve-pattern structure → six beat definitions.
- Random scattered coins → the authored ribbon.
- Color-coded obstacle ellipses → shape-coded per-beat objects (E4).
- The generic building sprite lining every road → per-beat authored scenery.
- Hold-to-charge spin dash and its floater/timer state.
- Distance-ramped speed → rush-driven speed.
- The proximity-triggered auto-leap Vessel set piece and its billboard sprites (the *idea* moves to the Beat 5→6 transition; the code doesn't survive as-is).
- The coin/chain HUD readouts.

---

## 8. Open questions for the user

1. **Location title cards.** Assumed literal real place names ("THE RAMBLE", "BOW BRIDGE", "LITTLE ISLAND") since they're proper nouns, not authored copy — the most direct answer to "people should clearly know where they are." Confirm that's fine, or they become `[PLACEHOLDER]`. Same question for the three rush-tier labels if any text is attached to them.
2. **Does the run feed anything back into the trail?** v2 returned `{coins, bestChain}` to trail.js. If peak rush should map to money/health/a stat, that's a design call. Default assumed: return peak rush, trail.js does nothing with it yet.
3. **Should Little Island's finale be genuinely losable, or purely triumphant?** Designed triumphant here, but this depends on what emotional state the (user-written) comedown copy needs the player in at that exact moment. This one actually matters — flag before building the finale.
4. **Reduced motion.** `jailReducedMotion()` already exists elsewhere in this codebase. A full-screen rotating spin + chromatic aberration + color-cycling is a real accessibility concern. Recommended default: at reduced-motion, the Lincoln Center spin rotates only the ballerina ring (not the whole scene), and chromatic aberration/color-cycling are disabled while rush still drives speed/saturation. Confirm that's the right call rather than skipping the beat outright.
