import Papa from 'papaparse';
import type { GradingCard } from './types';

// ───── TCGPlayer set code → full name map ─────

const TCG_SET_CODES: Record<string, string> = {
  BS: 'Base Set', BS2: 'Base Set 2', JU: 'Jungle', FO: 'Fossil',
  TR: 'Team Rocket', G1: 'Gym Heroes', G2: 'Gym Challenge',
  N1: 'Neo Genesis', N2: 'Neo Discovery', N3: 'Neo Revelation', N4: 'Neo Destiny',
  LC: 'Legendary Collection', EX: 'Expedition Base Set', AQ: 'Aquapolis', SK: 'Skyridge',
  RS: 'EX Ruby & Sapphire', SS: 'EX Sandstorm', DR: 'EX Dragon',
  MA: 'EX Team Magma vs Team Aqua', HL: 'EX Hidden Legends',
  FL: 'EX FireRed & LeafGreen', TRR: 'EX Team Rocket Returns',
  DE: 'EX Deoxys', EM: 'EX Emerald', UF: 'EX Unseen Forces',
  DS: 'EX Delta Species', LM: 'EX Legend Maker', HP: 'EX Holon Phantoms',
  CG: 'EX Crystal Guardians', DF: 'EX Dragon Frontiers', PK: 'EX Power Keepers',
  DP: 'Diamond & Pearl', MT: 'Mysterious Treasures', SW: 'Secret Wonders',
  GE: 'Great Encounters', MD: 'Majestic Dawn', LA: 'Legends Awakened', SF: 'Stormfront',
  PL: 'Platinum', RR: 'Rising Rivals', SV: 'Supreme Victors', AR: 'Arceus',
  HS: 'HeartGold & SoulSilver', UL: 'Unleashed', UD: 'Undaunted',
  TM: 'Triumphant', CL: 'Call of Legends',
  BLW: 'Black & White', EPO: 'Emerging Powers', NVI: 'Noble Victories',
  NXD: 'Next Destinies', DEX: 'Dark Explorers', DRX: 'Dragons Exalted',
  BCR: 'Boundaries Crossed', PLS: 'Plasma Storm', PLF: 'Plasma Freeze',
  PLB: 'Plasma Blast', LTR: 'Legendary Treasures',
  XY: 'XY', FLF: 'Flashfire', FFI: 'Furious Fists', PHF: 'Phantom Forces',
  PRC: 'Primal Clash', DCR: 'Double Crisis', ROS: 'Roaring Skies',
  AOR: 'Ancient Origins', BKT: 'BREAKthrough', BKP: 'BREAKpoint',
  FCO: 'Fates Collide', STS: 'Steam Siege', EVO: 'Evolutions',
  SUM: 'Sun & Moon', GRI: 'Guardians Rising', BUS: 'Burning Shadows',
  SHF: 'Shining Legends', CIN: 'Crimson Invasion', UPR: 'Ultra Prism',
  FLI: 'Forbidden Light', CES: 'Celestial Storm', DRM: 'Dragon Majesty',
  LOT: 'Lost Thunder', TEU: 'Team Up', DET: 'Detective Pikachu',
  UNB: 'Unbroken Bonds', UNM: 'Unified Minds', HIF: 'Hidden Fates',
  CEC: 'Cosmic Eclipse',
  SSH: 'Sword & Shield', RCL: 'Rebel Clash', DAA: 'Darkness Ablaze',
  CPA: "Champion's Path", VIV: 'Vivid Voltage', SHF2: 'Shining Fates',
  BST: 'Battle Styles', CRE: 'Chilling Reign', EVS: 'Evolving Skies',
  CEL: 'Celebrations', FST: 'Fusion Strike', BRS: 'Brilliant Stars',
  ASR: 'Astral Radiance', PGO: 'Pokemon GO', LOR: 'Lost Origin',
  SIT: 'Silver Tempest', CRZ: 'Crown Zenith',
  SVI: 'Scarlet & Violet', PAL: 'Paldea Evolved', OBF: 'Obsidian Flames',
  MEW: '151', PAR: 'Paradox Rift', PAF: 'Paldean Fates',
  TEF: 'Temporal Forces', TWM: 'Twilight Masquerade', SFA: 'Shrouded Fable',
  SCR: 'Stellar Crown', SSP: 'Surging Sparks', PRE: 'Prismatic Evolutions',
  JTG: 'Journey Together',
};

function resolveSetCode(code: string): string {
  return TCG_SET_CODES[code] ?? code;
}

// ───── Format detection ─────

type ImportFormat =
  | 'collectr'
  | 'tcgplayer-csv'
  | 'tcgplayer-text-prices'
  | 'tcgplayer-text-no-prices';

