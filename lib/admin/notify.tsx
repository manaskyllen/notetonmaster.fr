import { prisma } from '@/lib/db';
import { sendMailSafe } from '@/lib/mail/send';
import { getSettings } from '@/lib/settings';
import type { NotificationEvent } from '@/lib/settings-defaults';
import { H1, Layout, P, appUrl } from '@/emails/Layout';

/** Mails the team members whose role is enabled for this event in the notification matrix. */
export async function notifyAdmins(event: NotificationEvent, subject: string, text: string) {
  const matrix = (await getSettings())['notifications.matrix'];
  const roles = Object.entries(matrix[event] ?? {})
    .filter(([, on]) => on)
    .map(([r]) => r) as ('ADMIN' | 'MODERATOR' | 'DATA_EDITOR' | 'LEGAL')[];
  if (!roles.length) return;
  const admins = await prisma.adminUser.findMany({
    where: { role: { in: roles }, removedAt: null, passwordHash: { not: null } },
    select: { email: true },
  });
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
          <P muted>{appUrl()}/admin</P>
        </Layout>
      ),
    });
}
