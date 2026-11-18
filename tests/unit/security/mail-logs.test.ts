/** A failed mail is logged without the recipient's address nor the SMTP message that contains it. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';

vi.mock('nodemailer', () => ({
  default: {
    createTransport: () => ({
      sendMail: async () => {
        const e = new Error(
          "Can't send mail - all recipients were rejected: 550 5.1.1 <jean.dupont@univ-nantes.fr>: Recipient address rejected",
        );
        Object.assign(e, {
          code: 'EENVELOPE',
          responseCode: 550,
          rejected: ['jean.dupont@univ-nantes.fr'],
        });
        throw e;
      },
    }),
  },
}));

process.env.SMTP_HOST = 'smtp.test';
const { sendMailSafe } = await import('@/lib/mail/send');

afterEach(() => vi.restoreAllMocks());

describe('sendMailSafe', () => {
  it('logs the failure without any address', async () => {
    const lines: string[] = [];
    vi.spyOn(console, 'error').mockImplementation(
      (...a: unknown[]) =>
        void lines.push(
          a
            .map((x) =>
              x instanceof Error
                ? `${x.message} ${JSON.stringify(x)}`
                : (JSON.stringify(x) ?? String(x)),
            )
            .join(' '),
        ),
    );
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const ok = await sendMailSafe('jean.dupont@univ-nantes.fr', {
      subject: '482 913 · ton code',
      element: createElement('p', null, 'x'),
    });
    expect(ok).toBe(false);
    expect(lines.join('\n')).toMatch(/EENVELOPE|550/);
    expect(lines.join('\n')).not.toMatch(/@/);
    // The subject carries the login code: never in the logs.
    expect(lines.join('\n')).not.toMatch(/482/);
  });
});
