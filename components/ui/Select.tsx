import { NativeSelect } from './form/Controls';
import { Field } from './form/Field';

export interface SelectProps extends Omit<React.ComponentProps<'select'>, 'children'> {
  label: React.ReactNode;
  hideLabel?: boolean;
  options: { value: string; label: string; disabled?: boolean }[];
  /** First, empty option ("Choisir…"). */
  placeholder?: string;
  hint?: React.ReactNode;
  error?: string | null;
  optional?: boolean;
}

/** Labelled native select with the design-system chevron. */
export function Select({
  label,
  hideLabel,
  options,
  placeholder,
  className,
  hint,
  error,
  optional,
  id,
  ...rest
}: SelectProps) {
  return (
    <Field
      label={label}
      hideLabel={hideLabel}
      hint={hint}
      error={error}
      optional={optional}
      id={id}
      className={className}
    >
      {(a11y) => <NativeSelect {...rest} {...a11y} options={options} placeholder={placeholder} />}
    </Field>
  );
}
