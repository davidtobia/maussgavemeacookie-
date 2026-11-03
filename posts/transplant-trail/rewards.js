/**
 * THE TRANSPLANT TRAIL - REPORT CARDS
 * ===================================
 * Each minigame's score maps to a report-card grade, and grades can earn
 * a reward -- right now, new vehicles for the trail (TRANSPORTATION_MODES
 * in trail-data.js entries marked requiresUnlock). To give another
 * minigame grades, add it to MINIGAME_GRADES and call reportCard() from
 * its results screen.
 */

// Full report-card scale, best first.
const GRADE_ORDER = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F'];

const MINIGAME_GRADES = {
  bodega: {
    // Minimum score for each grade; below D- is an F. Tuned against
    // simulated players: a good run without the mushroom is a C, catching
    // the mushroom usually lands a B, and an A takes a near-perfect run
    // on top of the mushroom.
    cutoffs: {
      'A+': 4600, 'A': 4100, 'A-': 3700,
      'B+': 3300, 'B': 2900, 'B-': 2500,
      'C+': 2100, 'C': 1700, 'C-': 1300,
      'D+': 1000, 'D': 700,  'D-': 400,
    },
    // what each grade earns (a vehicle id), if anything
    rewards: {
      'A+': 'showtime-express', 'A': 'showtime-express', 'A-': 'showtime-express',
      'B+': 'pogo-stick', 'B': 'pogo-stick', 'B-': 'pogo-stick',
    },
  },
};

const GRADE_COLORS = { A: '#1fbf55', B: '#2f7fd6', C: '#d6a21f', D: '#e07a1f', F: '#e02424' };
function gradeColor(grade) { return GRADE_COLORS[grade[0]]; }

function gradeFor(game, score) {
  const cut = MINIGAME_GRADES[game].cutoffs;
  for (const g of GRADE_ORDER) if (g !== 'F' && score >= cut[g]) return g;
  return 'F';
}

// The next grade up and the score it needs (null if you got an A+).
function nextGrade(game, grade) {
  const i = GRADE_ORDER.indexOf(grade);
  if (i <= 0) return null;
  const g = GRADE_ORDER[i - 1];
  return { grade: g, score: MINIGAME_GRADES[game].cutoffs[g] };
}

// Works out the grade, unlocks the reward if there is one, and returns
// { grade, reward (the vehicle's TRANSPORTATION_MODES entry, or null),
//   isNew (false if you'd already unlocked it) }.
function reportCard(gameState, game, score) {
  const grade = gradeFor(game, score);
  const id = MINIGAME_GRADES[game].rewards[grade] || null;
  const reward = id ? TRANSPORTATION_MODES.find(m => m.id === id) || null : null;
  if (!gameState.unlockedVehicles) gameState.unlockedVehicles = [];
  const isNew = !!reward && !gameState.unlockedVehicles.includes(reward.id);
  if (isNew) gameState.unlockedVehicles.push(reward.id);
  return { grade, reward, isNew, next: nextGrade(game, grade) };
}
