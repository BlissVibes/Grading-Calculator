import { useState } from 'react';
import type { GradingCard, GradeNumber, AppSettings } from '../types';
import { COMPANY_LABELS } from '../types';
import { compareBatchCompanies } from '../gradingCalculator';

interface Props {
  cards: GradingCard[];
  settings: AppSettings;
}

function fmt(n: number): string {
  if (n === 0) return '—';
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
}

export default function CompanyComparison({ cards, settings }: Props) {
  const [selectedGrade, setSelectedGrade] = useState<GradeNumber>(
    settings.visibleGrades[settings.visibleGrades.length - 1] ?? 10
  );

  if (cards.length === 0) return null;

  const comparisons = compareBatchCompanies(cards, selectedGrade, settings);
  const bestProfit = Math.max(...comparisons.map((c) => c.totalProfit));
  const lowestCost = Math.min(...comparisons.map((c) => c.totalCost));

  return (
    <div className="comparison-section">
      <div className="comparison-section__title">Company Comparison — All Cards</div>

      <div className="comparison-grade-tabs">
        {settings.visibleGrades.map((g) => (
          <button
            key={g}
            className={`comparison-grade-tab ${selectedGrade === g ? 'comparison-grade-tab--active' : ''}`}
            onClick={() => setSelectedGrade(g)}
          >
            Grade {g}
          </button>
        ))}
      </div>

      <div className="comparison-grid">
        {comparisons.map((comp) => {
          const isBestProfit = comp.totalProfit === bestProfit && bestProfit > 0;
          const isLowestCost = comp.totalCost === lowestCost;

          return (
            <div
              key={comp.company}
              className={`comparison-card comparison-card--${comp.company.toLowerCase()} ${isBestProfit ? 'comparison-card--best' : ''}`}
            >
              <div className="comparison-card__company">
                {COMPANY_LABELS[comp.company]}
              </div>

              {isBestProfit && (
                <span className="comparison-card__best-badge">Best Profit</span>
              )}
              {isLowestCost && !isBestProfit && (
                <span className="comparison-card__best-badge" style={{ background: 'var(--accent)' }}>
                  Lowest Cost
                </span>
              )}

              <div className="comparison-card__rows">
                <div className="comparison-card__row">
                  <span className="comparison-card__row-label">Service Level</span>
                  <span className="comparison-card__row-value" style={{ textTransform: 'capitalize' }}>
                    {comp.serviceLevel}
                  </span>
                </div>
                <div className="comparison-card__row">
                  <span className="comparison-card__row-label">Total Fees</span>
                  <span className="comparison-card__row-value">{fmt(comp.totalFees)}</span>
                </div>
                <div className="comparison-card__row">
                  <span className="comparison-card__row-label">Total Upcharges</span>
                  <span className="comparison-card__row-value">{fmt(comp.totalUpcharges)}</span>
                </div>
                <div className="comparison-card__row">
                  <span className="comparison-card__row-label">Total Cost</span>
                  <span className="comparison-card__row-value">{fmt(comp.totalCost)}</span>
                </div>
                <div className="comparison-card__row">
                  <span className="comparison-card__row-label">Avg Multiplier</span>
                  <span className={`comparison-card__row-value ${comp.averageMultiplier > 0 ? 'profit-positive' : comp.averageMultiplier < 0 ? 'profit-negative' : ''}`}>
                    {comp.averageMultiplier === 0 ? '—' : `${comp.averageMultiplier >= 0 ? '+' : ''}${comp.averageMultiplier.toFixed(2)}x`}
                  </span>
                </div>
              </div>

              <div className="comparison-card__profit">
                <span>Net Profit</span>
                <span className={comp.totalProfit > 0 ? 'profit-positive' : comp.totalProfit < 0 ? 'profit-negative' : ''}>
                  {fmt(comp.totalProfit)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
