import type {
  GradingCard,
  GradingCompany,
  GradeNumber,
  GradeResult,
  CardCalculation,
  CompanyComparisonResult,
  AppSettings,
} from './types';
import { COMPANY_FEES } from './gradingData';

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

function getBaseFee(company: GradingCompany, serviceLevelId: string): number {
  const fees = COMPANY_FEES[company];
  const level = fees.serviceLevels.find((l) => l.id === serviceLevelId);
  return level?.baseFee ?? fees.serviceLevels[0].baseFee;
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

  const grades: GradeResult[] = [];

  for (const grade of settings.visibleGrades) {
    const expectedPrice = card.gradeValues[grade] ?? 0;
    const baseFee = getBaseFee(company, serviceLevelId);
    const upcharge = getUpcharge(company, expectedPrice);
    const scoringFee = getScoringFee(company, card.scoring);
    const totalCost = baseFee + upcharge + scoringFee;
    const profit = expectedPrice - card.pricePaid - totalCost;
    const multiplier = card.pricePaid > 0 ? profit / card.pricePaid : 0;

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

// ───── Company Comparison ─────

export function compareCompanies(
  card: GradingCard,
  grade: GradeNumber,
  settings: AppSettings,
): CompanyComparisonResult[] {
  const expectedPrice = card.gradeValues[grade] ?? 0;

  return (['PSA', 'TAG', 'Beckett', 'ARS', 'CGC'] as GradingCompany[]).map((company) => {
    const fees = COMPANY_FEES[company];
    const serviceLevelId = settings.defaultServiceLevel[company];
    const baseFee = getBaseFee(company, serviceLevelId);
    const upcharge = getUpcharge(company, expectedPrice);
    const scoringFee = company === 'TAG' && card.scoring ? getScoringFee(company, true) : 0;
    const totalCost = baseFee + upcharge + scoringFee;
    const profit = expectedPrice - card.pricePaid - totalCost;
    const multiplier = card.pricePaid > 0 ? profit / card.pricePaid : 0;

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

    let totalFees = 0;
    let totalUpcharges = 0;
    let totalCost = 0;
    let totalProfit = 0;
    let totalMultiplier = 0;
    let count = 0;

    for (const card of cards) {
      if (card.noGrading) continue;
      const expectedPrice = card.gradeValues[grade] ?? 0;
      if (expectedPrice === 0) continue;

      const baseFee = getBaseFee(company, serviceLevelId);
      const upcharge = getUpcharge(company, expectedPrice);
      const scoringFee = company === 'TAG' && card.scoring ? getScoringFee(company, true) : 0;
      const cost = baseFee + upcharge + scoringFee;
      const profit = expectedPrice - card.pricePaid - cost;
      const multiplier = card.pricePaid > 0 ? profit / card.pricePaid : 0;

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
