import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ModerationBoard } from '@/components/admin/ModerationBoard';
import { Pagination } from '@/components/ui/Pagination';
import { buildQueues, QUEUE_PER_PAGE, queueCounts, type QueueKind } from '@/lib/admin/moderation';
import { requireAdmin } from '@/lib/auth/admin';
import { can } from '@/lib/domain/permissions';
import { readPage, type Params } from '@/lib/pagination';

export const metadata: Metadata = { title: 'Modération' };

export default async function ModerationPage({ searchParams }: { searchParams: Promise<Params> }) {
  const admin = await requireAdmin();
  const canMod = can(admin.role, 'moderation.manage');
  const canLegal = can(admin.role, 'legal.manage');
  if (!canMod && !canLegal) redirect('/admin?refus=1');
  const sp = await searchParams;
  const allowed: QueueKind[] = [
    ...(canMod ? (['avis', 'justif', 'msg', 'signal', 'reponses', 'questions'] as const) : []),
    ...(canLegal ? (['legal'] as const) : []),
  ];
  const file = Array.isArray(sp.file) ? sp.file[0] : sp.file;
  const tab = allowed.find((k) => k === file) ?? allowed[0]!;
  const { page, offset } = readPage(sp, { perPage: QUEUE_PER_PAGE });
  const [items, counts] = await Promise.all([
    buildQueues(canMod, canLegal, { tab, skip: offset, take: QUEUE_PER_PAGE }),
    queueCounts(canMod, canLegal),
  ]);
  return (
    <ModerationBoard
      key={`${tab}|${page}`}
      items={items}
      allowed={allowed}
      tab={tab}
      counts={counts}
      pagination={
        <Pagination
          pathname="/admin/moderation"
          params={{ file: tab }}
          page={page}
          perPage={QUEUE_PER_PAGE}
          total={counts[tab]}
        />
      }
    />
  );
}
