import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect, redirect } from 'next/navigation';
import { AdmissionEvolution } from '@/components/public/AdmissionEvolution';
import { AdmissionOrigins } from '@/components/public/AdmissionOrigins';
import { datasetUrl } from '@/lib/connectors/monmaster-opendata/urls';
import { FollowButton } from '@/components/public/FollowButton';
import { followedSet } from '@/lib/favorites';
import { after } from 'next/server';
import { QuestionsPanel } from '@/components/public/QuestionsPanel';
import { getCurrentResponder } from '@/lib/auth/staff';
import { QUESTION_SORTS, QUESTIONS_PER_PAGE, type QuestionSort } from '@/lib/domain/questions';
import { accountVoterKey, answerRight, getQuestionsPage } from '@/lib/questions';
import { Container } from '@/components/public/PageShell';
import { ParcoursTabs } from '@/components/public/ParcoursTabs';
import { ProgrammePanel } from '@/components/public/ProgrammePanel';
import { ProgramCard } from '@/components/catalog/ProgramCard';
import { ficheSources } from '@/lib/catalog/fiche-identity';
import { sameMentionElsewhere } from '@/lib/catalog/same-mention';
import { CATEGORY_BY_ID, categoryLabel, COURSE_CATEGORIES } from '@/lib/domain/course-categories';
import {
  isStaleProgramme,
  milestoneCategory,
  outlineYears,
  presentCategories,
  programmeFacts,
  type OutlineSemester,
} from '@/lib/domain/program-outline';
import { ReviewList, type ReviewItem } from '@/components/public/ReviewList';
import { ReviewsSummaryButton } from '@/components/public/ReviewsSummaryButton';
import { visibleReviewFilters } from '@/lib/domain/review-filters';
import { splitParcoursTitle } from '@/lib/domain/titles';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { buttonClasses, CtaArrow, ctaClasses } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { ScoreBar } from '@/components/ui/ScoreBar';
import { getCurrentStudent } from '@/lib/auth/student';
import { prisma } from '@/lib/db';
import { authorWho, CRITERION_LABEL } from '@/lib/domain/rating';
import { formatDate, formatInt } from '@/lib/format';
import {
  getProgram,
  getReviewSummary,
  getReviewPage,
  REVIEW_LEVELS,
  REVIEW_SORTS,
  REVIEWS_PER_PAGE,
  type ReviewLevelFilter,
  type ReviewSort,
} from '@/lib/queries/catalog';
import { getEvolution } from '@/lib/queries/evolution';
import { getSetting } from '@/lib/settings';
import { MODALITY_LABEL } from '@/lib/ui-helpers';
import { cn } from '@/lib/cn';
import { getVoterKey } from '@/lib/voter';
import { JsonLd } from '@/components/seo/JsonLd';
import { programPlace } from '@/lib/catalog/cities';
import { parcoursHomonyms } from '@/lib/catalog/homonyms';
import { pageJsonLd, programJsonLd } from '@/lib/seo/jsonld';
import { seoMetadata } from '@/lib/seo/meta';
import { ogImagePath } from '@/lib/seo/og-path';
import { pagedSeoTitle, parcoursDescription, parcoursTitle } from '@/lib/seo/titles';

export const dynamic = 'force-dynamic';

/** Query parameters that only change what is shown of the same fiche (tab, review filters). */
const VIEW_PARAMS = ['onglet', 'niveau', 'tri', 'qtri', 'qpage', 'question'] as const;

/** What the fiche has besides reviews: programme, admission data (description, JSON-LD). */
function ficheContent(p: NonNullable<Awaited<ReturnType<typeof getProgram>>>) {
  return {
    hasProgramme: p.semesters.some((s) => s.courses.length || s.milestones.length),
    hasAdmission: !!p.origins || p.admissionStats.length > 0,
  };
}

/**
 * One canonical per fiche: the tabs (?onglet=programme) and the review filters show the same
 * page (all of it is in the HTML) → canonical to the fiche; the filtered review lists are
 * noindex, follow. Pages of reviews (?page=2) keep their own canonical. A fiche of a private
 * establishment is reachable but never indexed.
 */
