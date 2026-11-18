import { render, toPlainText } from '@react-email/render';
import nodemailer, { type Transporter } from 'nodemailer';
import type { Mail } from '@/emails/templates';

let transporter: Transporter | null | undefined;

function getTransport(): Transporter | null {
  if (transporter !== undefined) return transporter;
  const host = process.env.SMTP_HOST;
  transporter = host
    ? nodemailer.createTransport({
        host,
        port: Number(process.env.SMTP_PORT ?? 587),
        secure: Number(process.env.SMTP_PORT) === 465,
        auth: process.env.SMTP_USER
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
      })
    : null;
  return transporter;
}

export interface Attachment {
  filename: string;
  content: string | Buffer;
  contentType?: string;
}

/**
 * Renders a template (HTML + text) and sends it. Without SMTP_HOST, mails are only logged
 * (never with their body, which may contain personal data).
 */
export async function sendMail(
  to: string,
  mail: Mail,
  attachments: Attachment[] = [],
  headers: Record<string, string> = {},
): Promise<void> {
  const html = await render(mail.element);
  const text = toPlainText(html);
  const t = getTransport();
  if (!t) {
    console.info(`[mail] SMTP not configured, not sent: "${logSubject(mail.subject)}"`);
    return;
  }
  await t.sendMail({
    from: process.env.MAIL_FROM ?? 'notetonmaster <ne-pas-repondre@notetonmaster.example>',
    to,
    subject: mail.subject,
    html,
    text,
    attachments,
    headers,
  });
}

/** A subject fit for the logs: digits hidden (login codes are in the subjects). */
const logSubject = (subject: string) => subject.replace(/\d/g, '•');

/** Never let a mail failure break the user action: log and continue. */
export async function sendMailSafe(
  to: string,
  mail: Mail,
  attachments: Attachment[] = [],
  headers: Record<string, string> = {},
): Promise<boolean> {
  try {
    await sendMail(to, mail, attachments, headers);
    return true;
  } catch (err) {
    // Never the error itself: SMTP answers quote the recipient's address.
    const e = err as { code?: unknown; responseCode?: unknown };
    console.error(
      `[mail] failed to send "${logSubject(mail.subject)}" (${String(e.code ?? 'error')}${e.responseCode ? ` ${String(e.responseCode)}` : ''})`,
    );
    return false;
  }
}
