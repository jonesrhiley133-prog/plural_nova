import { useEffect } from 'react';
import { Icon } from './Icon.js';

/**
 * A numeric keypad, the way a phone's lock screen has one — digit dots above,
 * a 3×3 grid of digits and a backspace below. Length is deliberately open
 * (PluralNova's PIN can be 4 to 8 digits): rather than guess a target length
 * and auto-submit into a wrong attempt, the caller still asks for an explicit
 * confirm once the minimum is met. A physical keyboard works the same way,
 * for anyone who would rather type than tap.
 */
export interface PinPadProps {
  value: string;
  onChange: (next: string) => void;
  maxLength?: number;
  disabled?: boolean;
  /** Physical Enter, so a keyboard user can submit without reaching for a mouse. */
  onEnter?: () => void;
}

const ROWS: readonly (readonly string[])[] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
];

export function PinPad({ value, onChange, maxLength = 8, disabled, onEnter }: PinPadProps): JSX.Element {
  const append = (digit: string): void => {
    if (disabled || value.length >= maxLength) return;
    onChange(value + digit);
  };
  const backspace = (): void => {
    if (disabled || value.length === 0) return;
    onChange(value.slice(0, -1));
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (disabled) return;
      if (/^[0-9]$/.test(event.key)) {
        append(event.key);
      } else if (event.key === 'Backspace') {
        backspace();
      } else if (event.key === 'Enter') {
        onEnter?.();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, disabled, maxLength, onEnter]);

  const dotCount = Math.max(value.length, 4);

  return (
    <div className="pin-pad" role="group" aria-label="PIN entry">
      <div className="pin-pad__dots" aria-hidden="true">
        {Array.from({ length: dotCount }, (_, index) => (
          <span key={index} className={`pin-pad__dot${index < value.length ? ' pin-pad__dot--filled' : ''}`} />
        ))}
      </div>
      <span className="visually-hidden" role="status">
        {value.length === 0 ? 'No digits entered' : `${value.length} digit${value.length === 1 ? '' : 's'} entered`}
      </span>

      <div className="pin-pad__grid">
        {ROWS.flat().map((digit) => (
          <button
            key={digit}
            type="button"
            className="pin-pad__key"
            disabled={disabled || value.length >= maxLength}
            onClick={() => append(digit)}
          >
            {digit}
          </button>
        ))}
        <span className="pin-pad__key pin-pad__key--spacer" aria-hidden="true" />
        <button
          type="button"
          className="pin-pad__key"
          disabled={disabled || value.length >= maxLength}
          onClick={() => append('0')}
        >
          0
        </button>
        <button
          type="button"
          className="pin-pad__key pin-pad__key--corner"
          disabled={disabled || value.length === 0}
          onClick={backspace}
          aria-label="Delete last digit"
        >
          <Icon name="backspace" size={22} />
        </button>
      </div>
    </div>
  );
}
