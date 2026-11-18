import { auditHref, AUDIT_CATEGORIES, type AuditRow } from './audit-query';
import { dayHeading, parisDay } from './when';

/** An audit entry as the page shows it (serialisable for the client). */
export interface AuditEntry {
  id: string;
  day: string;
  dayLabel: string;
  time: string;
  who: string;
  initials: string;
  /** Avatar colours, one per person (system: grey « S »). */
  avatar: string;
  /** Verb (« a arbitré un conflit sur »), or the free detail of an older entry. */
  action: string | null;
  detail: string;
  target: string;
  href: string | null;
  category: string;
  categoryCls: string;
  diff: { field: string; before: string; after: string }[];
  meta: string;
}

const AVATARS = [
  'bg-violet-500 text-on-violet',
  'bg-lime-400 text-on-lime',
  'bg-[#ffb59e] text-[#16131f]',
  'bg-[#1f5fae] text-white',
  'bg-[#1baf7a] text-[#16131f]',
  'bg-[#eda100] text-[#16131f]',
];
const hm = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  hour: '2-digit',
  minute: '2-digit',
});

function initials(name: string): string {
  const parts = name
    .replace(/[^\p{L}\s-]/gu, ' ')
    .split(/[\s-]+/)
    .filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase();
}

function colour(id: string): string {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATARS[h % AVATARS.length]!;
}

export async function toEntries(rows: AuditRow[], now = new Date()): Promise<AuditEntry[]> {
  return rows.map((r) => {
    const system = !r.actorId;
    const at = new Date(r.at);
    return {
      id: r.id,
      day: parisDay(at),
      dayLabel: dayHeading(at, now),
      time: hm.format(at),
      who: system ? 'Système' : r.actorLabel,
      initials: system ? 'S' : initials(r.actorLabel),
      avatar: system ? 'bg-surface-100 text-ink-muted' : colour(r.actorId!),
      action: r.action || null,
      detail: r.detail,
      target: r.targetLabel,
      href: auditHref(r),
      category: AUDIT_CATEGORIES[r.category].label,
      categoryCls: AUDIT_CATEGORIES[r.category].cls,
      diff: Array.isArray(r.diff) ? r.diff : [],
      meta: system
        ? 'action automatique'
        : [r.ip && `ip ${r.ip}`, r.sessionRef && `session ${r.sessionRef}`]
            .filter(Boolean)
            .join(' · ') || 'ip et session non enregistrées (entrée ancienne)',
    };
  });
}
