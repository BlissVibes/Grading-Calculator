import type {
  GradingCard,
  GradingCompany,
  GradeNumber,
  GradeResult,
  CardCalculation,
  CompanyComparisonResult,
  AppSettings,
} from './types';
import { COMPANY_FEES, PSA_RETIER_LADDER } from './gradingData';
import type { ServiceLevel } from './types';

// Grade value used in calculations. For grade 10, honor a selected premium
// variant (Black Label, CGC Pristine, TAG 10, …); otherwise the stored value.
export function effectiveGradeValue(card: GradingCard, grade: GradeNumber): number {
  if (grade === 10 && card.tenVariant) {
    return card.tenVariants?.[card.tenVariant] ?? card.gradeValues[10] ?? 0;
  }
  return card.gradeValues[grade] ?? 0;
}

// ───── Fee Calculation ─────

function getUpcharge(company: GradingCompany, declaredValue: number): number {
  const fees = COMPANY_FEES[company];
  for (const tier of fees.valueUpcharges) {
    if (declaredValue >= tier.minValue && (tier.maxValue === null || declaredValue <= tier.maxValue)) {
      return tier.fee;
    }
  }
  return 0;
}

function getServiceLevels(company: GradingCompany, settings: AppSettings): ServiceLevel[] {
  const override = settings.feeOverrides[company];
  return override?.serviceLevels ?? COMPANY_FEES[company].serviceLevels;
}

function getSelectedTier(company: GradingCompany, serviceLevelId: string, settings: AppSettings): ServiceLevel {
  const levels = getServiceLevels(company, settings);
  return levels.find((l) => l.id === serviceLevelId) ?? levels[0];
}

function getBaseFee(company: GradingCompany, serviceLevelId: string, settings: AppSettings): number {
  return getSelectedTier(company, serviceLevelId, settings).baseFee;
}

// Resolve the grading fee actually charged for a card, honoring custom-price
// precedence: card's own custom price > card's own tier > global custom price >
// global default tier.
function getEffectiveGradingFee(
  card: GradingCard,
  company: GradingCompany,
  serviceLevelId: string,
  settings: AppSettings,
): number {
  if (card.customGradingFee != null) return card.customGradingFee;
  if (card.serviceLevel == null && settings.globalCustomGradingFee != null) {
    return settings.globalCustomGradingFee;
  }
  return getBaseFee(company, serviceLevelId, settings);
}

// ───── PSA tier-bump upcharge ─────
// PSA re-bills a card to the cheapest STANDARD tier whose value cap covers the
// card's (post-grade) value; you pay the difference vs. the tier you submitted
// under. Only triggers when the value exceeds the submitted tier's cap.

function psaRequiredTier(value: number) {
  for (const t of PSA_RETIER_LADDER) {
    if (value <= t.maxValue) return t;
  }
  return PSA_RETIER_LADDER[PSA_RETIER_LADDER.length - 1];
}

function psaUpcharge(value: number, selectedTier: ServiceLevel): number {
  const cap = selectedTier.maxDeclaredValue;
  if (!cap || value <= cap) return 0;
  return Math.max(0, psaRequiredTier(value).baseFee - selectedTier.baseFee);
}

// Upcharge for a given grade value: PSA uses the tier-bump model (based on the
// graded value); every other company uses its flat declared-value schedule.
function upchargeFor(
  company: GradingCompany,
  gradeValue: number,
  declaredValue: number,
  selectedTier: ServiceLevel,
): number {
  if (company === 'PSA') return psaUpcharge(gradeValue, selectedTier);
  return getUpcharge(company, declaredValue);
}

function getScoringFee(company: GradingCompany, scoring: boolean): number {
  if (!scoring) return 0;
  const fees = COMPANY_FEES[company];
  if (!fees.scoringOptions || fees.scoringOptions.length === 0) return 0;
  return fees.scoringOptions[0].additionalFee;
}

// ───── Single Card Calculation ─────

