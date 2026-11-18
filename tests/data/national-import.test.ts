/**
 * Checks on a real national import (thousands of rows): not part of the pull-request CI, which
 * runs on the fixtures. Run by hand against an imported database:
 *   docker compose run --rm app pnpm test:data
 * (DATABASE_URL = the imported database). A database that is not an import fails clearly.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';

afterAll(() => prisma.$disconnect());

beforeAll(async () => {
  const stats = await prisma.admissionStat.count({ where: { accepted: { not: null } } });
  if (stats < 1000)
    throw new Error(
      `Cette suite tourne sur une base issue de l'import national (${stats} lignes d'admission ici, il en faut plus de 1 000).`,
    );
});

describe('national import', () => {
  it('the origins of each row add up to its accepted total', async () => {
    const [row] = await prisma.$queryRaw<{ rows: bigint; bad: bigint }[]>`
      SELECT count(*) AS rows, count(*) FILTER (WHERE o.sum <> s.accepted) AS bad
        FROM "AdmissionStat" s
        JOIN (SELECT "admissionStatId", sum(accepted) AS sum FROM "AdmissionOrigin" GROUP BY 1) o ON o."admissionStatId" = s.id
       WHERE s.accepted IS NOT NULL`;
    expect(Number(row!.rows)).toBeGreaterThan(1000);
    expect(Number(row!.bad)).toBe(0);
  });
});
