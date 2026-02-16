/**
 * THE TRANSPLANT TRAIL - CHARACTER DATA
 * Simple system: Starting money + difficulty multiplier
 * Character distinctions matter for events, transport, and flavor
 */

const CHARACTERS = [
  {
    id: 'nursing-student',
    name: 'Nursing Student',
    origin: 'Akron, Ohio',
    money: 800,
    difficulty: 1.5,
    description: 'Fresh from Ohio with big dreams and a tight budget.'
  },
  {
    id: 'bartender',
    name: 'Bartender',
    origin: 'Hoboken, New Jersey',
    money: 850,
    difficulty: 1.3,
    description: 'Knows every bartender in the city. Every conversation takes 20 minutes.'
  },
  {
    id: 'hockey-coach',
    name: 'Youth Hockey Coach',
    origin: 'Massapequa, Long Island',
    money: 900,
    difficulty: 1.2,
    description: 'Will argue about everything. Strong opinions about bagels.'
  },
  {
    id: 'remote-worker',
    name: 'Remote Worker',
    origin: 'Austin, Texas',
    money: 1400,
    difficulty: 1.1,
    description: 'Works from coffee shops. Talks about "the energy" constantly.'
  },
  {
    id: 'delivery-driver',
    name: 'Delivery Driver',
    origin: 'Jackson Heights, Queens',
    money: 200,
    difficulty: 3.0,
    description: 'Already lives here. Actually knows the city. Hard mode because money is tight.'
  },
  {
    id: 'investment-banker',
    name: 'Investment Banker',
    origin: 'Canary Wharf, London',
    money: 1400,
    difficulty: 1.0,
    description: 'On assignment. Calls it "New York City" in full every single time.'
  },
  {
    id: 'ceramicist',
    name: 'Ceramicist',
    origin: 'Copenhagen, Denmark',
    money: 500,
    difficulty: 1.8,
    description: 'Vibes are immaculate. Money is tight but the aesthetic is not.'
  },
  {
    id: 'heiress',
    name: 'Heiress',
    origin: 'Shanghai',
    money: 5000,
    difficulty: 0.5,
    description: 'Money solves problems. You have $5,000. This will cover approximately one month of your carrying costs in Tribeca.',
    isEasyMode: true
  }
];

// Helper functions
function getCharacter(id) {
  return CHARACTERS.find(char => char.id === id);
}

function getAllCharacters() {
  return CHARACTERS;
}
