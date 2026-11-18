import type { Metadata } from 'next';
import { AdminSidebar, type NavItem } from '@/components/admin/AdminSidebar';
import { ReauthProvider } from '@/components/admin/Reauth';
import { requireAdmin } from '@/lib/auth/admin';
import { adminCounts } from '@/lib/admin/counts';
import { buildSubjects } from '@/lib/admin/overview';
import { can, ROLE_LABEL } from '@/lib/domain/permissions';
import { adminLogout } from '../login/actions';

export const metadata: Metadata = {
  title: { default: 'Administration', template: '%s · Admin · notetonmaster' },
  robots: { index: false },
};
export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  // Counters read in the database, cached 5 minutes (expired by syncs, arbitrations, bulk actions).
  const counts = await adminCounts();
  const mod = counts.moderation;
  const items: NavItem[] = [
    {
      href: '/admin',
      label: 'Vue d’ensemble',
      icon: 'grid',
      count: buildSubjects(counts, admin.role).length,
    },
    {
      href: '/admin/fiches',
      label: 'Fiches',
      icon: 'database',
      count: counts.fichesToHandle,
      tone: 'muted',
    },
    {
      href: '/admin/recuperation',
      label: 'Récupération',
      icon: 'refresh',
      count: counts.collectErrors.total,
      tone: 'danger',
    },
    ...(can(admin.role, 'moderation.manage') || can(admin.role, 'legal.manage')
      ? [
          {
            href: '/admin/moderation',
            label: 'Modération',
            icon: 'flag',
            count: can(admin.role, 'moderation.manage') ? mod.reviews : mod.legal,
          } as NavItem,
        ]
      : []),
    ...(can(admin.role, 'moderation.manage')
      ? [{ href: '/admin/avis', label: 'Avis', icon: 'message' } as NavItem]
      : []),
    { href: '/admin/equipe', label: 'Équipe & rôles', icon: 'users' },
    { href: '/admin/audit', label: 'Journal d’audit', icon: 'history' },
    ...(can(admin.role, 'team.manage') || can(admin.role, 'data.edit')
      ? [{ href: '/admin/parametres', label: 'Paramètres', icon: 'settings' } as NavItem]
      : []),
  ];
  return (
    <div className="flex min-h-screen bg-surface-50 text-[14px] text-ink max-lg:flex-col lg:bg-[linear-gradient(to_right,#16131f_236px,var(--surface-50)_236px)]">
      <a
        href="#admin-main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-pill focus:bg-lime-400 focus:px-4 focus:py-3 focus:text-on-lime"
      >
        Aller au contenu
      </a>
      <AdminSidebar
        items={items}
        adminName={admin.name}
        roleLabel={ROLE_LABEL[admin.role]}
        logout={adminLogout}
      />
      <main
        id="admin-main"
        data-density="compact"
        className="box-border flex min-w-0 flex-1 flex-col gap-4.5 px-7 pt-7 pb-14 max-sm:px-4"
      >
        <ReauthProvider>{children}</ReauthProvider>
      </main>
    </div>
  );
}
