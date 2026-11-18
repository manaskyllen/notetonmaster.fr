/**
 * Public / private establishments. notetonmaster covers the masters of public
 * universities and schools: private establishments listed by Mon Master stay in the database
 * but are hidden by default everywhere on the public site.
 *
 * This file is the only place that states the default rule. An establishment missing from the
 * annuaire (`sector` null) counts as private until an admin checks it.
 */

export type Sector = 'PUBLIC' | 'PRIVATE';

/** Public sector, as the public site understands it (null = not verified = private). */
export function isPublicSector(sector: Sector | null | undefined): boolean {
  return sector === 'PUBLIC';
}

/** Prisma filter on University: public establishments only. */
export const PUBLIC_UNIVERSITY = { sector: 'PUBLIC' } as const;

/** Program statuses counted and listed on the public site (drafts never are). */
export const LISTED_STATUSES = ['ACTIVE', 'NOT_RENEWED'] as const;

/** Prisma filter on Program: what the public site lists by default. */
export const PUBLIC_PROGRAM = {
  isPublished: true,
  status: { in: [...LISTED_STATUSES] },
  university: PUBLIC_UNIVERSITY,
} as const;

/** Type of establishment shown in the Explorer facet. */
export type EstablishmentKind = 'UNIVERSITY' | 'PUBLIC_SCHOOL' | 'PRIVATE';

export const ESTABLISHMENT_KINDS: { id: EstablishmentKind; slug: string; label: string }[] = [
  { id: 'UNIVERSITY', slug: 'universite', label: 'Université' },
  { id: 'PUBLIC_SCHOOL', slug: 'ecole-publique', label: 'École ou institut public' },
  { id: 'PRIVATE', slug: 'prive', label: 'Établissement privé' },
];

/** Kinds shown when the visitor has not chosen: public ones. */
export const DEFAULT_KINDS: EstablishmentKind[] = ['UNIVERSITY', 'PUBLIC_SCHOOL'];

/** Université (by type in the annuaire, or by name) / other public school / private. */
export function establishmentKind(u: {
  sector: Sector | null;
  establishmentType: string | null;
  name: string;
}): EstablishmentKind {
  if (!isPublicSector(u.sector)) return 'PRIVATE';
  if (u.establishmentType === 'Université') return 'UNIVERSITY';
  if (/^Universit|Universit[ée]$/i.test(u.name.trim())) return 'UNIVERSITY';
  return 'PUBLIC_SCHOOL';
}
