import type { Metadata } from 'next';
import { QrLinksView } from '@/components/admin/QrLinksView';
import { AdminHeader } from '@/components/admin/ui';
import { requireAdmin } from '@/lib/auth/admin';
import { getOpenZones } from '@/lib/launch/zones';
import { listQrLinks } from '@/lib/qr/links';
import { siteOrigin } from '@/lib/seo/site';

export const metadata: Metadata = { title: 'QR codes' };

const d = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Europe/Paris',
});

/** Short links of the printed QR codes and their scans (issue #17). Admin only. */
export default async function QrPage() {
  await requireAdmin('team.manage');
  const [links, zones] = await Promise.all([listQrLinks(), getOpenZones()]);
  return (
    <>
      <AdminHeader title="QR codes">
        <p className="m-0 max-w-[720px] text-[14px] text-ink-muted">
          Un lien court par support imprimé. Chaque scan ajoute 1 au compteur du jour, puis mène à
          la cible, sans paramètre ajouté. Aucune donnée sur la personne n’est enregistrée.
        </p>
      </AdminHeader>
      <QrLinksView
        origin={siteOrigin()}
        cities={zones.map((z) => ({ slug: z.slug, name: z.name }))}
        rows={links.map((l) => ({
          id: l.id,
          slug: l.slug,
          label: l.label,
          targetPath: l.targetPath,
          created: d.format(l.createdAt),
          archived: !!l.archivedAt,
          total: l.total,
          last7: l.last7,
          last30: l.last30,
        }))}
      />
    </>
  );
}
