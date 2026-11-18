'use server';

import { notifyIncoming, shortRef } from '@/lib/admin/notify';
import { prisma } from '@/lib/db';
import { encrypt } from '@/lib/crypto';
import { fieldErrors, formValues, type FormState } from '@/lib/form';
import { HOUR, rateLimit } from '@/lib/rate-limit';
import { clientIp } from '@/lib/request';
import { turnstileTokenOf, verifyTurnstile } from '@/lib/turnstile';
import { CONTACT_SUBJECTS, contactSchema } from '@/lib/validation';

export async function sendContact(_prev: FormState, fd: FormData): Promise<FormState> {
  const values = formValues(fd, ['subject', 'email', 'link', 'message']);
  const parsed = contactSchema.safeParse(values);
  if (!parsed.success) return { status: 'error', fieldErrors: fieldErrors(parsed.error), values };
  const human = await verifyTurnstile('contact', turnstileTokenOf(fd));
  if (!human.ok) return { status: 'error', message: human.message, values };
  if (!(await rateLimit(`contact:${await clientIp()}`, 5, HOUR)))
    return {
      status: 'error',
      message: 'Trop de messages envoyés. Réessaie dans une heure.',
      values,
    };
  const message = await prisma.contactMessage.create({
    data: {
      subject: CONTACT_SUBJECTS[parsed.data.subject],
      emailEnc: encrypt(parsed.data.email),
      link: parsed.data.link || null,
      body: parsed.data.message,
    },
    select: { id: true },
  });
  await notifyIncoming(
    'contact.received',
    shortRef('CON', message.id),
    '/admin/moderation?file=contact',
  );
  return { status: 'success' };
}
