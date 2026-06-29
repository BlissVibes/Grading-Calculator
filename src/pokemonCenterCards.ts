// ───── Pokémon Center Stamped Cards ─────
//
// Cards that exist in a "[Pokemon Center]" stamped variant — the Poké Ball /
// Pokémon Center logo stamp print that sells for more than the unstamped card.
//
// Sourced from PriceCharting: every product whose title literally contains
// "[Pokemon Center]", excluding boxes / Elite Trainer Boxes / consoles:
//   https://www.pricecharting.com/search-products?q=[pokemon+center]&type=prices
//
// A card is treated as PKC-eligible when its name contains one of these names
// (case-insensitive). `number` is the stamped promo's card number, kept for
// reference and as a secondary match signal.

export interface PkcEntry {
  name: string;
  number: string;
}

export const POKEMON_CENTER_STAMPED: PkcEntry[] = [
  { name: "N's Zekrom", number: '31' },
  { name: 'Eevee', number: '173' },
  { name: 'Charmander', number: '44' },
  { name: 'Snorlax', number: '51' },
  { name: 'Magneton', number: '159' },
  { name: 'Mimikyu', number: '75' },
  { name: 'Squirtle', number: '7' },
  { name: 'Charcadet', number: '22' },
  { name: 'Riolu', number: '10' },
  { name: 'Alakazam', number: '9' },
  { name: "Team Rocket's Tyranitar", number: '96' },
  { name: "Team Rocket's Wobbuffet", number: '203' },
  { name: 'Thundurus', number: '209' },
  { name: "N's Zorua", number: '189' },
  { name: 'Noctowl', number: '141' },
  { name: 'Tornadus', number: '210' },
  { name: 'Miraidon', number: '13' },
  { name: 'Pecharunt', number: '129' },
  { name: 'Teal Mask Ogerpon', number: '123' },
  { name: 'Koraidon', number: '14' },
  { name: 'Scream Tail', number: '65' },
  { name: 'Flutter Mane', number: '97' },
  { name: 'Iron Thorns', number: '98' },
  { name: 'Iron Bundle', number: '66' },
  { name: 'Lechonk', number: '155' },
  { name: 'Bulbasaur', number: '30/DPt-P' },
  { name: 'M Rayquaza EX', number: '272/XY-P' },
];

/** A card may carry a Pokémon Center stamp (so the PKC button is shown by default). */
export function isPkcEligible(card: { cardName: string; cardGame: string }): boolean {
  if (card.cardGame !== 'Pokémon') return false;
  const name = card.cardName.toLowerCase();
  if (!name.trim()) return false;
  return POKEMON_CENTER_STAMPED.some((e) => name.includes(e.name.toLowerCase()));
}

/** Detect whether a PriceCharting match is the Pokémon Center stamped variant. */
export function isStampedMatch(title?: string, url?: string): boolean {
  const t = (title ?? '').toLowerCase();
  const u = (url ?? '').toLowerCase();
  return t.includes('pokemon center') || u.includes('pokemon-center');
}
