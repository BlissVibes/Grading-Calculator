import { useState } from 'react';
import type { AppSettings, GradeNumber, GradingCompany } from '../types';
import { ALL_GRADES, GRADING_COMPANIES, COMPANY_LABELS } from '../types';
import { COMPANY_FEES } from '../gradingData';

interface Props {
  settings: AppSettings;
  onUpdate: (settings: AppSettings) => void;
}

export default function SettingsPanel({ settings, onUpdate }: Props) {
  const [open, setOpen] = useState(false);
  const [feeEditCompany, setFeeEditCompany] = useState<GradingCompany | null>(null);

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

          {/* Half Grades Toggle */}
          <div className="settings-item" onClick={() => {
            if (!settings.showHalfGrades) {
              // Add half grades
              const halfGrades: GradeNumber[] = [1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5];
              const combined = [...new Set([...settings.visibleGrades, ...halfGrades])].sort((a, b) => a - b);
              onUpdate({ ...settings, showHalfGrades: true, visibleGrades: combined });
            } else {
              // Remove half grades
              const whole = settings.visibleGrades.filter((g) => g % 1 === 0);
              onUpdate({ ...settings, showHalfGrades: false, visibleGrades: whole.length > 0 ? whole : [9, 10] });
            }
          }}>
            <span className="settings-item__label">Include Half Grades</span>
            <div className={`settings-toggle ${settings.showHalfGrades ? 'settings-toggle--on' : ''}`}>
              <div className="settings-toggle__thumb" />
            </div>
          </div>

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
