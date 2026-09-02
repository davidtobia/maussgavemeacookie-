/**
 * THE JAIL — ACT 3 AUTHORED CONTENT
 * ==================================
 *
 * This file is the entire authoring surface for Act 3. It contains ZERO
 * game logic — every line here is either data or placeholder prose. All
 * the walking, discovery radii, friendship math, requirement-checking and
 * effect-applying lives in jail.js, which reads this file generically (it
 * never calls a character or node by name — it walks these objects).
 *
 * If you only ever touch one file to write Act 3's dialogue, it's this
 * one. Everything below marked [PLACEHOLDER ...] is a stand-in the game
 * owner writes — nothing here is meant to ship as-is.
 *
 * ----------------------------------------------------------------------
 * HOW TO WRITE A CONVERSATION
 * ----------------------------------------------------------------------
 * Each character in JAIL_DIALOGUE gets an ordered array of "conversations".
 * Conversation 0 ("intro") is how you first talk to them — it always ends
 * by sending you into their mini-game. Conversation 1 ("postgame") is
 * their reaction right after you finish that mini-game, and it can branch
 * on how well you did. Anything after that (2+) is an optional deeper
 * chat, gated behind a friendship threshold or a flag, for players who
 * want to keep coming back.
 *
 * A conversation is a flat map of nodes keyed by id. Each node looks like:
 *
 *   'node_id': {
 *     speaker: 'diddy',              // 'diddy' | 'player' | 'narrator'
 *     sub: '[PLACEHOLDER SUBTITLE]', // optional line under the name
 *     lines: ['[PLACEHOLDER LINE 1]', '[PLACEHOLDER LINE 2]'],
 *     // `lines` can also just be a bare string if there's only one line.
 *     choices: [
 *       { label: '[PLACEHOLDER CHOICE]', effects: { friendship: +2 }, next: 'other_node_id' },
 *     ],
 *   }
 *
 * A node with no `choices` renders a single "Continue" button that follows
 * its own `next` field instead. A choice with no `effects` is a pure
 * branch — nothing changes, it just moves the conversation. `title`
 * defaults to the speaker's display name; `speaker: 'narrator'` renders
 * with no name chip at all, for pure scene-setting text.
 *
 * A choice can carry `requires` (see below) to only appear once some
 * condition is true. Give it a `lockedLabel` as well and, instead of
 * hiding it, the engine shows it greyed-out and unclickable — useful for
 * "you can see what you're missing" moments (e.g. a choice that needs
 * more friendship with someone else first).
 *
 * A node can carry `requires` + `altNode`: if `requires` fails, the engine
 * renders `altNode` instead. That's how the postgame conversations below
 * show a different reaction to a strong run vs. a weak one.
 *
 * Every path through a conversation must eventually reach a terminal node
 * — one with an `end` field instead of `choices`:
 *
 *   'terminal_id': {
 *     speaker: 'diddy',
 *     lines: ['[PLACEHOLDER]'],
 *     end: { minigame: true, label: '[PLACEHOLDER BUTTON LABEL]' },
 *   }
 *
 * `end: { minigame: true }` is how the intro conversation launches that
 * character's mini-game. Any other terminal just needs `end: {}` (or
 * `end: { label: '...' }` for a custom button label) — the engine returns
 * you to the yard.
 *
 * ----------------------------------------------------------------------
 * THE `requires` OBJECT — used on nodes, choices, and whole conversations
 * ----------------------------------------------------------------------
 * Every key is optional. All present keys must pass (this is AND-only —
 * if you need OR, write two separate nodes/choices instead).
 *
 *   flag / flags          string or array of strings — all must be set
 *   notFlag / notFlags    string or array — none of these may be set
 *   friendshipAtLeast     number — this character's friendship score
 *   friendshipBelow       number — this character's friendship score
 *   otherFriendship       { sbf: 40, mangione: 10 } — gate on someone else
 *   minigameDone          true/false — has this character's game been played
 *   lastGrade             array of 'bail'|'weak'|'ok'|'great'|'perfect'
 *   convoDone             a conversation id that must already be finished
 *
 * ----------------------------------------------------------------------
 * THE `effects` OBJECT — used on choices
 * ----------------------------------------------------------------------
 *   friendship        +n / -n on the character you're talking to
 *   friendshipOther    { mangione: -3 } — nudges another character's score.
 *                       Purely opt-in, per choice — this is the only way
 *                       any rivalry exists. Nothing forces it.
 *   flags              array of flag names to set
 *   clearFlags         array of flag names to unset
 *   aura               +n / -n on gameState.aura (the run-wide meter)
 *
 * ----------------------------------------------------------------------
 * A NOTE ON ORDER
 * ----------------------------------------------------------------------
 * Players can find the three leaders in any order, and any of the other
 * two conversations may or may not have happened yet by the time someone
 * reaches this one. Don't write an intro line that assumes "you just left
 * so-and-so" unless you gate it behind that person's `convoDone` flag —
 * otherwise it'll read wrong for a player who came here first.
 */