function detectFormat(content: string): ImportFormat {
  const trimmed = content.trim();
  const firstLine = trimmed.split('\n')[0].trim();

  if (firstLine.includes('TCGplayer Id')) return 'tcgplayer-csv';

  if (
    firstLine.includes('Portfolio Name') ||
    (firstLine.includes('Product Name') && firstLine.includes('Category'))
  ) {
    return 'collectr';
  }

  if (/\$\d+(?:\.\d+)?\s+each/i.test(trimmed)) return 'tcgplayer-text-prices';

  if (/^\d+\s+.+\[[A-Za-z0-9-]+\]/m.test(trimmed)) return 'tcgplayer-text-no-prices';

  return 'collectr';
}

// ───── Helpers ─────

function detectCategory(row: Record<string, string>): string {
  const cat = row['Category'] || row['Product Line'] || '';
  if (!cat) return 'Pokémon';
  // Normalize common category names
  const lower = cat.toLowerCase();
  if (lower.includes('pokemon') || lower.includes('pokémon')) return 'Pokémon';
  if (lower.includes('magic')) return 'Magic: The Gathering';
  if (lower.includes('yu-gi-oh') || lower.includes('yugioh')) return 'Yu-Gi-Oh!';
  return cat;
}

function makeCard(overrides: Partial<GradingCard>): GradingCard {
  return {
    id: crypto.randomUUID(),
    cardName: '',
    cardGame: 'Pokémon',
    cardNumber: '',
    set: '',
    language: 'EN',
    pricePaid: 0,
    rawPrice: 0,
    gradeValues: {},
    quantity: 1,
    company: null,
    serviceLevel: null,
    noGrading: false,
    scoring: false,
    pokemonCenter: false,
    notes: '',
    source: 'import',
    ...overrides,
  };
}

// ───── Collectr CSV Parser ─────

function parseCollectrCSV(content: string): GradingCard[] {
  const result = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  if (result.errors.length > 0 && result.data.length === 0) return [];

  const rawHeaders = Object.keys(result.data[0] || {});
  const marketPriceKey = rawHeaders.find((h) => h.toLowerCase().includes('market price')) || 'Market Price';

  return result.data.map((row) =>
    makeCard({
      cardName: row['Product Name'] || '',
      cardGame: detectCategory(row),
      set: row['Set'] || '',
      cardNumber: row['Card Number'] || '',
      pricePaid: parseFloat(row['Average Cost Paid'] || '0') || 0,
      rawPrice: parseFloat(row[marketPriceKey] || '0') || 0,
      quantity: parseInt(row['Quantity'] || '1', 10) || 1,
      notes: row['Notes'] || '',
    })
  );
}

// ───── TCGPlayer CSV Parser ─────

function parseTCGPlayerCSV(content: string): GradingCard[] {
  const result = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  if (result.errors.length > 0 && result.data.length === 0) return [];

  return result.data
    .filter((row) => row['TCGplayer Id'])
    .map((row) =>
      makeCard({
        cardName: row['Product Name'] || '',
        cardGame: detectCategory(row),
        set: row['Set Name'] || '',
        cardNumber: row['Number'] || '',
        rawPrice: parseFloat(row['TCG Market Price'] || '0') || 0,
        quantity: parseInt(row['Total Quantity'] || '1', 10) || 1,
      })
    );
}

// ───── TCGPlayer Text Parser ─────

const TEXT_LINE_RE =
  /^(\d+)\s+(.+?)\s+\[([A-Za-z0-9-]+)\]\s+(\S+)\s+\(([^)]+)\)\s+\$([0-9]+(?:\.[0-9]+)?)\s+each/;

function parseTCGPlayerText(content: string): GradingCard[] {
  const cards: GradingCard[] = [];

  for (const raw of content.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('TOTAL:') || line.startsWith('//')) continue;

    const m = TEXT_LINE_RE.exec(line);
    if (!m) continue;

    const [, qtyStr, name, setCode, cardNumber, , priceStr] = m;

    cards.push(
      makeCard({
        cardName: name.trim(),
        cardGame: 'Pokémon',
        set: resolveSetCode(setCode),
        cardNumber,
        rawPrice: parseFloat(priceStr) || 0,
        quantity: parseInt(qtyStr, 10) || 1,
      })
    );
  }

  return cards;
}

// ───── Unified entry point ─────

export interface ImportResult {
  cards: GradingCard[];
  error?: string;
  format?: string;
}

export function parseImport(content: string, filename: string): ImportResult {
  const format = detectFormat(content);

  if (format === 'tcgplayer-text-no-prices') {
    return {
      cards: [],
      error:
        'TCGPlayer text exports without prices are not supported. ' +
        'Enable "Show prices" in TCGPlayer when generating your text export, or use CSV export instead.',
    };
  }

  let cards: GradingCard[];
  if (format === 'tcgplayer-csv') {
    cards = parseTCGPlayerCSV(content);
  } else if (format === 'tcgplayer-text-prices') {
    cards = parseTCGPlayerText(content);
  } else {
    cards = parseCollectrCSV(content);
  }

  if (cards.length === 0) {
    return {
      cards: [],
      error: `Failed to parse "${filename}". Make sure it's a valid TCGPlayer or Collectr export.`,
    };
  }

  return { cards, format };
}
