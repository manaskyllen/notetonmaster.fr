import type { z } from 'zod';

/** Result shape shared by form server actions (works with useActionState). */
export type FormState<T = undefined> =
  | { status: 'idle' }
  | {
      status: 'error';
      message?: string;
      fieldErrors?: Record<string, string>;
      values?: Record<string, string>;
    }
  | { status: 'success'; message?: string; data?: T };

export const idle: FormState = { status: 'idle' };

/** First error message per field, from a Zod error. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const k = issue.path.join('.') || '_';
    out[k] ??= issue.message;
  }
  return out;
}

export function formValues(fd: FormData, keys: string[]): Record<string, string> {
  return Object.fromEntries(keys.map((k) => [k, String(fd.get(k) ?? '')]));
}
