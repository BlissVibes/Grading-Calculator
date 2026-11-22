import type { GradingCompany, FeePreset } from '../types';
import { GRADING_COMPANIES, COMPANY_LABELS } from '../types';
import { COMPANY_FEES } from '../gradingData';
import NumberStepper from './NumberStepper';

interface Props {
  selectedCompany: GradingCompany | null;
  selectedServiceLevel: string;
  globalCustomFee: number | null;
  onCompanyChange: (company: GradingCompany | null) => void;
  onServiceLevelChange: (level: string) => void;
  onApplyToAll: () => void;
  onGlobalCustomFeeChange: (fee: number | null) => void;
  presets: FeePreset[];
  onApplyPreset: (presetId: string) => void;
  onAddPreset: () => void;
}

export default function CompanySelector({
  selectedCompany,
  selectedServiceLevel,
  globalCustomFee,
  onCompanyChange,
  onServiceLevelChange,
  onApplyToAll,
  onGlobalCustomFeeChange,
  presets,
  onApplyPreset,
  onAddPreset,
}: Props) {
  const serviceLevels = selectedCompany ? COMPANY_FEES[selectedCompany].serviceLevels : [];
  const customActive = globalCustomFee != null;

  return (
    <div className="company-bar">
      <span className="company-bar__label">Grading Company:</span>

      {GRADING_COMPANIES.map((c) => (
        <button
          key={c}
          className={`company-btn company-btn--${c.toLowerCase()} ${selectedCompany === c ? 'company-btn--active' : ''}`}
          onClick={() => onCompanyChange(c)}
        >
          {COMPANY_LABELS[c]}
        </button>
      ))}

      {selectedCompany && (
        <select
          className="service-select"
          value={selectedServiceLevel}
          onChange={(e) => onServiceLevelChange(e.target.value)}
        >
          {serviceLevels.map((sl) => (
            <option key={sl.id} value={sl.id}>
              {sl.name} - ${sl.baseFee}/card ({sl.turnaround})
              {sl.minCards ? ` [min ${sl.minCards}]` : ''}
            </option>
          ))}
        </select>
      )}

      {/* Custom flat grading price applied to every card on a default tier */}
      <div className={`company-bar__custom ${customActive ? 'company-bar__custom--active' : ''}`}>
        <button
          className={`company-btn company-btn--custom ${customActive ? 'company-btn--active' : ''}`}
          onClick={() => onGlobalCustomFeeChange(customActive ? null : 0)}
          title="Set your own flat grading price for every card"
        >
          Custom $
        </button>
        {customActive && (
          <>
            <NumberStepper
              value={globalCustomFee ?? 0}
              onChange={(v) => onGlobalCustomFeeChange(v)}
              inputClassName="cell-input cell-input--number company-bar__custom-input"
              autoFocus
            />
            <span className="company-bar__custom-unit">/card</span>
          </>
        )}
      </div>

      {/* Saved fee presets: apply one to every card, or save a new one */}
      <select
        className="service-select company-bar__presets"
        value=""
        title="Apply a saved grading price to all cards"
        onChange={(e) => {
          const v = e.target.value;
          if (v === '__add') onAddPreset();
          else if (v) onApplyPreset(v);
        }}
      >
        <option value="">Presets…</option>
        {presets.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} — ${p.price}/card{p.company ? ` (${COMPANY_LABELS[p.company]})` : ''}
          </option>
        ))}
        <option value="__add">＋ Save new preset…</option>
      </select>

      {selectedCompany && (
        <div className="company-bar__actions">
          <button className="company-bar__apply-btn" onClick={onApplyToAll}>
            Apply to All Cards
          </button>
        </div>
      )}
    </div>
  );
}
