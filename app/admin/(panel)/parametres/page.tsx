import type { Metadata } from 'next';
import { SettingsForm, type SettingsValues } from '@/components/admin/SettingsForm';
import { BannerForm } from '@/components/admin/BannerForm';
import { ZonesForm } from '@/components/admin/ZonesForm';
import { zoneRows, zoneSummary } from '@/lib/launch/admin';
import { DEFAULT_BANNER, toParisDay } from '@/lib/domain/banner';
import { AdminHeader } from '@/components/admin/ui';
import { frequencyOf } from '@/lib/admin/frequency';
import { redirect } from 'next/navigation';
import { ParametresTabs } from '@/components/admin/ParametresTabs';
import { requireAdmin } from '@/lib/auth/admin';
import { can } from '@/lib/domain/permissions';
import { prisma } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { FIXED_SETTINGS } from '@/lib/settings-defaults';
import { contactEmail } from '@/lib/contact';

export const metadata: Metadata = { title: 'Paramètres' };

export default async function ParametresPage({
  searchParams,
}: {
  searchParams: Promise<{ onglet?: string }>;
}) {
  const { onglet } = await searchParams;
  const admin = await requireAdmin('dashboard.view');
  // Paramètres is the Admin's (the Données role had the calendar and the cost of living, both removed)
  if (!can(admin.role, 'team.manage')) redirect('/admin?refus=1');
  const [settings, sources, banner, zones, summary] = await Promise.all([
    getSettings(),
    prisma.dataSource.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.siteBanner.findFirst({ orderBy: { updatedAt: 'desc' } }),
    zoneRows(),
    zoneSummary(),
  ]);
  const b = banner ?? { ...DEFAULT_BANNER, startsAt: new Date(), endsAt: null };
  return (
    <>
      <AdminHeader
        title="Paramètres"
        kicker="Chaque modification est enregistrée dans le journal d’audit"
      />
      <ParametresTabs current="reglages" showSettings />
      <SettingsForm
        initialTab={onglet}
        initial={settings as unknown as SettingsValues}
        sources={sources.map((s) => ({
          key: s.key,
          name: s.name,
          note: s.blockedReason ?? s.method,
          freq: frequencyOf(s.enabled, s.schedule),
          locked: !!s.blockedReason,
        }))}
        zonesTab={<ZonesForm zones={zones} summary={summary} />}
        bannerTab={
          <BannerForm
            version={banner?.updatedAt.toISOString() ?? 'new'}
            initial={{
              active: b.active,
              tone: b.tone,
              message: b.message,
              linkLabel: b.linkLabel ?? '',
              linkUrl: b.linkUrl ?? '',
              startsAt: toParisDay(b.startsAt),
              endsAt: b.endsAt ? toParisDay(b.endsAt) : '',
              scope: b.scope,
              dismissible: b.dismissible,
            }}
          />
        }
        fixed={{
          contactEmail: contactEmail(),
          connectionLogs: FIXED_SETTINGS.connectionLogRetention,
          documents: FIXED_SETTINGS.documentRetention,
          messages: `Supprimés ${FIXED_SETTINGS.messageRetentionMonths} mois après le dernier échange`,
        }}
      />
    </>
  );
}
