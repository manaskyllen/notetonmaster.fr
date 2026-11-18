import type { Metadata } from 'next';
import { ReviewForm } from '@/components/public/ReviewForm';
import { getCurrentStudent } from '@/lib/auth/student';
import { decrypt } from '@/lib/crypto';
import { prisma } from '@/lib/db';
import { splitParcoursTitle } from '@/lib/domain/titles';
import { draftOwnerOf } from '@/lib/review-draft-owner';

export const metadata: Metadata = {
  title: 'Donner mon avis',
  robots: { index: false, follow: false },
  description:
    'Donne ton avis sur ton master en 3 minutes, avec ou sans compte. Anonyme et relu avant publication.',
};
export const dynamic = 'force-dynamic';

export default async function NewReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ parcours?: string }>;
}) {
  const [{ parcours }, student] = await Promise.all([searchParams, getCurrentStudent()]);
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
        initialProgram={options.some((o) => o.slug === parcours) ? parcours : undefined}
        accountEmail={student ? decrypt(student.emailEnc) : null}
        draftOwner={student ? draftOwnerOf(student.id) : null}
      />
    </main>
  );
}
