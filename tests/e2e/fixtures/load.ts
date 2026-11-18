/**
 * End-to-end dataset, loaded on the template database after the demo seed and the integration
 * fixtures (scripts/e2e-db.ts). Deterministic, and only what the screens need on top of them:
 * - the origins of the admitted of « Valorisation des nouveaux patrimoines », sessions 2023 to 2025
 *   (Mon Master open data): « D'où viennent les admis ? » on its Admission tab;
 * - 30 parcours of the integration lot in work-study: the « Alternance » filter spans two pages;
 *   5 others enter in M2, as the Oniris one below: the « M2 » filter;
 * - a second establishment in Nantes, Oniris (one parcours), that a test makes an
 *   établissement-composante of Nantes Université;
 * - Paris, a commune outside the open cities: « Paris n'est pas encore sur notetonmaster »;
 * - four closed cities, Lyon, Marseille and Rennes with one parcours each, Sarrebourg without
 *   any: the tests that open more than three cities.
 * Ends by recomputing what the application derives, as after a sync.
 *
 * Run: tsx tests/e2e/fixtures/load.ts (DATABASE_URL = the template database).
 */
import { prisma } from '@/lib/db';
import { rebuildProgramSearchIndex } from '@/lib/catalog/program-index';
import { refreshIndexRatings, refreshZoneStats } from '@/lib/catalog/index-ratings';
import { computeSiteCommunes, refreshOpenZoneFlags } from '@/lib/launch/zones';
import { campus, city, program, university } from '../../integration/fixtures/factories';
import { FX } from '../../integration/fixtures/ids';

type Kind = 'LICENCE' | 'LICENCE_PRO' | 'BUT' | 'MASTER' | 'OTHER' | 'NOT_ENROLLED';
/** Per session: admitted, then [origin, applications, offers, admitted]. */
const VNP_ORIGINS: Record<number, { accepted: number; rows: [Kind, number, number, number][] }> = {
  2023: {
    accepted: 10,
    rows: [
      ['LICENCE', 75, 17, 8],
      ['LICENCE_PRO', 1, 0, 0],
      ['MASTER', 11, 2, 2],
      ['OTHER', 2, 1, 0],
      ['NOT_ENROLLED', 24, 3, 0],
    ],
  },
  2024: {
    accepted: 17,
    rows: [
      ['LICENCE', 104, 21, 11],
      ['LICENCE_PRO', 5, 0, 0],
      ['BUT', 1, 0, 0],
      ['MASTER', 17, 1, 0],
      ['OTHER', 8, 2, 1],
      ['NOT_ENROLLED', 26, 10, 5],
    ],
  },
  2025: {
    accepted: 18,
    rows: [
      ['LICENCE', 224, 40, 16],
      ['LICENCE_PRO', 8, 0, 0],
      ['BUT', 4, 0, 0],
      ['MASTER', 30, 3, 1],
      ['OTHER', 16, 2, 1],
      ['NOT_ENROLLED', 38, 2, 0],
    ],
  },
};

