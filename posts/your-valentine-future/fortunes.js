/**
 * FORTUNE COOKIE GAME - FORTUNE DATA
 * Fortunes written by David - unhinged and perfect
 */

// Boring fortune for when player says "no"
const BORING_FORTUNES = [
  {
    category: "MUNDANE FATE",
    fortune: "Fortune cookie fortune cookie",
    blessing: "BLESSING: You're alive… for now",
    curse: "CURSE: You're alive… for now",
    action: "Play the game you dweeb",
    shareText: "Share this and reveal you're annoying"
  }
];

// Themed fortunes organized by love type
const THEMED_FORTUNES = {
  forbiddenLove: [
    {
      category: "FORBIDDEN LOVE",
      fortune: "You want what what you CANNOT have. Or… can you",
      blessing: "BLESSING: You actually can have it",
      curse: "CURSE: You actually can have it",
      action: "Text them",
      shareText: "You know who to share this with lol"
    }
  ],

  unrequitedLove: [
    {
      category: "UNREQUITED LOVE",
      fortune: "They don't think about you, but you think about poo",
      blessing: "BLESSING: Longing is Yearning, Yearning is Suffering, Suffering is LIFE",
      curse: "CURSE: Longing is Yearning, Yearning is Suffering, Suffering is LIFE",
      action: "All you know are sad songs, but sad songs are happy songs. Walk for 2 hours today and listen to one song on repeat",
      shareText: "Share this with someone who owes you dinner"
    }
  ],

  passionateLove: [
    {
      category: "PASSIONATE LOVE",
      fortune: "You are in LOVE and everyone finds it repulsive",
      blessing: "BLESSING: Burn bright, burn short, this is the happiest you'll ever be",
      curse: "CURSE: Burn bright, burn short, this is the happiest you'll ever be",
      action: "Tell two people in person that you love them. One will kiss you and one will slap you",
      shareText: "Share this with someone and demand a poem in return"
    }
  ],

  sweetLove: [
    {
      category: "SWEET LOVE",
      fortune: "Your love is sweet but no one cares",
      blessing: "BLESSING: People find you boring even though you're happy",
      curse: "CURSE: People find you boring even though you're happy",
      action: "Find a vegetarian and tell them you respect their life choices",
      shareText: "Share this with someone and see if they remember who you are"
    }
  ],

  chaoticLove: [
    {
      category: "CHAOTIC LOVE",
      fortune: "People say you're having a \"manic episode\" but they're not real. They're in your head. They're in your computer",
      blessing: "BLESSING: There is only you and your thoughts, and this guitar",
      curse: "CURSE: There is only you and your thoughts, and this guitar",
      action: "Find a dictionary. Find the entry for \"no\" and eat it",
      shareText: "Text everyone you've ever known this link"
    }
  ],

  lostLove: [
    {
      category: "LOST LOVE",
      fortune: "Goodbye my lover, goodbye my friend, you are the one….. you are the one",
      blessing: "BLESSING: James Blunt is your dad. He saw you on the subway",
      curse: "CURSE: James Blunt is your dad. He saw you on the subway",
      action: "Write a letter to Santa Clause. Tell him I love you and I miss you",
      shareText: "Share with someone nostalgic. They'll find an old photo today"
    }
  ],

  newLove: [
    {
      category: "NEW LOVE",
      fortune: "LOVE IS COMING",
      blessing: "BLESSING: There's something wrong with them. Embrace their sociopathy. Have sociopathic children",
      curse: "CURSE: There's something wrong with them. Embrace their sociopathy. Have sociopathic children",
      action: "Go get a Panda Express \"Bigger Plate.\" Ask someone in the food court to eat it with you. Take the lo mein (or rice) and do like those horny Disney dogs",
      shareText: "Finish your Panda Express mission. Get their number and make them play this game"
    }
  ],

  selfLove: [
    {
      category: "SELF LOVE",
      fortune: "We enter alone. We leave alone. Even your memories are in the here and now",
      blessing: "BLESSING: I love you",
      curse: "CURSE: I love you",
      action: "Go get sticks and rocks and then paint them and make something cool",
      shareText: "Text this to everyone you've ever met"
    }
  ]
};

