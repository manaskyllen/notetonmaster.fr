import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getVoterKey } from '@/lib/voter';

export const dynamic = 'force-dynamic';

const body = z.object({ ids: z.array(z.string().cuid()).min(1).max(50) });

/**
 * Reads of reviews (« Lectures de tes avis » in Mon espace): once per visitor (hashed cookie
 * key, no personal data) and per day. Called by the program page once it is displayed.
 */
export async function POST(req: NextRequest) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });
  const viewerKey = await getVoterKey(true);
  if (!viewerKey) return NextResponse.json({ ok: false }, { status: 400 });
  const day = new Date(new Date().toISOString().slice(0, 10));
  const published = await prisma.review.findMany({
    where: { id: { in: parsed.data.ids }, status: 'PUBLISHED' },
    select: { id: true },
  });
  for (const { id } of published) {
    const r = await prisma.reviewView.createMany({
      data: [{ reviewId: id, day, viewerKey }],
      skipDuplicates: true,
    });
    if (r.count)
      await prisma.review.update({ where: { id }, data: { viewCount: { increment: 1 } } });
  }
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
