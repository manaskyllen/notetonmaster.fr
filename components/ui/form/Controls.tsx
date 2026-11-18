import { cn } from '@/lib/cn';

/** Class of every text control (input, select, textarea): see styles/forms.css. */
export const controlClass = 'nm-control';

export function Input({ className, ...rest }: React.ComponentProps<'input'>) {
  return <input {...rest} className={cn(controlClass, className)} />;
}

export function Textarea({ className, ...rest }: React.ComponentProps<'textarea'>) {
  return <textarea {...rest} className={cn(controlClass, className)} />;
}

export interface NativeSelectProps extends React.ComponentProps<'select'> {
  options?: { value: string; label: string; disabled?: boolean }[];
  /** First, empty option ("Choisir…"). */
  placeholder?: string;
}

/** Native <select> drawn like the inputs, with a 2px stroke chevron (appearance: none). */
export function NativeSelect({
  className,
  options,
  placeholder,
  children,
  ...rest
}: NativeSelectProps) {
  return (
    <select {...rest} className={cn(controlClass, className)}>
      {placeholder != null && <option value="">{placeholder}</option>}
      {options?.map((o) => (
        <option key={o.value} value={o.value} disabled={o.disabled}>
          {o.label}
        </option>
      ))}
      {children}
    </select>
  );
}