// Map sense + season combinations to themes
const THEME_MAP = {
  // LOVE sense always leads to intense themes
  'LOVE-winter': 'forbiddenLove',
  'LOVE-fall': 'forbiddenLove',
  'LOVE-summer': 'passionateLove',
  'LOVE-spring': 'passionateLove',
  'LOVE-rainy': 'chaoticLove',
  'LOVE-dry': 'chaoticLove',
  'LOVE-LOVE': 'selfLove', // Secret best ending!

  // Touch combinations
  'touch-winter': 'forbiddenLove',
  'touch-summer': 'passionateLove',
  'touch-spring': 'sweetLove',
  'touch-fall': 'lostLove',
  'touch-rainy': 'chaoticLove',
  'touch-dry': 'newLove',
  'touch-LOVE': 'passionateLove',

  // Sight combinations
  'sight-winter': 'lostLove',
  'sight-summer': 'newLove',
  'sight-spring': 'newLove',
  'sight-fall': 'chaoticLove',
  'sight-rainy': 'unrequitedLove',
  'sight-dry': 'sweetLove',
  'sight-LOVE': 'selfLove',

  // Smell combinations (often nostalgic)
  'smell-winter': 'lostLove',
  'smell-summer': 'lostLove',
  'smell-spring': 'newLove',
  'smell-fall': 'lostLove',
  'smell-rainy': 'unrequitedLove',
  'smell-dry': 'sweetLove',
  'smell-LOVE': 'passionateLove',

  // Hearing combinations
  'hearing-winter': 'unrequitedLove',
  'hearing-summer': 'chaoticLove',
  'hearing-spring': 'sweetLove',
  'hearing-fall': 'lostLove',
  'hearing-rainy': 'unrequitedLove',
  'hearing-dry': 'newLove',
  'hearing-LOVE': 'selfLove',

  // Taste combinations
  'taste-winter': 'forbiddenLove',
  'taste-summer': 'sweetLove',
  'taste-spring': 'sweetLove',
  'taste-fall': 'passionateLove',
  'taste-rainy': 'chaoticLove',
  'taste-dry': 'newLove',
  'taste-LOVE': 'passionateLove'
};

// Theme metadata for card styling
const THEME_STYLES = {
  boring: {
    cardColor: '#f5f5dc',
    textColor: '#666',
    borderColor: '#d3d3d3',
    emoji: '🍪'
  },
  forbiddenLove: {
    cardColor: '#1a1a1a',
    textColor: '#fff',
    borderColor: '#8b0000',
    emoji: '🖤'
  },
  unrequitedLove: {
    cardColor: '#4a5568',
    textColor: '#e2e8f0',
    borderColor: '#2d3748',
    emoji: '💙'
  },
  passionateLove: {
    cardColor: '#8b0000',
    textColor: '#fff',
    borderColor: '#ff6b6b',
    emoji: '❤️‍🔥'
  },
  sweetLove: {
    cardColor: '#ffb3d9',
    textColor: '#4a1942',
    borderColor: '#ff69b4',
    emoji: '💕'
  },
  chaoticLove: {
    cardColor: '#6b46c1',
    textColor: '#fff',
    borderColor: '#9f7aea',
    emoji: '💜'
  },
  lostLove: {
    cardColor: '#1e3a8a',
    textColor: '#dbeafe',
    borderColor: '#3b82f6',
    emoji: '💔'
  },
  newLove: {
    cardColor: '#fbbf24',
    textColor: '#78350f',
    borderColor: '#f59e0b',
    emoji: '✨'
  },
  selfLove: {
    cardColor: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    textColor: '#fff',
    borderColor: '#f093fb',
    emoji: '🌟'
  }
};
