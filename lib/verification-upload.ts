import 'server-only';
import { notifyIncoming, shortRef } from '@/lib/admin/notify';
import { prisma } from '@/lib/db';
import { HOUR, rateLimit } from '@/lib/rate-limit';
import { getSettings } from '@/lib/settings';
import { saveDocument } from '@/lib/uploads';

export type UploadResult =
  | { ok: true; message: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

/**
 * A proof of study for one master the student reviewed (route /api/espace/justificatif). The
 * file is checked on its content, stripped of its metadata (lib/uploads.ts), stored privately
 * and deleted at the decision.
 */
export async function submitDocument(studentId: string, fd: FormData): Promise<UploadResult> {
  if (!(await getSettings())['moderation.documents'])
    return { ok: false, error: 'La vérification par justificatif est temporairement fermée.' };
  const programId = String(fd.get('programId') ?? '').slice(0, 40);
  const reviewed = await prisma.review.findFirst({
    where: { studentId, programId },
    select: { level: true, cohortYear: true },
  });
  if (!reviewed) return { ok: false, error: 'Ce master ne fait pas partie de tes avis.' };
  if (!(await rateLimit(`doc:${studentId}`, 5, 24 * HOUR)))
    return { ok: false, error: 'Trop d’envois aujourd’hui.' };
  const pending = await prisma.programVerification.findFirst({
    where: { studentId, programId, method: 'DOCUMENT', status: 'PENDING' },
  });
  if (pending)
    return {
      ok: false,
      error: 'Un justificatif pour ce master est déjà en cours de vérification.',
    };
  const file = fd.get('document');
  if (!(file instanceof File) || file.size === 0)
    return { ok: false, error: 'Choisis un fichier.' };
  const saved = await saveDocument(file);
  if (!saved.ok) return { ok: false, error: saved.error, fieldErrors: { document: saved.error } };
  const v = await prisma.programVerification.create({
    data: {
      studentId,
      programId,
      method: 'DOCUMENT',
      status: 'PENDING',
      documentPath: saved.path,
      documentMime: saved.mime,
      documentName: file.name.slice(0, 120),
      documentType: 'Justificatif',
      declaredLevel: reviewed.level,
      declaredCohort: reviewed.cohortYear,
    },
  });
  // The document is identified by its first verification (shared if it validates others).
  await prisma.programVerification.update({ where: { id: v.id }, data: { documentId: v.id } });
  await notifyIncoming(
    'document.submitted',
    shortRef('JUS', v.id),
    '/admin/moderation?file=justif',
  );
  return {
    ok: true,
    message: 'Justificatif envoyé. On le vérifie sous 72 h, puis il est supprimé.',
  };
}
