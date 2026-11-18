/**
 * Seed: real pilot data (fixtures/catalog.json, fixtures/sources.json) and fictitious demo data
 * (fixtures/demo.json, isDemo = true).
 *
 * Idempotent and reproducible: with --force it truncates every table and rebuilds the same dataset
 * (fixed random seed; dates are relative to the moment it runs). Without --force it does nothing
 * when the database already holds a catalogue, so restarting the dev stack keeps your test data.
 */
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { prisma } from '../lib/db';
import type { Prisma } from '../lib/db/generated/client';
import type {
  AdminRole,
  AuditCategory,
  EntityType,
  FieldState,
  LogLevel,
  Modality,
  ReviewLevel,
  ReviewStatus,
  SyncStatus,
} from '../lib/db/generated/enums';
import { encrypt, hashEmail, hashToken, hmac } from '../lib/crypto';
import { hashPassword } from '../lib/auth/password';
import { maskContacts } from '../lib/domain/masking';
import { IDENTIFIER_LABEL, normalizeCode } from '../lib/domain/search';
import { isReviewVerified } from '../lib/domain/verification';
import { SETTINGS_DEFAULTS } from '../lib/settings-defaults';
import { rebuildProgramSearchIndex } from '../lib/catalog/program-index';
import { computeIssues } from '../lib/admin/issues';
import { ensureLaunchZones } from '../lib/launch/seed';
import { convertLegacySemesters, reclassifyCourses } from '../lib/catalog/program-courses';
import { DEFAULT_BANNER } from '../lib/domain/banner';

const FIX = join(import.meta.dirname, 'fixtures');
const catalog = JSON.parse(readFileSync(join(FIX, 'catalog.json'), 'utf8'));
const sources = JSON.parse(readFileSync(join(FIX, 'sources.json'), 'utf8'));
const demo = JSON.parse(readFileSync(join(FIX, 'demo.json'), 'utf8'));

export const DEMO_ADMIN_PASSWORD = 'notetonmaster-demo';
export const DEMO_INVITE_TOKEN = 'demo-invitation-juridique';

const now = new Date();
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);
const hoursAgo = (h: number) => minutesAgo(h * 60);
const daysAgo = (d: number) => hoursAgo(d * 24);
const inDays = (d: number) => daysAgo(-d);

/** Deterministic PRNG (mulberry32) so every seed run produces the same data. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261112);
const randInt = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));

/** "12/11 15:42" in demo.json → same distance from "12/11 16:00", applied to now. */
function fromDemoTime(s: string): Date {
  const [d, hm] = s.split(' ');
  const [day] = (d ?? '').split('/').map(Number);
  const [h, m] = (hm ?? '').split(':').map(Number);
  const minutes = (12 - (day ?? 12)) * 24 * 60 + (16 * 60 - ((h ?? 0) * 60 + (m ?? 0)));
  return minutesAgo(minutes);
}

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = (x.getDay() + 6) % 7; // Monday = 0
  x.setDate(x.getDate() - day);
  return x;
}

async function truncateAll() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
  // raw-sql: table names read from pg_tables (development seed only).
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

// ───────────────────────────── catalogue ─────────────────────────────

type ProgramFixture = {
  slug: string;
  title: string;
  shortName?: string;
  university: string;
  component: string | null;
  city: string;
  campus?: string;
  modality: Modality;
  entryLevel: 'M1' | 'M2';
  durationYears: number;
  ects: number;
  keywords: string[];
  applicationPlatform?: string;
  applicationWindow?: string;
  selectionProcess?: string;
  m2Entry?: string;
  recommendedDegrees?: string;
  requirements?: string;
  tuitionFees?: string;
  internships?: string;
  highlights?: string[];
  contactRole?: string;
  monMaster: { code: string; label?: string }[];
  stats: {
    code: string | null;
    session: number;
    capacity?: number | null;
    seatsTaken?: number | null;
    applications?: number | null;
    offers?: number | null;
    lastRankCalled?: number | null;
    accessRate?: number;
    source?: string;
    /** Mon Master `lieux` of that session (EMAS: Guyancourt in 2023-2024, Versailles in 2025). */
    place?: string;
  }[];
  semesters?: { label: string; title: string | null; content: string }[];
  semesterSource?: { document: string; year: string };
};

const MM_SOURCE = 'Mon Master · données ouvertes';

