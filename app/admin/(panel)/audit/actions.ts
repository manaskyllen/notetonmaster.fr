'use server';

import { guard, guardSensitive } from '@/lib/auth/admin';
import { can } from '@/lib/domain/permissions';
import { prisma } from '@/lib/db';

/** « Exporter la sélection (CSV) »: queued for the worker (progress through bulkStatus). */
export async function startAuditExport(query: string) {
  // Admin and Légal only, after confirming the code (export of personal data).
  return guardSensitive('audit.export', async (admin) => {
    const { AUDIT_EXPORT_JOB } = await import('@/lib/admin/audit-export');
    const job = await prisma.job.create({
      data: {
        type: AUDIT_EXPORT_JOB,
        payload: {
          query: query.slice(0, 2000),
          legal: can(admin.role, 'legal.manage'),
          actor: { id: admin.id, name: admin.name, email: admin.email },
        },
        createdById: admin.id,
      },
    });
    return { ok: true as const, jobId: job.id };
  });
}

/** « Entrées plus anciennes »: the next page, by cursor. */
export async function loadAuditPage(query: string, before: string) {
  return guard('dashboard.view', async (admin) => {
    const { getAuditPage, readAuditQuery } = await import('@/lib/admin/audit-query');
    const { toEntries } = await import('@/lib/admin/audit-entries');
    const q = readAuditQuery(Object.fromEntries(new URLSearchParams(query)), {
      legal: can(admin.role, 'legal.manage'),
    });
    const page = await getAuditPage(q, before || null);
    return { ok: true as const, entries: await toEntries(page.rows), next: page.next };
  });
}
