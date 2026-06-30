import { useState } from 'react';
import type { GradingCard, CardCalculation, AppSettings, Submission, GradingCompany } from '../types';
import { COMPANY_LABELS, GRADING_COMPANIES } from '../types';
import { COMPANY_FEES } from '../gradingData';

interface Props {
  submissions: Submission[];
  activeId: string;                // a submission id, or 'all'
  cards: GradingCard[];            // ALL cards (across submissions)
  calculations: CardCalculation[];
  settings: AppSettings;
  onSelect: (id: string) => void;
  onCreate: (name: string, defaultCompany: GradingCompany | null) => void;
  onUpdate: (id: string, patch: Partial<Submission>) => void;
  onDelete: (id: string) => void;
  onCopy: (id: string, newName: string) => void;   // duplicate a submission + its cards
}

const ALL = 'all';

function fmt(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 });
}

// Small reusable grading-company dropdown
function CompanySelect({ value, onChange }: { value: GradingCompany | null; onChange: (c: GradingCompany | null) => void }) {
  return (
    <select
      className="submission-edit__company"
      value={value ?? ''}
      onChange={(e) => onChange((e.target.value || null) as GradingCompany | null)}
      title="Default grading company for cards added to this submission"
    >
      <option value="">No default</option>
      {GRADING_COMPANIES.map((c) => (
        <option key={c} value={c}>{COMPANY_LABELS[c]}</option>
      ))}
    </select>
  );
}

export default function SubmissionsPanel({
  submissions, activeId, cards, calculations, settings, onSelect, onCreate, onUpdate, onDelete, onCopy,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftCompany, setDraftCompany] = useState<GradingCompany | null>('PSA');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCompany, setNewCompany] = useState<GradingCompany | null>('PSA');

  const startEdit = (sub: Submission) => { setEditingId(sub.id); setDraftName(sub.name); setDraftCompany(sub.defaultCompany); };
  const commitEdit = (id: string) => {
    const name = draftName.trim();
    onUpdate(id, { ...(name ? { name } : {}), defaultCompany: draftCompany });
    setEditingId(null);
  };

  const startCreate = () => {
    setCreating(true);
    setNewName(`Submission #${submissions.length + 1}`);
    setNewCompany(settings.defaultCompany ?? 'PSA');
  };
  const commitCreate = () => {
    onCreate(newName, newCompany);
    setCreating(false);
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
                  <CompanySelect value={draftCompany} onChange={setDraftCompany} />
                  <button className="submission-edit__btn submission-edit__btn--save" onClick={() => commitEdit(sub.id)} title="Save changes">Save</button>
                  <button
                    className="submission-edit__btn submission-edit__btn--copy"
                    onClick={() => {
                      const name = draftName.trim() && draftName.trim() !== sub.name ? draftName.trim() : `${sub.name} (copy)`;
                      onCopy(sub.id, name);
                      setEditingId(null);
                    }}
                    title="Create a new submission with a copy of these cards"
                  >
                    Copy to new
                  </button>
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
                      {sub.defaultCompany ? `${COMPANY_LABELS[sub.defaultCompany]} · ` : ''}{count} card{count !== 1 ? 's' : ''} · <span className={profit >= 0 ? 'gain' : 'loss'}>{fmt(profit)}</span>
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

        {creating ? (
          <div className="submission-edit submission-edit--new">
            <input
              className="submission-edit__input"
              value={newName}
              autoFocus
              placeholder="Submission name"
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitCreate();
                if (e.key === 'Escape') setCreating(false);
              }}
            />
            <CompanySelect value={newCompany} onChange={setNewCompany} />
            <button className="submission-edit__btn submission-edit__btn--save" onClick={commitCreate} title="Create submission">Create</button>
            <button className="submission-edit__btn" onClick={() => setCreating(false)} title="Cancel">Cancel</button>
          </div>
        ) : (
          <button className="submission-btn submission-btn--new" onClick={startCreate}>
            + New Submission
          </button>
        )}
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
