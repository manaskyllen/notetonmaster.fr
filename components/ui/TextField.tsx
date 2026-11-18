import { Input, Textarea } from './form/Controls';
import { Field } from './form/Field';

type Base = {
  label: React.ReactNode;
  hint?: React.ReactNode;
  hintTone?: 'muted' | 'ok';
  error?: string | null;
  optional?: boolean;
  className?: string;
  /** Visually hide the label (still read by screen readers). */
  hideLabel?: boolean;
};

export type TextFieldProps = Base &
  (
    | ({ multiline?: false } & React.ComponentProps<'input'>)
    | ({ multiline: true } & React.ComponentProps<'textarea'>)
  );

/** Labelled input or textarea, (see styles/forms.css). */
export function TextField(props: TextFieldProps) {
  const { label, hint, hintTone, error, optional, className, hideLabel, multiline, id, ...rest } =
    props;
  return (
    <Field
      label={label}
      hint={hint}
      hintTone={hintTone}
      error={error}
      optional={optional}
      hideLabel={hideLabel}
      id={id}
      className={className}
    >
      {(a11y) =>
        multiline ? (
          <Textarea {...(rest as React.ComponentProps<'textarea'>)} {...a11y} />
        ) : (
          <Input {...(rest as React.ComponentProps<'input'>)} {...a11y} />
        )
      }
    </Field>
  );
}