async function main() {
  const vnp = await prisma.program.findUniqueOrThrow({ where: { slug: FX.programs.vnp } });
  for (const [session, { accepted, rows }] of Object.entries(VNP_ORIGINS)) {
    const stats = await prisma.admissionStat.findMany({
      where: { programId: vnp.id, session: Number(session) },
      orderBy: { id: 'asc' },
    });
    const stat = stats[0];
    if (!stat) throw new Error(`No admission stat of VNP for ${session}`);
    await prisma.admissionStat.update({ where: { id: stat.id }, data: { accepted } });
    await prisma.admissionOrigin.deleteMany({ where: { admissionStatId: stat.id } });
    await prisma.admissionOrigin.createMany({
      data: rows.map(([origin, applications, offers, acc]) => ({
        admissionStatId: stat.id,
        origin,
        applications,
        offers,
        accepted: acc,
      })),
    });
  }

  const lot = Array.from({ length: 30 }, (_, i) => `${FX.programs.lotPrefix}${String(i + 1).padStart(3, '0')}`);
  await prisma.program.updateMany({ where: { slug: { in: lot } }, data: { modality: 'WORK_STUDY' } });
  const m2 = Array.from({ length: 5 }, (_, i) => `${FX.programs.lotPrefix}${String(i + 31).padStart(3, '0')}`);
  await prisma.program.updateMany({ where: { slug: { in: m2 } }, data: { entryLevel: 'M2' } });

  const oniris = await university({
    slug: 'oniris-vetagrobio',
    name: 'Oniris VetAgroBio Nantes',
    city: 'Nantes',
    region: 'Pays de la Loire',
  });
  const nantes = await prisma.city.findUniqueOrThrow({ where: { inseeCode: FX.insee.nantes } });
  const chantrerie = await campus({
    universityId: oniris.id,
    name: 'Campus de la Chantrerie',
    cityId: nantes.id,
    lat: 47.2876,
    lng: -1.5205,
  });
  const droit = await prisma.mention.findUniqueOrThrow({ where: { slug: FX.mentions.droit } });
  await program({
    slug: 'e2e-droit-animal-oniris',
    title: 'Droit et éthique de l’animal (fixtures)',
    mentionId: droit.id,
    universityId: oniris.id,
    city: 'Nantes',
    campusId: chantrerie.id,
    entryLevel: 'M2',
    stats: { session: 2025, applications: 60, offers: 24, capacity: 16 },
  });

  await city({
    insee: '75056',
    name: 'Paris',
    slug: 'paris',
    department: 'Paris',
    departmentCode: '75',
    region: 'Île-de-France',
    lat: 48.8566,
    lng: 2.3522,
  });
  const closed = [
    { slug: 'lyon', name: 'Lyon', insee: '69123', epci: ['200046977', 'Métropole de Lyon'], dep: ['Rhône', '69'], region: 'Auvergne-Rhône-Alpes', lat: 45.764, lng: 4.8357 },
    { slug: 'marseille', name: 'Marseille', insee: '13055', epci: ['200054807', 'Métropole d’Aix-Marseille-Provence'], dep: ['Bouches-du-Rhône', '13'], region: 'Provence-Alpes-Côte d’Azur', lat: 43.2965, lng: 5.3698 },
    { slug: 'rennes', name: 'Rennes', insee: '35238', epci: ['243500139', 'Rennes Métropole'], dep: ['Ille-et-Vilaine', '35'], region: 'Bretagne', lat: 48.1173, lng: -1.6778 },
    { slug: 'sarrebourg', name: 'Sarrebourg', insee: '57630', epci: ['200068146', 'CC de Sarrebourg Moselle Sud'], dep: ['Moselle', '57'], region: 'Grand Est', lat: 48.7353, lng: 7.0538 },
  ];
  for (const [i, z] of closed.entries()) {
    const c = await city({
      insee: z.insee,
      name: z.name,
      slug: z.slug,
      department: z.dep[0]!,
      departmentCode: z.dep[1]!,
      region: z.region,
      lat: z.lat,
      lng: z.lng,
    });
    await prisma.launchZone.upsert({
      where: { slug: z.slug },
      create: {
        slug: z.slug,
        name: z.name,
        epciCode: z.epci[0]!,
        epciName: z.epci[1]!,
        communeCodes: [z.insee],
        open: false,
        order: 10 + i,
        region: z.region,
        // the yearly refresh of the communes (worker, API Découpage administratif) is not due
        communesRefreshedAt: new Date(),
      },
      update: {},
    });
    if (z.slug === 'sarrebourg') continue;
    const u = await university({
      slug: `e2e-universite-${z.slug}`,
      name: `Université de ${z.name} (fixtures)`,
      city: z.name,
      region: z.region,
    });
    const site = await campus({ universityId: u.id, name: `Campus de ${z.name}`, cityId: c.id, lat: z.lat, lng: z.lng });
    await program({
      slug: `e2e-droit-${z.slug}`,
      title: `Droit (fixtures, ${z.name})`,
      mentionId: droit.id,
      universityId: u.id,
      city: z.name,
      campusId: site.id,
    });
  }

  await computeSiteCommunes(null);
  await refreshOpenZoneFlags(null);
  await rebuildProgramSearchIndex();
  await refreshIndexRatings();
  await refreshZoneStats();
  await prisma.$executeRaw`SELECT nm_refresh_search_document()`;
  console.log('[fixtures] end-to-end dataset loaded');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
