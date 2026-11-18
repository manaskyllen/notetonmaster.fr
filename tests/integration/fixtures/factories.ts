/**
 * Factories of the integration fixtures: each creates (or completes) one kind of row with explicit,
 * deterministic values. Used by load.ts on the test database only.
 */
import { prisma } from '@/lib/db';
import type { EntryLevel, Modality, ReviewLevel } from '@/lib/db/generated/enums';

export async function city(c: {
  insee: string;
  name: string;
  slug: string;
  department: string;
  departmentCode: string;
  region: string;
  lat: number;
  lng: number;
}) {
  const data = {
    name: c.name,
    slug: c.slug,
    department: c.department,
    departmentCode: c.departmentCode,
    region: c.region,
    lat: c.lat,
    lng: c.lng,
  };
  return prisma.city.upsert({
    where: { inseeCode: c.insee },
    create: { inseeCode: c.insee, ...data },
    update: data,
  });
}

export async function university(u: {
  slug: string;
  name: string;
  city: string;
  region: string;
  mailDomains?: string[];
}) {
  return prisma.university.upsert({
    where: { slug: u.slug },
    create: {
      slug: u.slug,
      name: u.name,
      city: u.city,
      region: u.region,
      sector: 'PUBLIC',
      sectorSource: 'fixtures',
      establishmentType: 'Université',
      mailDomains: u.mailDomains ?? [],
    },
    update: { mailDomains: u.mailDomains ?? [] },
  });
}

export async function campus(c: {
  universityId: string;
  name: string;
  cityId: string;
  lat: number;
  lng: number;
}) {
  const key = c.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return prisma.campus.upsert({
    where: { universityId_cityId_key: { universityId: c.universityId, cityId: c.cityId, key } },
    create: { ...c, key },
    update: { lat: c.lat, lng: c.lng },
  });
}

export async function mention(m: { slug: string; name: string; domainSlug: string }) {
  const domain = await prisma.domain.findUniqueOrThrow({ where: { slug: m.domainSlug } });
  return prisma.mention.upsert({
    where: { slug: m.slug },
    create: { slug: m.slug, name: m.name, domainId: domain.id, levels: ['M1', 'M2'] },
    update: {},
  });
}

export async function accreditation(a: {
  mentionId: string;
  universityId: string;
  inm: string;
  predecessorId?: string;
}) {
  return prisma.mentionAccreditation.upsert({
    where: { inm_universityId: { inm: a.inm, universityId: a.universityId } },
    create: a,
    update: { predecessorId: a.predecessorId ?? null },
  });
}

export async function program(p: {
  slug: string;
  title: string;
  mentionId: string;
  universityId: string;
  city: string;
  campusId?: string;
  modality?: Modality;
  entryLevel?: EntryLevel;
  /** Latest session figures (access rate = offers / applications). */
  stats?: { session: number; applications: number; offers: number; capacity: number };
}) {
  const { stats, ...data } = p;
  const row = await prisma.program.upsert({
    where: { slug: p.slug },
    create: { ...data, isPublished: true, status: 'ACTIVE' },
    update: {},
  });
  if (stats)
    await prisma.admissionStat.create({
      data: { programId: row.id, source: 'Fixtures d’intégration', ...stats },
    });
  return row;
}

let reviewNumber = 0;
/** A published review (rating 1-5) on a program. */
export async function review(r: {
  programId: string;
  rating: number;
  level?: ReviewLevel;
  cohortYear?: number;
}) {
  reviewNumber += 1;
  const n = String(reviewNumber).padStart(6, '0');
  return prisma.review.create({
    data: {
      ref: `avis-f${n.slice(1)}`,
      programId: r.programId,
      authorEmailHash: `fixture-author-${n}`,
      level: r.level ?? 'M2',
      cohortYear: r.cohortYear ?? 2024,
      overallRating: r.rating,
      pros: 'Des cours exigeants et une équipe disponible tout au long de l’année.',
      cons: 'Peu d’accompagnement pour trouver un stage en première année.',
      status: 'PUBLISHED',
      publishedAt: new Date('2026-10-15T10:00:00Z'),
      submittedAt: new Date('2026-10-14T10:00:00Z'),
    },
  });
}
