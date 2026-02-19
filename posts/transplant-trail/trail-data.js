/**
 * THE TRANSPLANT TRAIL - GAME DATA
 * Locations, transportation modes, spending modes, vibe weather
 */

// 9 Landmarks in order
const LANDMARKS = [
  { id: 'entry', name: 'Port Authority', type: 'start', description: 'Point of entry to NYC' },
  { id: 'murray-hill', name: 'Murray Hill', type: 'normal', description: 'First apartment' },
  { id: 'midtown', name: 'Midtown', type: 'expensive', description: 'Expensive crossing' },
  { id: 'union-square', name: 'Union Square', type: 'fort', description: 'Fort - can resupply here' },
  { id: 'west-village', name: 'West Village', type: 'dangerous', description: 'Dangerous terrain' },
  { id: 'soho', name: 'Soho', type: 'detour', description: 'Optional detour' },
  { id: 'les', name: 'Lower East Side', type: 'fort', description: 'Fort - can resupply here' },
  { id: 'williamsburg', name: 'Williamsburg', type: 'crossing', description: 'L Train crossing' },
  { id: 'mirage', name: 'Brooklyn Mirage', type: 'destination', description: 'Final destination!' }
];

// 8 Transportation modes
const TRANSPORTATION_MODES = [
  {
    id: 'walk',
    name: 'Walk',
    speed: 1,
    cost: 0,
    vibeEffect: 0,
    description: 'Very slow, free, neutral vibes',
    restrictions: [] // Available to all
  },
  {
    id: 'bank-bike',
    name: 'Bank Bike',
    speed: 2,
    cost: 5,
    vibeEffect: -2,
    description: 'Slow, cheap, -vibes (sweaty)',
    restrictions: [],
    unavailableWeather: ['raining'] // Can't use in rain
  },
  {
    id: 'subway',
    name: 'Subway',
    speed: 4,
    cost: 3,
    vibeEffect: 0, // Variable based on if it works
    description: 'Medium speed, cheap, +vibes if works / catastrophic if doesn\'t',
    restrictions: ['heiress'], // Heiress can't take subway
    requiresItem: 'metrocard'
  },
  {
    id: 'yellow-cab',
    name: 'Yellow Cab',
    speed: 5,
    cost: 25,
    vibeEffect: 3,
    description: 'Fast, medium cost, +vibes (classic)',
    restrictions: ['nursing-student', 'delivery-driver'] // Can't hail
  },
  {
    id: 'app-car',
    name: 'App Car',
    speed: 5,
    cost: 40,
    vibeEffect: -2,
    description: 'Fast, high cost, -vibes (judged)',
    restrictions: []
  },
  {
    id: 'own-car',
    name: 'Own Car',
    speed: 1, // Very slow in Manhattan
    cost: 60, // Parking
    vibeEffect: -3,
    description: 'Very slow in Manhattan, high cost (parking), -vibes',
    restrictions: []
  },
  {
    id: 'electric-bike',
    name: 'Electric Bike',
    speed: 6,
    cost: 0,
    vibeEffect: 3,
    description: 'Very fast, free, +vibes',
    restrictions: ['delivery-driver'], // ONLY delivery driver (inverted logic)
    exclusive: true
  },
  {
    id: 'helicopter',
    name: 'Helicopter',
    speed: 10,
    cost: 5000,
    vibeEffect: -5,
    description: 'Instant, obscene cost, -vibes',
    restrictions: ['heiress'], // ONLY heiress (inverted logic)
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
    name: 'Perfect fall day',
    speedMod: 1.2,
    vibeMod: 5,
    effects: []
  },
  {
    id: 'august',
    name: 'August in the city',
    speedMod: 0.8,
    vibeMod: -5,
    healthMod: -2,
    effects: ['Everyone is insufferable', 'AC broke']
  },
  {
    id: 'raining',
    name: "It's raining",
    speedMod: 0.9,
    vibeMod: -2,
    effects: ['Bank Bike unavailable', 'App Car surge pricing (+$20)']
  },
  {
    id: 'blizzard',
    name: 'A blizzard',
    speedMod: 0.3,
    vibeMod: -8,
    effects: ['Subway chaos', 'Most transportation unavailable']
  },
  {
    id: 'major-event',
    name: 'A major event',
    speedMod: 0.5,
    vibeMod: 3,
    effects: ['Path blocked or great story unlocked']
  },
  {
    id: 'subway-weird',
    name: 'The subway is being weird',
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
