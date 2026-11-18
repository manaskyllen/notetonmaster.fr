import { PageShell } from '@/components/public/PageShell';
import { JsonLd } from '@/components/seo/JsonLd';
import { getBanner } from '@/lib/banner';
import { siteJsonLd } from '@/lib/seo/jsonld';

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  // Information banner: rendered on the server, above the navigation bar (no layout shift)
  const banner = await getBanner();
  return (
    <PageShell banner={banner}>
      <JsonLd data={siteJsonLd()} />
      {children}
    </PageShell>
  );
}
