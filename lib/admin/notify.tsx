import { prisma } from '@/lib/db';
import { sendMailSafe } from '@/lib/mail/send';
import { getSettings } from '@/lib/settings';
import {
  NOTIFICATION_EVENTS,
  SETTINGS_DEFAULTS,
  type NotificationEvent,
} from '@/lib/settings-defaults';
import { CTA, H1, Layout, P, appUrl } from '@/emails/Layout';

const label = (event: NotificationEvent) => NOTIFICATION_EVENTS.find((e) => e.id === event)!.label;

/**
 * Mails the team members whose role is enabled for this event in the notification matrix
 * (Paramètres › Notifications). `path` is the admin page that holds the item. Never throws: a
 * notification must not break the action that triggered it.
 */
export async function notifyAdmins(
  event: NotificationEvent,
  subject: string,
  text: string,
  path = '/admin',
) {
  try {
    const matrix = (await getSettings())['notifications.matrix'];
    const enabled = matrix[event] ?? SETTINGS_DEFAULTS['notifications.matrix'][event];
    const roles = Object.entries(enabled)
      .filter(([, on]) => on)
      .map(([r]) => r) as ('ADMIN' | 'MODERATOR' | 'DATA_EDITOR' | 'LEGAL')[];
    if (!roles.length) return;
    const admins = await prisma.adminUser.findMany({
      where: { role: { in: roles }, removedAt: null, passwordHash: { not: null } },
      select: { email: true },
    });
    const url = `${appUrl()}${path}`;
    for (const a of admins)
      await sendMailSafe(a.email, {
        subject: `[Admin] ${subject}`,
        element: (
          <Layout
            preview={subject}
            footer="Notification d’équipe : réglable dans Paramètres › Notifications."
          >
            <H1>{subject}</H1>
            <P>{text}</P>
            <CTA href={url}>Ouvrir dans l’admin</CTA>
            <P muted>{url}</P>
          </Layout>
        ),
      });
  } catch (err) {
    console.error(`[notify] ${event}: ${(err as Error).message}`);
  }
}

/** Reference of an item without its own (contact message, proof of study), shown in the admin. */
export const shortRef = (prefix: 'CON' | 'JUS', id: string) =>
  `${prefix}-${id.slice(-8).toUpperCase()}`;

/**
 * An incoming item nobody would see otherwise (contact message, formal notice, reported review,
 * proof of study). The mail holds the type of event, the reference and the admin link only:
 * never a name, an address or the content written by the visitor.
 */
export function notifyIncoming(event: NotificationEvent, reference: string, path: string) {
  return notifyAdmins(
    event,
    `${label(event)} · ${reference}`,
    `Référence : ${reference}. Le détail est dans l’admin, après connexion.`,
    path,
  );
}
