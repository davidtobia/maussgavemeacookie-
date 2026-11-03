/**
 * THE TRANSPLANT TRAIL - CHARACTER DATA
 */

// The three playable characters
const CHARACTERS = [
  {
    id: 'remote-worker',
    name: 'Remote Worker',
    origin: 'Austin, Texas',
    checkingAccount: 1400,
    balances: {
      cash: 0,
      chaseFreedom: 400,
      chaseSapphire: 600,
      dadsAmex: 300,
      bilt: 100
    }
  },
  {
    id: 'nursing-student',
    name: 'Nursing Student',
    origin: 'Akron, Ohio',
    checkingAccount: 800,
    balances: {
      cash: 0,
      chaseFreedom: 250,
      chaseSapphire: 350,
      dadsAmex: 150,
      bilt: 50
    }
  },
  {
    id: 'hockey-coach',
    name: 'Youth Hockey Coach',
    origin: 'Massapequa, Long Island',
    checkingAccount: 500,
    balances: {
      cash: 0,
      chaseFreedom: 150,
      chaseSapphire: 250,
      dadsAmex: 75,
      bilt: 25
    }
  }
];

function getCharacter(id) {
  return CHARACTERS.find(c => c.id === id);
}

function getTotalMoney(character) {
  return Object.values(character.balances).reduce((a, b) => a + b, 0);
}
