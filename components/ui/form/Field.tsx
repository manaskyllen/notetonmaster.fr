import { useId } from 'react';
import { cn } from '@/lib/cn';

/** Props a field passes to its control: id, description and invalid state. */
export interface ControlA11y {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
}

export interface FieldProps {
  label: React.ReactNode;
  /** Help under the control (13px, ink-muted). */
  hint?: React.ReactNode;
  /** `ok` turns the hint green ("C'est bon ✓"). */
  hintTone?: 'muted' | 'ok';
  /** Error message: danger border on the control, message under it. */
  error?: string | null;
  /** Adds "(facultatif)" after the label. */
  optional?: boolean;
  hideLabel?: boolean;
  id?: string;
  className?: string;
  children: (control: ControlA11y) => React.ReactNode;
}

/** Label, control and help, wired with htmlFor / aria-describedby / aria-invalid. */
export function Field({
  label,
  hint,
  hintTone = 'muted',
  error,
  optional,
  hideLabel,
  id: idProp,
  className,
  children,
}: FieldProps) {
  const auto = useId();
  const id = idProp ?? auto;
  const msgId = `${id}-msg`;
  const hasMsg = !!error || hint != null;
  return (
    <div className={cn('nm-field', className)}>
      <label htmlFor={id} className={cn('nm-label', hideLabel && 'sr-only')}>
        {label}
        {optional && <span className="nm-label__optional"> (facultatif)</span>}
      </label>
      {children({
        id,
        'aria-describedby': hasMsg ? msgId : undefined,
        'aria-invalid': error ? true : undefined,
      })}
      {error ? (
        <span id={msgId} className="nm-error" key="error">
          {error}
        </span>
      ) : hint != null ? (
        <span id={msgId} className={cn('nm-hint', hintTone === 'ok' && 'nm-hint--ok')}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}

/** Error message for controls that are not wrapped in a Field (groups, checkboxes). */
export function FieldError({ id, children }: { id?: string; children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <span id={id} className="nm-error">
      {children}
    </span>
  );
}
