import { createHash } from 'node:crypto';
import { prisma } from '@/lib/db';
import type { AuditCategory } from '@/lib/db/generated/enums';

/** Kinds used by the callers before the categories (mapped to a category). */
export type AuditKind = 'AUTH' | 'MODERATION' | 'DATA' | 'SYNC' | 'LEGAL' | 'TEAM' | 'SETTINGS';

const KIND_CATEGORY: Record<AuditKind, AuditCategory> = {
  AUTH: 'CONNEXION',
  MODERATION: 'AVIS',
  DATA: 'FICHES',
  SYNC: 'DONNEES',
  LEGAL: 'LEGAL',
  TEAM: 'PARAMETRES',
  SETTINGS: 'PARAMETRES',
};

export interface AuditChange {
  field: string;
  before: string;
  after: string;
}

export interface AuditExtra {
  /** Category, when it differs from the kind's (a city opened: VILLES). */
  category?: AuditCategory;
  /** Verb of the sentence: « a arbitré un conflit sur ». */
  action?: string;
  /** What the entry is about: its page in the admin is linked from the log. */
  target?: { type: string; id?: string | null };
  /** Before / after of each field changed. */
  diff?: AuditChange[];
}

const show = (v: unknown): string => {
  if (v == null || v === '') return '—';
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—';
  if (typeof v === 'boolean') return v ? 'Oui' : 'Non';
  return String(v).slice(0, 300);
};

/** A diff entry from any two values (shown as text). */
export function change(field: string, before: unknown, after: unknown): AuditChange {
  return { field, before: show(before), after: show(after) };
}

/** « 203.0.113.7 » → « 203.0.x.x »; IPv6: the first two groups. Never stored in full. */
export function truncateIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const v4 = /^(?:::ffff:)?(\d+)\.(\d+)\.\d+\.\d+$/.exec(ip.trim());
  if (v4) return `${v4[1]}.${v4[2]}.x.x`;
  const groups = ip.trim().split(':').filter(Boolean);
  return groups.length >= 2 ? `${groups[0]}:${groups[1]}:x` : null;
}

type MetaProvider = (actorId: string) => Promise<{ ip: string | null; sessionRef: string | null }>;
let metaProvider: MetaProvider | null = null;

/**
 * IP and session of the request: registered by the Next.js side (lib/auth/admin.ts), never by
 * the worker (no request there, and Next's request APIs must stay out of its bundle).
 */
export function setAuditMetaProvider(p: MetaProvider) {
  metaProvider = p;
}

async function requestMeta(
  actorId: string | null,
): Promise<{ ip: string | null; sessionRef: string | null }> {
  if (!actorId || !metaProvider) return { ip: null, sessionRef: null };
  try {
    return await metaProvider(actorId);
  } catch {
    return { ip: null, sessionRef: null };
  }
}

/** Short reference of a session (4 hex characters), never the cookie itself. */
export function sessionRefOf(adminId: string, issuedAt: number | undefined): string {
  return createHash('sha256')
    .update(`${adminId}:${issuedAt ?? ''}`)
    .digest('hex')
    .slice(0, 4);
}

/**
 * Appends an audit entry. actor = null means « Système » (automatic actions). The table only
 * accepts inserts (database trigger).
 */
export async function audit(
  actor: { id: string; name: string } | null,
  kind: AuditKind | AuditCategory,
  targetLabel: string,
  detail: string,
  extra: AuditExtra = {},
) {
  const category =
    extra.category ??
    (kind in KIND_CATEGORY ? KIND_CATEGORY[kind as AuditKind] : (kind as AuditCategory));
  const meta = await requestMeta(actor?.id ?? null);
  await prisma.auditLog.create({
    data: {
      actorId: actor?.id ?? null,
      actorLabel: actor?.name ?? 'Système',
      category,
      action: extra.action?.slice(0, 120) ?? '',
      targetType: extra.target?.type ?? null,
      targetId: extra.target?.id ?? null,
      targetLabel: targetLabel.slice(0, 300),
      detail: detail.slice(0, 1000),
      diff: extra.diff?.length ? (extra.diff.slice(0, 50) as never) : undefined,
      ip: meta.ip,
      sessionRef: meta.sessionRef,
    },
  });
}
