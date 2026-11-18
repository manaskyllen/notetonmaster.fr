import type { Metadata } from 'next';
import Link from 'next/link';
import { ProposalsBoard } from '@/components/admin/ProposalsBoard';
import { Breadcrumb } from '@/components/ui';
import {
  PAGE_SIZE,
  filterProposals,
  loadProposals,
  notRenewedPrograms,
  type ProposalFilters,
  type ProposalType,
} from '@/lib/admin/proposals';
import { requireAdmin } from '@/lib/auth/admin';
import { can } from '@/lib/domain/permissions';
import { parentCandidates, parentDecisions } from '@/lib/data/parents';
import { prisma } from '@/lib/db';
import { normCode } from '@/lib/data/normalize';

export const metadata: Metadata = { title: 'Rapprochements à valider' };

const num = (v: string | undefined) =>
  v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined;

export default async function RapprochementsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const admin = await requireAdmin('dashboard.view');
  const sp = await searchParams;
  const filters: ProposalFilters = {
    type: (sp.type as ProposalType | undefined) ?? '',
    source: sp.source ?? '',
    university: sp.universite ?? '',
    scoreMin: num(sp.min),
    scoreMax: num(sp.max),
    recommended: sp.recommandees === '1',
    page: Math.max(1, num(sp.page) ?? 1),
  };
  const [{ items, runs }, notRenewed, candidates, decided, unis] = await Promise.all([
    loadProposals(),
    notRenewedPrograms(),
    parentCandidates(),
    parentDecisions(),
    prisma.university.findMany({ select: { uai: true, parentId: true } }),
  ]);
  const uniByUai = new Map(unis.filter((u) => u.uai).map((u) => [normCode(u.uai!), u]));
  const parents = candidates
    .filter(
      (c) => !decided.has(normCode(c.childUai!)) && !uniByUai.get(normCode(c.childUai!))?.parentId,
    )
    .map((c) => ({
      childUai: c.childUai!,
      childName: c.childName,
      parentUai: c.parentUai,
      parentName: c.parentName,
      strength: c.strength,
      evidence: c.evidence,
      exists: uniByUai.has(normCode(c.childUai!)) && uniByUai.has(normCode(c.parentUai)),
    }));
  const filtered = filterProposals(items, filters);
  const page = filtered.slice((filters.page! - 1) * PAGE_SIZE, filters.page! * PAGE_SIZE);
  const counts = {
    total: items.length,
    succession: items.filter((i) => i.type === 'succession').length,
    merge: items.filter((i) => i.type === 'merge').length,
    university: items.filter((i) => i.type === 'university').length,
    recommended: items.filter((i) => i.recommended).length,
  };
  return (
    <>
      <Breadcrumb
        items={[
          { label: 'Récupération', href: '/admin/recuperation' },
          { label: 'Rapprochements à valider' },
        ]}
      />
      <div className="flex flex-col gap-1">
        <span className="text-[13px] text-ink-muted">
          {counts.total} propositions · {counts.succession} successions · {counts.merge} fusions (
          {counts.recommended} recommandées) · {counts.university} universités
        </span>
        <h1 className="m-0 font-display text-[36px] leading-[1.05] font-extrabold tracking-[-0.03em]">
          Rapprochements à valider
        </h1>
        <p className="m-0 max-w-[70ch] text-[14px] text-ink-muted">
          Rien n’est rattaché ni fusionné sans décision. Une décision est mémorisée et s’applique
          aux synchros suivantes ; après un lot de décisions, recalculez la simulation avant
          d’appliquer. <Link href="/admin/recuperation">Retour à la récupération</Link>
        </p>
      </div>
      <ProposalsBoard
        items={page}
        filteredCount={filtered.length}
        pageSize={PAGE_SIZE}
        filters={filters}
        counts={counts}
        runs={runs
          .filter((r) => !r.appliedAt && r.resumeFromStep === 'publish')
          .map((r) => ({ id: r.id, sourceKey: r.sourceKey }))}
        parents={parents}
        canDecide={can(admin.role, 'data.edit')}
        canRun={can(admin.role, 'sync.run')}
        notRenewed={{
          latest: notRenewed.latest,
          programs: notRenewed.programs.map((p) => ({
            id: p.id,
            title: p.title,
            university: p.university.name,
            reviews: p._count.reviews,
          })),
        }}
      />
    </>
  );
}
