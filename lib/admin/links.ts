import { prisma } from '@/lib/db';

/** Resolves alert links like "program:slug" / "mention:slug" to admin URLs. */
export async function resolveAdminLink(link: string | null): Promise<string | null> {
  if (!link) return null;
  const [kind, slug] = link.split(':');
  if (kind === 'program' && slug) {
    const p = await prisma.program.findUnique({ where: { slug }, select: { id: true } });
    return p ? `/admin/fiches/${p.id}` : '/admin/fiches';
  }
  if (kind === 'mention' && slug) {
    const m = await prisma.mention.findUnique({ where: { slug }, select: { id: true } });
    return m ? `/admin/fiches?sel=${m.id}` : '/admin/fiches';
  }
  return link;
}

/** ISO week number (S46). */
export function isoWeek(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}
