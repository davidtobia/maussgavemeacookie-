/**
 * THE TRANSPLANT TRAIL - STORE DATA
 */

const STORE_CATEGORIES = {
  transport: [
    { id: 'metrocard', name: 'Metrocard', price: 132, maxQuantity: 3 },
    { id: 'bank-bike', name: 'Bank Bike Pass', price: 220, maxQuantity: 1 },
    { id: 'uber-credit', name: 'Uber Credit', price: 100, maxQuantity: 5 }
  ],
  clothing: [
    { id: 'chanel', name: 'Chanel', price: 800, maxQuantity: 3 },
    { id: 'rag-and-bone', name: 'Rag & Bone', price: 500, maxQuantity: 3 },
    { id: 'aritzia', name: 'Aritzia', price: 300, maxQuantity: 5 },
    { id: 'patagonia-vest', name: 'Patagonia Vest', price: 280, maxQuantity: 2 },
    { id: 'thrift', name: 'Thrift Store', price: 250, maxQuantity: 5 },
    { id: 'todd-snyder', name: 'Todd Snyder', price: 350, maxQuantity: 3 },
    { id: 'scotch-and-soda', name: 'Scotch & Soda', price: 180, maxQuantity: 5 },
    { id: 'allsaints', name: 'AllSaints', price: 160, maxQuantity: 3 },
    { id: 'bonobos', name: 'Bonobos', price: 120, maxQuantity: 5 },
    { id: 'zara', name: 'Zara', price: 80, maxQuantity: 5 },
    { id: 'gap', name: 'Gap', price: 60, maxQuantity: 5 }
  ],
  other: [
    { id: 'zyn', name: 'Zyn', price: 8, maxQuantity: 20 },
    { id: 'adderall', name: 'Adderall', price: 40, maxQuantity: 10 },
    { id: 'cocaine', name: 'Cocaine', price: 150, maxQuantity: 5 },
    { id: 'gun', name: 'Gun', price: 600, maxQuantity: 1 }
  ]
};

function getStoreItem(id) {
  for (const category of Object.values(STORE_CATEGORIES)) {
    const item = category.find(i => i.id === id);
    if (item) return item;
  }
  return null;
}

// Keep STORE_ITEMS as flat array for compatibility
const STORE_ITEMS = Object.values(STORE_CATEGORIES).flat();
