import type { CardCalculation, GradingCard } from '../types';

interface Props {
  cards: GradingCard[];
  calculations: CardCalculation[];
}

function fmt(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
}

export default function SummaryBar({ cards, calculations }: Props) {
  // Only cards flagged to count toward totals
  const included = cards.filter((c) => c.includeInTotal);
  const includedIds = new Set(included.map((c) => c.id));
  const qtyById = new Map(cards.map((c) => [c.id, c.quantity]));
  const cardById = new Map(cards.map((c) => [c.id, c]));

  const totalCards = included.reduce((sum, c) => sum + c.quantity, 0);
  const totalPricePaid = included.reduce((sum, c) => sum + c.pricePaid * c.quantity, 0);

  // Submission = upfront fees at the selected tiers (base + add-ons).
  // Expected upcharge = the value-based upcharge owed when each card grades to
  // its expected grade (the target grade if set, else the top grade).
  // Current upcharge = owed now based on each card's present (raw) value, shown
  // as muted context.
  // The headline grading cost is submission + the expected-grade upcharge: the
  // total you'd owe if the cards hit the grade you're valuing them at.
  let totalSubmission = 0;
  let totalCurrentUpcharge = 0;
  let totalPotentialUpcharge = 0;
  let totalBestProfit = 0;
  let totalMultiplier = 0;
  let gradeCount = 0;

  for (const calc of calculations) {
    if (!includedIds.has(calc.cardId)) continue;
    const qty = qtyById.get(calc.cardId) ?? 1;
    // Value each card at its target grade if set, else the top (last) grade.
    const targetGrade = cardById.get(calc.cardId)?.targetGrade;
    const best = (targetGrade != null && calc.grades.find((g) => g.grade === targetGrade))
      || calc.grades[calc.grades.length - 1];
    if (best) {
      totalSubmission += (best.totalCost - best.upcharge) * qty;
      totalCurrentUpcharge += calc.currentUpcharge * qty;
      totalPotentialUpcharge += best.upcharge * qty;
      totalBestProfit += best.profit * qty;
      if (best.multiplier !== 0) {
        totalMultiplier += best.multiplier;
        gradeCount++;
      }
    }
  }

  // Headline grading cost = submission fees + the upcharge owed at the expected
  // grade (target grade if set, else top grade).
  const totalGradingCharges = totalSubmission + totalPotentialUpcharge;
  const avgMultiplier = gradeCount > 0 ? totalMultiplier / gradeCount : 0;
  const profitClass = totalBestProfit > 0 ? 'summary-stat--gain' : totalBestProfit < 0 ? 'summary-stat--loss' : '';

  return (
    <div className="summary-bar">
      <div className="summary-stat summary-stat--compact">
        <span className="summary-stat__label">Total Cards</span>
        <span className="summary-stat__value">{totalCards}</span>
      </div>
      <div className="summary-stat summary-stat--invested">
        <span className="summary-stat__label">Total Invested</span>
        <span className="summary-stat__value">{fmt(totalPricePaid)}</span>
      </div>
      <div className="summary-stat">
        <span className="summary-stat__label">Submission Fees</span>
        <span className="summary-stat__value">{fmt(totalSubmission)}</span>
      </div>
      <div className="summary-stat">
        <span className="summary-stat__label">Upcharges</span>
        <span className="summary-stat__value">{fmt(totalPotentialUpcharge)}</span>
        {totalCurrentUpcharge !== totalPotentialUpcharge && (
          <span className="summary-stat__note">{fmt(totalCurrentUpcharge)} at current value</span>
        )}
      </div>
      <div className="summary-stat summary-stat--cost">
        <span className="summary-stat__label">Total Grading Charges</span>
        <span className="summary-stat__value">{fmt(totalGradingCharges)}</span>
      </div>
      <div className={`summary-stat summary-stat--profit ${profitClass}`}>
        <span className="summary-stat__label">Best Grade Profit</span>
        <span className="summary-stat__value">{fmt(totalBestProfit)}</span>
      </div>
      <div className={`summary-stat summary-stat--compact ${avgMultiplier > 0 ? 'summary-stat--gain' : avgMultiplier < 0 ? 'summary-stat--loss' : ''}`}>
        <span className="summary-stat__label">Avg Multiplier</span>
        <span className="summary-stat__value">{avgMultiplier.toFixed(2)}x</span>
      </div>
    </div>
  );
}