async function seedCatalog() {
  const domainIds: Record<string, string> = {};
  for (const d of catalog.domains) {
    const row = await prisma.domain.create({ data: d });
    domainIds[d.slug] = row.id;
  }

  const uniIds: Record<string, string> = {};
  const componentIds: Record<string, string> = {};
  for (const u of catalog.universities) {
    const { components, ...data } = u;
    // Pilot universities: public, as in the annuaire (D2 bis).
    const row = await prisma.university.create({
      data: {
        ...data,
        sector: 'PUBLIC',
        sectorSource: 'annuaire',
        establishmentType: 'Université',
      },
    });
    uniIds[u.slug] = row.id;
    for (const name of components as string[]) {
      const c = await prisma.component.create({ data: { name, universityId: row.id } });
      componentIds[`${u.slug}:${name}`] = c.id;
    }
  }

  for (const c of catalog.cities) await prisma.city.create({ data: c });

  const certIds: Record<string, string> = {};
  for (const c of catalog.certifications) {
    const row = await prisma.certification.create({
      data: {
        ...c,
        validFrom: c.validFrom ? new Date(c.validFrom) : null,
        validTo: c.validTo ? new Date(c.validTo) : null,
        lastDeliveryDate: c.lastDeliveryDate ? new Date(c.lastDeliveryDate) : null,
      },
    });
    certIds[c.code] = row.id;
  }

  const mentionIds: Record<string, string> = {};
  for (const m of catalog.mentions) {
    const row = await prisma.mention.create({
      data: {
        slug: m.slug,
        name: m.name,
        domainId: domainIds[m.domain],
        rncpCode: m.certification,
        rncpStatus: m.rncpStatus,
        certificationId: certIds[m.certification],
        levels: m.levels,
        description: m.description,
        keywords: m.keywords,
        shortLabel: m.shortLabel ?? null,
      },
    });
    mentionIds[m.slug] = row.id;
  }
  const mentionId = mentionIds['culture-patrimoine-et-mediation']!;

  const programIds: Record<string, string> = {};
  for (const p of catalog.programs as ProgramFixture[]) {
    const program = await prisma.program.create({
      data: {
        slug: p.slug,
        title: p.title,
        shortName: p.shortName,
        mentionId,
        universityId: uniIds[p.university]!,
        componentId: p.component ? componentIds[`${p.university}:${p.component}`] : null,
        city: p.city,
        campus: p.campus,
        modality: p.modality,
        entryLevel: p.entryLevel,
        durationYears: p.durationYears,
        ects: p.ects,
        keywords: p.keywords,
        applicationPlatform: p.applicationPlatform,
        applicationWindow: p.applicationWindow,
        selectionProcess: p.selectionProcess,
        m2Entry: p.m2Entry,
        recommendedDegrees: p.recommendedDegrees,
        requirements: p.requirements,
        tuitionFees: p.tuitionFees,
        internships: p.internships,
        highlights: p.highlights ?? [],
        contactRole: p.contactRole,
      },
    });
    programIds[p.slug] = program.id;

    const entryIds: Record<string, string> = {};
    for (const e of p.monMaster) {
      const row = await prisma.monMasterEntry.create({
        data: {
          code: e.code,
          label: e.label,
          programId: program.id,
          places: p.stats
            .filter((x) => x.code === e.code && x.place)
            .sort((a, b) => b.session - a.session)[0]?.place,
          firstSession: Math.min(...p.stats.filter((x) => x.code === e.code).map((x) => x.session)),
          lastSession: Math.max(...p.stats.filter((x) => x.code === e.code).map((x) => x.session)),
        },
      });
      entryIds[e.code] = row.id;
    }
    for (const s of p.stats) {
      await prisma.admissionStat.create({
        data: {
          programId: program.id,
          monMasterEntryId: s.code ? entryIds[s.code] : null,
          session: s.session,
          capacity: s.capacity ?? null,
          seatsTaken: s.seatsTaken ?? null,
          accepted: s.code ? (s.seatsTaken ?? null) : null,
          raw: s.place ? { lieux: s.place } : undefined,
          applications: s.applications ?? null,
          offers: s.offers ?? null,
          lastRankCalled: s.lastRankCalled ?? null,
          accessRate: s.accessRate ?? null,
          source: s.source ?? (s.code ? MM_SOURCE : 'Brochure des masters URCA 2025'),
          sourceUrl: s.code ? `https://monmaster.gouv.fr/formation/${s.code}` : null,
        },
      });
    }
    for (const [i, s] of (p.semesters ?? []).entries()) {
      await prisma.programSemester.create({
        data: {
          programId: program.id,
          position: i,
          label: s.label,
          title: s.title,
          content: s.content,
          sourceDocument: p.semesterSource?.document,
          sourceYear: p.semesterSource?.year,
        },
      });
    }
  }

  await seedIdentifiers({ uniIds, mentionIds, programIds });

  for (const s of catalog.insertion) {
    const { mention, university, ...data } = s;
    await prisma.insertionStat.create({
      data: { ...data, mentionId: mentionIds[mention]!, universityId: uniIds[university]! },
    });
  }

  return { domainIds, uniIds, mentionIds, programIds, certIds };
}

/**
 * Real identifiers only: the mention and its programs carry RNCP42684 (current)
 * and RNCP35804 (previous); each program its Mon Master numbers (real numbers of the fixtures);
 * Nantes Université and its programs the UAI 0442953W. Unknown codes stay empty: the
 * connectors will fill them.
 */
async function seedIdentifiers({
  uniIds,
  mentionIds,
  programIds,
}: {
  uniIds: Record<string, string>;
  mentionIds: Record<string, string>;
  programIds: Record<string, string>;
}) {
  const rows: Prisma.IdentifierCreateManyInput[] = [];
  const add = (
    entityType: 'PROGRAM' | 'MENTION' | 'UNIVERSITY',
    entityId: string,
    kind: 'RNCP' | 'RNCP_PREVIOUS' | 'MONMASTER' | 'UAI',
    value: string,
  ) =>
    rows.push({
      entityType,
      entityId,
      kind,
      value: normalizeCode(value),
      label: IDENTIFIER_LABEL[kind],
    });
  for (const m of catalog.mentions) {
    const cert = catalog.certifications.find((c: { code: string }) => c.code === m.certification);
    const codes: [string, 'RNCP' | 'RNCP_PREVIOUS'][] = [[m.certification, 'RNCP']];
    if (cert?.replacesCode) codes.push([cert.replacesCode, 'RNCP_PREVIOUS']);
    for (const [code, kind] of codes) {
      add('MENTION', mentionIds[m.slug]!, kind, code);
      for (const p of catalog.programs as ProgramFixture[])
        add('PROGRAM', programIds[p.slug]!, kind, code);
    }
  }
  for (const p of catalog.programs as ProgramFixture[])
    for (const e of p.monMaster) add('PROGRAM', programIds[p.slug]!, 'MONMASTER', e.code);
  for (const u of catalog.universities) {
    if (!u.uai) continue;
    add('UNIVERSITY', uniIds[u.slug]!, 'UAI', u.uai);
    for (const p of catalog.programs as ProgramFixture[])
      if (p.university === u.slug) add('PROGRAM', programIds[p.slug]!, 'UAI', u.uai);
  }
  await prisma.identifier.createMany({ data: rows });
}

