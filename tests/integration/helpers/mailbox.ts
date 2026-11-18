/**
 * Captured mails (instead of SMTP). Mock with:
 *   vi.mock('@/lib/mail/send', async () => (await import('../helpers/mailbox')).mailModule);
 */
import { render, toPlainText } from '@react-email/render';
import type { Mail } from '@/emails/templates';

export type Sent = { to: string; subject: string; text: string; headers: Record<string, string> };
export const mailbox: Sent[] = [];

async function capture(
  to: string,
  mail: Mail,
  ...rest: [attachments?: unknown[], headers?: Record<string, string>]
) {
  const headers = rest[1] ?? {};
  const text = toPlainText(await render(mail.element));
  mailbox.push({ to, subject: mail.subject, text, headers });
}

export const mailModule = {
  sendMail: capture,
  sendMailSafe: async (...a: Parameters<typeof capture>) => {
    await capture(...a);
    return true;
  },
};

/** The 6-digit code of the latest mail sent to `to` (« 482 913 » in the text). */
export function lastCode(to: string): string {
  const m = [...mailbox].reverse().find((x) => x.to === to);
  const code = m && /\b(\d{3}) ?(\d{3})\b/.exec(m.text);
  if (!code) throw new Error(`no code mailed to ${to}`);
  return code[1]! + code[2]!;
}

export function lastMail(to: string) {
  return [...mailbox].reverse().find((x) => x.to === to);
}
