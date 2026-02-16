/**
 * THE TRANSPLANT TRAIL - CHARACTER DATA
 * All 8 playable characters with stats and abilities
 */

const CHARACTERS = [
  {
    id: 'ohio-girl',
    name: 'Ohio Girl',
    origin: 'Columbus, Ohio (Sorority)',
    money: 800,
    vibes: 1, // Very Low (1-5 scale)
    audacity: 3, // Medium
    difficulty: 1.5,
    specialAbility: {
      name: 'Manifestation',
      description: 'Re-roll one bad event per game'
    },
    description: 'Fresh from her sorority house, armed with positive vibes and a dream. Believes everything happens for a reason.',
    restrictions: [
      'Defaults to Bank Bike and App Car',
      'Subway restricted to Manhattan only',
      'Cannot hail yellow cabs (doesn\'t know how)'
    ],
    startingItems: {
      phoneBattery: 80,
      content: 50,
      outfits: 3,
      advil: 5,
      zyn: 0
    }
  },
  {
    id: 'jersey-person',
    name: 'Jersey Person',
    origin: 'New Jersey',
    money: 850,
    vibes: 3, // Medium
    audacity: 5, // Very High
    difficulty: 1.3,
    specialAbility: {
      name: 'I Know A Guy',
      description: 'Get discounts but triggers long story penalty'
    },
    description: 'They know a guy who knows a guy. Every transaction comes with a 20-minute story.',
    restrictions: [],
    startingItems: {
      phoneBattery: 75,
      content: 60,
      outfits: 2,
      advil: 3,
      zyn: 10
    }
  },
  {
    id: 'long-island',
    name: 'Long Island Person',
    origin: 'Long Island',
    money: 900,
    vibes: 2, // Low-Medium
    audacity: 5, // Very High
    difficulty: 1.2,
    specialAbility: {
      name: 'Aggressive Negotiation',
      description: 'Talk down prices, occasionally get kicked out'
    },
    description: 'Will argue about everything. Strong opinions about which bagel place is "real."',
    restrictions: [
      'Can drive own car (treated as mild character flaw)'
    ],
    startingItems: {
      phoneBattery: 70,
      content: 55,
      outfits: 2,
      advil: 5,
      zyn: 15
    }
  },
  {
    id: 'california-person',
    name: 'California Person',
    origin: 'California',
    money: 1400,
    vibes: 3, // Medium (thinks it's Very High)
    audacity: 2, // Low
    difficulty: 1.1,
    specialAbility: {
      name: 'Wellness Routine',
      description: 'Recover health faster but lose time/money randomly'
    },
    description: 'Brings their wellness routine and confusion about seasons. Talks about "the energy" constantly.',
    restrictions: [
      'Can drive own car (treated as mild character flaw)',
      'Must spend money on wellness items periodically'
    ],
    startingItems: {
      phoneBattery: 90,
      content: 70,
      outfits: 4,
      advil: 0,
      zyn: 0
    }
  },
  {
    id: 'delivery-driver',
    name: 'West African Delivery Driver',
    origin: 'West Africa (e-bike)',
    money: 200,
    vibes: 5, // Very High
    audacity: 5, // Very High
    difficulty: 3.0,
    specialAbility: {
      name: 'Ghost Mode',
      description: 'Bypass certain barriers, immune to navigation events'
    },
    description: 'Already lives here. Actually knows the city. On hard mode because money is tight.',
    restrictions: [
      'Electric bike only',
      'Skips supplies screen entirely'
    ],
    startingItems: {
      phoneBattery: 60,
      content: 100,
      outfits: 1,
      advil: 2,
      zyn: 0
    },
    skipStore: true,
    storeMessage: 'You already have everything you need. And also you live here.'
  },
  {
    id: 'uk-banker',
    name: 'UK Banker',
    origin: 'London',
    money: 1400,
    vibes: 2, // Low
    audacity: 3, // Medium
    difficulty: 1.0,
    specialAbility: {
      name: 'Expense Account',
      description: 'Charge to corporate card, triggers HR review if overused'
    },
    description: 'On assignment. Complains about the exchange rate. Calls it "New York City" in full every time.',
    restrictions: [
      'Cannot take subway',
      'App Car and Yellow Cab only'
    ],
    startingItems: {
      phoneBattery: 85,
      content: 40,
      outfits: 3,
      advil: 3,
      zyn: 0
    }
  },
  {
    id: 'european-model',
    name: 'European Model',
    origin: 'Europe',
    money: 500,
    vibes: 5, // Very High
    audacity: 3, // Medium
    difficulty: 1.8,
    specialAbility: {
      name: 'The Look',
      description: 'Free entry anywhere once per act'
    },
    description: 'Gets in everywhere. Vibes are immaculate. Money is tight but connections are not.',
    restrictions: [],
    startingItems: {
      phoneBattery: 65,
      content: 90,
      outfits: 5,
      advil: 1,
      zyn: 20
    }
  },
  {
    id: 'aristocrat',
    name: 'Russian/Chinese Aristocrat',
    origin: 'Moscow or Shanghai',
    money: 5000,
    vibes: 1, // Very Low
    audacity: 5, // Very High
    difficulty: 0.5,
    specialAbility: {
      name: 'Wire Transfer',
      description: 'Solve almost anything with money, leads to hollow ending'
    },
    description: 'Money solves problems. But at what cost? (No cost actually, just money.)',
    restrictions: [
      'Cannot take subway',
      'Helicopter available'
    ],
    startingItems: {
      phoneBattery: 100,
      content: 20,
      outfits: 6,
      advil: 10,
      zyn: 0
    },
    specialStoreMessage: 'You have $5,000. This will cover approximately one month of your carrying costs in Tribeca.'
  }
];

// Helper function to get character by ID
function getCharacter(id) {
  return CHARACTERS.find(char => char.id === id);
}

// Helper function to get all characters for selection
function getAllCharacters() {
  return CHARACTERS;
}
