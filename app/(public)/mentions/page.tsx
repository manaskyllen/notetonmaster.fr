import type { Metadata } from 'next';
import { MentionsBrowser } from '@/components/catalog/MentionsBrowser';
import { Container, SourceLine } from '@/components/public/PageShell';
import { BrandName } from '@/components/ui/BrandName';
import { MENTION_SORTS, type MentionSort } from '@/lib/catalog/index-labels';
import { mentionIndex } from '@/lib/catalog/indexes';
import type { Params } from '@/lib/pagination';
import { zonesLabel } from '@/lib/launch/zones';
import { listIndexing, seoMetadata } from '@/lib/seo/meta';
import { getDomains } from '@/lib/queries/catalog';

/** Filters of the list (?domaine=, ?ville=, ?tri=, ?q=): noindex, follow, canonical /mentions. */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Params>;
}): Promise<Metadata> {
  const [sp, { entries, zones }] = await Promise.all([searchParams, mentionIndex()]);
  const { noindex } = listIndexing('/mentions', sp);
  return seoMetadata({
    title: 'Les mentions de master : parcours et avis | notetonmaster',
    description: `Les ${entries.length} mentions de master proposées ${zones.length > 3 ? `dans ${zones.length} villes` : `à ${zonesLabel(zones.map((z) => z.name))}`}, de l’informatique au droit : parcours, villes et note moyenne des avis d’étudiant·es.`,
    canonical: '/mentions',
    noindex,
  });
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

/**
 * Every mention that has a published parcours in an open city, in one
 * list rendered here from a cached query and filtered in the browser. No pagination and no
 * letter bar: the filter field, the domains and the city find a mention.
 */
export default async function MentionsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const [sp, { entries, zones }, domains] = await Promise.all([
    searchParams,
    mentionIndex(),
    getDomains(),
  ]);
  const tri = one(sp.tri);
  const domaine = one(sp.domaine);
  const ville = one(sp.ville);
  return (
    <main>
      <Container className="flex flex-col gap-5.5 pt-9 pb-10">
        <MentionsBrowser
          entries={entries}
          zones={zones}
          domains={domains.map((d) => ({ slug: d.slug, name: d.name, tone: d.tone }))}
          initial={{
            q: one(sp.q).slice(0, 120),
            domaine: domains.some((d) => d.slug === domaine) ? domaine : null,
            ville: zones.some((z) => z.slug === ville) ? ville : null,
            tri: MENTION_SORTS.some((s) => s.id === tri) ? (tri as MentionSort) : 'az',
          }}
        />
        <SourceLine>
          Seules les mentions qui ont au moins un parcours publié dans une ville ouverte
          apparaissent. Notes : moyenne des avis publiés sur <BrandName size="sm" />.
        </SourceLine>
      </Container>
    </main>
  );
}