// ───────────────────────────── provenance ─────────────────────────────

type Prov = {
  field: string;
  label: string;
  value: Prisma.InputJsonValue | null;
  source: string;
  sourceKey?: string;
  state?: FieldState;
  locked?: boolean;
  lockedBy?: string;
  fetchedDaysAgo?: number;
};

async function seedProvenance(
  ids: Awaited<ReturnType<typeof seedCatalog>>,
  admins: Record<string, string>,
) {
  const write = async (entityType: EntityType, entityId: string, rows: Prov[]) => {
    for (const [i, r] of rows.entries()) {
      await prisma.fieldProvenance.create({
        data: {
          entityType,
          entityId,
          field: r.field,
          label: r.label,
          value: r.value ?? undefined,
          source: r.source,
          sourceKey: r.sourceKey,
          state: r.state ?? 'OK',
          fetchedAt: r.fetchedDaysAgo == null ? daysAgo(1) : daysAgo(r.fetchedDaysAgo),
          locked: r.locked ?? false,
          lockedById: r.lockedBy ? admins[r.lockedBy] : null,
          lockedAt: r.locked ? daysAgo(2) : null,
          position: i,
        },
      });
    }
  };

  const MM = `${MM_SOURCE} 2025`;
  const FIC = 'monmaster.gouv.fr · accès refusé (robots.txt)';
  const INS_NONE = 'InserSup · non publié pour ce parcours';
  for (const p of catalog.programs as ProgramFixture[]) {
    const id = ids.programIds[p.slug]!;
    const s25 = p.stats.find((s) => s.session === 2025 || s.session === 2026);
    const hasMM = p.monMaster.length > 0;
    const saclay = p.university === 'universite-paris-saclay';
    const rows: Prov[] = [];
    const baseSource = hasMM
      ? MM
      : p.university === 'universite-paris-saclay'
        ? 'Site de l’Université Paris-Saclay'
        : 'Brochure des masters URCA 2025';
    const baseKey = hasMM
      ? 'monmaster-opendata'
      : p.university === 'universite-paris-saclay'
        ? 'univ-sites'
        : 'univ-sites';

    rows.push({
      field: 'title',
      label: 'Intitulé du parcours',
      value: p.title,
      source: baseSource,
      sourceKey: baseKey,
    });
    rows.push({
      field: 'mention',
      label: 'Mention',
      value: 'Culture, patrimoine et médiation',
      source: 'France Compétences · RNCP42684',
      sourceKey: 'rncp',
    });
    if (p.slug === 'valorisation-des-nouveaux-patrimoines') {
      rows.push({
        field: 'component',
        label: 'Composante',
        value: p.component,
        source: 'Arbitré à la main · conflit livret / Mon Master 2025',
        state: 'CONFLICT',
        locked: true,
        lockedBy: 'yanis',
      });
      rows.push({
        field: 'campus',
        label: 'Lieu',
        value: 'Nantes · campus du Tertre',
        source: 'Livret pédagogique 2022-2023',
        sourceKey: 'univ-sites',
        state: 'STALE',
      });
    } else {
      rows.push(
        p.component
          ? {
              field: 'component',
              label: 'Composante',
              value: p.component,
              source: baseSource,
              sourceKey: baseKey,
            }
          : {
              field: 'component',
              label: 'Composante',
              value: null,
              source: 'Non précisée par les sources',
              state: 'MISSING',
            },
      );
      rows.push({
        field: 'campus',
        label: 'Lieu',
        value: [p.city, p.campus].filter(Boolean).join(' · '),
        source: baseSource,
        sourceKey: baseKey,
      });
    }
    rows.push({
      field: 'modality',
      label: 'Modalité',
      value: p.modality,
      source: baseSource,
      sourceKey: baseKey,
    });

    if (p.slug === 'administration-culturelle-projets-culturels-internationaux')
      rows.push({
        field: 'monMasterEntries',
        label: 'Identifiant Mon Master',
        value: '2 entrées : 2000144GJ2FE, 2000144GHGRB',
        source: MM,
        sourceKey: 'monmaster-opendata',
        state: 'CONFLICT',
      });
    else if (hasMM)
      rows.push({
        field: 'monMasterEntries',
        label: 'Identifiant Mon Master',
        value: p.monMaster.map((m) => m.code).join(', '),
        source: MM,
        sourceKey: 'monmaster-opendata',
      });
    else if (p.entryLevel === 'M1')
      rows.push({
        field: 'monMasterEntries',
        label: 'Identifiant Mon Master',
        value: null,
        source: 'Aucune entrée Mon Master trouvée',
        sourceKey: 'monmaster-opendata',
        state: 'ERROR',
      });

    if (p.slug === 'evenementiel-mediation-des-arts-et-des-sciences')
      rows.push({
        field: 'capacity',
        label: 'Places en M1',
        value: 22,
        source: 'Mon Master (22) ≠ site de l’université (24)',
        sourceKey: 'monmaster-opendata',
        state: 'CONFLICT',
      });
    else
      rows.push(
        s25?.capacity != null
          ? {
              field: 'capacity',
              label: p.entryLevel === 'M2' ? 'Places en M2' : 'Places en M1',
              value: s25.capacity,
              source: s25.source ?? MM,
              sourceKey: s25.source ? baseKey : 'monmaster-opendata',
            }
          : {
              field: 'capacity',
              label: 'Places',
              value: null,
              source: 'Non publié',
              state: 'MISSING',
            },
      );
    if (hasMM) {
      rows.push({
        field: 'applications',
        label: 'Candidatures (phase principale)',
        value: p.stats
          .filter((s) => s.session === 2025)
          .reduce((a, s) => a + (s.applications ?? 0), 0),
        source: MM,
        sourceKey: 'monmaster-opendata',
      });
      rows.push({
        field: 'offers',
        label: 'Propositions d’admission',
        value: p.stats.filter((s) => s.session === 2025).reduce((a, s) => a + (s.offers ?? 0), 0),
        source: MM,
        sourceKey: 'monmaster-opendata',
      });
      const ranks = p.stats.filter((s) => s.session === 2025).map((s) => s.lastRankCalled);
      rows.push(
        ranks.every((r) => r == null)
          ? {
              field: 'lastRankCalled',
              label: 'Rang du dernier appelé',
              value: null,
              source: `${MM} · non publié`,
              sourceKey: 'monmaster-opendata',
              state: 'MISSING',
            }
          : {
              field: 'lastRankCalled',
              label: 'Rang du dernier appelé',
              value: ranks.join(' / '),
              source: MM,
              sourceKey: 'monmaster-opendata',
            },
      );
      rows.push({
        field: 'admissionCriteria',
        label: 'Attendus et critères d’examen',
        value: null,
        source: FIC,
        sourceKey: 'monmaster-fiches',
        state: 'ERROR',
      });
    }
    if (p.slug === 'musees-bibliotheques-archives')
      rows.push({
        field: 'accessRate',
        label: 'Taux d’accès',
        value: '43 % (rentrée 2024)',
        source: 'Brochure des masters URCA 2025',
        sourceKey: 'univ-sites',
      });

    if (p.semesters?.length)
      rows.push({
        field: 'semesters',
        label: 'Programme',
        value: `${p.semesters.length} semestres`,
        source: `${p.semesterSource?.document} ${p.semesterSource?.year}`,
        sourceKey: 'univ-sites',
        state: p.slug === 'valorisation-des-nouveaux-patrimoines' ? 'STALE' : 'OK',
        fetchedDaysAgo: 3,
      });
    else if (p.slug === 'musees-bibliotheques-archives')
      rows.push({
        field: 'semesters',
        label: 'Programme',
        value: 'Résumé, stages 2 × 2 mois',
        source: 'Brochure des masters URCA 2025',
        sourceKey: 'univ-sites',
        state: 'STALE',
        fetchedDaysAgo: 3,
      });
    else
      rows.push({
        field: 'semesters',
        label: 'Programme',
        value: null,
        source: 'Aucun livret trouvé',
        sourceKey: 'univ-sites',
        state: 'MISSING',
      });

    rows.push(
      saclay
        ? {
            field: 'insertion',
            label: 'Insertion',
            value: '64,1 % en emploi à 12 mois (mention)',
            source: 'InserSup · promotion 2023',
            sourceKey: 'insersup',
            fetchedDaysAgo: 9,
          }
        : {
            field: 'insertion',
            label: 'Insertion',
            value: null,
            source: INS_NONE,
            sourceKey: 'insersup',
            state: 'MISSING',
            fetchedDaysAgo: 9,
          },
    );
    if (p.slug === 'valorisation-des-nouveaux-patrimoines')
      rows.push({
        field: 'tuitionFees',
        label: 'Frais d’inscription',
        value: '255 €/an (UE)',
        source: 'Agrégateur tiers · à vérifier',
        state: 'CONFLICT',
      });
    if (p.contactRole)
      rows.push({
        field: 'contactRole',
        label: 'Contacts',
        value: p.contactRole,
        source: 'Livret pédagogique 2022-2023',
        sourceKey: 'univ-sites',
        state: 'STALE',
      });

    await write('PROGRAM', id, rows);
  }

  const RNCP = 'France Compétences';
  await write('MENTION', ids.mentionIds['culture-patrimoine-et-mediation']!, [
    {
      field: 'certification',
      label: 'Certification',
      value: 'RNCP42684 (niveau 7)',
      source: RNCP,
      sourceKey: 'rncp',
      fetchedDaysAgo: 0,
    },
    {
      field: 'previousCertification',
      label: 'Ancienne fiche',
      value: 'RNCP35804, inactive le 15/07/2026',
      source: RNCP,
      sourceKey: 'rncp',
      fetchedDaysAgo: 0,
    },
    {
      field: 'certifiers',
      label: 'Certificateurs',
      value: 'MESR, Nantes, URCA, Paris-Saclay',
      source: RNCP,
      sourceKey: 'rncp',
      fetchedDaysAgo: 0,
    },
  ]);
  for (const u of catalog.universities) {
    await write('UNIVERSITY', ids.uniIds[u.slug]!, [
      u.uai
        ? {
            field: 'uai',
            label: 'UAI',
            value: u.uai,
            source: 'Mon Master · données ouvertes 2025 (eta_uai)',
            sourceKey: 'monmaster-opendata',
          }
        : { field: 'uai', label: 'UAI', value: null, source: 'À compléter', state: 'MISSING' },
      {
        field: 'website',
        label: 'Site',
        value: u.website.replace('https://www.', ''),
        source: RNCP,
        sourceKey: 'rncp',
      },
      { field: 'cities', label: 'Villes', value: u.cities.join(', '), source: 'notetonmaster' },
    ]);
  }
}

