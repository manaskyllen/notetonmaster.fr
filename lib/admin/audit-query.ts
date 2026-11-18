import { prisma } from '@/lib/db';
import { Prisma } from '@/lib/db/generated/client';
import type { AuditCategory } from '@/lib/db/generated/enums';
import { codeCandidates, codeVariants, normalize } from '@/lib/domain/search';

/**
 * Audit log (AdminAudit mockup): filtered by person, category, period and text (a person, an
 * object, a Mon Master number), automatic actions hidden by default, newest first by cursor.
 */
export const AUDIT_CATEGORIES: Record<AuditCategory, { slug: string; label: string; cls: string }> =
  {
    FICHES: { slug: 'fiches', label: 'Fiches', cls: 'bg-violet-100 text-violet-700' },
    AVIS: { slug: 'avis', label: 'Avis', cls: 'bg-lime-100 text-lime-800' },
    VILLES: { slug: 'villes', label: 'Villes', cls: 'bg-coral-100 text-coral-800' },
    PARAMETRES: {
      slug: 'parametres',
      label: 'Paramètres',
      cls: 'bg-surface-100 text-[#3b3648] dark:text-ink-muted',
    },
    LEGAL: { slug: 'legal', label: 'Légal', cls: 'bg-danger-bg text-danger' },
    CONNEXION: {
      slug: 'connexion',
      label: 'Connexion',
      cls: 'bg-surface-100 text-[#3b3648] dark:text-ink-muted',
    },
    DONNEES: { slug: 'donnees', label: 'Données', cls: 'bg-warning-bg text-warning' },
  };

export const PERIODS = {
  '1': 'Aujourd’hui',
  '7': '7 derniers jours',
  '30': '30 derniers jours',
  '365': '12 derniers mois',
} as const;
export type Period = keyof typeof PERIODS;

export interface AuditQuery {
  q: string;
  /** Admin id, « system », or null (everyone). */
  who: string | null;
  category: AuditCategory | null;
  period: Period;
  /** Show automatic actions (system). Hidden by default. */
  auto: boolean;
  /** Entries about one object (« Historique » of a fiche). */
  target: string | null;
  /**
   * Légal entries shown: set by the server from the role (legal.manage), never read from the
   * address. False by default.
   */
  legal: boolean;
}

type Params = Record<string, string | string[] | undefined>;
const one = (sp: Params, k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) ?? '';

export function readAuditQuery(sp: Params, o: { legal?: boolean } = {}): AuditQuery {
  const cat = Object.entries(AUDIT_CATEGORIES).find(
    ([, c]) => c.slug === one(sp, 'categorie'),
  )?.[0] as AuditCategory | undefined;
  const per = one(sp, 'periode');
  return {
    q: one(sp, 'q').slice(0, 120),
    who: one(sp, 'personne') || null,
    category: cat ?? null,
    period: per in PERIODS ? (per as Period) : '7',
    auto: one(sp, 'auto') === '1' || one(sp, 'personne') === 'system',
    target: one(sp, 'objet') || null,
    legal: o.legal === true,
  };
}

export function auditQueryString(q: AuditQuery): string {
  const p = new URLSearchParams();
  if (q.q) p.set('q', q.q);
  if (q.who) p.set('personne', q.who);
  if (q.category) p.set('categorie', AUDIT_CATEGORIES[q.category].slug);
  if (q.period !== '7') p.set('periode', q.period);
  if (q.auto && q.who !== 'system') p.set('auto', '1');
  if (q.target) p.set('objet', q.target);
  return p.toString();
}

