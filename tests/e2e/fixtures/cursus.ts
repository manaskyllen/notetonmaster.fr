/**
 * Cursus of one parcours (issue #21), end-to-end data. At the Université de Strasbourg of the
 * fixtures (campus of Illkirch, an open city), as Mon Master publishes them, one fiche per number:
 * - « Projets de coopération et intelligence collective » with the three real Strasbourg numbers,
 *   told apart only by their teaching place (Strasbourg, Kehl, Passau), the long title included;
 * - an initial / work-study pair;
 * - 25 numbers that nothing tells apart (as the ICP « Professeurs des Lycées et Collèges »);
 * - 26 cursus named by their city (as the CNAM « Marketing intégré »).
 * Then the grouping, as at the end of a Mon Master sync, on these fiches only.
 */
import { prisma } from '@/lib/db';
import { mergeGroup, planCursus, recomputeCursusLabels } from '@/lib/catalog/cursus';
import { mention } from '../../integration/fixtures/factories';
import { FX } from '../../integration/fixtures/ids';

const SOURCE = 'Mon Master · données ouvertes';
const LONG =
  'Projets de coopération et intelligence collective (tronc commun menant vers les M2 : « Management de projets de coopération internationaux et multilingues » et « Intelligence collective et écosystèmes innovants en Europe »)';
const CNAM_CITIES = [
  'DIJON', 'EVRY', 'CHOLET', 'AMIENS', 'ARRAS', 'DAX', 'NANTES', 'SAINT -ETIENNE', 'TOULOUSE',
  'MONTPELLIER', 'MARSEILLE', 'LILLE', 'ROUEN', 'CAEN', 'BREST', 'RENNES', 'TOURS', 'POITIERS',
  'LIMOGES', 'CLERMONT-FERRAND', 'GRENOBLE', 'LYON', 'METZ', 'REIMS', 'BESANCON', 'LA ROCHE SUR YON',
];

interface Fiche {
  slug: string;
  title: string;
  code: string;
  lieux: string;
  workStudy?: boolean;
  inmp: string;
  stats: [capacity: number, applications: number, offers: number];
}