// ───────────────────────────── sources & sync history ─────────────────────────────

async function seedSources(admins: Record<string, string>) {
  const sourceIds: Record<string, string> = {};
  for (const s of sources.sources) {
    const row = await prisma.dataSource.create({ data: s });
    sourceIds[s.key] = row.id;
  }

  type RunSpec = {
    key: string;
    daysAgo: number;
    status: SyncStatus;
    manual?: boolean;
    progress?: number;
  };
  const runs: RunSpec[] = [
    ...[29, 22, 15, 8, 1].map((d) => ({
      key: 'monmaster-opendata',
      daysAgo: d,
      status: 'SUCCEEDED' as const,
    })),
    ...[6, 5, 4, 3, 2, 1, 0].map((d) => ({
      key: 'rncp',
      daysAgo: d,
      status: (d === 4 ? 'FAILED' : 'SUCCEEDED') as SyncStatus,
    })),
    { key: 'insersup', daysAgo: 9, status: 'SUCCEEDED' },
    { key: 'univ-sites', daysAgo: 30, status: 'SUCCEEDED' },
    { key: 'univ-sites', daysAgo: 0, status: 'RUNNING', progress: 66 },
    ...[20, 7, 0].map((d) => ({
      key: 'monmaster-fiches',
      daysAgo: d,
      status: 'SKIPPED' as const,
      manual: true,
    })),
  ];

  const LOGS: Record<string, (s: SyncStatus) => [LogLevel, string][]> = {
    'monmaster-opendata': () => [
      ['START', 'lancement planifié'],
      ['INFO', 'jeu de données fr-esr-mon_master, session 2025 : 9 412 formations lues'],
      ['OK', '7 parcours suivis, tous appariés par numéro Mon Master'],
      ['OK', 'terminé, 0 champ verrouillé modifié'],
    ],
    rncp: (s) =>
      s === 'FAILED'
        ? [
            ['START', 'lancement planifié'],
            [
              'ERROR',
              'export France Compétences indisponible (HTTP 503), nouvel essai au prochain passage',
            ],
          ]
        : [
            ['START', 'lancement planifié'],
            ['INFO', 'fiche RNCP42684 lue : 7 blocs, 4 codes ROME'],
            ['INFO', 'RNCP35804 inactive, remplacée par RNCP42684'],
            ['OK', 'terminé, aucune modification'],
          ],
    insersup: () => [
      ['START', 'lancement planifié'],
      ['INFO', 'insertion à 12 et 18 mois, promotion 2023'],
      ['OK', 'mention Culture, patrimoine et médiation · Paris-Saclay : 39 sortants'],
      ['SKIP', 'Nantes Université, URCA : effectifs trop faibles, données non publiées'],
      ['OK', 'terminé'],
    ],
    'univ-sites': (s) =>
      s === 'RUNNING'
        ? [
            ['START', 'lancement planifié'],
            ['OK', 'univ-nantes.fr : 4 pages formation lues'],
            ['OK', 'universite-paris-saclay.fr : 4 pages formation lues'],
            ['INFO', 'univ-reims.fr : lecture en cours'],
          ]
        : [
            ['START', 'lancement planifié'],
            ['OK', 'univ-nantes.fr : 4 pages formation lues'],
            ['OK', 'universite-paris-saclay.fr : 4 pages formation lues'],
            ['WARN', 'univ-reims.fr : page du parcours introuvable, brochure utilisée'],
            ['WARN', 'livret VNP 2022-2023 : tableau des modalités de contrôle illisible'],
            ['OK', 'terminé'],
          ],
    'monmaster-fiches': () => [
      ['START', 'lancement manuel'],
      ['SKIP', 'robots.txt : Disallow: /. Collecte interdite, rien n’est collecté'],
    ],
  };

  for (const r of runs) {
    const start =
      r.status === 'RUNNING'
        ? minutesAgo(3)
        : new Date(
            daysAgo(r.daysAgo).setHours(
              r.key === 'rncp' ? 4 : 3,
              randInt(0, 14),
              randInt(0, 59),
              0,
            ),
          );
    const safeStart = start > now ? minutesAgo(randInt(30, 90)) : start;
    const durationS = randInt(40, 400);
    const lines = LOGS[r.key]!(r.status);
    const finished =
      r.status === 'RUNNING' ? null : new Date(safeStart.getTime() + durationS * 1000);
    const run = await prisma.syncRun.create({
      data: {
        sourceId: sourceIds[r.key]!,
        status: r.status,
        progress: r.status === 'RUNNING' ? (r.progress ?? 50) : 100,
        step: r.status === 'RUNNING' ? 'univ-reims.fr' : null,
        trigger: r.manual ? 'manual' : 'schedule',
        queuedAt: safeStart,
        startedAt: safeStart,
        finishedAt: finished,
        heartbeatAt: r.status === 'RUNNING' ? new Date() : finished,
        triggeredById: r.manual ? admins.yanis : null,
        error: r.status === 'FAILED' ? lines[lines.length - 1]![1] : null,
        stats:
          r.status === 'SUCCEEDED'
            ? { updated: randInt(0, 6), unchanged: randInt(10, 40), skippedLocked: randInt(0, 2) }
            : undefined,
      },
    });
    for (const [i, [level, message]] of lines.entries()) {
      await prisma.syncLog.create({
        data: {
          runId: run.id,
          level,
          message,
          at: new Date(safeStart.getTime() + i * Math.round((durationS * 1000) / lines.length)),
        },
      });
    }
  }
  for (const s of sources.sources) {
    const last = await prisma.syncRun.findFirst({
      where: { sourceId: sourceIds[s.key] },
      orderBy: { queuedAt: 'desc' },
    });
    if (last)
      await prisma.dataSource.update({
        where: { key: s.key },
        data: { lastRunAt: last.finishedAt ?? last.startedAt },
      });
  }

  for (const a of sources.alerts) {
    await prisma.dataAlert.create({ data: { ...a, createdAt: daysAgo(randInt(1, 12)) } });
  }
}