export function calculateCard(
  card: GradingCard,
  settings: AppSettings,
): CardCalculation | null {
  // Cards marked "No Grading" are excluded from calculations
  if (card.noGrading) return null;

  const company = card.company ?? settings.defaultCompany ?? 'PSA';
  const serviceLevelId = card.serviceLevel ?? settings.defaultServiceLevel[company];
  const selectedTier = getSelectedTier(company, serviceLevelId, settings);

  const grades: GradeResult[] = [];

  // Cost basis: pricePaid overrides rawPrice when present
  const costBasis = card.pricePaid || card.rawPrice || 0;
  // Declared value for non-PSA upcharge: raw market value at submission
  const declaredValue = card.rawPrice || card.pricePaid || 0;
  const baseFee = getEffectiveGradingFee(card, company, serviceLevelId, settings);
  const scoringFee = getScoringFee(company, card.scoring);
  // Upcharge owed now, based on the card's present (raw) value — i.e. the
  // upcharge that applies even if the card doesn't grade up. Potential
  // (top-grade) upcharge lives per-grade in the results below.
  const currentUpcharge = upchargeFor(company, declaredValue, declaredValue, selectedTier);

  for (const grade of settings.visibleGrades) {
    const expectedPrice = effectiveGradeValue(card, grade);
    // PSA's upcharge depends on the graded value, so it varies per grade.
    const upcharge = upchargeFor(company, expectedPrice, declaredValue, selectedTier);
    const totalCost = baseFee + upcharge + scoringFee;
    const profit = expectedPrice - costBasis - totalCost;
    const multiplier = costBasis > 0 ? profit / costBasis : 0;

    grades.push({
      grade,
      expectedPrice,
      gradingFee: baseFee,
      upcharge,
      totalCost,
      profit,
      multiplier,
    });
  }

  return {
    cardId: card.id,
    company,
    serviceLevel: serviceLevelId,
    grades,
    currentUpcharge,
  };
}

// ───── Batch Calculation ─────

export function calculateAll(
  cards: GradingCard[],
  settings: AppSettings,
): CardCalculation[] {
  return cards
    .map((card) => calculateCard(card, settings))
    .filter((c): c is CardCalculation => c !== null);
}

// ───── PSA Top-Grade Upcharge Estimate ─────

export interface PsaUpchargeEstimate {
  topGradeValue: number;     // highest expected value across visible grades
  selectedTierName: string;  // tier the card is currently submitted under
  requiredTierName: string;  // cheapest tier whose cap covers the top-grade value
  upcharge: number;          // extra $ charged at the selected tier (0 if covered)
  avoidedUpcharge: number;   // upcharge spared by sitting at a covering tier (vs the cheapest tier)
  overpay: number;           // $ paid above the required tier (selected tier higher than needed)
  recommend: boolean;        // true → worth bumping up to the required tier
  recommendedTierName: string;
}

// Estimate the PSA upcharge picture for a card at its top visible grade:
//  • upcharge          — extra you'd pay if you under-tiered the card
//  • avoidedUpcharge   — the upcharge you've *dodged* by submitting at a tier
//                        that already covers the value (shows the tier's worth)
//  • overpay           — you picked a tier pricier than the value needs
export function estimatePsaUpcharge(
  card: GradingCard,
  settings: AppSettings,
): PsaUpchargeEstimate | null {
  if (card.noGrading) return null;
  const company = card.company ?? settings.defaultCompany ?? 'PSA';
  if (company !== 'PSA') return null;

  const serviceLevelId = card.serviceLevel ?? settings.defaultServiceLevel[company];
  const selectedTier = getSelectedTier(company, serviceLevelId, settings);

  const topGradeValue = Math.max(0, ...settings.visibleGrades.map((g) => card.gradeValues[g] ?? 0));
  if (topGradeValue <= 0) return null;

  const required = psaRequiredTier(topGradeValue);
  const upcharge = psaUpcharge(topGradeValue, selectedTier);

  // Baseline = cheapest standard tier (Value). The upcharge it would incur is
  // the "potential" upcharge; if the selected tier dodges it, that's the value
  // of having picked the higher tier (same total cost, faster, no surprise bill).
  const valueTier = getSelectedTier(company, 'value', settings);
  const baselineUpcharge = psaUpcharge(topGradeValue, valueTier);

  const overpay = Math.max(0, selectedTier.baseFee - required.baseFee);
  const avoidedUpcharge = upcharge === 0 && overpay === 0 ? baselineUpcharge : 0;

  // Recommend bumping up when the projected value would be upcharged into
  // Express territory or beyond anyway — the upcharge ~ the cost of Express, so
  // the faster turnaround is effectively free.
  const EXPRESS_FEE = 149;
  const recommend = required.baseFee >= EXPRESS_FEE && required.baseFee > selectedTier.baseFee;

  return {
    topGradeValue,
    selectedTierName: selectedTier.name,
    requiredTierName: required.name,
    upcharge,
    avoidedUpcharge,
    overpay,
    recommend,
    recommendedTierName: required.name,
  };
}

