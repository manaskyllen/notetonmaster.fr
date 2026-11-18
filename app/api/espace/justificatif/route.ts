import { revalidatePath } from 'next/cache';
import { getCurrentStudent } from '@/lib/auth/student';
import { DOCUMENT_MAX_BYTES } from '@/lib/domain/verification';
import { submitDocument } from '@/lib/verification-upload';

export const dynamic = 'force-dynamic';

/** Room for the multipart envelope around a 10 MB file. */
const MAX_BODY = DOCUMENT_MAX_BYTES + 1024 * 1024;

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

/**
 * Proof of study of the logged-in student (Mon espace › Vérification). Its own route because
 * Server Actions accept 1 MB at most; the origin is checked by proxy.ts like every API write.
 */
export async function POST(req: Request) {
  const announced = Number(req.headers.get('content-length') ?? 0);
  if (announced > MAX_BODY)
    return json({ ok: false, error: 'Fichier trop lourd (10 Mo maximum).' }, 413);
  const student = await getCurrentStudent();
  if (!student) return json({ ok: false, error: 'Ta session a expiré : reconnecte-toi.' }, 401);
  let fd: FormData;
  try {
    fd = await req.formData();
  } catch {
    return json({ ok: false, error: 'Envoi illisible : réessaie.' }, 400);
  }
  const r = await submitDocument(student.id, fd);
  if (r.ok) revalidatePath('/espace', 'layout');
  return json(r, r.ok ? 200 : 400);
}
