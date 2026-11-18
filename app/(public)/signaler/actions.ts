'use server';

import { reportAckMail } from '@/emails/templates';
import { encrypt, hmac, normalizeEmail } from '@/lib/crypto';
import { prisma } from '@/lib/db';
import { fieldErrors } from '@/lib/form';
import { sendMailSafe } from '@/lib/mail/send';
import { HOUR, rateLimit } from '@/lib/rate-limit';
import { autoHideIfNeeded, findReviewByTarget, withReference } from '@/lib/reports';
import { turnstileTokenOf, verifyTurnstile } from '@/lib/turnstile';
import { clientIp, logConnection } from '@/lib/request';
import { getSettings } from '@/lib/settings';
import {
  formalNoticeSchema,
  NOTICE_QUALITIES,
  REPORT_REASONS,
  simpleReportSchema,
} from '@/lib/validation';

export type ReportResult =
  | { ok: true; reference: string; formal: boolean; programSlug?: string }
  | { ok: false; message?: string; fieldErrors?: Record<string, string> };

export async function submitReport(input: unknown): Promise<ReportResult> {
  const parsed = simpleReportSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  const human = await verifyTurnstile('report', turnstileTokenOf(input));
  if (!human.ok) return { ok: false, message: human.message };
  const ip = await clientIp();
  if (!(await rateLimit(`report:${ip}`, 10, HOUR)))
    return { ok: false, message: 'Trop de signalements envoyés. Réessaie plus tard.' };
  const review = await findReviewByTarget(parsed.data.target);
  if (!review || !['PUBLISHED', 'HIDDEN'].includes(review.status))
    return {
      ok: false,
      fieldErrors: {
        target: 'Avis introuvable : colle le lien de l’avis ou son identifiant (avis-…).',
      },
    };
  const email = parsed.data.email ? normalizeEmail(parsed.data.email) : null;
  const report = await withReference('SIG', (reference) =>
    prisma.report.create({
      data: {
        reference,
        targetType: 'REVIEW',
        targetId: review.id,
        reason: REPORT_REASONS[parsed.data.reason],
        details: parsed.data.details || null,
        reporterEmailEnc: email ? encrypt(email) : null,
        reporterKey: hmac(`reporter:${ip}`),
      },
    }),
  );
  await autoHideIfNeeded(review.id);
  await logConnection('REPORT', report.reference);
  if (email)
    await sendMailSafe(email, reportAckMail({ reference: report.reference, formal: false }));
  return { ok: true, reference: report.reference, formal: false, programSlug: review.program.slug };
}

export async function submitNotice(input: unknown): Promise<ReportResult> {
  const parsed = formalNoticeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  const human = await verifyTurnstile('notice', turnstileTokenOf(input));
  if (!human.ok) return { ok: false, message: human.message };
  if (!(await rateLimit(`notice:${await clientIp()}`, 5, HOUR)))
    return { ok: false, message: 'Trop de notifications envoyées. Réessaie plus tard.' };
  const d = parsed.data;
  const days = (await getSettings())['legal.internalDelayDays'];
  const deadline = new Date(Date.now() + days * 24 * 3600_000);
  const req = await withReference('NOT', (reference) =>
    prisma.legalRequest.create({
      data: {
        type: 'NOTICE',
        reference,
        requesterName: d.name,
        requesterQuality: NOTICE_QUALITIES[d.quality],
        requesterEmailEnc: encrypt(normalizeEmail(d.email)),
        contentUrl: d.url,
        grounds: d.grounds,
        lawReference: d.law || null,
        goodFaith: true,
        internalDeadline: deadline,
      },
    }),
  );
  await logConnection('LEGAL_NOTICE', req.reference);
  await sendMailSafe(d.email, reportAckMail({ reference: req.reference, formal: true, deadline }));
  return { ok: true, reference: req.reference, formal: true };
}