// ----------------------------------------------------------------------
// CHARACTERS
// ----------------------------------------------------------------------
// `color` drives their dot, entourage tint, ground tint, speaker chip, and
// HUD friendship bar — one value, used everywhere, so a character reads as
// consistent the instant you can see them across the yard.
//
// `yard` positions are logical units in a 180×120 world. Keep new/adjusted
// positions inside the fenced play area (roughly x:8–172, y:8–110) and
// clear of the props laid out in jail.js's `yardLayout()` — see that file
// for the full prop list if repositioning anyone.

const JAIL_CHARACTERS = [
  {
    id: 'diddy',
    name: '[PLACEHOLDER NAME — DIDDY]',
    tag: '[PLACEHOLDER ONE-LINE SUBTITLE]',
    color: '#c86ab0',
    minigame: 'rhythm',
    yard: { x: 46, y: 34, entourage: 5, turfR: 16 },
    discoverToast: '[PLACEHOLDER: line shown the first time you get close enough to make him out]',
  },
  {
    id: 'mangione',
    name: '[PLACEHOLDER NAME — LUIGI]',
    tag: '[PLACEHOLDER ONE-LINE SUBTITLE]',
    color: '#7ec89a',
    minigame: 'bench',
    yard: { x: 140, y: 88, entourage: 3, turfR: 14 },
    discoverToast: '[PLACEHOLDER: line shown the first time you get close enough to make him out]',
  },
  {
    id: 'sbf',
    name: '[PLACEHOLDER NAME — SBF]',
    tag: '[PLACEHOLDER ONE-LINE SUBTITLE]',
    color: '#6ab0d8',
    minigame: 'trip',
    yard: { x: 30, y: 100, entourage: 2, turfR: 12 },
    discoverToast: '[PLACEHOLDER: line shown the first time you get close enough to make him out]',
  },
];

// ----------------------------------------------------------------------
// INTAKE — the one authored panel before the yard opens up
// ----------------------------------------------------------------------

const JAIL_INTAKE = {
  title: '[PLACEHOLDER INTAKE TITLE]',
  sub: '[PLACEHOLDER INTAKE SUBTITLE]',
  lines: [
    '[PLACEHOLDER INTAKE LINE 1]',
    '[PLACEHOLDER INTAKE LINE 2]',
  ],
  button: '[PLACEHOLDER — e.g. "Into the yard"]',
};

// ----------------------------------------------------------------------
// DIALOGUE TREES
// ----------------------------------------------------------------------
// Two-and-a-bit conversations per character below: a full `intro` and
// `postgame` for all three, plus one `deep1` on diddy only, included as a
// worked example of the tier-gated deepening-conversation pattern —
// copy its shape onto mangione/sbf when you're ready to write those.

