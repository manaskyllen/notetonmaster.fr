import type { Metadata } from 'next';
import { ReviewForm } from '@/components/public/ReviewForm';
import { getCurrentStudent } from '@/lib/auth/student';
import { decrypt } from '@/lib/crypto';
import { prisma } from '@/lib/db';
import { reviewFormTitle, reviewFormUrl } from '@/lib/domain/share';
import { splitParcoursTitle } from '@/lib/domain/titles';
import { getProgram } from '@/lib/queries/catalog';
import { currentProgramSlug } from '@/lib/data/slugs';
import { draftOwnerOf } from '@/lib/review-draft-owner';
import { PRIVATE_ROBOTS, seoMetadata } from '@/lib/seo/meta';
import { reviewFormOgPath } from '@/lib/share-data';
import { siteOrigin } from '@/lib/seo/site';

const DESCRIPTION =
  'Donne ton avis sur ton master en 3 minutes, avec ou sans compte. Anonyme et relu avant publication.';

/**
 * Set on a parcours (?parcours=…, the link « Inviter ma promo à donner son avis » of the fiche):
 * the link previews (WhatsApp, Discord, Messenger…) show « Donne ton avis sur {Parcours} » and
 * the share image of the parcours. Never indexed.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ parcours?: string }>;
}): Promise<Metadata> {
  const { parcours: asked } = await searchParams;
  // A former slug (a cursus merged into its parcours, a link printed before): the parcours.
  const parcours = typeof asked === 'string' && asked ? await currentProgramSlug(asked) : null;
  const p = parcours ? await getProgram(parcours) : null;
  if (!p) return { title: 'Donner mon avis', robots: PRIVATE_ROBOTS, description: DESCRIPTION };
  const title = splitParcoursTitle(p.title).title;
  const meta = seoMetadata({
    title: `${reviewFormTitle(title)} | notetonmaster`,
    description: `${p.university.shortName ?? p.university.name}, ${p.city}. ${DESCRIPTION}`,
    canonical: reviewFormUrl(siteOrigin(), p.slug),
    image: {
      path: reviewFormOgPath(p.slug, title),
      alt: `${reviewFormTitle(title)} – ${p.university.name}, ${p.city}`,
    },
  });
  // No canonical for a page that is not indexed; the preview keeps the address of the form.
  return { ...meta, alternates: undefined, robots: PRIVATE_ROBOTS };
}
export const dynamic = 'force-dynamic';

export default async function NewReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ parcours?: string }>;
}) {
  const [{ parcours: asked }, student] = await Promise.all([searchParams, getCurrentStudent()]);
  const parcours = typeof asked === 'string' && asked ? await currentProgramSlug(asked) : null;
  // Only the program named in the URL: the form searches the others (/api/search).
  const p = parcours
    ? await prisma.program.findFirst({
        where: { slug: parcours, isPublished: true, inOpenZone: true },
        select: {
          slug: true,
          title: true,
          city: true,
          entryLevel: true,
          university: { select: { name: true } },
          component: { select: { name: true } },
          mention: { select: { name: true } },
        },
      })
    : null;
  // « Nantes Université · Nantes · UFR Sociologie » under the chosen master.
  const options = p
    ? [
        {
          slug: p.slug,
          title: splitParcoursTitle(p.title).title,
          subtitle: [
            p.university.name,
            p.city,
            p.component?.name ?? `Mention ${p.mention.name}`,
            p.entryLevel === 'M2' ? 'entrée en M2' : null,
          ]
            .filter(Boolean)
            .join(' · '),
        },
      ]
    : [];
  return (
    <main className="mx-auto box-border w-full max-w-[768px] px-6 pt-8 pb-20">
      <ReviewForm
        programs={options}
        initialProgram={parcours && options.some((o) => o.slug === parcours) ? parcours : undefined}
        accountEmail={student ? decrypt(student.emailEnc) : null}
        draftOwner={student ? draftOwnerOf(student.id) : null}
      />
    </main>
  );
}