export async function loadCursus() {
  const unistra = await prisma.university.findUniqueOrThrow({ where: { slug: FX.universities.strasbourg } });
  const illkirch = await prisma.campus.findFirstOrThrow({
    where: { universityId: unistra.id, name: 'Campus d’Illkirch' },
  });
  const lea = await mention({ slug: 'e2e-lea', name: 'Langues étrangères appliquées', domainSlug: 'arts-lettres-langues' });
  const meef = await mention({ slug: 'e2e-meef-second-degre', name: 'MEEF second degré (fixtures)', domainSlug: 'sciences-humaines-et-sociales' });
  const marketing = await mention({ slug: 'e2e-marketing-vente', name: 'Marketing, vente (fixtures)', domainSlug: 'droit-economie-gestion' });

  const groups: { mentionId: string; fiches: Fiche[] }[] = [
    {
      mentionId: lea.id,
      fiches: [
        { slug: 'e2e-pcic-strasbourg', title: LONG, code: '2400012P6SQF', inmp: '2400012-03Y', stats: [30, 338, 59], lieux: 'Université de Strasbourg - STRASBOURG CEDEX (67)|Faculté des Langues - STRASBOURG (67)' },
        { slug: 'e2e-pcic-kehl', title: LONG, code: '2400012PGW1S', inmp: '2400012-03Y', stats: [10, 53, 26], lieux: 'Université de Strasbourg - STRASBOURG CEDEX (67)|Faculté des Langues - STRASBOURG (67)|Hochschule für öffentliche Verwaltung - KEHL' },
        { slug: 'e2e-pcic-passau', title: LONG, code: '2400012PISGY', inmp: '2400012-03Y', stats: [2, 42, 2], lieux: 'Université de Strasbourg - STRASBOURG CEDEX (67)|Faculté des Langues - STRASBOURG (67)|Universität Passau - PASSAU' },
      ],
    },
    {
      mentionId: lea.id,
      fiches: [
        { slug: 'e2e-mdp-initiale', title: 'Management de projets (fixtures cursus)', code: 'E2E21MDPINIT', inmp: 'E2E21-01A', stats: [24, 180, 40], lieux: 'Faculté des Langues - STRASBOURG (67)' },
        { slug: 'e2e-mdp-alternance', title: 'Management de projets (fixtures cursus)', code: 'E2E21MDPALTE', inmp: 'E2E21-01A', workStudy: true, stats: [12, 60, 20], lieux: 'Faculté des Langues - STRASBOURG (67)' },
      ],
    },
    {
      mentionId: meef.id,
      fiches: Array.from({ length: 25 }, (_, i) => ({
        slug: `e2e-plc-${i + 1}`,
        title: 'Enseignement du second degré (fixtures)',
        code: `E2E21PLC${String(i + 1).padStart(4, '0')}`,
        inmp: 'E2E21-02B',
        stats: [10 + i, 40 + 3 * i, 8 + i] as Fiche['stats'],
        lieux: 'ISFEC - STRASBOURG (67)',
      })),
    },
    {
      mentionId: marketing.id,
      fiches: CNAM_CITIES.map((c, i) => ({
        slug: `e2e-cnam-${i + 1}`,
        title: 'Marketing intégré dans un monde digitalisé (fixtures)',
        code: `E2E21CNAM${String(i + 1).padStart(3, '0')}`,
        inmp: 'E2E21-03C',
        workStudy: true,
        stats: [5 + (i % 7), 20 + i, 4 + (i % 5)] as Fiche['stats'],
        lieux: `Cnam - ${c}`,
      })),
    },
  ];

  const ids: string[] = [];
  for (const g of groups)
    for (const f of g.fiches) {
      const p = await prisma.program.upsert({
        where: { slug: f.slug },
        create: {
          slug: f.slug,
          title: f.title,
          mentionId: g.mentionId,
          universityId: unistra.id,
          city: 'Strasbourg',
          campusId: illkirch.id,
          modality: f.workStudy ? 'WORK_STUDY' : 'ONSITE',
          isPublished: true,
          status: 'ACTIVE',
          origin: 'SYNC',
          applicationPlatform: 'Mon Master',
          examModes: g.mentionId === lea.id ? ['Dossier', 'Entretien'] : [],
          expectations:
            g.mentionId === lea.id
              ? ['Connaître l’environnement institutionnel français', 'Maîtriser deux langues étrangères']
              : [],
        },
        update: {},
      });
      ids.push(p.id);
      const e = await prisma.monMasterEntry.upsert({
        where: { code: f.code },
        create: {
          code: f.code,
          programId: p.id,
          label: f.title,
          inmp: f.inmp,
          workStudy: !!f.workStudy,
          places: f.lieux,
          firstSession: 2025,
          lastSession: 2025,
        },
        update: {},
      });
      const [capacity, applications, offers] = f.stats;
      await prisma.admissionStat.create({
        data: {
          programId: p.id,
          monMasterEntryId: e.id,
          session: 2025,
          source: SOURCE,
          capacity,
          applications,
          offers,
          raw: {
            alternance: f.workStudy ? '1' : '0',
            modalite_enseignement: f.workStudy ? 'APPRENTISSAGE' : 'INITIALE',
            lieux: f.lieux,
          },
        },
      });
      await prisma.identifier.createMany({
        data: [{ entityType: 'PROGRAM', entityId: p.id, kind: 'MONMASTER', value: f.code, label: 'Mon Master' }],
        skipDuplicates: true,
      });
    }

  // A short link printed for the Passau fiche before the grouping: it follows the parcours.
  await prisma.qrLink.upsert({
    where: { slug: 'e2e-cursus-passau' },
    create: { slug: 'e2e-cursus-passau', label: 'Affiche Passau', targetPath: '/parcours/e2e-pcic-passau' },
    update: {},
  });

  // The grouping step of a Mon Master sync, on these fiches only (the other fixtures stay apart).
  const { groups: planned } = await planCursus();
  const mine = planned.filter((g) => g.memberIds.every((m) => ids.includes(m)));
  for (const g of mine) await mergeGroup({ runId: 'fixtures:cursus' }, g);
  await recomputeCursusLabels();
  console.log(`[fixtures] cursus : ${mine.length} parcours regroupés`);
}
