import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AdminHeader, Panel } from '@/components/admin/ui';
import { requireAdmin } from '@/lib/auth/admin';
import { qrLinkDetail } from '@/lib/qr/links';
import { siteOrigin } from '@/lib/seo/site';

export const metadata: Metadata = { title: 'QR code' };

const day = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'short',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});
const nf = new Intl.NumberFormat('fr-FR');

/** A short link and its scans per day over the last 90 days (issue #17). */
export default async function QrDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin('team.manage');
  const { id } = await params;
  const detail = await qrLinkDetail(id);
  if (!detail) notFound();
  const { link, days, total90 } = detail;
  const host = siteOrigin().replace(/^https?:\/\//, '');
  return (
    <>
      <AdminHeader
        kicker={
          <Link href="/admin/qr" className="font-semibold">
            ← QR codes
          </Link>
        }
        title={link.label}
        actions={
          <>
            <a href={`/admin/qr/${link.id}/code`} download className="font-semibold">
              Télécharger en SVG
            </a>
            <a href={`/admin/qr/${link.id}/code?format=png`} download className="font-semibold">
              PNG
            </a>
          </>
        }
      >
        <p className="m-0 font-mono text-[13px] break-all text-ink-muted">
          {host}/q/{link.slug} → {link.archivedAt ? '/ (archivé)' : link.targetPath}
        </p>
      </AdminHeader>
      <Panel title={`Scans des 90 derniers jours : ${nf.format(total90)}`}>
        {days.length === 0 ? (
          <p className="m-0 text-ink-muted">Aucun scan sur cette période.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full max-w-[420px] border-collapse text-[14px]">
              <caption className="sr-only">Scans par jour (jours avec au moins un scan)</caption>
              <thead>
                <tr>
                  <th scope="col" className="border-b border-border px-3 py-2 text-left">
                    Jour
                  </th>
                  <th scope="col" className="border-b border-border px-3 py-2 text-right">
                    Scans
                  </th>
                </tr>
              </thead>
              <tbody>
                {days.map((x) => (
                  <tr key={x.day}>
                    <td className="border-b border-border px-3 py-2">
                      <time dateTime={x.day}>{day.format(new Date(`${x.day}T00:00:00Z`))}</time>
                    </td>
                    <td className="border-b border-border px-3 py-2 text-right font-bold tabular-nums">
                      {nf.format(x.count)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="m-0 text-[13px] text-ink-muted">
          Les jours sans scan ne sont pas listés. Un scan est compté sans aucune donnée sur la
          personne : ni adresse IP, ni appareil, ni provenance.
        </p>
      </Panel>
    </>
  );
}
