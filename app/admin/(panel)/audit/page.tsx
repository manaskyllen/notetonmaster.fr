import type { Metadata } from 'next';
import { AuditExportButton, AuditList, HideAutomatic } from '@/components/admin/AuditView';
import { ClearFilters, SearchBox, Sel } from '@/components/admin/list';
import { toEntries } from '@/lib/admin/audit-entries';
import {
  AUDIT_CATEGORIES,
  auditQueryString,
  countAudit,
  getAuditPage,
  PERIODS,
  readAuditQuery,
} from '@/lib/admin/audit-query';
import { requireAdmin } from '@/lib/auth/admin';
import { can } from '@/lib/domain/permissions';
import { prisma } from '@/lib/db';
import type { Params } from '@/lib/pagination';

export const metadata: Metadata = { title: 'Journal d’audit' };

const nf = new Intl.NumberFormat('fr-FR');

export default async function AuditPage({ searchParams }: { searchParams: Promise<Params> }) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  // Légal entries for the roles that handle legal requests only.
  const q = readAuditQuery(sp, { legal: can(admin.role, 'legal.manage') });
  const query = auditQueryString(q);
  const [page, total, admins, target] = await Promise.all([
    getAuditPage(q),
    countAudit(q),
    prisma.adminUser.findMany({
      where: { passwordHash: { not: null } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    q.target
      ? prisma.auditLog.findFirst({
          where: { targetId: q.target },
          select: { targetLabel: true },
          orderBy: { at: 'desc' },
        })
      : null,
  ]);
  const entries = await toEntries(page.rows);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-[13px] text-ink-muted">Traçabilité</span>
          <h1 className="m-0 font-display text-[34px] leading-[1.05] font-extrabold tracking-[-0.03em]">
            Journal d’audit
          </h1>
        </div>
        {can(admin.role, 'audit.export') && <AuditExportButton query={query} />}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <SearchBox
          key={q.q}
          label="Chercher dans le journal"
          placeholder="Une fiche, une personne, un n° Mon Master…"
          value={q.q}
        />
        <Sel
          param="personne"
          label="Personne"
          value={q.who ?? ''}
          options={[
            { value: '', label: 'Tout le monde' },
            ...admins.map((a) => ({ value: a.id, label: a.name })),
            { value: 'system', label: 'Système' },
          ]}
        />
        <Sel
          param="categorie"
          label="Catégorie"
          value={q.category ? AUDIT_CATEGORIES[q.category].slug : ''}
          options={[
            { value: '', label: 'Toutes les catégories' },
            ...Object.values(AUDIT_CATEGORIES).map((c) => ({ value: c.slug, label: c.label })),
          ]}
        />
        <Sel
          param="periode"
          label="Période"
          value={q.period}
          defaultValue="7"
          options={Object.entries(PERIODS).map(([value, label]) => ({ value, label }))}
        />
        <ClearFilters params={['q', 'personne', 'categorie', 'periode', 'objet']} />
        <HideAutomatic hidden={!q.auto} />
      </div>
      <span role="status" className="text-[13px] text-[#3b3648] dark:text-ink-muted">
        {nf.format(total)} entrée{total > 1 ? 's' : ''}
        {target ? ` sur « ${target.targetLabel} »` : ''} · les plus récentes d’abord
      </span>
      <AuditList key={query} initial={entries} next={page.next} query={query} />
      <p className="m-0 text-[12px] text-ink-muted">
        Le journal ne peut être ni modifié ni supprimé. Conservation : 1 an pour les actions, 5 ans
        pour les demandes légales.
      </p>
    </>
  );
}
