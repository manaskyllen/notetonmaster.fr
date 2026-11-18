/**
 * Production bootstrap (no demo data): run after `prisma migrate deploy` by the prod « migrate »
 * service. Idempotent, never truncates, never overwrites what exists:
 * - settings missing from the Setting table get their default;
 * - the 4 domains of the site (taxonomy) and the 9 data sources (prisma/fixtures/sources.json).
 * No account is created here, and no password is ever printed: the first admin is invited with
 * `pnpm admin:create` (scripts/admin-create.ts), TOTP set up at the first login.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { prisma } from '../lib/db';
import type { Prisma } from '../lib/db/generated/client';
import { SETTINGS_DEFAULTS } from '../lib/settings-defaults';
import { rebuildProgramSearchIndex } from '../lib/catalog/program-index';
import { ensureLaunchZones } from '../lib/launch/seed';
import { convertLegacySemesters, reclassifyCourses } from '../lib/catalog/program-courses';
import { DEFAULT_BANNER } from '../lib/domain/banner';

const FIX = join(import.meta.dirname, 'fixtures');

async function main() {
  // Settings
  const existing = new Set(
    (await prisma.setting.findMany({ select: { key: true } })).map((s) => s.key),
  );
  let settings = 0;
  for (const [key, value] of Object.entries(SETTINGS_DEFAULTS))
    if (!existing.has(key)) {
      await prisma.setting.create({ data: { key, value: value as Prisma.InputJsonValue } });
      settings++;
    }

  // Domains of the site (needed to classify the mentions created by the sync)
  const catalog = JSON.parse(readFileSync(join(FIX, 'catalog.json'), 'utf8')) as {
    domains: { slug: string; name: string; tone: string; icon: string; position: number }[];
  };
  let domains = 0;
  for (const d of catalog.domains) {
    const r = await prisma.domain.upsert({ where: { slug: d.slug }, create: d, update: {} });
    if (r) domains++;
  }

  // Data sources (the real ones: schedules and enabled state from the fixture, never overwritten)
  const sources = JSON.parse(readFileSync(join(FIX, 'sources.json'), 'utf8')) as {
    sources: Prisma.DataSourceCreateInput[];
  };
  let created = 0;
  let refreshed = 0;
  for (const s of sources.sources) {
    const found = await prisma.dataSource.findUnique({ where: { key: s.key } });
    if (!found) {
      await prisma.dataSource.create({ data: s });
      created++;
    } else if (
      found.name !== s.name ||
      found.host !== s.host ||
      found.method !== s.method ||
      found.note !== (s.note ?? null)
    ) {
      // Descriptions follow the code; schedule and enabled state stay as the team set them.
      await prisma.dataSource.update({
        where: { key: s.key },
        data: {
          name: s.name,
          host: s.host,
          method: s.method,
          note: s.note ?? null,
          blockedReason: s.blockedReason ?? null,
        },
      });
      refreshed++;
    }
  }
  // The former « pdf » source is gone: booklets are read by univ-sites (PDF_BOOKLET).
  const removed = await prisma.dataSource.deleteMany({
    where: { key: { notIn: sources.sources.map((s) => s.key) } },
  });

  // First admin: invited from the command line, never created here with a password.
  const admins = await prisma.adminUser.count({ where: { role: 'ADMIN', removedAt: null } });
  const adminLine = admins
    ? `${admins} compte(s) admin`
    : 'aucun compte admin : pnpm admin:create --email … --role ADMIN (docs/deploiement.md)';

  // Information banner: the starting message, once (the admin edits the same row afterwards)
  if ((await prisma.siteBanner.count()) === 0)
    await prisma.siteBanner.create({ data: DEFAULT_BANNER });
  // Programme by year: former semester texts → courses and milestones; new keyword table → reclassify
  const legacy = await convertLegacySemesters();
  const reclassified = await reclassifyCourses();
  console.log(
    `[bootstrap] programmes : ${legacy.semesters} semestres convertis (${legacy.courses} cours, ${legacy.milestones} jalons), ${reclassified} cours reclassés`,
  );
  await prisma.$executeRaw`REFRESH MATERIALIZED VIEW search_document`;
  // Cities of the launch: a parcours is published only in an open one. Created closed here: they
  // are opened from the admin (Paramètres › Villes ouvertes), never by a deployment.
  await ensureLaunchZones({ open: false });
  await rebuildProgramSearchIndex();
  console.log(
    `[bootstrap] ${settings} réglages ajoutés, ${domains} domaines, ${created} sources créées, ${refreshed} mises à jour, ${removed.count} retirées · ${adminLine}`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
