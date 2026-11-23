import type { Metadata } from 'next';
import Link from 'next/link';
import { Container } from '@/components/public/PageShell';
import { DrReply } from '@/components/public/DrReply';
import { DrSteps, ResponseEditor, StaffVerify } from '@/components/public/DroitReponse';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { chipClasses } from '@/components/ui/Chip';
import { Grade } from '@/components/ui/Grade';
import { Pagination } from '@/components/ui/Pagination';
import { ReviewCard, type ReviewLevel } from '@/components/ui/ReviewCard';
import { getCurrentResponder } from '@/lib/auth/staff';
import { prisma } from '@/lib/db';
import type { Prisma } from '@/lib/db/generated/client';
import { authorWho, LEVEL_SHORT } from '@/lib/domain/rating';
import { readPage, type Params } from '@/lib/pagination';
import { staffLogout } from './actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Répondre aux avis (équipes pédagogiques)',
  robots: { index: false, follow: false },
  description:
    'Responsables de formation : répondez publiquement, une fois, aux avis sur vos parcours, après vérification de votre adresse universitaire.',
};

const PER_PAGE = 10;
const monthYear = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const FILTERS = [
  { id: 'tous', label: 'Tous les avis' },
  { id: 'sans-reponse', label: 'Sans réponse' },
  { id: 'ma-reponse', label: 'Ma réponse' },
] as const;

