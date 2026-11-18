import type { Metadata } from 'next';
import { TeamManager } from '@/components/admin/TeamManager';
import { AdminHeader } from '@/components/admin/ui';
import { requireAdmin } from '@/lib/auth/admin';
import { prisma } from '@/lib/db';
import { can, PERMISSION_LABEL, PERMISSIONS, ROLE_LABEL, ROLES } from '@/lib/domain/permissions';
import { formatDateShort, formatRelative } from '@/lib/format';

export const metadata: Metadata = { title: 'Équipe & rôles' };

export default async function EquipePage() {
  const admin = await requireAdmin();
  const members = await prisma.adminUser.findMany({
    where: { removedAt: null },
    orderBy: [{ passwordHash: { sort: 'desc', nulls: 'last' } }, { createdAt: 'asc' }],
  });
  return (
    <>
      <AdminHeader kicker={`${members.length} membre(s) et invitation(s)`} title="Équipe & rôles" />
      <TeamManager
        canManage={can(admin.role, 'team.manage')}
        members={members.map((m) => ({
          id: m.id,
          name: m.name,
          email: m.email,
          role: m.role,
          twofa: !m.passwordHash ? 'pending' : m.totpEnabledAt ? 'on' : 'off',
          last: !m.passwordHash
            ? `Envoyée le ${m.invitedAt ? formatDateShort(m.invitedAt) : '?'}`
            : m.lastLoginAt
              ? formatRelative(m.lastLoginAt)
              : 'Jamais connecté·e',
          me: m.id === admin.id,
        }))}
      />
      <section
        aria-labelledby="perm-title"
        className="flex flex-col gap-3 rounded-lg border border-border bg-surface-0 p-5"
      >
        <h2 id="perm-title" className="m-0 font-display text-[22px] font-extrabold">
          Permissions par rôle
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-[14px]">
            <caption className="sr-only">Matrice des permissions</caption>
            <thead>
              <tr>
                <th
                  scope="col"
                  className="border-b border-border px-3 py-2.5 text-left text-[11px] font-bold tracking-[0.05em] text-ink-muted uppercase"
                >
                  Action
                </th>
                {ROLES.map((r) => (
                  <th
                    key={r}
                    scope="col"
                    className="border-b border-border px-3 py-2.5 text-center text-[11px] font-bold tracking-[0.05em] text-ink-muted uppercase"
                  >
                    {ROLE_LABEL[r]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERMISSIONS.map((p) => (
                <tr key={p}>
                  <th
                    scope="row"
                    className="border-b border-border px-3 py-2.5 text-left font-medium"
                  >
                    {PERMISSION_LABEL[p]}
                  </th>
                  {ROLES.map((r) => (
                    <td key={r} className="border-b border-border px-3 py-2.5 text-center">
                      {can(r, p) ? (
                        <span className="inline-flex size-7 items-center justify-center rounded-pill bg-success-bg font-bold text-success">
                          ✓<span className="sr-only">Autorisé</span>
                        </span>
                      ) : (
                        <span className="inline-flex size-7 items-center justify-center rounded-pill bg-surface-100 text-ink-muted">
                          –<span className="sr-only">Non autorisé</span>
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="m-0 text-[12px] text-ink-muted">
          Ces droits sont vérifiés côté serveur pour chaque action, pas seulement dans l’interface.
        </p>
      </section>
    </>
  );
}
