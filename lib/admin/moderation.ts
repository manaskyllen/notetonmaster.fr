import 'server-only';
import { decrypt, maskEmail } from '@/lib/crypto';
import { prisma } from '@/lib/db';
import { containsContacts } from '@/lib/domain/masking';
import { todayLine } from '@/lib/domain/graduate';
import { detectNamedPerson } from '@/lib/domain/names';
import { LEVEL_LABEL } from '@/lib/domain/rating';
import { normalize } from '@/lib/domain/search';
import { formatDate, formatRelative } from '@/lib/format';
import { shortRef } from '@/lib/admin/notify';
import { getSettings } from '@/lib/settings';
import { REVIEW_STATUS_LABEL } from '@/lib/domain/review-status';

export type QueueKind =
  'avis' | 'justif' | 'msg' | 'signal' | 'reponses' | 'questions' | 'contact' | 'legal';
export type Tone = 'ok' | 'warn' | 'bad';

export interface QueueAction {
  id: string;
  label: string;
  variant: 'primary' | 'outline' | 'danger';
  needsReason: boolean;
}

export interface QueueItem {
  kind: QueueKind;
  id: string;
  flag: string;
  tone: Tone;
  when: string;
  title: string;
  target: string;
  meta: string;
  body: string;
  checks: { label: string; detail: string; k: Tone }[];
  reasons: string[];
  actions: QueueAction[];
  documentUrl?: string;
  /** Documents: other masters of the author the same document may also validate. */
  alsoPrograms?: { id: string; label: string }[];
  exportUrl?: string;
  publicUrl?: string;
}

const REVIEW_REASONS = [
  'Conforme à la charte',
  'Nomme une personne',
  'Propos injurieux ou diffamatoires',
  'Hors sujet (ne porte pas sur la formation)',
  'Informations personnelles',
  'Avis en double ou non vécu',
  'Poste trop identifiable (employeur cité)',
];

function worst(checks: { k: Tone }[]): Tone {
  return checks.some((c) => c.k === 'bad')
    ? 'bad'
    : checks.some((c) => c.k === 'warn')
      ? 'warn'
      : 'ok';
}

export const QUEUE_PER_PAGE = 25;

/** Open reports grouped by target, oldest first, one page of targets. */
async function reportedTargets(type: 'MESSAGE' | 'REVIEW', skip: number, take: number) {
  const groups = await prisma.report.groupBy({
    by: ['targetId'],
    where: { targetType: type, status: 'OPEN' },
    _min: { createdAt: true },
    orderBy: [{ _min: { createdAt: 'asc' } }, { targetId: 'asc' }],
    skip,
    take,
  });
  const reports = await prisma.report.findMany({
    where: { targetType: type, status: 'OPEN', targetId: { in: groups.map((g) => g.targetId) } },
    orderBy: { createdAt: 'asc' },
  });
  const by = Map.groupBy(reports, (r) => r.targetId);
  return new Map(groups.map((g) => [g.targetId, by.get(g.targetId) ?? []]));
}

/** Totals of every queue (tab counters), whatever the page. */
export async function queueCounts(canModerate: boolean, canLegal: boolean) {
  const distinct = async (type: 'MESSAGE' | 'REVIEW') =>
    (
      await prisma.report.groupBy({
        by: ['targetId'],
        where: { targetType: type, status: 'OPEN' },
      })
    ).length;
  const [avis, justif, msg, signal, reponses, qPending, aPending, contact, legal] =
    await Promise.all([
      canModerate ? prisma.review.count({ where: { status: 'PENDING' } }) : 0,
      canModerate
        ? prisma.programVerification.count({ where: { method: 'DOCUMENT', status: 'PENDING' } })
        : 0,
      canModerate ? distinct('MESSAGE') : 0,
      canModerate ? distinct('REVIEW') : 0,
      canModerate ? prisma.reviewResponse.count({ where: { status: 'PENDING' } }) : 0,
      canModerate ? prisma.question.count({ where: { status: 'PENDING' } }) : 0,
      canModerate ? prisma.answer.count({ where: { status: 'PENDING' } }) : 0,
      canModerate ? prisma.contactMessage.count({ where: { handledAt: null } }) : 0,
      canLegal ? prisma.legalRequest.count({ where: { status: { not: 'CLOSED' } } }) : 0,
    ]);
  return {
    avis,
    justif,
    msg,
    signal,
    reponses,
    questions: qPending + aPending,
    contact,
    legal,
  } satisfies Record<QueueKind, number>;
}