// ───── Company Comparison ─────

export function compareCompanies(
  card: GradingCard,
  grade: GradeNumber,
  settings: AppSettings,
): CompanyComparisonResult[] {
  const expectedPrice = effectiveGradeValue(card, grade);
  const costBasis = card.pricePaid || card.rawPrice || 0;
  const declaredValue = card.rawPrice || card.pricePaid || 0;

  return (['PSA', 'TAG', 'Beckett', 'ARS', 'CGC'] as GradingCompany[]).map((company) => {
    const serviceLevelId = settings.defaultServiceLevel[company];
    const selectedTier = getSelectedTier(company, serviceLevelId, settings);
    const baseFee = getBaseFee(company, serviceLevelId, settings);
    const upcharge = upchargeFor(company, expectedPrice, declaredValue, selectedTier);
    const scoringFee = company === 'TAG' && card.scoring ? getScoringFee(company, true) : 0;
    const totalCost = baseFee + upcharge + scoringFee;
    const profit = expectedPrice - costBasis - totalCost;
    const multiplier = costBasis > 0 ? profit / costBasis : 0;

    return {
      company,
      serviceLevel: serviceLevelId,
      totalFees: baseFee + scoringFee,
      totalUpcharges: upcharge,
      totalCost,
      totalProfit: profit,
      averageMultiplier: multiplier,
    };
  });
}

// ───── Batch Company Comparison ─────

export function compareBatchCompanies(
  cards: GradingCard[],
  grade: GradeNumber,
  settings: AppSettings,
): CompanyComparisonResult[] {
  return (['PSA', 'TAG', 'Beckett', 'ARS', 'CGC'] as GradingCompany[]).map((company) => {
    const fees = COMPANY_FEES[company];
    const serviceLevelId = settings.defaultServiceLevel[company];
    const selectedTier = getSelectedTier(company, serviceLevelId, settings);

    let totalFees = 0;
    let totalUpcharges = 0;
    let totalCost = 0;
    let totalProfit = 0;
    let totalMultiplier = 0;
    let count = 0;

    for (const card of cards) {
      if (card.noGrading) continue;
      const expectedPrice = effectiveGradeValue(card, grade);
      if (expectedPrice === 0) continue;

      const costBasis = card.pricePaid || card.rawPrice || 0;
      const declaredValue = card.rawPrice || card.pricePaid || 0;
      const baseFee = getBaseFee(company, serviceLevelId, settings);
      const upcharge = upchargeFor(company, expectedPrice, declaredValue, selectedTier);
      const scoringFee = company === 'TAG' && card.scoring ? getScoringFee(company, true) : 0;
      const cost = baseFee + upcharge + scoringFee;
      const profit = expectedPrice - costBasis - cost;
      const multiplier = costBasis > 0 ? profit / costBasis : 0;

      totalFees += baseFee + scoringFee;
      totalUpcharges += upcharge;
      totalCost += cost;
      totalProfit += profit * card.quantity;
      totalMultiplier += multiplier;
      count++;
    }

    return {
      company,
      serviceLevel: serviceLevelId,
      totalFees,
      totalUpcharges,
      totalCost,
      totalProfit,
      averageMultiplier: count > 0 ? totalMultiplier / count : 0,
    };
  });
}