const JAIL_DIALOGUE = {

  // ====================================================================
  diddy: [
    {
      id: 'intro',
      requires: {},
      start: 'd0',
      nodes: {
        'd0': {
          speaker: 'diddy',
          sub: '[PLACEHOLDER SUBTITLE]',
          lines: [
            '[PLACEHOLDER LINE 1]',
            '[PLACEHOLDER LINE 2]',
          ],
          choices: [
            {
              label: '[PLACEHOLDER CHOICE A]',
              effects: { friendship: 2, flags: ['diddy_played_along'] },
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
              effects: { friendship: 4 },
              next: 'd1c',
            },
          ],
        },
        'd1a': {
          speaker: 'narrator',
          lines: '[PLACEHOLDER LINE]',
          next: 'd_end',
        },
        'd1b': {
          speaker: 'diddy',
          lines: ['[PLACEHOLDER LINE]'],
          next: 'd_end',
        },
        'd1c': {
          speaker: 'diddy',
          lines: ['[PLACEHOLDER LINE — reacting to the boombox flag]'],
          next: 'd_end',
        },
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
          requires: { lastGrade: ['great', 'perfect'] },
          altNode: 'dp0_bad',
          lines: ['[PLACEHOLDER — reaction to a strong run]'],
          choices: [
            {
              label: '[PLACEHOLDER CHOICE]',
              effects: { friendship: 3 },
              next: 'dp_end',
            },
            {
              label: '[PLACEHOLDER LOCKED CHOICE — needs more friendship elsewhere]',
              lockedLabel: '[PLACEHOLDER LOCKED CHOICE — needs more friendship elsewhere]',
              requires: { otherFriendship: { sbf: 40 } },
              effects: { friendship: 5 },
              next: 'dp_end',
            },
          ],
        },
        'dp0_bad': {
          speaker: 'diddy',
          lines: ['[PLACEHOLDER — reaction to a weak run]'],
          choices: [
            {
              label: '[PLACEHOLDER CHOICE]',
              effects: { friendship: 1 },
              next: 'dp_end',
            },
          ],
        },
        'dp_end': {
          speaker: 'diddy',
          lines: ['[PLACEHOLDER LINE]'],
          end: {},
        },
      },
    },

    {
      // Worked example of a gated deepening chat — friendship 45+ AND the
      // postgame conversation already finished. Copy this shape for
      // mangione/sbf's own `deep1` when you're ready to write those.
      id: 'deep1',
      requires: { friendshipAtLeast: 45, convoDone: 'postgame' },
      start: 'dd0',
      nodes: {
        'dd0': {
          speaker: 'diddy',
          lines: ['[PLACEHOLDER DEEPENING LINE]'],
          choices: [
            {
              label: '[PLACEHOLDER CHOICE]',
              effects: { friendship: 4, flags: ['diddy_deep1_done'] },
              next: 'dd_end',
            },
          ],
        },
        'dd_end': {
          speaker: 'diddy',
          lines: ['[PLACEHOLDER LINE]'],
          end: {},
        },
      },
    },
  ],

  // ====================================================================
  mangione: [
    {
      id: 'intro',
      requires: {},
      start: 'm0',
      nodes: {
        'm0': {
          speaker: 'mangione',
          sub: '[PLACEHOLDER SUBTITLE]',
          lines: [
            '[PLACEHOLDER LINE 1]',
            '[PLACEHOLDER LINE 2]',
          ],
          choices: [
            {
              label: '[PLACEHOLDER CHOICE A]',
              effects: { friendship: 2, flags: ['mangione_played_along'] },
              next: 'm1a',
            },
            {
              label: '[PLACEHOLDER CHOICE B]',
              effects: { friendship: -1 },
              next: 'm1b',
            },
          ],
        },
        'm1a': {
          speaker: 'narrator',
          lines: '[PLACEHOLDER LINE]',
          next: 'm_end',
        },
        'm1b': {
          speaker: 'mangione',
          lines: ['[PLACEHOLDER LINE]'],
          next: 'm_end',
        },
        'm_end': {
          speaker: 'mangione',
          lines: ['[PLACEHOLDER LINE]'],
          end: { minigame: true, label: '[PLACEHOLDER BUTTON LABEL]' },
        },
      },
    },

    {
      id: 'postgame',
      requires: { minigameDone: true },
      start: 'mp0',
      nodes: {
        'mp0': {
          speaker: 'mangione',
          requires: { lastGrade: ['great', 'perfect'] },
          altNode: 'mp0_bad',
          lines: ['[PLACEHOLDER — reaction to a strong run]'],
          choices: [
            {
              label: '[PLACEHOLDER CHOICE]',
              effects: { friendship: 3 },
              next: 'mp_end',
            },
          ],
        },
        'mp0_bad': {
          speaker: 'mangione',
          lines: ['[PLACEHOLDER — reaction to a weak run]'],
          choices: [
            {
              label: '[PLACEHOLDER CHOICE]',
              effects: { friendship: 1 },
              next: 'mp_end',
            },
          ],
        },
        'mp_end': {
          speaker: 'mangione',
          lines: ['[PLACEHOLDER LINE]'],
          end: {},
        },
      },
    },
  ],

  // ====================================================================
  sbf: [
    {
      id: 'intro',
      requires: {},
      start: 's0',
      nodes: {
        's0': {
          speaker: 'sbf',
          sub: '[PLACEHOLDER SUBTITLE]',
          lines: [
            '[PLACEHOLDER LINE 1]',
            '[PLACEHOLDER LINE 2]',
          ],
          choices: [
            {
              label: '[PLACEHOLDER CHOICE A]',
              effects: { friendship: 2, flags: ['sbf_played_along'] },
              next: 's1a',
            },
            {
              label: '[PLACEHOLDER CHOICE B]',
              effects: { friendship: -1 },
              next: 's1b',
            },
          ],
        },
        's1a': {
          speaker: 'narrator',
          lines: '[PLACEHOLDER LINE]',
          next: 's_end',
        },
        's1b': {
          speaker: 'sbf',
          lines: ['[PLACEHOLDER LINE]'],
          next: 's_end',
        },
        's_end': {
          speaker: 'sbf',
          lines: ['[PLACEHOLDER LINE]'],
          end: { minigame: true, label: '[PLACEHOLDER BUTTON LABEL]' },
        },
      },
    },

    {
      // Sam's postgame branches on two independent axes (rescued Caroline
      // × how many Utils you banked), not just a single grade — four real
      // reactions available here. See jail-minigames.js's JailTripGame for
      // where `detail.rescued` / `detail.utils` come from.
      id: 'postgame',
      requires: { minigameDone: true },
      start: 'sp0',
      nodes: {
        'sp0': {
          speaker: 'sbf',
          requires: { flag: 'sbf_rescued_caroline' },
          altNode: 'sp0_not_rescued',
          lines: ['[PLACEHOLDER — Caroline rescued]'],
          choices: [
            {
              label: '[PLACEHOLDER CHOICE]',
              effects: { friendship: 3 },
              next: 'sp_end',
            },
          ],
        },
        'sp0_not_rescued': {
          speaker: 'sbf',
          lines: ['[PLACEHOLDER — Caroline not rescued, whatever Utils you banked]'],
          choices: [
            {
              label: '[PLACEHOLDER CHOICE]',
              effects: { friendship: 1 },
              next: 'sp_end',
            },
          ],
        },
        'sp_end': {
          speaker: 'sbf',
          lines: ['[PLACEHOLDER LINE]'],
          end: {},
        },
      },
    },
  ],
};

