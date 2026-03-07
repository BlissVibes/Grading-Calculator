import type { CardCalculation, GradingCard } from '../types';

interface Props {
  cards: GradingCard[];
  calculations: CardCalculation[];
}

function fmt(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
}

export default function SummaryBar({ cards, calculations }: Props) {
  const totalCards = cards.reduce((sum, c) => sum + c.quantity, 0);
  const totalPricePaid = cards.reduce((sum, c) => sum + c.pricePaid * c.quantity, 0);

  let totalFees = 0;
  let totalBestProfit = 0;
  let totalMultiplier = 0;
  let gradeCount = 0;

  for (const calc of calculations) {
    // Use the best grade result (last visible grade, typically grade 10)
    const best = calc.grades[calc.grades.length - 1];
    if (best) {
      totalFees += best.totalCost;
      totalBestProfit += best.profit;
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
        <span className="summary-stat__label">Total Grading Fees</span>
        <span className="summary-stat__value">{fmt(totalFees)}</span>
      </div>
      <div className={`summary-stat ${profitClass}`}>
        <span className="summary-stat__label">Best Grade Profit</span>
        <span className="summary-stat__value">{fmt(totalBestProfit)}</span>
      </div>
      <div className={`summary-stat ${avgMultiplier > 0 ? 'summary-stat--gain' : avgMultiplier < 0 ? 'summary-stat--loss' : ''}`}>
        <span className="summary-stat__label">Avg Multiplier</span>
        <span className="summary-stat__value">{avgMultiplier.toFixed(2)}x</span>
      </div>
    </div>
  );
}
