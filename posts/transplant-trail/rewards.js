/**
 * THE TRANSPLANT TRAIL - REPORT CARDS
 * ===================================
 * Each minigame's score maps to a report-card grade, and grades can earn
 * a reward -- right now, new vehicles for the trail (TRANSPORTATION_MODES
 * in trail-data.js entries marked requiresUnlock). To give another
 * minigame grades, add it to MINIGAME_GRADES and call reportCard() from
 * its results screen.
 */

const MINIGAME_GRADES = {
  bodega: {
    // minimum score for each grade; anything lower is an F
    cutoffs: { 'A+': 2800, 'A': 2100, 'B': 1300, 'C': 800, 'D': 400 },
    // what each grade earns (a vehicle id), if anything
    rewards: { 'A+': 'showtime-express', 'A': 'showtime-express', 'B': 'pogo-stick', 'C': 'pogo-stick' },
  },
};

const GRADE_COLORS = { 'A+': '#1fbf55', 'A': '#1fbf55', 'B': '#2f7fd6', 'C': '#d6a21f', 'D': '#e07a1f', 'F': '#e02424' };

function gradeFor(game, score) {
  const cut = MINIGAME_GRADES[game].cutoffs;
  for (const g of ['A+', 'A', 'B', 'C', 'D']) if (score >= cut[g]) return g;
  return 'F';
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
  return { grade, reward, isNew };
}
