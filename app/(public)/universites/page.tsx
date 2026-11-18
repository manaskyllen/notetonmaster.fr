import type { Metadata } from 'next';
import { UniversitiesBrowser } from '@/components/catalog/UniversitiesBrowser';
import { Container, SourceLine } from '@/components/public/PageShell';
import { BrandName } from '@/components/ui/BrandName';
import { UNIVERSITY_SORTS, type UniversitySort } from '@/lib/catalog/index-labels';
import { universityIndex } from '@/lib/catalog/indexes';
import type { Params } from '@/lib/pagination';
import { zonesLabel } from '@/lib/launch/zones';
import { listIndexing, seoMetadata } from '@/lib/seo/meta';

/** Filters of the list (?type=, ?ville=, ?tri=, ?q=): noindex, follow, canonical /universites. */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Params>;
}): Promise<Metadata> {
  const [sp, { entries, zones }] = await Promise.all([searchParams, universityIndex()]);
  const { noindex } = listIndexing('/universites', sp);
  return seoMetadata({
    title: 'Universités et écoles : leurs masters et avis | notetonmaster',
    description: `Les ${entries.length} universités et établissements publics qui proposent un master ${zones.length > 3 ? `dans ${zones.length} villes` : `à ${zonesLabel(zones.map((z) => z.name))}`} : parcours, mentions et avis d’étudiant·es.`,
    canonical: '/universites',
    noindex,
  });
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

/**
 * Every public establishment that has a published master in an open city, in one
 * grid rendered here from a cached query and filtered in the browser.
 */
export default async function UniversitesPage({ searchParams }: { searchParams: Promise<Params> }) {
  const [sp, { entries, zones }] = await Promise.all([searchParams, universityIndex()]);
  const tri = one(sp.tri);
  const type = one(sp.type);
  const ville = one(sp.ville);
  return (
    <main>
      <Container className="flex flex-col gap-5.5 pt-9 pb-10">
        <UniversitiesBrowser
          entries={entries}
          zones={zones}
          initial={{
            q: one(sp.q).slice(0, 120),
            type: type === 'univ' || type === 'ecole' ? type : null,
            ville: zones.some((z) => z.slug === ville) ? ville : null,
            tri: UNIVERSITY_SORTS.some((s) => s.id === tri) ? (tri as UniversitySort) : 'masters',
          }}
        />
        <SourceLine>
          Établissements publics ayant au moins un master publié dans une ville ouverte. Noms
          d’usage de l’annuaire de l’enseignement supérieur. Notes : moyenne des avis publiés sur{' '}
          <BrandName size="sm" />.
        </SourceLine>
      </Container>
    </main>
  );
}
