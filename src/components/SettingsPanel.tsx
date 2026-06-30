import { useState } from 'react';
import type { AppSettings, GradeNumber, GradingCompany, PromoCode } from '../types';
import { ALL_GRADES, GRADING_COMPANIES, COMPANY_LABELS } from '../types';
import { COMPANY_FEES } from '../gradingData';

interface Props {
  settings: AppSettings;
  onUpdate: (settings: AppSettings) => void;
  onOpenChangelog: () => void;
}

export default function SettingsPanel({ settings, onUpdate, onOpenChangelog }: Props) {
  const [open, setOpen] = useState(false);
  const [feeEditCompany, setFeeEditCompany] = useState<GradingCompany | null>(null);

  const promoCodes = settings.promoCodes ?? [];
  const addPromoCode = () => {
    const code: PromoCode = { id: crypto.randomUUID(), code: '', company: 'PSG', serviceLevel: null, type: 'percent', value: 0, enabled: true };
    onUpdate({ ...settings, promoCodes: [...promoCodes, code] });
  };
  const updatePromoCode = (id: string, patch: Partial<PromoCode>) => {
    onUpdate({ ...settings, promoCodes: promoCodes.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
  };
  const removePromoCode = (id: string) => {
    onUpdate({ ...settings, promoCodes: promoCodes.filter((p) => p.id !== id) });
  };

  const toggleGrade = (grade: GradeNumber) => {
    const current = settings.visibleGrades;
    const next = current.includes(grade)
      ? current.filter((g) => g !== grade)
      : [...current, grade].sort((a, b) => a - b);
    if (next.length > 0) {
      onUpdate({ ...settings, visibleGrades: next });
    }
  };

  const setPreset = (preset: 'minimal' | 'standard' | 'all') => {
    let grades: GradeNumber[];
    if (preset === 'minimal') grades = [9, 10];
    else if (preset === 'standard') grades = [7, 8, 9, 9.5, 10];
    else grades = [...ALL_GRADES];
    onUpdate({ ...settings, visibleGrades: grades });
  };

  return (
    <div className="settings-wrap">
      <button
        className={`settings-cog ${open ? 'settings-cog--open' : ''}`}
        onClick={() => setOpen(!open)}
        title="Settings"
      >
        ⚙
      </button>

      {open && (
        <div className="settings-panel">
          <div className="settings-panel__title">Settings</div>

          {/* Dark Mode */}
          <div className="settings-item" onClick={() => onUpdate({ ...settings, darkMode: !settings.darkMode })}>
            <span className="settings-item__label">Dark Mode</span>
            <div className={`settings-toggle ${settings.darkMode ? 'settings-toggle--on' : ''}`}>
              <div className="settings-toggle__thumb" />
            </div>
          </div>

          {/* Grade Visibility */}
          <div className="settings-section-title">Visible Grades</div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
            <button
              className={`comparison-grade-tab ${settings.visibleGrades.length === 2 ? 'comparison-grade-tab--active' : ''}`}
              onClick={() => setPreset('minimal')}
              style={{ fontSize: '0.72rem', padding: '3px 8px' }}
            >
              9 & 10
            </button>
            <button
              className={`comparison-grade-tab ${settings.visibleGrades.length === 5 ? 'comparison-grade-tab--active' : ''}`}
              onClick={() => setPreset('standard')}
              style={{ fontSize: '0.72rem', padding: '3px 8px' }}
            >
              7–10
            </button>
            <button
              className={`comparison-grade-tab ${settings.visibleGrades.length === ALL_GRADES.length ? 'comparison-grade-tab--active' : ''}`}
              onClick={() => setPreset('all')}
              style={{ fontSize: '0.72rem', padding: '3px 8px' }}
            >
              All (1–10)
            </button>
          </div>
          <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
            {ALL_GRADES.map((g) => (
              <button
                key={g}
                className={`comparison-grade-tab ${settings.visibleGrades.includes(g) ? 'comparison-grade-tab--active' : ''}`}
                onClick={() => toggleGrade(g)}
                style={{ fontSize: '0.72rem', padding: '3px 6px', minWidth: 32 }}
              >
                {g}
              </button>
            ))}
          </div>

          {/* Half Grades Toggle — hidden: it didn't produce the intended result.
              Kept here (commented) in case we revisit it. Half-grade columns can
              still be toggled individually in the grade list above.
          <div className="settings-item" onClick={() => {
            if (!settings.showHalfGrades) {
              const halfGrades: GradeNumber[] = [1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5];
              const combined = [...new Set([...settings.visibleGrades, ...halfGrades])].sort((a, b) => a - b);
              onUpdate({ ...settings, showHalfGrades: true, visibleGrades: combined });
            } else {
              const whole = settings.visibleGrades.filter((g) => g % 1 === 0);
              onUpdate({ ...settings, showHalfGrades: false, visibleGrades: whole.length > 0 ? whole : [9, 10] });
            }
          }}>
            <span className="settings-item__label">Include Half Grades</span>
            <div className={`settings-toggle ${settings.showHalfGrades ? 'settings-toggle--on' : ''}`}>
              <div className="settings-toggle__thumb" />
            </div>
          </div>
          */}

          {/* Default Language */}
          <div className="settings-section-title">Default Language</div>
          <div className="settings-item">
            <span className="settings-item__label">New Cards Default</span>
            <select
              className="settings-select"
              value={settings.defaultLanguage ?? 'EN'}
              onChange={(e) => onUpdate({ ...settings, defaultLanguage: e.target.value })}
            >
              <option value="EN">English (EN)</option>
              <option value="JP">Japanese (JP)</option>
              <option value="KR">Korean (KR)</option>
              <option value="CN">Chinese (CN)</option>
              <option value="DE">German (DE)</option>
              <option value="FR">French (FR)</option>
              <option value="IT">Italian (IT)</option>
              <option value="ES">Spanish (ES)</option>
              <option value="PT">Portuguese (PT)</option>
            </select>
          </div>

          {/* Default Company */}
          <div className="settings-section-title">Default Company</div>
          <div className="settings-item">
            <span className="settings-item__label">New Cards Default</span>
            <select
              className="settings-select"
              value={settings.defaultCompany ?? ''}
              onChange={(e) => onUpdate({ ...settings, defaultCompany: (e.target.value || null) as GradingCompany | null })}
            >
              <option value="">None</option>
              {GRADING_COMPANIES.map((c) => (
                <option key={c} value={c}>{COMPANY_LABELS[c]}</option>
              ))}
            </select>
          </div>

          {/* Default Service Levels */}
          <div className="settings-section-title">Default Service Levels</div>
          {GRADING_COMPANIES.map((company) => (
            <div className="settings-item" key={company}>
              <span className="settings-item__label" style={{ fontSize: '0.82rem' }}>{COMPANY_LABELS[company]}</span>
              <select
                className="settings-select"
                value={settings.defaultServiceLevel[company]}
                onChange={(e) =>
                  onUpdate({
                    ...settings,
                    defaultServiceLevel: { ...settings.defaultServiceLevel, [company]: e.target.value },
                  })
                }
              >
                {COMPANY_FEES[company].serviceLevels.map((sl) => (
                  <option key={sl.id} value={sl.id}>
                    {sl.name} (${sl.baseFee})
                  </option>
                ))}
              </select>
            </div>
          ))}

          {/* Global Custom Grading Price */}
          <div className="settings-section-title">Custom Grading Price</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 6 }}>
            Flat grading price applied to every card, overriding the tier price.
            Leave blank to use service-level tiers. Individual cards can still
            override this with their own price or tier.
          </div>
          <div className="settings-item">
            <span className="settings-item__label">All cards ($)</span>
            <input
              className="settings-fee-input"
              type="number"
              step="1"
              min="0"
              placeholder="Tiers"
              value={settings.globalCustomGradingFee ?? ''}
              onChange={(e) => {
                const v = e.target.value.trim();
                onUpdate({ ...settings, globalCustomGradingFee: v === '' ? null : Math.max(0, parseFloat(v) || 0) });
              }}
            />
          </div>

          {/* Profit Row Highlights */}
          <div className="settings-section-title">Row Profit Highlights</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 6 }}>
            Rows are highlighted based on best profit across visible grades.
          </div>
          <div className="settings-fee-grid">
            <span style={{ color: 'var(--gain)', fontSize: '0.82rem', fontWeight: 600 }}>● Green min ($)</span>
            <input
              className="settings-fee-input"
              type="number"
              step="5"
              min="0"
              value={settings.profitThresholds?.green ?? 50}
              onChange={(e) => onUpdate({
                ...settings,
                profitThresholds: { ...(settings.profitThresholds ?? { green: 50, yellow: 25 }), green: parseFloat(e.target.value) || 0 },
              })}
            />
            <span style={{ color: 'var(--neutral)', fontSize: '0.82rem', fontWeight: 600 }}>● Yellow min ($)</span>
            <input
              className="settings-fee-input"
              type="number"
              step="5"
              min="0"
              value={settings.profitThresholds?.yellow ?? 25}
              onChange={(e) => onUpdate({
                ...settings,
                profitThresholds: { ...(settings.profitThresholds ?? { green: 50, yellow: 25 }), yellow: parseFloat(e.target.value) || 0 },
              })}
            />
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>
            Below yellow min → <span style={{ color: 'var(--loss)' }}>red</span>.
            Set yellow to 0 to disable red highlighting.
          </div>
          <div className="settings-item" style={{ marginTop: 8 }}>
            <span className="settings-item__label">Highlight based on</span>
            <div style={{ display: 'flex', gap: 4 }}>
              {([9, 10] as const).map((g) => (
                <button
                  key={g}
                  className={`comparison-grade-tab${(settings.profitThresholds?.highlightGrade ?? 10) === g ? ' comparison-grade-tab--active' : ''}`}
                  style={{ fontSize: '0.72rem', padding: '3px 10px' }}
                  onClick={() => onUpdate({
                    ...settings,
                    profitThresholds: { ...(settings.profitThresholds ?? { green: 50, yellow: 25, highlightGrade: 10 }), highlightGrade: g },
                  })}
                >
                  G{g}
                </button>
              ))}
            </div>
          </div>

          {/* Grader Promo Codes */}
          <div className="settings-section-title">Grader Promo Codes</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 6 }}>
            Affiliate/promo codes that discount a grader's per-card fee. Each can be a % off
            or a flat price, scoped to one tier or any. Toggle a code on to apply it.
          </div>
          {promoCodes.map((pc) => {
            const tiers = COMPANY_FEES[pc.company].serviceLevels;
            return (
              <div className="promo-row" key={pc.id}>
                <input
                  type="checkbox"
                  className="include-check"
                  checked={pc.enabled}
                  onChange={(e) => updatePromoCode(pc.id, { enabled: e.target.checked })}
                  title="Apply this code"
                />
                <input
                  className="settings-fee-input promo-row__code"
                  placeholder="CODE"
                  value={pc.code}
                  onChange={(e) => updatePromoCode(pc.id, { code: e.target.value })}
                />
                <select
                  className="settings-select"
                  value={pc.company}
                  onChange={(e) => updatePromoCode(pc.id, { company: e.target.value as GradingCompany, serviceLevel: null })}
                >
                  {GRADING_COMPANIES.map((c) => (
                    <option key={c} value={c}>{COMPANY_LABELS[c]}</option>
                  ))}
                </select>
                <select
                  className="settings-select"
                  value={pc.serviceLevel ?? ''}
                  onChange={(e) => updatePromoCode(pc.id, { serviceLevel: e.target.value || null })}
                >
                  <option value="">Any tier</option>
                  {tiers.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                <select
                  className="settings-select"
                  value={pc.type}
                  onChange={(e) => updatePromoCode(pc.id, { type: e.target.value as 'percent' | 'flat' })}
                >
                  <option value="percent">% off</option>
                  <option value="flat">flat $</option>
                </select>
                <input
                  className="settings-fee-input"
                  style={{ width: 58 }}
                  type="number"
                  min="0"
                  value={pc.value || ''}
                  onChange={(e) => updatePromoCode(pc.id, { value: Math.max(0, parseFloat(e.target.value) || 0) })}
                />
                <button className="promo-row__del" onClick={() => removePromoCode(pc.id)} title="Remove code">✕</button>
              </div>
            );
          })}
          <button className="settings-add-promo" onClick={addPromoCode}>+ Add promo code</button>

          {/* Fee Editor */}
          <div className="settings-section-title">Edit Fees</div>
          <div className="settings-item">
            <span className="settings-item__label" style={{ fontSize: '0.82rem' }}>Company</span>
            <select
              className="settings-select"
              value={feeEditCompany ?? ''}
              onChange={(e) => setFeeEditCompany((e.target.value || null) as GradingCompany | null)}
            >
              <option value="">Select...</option>
              {GRADING_COMPANIES.map((c) => (
                <option key={c} value={c}>{COMPANY_LABELS[c]}</option>
              ))}
            </select>
          </div>

          {feeEditCompany && (
            <div className="settings-fee-grid">
              {COMPANY_FEES[feeEditCompany].serviceLevels.map((sl) => (
                <FeeRow
                  key={sl.id}
                  label={sl.name}
                  value={sl.baseFee}
                  onChange={(val) => {
                    const overrides = { ...settings.feeOverrides };
                    const compOverrides = { ...overrides[feeEditCompany] };
                    const levels = compOverrides.serviceLevels
                      ? [...compOverrides.serviceLevels]
                      : COMPANY_FEES[feeEditCompany].serviceLevels.map((l) => ({ ...l }));
                    const idx = levels.findIndex((l) => l.id === sl.id);
                    if (idx >= 0) levels[idx] = { ...levels[idx], baseFee: val };
                    compOverrides.serviceLevels = levels;
                    overrides[feeEditCompany] = compOverrides;
                    onUpdate({ ...settings, feeOverrides: overrides });
                  }}
                />
              ))}
            </div>
          )}

          {/* Changelog link — very bottom of the panel */}
          <div className="settings-footer">
            <a
              href="/changelog"
              className="settings-changelog-link"
              onClick={(e) => { e.preventDefault(); setOpen(false); onOpenChangelog(); }}
            >
              View changelog
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

function FeeRow({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <>
      <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>{label}</span>
      <input
        className="settings-fee-input"
        type="number"
        step="1"
        min="0"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      />
    </>
  );
}
