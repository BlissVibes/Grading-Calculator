import { useState } from 'react';
import type { GradingCard, CardCalculation, AppSettings, Submission, GradingCompany } from '../types';
import { COMPANY_LABELS } from '../types';
import { COMPANY_FEES } from '../gradingData';

interface Props {
  submissions: Submission[];
  activeId: string;                // a submission id, or 'all'
  cards: GradingCard[];            // ALL cards (across submissions)
  calculations: CardCalculation[];
  settings: AppSettings;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}

const ALL = 'all';

function fmt(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 });
}

export default function SubmissionsPanel({
  submissions, activeId, cards, calculations, settings, onSelect, onCreate, onRename, onDelete,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');

  const startEdit = (sub: Submission) => { setEditingId(sub.id); setDraftName(sub.name); };
  const commitEdit = (id: string) => {
    const name = draftName.trim();
    if (name) onRename(id, name);
    setEditingId(null);
  };

  const calcById = new Map(calculations.map((c) => [c.cardId, c]));

  // Best-grade profit for the cards matching a predicate (counted cards only).
  const profitFor = (pred: (c: GradingCard) => boolean): number => {
    let p = 0;
    for (const card of cards) {
      if (!pred(card) || !card.includeInTotal) continue;
      const calc = calcById.get(card.id);
      const best = calc?.grades[calc.grades.length - 1];
      if (best) p += best.profit * card.quantity;
    }
    return p;
  };

  const countFor = (pred: (c: GradingCard) => boolean): number =>
    cards.reduce((n, c) => (pred(c) ? n + c.quantity : n), 0);

  const allProfit = profitFor(() => true);

  // ── Minimum-qualification status for the active submission ──
  const activeCards = activeId === ALL ? cards : cards.filter((c) => c.submissionId === activeId);
  const minGroups = new Map<string, { company: GradingCompany; tierName: string; minCards: number; count: number }>();
  for (const card of activeCards) {
    if (card.noGrading) continue;
    const company = (card.company ?? settings.defaultCompany) as GradingCompany | null;
    if (!company) continue;
    const tierId = card.serviceLevel ?? settings.defaultServiceLevel[company];
    const tier = COMPANY_FEES[company].serviceLevels.find((t) => t.id === tierId);
    if (!tier?.minCards) continue;   // only tiers that actually have a minimum
    const key = `${company}|${tierId}`;
    const g = minGroups.get(key) ?? { company, tierName: tier.name, minCards: tier.minCards, count: 0 };
    g.count += card.quantity;
    minGroups.set(key, g);
  }
  const minStatuses = [...minGroups.values()];

  return (
    <div className="submissions-panel">
      <div className="submissions-panel__title">Grading Submissions:</div>

      <div className="submissions-list">
        {submissions.map((sub) => {
          const profit = profitFor((c) => c.submissionId === sub.id);
          const count = countFor((c) => c.submissionId === sub.id);
          const active = activeId === sub.id;
          const editing = editingId === sub.id;
          return (
            <div key={sub.id} className={`submission-btn${active ? ' submission-btn--active' : ''}`}>
              {editing ? (
                <div className="submission-edit">
                  <input
                    className="submission-edit__input"
                    value={draftName}
                    autoFocus
                    onChange={(e) => setDraftName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitEdit(sub.id);
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                  />
                  <button className="submission-edit__btn submission-edit__btn--save" onClick={() => commitEdit(sub.id)} title="Save name">Save</button>
                  <button className="submission-edit__btn" onClick={() => setEditingId(null)} title="Cancel">Cancel</button>
                  {submissions.length > 1 && (
                    <button
                      className="submission-edit__btn submission-edit__btn--delete"
                      onClick={() => {
                        if (confirm(`Delete "${sub.name}"? Its cards move to another submission.`)) {
                          onDelete(sub.id);
                          setEditingId(null);
                        }
                      }}
                      title="Delete this whole batch"
                    >
                      Delete batch
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <button className="submission-btn__main" onClick={() => onSelect(sub.id)} title="View this submission">
                    <span className="submission-btn__name">{sub.name}</span>
                    <span className="submission-btn__meta">
                      {count} card{count !== 1 ? 's' : ''} · <span className={profit >= 0 ? 'gain' : 'loss'}>{fmt(profit)}</span>
                    </span>
                  </button>
                  <button
                    className="submission-btn__edit"
                    onClick={(e) => { e.stopPropagation(); startEdit(sub); }}
                    title="Rename or delete this submission"
                    aria-label="Edit submission"
                  >
                    ✎
                  </button>
                </>
              )}
            </div>
          );
        })}

        <button
          className={`submission-btn submission-btn--all${activeId === ALL ? ' submission-btn--active' : ''}`}
          onClick={() => onSelect(ALL)}
        >
          <span className="submission-btn__name">All Submissions</span>
          <span className="submission-btn__meta">
            {countFor(() => true)} cards · <span className={allProfit >= 0 ? 'gain' : 'loss'}>{fmt(allProfit)}</span>
          </span>
        </button>

        <button className="submission-btn submission-btn--new" onClick={onCreate}>
          + New Submission
        </button>
      </div>

      {minStatuses.length > 0 && (
        <div className="submission-minimums">
          <div className="submission-minimums__title">Tier minimums {activeId === ALL ? '(all)' : ''}</div>
          {minStatuses.map((s) => {
            const ok = s.count >= s.minCards;
            return (
              <div key={`${s.company}-${s.tierName}`} className={`submission-min${ok ? ' submission-min--ok' : ''}`}>
                {COMPANY_LABELS[s.company]} {s.tierName}: {s.count}/{s.minCards}{' '}
                {ok ? '✓ qualifies' : `· ${s.minCards - s.count} more needed`}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
