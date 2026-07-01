import type { CardCalculation, GradingCard } from '../types';

interface Props {
  cards: GradingCard[];
  calculations: CardCalculation[];
  deductRawFromProfit: boolean;
  onToggleDeductRaw: (next: boolean) => void;
}

function fmt(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
}

export default function SummaryBar({ cards, calculations, deductRawFromProfit, onToggleDeductRaw }: Props) {
  // Only cards flagged to count toward totals
  const included = cards.filter((c) => c.includeInTotal);
  const includedIds = new Set(included.map((c) => c.id));
  const qtyById = new Map(cards.map((c) => [c.id, c.quantity]));
  const cardById = new Map(cards.map((c) => [c.id, c]));

  const totalCards = included.reduce((sum, c) => sum + c.quantity, 0);
  const totalPricePaid = included.reduce((sum, c) => sum + c.pricePaid * c.quantity, 0);

  // Submission = upfront fees at the selected tiers (base + add-ons).
  // Expected upcharge = the value-based upcharge owed when each card grades to
  // its expected grade (the target grade if set, else the top grade). Upcharges
  // are always assessed on the graded value, never the raw value.
  // The headline grading cost is submission + the expected-grade upcharge: the
  // total you'd owe if the cards hit the grade you're valuing them at.
  let totalSubmission = 0;
  let totalPotentialUpcharge = 0;
  let totalBestProfit = 0;
  let totalRawCost = 0;
  let totalMultiplier = 0;
  let gradeCount = 0;

  for (const calc of calculations) {
    if (!includedIds.has(calc.cardId)) continue;
    const qty = qtyById.get(calc.cardId) ?? 1;
    const card = cardById.get(calc.cardId);
    // Value each card at its target grade if set, else the top (last) grade.
    const targetGrade = card?.targetGrade;
    const best = (targetGrade != null && calc.grades.find((g) => g.grade === targetGrade))
      || calc.grades[calc.grades.length - 1];
    if (best) {
      // Raw card cost is the cost basis the profit subtracts (what you paid,
      // falling back to the raw market value).
      const rawCost = card ? (card.pricePaid || card.rawPrice || 0) : 0;
      totalRawCost += rawCost * qty;
      totalSubmission += (best.totalCost - best.upcharge) * qty;
      totalPotentialUpcharge += best.upcharge * qty;
      // best.profit already nets out the raw card cost; add it back when the
      // user chooses not to deduct it.
      totalBestProfit += (best.profit + (deductRawFromProfit ? 0 : rawCost)) * qty;
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
      <div className="summary-stat summary-stat--rawcost">
        <span className="summary-stat__label">Raw Card Cost</span>
        <span className="summary-stat__value">{fmt(totalRawCost)}</span>
        <label className="summary-stat__check" title="Subtract the raw card cost from Best Grade Profit">
          <input
            type="checkbox"
            checked={deductRawFromProfit}
            onChange={(e) => onToggleDeductRaw(e.target.checked)}
          />
          <span>Remove from profit</span>
        </label>
      </div>
      <div className="summary-stat">
        <span className="summary-stat__label">Submission Fees</span>
        <span className="summary-stat__value">{fmt(totalSubmission)}</span>
      </div>
      <div className="summary-stat">
        <span className="summary-stat__label">Upcharges</span>
        <span className="summary-stat__value">{fmt(totalPotentialUpcharge)}</span>
        <span className="summary-stat__sublabel">at expected grade</span>
      </div>
      <div className="summary-stat summary-stat--cost">
        <span className="summary-stat__label">Total Grading Charges</span>
        <span className="summary-stat__value">{fmt(totalGradingCharges)}</span>
      </div>
      <div className={`summary-stat summary-stat--profit ${profitClass}`}>
        <span className="summary-stat__label">Best Grade Profit</span>
        <span className="summary-stat__value">{fmt(totalBestProfit)}</span>
        {!deductRawFromProfit && (
          <span className="summary-stat__sublabel">excludes raw cost</span>
        )}
      </div>
      <div className={`summary-stat summary-stat--compact ${avgMultiplier > 0 ? 'summary-stat--gain' : avgMultiplier < 0 ? 'summary-stat--loss' : ''}`}>
        <span className="summary-stat__label">Avg Multiplier</span>
        <span className="summary-stat__value">{avgMultiplier.toFixed(2)}x</span>
      </div>
    </div>
  );
}
