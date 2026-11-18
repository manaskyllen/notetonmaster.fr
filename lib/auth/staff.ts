import 'server-only';
import { cache } from 'react';
import { prisma } from '@/lib/db';
import { staffStillVerified } from '@/lib/domain/staff-domains';
import { staffSession, validateSession } from './session';

/** The verified teaching-team member of this browser (verification under 12 months), or null. */
export const getCurrentResponder = cache(async () => {
  const s = await staffSession();
  if (!s.responderId) return null;
  if (!(await validateSession('STAFF', s.sid, s.responderId))) return null;
  const r = await prisma.staffResponder.findUnique({
    where: { id: s.responderId },
    select: {
      id: true,
      domain: true,
      verifiedAt: true,
      universityId: true,
      university: {
        select: { id: true, name: true, shortName: true, children: { select: { id: true } } },
      },
    },
  });
  if (!r || !staffStillVerified(r.verifiedAt)) return null;
  return {
    ...r,
    /** The establishment and its établissements-composantes. */
    universityIds: [r.universityId, ...r.university.children.map((c) => c.id)],
  };
});