/** One page (25) of one queue: reviews, documents, messages, reports, legal. */
export async function buildQueues(
  canModerate: boolean,
  canLegal: boolean,
  page: { tab: QueueKind; skip: number; take: number },
): Promise<QueueItem[]> {
  const settings = await getSettings();
  const { skip, take } = page;
  const watch = (settings['moderation.watchTerms'] as string[]).map(normalize);
  const items: QueueItem[] = [];

  if (canModerate) {
    // ── Reviews waiting for a decision
    const reviews =
      page.tab !== 'avis'
        ? []
        : await prisma.review.findMany({
            where: { status: 'PENDING' },
            orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
            skip,
            take,
            include: {
              program: {
                select: {
                  title: true,
                  slug: true,
                  universityId: true,
                  university: { select: { name: true, shortName: true } },
                },
              },
              student: {
                select: {
                  verifications: { where: { status: 'APPROVED' }, select: { programId: true } },
                },
              },
            },
          });
    for (const r of reviews) {
      const names = detectNamedPerson(r.title, r.pros, r.cons, r.jobTitle);
      const today = r.level === 'GRADUATE' ? todayLine(r.employmentStatus, r.jobTitle) : null;
      const text = normalize(`${r.title ?? ''} ${r.pros} ${r.cons}`);
      const hits = watch.filter((w) => w && text.includes(w));
      const checks: QueueItem['checks'] = [
        r.studentId
          ? {
              label: 'Auteur',
              detail: r.student?.verifications.some((v) => v.programId === r.programId)
                ? 'avec espace · ce master est vérifié'
                : 'avec espace · ce master n’est pas vérifié',
              k: 'ok',
            }
          : {
              label: 'Auteur',
              detail: 'sans compte, mail confirmé : publié sans badge',
              k: 'warn',
            },
        names.found || r.nameFlagged
          ? {
              label: 'Personnes nommées',
              detail: names.found ? `détecté : « ${names.matches[0]} »` : 'un nom a été masqué',
              k: 'bad',
            }
          : { label: 'Personnes nommées', detail: 'aucune détectée', k: 'ok' },
        hits.length
          ? { label: 'Langage', detail: `terme surveillé : ${hits.join(', ')}`, k: 'warn' }
          : { label: 'Langage', detail: 'rien à signaler', k: 'ok' },
        // Graduates: the declared job must not name or point to the employer.
        ...(r.level === 'GRADUATE' && r.employmentStatus === 'EMPLOYED'
          ? [
              {
                label: 'Poste indiqué',
                detail: `« ${r.jobTitle ?? ''} » : employeur cité ou trop identifiable ? Sinon, demander une reformulation.`,
                k: 'warn' as Tone,
              },
            ]
          : r.level === 'GRADUATE' && !r.employmentStatus
            ? [{ label: 'Situation', detail: 'non renseignée (avis antérieur)', k: 'warn' as Tone }]
            : []),
        ...(containsContacts(`${r.pros} ${r.cons} ${r.jobTitle ?? ''}`)
          ? [
              {
                label: 'Coordonnées',
                detail: 'un mail ou un numéro figure dans le texte',
                k: 'bad' as Tone,
              },
            ]
          : []),
      ];
      const tone = worst(checks);
      items.push({
        kind: 'avis',
        id: r.id,
        flag: names.found
          ? 'Nomme une personne'
          : !r.studentId
            ? 'Sans compte'
            : hits.length
              ? 'Langage'
              : 'Prêt à publier',
        tone,
        when: formatRelative(r.submittedAt),
        title: r.title ? `« ${r.title} »` : `Avis ${r.ref}`,
        target: `${r.program.title} · ${r.program.university.shortName ?? r.program.university.name}`,
        meta: `${r.ref} · Anonyme · ${LEVEL_LABEL[r.level]} · promo ${r.cohortYear} · note ${r.overallRating}/5${r.isDemo ? ' · exemple' : ''}`,
        body: `${today ? `Aujourd’hui : ${today}\n` : ''}On a aimé : ${r.pros}\nMoins bien : ${r.cons}`,
        checks,
        reasons: names.found
          ? ['Nomme une personne', ...REVIEW_REASONS.filter((x) => x !== 'Nomme une personne')]
          : REVIEW_REASONS,
        actions: [
          {
            id: 'publish',
            label: r.studentId ? 'Publier' : 'Publier sans badge',
            variant: 'primary',
            needsReason: false,
          },
          {
            id: 'needs_edit',
            label: 'Demander une reformulation',
            variant: 'outline',
            needsReason: true,
          },
          { id: 'reject', label: 'Rejeter', variant: 'danger', needsReason: true },
        ],
        publicUrl: `/parcours/${r.program.slug}`,
      });
    }

    // ── Verification documents
    const docs =
      page.tab !== 'justif'
        ? []
        : await prisma.programVerification.findMany({
            where: { method: 'DOCUMENT', status: 'PENDING' },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            skip,
            take,
            include: {
              student: {
                select: {
                  emailEnc: true,
                  // Other masters this document may also validate: reviewed, not yet verified.
                  reviews: {
                    select: {
                      program: {
                        select: {
                          id: true,
                          title: true,
                          university: { select: { name: true, shortName: true } },
                        },
                      },
                    },
                  },
                  verifications: { where: { status: 'APPROVED' }, select: { programId: true } },
                },
              },
              program: {
                select: { title: true, university: { select: { name: true, shortName: true } } },
              },
            },
          });
    for (const v of docs) {
      const checks: QueueItem['checks'] = [
        {
          label: 'Document',
          detail: `${v.documentType ?? 'type non précisé'} · ${v.documentMime ?? 'format inconnu'}`,
          k: v.documentPath ? 'ok' : 'bad',
        },
        {
          label: 'Déclaration',
          detail: `${v.declaredLevel ? LEVEL_LABEL[v.declaredLevel] : 'niveau ?'}, entré·e en ${v.declaredCohort ?? '?'}`,
          k: 'ok',
        },
        {
          label: 'À vérifier à l’œil',
          detail: 'nom, université et intitulé de ce master lisibles sur le document',
          k: 'warn',
        },
      ];
      items.push({
        kind: 'justif',
        id: v.id,
        flag: v.documentType ?? 'Justificatif',
        tone: 'warn',
        when: formatRelative(v.createdAt),
        title: 'Demande de badge « Parcours vérifié »',
        target: `${v.program.title} · ${v.program.university.shortName ?? v.program.university.name}`,
        alsoPrograms: [
          ...new Map(
            v.student.reviews
              .map((r) => r.program)
              .filter(
                (p) =>
                  p.id !== v.programId &&
                  !v.student.verifications.some((x) => x.programId === p.id),
              )
              .map((p) => [
                p.id,
                { id: p.id, label: `${p.title} · ${p.university.shortName ?? p.university.name}` },
              ]),
          ).values(),
        ],
        meta: `${shortRef('JUS', v.id)} · Espace ${maskEmail(decrypt(v.student.emailEnc))}`,
        body: `Pièce jointe : ${v.documentName ?? 'document'}\nLe document sera supprimé automatiquement dès ta décision.`,
        checks,
        reasons: [
          'Document conforme',
          'Document illisible',
          'Master ou université différents',
          'Document incomplet',
        ],
        actions: [
          {
            id: 'approve',
            label: 'Valider · accorder le badge',
            variant: 'primary',
            needsReason: false,
          },
          {
            id: 'more_info',
            label: 'Demander un autre document',
            variant: 'outline',
            needsReason: true,
          },
          { id: 'reject', label: 'Refuser', variant: 'danger', needsReason: true },
        ],
        documentUrl: v.documentPath ? `/admin/justificatifs/${v.id}` : undefined,
      });
    }

    // ── Reported messages (grouped by message)
    const byMsg: Awaited<ReturnType<typeof reportedTargets>> =
      page.tab === 'msg' ? await reportedTargets('MESSAGE', skip, take) : new Map();
    for (const [messageId, reps] of byMsg) {
      const m = await prisma.message.findUnique({
        where: { id: messageId },
        include: {
          conversation: {
            include: {
              review: { select: { title: true } },
              _count: { select: { messages: true } },
            },
          },
        },
      });
      if (!m) continue;
      const recent = await prisma.conversation.count({
        where: {
          askerEmailHash: m.conversation.askerEmailHash,
          createdAt: { gte: new Date(Date.now() - 24 * 3600_000) },
        },
      });
      const checks: QueueItem['checks'] = [
        { label: 'Motif', detail: reps.map((r) => r.reason).join(', '), k: 'bad' },
        m.hadMaskedContent
          ? { label: 'Coordonnées', detail: 'détectées et masquées automatiquement', k: 'warn' }
          : { label: 'Coordonnées', detail: 'aucune', k: 'ok' },
        {
          label: 'Volume',
          detail: `${recent} conversation(s) ouverte(s) par cet expéditeur en 24 h`,
          k: recent >= 3 ? 'warn' : 'ok',
        },
      ];
      items.push({
        kind: 'msg',
        id: messageId,
        flag: 'Message signalé',
        tone: 'bad',
        when: formatRelative(reps[0]!.createdAt),
        title: `Conversation sur « ${m.conversation.review.title ?? 'un avis'} »`,
        target: `Messagerie anonyme · ${reps[0]!.reference}`,
        meta: `Expéditeur : ${m.fromRole === 'ASKER' ? m.conversation.alias : 'auteur·rice de l’avis'} · ${m.conversation._count.messages} message(s)`,
        body: `Message signalé : « ${m.body} »`,
        checks,
        reasons: ['Démarchage ou spam', 'Harcèlement', 'Message conforme'],
        actions: [
          { id: 'suspend', label: 'Suspendre l’expéditeur', variant: 'primary', needsReason: true },
          { id: 'warn', label: 'Avertir l’expéditeur', variant: 'outline', needsReason: true },
          { id: 'dismiss', label: 'Classer sans suite', variant: 'danger', needsReason: true },
        ],
      });
    }

    // ── Reported reviews (grouped by review)
    const byReview: Awaited<ReturnType<typeof reportedTargets>> =
      page.tab === 'signal' ? await reportedTargets('REVIEW', skip, take) : new Map();
    for (const [reviewId, reps] of byReview) {
      const r = await prisma.review.findUnique({
        where: { id: reviewId },
        include: {
          program: {
            select: {
              title: true,
              slug: true,
              university: { select: { shortName: true, name: true } },
            },
          },
        },
      });
      if (!r) continue;
      const keys = new Set(reps.map((x) => x.reporterKey));
      const reasons = Map.groupBy(reps, (x) => x.reason);
      const top = [...reasons.entries()].sort((a, b) => b[1].length - a[1].length)[0]?.[0] ?? '';
      const names = detectNamedPerson(r.title, r.pros, r.cons);
      items.push({
        kind: 'signal',
        id: reviewId,
        flag: `Signalé ${reps.length} fois`,
        tone: reps.length >= 2 ? 'bad' : 'warn',
        when: formatRelative(reps[reps.length - 1]!.createdAt),
        title: r.title ? `« ${r.title} »` : `Avis ${r.ref}`,
        target: `Avis ${REVIEW_STATUS_LABEL[r.status].toLowerCase()} · ${r.program.title} · ${r.program.university.shortName ?? r.program.university.name}`,
        meta: `Motif le plus cité : ${top.toLowerCase()} · références ${reps.map((x) => x.reference).join(', ')}`,
        body: `On a aimé : ${r.pros}\nMoins bien : ${r.cons}${
          reps.some((x) => x.details)
            ? `\n\nPrécisions des signalements : ${reps
                .map((x) => x.details)
                .filter(Boolean)
                .join(' / ')}`
            : ''
        }`,
        checks: [
          names.found
            ? { label: 'Personnes nommées', detail: names.matches.join(', '), k: 'bad' }
            : { label: 'Personnes nommées', detail: 'aucune', k: 'ok' },
          {
            label: 'Signalements',
            detail: `${reps.length} en tout, depuis ${keys.size} réseau(x) différent(s)`,
            k: keys.size < reps.length ? 'warn' : 'ok',
          },
          {
            label: 'Statut actuel',
            detail: r.status === 'HIDDEN' ? 'masqué temporairement' : 'en ligne',
            k: r.status === 'HIDDEN' ? 'warn' : 'ok',
          },
        ],
        reasons: ['Conforme à la charte', ...REVIEW_REASONS.slice(1)],
        actions: [
          { id: 'keep', label: 'Maintenir l’avis', variant: 'primary', needsReason: true },
          {
            id: 'hide',
            label: 'Masquer le temps de vérifier',
            variant: 'outline',
            needsReason: true,
          },
          { id: 'remove', label: 'Retirer', variant: 'danger', needsReason: true },
        ],
        publicUrl: `/parcours/${r.program.slug}#${r.ref}`,
      });
    }
  }

  // ── Replies of the teaching teams (droit de réponse), first and edited ones
  if (canModerate && page.tab === 'reponses') {
    const responses = await prisma.reviewResponse.findMany({
      where: { status: 'PENDING' },
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      skip,
      take,
      include: {
        responder: { select: { domain: true, university: { select: { name: true } } } },
        review: {
          select: {
            ref: true,
            title: true,
            pros: true,
            cons: true,
            overallRating: true,
            program: {
              select: {
                title: true,
                slug: true,
                university: { select: { name: true, shortName: true } },
              },
            },
          },
        },
      },
    });
    for (const r of responses) {
      const names = detectNamedPerson(r.body);
      const text = normalize(r.body);
      const hits = watch.filter((w) => w && text.includes(w));
      const checks: QueueItem['checks'] = [
        {
          label: 'Répondant·e',
          detail: `adresse vérifiée @${r.responder.domain} (${r.responder.university.name})`,
          k: 'ok',
        },
        names.found
          ? {
              label: 'Personnes nommées',
              detail: `détecté : « ${names.matches[0]} » (auteur·rice visé·e ?)`,
              k: 'bad',
            }
          : { label: 'Personnes nommées', detail: 'aucune détectée', k: 'ok' },
        r.hadMaskedContent
          ? { label: 'Coordonnées', detail: 'détectées et masquées automatiquement', k: 'warn' }
          : { label: 'Coordonnées', detail: 'aucune', k: 'ok' },
        hits.length
          ? { label: 'Langage', detail: `terme surveillé : ${hits.join(', ')}`, k: 'warn' }
          : { label: 'Langage', detail: 'rien à signaler', k: 'ok' },
        ...(r.editedAt
          ? [
              {
                label: 'Modification',
                detail: `réponse modifiée ${formatRelative(r.editedAt)} : relecture complète`,
                k: 'warn' as Tone,
              },
            ]
          : []),
      ];
      items.push({
        kind: 'reponses',
        id: r.id,
        flag: r.editedAt ? 'Réponse modifiée' : 'Nouvelle réponse',
        tone: worst(checks),
        when: formatRelative(r.updatedAt),
        title: `Réponse à ${r.review.title ? `« ${r.review.title} »` : `l’avis ${r.review.ref}`}`,
        target: `${r.review.program.title} · ${r.review.program.university.shortName ?? r.review.program.university.name}`,
        meta: `Équipe pédagogique · @${r.responder.domain} · avis noté ${r.review.overallRating}/5`,
        body: `Réponse : ${r.body}\n\nAvis — On a aimé : ${r.review.pros}\nMoins bien : ${r.review.cons}`,
        checks,
        reasons: [
          'Conforme à la charte',
          'Attaque l’auteur·rice de l’avis',
          'Tente d’identifier l’auteur·rice',
          'Demande de retrait : passer par « Signaler un contenu »',
          'Informations personnelles',
          'Hors sujet',
        ],
        actions: [
          { id: 'publish', label: 'Publier sous l’avis', variant: 'primary', needsReason: false },
          { id: 'reject', label: 'Refuser', variant: 'danger', needsReason: true },
        ],
        publicUrl: `/parcours/${r.review.program.slug}#${r.review.ref}`,
      });
    }
  }

  // ── Public questions and their answers (one queue, oldest first)
  if (canModerate && page.tab === 'questions') {
    const [qs, as] = await Promise.all([
      prisma.question.findMany({
        where: { status: 'PENDING' },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: skip + take,
        include: {
          program: {
            select: {
              title: true,
              slug: true,
              university: { select: { name: true, shortName: true } },
            },
          },
        },
      }),
      prisma.answer.findMany({
        where: { status: 'PENDING' },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: skip + take,
        include: {
          question: {
            select: {
              body: true,
              program: {
                select: {
                  title: true,
                  slug: true,
                  university: { select: { name: true, shortName: true } },
                },
              },
            },
          },
        },
      }),
    ]);
    const merged = [
      ...qs.map((q) => ({ at: q.createdAt, q, a: null })),
      ...as.map((a) => ({ at: a.createdAt, q: null, a })),
    ]
      .sort((x, y) => x.at.getTime() - y.at.getTime())
      .slice(skip, skip + take);
    const common = (text: string, masked: boolean) => {
      const names = detectNamedPerson(text);
      const hits = watch.filter((w) => w && normalize(text).includes(w));
      return [
        names.found
          ? {
              label: 'Personnes nommées',
              detail: `détecté : « ${names.matches[0]} »`,
              k: 'bad' as Tone,
            }
          : { label: 'Personnes nommées', detail: 'aucune détectée', k: 'ok' as Tone },
        masked
          ? {
              label: 'Coordonnées',
              detail: 'détectées et masquées automatiquement',
              k: 'warn' as Tone,
            }
          : { label: 'Coordonnées', detail: 'aucune', k: 'ok' as Tone },
        hits.length
          ? { label: 'Langage', detail: `terme surveillé : ${hits.join(', ')}`, k: 'warn' as Tone }
          : { label: 'Langage', detail: 'rien à signaler', k: 'ok' as Tone },
      ];
    };
    const actions: QueueAction[] = [
      { id: 'publish', label: 'Publier', variant: 'primary', needsReason: false },
      { id: 'reject', label: 'Refuser', variant: 'danger', needsReason: true },
    ];
    const reasons = [
      'Conforme à la charte',
      'Nomme ou vise une personne',
      'Informations personnelles',
      'Hors sujet',
      'Publicité ou démarchage',
    ];
    for (const { q, a } of merged) {
      if (q) {
        const checks = common(q.body, q.hadMaskedContent);
        items.push({
          kind: 'questions',
          id: `q:${q.id}`,
          flag: 'Question',
          tone: worst(checks),
          when: formatRelative(q.createdAt),
          title: `« ${q.body.slice(0, 120)}${q.body.length > 120 ? '…' : ''} »`,
          target: `${q.program.title} · ${q.program.university.shortName ?? q.program.university.name}`,
          meta: `Question publique · pseudonyme ${q.alias}`,
          body: q.body,
          checks,
          reasons,
          actions,
          publicUrl: `/parcours/${q.program.slug}?qtri=recentes#questions`,
        });
      } else if (a) {
        const checks = [
          {
            label: 'Auteur·rice',
            detail:
              a.kind === 'TEAM' ? 'équipe pédagogique vérifiée' : `${a.who} · parcours vérifié`,
            k: 'ok' as Tone,
          },
          ...common(a.body, a.hadMaskedContent),
        ];
        items.push({
          kind: 'questions',
          id: `a:${a.id}`,
          flag: a.kind === 'TEAM' ? 'Réponse officielle' : 'Réponse',
          tone: worst(checks),
          when: formatRelative(a.createdAt),
          title: `Réponse à « ${a.question.body.slice(0, 100)}${a.question.body.length > 100 ? '…' : ''} »`,
          target: `${a.question.program.title} · ${a.question.program.university.shortName ?? a.question.program.university.name}`,
          meta: a.who,
          body: `Question : ${a.question.body}\n\nRéponse : ${a.body}`,
          checks,
          reasons,
          actions,
          publicUrl: `/parcours/${a.question.program.slug}?qtri=recentes#questions`,
        });
      }
    }
  }

  // ── Messages of the contact form (/a-propos), oldest first, until marked as handled
  if (canModerate && page.tab === 'contact') {
    const messages = await prisma.contactMessage.findMany({
      where: { handledAt: null },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      skip,
      take,
    });
    for (const m of messages)
      items.push({
        kind: 'contact',
        id: m.id,
        flag: m.subject,
        tone: 'warn',
        when: formatRelative(m.createdAt),
        title: m.subject,
        target: shortRef('CON', m.id),
        // The address is needed to answer (from the contact mailbox); never in a notification.
        meta: `Répondre à ${decrypt(m.emailEnc)}${m.link ? ` · lien : ${m.link}` : ''}`,
        body: m.body,
        checks: [
          {
            label: 'Réponse',
            detail: 'depuis la boîte de contact, puis « Marquer comme traité »',
            k: 'ok',
          },
        ],
        reasons: [],
        actions: [
          { id: 'handled', label: 'Marquer comme traité', variant: 'primary', needsReason: false },
        ],
      });
  }

  if (canLegal && page.tab === 'legal') {
    const legal = await prisma.legalRequest.findMany({
      where: { status: { not: 'CLOSED' } },
      orderBy: [{ receivedAt: 'asc' }, { id: 'asc' }],
      skip,
      take,
      include: { assignedTo: { select: { name: true } } },
    });
    for (const l of legal) {
      const daysLeft = Math.ceil((l.internalDeadline.getTime() - Date.now()) / 86400000);
      const notice = l.type === 'NOTICE';
      items.push({
        kind: 'legal',
        id: l.id,
        flag: notice ? 'Notification de contenu' : 'Réquisition',
        tone: daysLeft <= 2 ? 'bad' : 'warn',
        when: `Reçue le ${formatDate(l.receivedAt)}`,
        title: notice ? 'Demande de retrait d’un contenu' : 'Demande de données de connexion',
        target: `${l.reference} · ${l.requesterName} (${l.requesterQuality})`,
        meta: `${l.lawReference ? `Fondement : ${l.lawReference} · ` : ''}échéance interne : ${formatDate(l.internalDeadline)}${l.assignedTo ? ` · assignée à ${l.assignedTo.name}` : ''}`,
        body: `Contenu visé : ${l.contentUrl}\n\n${l.grounds}`,
        checks: [
          {
            label: notice ? 'Notification complète' : 'Origine',
            detail: notice
              ? l.goodFaith
                ? 'identité, contenu visé, motifs, bonne foi'
                : 'déclaration de bonne foi absente'
              : 'réquisition à vérifier (signature, autorité)',
            k: notice && !l.goodFaith ? 'bad' : 'ok',
          },
          {
            label: 'Délai',
            detail:
              daysLeft >= 0 ? `${daysLeft} jour(s) restant(s)` : `dépassé de ${-daysLeft} jour(s)`,
            k: daysLeft <= 1 ? 'bad' : daysLeft <= 2 ? 'warn' : 'ok',
          },
          ...(notice
            ? []
            : [
                {
                  label: 'Accès',
                  detail: 'données de connexion réservées au rôle Légal, conservées 1 an',
                  k: 'warn' as Tone,
                },
              ]),
        ],
        reasons: notice
          ? [
              'Contenu non manifestement illicite',
              'Contenu retiré',
              'Transmis à un conseil juridique',
            ]
          : [
              'Transmis à l’autorité',
              'Données hors période de conservation',
              'Réquisition irrégulière',
            ],
        actions: notice
          ? [
              {
                id: 'refuse',
                label: 'Refuser, avec motifs',
                variant: 'primary',
                needsReason: true,
              },
              {
                id: 'transmit',
                label: 'Transmettre à un juriste',
                variant: 'outline',
                needsReason: false,
              },
              { id: 'remove', label: 'Retirer le contenu', variant: 'danger', needsReason: true },
            ]
          : [
              { id: 'export', label: 'Préparer l’export', variant: 'primary', needsReason: false },
              {
                id: 'assign',
                label: 'Assigner au rôle Légal',
                variant: 'outline',
                needsReason: false,
              },
              { id: 'close', label: 'Clore', variant: 'danger', needsReason: true },
            ],
        exportUrl: notice ? undefined : `/admin/legal/${l.id}/export`,
      });
    }
  }
  return items;
}