async function seedConflicts(programIds: Record<string, string>) {
  for (const c of sources.conflicts) {
    const entityId = programIds[c.program]!;
    // ACPCI: two Mon Master numbers for one parcours → a MERGE conflict;
    // arbitrating it records a MatchDecision applied by the next Mon Master sync.
    const merge = c.key === 'acpci-entries';
    await prisma.dataConflict.create({
      data: {
        key: c.key,
        kind: merge ? 'MERGE' : 'VALUE',
        recommended: merge,
        score: merge ? 1 : null,
        entityType: 'PROGRAM',
        entityId,
        field: c.field,
        title: c.title,
        detail: c.detail,
        options: merge
          ? [
              {
                ...c.options[0],
                value: { decision: 'MERGE', ifc: '2000144GHGRB', targetId: entityId },
              },
              { ...c.options[1], value: { decision: 'NEW', ifc: '2000144GHGRB' } },
            ]
          : c.options,
        createdAt: daysAgo(randInt(2, 10)),
      },
    });
  }
}

// ───────────────────────────── admins ─────────────────────────────

async function seedAdmins() {
  const passwordHash = await hashPassword(DEMO_ADMIN_PASSWORD);
  const ids: Record<string, string> = {};
  for (const a of demo.admins) {
    const row = await prisma.adminUser.create({
      data: {
        name: a.name,
        email: a.email,
        role: a.role as AdminRole,
        passwordHash: a.invited ? null : passwordHash,
        totpSecretEnc: a.totpSecret ? encrypt(a.totpSecret) : null,
        totpEnabledAt: a.totpSecret ? daysAgo(60) : null,
        invitedAt: a.invited ? daysAgo(a.invitedDaysAgo) : daysAgo(90),
        inviteTokenHash: a.invited ? hashToken(DEMO_INVITE_TOKEN) : null,
        lastLoginAt: a.lastLoginMinutesAgo != null ? minutesAgo(a.lastLoginMinutesAgo) : null,
      },
    });
    ids[a.key] = row.id;
  }
  return ids;
}