export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<AvisParams>;
}): Promise<Metadata> {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const p = await getProgram(slug);
  if (!p) return { title: 'Parcours introuvable', robots: { index: false } };
  const title = splitParcoursTitle(p.title).title;
  const input = {
    title,
    ...(await parcoursHomonyms(p.id)),
    mention: p.mention.name,
    universityName: p.university.name,
    universityShort: p.university.shortName,
    city: p.city,
    reviewCount: p.reviewCount,
    avgRating: p.avgRating,
    ...ficheContent(p),
  };
  const page = Math.max(1, Math.floor(Number(sp.page) || 1));
  const filtered = !!(sp.niveau && sp.niveau !== 'all') || !!(sp.tri && sp.tri !== 'recents');
  const viewOnly = VIEW_PARAMS.some((k) => sp[k]);
  const base = `/parcours/${p.slug}`;
  const from = (page - 1) * REVIEWS_PER_PAGE + 1;
  return seoMetadata({
    title: pagedSeoTitle(parcoursTitle(input), page),
    description:
      page > 1 && !viewOnly
        ? `Avis ${from} à ${Math.min(p.reviewCount, from + REVIEWS_PER_PAGE - 1)} sur ${p.reviewCount} pour le master ${title} (${p.university.shortName ?? p.university.name}, ${p.city}), du plus récent au plus ancien.`
        : parcoursDescription(input),
    canonical: page > 1 && !viewOnly ? `${base}?page=${page}` : base,
    noindex: p.university.sector !== 'PUBLIC' || filtered,
    image: {
      path: ogImagePath('parcours', p.slug, [title, p.avgRating, p.reviewCount]),
      alt: `Master ${title} – ${p.university.name}, ${p.city}`,
    },
  });
}

/** Above this many characters the parcours name is set smaller in the hero. */
const LONG_TITLE = 48;

const monthYear = new Intl.DateTimeFormat('fr-FR', { month: 'short', year: 'numeric' });

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-md bg-surface-0 p-4">
      <span className="text-[13px] font-semibold text-ink-muted">{label}</span>
      <span className="text-[15px] font-semibold">{children}</span>
    </div>
  );
}

/**
 * « Livret pédagogique 2022-2023 de l’UFR Histoire » from the document and its year (stale
 * programme notice); other documents: « Site de l’université · a.fr, 2021-2022 ».
 */
