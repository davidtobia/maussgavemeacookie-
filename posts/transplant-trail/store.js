/**
 * THE TRANSPLANT TRAIL - STORE ITEMS
 * Supplies you can buy before hitting the trail
 */

const STORE_ITEMS = [
  {
    id: 'metrocard',
    name: 'Metrocard',
    price: 150,
    description: 'Unlimited monthly. Essential unless you bike everywhere.',
    category: 'transport'
  },
  {
    id: 'bank-bike-pass',
    name: 'Bank Bike Pass',
    price: 200,
    description: 'Monthly membership. Show up sweaty or show up late.',
    category: 'transport'
  },
  {
    id: 'work-outfit',
    name: 'Work Outfit',
    price: 120,
    description: 'Professional clothes. More outfits = more money earning potential.',
    category: 'clothing',
    maxQuantity: 5
  },
  {
    id: 'fun-outfit',
    name: 'Fun Outfit',
    price: 80,
    description: 'For nights out. Boosts aura, gets you into places.',
    category: 'clothing',
    maxQuantity: 5
  },
  {
    id: 'thrift-find',
    name: 'Thrift Store Find',
    price: 25,
    description: 'Vintage vibes, major aura boost. Risk: bedbugs.',
    category: 'clothing',
    maxQuantity: 3,
    risk: 'bedbugs'
  },
  {
    id: 'advil',
    name: 'Advil (bottle)',
    price: 15,
    description: 'For hangovers and general NYC life.',
    category: 'medicine',
    maxQuantity: 10
  },
  {
    id: 'zyn',
    name: 'Zyn (tin)',
    price: 8,
    description: 'Nicotine pouches. Everyone has them now apparently.',
    category: 'supplies',
    maxQuantity: 20
  },
  {
    id: 'energy-drink',
    name: 'Energy Drinks (case)',
    price: 30,
    description: 'For late nights and early mornings.',
    category: 'supplies',
    maxQuantity: 5
  },
  {
    id: 'phone-charger',
    name: 'Portable Charger',
    price: 45,
    description: 'Dead phone = lost in the city.',
    category: 'supplies'
  },
  {
    id: 'sunglasses',
    name: 'Sunglasses',
    price: 20,
    description: 'Look cool, avoid eye contact.',
    category: 'supplies'
  }
];

// Helper to get item by ID
function getStoreItem(id) {
  return STORE_ITEMS.find(item => item.id === id);
}