// ───────────────────────────── students, reviews, messaging ─────────────────────────────

async function seedCommunity(
  ids: Awaited<ReturnType<typeof seedCatalog>>,
  admins: Record<string, string>,
) {
  const uploads = process.env.UPLOADS_DIR ?? '/data/uploads';
  mkdirSync(uploads, { recursive: true });

  const studentIds: Record<string, string> = {};
  const studentEmails: Record<string, string> = {};
  for (const s of demo.students) {
    const row = await prisma.student.create({
      data: {
        emailHash: hashEmail(s.email),
        emailEnc: encrypt(s.email),
        acceptsQuestions: s.acceptsQuestions,
        isDemo: true,
        createdAt: daysAgo(randInt(30, 60)),
        lastSeenAt: daysAgo(randInt(0, 5)),
      },
    });
    studentIds[s.key] = row.id;
    studentEmails[s.key] = s.email;
    // Masters followed (Mon espace › Masters suivis).
    for (const [i, slug] of ((s.follows ?? []) as string[]).entries())
      await prisma.favorite.create({
        data: {
          studentId: row.id,
          programId: ids.programIds[slug]!,
          createdAt: daysAgo(10 + i * 4),
        },
      });

    if (s.verification) {
      // Master by master: the verification names its program.
      await prisma.programVerification.create({
        data: {
          studentId: row.id,
          programId: ids.programIds[s.verification.program]!,
          method: 'UNIVERSITY_EMAIL',
          status: 'APPROVED',
          universityEmailHash: hashEmail(s.verification.universityEmail),
          decidedAt: daysAgo(s.verification.daysAgo),
          createdAt: daysAgo(s.verification.daysAgo),
        },
      });
    }
    if (s.document) {
      const file = `demo-${s.key}-${s.document.name}`;
      copyFileSync(join(FIX, 'justificatif-demo.pdf'), join(uploads, file));
      const doc = await prisma.programVerification.create({
        data: {
          studentId: row.id,
          programId: ids.programIds[s.document.program]!,
          method: 'DOCUMENT',
          status: 'PENDING',
          documentPath: file,
          documentName: s.document.name,
          documentType: s.document.type,
          documentMime: 'application/pdf',
          declaredLevel: s.document.level as ReviewLevel,
          declaredCohort: s.document.cohort,
          createdAt: hoursAgo(s.document.hoursAgo),
        },
      });
      await prisma.programVerification.update({
        where: { id: doc.id },
        data: { documentId: doc.id },
      });
    }
  }

  const reviewIds: Record<string, string> = {};
  for (const r of demo.reviews) {
    const programId = ids.programIds[r.program]!;
    const studentId = r.student ? studentIds[r.student] : null;
    const email = r.student ? studentEmails[r.student]! : r.contactEmail;
    const submittedAt = r.hoursAgo != null ? hoursAgo(r.hoursAgo) : daysAgo(r.daysAgo);
    const status = r.status as ReviewStatus;
    const verifs = studentId
      ? await prisma.programVerification.findMany({
          where: { studentId },
          select: { programId: true, status: true },
        })
      : [];
    const isVerified = isReviewVerified(programId, verifs);
    const published = status === 'PUBLISHED' || status === 'HIDDEN';
    const row = await prisma.review.create({
      data: {
        ref: r.ref,
        programId,
        studentId,
        authorEmailHash: hashEmail(email),
        contactEmailEnc: r.student ? null : encrypt(email),
        level: r.level as ReviewLevel,
        employmentStatus: r.employmentStatus ?? null,
        jobTitle: r.jobTitle ?? null,
        cohortYear: r.cohort,
        overallRating: r.rating,
        title: r.title,
        pros: r.pros,
        cons: r.cons,
        status,
        isVerified: published || status === 'NEEDS_EDIT' ? isVerified : false,
        acceptsQuestions: r.acceptsQuestions,
        nameFlagged: r.nameFlagged ?? false,
        moderationReason: r.moderationReason ?? null,
        moderatedById: r.moderator ? admins[r.moderator] : null,
        moderatedAt:
          status === 'PENDING'
            ? null
            : status === 'HIDDEN'
              ? hoursAgo(r.hiddenHoursAgo)
              : new Date(submittedAt.getTime() + 20 * 3600_000),
        submittedAt,
        createdAt: submittedAt,
        publishedAt: published
          ? r.publishedDaysAgo
            ? daysAgo(r.publishedDaysAgo)
            : new Date(submittedAt.getTime() + 20 * 3600_000)
          : null,
        hiddenAt: status === 'HIDDEN' ? hoursAgo(r.hiddenHoursAgo) : null,
        helpfulCount: r.helpful,
        isDemo: true,
      },
    });
    reviewIds[r.ref] = row.id;
    // Reads (Mon espace › Lectures): one per visitor and per day, spread since publication.
    if (status === 'PUBLISHED') {
      const total = r.views ?? randInt(15, 90);
      const days = Math.max(
        1,
        Math.round((Date.now() - (row.publishedAt?.getTime() ?? Date.now())) / 86400000),
      );
      const views = Array.from({ length: total }, (_, i) => ({
        reviewId: row.id,
        // More reads in the first weeks after publication, as on a real fiche.
        day: new Date(
          new Date(daysAgo(Math.floor(days * rand() ** 1.6))).toISOString().slice(0, 10),
        ),
        viewerKey: hmac(`demo-viewer:${r.ref}:${i}`),
      }));
      await prisma.reviewView.createMany({ data: views, skipDuplicates: true });
      await prisma.review.update({
        where: { id: row.id },
        data: { viewCount: await prisma.reviewView.count({ where: { reviewId: row.id } }) },
      });
    }
    for (const [criterion, score] of Object.entries(r.scores ?? {})) {
      await prisma.reviewCriterionScore.create({
        data: { reviewId: row.id, criterion: criterion as never, score: score as number },
      });
    }
  }

  const messageIds: Record<string, string[]> = {};
  for (const c of demo.conversations) {
    const askerEmail = c.asker ? studentEmails[c.asker]! : c.askerEmail;
    const last = Math.min(...c.messages.map((m: { minutesAgo: number }) => m.minutesAgo));
    const first = Math.max(...c.messages.map((m: { minutesAgo: number }) => m.minutesAgo));
    const conv = await prisma.conversation.create({
      data: {
        reviewId: reviewIds[c.review]!,
        askerEmailEnc: encrypt(askerEmail),
        askerEmailHash: hashEmail(askerEmail),
        askerStudentId: c.asker ? studentIds[c.asker] : null,
        alias: c.alias,
        lastMessageAt: minutesAgo(last),
        createdAt: minutesAgo(first),
        isDemo: true,
      },
    });
    messageIds[c.review] = messageIds[c.review] ?? [];
    for (const m of c.messages) {
      const masked = maskContacts(m.body);
      const msg = await prisma.message.create({
        data: {
          conversationId: conv.id,
          fromRole: m.from,
          body: masked.text,
          hadMaskedContent: masked.masked,
          createdAt: minutesAgo(m.minutesAgo),
          readAt: m.read ? minutesAgo(m.minutesAgo - 5) : null,
        },
      });
      messageIds[c.review]!.push(msg.id);
    }
  }

  for (const r of demo.reports) {
    const [kind, ref, idx] = r.target.split(':');
    const targetId = kind === 'review' ? reviewIds[ref]! : messageIds[ref]![Number(idx)]!;
    await prisma.report.create({
      data: {
        reference: r.reference,
        targetType: kind === 'review' ? 'REVIEW' : 'MESSAGE',
        targetId,
        reason: r.reason,
        details: r.details,
        reporterEmailEnc: r.reporterEmail ? encrypt(r.reporterEmail) : null,
        reporterKey: hmac(`reporter:${r.reporterKey}`),
        createdAt: r.hoursAgo != null ? hoursAgo(r.hoursAgo) : minutesAgo(r.minutesAgo),
        isDemo: true,
      },
    });
  }

  for (const l of demo.legal) {
    await prisma.legalRequest.create({
      data: {
        type: l.type,
        reference: l.reference,
        requesterName: l.requesterName,
        requesterQuality: l.requesterQuality,
        requesterEmailEnc: encrypt(l.requesterEmail),
        contentUrl: l.contentUrl,
        grounds: l.grounds,
        lawReference: l.lawReference,
        goodFaith: l.goodFaith,
        receivedAt: daysAgo(l.receivedDaysAgo),
        internalDeadline: inDays(l.deadlineInDays),
        status: l.status,
        isDemo: true,
      },
    });
  }

  // A few technical connection records (kept 1 year, LEGAL role only).
  for (const key of ['anna', 'bastien', 'chloe']) {
    await prisma.connectionLog.create({
      data: {
        kind: 'STUDENT_LOGIN',
        subjectRef: studentIds[key],
        ip: `203.0.113.${randInt(2, 250)}`,
        userAgent: 'Mozilla/5.0 (démo)',
        at: daysAgo(randInt(1, 20)),
      },
    });
  }

  // Identity card of Mon espace: the level of each student's latest review.
  for (const id of Object.values(studentIds)) {
    const last = await prisma.review.findFirst({
      where: { studentId: id },
      orderBy: { submittedAt: 'desc' },
      select: { level: true },
    });
    if (last) await prisma.student.update({ where: { id }, data: { level: last.level } });
  }
  return { studentEmails };
}

