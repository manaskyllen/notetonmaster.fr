import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { audit } from '@/lib/audit';
import { ForbiddenError, requireRole } from '@/lib/auth/admin';
import { prisma } from '@/lib/db';
import { documentFullPath } from '@/lib/uploads';

export const dynamic = 'force-dynamic';

/** Streams a verification document to a moderator. Never public, never cached. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  let admin;
  try {
    admin = await requireRole('moderation.manage');
  } catch (e) {
    if (e instanceof ForbiddenError) return new Response('Forbidden', { status: 403 });
    throw e;
  }
  const { id } = await ctx.params;
  const v = await prisma.programVerification.findUnique({ where: { id } });
  if (!v?.documentPath) return new Response('Document supprimé ou introuvable', { status: 404 });
  const path = documentFullPath(v.documentPath);
  const info = await stat(path).catch(() => null);
  if (!info) return new Response('Document introuvable', { status: 404 });
  await audit(
    admin,
    'MODERATION',
    `Justificatif ${v.documentType ?? ''}`.trim(),
    'Document consulté',
  );
  return new Response(Readable.toWeb(createReadStream(path)) as ReadableStream, {
    headers: {
      'Content-Type': v.documentMime ?? 'application/octet-stream',
      'Content-Length': String(info.size),
      'Content-Disposition': 'inline; filename="justificatif"',
      'Cache-Control': 'no-store, private',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy':
        "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
