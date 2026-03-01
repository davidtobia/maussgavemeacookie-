/**
 * THE TRANSPLANT TRAIL - CHARACTER DATA
 */

// The three playable characters
const CHARACTERS = [
  {
    id: 'remote-worker',
    name: 'Remote Worker',
    origin: 'Austin, Texas',
    difficulty: 1,
    description: '',
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
    difficulty: 2,
    description: '',
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
    difficulty: 3,
    description: '',
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

// NPCs - appear during the trail
const NPCS = [
  { id: 'bartender', name: 'Bartender', origin: 'Hoboken, NJ' },
  { id: 'investment-banker', name: 'Investment Banker', origin: 'Canary Wharf, London' },
  { id: 'heiress', name: 'Heiress', origin: 'Shanghai' },
  { id: 'ceramicist', name: 'Ceramicist', origin: 'Copenhagen' },
  { id: 'delivery-driver', name: 'Delivery Driver', origin: 'Jackson Heights, Queens' }
];

function getCharacter(id) {
  return CHARACTERS.find(c => c.id === id);
}

function getAllCharacters() {
  return CHARACTERS;
}

function getTotalMoney(character) {
  return Object.values(character.balances).reduce((a, b) => a + b, 0);
}
