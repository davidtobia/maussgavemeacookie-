/**
 * THE TRANSPLANT TRAIL - GAME DATA
 * Locations, transportation modes, spending modes, vibe weather
 */

// 9 Landmarks in order
const LANDMARKS = [
  { id: 'entry',                   name: 'Port Authority',         type: 'start',       description: 'Point of entry to NYC' },
  { id: 'murray-hill',             name: 'Murray Hill',            type: 'normal',      description: 'First apartment' },
  { id: 'midtown',                 name: 'Midtown',                type: 'expensive',   description: 'Expensive crossing' },
  { id: 'washington-square-park',  name: 'Washington Square Park', type: 'checkpoint',  description: 'Three wise men await' },
  { id: 'union-square',            name: 'Union Square',           type: 'fort',        description: 'Fort - can resupply here' },
  { id: 'west-village',            name: 'West Village',           type: 'dangerous',   description: 'Dangerous terrain' },
  { id: 'soho',                    name: 'Soho',                   type: 'detour',      description: 'Optional detour' },
  { id: 'les',                     name: 'Lower East Side',        type: 'fort',        description: 'Fort - can resupply here' },
  { id: 'williamsburg',            name: 'Williamsburg',           type: 'crossing',    description: 'L Train crossing' },
  { id: 'mirage',                  name: 'Brooklyn Mirage',        type: 'destination', description: 'Final destination!' }
];

// Transportation modes
const TRANSPORTATION_MODES = [
  {
    id: 'walk',
    name: 'Walk',
    speed: 0.4,
    cost: 0,
    vibeEffect: 0,
    description: 'Very slow, free, neutral vibes',
    restrictions: []
  },
  {
    id: 'bank-bike',
    name: 'Bank Bike',
    speed: 0.8,
    cost: 5,
    vibeEffect: -2,
    description: 'Slow, cheap, -vibes (sweaty)',
    restrictions: [],
    requiresItem: 'bank-bike',
    unavailableWeather: ['raining']
  },
  {
    id: 'subway',
    name: 'Subway',
    speed: 1.5,
    cost: 3,
    vibeEffect: 0,
    description: 'Medium speed, cheap, chaotic',
    restrictions: [],
    requiresItem: 'metrocard'
  },
  {
    id: 'yellow-cab',
    name: 'Yellow Cab',
    speed: 1.8,
    cost: 25,
    vibeEffect: 3,
    description: 'Fast, medium cost, +vibes (classic)',
    restrictions: []
  },
  {
    id: 'app-car',
    name: 'App Car',
    speed: 1.8,
    cost: 40,
    vibeEffect: -2,
    description: 'Fast, expensive, -vibes (judged)',
    restrictions: []
  },
  {
    id: 'own-car',
    name: 'Own Car',
    speed: 0.2,
    cost: 60,
    vibeEffect: -5,
    description: 'Basically parked. High cost. -vibes.',
    restrictions: []
  },
  {
    id: 'electric-bike',
    name: 'Electric Bike',
    speed: 2.2,
    cost: 0,
    vibeEffect: 3,
    description: 'Fast, free, +vibes',
    restrictions: ['delivery-driver'],
    exclusive: true
  }
];

// 6 Spending modes
const SPENDING_MODES = [
  {
    id: 'dollar-slice',
    name: 'Dollar Slice Mode',
    dailyCost: 15,
    vibeEffect: -3,
    description: 'Bare bones',
    events: ['food-poisoning', 'rat-encounter']
  },
  {
    id: 'dumpling',
    name: 'Dumpling Maxxing',
    dailyCost: 30,
    vibeEffect: -1,
    description: 'Frugal',
    events: ['dumpling-spot-closed']
  },
  {
    id: 'trader-joes',
    name: "Trader Joe's Wine Mode",
    dailyCost: 60,
    vibeEffect: 0,
    description: 'Middle',
    events: ['wine-spill', 'bag-broke']
  },
  {
    id: 'west-village',
    name: 'West Village Resy Hop',
    dailyCost: 120,
    vibeEffect: 2,
    description: 'Comfortable',
    events: ['ran-into-ex', 'influencer-spotted']
  },
  {
    id: 'omakase',
    name: 'Omakase',
    dailyCost: 250,
    vibeEffect: 4,
    description: 'Expensive',
    events: ['chef-remembers-you']
  },
  {
    id: 'carbone',
    name: 'Carbone',
    dailyCost: 500,
    vibeEffect: 5,
    description: 'Ruinous',
    events: ['celeb-sighting', 'bankruptcy']
  }
];

// 6 Vibe weather conditions
const VIBE_WEATHER = [
  {
    id: 'perfect-fall',
    name: 'Perfect fall',
    speedMod: 1.2,
    vibeMod: 5,
    effects: []
  },
  {
    id: 'august',
    name: 'August heat',
    speedMod: 0.8,
    vibeMod: -5,
    healthMod: -2,
    effects: ['Everyone is insufferable', 'AC broke']
  },
  {
    id: 'raining',
    name: 'Rain',
    speedMod: 0.9,
    vibeMod: -2,
    effects: ['Bank Bike unavailable', 'App Car surge pricing (+$20)']
  },
  {
    id: 'blizzard',
    name: 'Blizzard',
    speedMod: 0.3,
    vibeMod: -8,
    effects: ['Subway chaos', 'Most transportation unavailable']
  },
  {
    id: 'major-event',
    name: 'Major event',
    speedMod: 0.5,
    vibeMod: 3,
    effects: ['Path blocked or great story unlocked']
  },
  {
    id: 'subway-weird',
    name: 'Subway being weird',
    speedMod: 1.0,
    vibeMod: -3,
    effects: ['Cascading subway consequences if using subway']
  }
];

// Helper to check if character can use transportation mode
function canUseTransport(characterId, transportId) {
  const mode = TRANSPORTATION_MODES.find(m => m.id === transportId);
  if (!mode) return false;

  // If exclusive mode (electric bike, helicopter)
  if (mode.exclusive) {
    return mode.restrictions.includes(characterId);
  }

  // Otherwise check if character is NOT in restrictions
  return !mode.restrictions.includes(characterId);
}

// Helper to get available transportation for character
function getAvailableTransport(characterId, weather = null) {
  return TRANSPORTATION_MODES.filter(mode => {
    // Check character restrictions
    if (!canUseTransport(characterId, mode.id)) return false;

    // Check weather restrictions
    if (weather && mode.unavailableWeather && mode.unavailableWeather.includes(weather)) {
      return false;
    }

    return true;
  });
}
