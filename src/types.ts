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
  pricingUrl?: string;                // link to official pricing page
}

// ───── Grade Values ─────

export type GradeNumber = 1 | 1.5 | 2 | 2.5 | 3 | 3.5 | 4 | 4.5 | 5 | 5.5 | 6 | 6.5 | 7 | 7.5 | 8 | 8.5 | 9 | 9.5 | 10;

// ───── Premium / alternate "10" grades ─────
// PriceCharting tracks several distinct "10" grades. PSA 10 is the default
// grade-10 value; users can opt a card into one of these premium variants.
export type TenVariantKey = 'tag10' | 'bgs10' | 'bgs10black' | 'cgc10' | 'cgc10pristine' | 'sgc10' | 'ace10';

export const TEN_VARIANTS: { key: TenVariantKey; label: string }[] = [
  { key: 'bgs10black', label: 'BGS Black Label' },
  { key: 'cgc10pristine', label: 'CGC Pristine' },
  { key: 'tag10', label: 'TAG 10' },
  { key: 'bgs10', label: 'BGS 10' },
  { key: 'cgc10', label: 'CGC 10' },
  { key: 'sgc10', label: 'SGC 10' },
  { key: 'ace10', label: 'ACE 10' },
];

export const ALL_GRADES: GradeNumber[] = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10];
export const DEFAULT_GRADES: GradeNumber[] = [9, 10];

// ───── Grading Submissions ─────
// A submission is a named batch of cards you'll send to a grader together.
// The name is just a label; each card keeps its own company/tier.

export interface Submission {
  id: string;
  name: string;
}

// ───── Card Entry ─────

export interface GradingCard {
  id: string;
  submissionId?: string;   // which submission/batch this card belongs to
  cardName: string;
  cardGame: string;
  cardNumber: string;
  set: string;
  language: string;                    // e.g. 'EN', 'JP', 'KR', 'CN', 'DE', etc.
  pricePaid: number;
  rawPrice: number;
  gradeValues: Partial<Record<GradeNumber, number>>;  // grade → expected price
  tenVariants?: Partial<Record<TenVariantKey, number>>;  // premium "10" prices from lookup
  tenVariant?: TenVariantKey | null;   // selected premium "10" (null = standard PSA 10)
  quantity: number;
  includeInTotal: boolean;             // count this card toward the summary totals
  company: GradingCompany | null;      // per-card override (null = use global)
  serviceLevel: string | null;         // per-card override (null = use global)
  customGradingFee: number | null;     // per-card flat grading price override (null = use tier / global custom)
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
  currentUpcharge: number;   // upcharge owed now, based on the card's present (raw) value
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

export interface ProfitThresholds {
  green: number;        // profit >= green → green row
  yellow: number;       // profit >= yellow (and < green) → yellow row; below yellow → red row
  highlightGrade: 9 | 10;  // which grade's profit to use for highlighting
}

export interface AppSettings {
  darkMode: boolean;
  visibleGrades: GradeNumber[];
  showHalfGrades: boolean;
  defaultCompany: GradingCompany | null;
  defaultServiceLevel: Record<GradingCompany, string>;
  feeOverrides: Record<GradingCompany, Partial<CompanyFeeStructure>>;
  defaultLanguage: string;             // e.g. 'EN', 'JP' — applied to new cards
  profitThresholds: ProfitThresholds;
  globalCustomGradingFee: number | null;  // flat grading price applied to all cards (null = use tiers)
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
  profitThresholds: { green: 50, yellow: 25, highlightGrade: 10 },
  globalCustomGradingFee: null,
};