// ----------------------------------------------------------------------
// FRIENDSHIP TIERS
// ----------------------------------------------------------------------
// Thresholds, low to high. Tier 3 (60+) is "actually a friend" — the one
// that counts toward nycFriends / Act 4. Tier index (0-4) is what
// JAIL_OUTCOMES.perCharacter reads from below.

const JAIL_TIERS = [
  { min: 0,  label: '[PLACEHOLDER TIER 0 LABEL]' },
  { min: 20, label: '[PLACEHOLDER TIER 1 LABEL]' },
  { min: 40, label: '[PLACEHOLDER TIER 2 LABEL]' },
  { min: 60, label: '[PLACEHOLDER TIER 3 LABEL — "actually a friend"]' },
  { min: 80, label: '[PLACEHOLDER TIER 4 LABEL]' },
];

// ----------------------------------------------------------------------
// RELEASE-DAY OUTCOME TEXT
// ----------------------------------------------------------------------
// perCharacter[id] has exactly 5 entries, one per JAIL_TIERS index, shown
// on the summary panel for whichever tier that character ended at.
// release[n] is the closing line, keyed by how many characters (0-3)
// ended at tier 3 (60+) or higher.

const JAIL_OUTCOMES = {
  perCharacter: {
    diddy: [
      '[PLACEHOLDER DIDDY TIER 0 OUTCOME]',
      '[PLACEHOLDER DIDDY TIER 1 OUTCOME]',
      '[PLACEHOLDER DIDDY TIER 2 OUTCOME]',
      '[PLACEHOLDER DIDDY TIER 3 OUTCOME]',
      '[PLACEHOLDER DIDDY TIER 4 OUTCOME]',
    ],
    mangione: [
      '[PLACEHOLDER LUIGI TIER 0 OUTCOME]',
      '[PLACEHOLDER LUIGI TIER 1 OUTCOME]',
      '[PLACEHOLDER LUIGI TIER 2 OUTCOME]',
      '[PLACEHOLDER LUIGI TIER 3 OUTCOME]',
      '[PLACEHOLDER LUIGI TIER 4 OUTCOME]',
    ],
    sbf: [
      '[PLACEHOLDER SBF TIER 0 OUTCOME]',
      '[PLACEHOLDER SBF TIER 1 OUTCOME]',
      '[PLACEHOLDER SBF TIER 2 OUTCOME]',
      '[PLACEHOLDER SBF TIER 3 OUTCOME]',
      '[PLACEHOLDER SBF TIER 4 OUTCOME]',
    ],
  },
  release: [
    '[PLACEHOLDER — 0 FRIENDS AT RELEASE]',
    '[PLACEHOLDER — 1 FRIEND AT RELEASE]',
    '[PLACEHOLDER — 2 FRIENDS AT RELEASE]',
    '[PLACEHOLDER — 3 FRIENDS AT RELEASE]',
  ],
};

