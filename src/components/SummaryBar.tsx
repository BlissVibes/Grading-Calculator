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

  const totalCards = included.reduce((sum, c) => sum + c.quantity, 0);
  const totalPricePaid = included.reduce((sum, c) => sum + c.pricePaid * c.quantity, 0);

  // Submission fees = what you pay upfront at your selected tiers (base grading
  // fee + add-ons). Upcharges = the conditional extra PSA bills only if a card
  // grades high enough to exceed its tier's value cap. Kept separate so it's
  // clear that submitting at a higher tier trades upfront fee for $0 upcharge.
  let totalSubmission = 0;
  let totalUpcharges = 0;
  let totalBestProfit = 0;
  let totalMultiplier = 0;
  let gradeCount = 0;

  for (const calc of calculations) {
    if (!includedIds.has(calc.cardId)) continue;
    const qty = qtyById.get(calc.cardId) ?? 1;
    // Use the best grade result (last visible grade, typically grade 10)
    const best = calc.grades[calc.grades.length - 1];
    if (best) {
      totalSubmission += (best.totalCost - best.upcharge) * qty;
      totalUpcharges += best.upcharge * qty;
      totalBestProfit += best.profit * qty;
      if (best.multiplier !== 0) {
        totalMultiplier += best.multiplier;
        gradeCount++;
      }
    }
  }

  const avgMultiplier = gradeCount > 0 ? totalMultiplier / gradeCount : 0;
  const profitClass = totalBestProfit > 0 ? 'summary-stat--gain' : totalBestProfit < 0 ? 'summary-stat--loss' : '';

  return (
    <div className="summary-bar">
      <div className="summary-stat">
        <span className="summary-stat__label">Total Cards</span>
        <span className="summary-stat__value">{totalCards}</span>
      </div>
      <div className="summary-stat">
        <span className="summary-stat__label">Total Invested</span>
        <span className="summary-stat__value">{fmt(totalPricePaid)}</span>
      </div>
      <div className="summary-stat">
        <span className="summary-stat__label">Submission Fees</span>
        <span className="summary-stat__value">{fmt(totalSubmission)}</span>
        <span className="summary-stat__note">at selected tiers</span>
      </div>
      <div className="summary-stat">
        <span className="summary-stat__label">Est. Upcharges</span>
        <span className="summary-stat__value">{fmt(totalUpcharges)}</span>
        <span className="summary-stat__note">if top grade · $0 if tier covers value</span>
      </div>
      <div className={`summary-stat ${profitClass}`}>
        <span className="summary-stat__label">Best Grade Profit</span>
        <span className="summary-stat__value">{fmt(totalBestProfit)}</span>
        <span className="summary-stat__note">after grading fees</span>
      </div>
      <div className={`summary-stat ${avgMultiplier > 0 ? 'summary-stat--gain' : avgMultiplier < 0 ? 'summary-stat--loss' : ''}`}>
        <span className="summary-stat__label">Avg Multiplier</span>
        <span className="summary-stat__value">{avgMultiplier.toFixed(2)}x</span>
      </div>
    </div>
  );
}
