// ───── Grading Companies ─────

export type GradingCompany = 'PSA' | 'TAG' | 'Beckett' | 'ARS' | 'CGC';

export const GRADING_COMPANIES: GradingCompany[] = ['PSA', 'TAG', 'Beckett', 'ARS', 'CGC'];

export const COMPANY_LABELS: Record<GradingCompany, string> = {
  PSA: 'PSA',
  TAG: 'TAG',
  Beckett: 'Beckett (BGS)',
  ARS: 'ARS',
  CGC: 'CGC',
};

// ───── Card Games ─────

export const CARD_GAMES = [
  'Pokémon',
  'Magic: The Gathering',
  'Yu-Gi-Oh!',
  'Dragon Ball Super',
  'One Piece',
  'Lorcana',
  'Flesh and Blood',
  'Digimon',
  'Star Wars: Unlimited',
  'MetaZoo',
  'Panini',
  'Topps',
  'Upper Deck',
  'Sports Cards',
  'Other',
] as const;

// ───── Service Levels ─────

export interface ServiceLevel {
  id: string;
  name: string;
  baseFee: number;
  turnaround: string;       // e.g., "65 business days"
  minCards?: number;         // e.g., 20 for PSA Value
  maxDeclaredValue?: number; // max value before upcharges apply
}

export interface ValueUpcharge {
  minValue: number;
  maxValue: number | null;   // null = no upper limit
  fee: number;
}

export interface ScoringOption {
  name: string;
  additionalFee: number;
}

export interface CompanyFeeStructure {
  company: GradingCompany;
  serviceLevels: ServiceLevel[];
  valueUpcharges: ValueUpcharge[];
  scoringOptions?: ScoringOption[];   // TAG specific
  insuranceFee?: number;              // per $100 of declared value
  shippingEstimate?: number;          // base return shipping
}

// ───── Grade Values ─────

export type GradeNumber = 1 | 1.5 | 2 | 2.5 | 3 | 3.5 | 4 | 4.5 | 5 | 5.5 | 6 | 6.5 | 7 | 7.5 | 8 | 8.5 | 9 | 9.5 | 10;

export const ALL_GRADES: GradeNumber[] = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10];
export const DEFAULT_GRADES: GradeNumber[] = [9, 10];

// ───── Card Entry ─────

export interface GradingCard {
  id: string;
  cardName: string;
  cardGame: string;
  cardNumber: string;
  set: string;
  language: string;                    // e.g. 'EN', 'JP', 'KR', 'CN', 'DE', etc.
  pricePaid: number;
  rawPrice: number;
  gradeValues: Partial<Record<GradeNumber, number>>;  // grade → expected price
  quantity: number;
  company: GradingCompany | null;      // per-card override (null = use global)
  serviceLevel: string | null;         // per-card override (null = use global)
  noGrading: boolean;                  // exclude from grading calculations entirely
  scoring: boolean;                    // TAG scoring add-on
  pokemonCenter: boolean;              // Pokemon Center stamped variant (higher value)
  priceChartingUrl?: string;           // last successfully matched PriceCharting URL
  priceChartingTitle?: string;         // last successfully matched card title
  notes: string;
  source: 'manual' | 'import';
}

// ───── Calculation Results ─────

export interface GradeResult {
  grade: GradeNumber;
  expectedPrice: number;
  gradingFee: number;
  upcharge: number;
  totalCost: number;         // gradingFee + upcharge + scoring
  profit: number;            // expectedPrice - pricePaid - totalCost
  multiplier: number;        // profit / pricePaid (ROI)
}

export interface CardCalculation {
  cardId: string;
  company: GradingCompany;
  serviceLevel: string;
  grades: GradeResult[];
}

export interface CompanyComparisonResult {
  company: GradingCompany;
  serviceLevel: string;
  totalFees: number;
  totalUpcharges: number;
  totalCost: number;
  totalProfit: number;       // sum across all cards
  averageMultiplier: number;
}

// ───── Settings ─────

export interface AppSettings {
  darkMode: boolean;
  visibleGrades: GradeNumber[];
  showHalfGrades: boolean;
  defaultCompany: GradingCompany | null;
  defaultServiceLevel: Record<GradingCompany, string>;
  feeOverrides: Record<GradingCompany, Partial<CompanyFeeStructure>>;
  defaultLanguage: string;             // e.g. 'EN', 'JP' — applied to new cards
}

export const DEFAULT_SETTINGS: AppSettings = {
  darkMode: true,
  visibleGrades: [9, 10],
  showHalfGrades: false,
  defaultCompany: null,
  defaultServiceLevel: {
    PSA: 'value',
    TAG: 'standard',
    Beckett: 'economy',
    ARS: 'standard',
    CGC: 'standard',
  },
  feeOverrides: {
    PSA: {},
    TAG: {},
    Beckett: {},
    ARS: {},
    CGC: {},
  },
  defaultLanguage: 'EN',
};
