import { useState } from 'react';
import type { GradingCard, GradingCompany, GradeNumber, CardCalculation, AppSettings } from '../types';
import { GRADING_COMPANIES, COMPANY_LABELS, CARD_GAMES } from '../types';
import { COMPANY_FEES } from '../gradingData';
import { compareCompanies } from '../gradingCalculator';

interface Props {
  cards: GradingCard[];
  calculations: CardCalculation[];
  settings: AppSettings;
  onUpdateCard: (id: string, updates: Partial<GradingCard>) => void;
  onDeleteCard: (id: string) => void;
  onAddCard: () => void;
}

function fmt(n: number): string {
  if (n === 0) return '—';
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
}

function fmtMult(n: number): string {
  if (n === 0) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}x`;
}

export default function CardTable({ cards, calculations, settings, onUpdateCard, onDeleteCard, onAddCard }: Props) {
  const [search, setSearch] = useState('');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredCards = cards.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.cardName.toLowerCase().includes(q) ||
      c.set.toLowerCase().includes(q) ||
      c.cardNumber.toLowerCase().includes(q) ||
      c.cardGame.toLowerCase().includes(q)
    );
  });

  const calcMap = new Map(calculations.map((c) => [c.cardId, c]));

  const updateGradeValue = (id: string, card: GradingCard, grade: GradeNumber, value: number) => {
    onUpdateCard(id, {
      gradeValues: { ...card.gradeValues, [grade]: value },
    });
  };

  return (
    <div>
      <div className="table-controls">
        <input
          className="search-input"
          type="text"
          placeholder="Search cards..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="btn-add-card" onClick={onAddCard}>
          + Add Card
        </button>
      </div>

      <div className="table-wrapper">
        <table className="card-table">
          <thead>
            <tr>
              <th style={{ width: 30 }}></th>
              <th>Card Name</th>
              <th>Game</th>
              <th>Set</th>
              <th>#</th>
              <th className="th-right">Paid</th>
              <th className="th-right">Raw</th>
              {settings.visibleGrades.map((g) => (
                <th key={`price-${g}`} className="th-center grade-col">
                  <span className="grade-header">
                    Grade {g}
                    <span className="grade-header__sub">Price</span>
                  </span>
                </th>
              ))}
              {settings.visibleGrades.map((g) => (
                <th key={`profit-${g}`} className="th-center grade-col">
                  <span className="grade-header">
                    G{g} Profit
                    <span className="grade-header__sub">After Fees</span>
                  </span>
                </th>
              ))}
              {settings.visibleGrades.map((g) => (
                <th key={`mult-${g}`} className="th-center grade-col">
                  <span className="grade-header">
                    G{g} Multi
                    <span className="grade-header__sub">ROI</span>
                  </span>
                </th>
              ))}
              <th className="th-center">Company</th>
              <th className="th-center">Scoring</th>
              <th className="th-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredCards.length === 0 && (
              <tr>
                <td className="empty-row" colSpan={100}>
                  No cards yet. Import a CSV or add cards manually.
                </td>
              </tr>
            )}
            {filteredCards.map((card) => {
              const calc = calcMap.get(card.id);
              const gradeResults = calc ? new Map(calc.grades.map((g) => [g.grade, g])) : new Map();

              return (
                <CardRow
                  key={card.id}
                  card={card}
                  gradeResults={gradeResults}
                  settings={settings}
                  expanded={expandedRows.has(card.id)}
                  onToggleExpand={() => toggleExpand(card.id)}
                  onUpdate={(updates) => onUpdateCard(card.id, updates)}
                  onUpdateGrade={(grade, value) => updateGradeValue(card.id, card, grade, value)}
                  onDelete={() => onDeleteCard(card.id)}
                />
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="table-footer">
        {filteredCards.length} card{filteredCards.length !== 1 ? 's' : ''}
        {search && ` matching "${search}"`}
      </div>
    </div>
  );
}

// ───── Individual Card Row ─────

interface CardRowProps {
  card: GradingCard;
  gradeResults: Map<GradeNumber, { grade: GradeNumber; expectedPrice: number; gradingFee: number; upcharge: number; totalCost: number; profit: number; multiplier: number }>;
  settings: AppSettings;
  expanded: boolean;
  onToggleExpand: () => void;
  onUpdate: (updates: Partial<GradingCard>) => void;
  onUpdateGrade: (grade: GradeNumber, value: number) => void;
  onDelete: () => void;
}

function CardRow({ card, gradeResults, settings, expanded, onToggleExpand, onUpdate, onUpdateGrade, onDelete }: CardRowProps) {
  const effectiveCompany = card.noGrading ? null : (card.company ?? settings.defaultCompany);

  return (
    <>
      <tr style={card.noGrading ? { opacity: 0.5 } : undefined}>
        {/* Expand */}
        <td>
          {!card.noGrading && (
            <button className="expand-btn" onClick={onToggleExpand} title="Compare companies">
              {expanded ? '▼' : '▶'}
            </button>
          )}
        </td>

        {/* Card Name */}
        <td>
          <input
            className="cell-input cell-input--name"
            value={card.cardName}
            onChange={(e) => onUpdate({ cardName: e.target.value })}
            placeholder="Card name"
          />
        </td>

        {/* Game */}
        <td>
          <select
            className="cell-select"
            value={CARD_GAMES.includes(card.cardGame as typeof CARD_GAMES[number]) ? card.cardGame : '__custom'}
            onChange={(e) => {
              if (e.target.value === '__custom') {
                const custom = prompt('Enter card game name:');
                if (custom) onUpdate({ cardGame: custom });
              } else {
                onUpdate({ cardGame: e.target.value });
              }
            }}
          >
            {CARD_GAMES.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
            {!CARD_GAMES.includes(card.cardGame as typeof CARD_GAMES[number]) && (
              <option value={card.cardGame}>{card.cardGame}</option>
            )}
            <option value="__custom">Custom...</option>
          </select>
        </td>

        {/* Set */}
        <td>
          <input
            className="cell-input"
            value={card.set}
            onChange={(e) => onUpdate({ set: e.target.value })}
            placeholder="Set"
          />
        </td>

        {/* Card # */}
        <td>
          <input
            className="cell-input cell-input--narrow"
            value={card.cardNumber}
            onChange={(e) => onUpdate({ cardNumber: e.target.value })}
            placeholder="#"
          />
        </td>

        {/* Price Paid */}
        <td className="td-right">
          <input
            className="cell-input cell-input--number"
            type="number"
            step="0.01"
            min="0"
            value={card.pricePaid || ''}
            onChange={(e) => onUpdate({ pricePaid: parseFloat(e.target.value) || 0 })}
            placeholder="0.00"
          />
        </td>

        {/* Raw Price */}
        <td className="td-right">
          <input
            className="cell-input cell-input--number"
            type="number"
            step="0.01"
            min="0"
            value={card.rawPrice || ''}
            onChange={(e) => onUpdate({ rawPrice: parseFloat(e.target.value) || 0 })}
            placeholder="0.00"
          />
        </td>

        {/* Grade Price columns */}
        {settings.visibleGrades.map((g) => (
          <td key={`price-${g}`} className="td-center">
            <input
              className="cell-input cell-input--number"
              type="number"
              step="0.01"
              min="0"
              value={card.gradeValues[g] || ''}
              onChange={(e) => onUpdateGrade(g, parseFloat(e.target.value) || 0)}
              placeholder="0.00"
            />
          </td>
        ))}

        {/* Profit columns */}
        {settings.visibleGrades.map((g) => {
          if (card.noGrading) return <td key={`profit-${g}`} className="td-center profit-zero">—</td>;
          const result = gradeResults.get(g);
          const profit = result?.profit ?? 0;
          const cls = profit > 0 ? 'profit-positive' : profit < 0 ? 'profit-negative' : 'profit-zero';
          return (
            <td key={`profit-${g}`} className={`td-center ${cls}`}>
              {fmt(profit)}
            </td>
          );
        })}

        {/* Multiplier columns */}
        {settings.visibleGrades.map((g) => {
          if (card.noGrading) return <td key={`mult-${g}`} className="td-center"><span className="multiplier multiplier--neutral">—</span></td>;
          const result = gradeResults.get(g);
          const mult = result?.multiplier ?? 0;
          const cls = mult > 0 ? 'multiplier--positive' : mult < 0 ? 'multiplier--negative' : 'multiplier--neutral';
          return (
            <td key={`mult-${g}`} className="td-center">
              <span className={`multiplier ${cls}`}>{fmtMult(mult)}</span>
            </td>
          );
        })}

        {/* Company per-card */}
        <td className="td-center">
          <select
            className="company-cell-select"
            value={card.noGrading ? '__none' : (card.company ?? '')}
            onChange={(e) => {
              if (e.target.value === '__none') {
                onUpdate({ noGrading: true, company: null, serviceLevel: null });
              } else {
                onUpdate({ noGrading: false, company: (e.target.value || null) as GradingCompany | null });
              }
            }}
          >
            <option value="">Default{settings.defaultCompany ? ` (${settings.defaultCompany})` : ''}</option>
            {GRADING_COMPANIES.map((c) => (
              <option key={c} value={c}>{COMPANY_LABELS[c]}</option>
            ))}
            <option value="__none">No Grading</option>
          </select>
          {effectiveCompany && !card.noGrading && (
            <select
              className="company-cell-select"
              value={card.serviceLevel ?? ''}
              onChange={(e) => onUpdate({ serviceLevel: e.target.value || null })}
              style={{ marginTop: 2, display: 'block' }}
            >
              <option value="">Default</option>
              {COMPANY_FEES[effectiveCompany].serviceLevels.map((sl) => (
                <option key={sl.id} value={sl.id}>{sl.name}</option>
              ))}
            </select>
          )}
        </td>

        {/* Scoring (TAG) */}
        <td className="td-center">
          {(effectiveCompany === 'TAG') ? (
            <input
              type="checkbox"
              className="scoring-check"
              checked={card.scoring}
              onChange={(e) => onUpdate({ scoring: e.target.checked })}
              title="Add scoring/subgrades (+$5)"
            />
          ) : (
            <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>—</span>
          )}
        </td>

        {/* Actions */}
        <td className="td-center row-actions">
          <button
            className="row-action-btn row-action-btn--delete"
            onClick={onDelete}
            title="Delete card"
          >
            ✕
          </button>
        </td>
      </tr>

      {/* Inline comparison */}
      {expanded && !card.noGrading && (
        <InlineComparison card={card} settings={settings} />
      )}
    </>
  );
}

// ───── Inline Company Comparison ─────

function InlineComparison({ card, settings }: { card: GradingCard; settings: AppSettings }) {
  const [selectedGrade, setSelectedGrade] = useState<GradeNumber>(
    settings.visibleGrades[settings.visibleGrades.length - 1] ?? 10
  );

  const comparisons = compareCompanies(card, selectedGrade, settings);
  const bestProfit = Math.max(...comparisons.map((c) => c.totalProfit));

  const colSpan = 7 + settings.visibleGrades.length * 3 + 3;

  return (
    <tr className="inline-comparison">
      <td colSpan={colSpan}>
        <div className="inline-comparison__inner">
          <div className="comparison-grade-tabs" style={{ marginBottom: 10 }}>
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

          <div className="inline-comparison__grid">
            {comparisons.map((comp) => {
              const isBest = comp.totalProfit === bestProfit && bestProfit > 0;
              return (
                <div
                  key={comp.company}
                  className={`inline-comp-card ${isBest ? 'inline-comp-card--best' : ''}`}
                >
                  <div className="inline-comp-card__company">{COMPANY_LABELS[comp.company]}</div>
                  <div className="inline-comp-card__row">
                    <span className="inline-comp-card__label">Base Fee</span>
                    <span className="inline-comp-card__value">{fmt(comp.totalFees)}</span>
                  </div>
                  <div className="inline-comp-card__row">
                    <span className="inline-comp-card__label">Upcharge</span>
                    <span className="inline-comp-card__value">{fmt(comp.totalUpcharges)}</span>
                  </div>
                  <div className="inline-comp-card__row">
                    <span className="inline-comp-card__label">Total Cost</span>
                    <span className="inline-comp-card__value">{fmt(comp.totalCost)}</span>
                  </div>
                  <div className="inline-comp-card__row" style={{ marginTop: 4, paddingTop: 4, borderTop: '1px solid var(--border)' }}>
                    <span className="inline-comp-card__label">Profit</span>
                    <span className={`inline-comp-card__value ${comp.totalProfit > 0 ? 'profit-positive' : comp.totalProfit < 0 ? 'profit-negative' : ''}`}>
                      {fmt(comp.totalProfit)}
                    </span>
                  </div>
                  <div className="inline-comp-card__row">
                    <span className="inline-comp-card__label">Multiplier</span>
                    <span className={`inline-comp-card__value ${comp.averageMultiplier > 0 ? 'profit-positive' : comp.averageMultiplier < 0 ? 'profit-negative' : ''}`}>
                      {fmtMult(comp.averageMultiplier)}
                    </span>
                  </div>
                  {isBest && <div style={{ textAlign: 'center', marginTop: 6, color: 'var(--gain)', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase' }}>Best Value</div>}
                </div>
              );
            })}
          </div>
        </div>
      </td>
    </tr>
  );
}