async function seedAudit(admins: Record<string, string>) {
  const names: Record<string, string> = Object.fromEntries(
    demo.admins.map((a: { key: string; name: string }) => [a.key, a.name]),
  );
  const entries = [...demo.audit].reverse();
  for (const e of entries) {
    await prisma.auditLog.create({
      data: {
        actorId: e.actor ? admins[e.actor] : null,
        actorLabel: e.actor ? names[e.actor]! : 'Système',
        category:
          (
            {
              AUTH: 'CONNEXION',
              MODERATION: 'AVIS',
              DATA: 'FICHES',
              SYNC: 'DONNEES',
              LEGAL: 'LEGAL',
              TEAM: 'PARAMETRES',
              SETTINGS: 'PARAMETRES',
            } as Record<string, AuditCategory>
          )[e.type] ?? 'PARAMETRES',
        targetLabel: e.object,
        detail: e.detail,
        at: fromDemoTime(e.at),
      },
    });
  }
}

async function seedActivity() {
  const thisWeek = startOfWeek(now);
  const data = demo.activity as [number, number][];
  for (const [i, [submitted, rejected]] of data.entries()) {
    const weekStart = new Date(thisWeek);
    weekStart.setDate(weekStart.getDate() - (data.length - 1 - i) * 7);
    await prisma.activitySnapshot.create({
      data: { weekStart, submitted, rejected, isDemo: true },
    });
  }
}

