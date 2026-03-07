import type { GradingCompany } from '../types';
import { GRADING_COMPANIES, COMPANY_LABELS } from '../types';
import { COMPANY_FEES } from '../gradingData';

interface Props {
  selectedCompany: GradingCompany | null;
  selectedServiceLevel: string;
  onCompanyChange: (company: GradingCompany | null) => void;
  onServiceLevelChange: (level: string) => void;
  onApplyToAll: () => void;
}

export default function CompanySelector({
  selectedCompany,
  selectedServiceLevel,
  onCompanyChange,
  onServiceLevelChange,
  onApplyToAll,
}: Props) {
  const serviceLevels = selectedCompany ? COMPANY_FEES[selectedCompany].serviceLevels : [];

  return (
    <div className="company-bar">
      <span className="company-bar__label">Grading Company:</span>

      <button
        className={`company-btn ${selectedCompany === null ? 'company-btn--active' : ''}`}
        onClick={() => onCompanyChange(null)}
      >
        None
      </button>

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
        <>
          <select
            className="service-select"
            value={selectedServiceLevel}
            onChange={(e) => onServiceLevelChange(e.target.value)}
          >
            {serviceLevels.map((sl) => (
              <option key={sl.id} value={sl.id}>
                {sl.name} — ${sl.baseFee}/card ({sl.turnaround})
                {sl.minCards ? ` [min ${sl.minCards}]` : ''}
              </option>
            ))}
          </select>

          <div className="company-bar__actions">
            <button className="company-bar__apply-btn" onClick={onApplyToAll}>
              Apply to All Cards
            </button>
          </div>
        </>
      )}
    </div>
  );
}