/** /reponse-formation (DroitReponse component). */
export default async function ReponseFormationPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) as string | undefined;
  const responder = await getCurrentResponder();
  const program = one('parcours')
    ? await prisma.program.findUnique({
        where: { slug: one('parcours') },
        select: {
          slug: true,
          title: true,
          university: { select: { id: true, name: true, mailDomains: true } },
        },
      })
    : null;
  const filter = FILTERS.find((f) => f.id === one('filtre'))?.id ?? 'tous';
  const { page, offset } = readPage(sp, { perPage: PER_PAGE });

  let list: React.ReactNode = null;
  if (responder) {
    const where: Prisma.ReviewWhereInput = {
      status: 'PUBLISHED',
      program: { universityId: { in: responder.universityIds } },
      ...(filter === 'sans-reponse'
        ? { OR: [{ response: null }, { response: { status: 'REJECTED' } }] }
        : {}),
      ...(filter === 'ma-reponse' ? { response: { responderId: responder.id } } : {}),
    };
    const [reviews, total] = await Promise.all([
      prisma.review.findMany({
        where,
        orderBy: [{ publishedAt: 'desc' }, { id: 'asc' }],
        skip: offset,
        take: PER_PAGE,
        select: {
          id: true,
          ref: true,
          level: true,
          cohortYear: true,
          overallRating: true,
          title: true,
          pros: true,
          cons: true,
          leaveReason: true,
          isVerified: true,
          publishedAt: true,
          program: { select: { slug: true, title: true } },
          response: { select: { body: true, status: true, reason: true, responderId: true } },
        },
      }),
      prisma.review.count({ where }),
    ]);
    list = (
      <section aria-labelledby="dr-avis" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2
            id="dr-avis"
            className="m-0 font-display text-[26px] font-extrabold tracking-[-0.02em]"
          >
            Les avis sur les parcours de {responder.university.name}
          </h2>
          <nav aria-label="Filtrer les avis" className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <Link
                key={f.id}
                href={f.id === 'tous' ? '/reponse-formation' : `/reponse-formation?filtre=${f.id}`}
                aria-current={filter === f.id ? 'true' : undefined}
                className={chipClasses(filter === f.id, 'filter', 'px-3.5 text-[14px]')}
              >
                {f.label}
              </Link>
            ))}
          </nav>
        </div>
        {reviews.length === 0 && (
          <p className="m-0 rounded-[22px] border border-border bg-surface-0 p-6 text-[15px] text-ink-soft">
            {filter === 'ma-reponse'
              ? 'Vous n’avez encore répondu à aucun avis.'
              : 'Aucun avis à afficher ici pour le moment.'}
          </p>
        )}
        {reviews.map((r) => {
          const mine = r.response?.responderId === responder.id ? r.response : null;
          return (
            <div key={r.id} data-review={r.ref} className="flex flex-col gap-3">
              <Link
                href={`/parcours/${r.program.slug}#${r.ref}`}
                className="text-[14px] font-semibold"
              >
                {r.program.title}
              </Link>
              <ReviewCard
                level={LEVEL_SHORT[r.level] as ReviewLevel}
                who={authorWho(r.level, r.cohortYear)}
                date={r.publishedAt ? monthYear.format(r.publishedAt) : ''}
                rating={r.overallRating}
                title={r.title}
                plus={r.pros}
                minus={r.cons}
                leaveReason={r.level === 'LEFT' ? r.leaveReason : null}
                verified={r.isVerified}
              />
              <ResponseEditor
                reviewId={r.id}
                mine={mine ? { body: mine.body, status: mine.status, reason: mine.reason } : null}
                taken={!!r.response && !mine && r.response.status !== 'REJECTED'}
              />
            </div>
          );
        })}
        <Pagination
          pathname="/reponse-formation"
          params={{ filtre: filter === 'tous' ? undefined : filter }}
          page={page}
          perPage={PER_PAGE}
          total={total}
          targetId="dr-avis"
        />
      </section>
    );
  }

  const step = responder ? 1 : 0;
  return (
    <main>
      <Container className="flex flex-col gap-6 pt-7 pb-20">
        <Breadcrumb
          items={[
            { label: 'Accueil', href: '/' },
            { label: 'Répondre aux avis (équipes pédagogiques)' },
          ]}
        />
        <h1 className="m-0 font-display text-[clamp(32px,4vw,48px)] leading-[1.05] font-extrabold tracking-[-0.03em]">
          Droit de réponse de l’équipe pédagogique
        </h1>

        <div className="flex flex-wrap items-start gap-5.5">
          <section
            aria-label="Ce que voient les visiteurs"
            className="flex min-w-0 flex-[1_1_520px] flex-col gap-3"
          >
            <span className="text-[12px] font-bold tracking-[0.08em] text-ink-muted uppercase">
              Aperçu · ce que voient les visiteurs (exemple)
            </span>
            <article className="flex flex-col gap-3.5 rounded-[26px] border border-border bg-surface-0 p-6 max-sm:p-4.5">
              <div className="flex flex-wrap items-center gap-2.5">
                <Grade value={2} size="m" />
                <span className="flex flex-col gap-0.5">
                  <span className="text-[15px] font-bold">M2 · promo 2024</span>
                  <span className="text-[13px] text-ink-muted">Publié le 4 sept. 2025</span>
                </span>
                <span className="ml-auto rounded-pill bg-violet-100 px-2.5 py-1 text-[12px] font-bold text-violet-700">
                  Parcours vérifié
                </span>
              </div>
              <p className="m-0 text-[15px] leading-[1.6]">
                Le voyage d’étude annoncé dans le livret a été remplacé par deux sorties à la
                journée. Personne ne nous a expliqué pourquoi, et on l’a appris en novembre.
              </p>
              <DrReply
                domain="univ-nantes.fr"
                date="12 sept. 2025"
                body="Merci pour ce retour. Le voyage n’a pas pu être financé en 2024. Il est rétabli pour la promotion 2025, et les étudiant·es sont prévenu·es dès la rentrée."
              />
              <span className="text-[13px] text-ink-muted">
                Une seule réponse par avis. L’avis n’est jamais modifié ni retiré par une réponse.
              </span>
            </article>
          </section>

          <section
            aria-labelledby="dr-form"
            className="flex min-w-0 flex-[1_1_420px] flex-col gap-3"
          >
            <span className="text-[12px] font-bold tracking-[0.08em] text-ink-muted uppercase">
              Ce que voit la formation
            </span>
            <div className="flex flex-col gap-4.5 rounded-[26px] border border-border bg-surface-0 p-6 max-sm:p-4.5">
              <h2 id="dr-form" className="m-0 font-display text-[22px] font-bold">
                Vous êtes responsable de cette formation ?
              </h2>
              <DrSteps current={step} />
              {responder ? (
                <div className="flex flex-col gap-2.5 text-[14px] leading-[1.5]">
                  <p className="m-0">
                    Adresse vérifiée <strong>@{responder.domain}</strong> pour{' '}
                    <strong>{responder.university.name}</strong>
                    {responder.verifiedAt
                      ? ` (jusqu’au ${new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(responder.verifiedAt.getTime() + 365 * 864e5))})`
                      : ''}
                    . Choisissez un avis ci-dessous pour y répondre.
                  </p>
                  <form action={staffLogout}>
                    <button
                      type="submit"
                      className="min-h-10 cursor-pointer border-0 bg-transparent p-0 text-[14px] font-semibold text-violet-700 underline"
                    >
                      Ce n’est pas moi : se déconnecter
                    </button>
                  </form>
                </div>
              ) : program ? (
                <>
                  <p className="m-0 text-[14px] leading-[1.5] text-ink-soft">
                    Pour <strong>{program.title}</strong> ({program.university.name}) : un code est
                    envoyé à votre adresse professionnelle. Elle n’est pas conservée, seule une
                    empreinte sert à vous reconnaître pendant 12 mois.
                  </p>
                  <StaffVerify
                    universityId={program.university.id}
                    universityName={program.university.name}
                    domains={program.university.mailDomains}
                  />
                </>
              ) : (
                <p className="m-0 text-[14px] leading-[1.5] text-ink-soft">
                  Ouvrez cette page depuis la fiche de votre parcours : encart « Vous êtes
                  responsable de ce parcours ? » en bas de la colonne de droite.{' '}
                  <Link href="/explorer">Trouver le parcours</Link>
                </p>
              )}
              <p className="m-0 rounded-[16px] bg-surface-50 px-4 py-3 text-[13px] leading-[1.5] text-ink-soft">
                Ce service est distinct du droit de réponse prévu par la loi. Pour une demande
                formelle (retrait, droit de réponse légal), passez par{' '}
                <Link href="/signaler?mode=retrait">« Signaler un contenu »</Link> : elle est
                traitée par l’équipe juridique.
              </p>
            </div>
          </section>
        </div>
        {list}
      </Container>
    </main>
  );
}
