/**
 * THE TRANSPLANT TRAIL - CHARACTER DATA
 */

// The three playable characters
const CHARACTERS = [
  {
    id: 'remote-worker',
    name: 'Remote Worker',
    origin: 'Austin, Texas',
    money: 1400,
    difficulty: 1,
    description: ''
  },
  {
    id: 'nursing-student',
    name: 'Nursing Student',
    origin: 'Akron, Ohio',
    money: 800,
    difficulty: 2,
    description: ''
  },
  {
    id: 'hockey-coach',
    name: 'Youth Hockey Coach',
    origin: 'Massapequa, Long Island',
    money: 500,
    difficulty: 3,
    description: ''
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
