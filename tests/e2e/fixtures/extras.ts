/**
 * Data of the end-to-end tests that used to skip themselves when the database lacked it (called by
 * load.ts, before the derived tables are recomputed). All in Nantes, an open city, at Nantes
 * Université: the lists of open cities stay the same.
 * - a law parcours taught abroad (Phnom Penh): the « À l'étranger » facet of /mentions/droit;
 * - a law parcours with its programme (two semesters, law courses and others): law is the « Cœur
 *   du master » of a law parcours (32-programme);
 * - a mention with a single parcours: « Même mention, ailleurs » hidden (35-fiche-allegee);
 * - a Mon Master simulation that proposes a merge: a new 2025 number of a parcours already known
 *   under another number (same UAI, inmp, place and modality), replayed from the pilot extracts
 *   without network as `make data-replay-pilot` does (12-rapprochements).
 */
import { copyFile, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prisma } from '@/lib/db';
import { classifyCourse } from '@/lib/domain/course-categories';
import { semesterIdentity } from '@/lib/domain/program-outline';
import { replay } from '../../../scripts/data-replay';
import { mention, program } from '../../integration/fixtures/factories';
import { FX } from '../../integration/fixtures/ids';
import { E2E_EXTRAS } from './names';


const PROGRAMME: { label: string; courses: string[] }[] = [
  {
    label: 'M1 · Semestre 1',
    courses: [
      'Droit des contrats approfondi',
      'Droit des sociétés',
      'Anglais juridique',
      'Méthodologie de la recherche',
    ],
  },
  {
    label: 'M1 · Semestre 2',
    courses: ['Droit fiscal des affaires', 'Droit de la concurrence', 'Stage en entreprise'],
  },
];

export async function loadExtras() {
  const nantes = await prisma.university.findUniqueOrThrow({
    where: { slug: FX.universities.nantes },
    include: { campuses: { include: { city: true } } },
  });
  const tertre = nantes.campuses.find((c) => c.city?.name === 'Nantes');
  if (!tertre) throw new Error('No campus of Nantes Université in Nantes');
  const droit = await prisma.mention.findUniqueOrThrow({ where: { slug: FX.mentions.droit } });

  // Taught in Nantes and abroad (a delocalised parcours): no campus, its places as Mon Master
  // gives them (`lieux`); Nantes publishes it, Phnom Penh makes it « à l'étranger ».
  const abroad = await program({
    slug: E2E_EXTRAS.abroad,
    title: 'Droit international et comparé (fixtures, Phnom Penh)',
    mentionId: droit.id,
    universityId: nantes.id,
    city: 'Phnom Penh',
  });
  await prisma.admissionStat.deleteMany({ where: { programId: abroad.id } });
  await prisma.admissionStat.create({
    data: {
      programId: abroad.id,
      session: 2025,
      source: 'Fixtures de bout en bout',
      raw: {
        lieux:
          'Faculté de droit et des sciences politiques - NANTES (44)|Université royale de droit et des sciences économiques - PHNOM PENH (CAMBODGE)',
      },
    },
  });

  const law = await program({
    slug: E2E_EXTRAS.programme,
    title: 'Droit des affaires (fixtures, Nantes)',
    mentionId: droit.id,
    universityId: nantes.id,
    city: 'Nantes',
    campusId: tertre.id,
  });
  await prisma.programSemester.deleteMany({ where: { programId: law.id } });
  for (const [position, s] of PROGRAMME.entries()) {
    const { year, number } = semesterIdentity(s.label);
    await prisma.programSemester.create({
      data: {
        programId: law.id,
        position,
        label: s.label,
        year,
        number,
        sourceDocument: 'Fixtures de bout en bout',
        sourceYear: '2025-2026',
        courses: {
          create: s.courses.map((label, order) => ({
            label,
            order,
            ects: 6,
            category: classifyCourse(label, { mentionName: droit.name }),
            source: 'Fixtures de bout en bout',
          })),
        },
      },
    });
  }

  const nordic = await mention({
    slug: E2E_EXTRAS.single.mention,
    name: 'Études nordiques',
    domainSlug: 'arts-lettres-langues',
  });
  await program({
    slug: E2E_EXTRAS.single.program,
    title: 'Langues et cultures scandinaves (fixtures)',
    mentionId: nordic.id,
    universityId: nantes.id,
    city: 'Nantes',
    campusId: tertre.id,
  });

  await mergeProposal();
}

/** The pilot extracts of Mon Master, plus one 2025 line under a new number, replayed. */
async function mergeProposal() {
  const pilot = 'fixtures/live/monmaster-opendata';
  const dir = await mkdtemp(join(tmpdir(), 'nm-e2e-monmaster-'));
  try {
    for (const f of await readdir(pilot)) await copyFile(join(pilot, f), join(dir, f));
    const file = join(dir, 'mon_master_2024_2025.csv');
    const csv = await readFile(file, 'utf8');
    const sibling = csv
      .split(/\r?\n/)
      .find((l) => l.startsWith('2025;') && l.includes(';2000144GJ2FE;'));
    if (!sibling) throw new Error('No 2025 line of 2000144GJ2FE in the pilot extracts');
    const line = sibling.replace(';2000144GJ2FE;', `;${E2E_EXTRAS.mergeIfc};`);
    await writeFile(file, `${csv.replace(/\r?\n?$/, '')}\n${line}\n`);
    const run = await replay('monmaster-opendata', dir, 'PREVIEW');
    if (run.status !== 'SUCCEEDED') throw new Error(`Mon Master replay: ${run.status}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
