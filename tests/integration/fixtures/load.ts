/**
 * Integration dataset, loaded on the test database after the migrations and the demo seed
 * (tests/integration/setup/global.ts). Deterministic: same rows at every run, whatever the local
 * database holds. Ends by recomputing what the application derives (sites, open cities, ratings,
 * search index, search view), exactly as after a sync.
 *
 * Run: tsx tests/integration/fixtures/load.ts (DATABASE_URL = the test database).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { prisma } from '@/lib/db';
import { computeSiteCommunes, refreshOpenZoneFlags } from '@/lib/launch/zones';
import { refreshProgramRatings } from '@/lib/catalog/program-ratings';
import { rebuildProgramSearchIndex } from '@/lib/catalog/program-index';
import { refreshIndexRatings, refreshZoneStats } from '@/lib/catalog/index-ratings';
import { accreditation, campus, city, mention, program, review, university } from './factories';
import { FX } from './ids';

type Origin = { origin: string; applications: number | null; offers: number | null; accepted: number | null };
const monmaster = JSON.parse(
  readFileSync(join(import.meta.dirname, 'data/monmaster.json'), 'utf8'),
) as {
  vnp: { code: string; session: number; applications: number; offers: number; capacity: number; raw: object }[];
  acpci: {
    code: string;
    session: number;
    accepted: number | null;
    acceptedSameInstitution: number | null;
    acceptedSameAcademy: number | null;
    acceptedAtMainPhaseStart: number | null;
    origins: Origin[] | null;
  }[];
};

async function places() {
  const pdl = { department: 'Loire-Atlantique', departmentCode: '44', region: 'Pays de la Loire' };
  const ge67 = { department: 'Bas-Rhin', departmentCode: '67', region: 'Grand Est' };
  const ge68 = { department: 'Haut-Rhin', departmentCode: '68', region: 'Grand Est' };
  return {
    nantes: await city({ insee: FX.insee.nantes, name: 'Nantes', slug: 'nantes', ...pdl, lat: 47.2181, lng: -1.5528 }),
    saintNazaire: await city({ insee: FX.insee.saintNazaire, name: 'Saint-Nazaire', slug: 'saint-nazaire', ...pdl, lat: 47.2802, lng: -2.2105 }),
    strasbourg: await city({ insee: FX.insee.strasbourg, name: 'Strasbourg', slug: 'strasbourg', ...ge67, lat: 48.5846, lng: 7.7507 }),
    illkirch: await city({ insee: FX.insee.illkirch, name: 'Illkirch-Graffenstaden', slug: 'illkirch-graffenstaden', ...ge67, lat: 48.5302, lng: 7.7151 }),
    colmar: await city({ insee: FX.insee.colmar, name: 'Colmar', slug: 'colmar', ...ge68, lat: 48.0817, lng: 7.3556 }),
    mulhouse: await city({ insee: FX.insee.mulhouse, name: 'Mulhouse', slug: 'mulhouse', ...ge68, lat: 47.7508, lng: 7.3359 }),
  };
}

async function main() {
  const c = await places();

  // Nantes Université (demo seed): its official staff domain, never the student one.
  const nantes = await university({
    slug: FX.universities.nantes,
    name: 'Nantes Université',
    city: 'Nantes',
    region: 'Pays de la Loire',
    mailDomains: [FX.nantesMailDomain],
  });

  // Strasbourg: Illkirch (Eurométropole, open), Colmar (closed).
  const unistra = await university({
    slug: FX.universities.strasbourg,
    name: 'Université de Strasbourg (fixtures)',
    city: 'Strasbourg',
    region: 'Grand Est',
    mailDomains: ['unistra.fr'],
  });
  const droit = await mention({ slug: FX.mentions.droit, name: 'Droit', domainSlug: 'droit-economie-gestion' });
  const illkirchCampus = await campus({ universityId: unistra.id, name: 'Campus d’Illkirch', cityId: c.illkirch.id, lat: 48.5265, lng: 7.7368 });
  const colmarCampus = await campus({ universityId: unistra.id, name: 'Campus de Colmar', cityId: c.colmar.id, lat: 48.0794, lng: 7.3585 });
  const illkirch = await program({
    slug: FX.programs.illkirch,
    title: 'Droit des affaires (fixtures)',
    mentionId: droit.id,
    universityId: unistra.id,
    city: 'Illkirch-Graffenstaden',
    campusId: illkirchCampus.id,
    modality: 'WORK_STUDY',
    entryLevel: 'M1',
    // 20 % of offers: « sélectif »
    stats: { session: 2025, applications: 200, offers: 40, capacity: 30 },
  });
  await program({
    slug: FX.programs.colmar,
    title: 'Droit public (fixtures)',
    mentionId: droit.id,
    universityId: unistra.id,
    city: 'Colmar',
    campusId: colmarCampus.id,
    stats: { session: 2025, applications: 80, offers: 40, capacity: 20 },
  });

  // Saint-Nazaire: Nantes Université, outside Nantes Métropole; its mention has nothing open.
  const maritime = await mention({ slug: FX.mentions.saintNazaire, name: 'Génie maritime (fixtures)', domainSlug: 'sciences-technologies-sante' });
  const snCampus = await campus({ universityId: nantes.id, name: 'Campus de Saint-Nazaire', cityId: c.saintNazaire.id, lat: 47.2735, lng: -2.2138 });
  await program({
    slug: FX.programs.saintNazaire,
    title: 'Génie maritime (fixtures)',
    mentionId: maritime.id,
    universityId: nantes.id,
    city: 'Saint-Nazaire',
    campusId: snCampus.id,
  });

  // A parcours for the questions and answers, without any question.
  const culture = await prisma.mention.findUniqueOrThrow({ where: { slug: 'culture-patrimoine-et-mediation' } });
  const nantesCampus = await campus({ universityId: nantes.id, name: 'Campus Tertre', cityId: c.nantes.id, lat: 47.2423, lng: -1.5547 });
  await program({
    slug: FX.programs.questions,
    title: 'Médiation numérique (fixtures)',
    mentionId: culture.id,
    universityId: nantes.id,
    city: 'Nantes',
    campusId: nantesCampus.id,
  });

  // The bulk lot: 190 published fiches in Mulhouse (open), one establishment, one mention.
  const lotUni = await university({ slug: FX.universities.lot, name: 'Université du lot (fixtures)', city: 'Mulhouse', region: 'Grand Est' });
  const lotMention = await mention({ slug: FX.mentions.lot, name: 'Mention du lot (fixtures)', domainSlug: 'sciences-humaines-et-sociales' });
  const lotCampus = await campus({ universityId: lotUni.id, name: 'Campus du lot', cityId: c.mulhouse.id, lat: 47.7322, lng: 7.3113 });
  for (let i = 1; i <= FX.lotSize; i++) {
    const n = String(i).padStart(3, '0');
    await program({
      slug: `${FX.programs.lotPrefix}${n}`,
      title: `Parcours du lot ${n}`,
      mentionId: lotMention.id,
      universityId: lotUni.id,
      city: 'Mulhouse',
      campusId: lotCampus.id,
    });
  }

  // VNP: 2023 and 2024 under the former number 1703164RZYBS of the former mention
  // « Civilisations, cultures et sociétés » (accreditation 1703164R), 2025 under 2500101KDKQN.
  const vnp = await prisma.program.findUniqueOrThrow({ where: { slug: FX.programs.vnp } });
  const civilisations = await mention({ slug: FX.mentions.civilisations, name: 'Civilisations, cultures et sociétés', domainSlug: 'sciences-humaines-et-sociales' });
  const former = await accreditation({ mentionId: civilisations.id, universityId: nantes.id, inm: '1703164R' });
  const current = await accreditation({ mentionId: culture.id, universityId: nantes.id, inm: '2500101K', predecessorId: former.id });
  await prisma.program.update({ where: { id: vnp.id }, data: { accreditationId: current.id } });
  for (const s of monmaster.vnp) {
    const entry = await prisma.monMasterEntry.upsert({
      where: { code: s.code },
      create: { code: s.code, programId: vnp.id, firstSession: s.session, lastSession: s.session },
      update: {},
    });
    const existing = await prisma.admissionStat.findFirst({ where: { programId: vnp.id, monMasterEntryId: entry.id, session: s.session } });
    const data = { applications: s.applications, offers: s.offers, capacity: s.capacity, raw: s.raw };
    if (existing) await prisma.admissionStat.update({ where: { id: existing.id }, data });
    else
      await prisma.admissionStat.create({
        data: { programId: vnp.id, monMasterEntryId: entry.id, session: s.session, source: 'Mon Master · données ouvertes', ...data },
      });
  }

  // ACPCI: its two numbers, with the admitted and their origins, session by session.
  const acpci = await prisma.program.findUniqueOrThrow({ where: { slug: FX.programs.acpci } });
  for (const s of monmaster.acpci) {
    const stat = await prisma.admissionStat.findFirstOrThrow({
      where: { programId: acpci.id, session: s.session, monMasterEntry: { code: s.code } },
    });
    await prisma.admissionStat.update({
      where: { id: stat.id },
      data: {
        accepted: s.accepted,
        acceptedSameInstitution: s.acceptedSameInstitution,
        acceptedSameAcademy: s.acceptedSameAcademy,
        acceptedAtMainPhaseStart: s.acceptedAtMainPhaseStart,
      },
    });
    await prisma.admissionOrigin.deleteMany({ where: { admissionStatId: stat.id } });
    for (const o of s.origins ?? [])
      await prisma.admissionOrigin.create({
        data: { admissionStatId: stat.id, origin: o.origin as never, applications: o.applications, offers: o.offers, accepted: o.accepted },
      });
  }

  // Ratings for the sorts: two rated parcours besides the demo ones, a tie broken by the count.
  await review({ programId: illkirch.id, rating: 5 });
  await review({ programId: illkirch.id, rating: 4 });
  const hac = await prisma.program.findUniqueOrThrow({ where: { slug: 'histoire-de-l-art-et-culture-materielle' } });
  await review({ programId: hac.id, rating: 5 });
  await review({ programId: hac.id, rating: 4 });
  await review({ programId: hac.id, rating: 5 });
  await review({ programId: hac.id, rating: 4 });

  // What the application derives, as after a sync.
  await computeSiteCommunes(null);
  await refreshOpenZoneFlags(null);
  await refreshProgramRatings(null);
  await rebuildProgramSearchIndex();
  await refreshIndexRatings();
  await refreshZoneStats();
  await prisma.$executeRaw`SELECT nm_refresh_search_document()`;

  const counts = {
    programs: await prisma.program.count(),
    indexed: await prisma.programSearchIndex.count(),
    reviews: await prisma.review.count({ where: { status: 'PUBLISHED' } }),
  };
  console.log(`[fixtures] integration dataset loaded ${JSON.stringify(counts)}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
