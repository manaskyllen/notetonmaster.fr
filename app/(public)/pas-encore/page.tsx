import type { Metadata } from 'next';
import Link from 'next/link';
import { NotYetOpen } from '@/components/launch/OpenCities';
import { buttonClasses } from '@/components/ui';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Pas encore sur notetonmaster',
  robots: { index: false, follow: false },
};

type Kind = 'parcours' | 'mention' | 'universite';

/** The name of what was asked (never indexed: this page answers 404, see proxy.ts). */
async function nameOf(kind: Kind, slug: string): Promise<string | null> {
  if (kind === 'parcours')
    return (
      (await prisma.program.findUnique({ where: { slug }, select: { title: true } }))?.title ?? null
    );
  if (kind === 'mention')
    return (
      (await prisma.mention.findUnique({ where: { slug }, select: { name: true } }))?.name ?? null
    );
  return (
    (await prisma.university.findUnique({ where: { slug }, select: { name: true } }))?.name ?? null
  );
}

const LEAD: Record<Kind, string> = {
  parcours: 'Ce master',
  mention: 'Cette mention',
  universite: 'Cet établissement',
};

/**
 * « Pas encore sur notetonmaster »: the address of a parcours, a mention or a university outside
 * the open cities. Reached by a rewrite of proxy.ts, which answers 404 with this page and keeps
 * the address. Names the element and says why it is not there yet.
 */
export default async function NotYetPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; slug?: string; ville?: string }>;
}) {
  const sp = await searchParams;
  const kind: Kind = sp.type === 'mention' || sp.type === 'universite' ? sp.type : 'parcours';
  const name = sp.slug ? await nameOf(kind, sp.slug.slice(0, 200)) : null;
  return (
    <main className="mx-auto box-border flex w-full max-w-[860px] flex-1 flex-col gap-6 px-6 py-14 max-sm:px-4">
      <NotYetOpen
        place={sp.ville ? sp.ville.slice(0, 80) : name ? `« ${name} »` : LEAD[kind]}
        headingLevel={1}
      />
      <div className="flex flex-wrap justify-center gap-2.5">
        <Link href="/" className={buttonClasses('night')}>
          Accueil
        </Link>
        <Link href="/explorer" className={buttonClasses('outline')}>
          Explorer les masters
        </Link>
      </div>
    </main>
  );
}