/** Start of the period, in Paris (« Aujourd'hui » = since midnight). */
function since(period: Period, now = new Date()): Date {
  if (period === '1') {
    const day = new Intl.DateTimeFormat('fr-CA', {
      timeZone: 'Europe/Paris',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
    const offset =
      new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Paris' })).getTime() -
      new Date(now.toLocaleString('en-US', { timeZone: 'UTC' })).getTime();
    return new Date(Date.parse(`${day}T00:00:00Z`) - offset);
  }
  return new Date(now.getTime() - Number(period) * 86_400_000);
}

async function whereSql(q: AuditQuery) {
  const sql = Prisma.sql;
  const words = normalize(q.q)
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .slice(0, 6);
  const codes = [...new Set(codeCandidates(q.q).flatMap((c) => codeVariants(c.code)))];
  const coded = codes.length
    ? (
        await prisma.identifier.findMany({
          where: { OR: codes.map((v) => ({ value: { startsWith: v } })) },
          select: { entityId: true },
          take: 500,
        })
      ).map((i) => i.entityId)
    : [];
  const text = words.length
    ? Prisma.join(
        words.map(
          (w) =>
            sql`public.nm_norm(a."actorLabel" || ' ' || a."objectLabel" || ' ' || a.detail || ' ' || a.action) LIKE ${`%${w}%`}`,
        ),
        ' AND ',
      )
    : sql`TRUE`;
  return Prisma.join(
    [
      sql`a.at >= ${since(q.period)}`,
      coded.length ? sql`(a."targetId" = ANY(${coded}) OR (${text}))` : text,
      q.who === 'system'
        ? sql`a."actorId" IS NULL`
        : q.who
          ? sql`a."actorId" = ${q.who}`
          : sql`TRUE`,
      q.auto ? sql`TRUE` : sql`a."actorId" IS NOT NULL`,
      q.category ? sql`a.category = ${q.category}::"AuditCategory"` : sql`TRUE`,
      q.target ? sql`a."targetId" = ${q.target}` : sql`TRUE`,
      q.legal ? sql`TRUE` : sql`a.category <> 'LEGAL'::"AuditCategory"`,
    ],
    ' AND ',
  );
}

export interface AuditRow {
  id: string;
  at: Date;
  actorId: string | null;
  actorLabel: string;
  category: AuditCategory;
  action: string;
  targetType: string | null;
  targetId: string | null;
  targetLabel: string;
  detail: string;
  diff: { field: string; before: string; after: string }[] | null;
  ip: string | null;
  sessionRef: string | null;
}

export const AUDIT_PAGE = 50;

/** One page, newest first; `before` = id of the last entry already shown. */
export async function getAuditPage(q: AuditQuery, before?: string | null, take = AUDIT_PAGE) {
  const sql = Prisma.sql;
  const ref = before
    ? await prisma.auditLog.findUnique({ where: { id: before }, select: { id: true, at: true } })
    : null;
  const where = await whereSql(q);
  const rows = await prisma.$queryRaw<AuditRow[]>`
    SELECT a.id, a.at, a."actorId", a."actorLabel", a.category, a.action, a."targetType", a."targetId",
           a."objectLabel" AS "targetLabel", a.detail, a.diff, a.ip, a."sessionRef"
      FROM "AuditLog" a
     WHERE ${where} AND ${ref ? sql`(a.at, a.id) < (${ref.at}, ${ref.id})` : sql`TRUE`}
     ORDER BY a.at DESC, a.id DESC
     LIMIT ${take + 1}`;
  const page = rows.slice(0, take);
  return { rows: page, next: rows.length > take ? page.at(-1)!.id : null };
}

export async function countAudit(q: AuditQuery): Promise<number> {
  const [r] = await prisma.$queryRaw<
    { n: number }[]
  >`SELECT count(*)::int AS n FROM "AuditLog" a WHERE ${await whereSql(q)}`;
  return r?.n ?? 0;
}

/** Page of the admin an entry is about (its object is a link), or null. */
export function auditHref(
  r: Pick<AuditRow, 'targetType' | 'targetId' | 'targetLabel'>,
): string | null {
  switch (r.targetType) {
    case 'PROGRAM':
    case 'MENTION':
    case 'UNIVERSITY':
      return r.targetId ? `/admin/fiches/${r.targetId}` : null;
    case 'REVIEW':
      return `/admin/avis?q=${encodeURIComponent(r.targetLabel)}`;
    case 'ZONE':
      return '/admin/parametres?onglet=villes';
    case 'SETTINGS':
      return r.targetId === 'bandeau' ? '/admin/parametres?onglet=bandeau' : '/admin/parametres';
    case 'SOURCE':
      return r.targetId
        ? `/admin/recuperation?onglet=journal&source=${r.targetId}`
        : '/admin/recuperation';
    case 'FICHES':
      return r.targetId?.startsWith('?') ? `/admin/fiches${r.targetId}` : '/admin/fiches';
    case 'LEGAL':
      return '/admin/moderation?file=legal';
    case 'ADMIN':
      return '/admin/equipe';
    default:
      return null;
  }
}

/** Every entry of the filter, by batches of 1 000 (CSV export). */
export async function* auditBatches(q: AuditQuery) {
  let before: string | null = null;
  for (;;) {
    const { rows, next } = await getAuditPage(q, before, 1000);
    if (rows.length) yield rows;
    if (!next) return;
    before = next;
  }
}
