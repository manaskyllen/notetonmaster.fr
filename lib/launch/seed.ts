import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { prisma } from '../db';

interface ZoneFixture {
  slug: string;
  name: string;
  epciCode: string;
  epciName: string;
  order: number;
  open: boolean;
  communes: { code: string; nom: string }[];
}

/**
 * The cities of the launch (prisma/fixtures/launch-zones.json: Strasbourg, Mulhouse and Nantes
 * with the communes of their intercommunality, read on geo.api.gouv.fr on 16/11/2026), created
 * when the table is empty: the seed (which truncates everything) and the production bootstrap
 * (the migration already inserted them; never overwritten).
 */
export async function ensureLaunchZones(opts: { open?: boolean } = {}): Promise<number> {
  if (await prisma.launchZone.count()) return 0;
  const file = join(import.meta.dirname, '../../prisma/fixtures/launch-zones.json');
  const { zones } = JSON.parse(readFileSync(file, 'utf8')) as { zones: ZoneFixture[] };
  for (const z of zones)
    await prisma.launchZone.create({
      data: {
        slug: z.slug,
        name: z.name,
        epciCode: z.epciCode,
        epciName: z.epciName,
        communeCodes: z.communes.map((c) => c.code).sort(),
        communesRefreshedAt: new Date('2026-11-16T00:00:00Z'),
        open: opts.open ?? z.open,
        order: z.order,
        openedAt: (opts.open ?? z.open) ? new Date() : null,
      },
    });
  return zones.length;
}