function staleSource(doc: string | null | undefined, year: string | null | undefined): string {
  const d = doc?.trim() ?? 'Document';
  const m = /^(livret[^,]*?)\s+(de l[’']|du |des |de )(.+)$/i.exec(d);
  if (m && year) return `${m[1]} ${year} ${m[2]}${m[3]}`;
  return year ? `${d}, ${year}` : d;
}

/** Link to the reviews of a program with a level, a sort and a page (back to the reviews tab). */
function avisHref(slug: string, o: { niveau?: string; tri?: string; page?: number }): string {
  const q = new URLSearchParams();
  if (o.niveau && o.niveau !== 'all') q.set('niveau', o.niveau);
  if (o.tri && o.tri !== 'recents') q.set('tri', o.tri);
  if (o.page && o.page > 1) q.set('page', String(o.page));
  const s = q.toString();
  return `/parcours/${slug}${s ? `?${s}` : ''}#avis`;
}

type AvisParams = {
  niveau?: string;
  tri?: string;
  page?: string;
  qtri?: string;
  qpage?: string;
  question?: string;
  /** Tab asked by the address (« ?onglet=programme »); a removed tab (« debouches ») opens Avis. */
  onglet?: string;
};

const TAB_IDS = ['avis', 'questions', 'programme', 'admission'] as const;
function initialTab(sp: AvisParams): string {
  if (sp.qtri || sp.qpage || sp.question) return 'questions';
  return TAB_IDS.find((t) => t === sp.onglet) ?? 'avis';
}

export default async function ParcoursPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<AvisParams>;
}) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const p = await getProgram(slug);
  if (!p) {
    // Former slug of a homonym: permanent redirect to the new one.
    const moved = await prisma.programSlugRedirect.findUnique({ where: { slug } });
    const target = moved
      ? await prisma.program.findUnique({ where: { id: moved.programId }, select: { slug: true } })
      : null;
    if (target) permanentRedirect(`/parcours/${target.slug}`);
    notFound();
  }
  const level: ReviewLevelFilter = REVIEW_LEVELS.find((l) => l === sp.niveau) ?? 'all';
  const sort: ReviewSort = REVIEW_SORTS.find((o) => o.id === sp.tri)?.id ?? 'recents';
  const askedPage = Math.max(1, Math.floor(Number(sp.page) || 1));

  const qsort: QuestionSort = QUESTION_SORTS.find((o) => o.id === sp.qtri)?.id ?? 'populaires';
  const qpage = Math.max(1, Math.floor(Number(sp.qpage) || 1));
  const [
    rp,
    student,
    chatEnabled,
    voterKey,
    siblings,
    evolution,
    responder,
    reviewSummary,
    identity,
    place,
  ] = await Promise.all([
    getReviewPage(p.id, { level, sort, page: askedPage }),
    getCurrentStudent(),
    getSetting('chat.enabled'),
    getVoterKey(false),
    sameMentionElsewhere(p),
    getEvolution({
      id: p.id,
      title: p.title,
      accreditationId: p.accreditationId,
      mentionName: p.mention.name,
    }),
    getCurrentResponder(),
    getReviewSummary(p.id),
    ficheSources(p),
    programPlace(p.id, p.mention.slug),
  ]);
  const [qp, right] = await Promise.all([
    getQuestionsPage(p.id, qsort, qpage, student ? accountVoterKey(student.id) : voterKey),
    answerRight(p.id, { studentId: student?.id, responder }),
  ]);
  const qLast = Math.max(1, Math.ceil(qp.count / QUESTIONS_PER_PAGE));
  const qHref = (n: number) =>
    `/parcours/${p.slug}?qtri=${qsort}${n > 1 ? `&qpage=${n}` : ''}#questions`;
  const questionsPanel = (
    <QuestionsPanel
      programId={p.id}
      slug={p.slug}
      sort={qsort}
      unanswered={qp.unanswered}
      loggedIn={!!student}
      canAnswer={!!right}
      items={qp.items.map((q) => ({ ...q, publishedAt: q.publishedAt.toISOString() }))}
      pagination={
        qLast > 1 ? (
          <nav
            aria-label="Pages des questions"
            className="flex flex-wrap items-center justify-center gap-3 text-[14px]"
          >
            {qp.page > 1 && (
              <Link href={qHref(qp.page - 1)} scroll={false} className="nm-page-link font-semibold">
                ← Précédent
              </Link>
            )}
            <span>
              Page {qp.page} sur {qLast}
            </span>
            {qp.page < qLast && (
              <Link href={qHref(qp.page + 1)} scroll={false} className="nm-page-link font-semibold">
                Suivant →
              </Link>
            )}
          </nav>
        ) : null
      }
    />
  );
  if (rp.page !== askedPage && rp.count > 0)
    redirect(avisHref(p.slug, { niveau: level, tri: sort, page: rp.page }));
  const reviews = rp.reviews;
  const [votes, followed] = await Promise.all([
    voterKey
      ? prisma.helpfulVote.findMany({
          where: { voterKey, reviewId: { in: reviews.map((r) => r.id) } },
          select: { reviewId: true },
        })
      : [],
    followedSet(student),
  ]);
  const voted = new Set(votes.map((v) => v.reviewId));
  // « n nouveaux avis depuis ta dernière visite » (Masters suivis) counts from this visit on.
  if (student && followed.has(p.id))
    after(() =>
      prisma.favorite.updateMany({
        where: { studentId: student.id, programId: p.id },
        data: { lastViewedAt: new Date() },
      }),
    );
  const stats = rp.stats;
  const others = siblings.rows;
  const mentionCount = siblings.count;

  const reviewItems: ReviewItem[] = reviews.map((r) => ({
    id: r.id,
    ref: r.ref,
    level: r.level,
    employmentStatus: r.employmentStatus,
    jobTitle: r.jobTitle,
    who: authorWho(r.level, r.cohortYear),
    date: monthYear.format(r.publishedAt),
    rating: r.rating,
    title: r.title,
    pros: r.pros,
    cons: r.cons,
    leaveReason: r.leaveReason,
    isVerified: r.isVerified,
    acceptsQuestions: r.acceptsQuestions,
    helpfulCount: r.helpfulCount,
    voted: voted.has(r.id),
    reply: r.reply
      ? { body: r.reply.body, domain: r.reply.domain, date: monthYear.format(r.reply.publishedAt) }
      : null,
  }));

  const avisPanel = (
    <div className="flex flex-col gap-4">
      {rp.total > 0 ? (
        <ReviewList
          reviews={reviewItems}
          stats={stats}
          level={level}
          sort={sort}
          levels={visibleReviewFilters(rp.byLevel, level).map((f) => ({
            id: f.id,
            label: f.label,
            href: avisHref(p.slug, { niveau: f.id, tri: sort }),
          }))}
          sorts={REVIEW_SORTS.map((o) => ({
            id: o.id,
            label: o.label,
            href: avisHref(p.slug, { niveau: level, tri: o.id }),
          }))}
          pagination={
            <Pagination
              pathname={`/parcours/${p.slug}`}
              params={{
                niveau: level === 'all' ? undefined : level,
                tri: sort === 'recents' ? undefined : sort,
              }}
              page={rp.page}
              perPage={REVIEWS_PER_PAGE}
              total={rp.count}
              targetId="avis-titre"
            />
          }
          chatEnabled={chatEnabled}
          loggedIn={!!student}
          criteria={
            <>
              {stats.criteria.map((c) => (
                <ScoreBar key={c.criterion} label={CRITERION_LABEL[c.criterion]} value={c.avg} />
              ))}
            </>
          }
        />
      ) : (
        <EmptyState
          title="Aucun avis pour l’instant"
          action={
            <Link href={`/avis/nouveau?parcours=${p.slug}`} className={buttonClasses('primary')}>
              Donner le premier avis
            </Link>
          }
        >
          Tu es passé·e par ce parcours ? Ton retour aidera la promo d’après.
        </EmptyState>
      )}
      <p className="m-0 text-caption leading-[1.5] text-ink-muted">
        Les avis portent sur la formation (contenu, organisation, stages, débouchés), jamais sur des
        personnes nommées. Ils sont affichés du plus récent au plus ancien et relus avant
        publication selon notre <Link href="/legal/charte">charte de modération</Link>.
      </p>
      <Link
        href={`/reponse-formation?parcours=${p.slug}`}
        className="inline-flex min-h-tap items-center gap-2 self-start text-[14px] font-semibold"
      >
        <svg
          aria-hidden="true"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 10l9-6 9 6M5 10v9M19 10v9M9.5 10v9M14.5 10v9M3 20h18" />
        </svg>
        Vous êtes responsable de ce parcours ? Répondre aux avis
      </Link>
    </div>
  );

  // Programme by year (part B): computed facts, theme filter, one timeline per year.
  const outline: OutlineSemester[] = p.semesters.map((s) => ({
    id: s.id,
    label: s.label,
    title: s.title,
    year: s.year,
    number: s.number,
    ects: s.ects,
    courses: s.courses.map((c) => ({
      id: c.id,
      label: c.label,
      ects: c.ects,
      category: c.category,
    })),
    milestones: s.milestones.map((m) => ({
      id: m.id,
      kind: m.kind,
      title: m.title,
      detail: m.detail,
      minMonths: m.minMonths,
      maxMonths: m.maxMonths,
      pages: m.pages,
    })),
  }));
  const entry = p.entryLevel === 'M2' ? 'M2' : 'M1';
  const years = outlineYears(outline, entry);
  const shown = years.flatMap((y) => y.semesters);
  const hasProgramme = shown.some((s) => s.courses.length || s.milestones.length);
  const firstSem = p.semesters[0];
  const stale = isStaleProgramme(firstSem?.sourceYear);
  const proposeHref = `/a-propos?sujet=programme&parcours=${p.slug}#contact`;
  const programmeFooter = (
    <div
      className={
        stale
          ? 'flex flex-wrap items-center justify-between gap-2.5 rounded-[16px] bg-warning-bg px-4 py-3.5 text-[14px] text-warning'
          : 'flex flex-wrap items-center justify-between gap-2.5 text-[13px] text-ink-muted'
      }
    >
      <span>
        {stale ? (
          <>
            <strong>{staleSource(firstSem?.sourceDocument, firstSem?.sourceYear)}</strong>, le
            dernier publié : le programme a pu évoluer.
          </>
        ) : (
          <>
            Source :{' '}
            {[firstSem?.sourceDocument, firstSem?.sourceYear].filter(Boolean).join(', ') ||
              'non précisée'}
            .
          </>
        )}
      </span>
      <Link href={proposeHref} className={stale ? 'font-bold text-warning' : 'font-semibold'}>
        Le programme a changé ? Signale-le
      </Link>
    </div>
  );
  const programmePanel = hasProgramme ? (
    <ProgrammePanel
      facts={programmeFacts(outline, {
        entryLevel: entry,
        durationYears: p.durationYears,
        ects: p.ects,
      })}
      categories={presentCategories(
        shown,
        COURSE_CATEGORIES.map((c) => c.id),
      ).map((id) => ({
        id,
        label: categoryLabel(id, p.mention.shortLabel),
        color: CATEGORY_BY_ID[id].color,
      }))}
      years={years}
      milestoneCategory={Object.fromEntries(
        shown.flatMap((s) => s.milestones.map((m) => [m.id, milestoneCategory(m.kind)])),
      )}
      footer={programmeFooter}
    />
  ) : (
    <EmptyState title="Le programme de ce parcours n’est pas encore disponible">
      <span className="flex flex-col items-center gap-2">
        <span>
          Tu le connais ?{' '}
          <Link href={proposeHref} className="font-semibold">
            Propose-le
          </Link>{' '}
          (étudiant·es vérifié·es)
        </span>
        <Link href={`/a-propos?sujet=univ&parcours=${p.slug}#contact`} className="font-semibold">
          Vous êtes responsable de ce parcours ? Complétez la fiche
        </Link>
      </span>
    </EmptyState>
  );

  // What the team entered about the selection (manual entry, never collected from Mon Master).
  const admissionLists = (
    [
      ['Attendus', p.expectations],
      ['Critères d’examen', p.selectionCriteria],
      ['Modalités d’examen', p.examModes],
      ['Langues demandées', p.languages],
      ['Diplômes conseillés', p.advisedDegrees],
    ] as [string, string[]][]
  ).filter(([, items]) => items.length);
  const admissionTexts = (
    [
      ['Sélection', p.selectionProcess],
      ['Prérequis', p.requirements],
      ['Licences conseillées', p.recommendedDegrees],
    ] as [string, string | null][]
  ).filter((x): x is [string, string] => !!x[1]);
  // Admission tab: « D'où viennent les admis ? » first, then « Comment ce
  // master évolue »; no figure cards, no « Candidature » card.
  const admissionPanel = (
    <div className="flex flex-col gap-4">
      {p.origins && (
        <AdmissionOrigins
          summary={p.origins}
          university={p.university.shortName ?? p.university.name}
          sourceUrl={datasetUrl(p.origins.session)}
        />
      )}
      <AdmissionEvolution {...evolution} />
      {admissionLists.length + admissionTexts.length > 0 && (
        <section aria-labelledby="adm-team" className="flex flex-col gap-3">
          <h2
            id="adm-team"
            className="m-0 font-display text-[22px] font-extrabold tracking-[-0.02em]"
          >
            Attendus et critères
          </h2>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(260px,100%),1fr))] gap-3">
            {admissionLists.map(([k, items]) => (
              <Fact key={k} label={k}>
                <ul className="m-0 flex list-disc flex-col gap-1 pl-4.5">
                  {items.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </Fact>
            ))}
            {admissionTexts.map(([k, v]) => (
              <Fact key={k} label={k}>
                {v}
              </Fact>
            ))}
          </div>
          <p className="m-0 text-[13px] text-ink-muted">
            Saisie manuelle par l’équipe
            {p.admissionSourceUrl ? (
              <>
                {' '}
                d’après{' '}
                <a href={p.admissionSourceUrl} rel="noopener noreferrer" target="_blank">
                  la page consultée
                  <span className="sr-only"> (nouvel onglet)</span>
                </a>
              </>
            ) : null}
            . Mon Master interdit leur collecte automatique.
          </p>
        </section>
      )}
    </div>
  );

  // Fiche d'identité: each unknown line is left out.
  const firstEntry = p.monMasterEntries[0];
  const uai = p.university.uai?.split(';')[0]?.trim() || null;
  const cert = p.mention.certification;
  const identityRows = (
    [
      [
        'Université',
        <Link key="u" href={`/universites/${p.university.slug}`} className="text-ink">
          {p.university.name}
        </Link>,
      ],
      ['Composante', p.component?.name ?? null],
      [
        'Mention',
        <Link key="m" href={`/mentions/${p.mention.slug}`} className="text-ink">
          {p.mention.name}
        </Link>,
      ],
      ['Certification', cert ? `${cert.code}${cert.level ? ` · niveau ${cert.level}` : ''}` : null],
      [
        'Candidature',
        firstEntry ? (
          uai ? (
            <a
              key="c"
              href={`https://monmaster.gouv.fr/formation/${uai}/${firstEntry.code}/detail`}
              rel="noopener noreferrer"
              target="_blank"
              className="text-ink"
            >
              Mon Master · n° {firstEntry.code} ↗<span className="sr-only"> (nouvel onglet)</span>
            </a>
          ) : (
            `Mon Master · n° ${firstEntry.code}`
          )
        ) : null,
      ],
      ['Code établissement', uai ? `UAI ${uai}` : null],
    ] as [string, React.ReactNode][]
  ).filter(([, v]) => v != null && v !== '');

  // « Droit des affaires : M2 Droit des affaires approfondi »: the speciality is the title.
  const split = splitParcoursTitle(p.title);
  const tags = [
    `${p.durationYears} an${p.durationYears > 1 ? 's' : ''}${p.ects ? ` · ${p.ects} ECTS` : ''}`,
    MODALITY_LABEL[p.modality],
    p.entryLevel === 'M2' ? 'Entrée en M2' : null,
    ...p.highlights,
  ].filter(Boolean) as string[];

  return (
    <main>
      <Container className="flex flex-col gap-6 pt-7 pb-20">
        {/* Accueil › Nantes › Droit › Parcours: the city page, then the city × mention page when
            the city has one (else the national mention), as in the JSON-LD. */}
        <Breadcrumb
          structured={p.university.sector === 'PUBLIC'}
          items={[
            { label: 'Accueil', href: '/' },
            ...(place
              ? [
                  { label: place.zone.name, href: `/masters/${place.zone.slug}` },
                  {
                    label: p.mention.name,
                    href: place.cityMention ?? `/mentions/${p.mention.slug}`,
                  },
                ]
              : [
                  { label: p.university.name, href: `/universites/${p.university.slug}` },
                  { label: p.mention.name, href: `/mentions/${p.mention.slug}` },
                ]),
            { label: split.title },
          ]}
        />
        {p.university.sector === 'PUBLIC' && (
          <JsonLd
            data={pageJsonLd([
              programJsonLd({
                slug: p.slug,
                title: split.title,
                mention: p.mention.name,
                durationYears: p.durationYears,
                ects: p.ects,
                university: {
                  name: p.university.name,
                  slug: p.university.slug,
                  website: p.university.website,
                },
                city: p.city,
                prerequisites:
                  p.requirements ??
                  p.recommendedDegrees ??
                  (p.advisedDegrees.length ? p.advisedDegrees.join(' ; ') : null),
              }),
            ])}
          />
        )}

        <section className="relative flex flex-wrap items-end justify-between gap-8 overflow-hidden rounded-xl bg-violet-500 p-10 text-on-violet max-sm:p-6">
          <div
            aria-hidden="true"
            className="absolute -top-15 -right-15 size-65 rounded-pill bg-lime-400 opacity-90 max-sm:-top-20 max-sm:-right-20 max-sm:size-36"
          />
          <div
            aria-hidden="true"
            className="absolute top-30 right-37.5 size-22.5 rotate-[18deg] rounded-[28px] bg-coral-300 max-sm:hidden"
          />
          <div className="relative flex min-w-0 flex-1 flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              <span className="rounded-pill bg-white px-3 py-1.5 text-[12px] font-bold tracking-[0.05em] text-[#3b23b8] uppercase">
                Parcours
              </span>
              <span className="rounded-pill bg-white/16 px-3 py-1.5 text-[13px] font-semibold">
                {p.university.name}
              </span>
              <span className="rounded-pill bg-white/16 px-3 py-1.5 text-[13px] font-semibold">
                {p.city}
              </span>
              {p.university.sector !== 'PUBLIC' && (
                <span className="rounded-pill bg-coral-300 px-3 py-1.5 text-[13px] font-bold text-[#16131f]">
                  Établissement privé
                </span>
              )}
            </div>
            {split.parent && (
              <span className="-mb-2 text-[16px] font-semibold opacity-90">{split.parent}</span>
            )}
            <h1
              className={cn(
                'm-0 font-display font-extrabold tracking-[-0.035em] text-balance',
                // A long name (« Histoire de l’art et culture matérielle - de l’Antiquité à nos
                // jours ») is set smaller and wider so it holds on two lines on a computer.
                split.title.length > LONG_TITLE
                  ? 'max-w-[900px] text-[clamp(26px,4vw,48px)] leading-[1.05]'
                  : 'max-w-[760px] text-[clamp(36px,5vw,60px)] leading-none',
              )}
            >
              {split.title}
            </h1>
            <p className="m-0 text-[18px]">
              Master mention{' '}
              <Link href={`/mentions/${p.mention.slug}`} className="font-semibold text-on-violet">
                {p.mention.name}
              </Link>
            </p>
            <ul className="mt-1 flex flex-wrap gap-2">
              {tags.map((t) => (
                <li key={t} className="rounded-sm border border-current/35 px-3 py-2 text-[14px]">
                  {t}
                </li>
              ))}
            </ul>
            {/* Summary and buttons on one line: the column (and the name) keeps the full width. */}
            <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
              <ReviewsSummaryButton
                slug={p.slug}
                levelFiltered={level !== 'all'}
                summary={reviewSummary}
              />
              <div className="flex flex-wrap gap-2.5">
                <FollowButton
                  programId={p.id}
                  title={p.title}
                  initial={followed.has(p.id)}
                  loggedIn={!!student}
                />
                <Link
                  href={`/avis/nouveau?parcours=${p.slug}`}
                  className={ctaClasses('lime', 'l', 'min-h-13')}
                >
                  Donner mon avis
                  <CtaArrow />
                </Link>
              </div>
            </div>
          </div>
        </section>

        <div id="avis" className="flex min-w-0 flex-col gap-5">
          <ParcoursTabs
            questions={qp.total}
            initial={initialTab(sp)}
            panels={{
              avis: avisPanel,
              questions: questionsPanel,
              programme: programmePanel,
              admission: admissionPanel,
            }}
          />
        </div>

        {others.length > 0 && (
          <section aria-labelledby="mm-title" className="mt-4 flex flex-col gap-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="flex flex-col gap-1">
                <h2
                  id="mm-title"
                  className="m-0 font-display text-[30px] font-extrabold tracking-[-0.025em]"
                >
                  Même mention, ailleurs
                </h2>
                <span className="text-[15px] text-ink-soft">
                  D’autres parcours du master {p.mention.name}.
                </span>
              </div>
              <Link
                href={`/mentions/${p.mention.slug}`}
                className="inline-flex min-h-tap items-center text-[15px] font-bold"
              >
                Voir les {formatInt(mentionCount)} parcours de la mention →
              </Link>
            </div>
            <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(min(250px,100%),1fr))] gap-3.5 p-0">
              {others.map((o, i) => (
                <ProgramCard
                  key={o.programId}
                  p={o}
                  index={i}
                  className="mm-card"
                  firstReviewLink
                  follow={
                    <FollowButton
                      variant="icon"
                      programId={o.programId}
                      title={o.title}
                      initial={followed.has(o.programId)}
                      loggedIn={!!student}
                    />
                  }
                />
              ))}
            </ul>
          </section>
        )}

        <section
          aria-labelledby="id-title"
          className="mt-6 flex flex-col gap-3.5 border-t border-border pt-6"
        >
          <h2
            id="id-title"
            className="m-0 text-[13px] font-bold tracking-[0.06em] text-ink-muted uppercase"
          >
            Fiche d’identité
          </h2>
          <dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-x-7 gap-y-3.5 text-[14px] leading-[1.4]">
            {identityRows.map(([k, v]) => (
              <div key={k} className="flex flex-col gap-0.5">
                <dt className="text-ink-muted">{k}</dt>
                <dd className="m-0 font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="m-0 text-[13px] text-ink-muted">
            {identity.sources ? `Sources : ${identity.sources}. ` : ''}
            {identity.updatedAt ? `Mise à jour le ${formatDate(identity.updatedAt)} · ` : ''}
            <Link
              href={`/a-propos?sujet=error&parcours=${p.slug}#contact`}
              className="text-ink-muted"
            >
              Signaler une erreur
            </Link>
          </p>
        </section>
      </Container>
    </main>
  );
}