// ----------------------------------------------------------------------
// YARD FLAVOR — optional ambient interactables
// ----------------------------------------------------------------------
// No score of their own. Walking up to one shows a short one-off line and
// sets a flag, which is how exploring the yard before talking to someone
// can unlock an extra dialogue choice later (see diddy's `d0` choice C
// above, gated on `yard_saw_boombox`).

const JAIL_YARD_FLAVOR = [
  {
    id: 'boombox',
    x: 62, y: 20, r: 6,
    title: '[PLACEHOLDER FLAVOR TITLE]',
    lines: ['[PLACEHOLDER FLAVOR LINE]'],
    setsFlag: 'yard_saw_boombox',
  },
  {
    id: 'commissary_corner',
    x: 20, y: 80, r: 6,
    title: '[PLACEHOLDER FLAVOR TITLE]',
    lines: ['[PLACEHOLDER FLAVOR LINE]'],
    setsFlag: 'yard_saw_commissary',
  },
  {
    id: 'chalk_platform',
    x: 150, y: 100, r: 6,
    title: '[PLACEHOLDER FLAVOR TITLE]',
    lines: ['[PLACEHOLDER FLAVOR LINE]'],
    setsFlag: 'yard_saw_chalk',
  },
  {
    id: 'handball_graffiti',
    x: 90, y: 24, r: 6,
    title: '[PLACEHOLDER FLAVOR TITLE]',
    lines: ['[PLACEHOLDER FLAVOR LINE]'],
    setsFlag: 'yard_saw_graffiti',
  },
];

// ----------------------------------------------------------------------
// RHYTHM CHART — Diddy's mini-game
// ----------------------------------------------------------------------
// `bars` is an array of 8-character strings, one per bar. Each character
// is an eighth-note slot: '0'/'1'/'2' for a lane, '.' for a rest. Fully
// retimable by changing `bpm` — the chart itself never needs to know real
// time, jail-minigames.js converts bar/slot position into milliseconds.
// ~30 bars at 104bpm is a ~70s chart, per the plan's recommended trim.

const JAIL_RHYTHM_CHART = {
  bpm: 104,
  offsetMs: 600, // lead-in before the first note, so the chart doesn't demand a hit at frame 0
  bars: [
    '0.......', '0...1...', '0.1.0.1.', '0.1.2...',
    '0.1.2.1.', '2.1.0...', '0.1.2.0.', '1.1.2.2.',
    '0.2.0.2.', '0.1.2.1.', '1.0.1.0.', '0.1.2.1.',
    '2.2.1.1.', '0.0.1.1.', '2.1.0.1.', '0.1.2.1.',
    '........', '0...2...', '0.1.2.1.', '1.2.0.2.',
    '0.1.2.0.', '1.2.0.1.', '2.0.1.2.', '0.1.2.1.',
    '0011.22.', '1.0.2.0.', '2.1.0.1.', '0.1.2.1.',
    '0.2.1.0.', '2.1.0.2.', '01210121', '0.1.2...',
  ],
};

// ----------------------------------------------------------------------
// BETS — Sam's trip mini-game, "portfolio bet" side-objective prompts
// ----------------------------------------------------------------------
// Two options, each with a label and a win probability `p`. Picking one
// rolls against its `p`; a win pays a flat +6 Utils, a loss costs -8s and
// -4 Utils (see jail-minigames.js's JailTripGame). The prompt cycles
// through this list as the player finds bet markers in the world.

const JAIL_BETS = [
  {
    prompt: '[PLACEHOLDER BET PROMPT 1]',
    a: { label: '[PLACEHOLDER OPTION A]', p: 0.5 },
    b: { label: '[PLACEHOLDER OPTION B]', p: 0.2 },
  },
  {
    prompt: '[PLACEHOLDER BET PROMPT 2]',
    a: { label: '[PLACEHOLDER OPTION A]', p: 0.65 },
    b: { label: '[PLACEHOLDER OPTION B]', p: 0.1 },
  },
  {
    prompt: '[PLACEHOLDER BET PROMPT 3]',
    a: { label: '[PLACEHOLDER OPTION A]', p: 0.4 },
    b: { label: '[PLACEHOLDER OPTION B]', p: 0.3 },
  },
];
