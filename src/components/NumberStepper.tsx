interface Props {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  /** Typing granularity for the text box (arrows always snap to whole dollars). */
  step?: number;
  inputClassName?: string;
  placeholder?: string;
  title?: string;
  autoFocus?: boolean;
  /** Show '' instead of 0 when the value is falsy (money fields). */
  blankWhenZero?: boolean;
}

/**
 * A dollar number input with the same up/down arrow buttons as the quantity
 * stepper. The native browser spinner is hidden; the custom arrows appear only
 * while the box is focused and snap the value to the nearest whole dollar.
 */
export default function NumberStepper({
  value,
  onChange,
  min = 0,
  step = 0.01,
  inputClassName = 'cell-input cell-input--number',
  placeholder = '0.00',
  title,
  autoFocus,
  blankWhenZero = true,
}: Props) {
  const clamp = (n: number) => Math.max(min, n);
  // Arrows jump to the nearest rounded dollar (drop cents, then ±$1).
  const stepUp = () => onChange(clamp(Math.floor(value + 1e-9) + 1));
  const stepDown = () => onChange(clamp(Math.ceil(value - 1e-9) - 1));

  const displayValue = blankWhenZero ? (value || '') : value;

  return (
    <div className="num-stepper">
      <input
        className={inputClassName}
        type="number"
        step={step}
        min={min}
        value={displayValue}
        placeholder={placeholder}
        title={title}
        autoFocus={autoFocus}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          onChange(isNaN(v) ? 0 : clamp(v));
        }}
      />
      <div className="num-stepper__btns">
        <button
          type="button"
          className="qty-btn num-stepper__btn"
          onMouseDown={(e) => e.preventDefault()}
          onClick={stepUp}
          tabIndex={-1}
          aria-label="Increase to next dollar"
        >
          ▲
        </button>
        <button
          type="button"
          className="qty-btn num-stepper__btn"
          onMouseDown={(e) => e.preventDefault()}
          onClick={stepDown}
          tabIndex={-1}
          aria-label="Decrease to previous dollar"
        >
          ▼
        </button>
      </div>
    </div>
  );
}
