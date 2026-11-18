import { audit } from '@/lib/audit';
import { auditBatches, AUDIT_CATEGORIES, readAuditQuery } from './audit-query';
import { csvLine } from './fiche-query';
import { EXPORT_DIRECT_MAX, type BulkResult } from './bulk';

/**
 * CSV export of the audit log selection (filters of the page), run by the worker: downloaded by
 * the page up to 1 000 lines, sent by mail beyond. The export itself is audited.
 */
export const AUDIT_EXPORT_JOB = 'AUDIT_EXPORT';

export interface AuditExportPayload {
  query: string;
  /** Légal entries included (role with legal.manage, decided when the export was asked). */
  legal?: boolean;
  actor: { id: string; name: string; email: string };
}

const at = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  dateStyle: 'short',
  timeStyle: 'medium',
});

export async function runAuditExport(jobId: string, p: AuditExportPayload): Promise<BulkResult> {
  const { prisma } = await import('@/lib/db');
  const q = readAuditQuery(Object.fromEntries(new URLSearchParams(p.query)), {
    legal: p.legal === true,
  });
  const lines = [
    csvLine([
      'Date',
      'Personne',
      'Catégorie',
      'Action',
      'Objet',
      'Détail',
      'Avant / après',
      'IP',
      'Session',
    ]),
  ];
  let n = 0;
  for await (const rows of auditBatches(q)) {
    for (const r of rows)
      lines.push(
        csvLine([
          at.format(r.at),
          r.actorLabel,
          AUDIT_CATEGORIES[r.category].label,
          r.action,
          r.targetLabel,
          r.detail,
          (r.diff ?? []).map((d) => `${d.field} : ${d.before} → ${d.after}`).join(' | '),
          r.ip ?? '',
          r.sessionRef ?? '',
        ]),
      );
    n += rows.length;
    await prisma.job.update({ where: { id: jobId }, data: { progress: n } });
  }
  await prisma.job.update({ where: { id: jobId }, data: { progress: n, total: n } });
  const csv = '﻿' + lines.join('\r\n') + '\r\n';
  await audit(p.actor, 'SETTINGS', 'Journal d’audit', `Export CSV (${n} lignes)`, {
    action: 'a exporté',
    target: { type: 'AUDIT', id: null },
  });
  if (n <= EXPORT_DIRECT_MAX)
    return { summary: `${n} entrée${n > 1 ? 's' : ''} exportée${n > 1 ? 's' : ''}`, csv };
  const { sendMail } = await import('@/lib/mail/send');
  const { adminExportMail } = await import('@/emails/templates');
  await sendMail(p.actor.email, adminExportMail('journal d’audit', n), [
    {
      filename: `journal-audit-${new Date().toISOString().slice(0, 10)}.csv`,
      content: csv,
      contentType: 'text/csv',
    },
  ]);
  return { summary: `${n} entrées exportées · fichier envoyé à ${p.actor.email}`, mailed: true };
}