async function seedSettings() {
  for (const [key, value] of Object.entries(SETTINGS_DEFAULTS)) {
    await prisma.setting.create({ data: { key, value: value as Prisma.InputJsonValue } });
  }
}

/**
 * The demo data holds admin accounts whose password and TOTP secrets are public (this file and
 * demo.json are in the repository). It must never reach a site open to the internet: the seed
 * refuses to run in production unless the site address is local (`make prod-local`, `make perf`)
 * or DEMO_SEED_I_KNOW=1 is set on purpose.
 */
function refuseOutsideLocal() {
  if (process.env.NODE_ENV !== 'production' || process.env.DEMO_SEED_I_KNOW === '1') return;
  const host = (() => {
    try {
      return new URL(process.env.APP_URL ?? '').hostname;
    } catch {
      return '';
    }
  })();
  if (['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)) return;
  console.error(
    `[seed] refused: NODE_ENV=production and APP_URL=${process.env.APP_URL ?? '(unset)'} is not local. ` +
      'The demo admin accounts have public credentials; use prisma/bootstrap.ts in production.',
  );
  process.exit(1);
}

async function main() {
  refuseOutsideLocal();
  const force = process.argv.includes('--force');
  if (!force) {
    const count = await prisma.university.count();
    if (count > 0) {
      console.log('[seed] database already seeded: skipping (use --force to rebuild).');
      return;
    }
  }
  console.log('[seed] truncating tables…');
  await truncateAll();
  await seedSettings();
  const ids = await seedCatalog();
  const admins = await seedAdmins();
  await seedProvenance(ids, admins);
  await seedSources(admins);
  await seedConflicts(ids.programIds);
  const { studentEmails } = await seedCommunity(ids, admins);
  await seedAudit(admins);
  await seedActivity();
  await prisma.siteBanner.create({ data: DEFAULT_BANNER });
  // Semester texts of the fixture → courses and milestones (same code as the migration).
  await convertLegacySemesters();
  await reclassifyCourses(true);
  // Cities of the launch: a parcours is published only in an open one
  await ensureLaunchZones();
  await rebuildProgramSearchIndex();
  // Search view (materialized, see the search migration): after the index and the open cities it
  // reads, or the cities would be missing from the search.
  await prisma.$executeRaw`REFRESH MATERIALIZED VIEW search_document`;

  const counts = {
    universities: await prisma.university.count(),
    programs: await prisma.program.count(),
    reviews: await prisma.review.count(),
    conversations: await prisma.conversation.count(),
    syncRuns: await prisma.syncRun.count(),
    auditLogs: await prisma.auditLog.count(),
  };
  // Data problems of the admin (DataIssue), as after a sync.
  await computeIssues();
  console.log('[seed] done', counts);
  // Never the demo credentials and TOTP secrets in CI logs.
  if (process.env.CI) return;
  console.log(`
──────────── Demo credentials (dev only) ────────────
Admin   http://localhost:3000/admin/login   password: ${DEMO_ADMIN_PASSWORD}
${demo.admins
  .filter((a: { invited?: boolean }) => !a.invited)
  .map(
    (a: { email: string; role: string; totpSecret: string | null }) =>
      `  ${a.email.padEnd(32)} ${a.role.padEnd(12)} TOTP secret: ${a.totpSecret ?? '(not set up: configured at first login)'}`,
  )
  .join('\n')}
  Current TOTP code: make totp email=alexis@notetonmaster.example
  Pending invitation (Légal): http://localhost:3000/admin/invitation/${DEMO_INVITE_TOKEN}
Students (magic link, mails in Mailpit http://localhost:8025):
${Object.values(studentEmails)
  .map((e) => `  ${e}`)
  .join('\n')}
─────────────────────────────────────────────────────`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
