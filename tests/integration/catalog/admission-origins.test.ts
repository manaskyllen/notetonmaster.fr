/** « D'où viennent les admis » (feature 1): column mapping, sums, thresholds, several numbers. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readCsv } from '@/lib/data/csv';
import { prisma } from '@/lib/db';
import {
  normalizeRow,
  originsOf,
  type MMRecord,
} from '@/lib/connectors/monmaster-opendata/normalize';
import { ratePer100, summarizeOrigins, type StatWithOrigins } from '@/lib/domain/admission-origins';

const records: MMRecord[] = [];
const rec = (ifc: string, session: number) =>
  records.find((r) => r.ifc === ifc && r.session === session)!;
const asStat = (r: MMRecord): StatWithOrigins => ({
  session: r.session,
  monMasterEntryId: r.ifc,
  accepted: r.stats.accepted,
  acceptedSameInstitution: r.stats.acceptedSameInstitution,
  acceptedSameAcademy: r.stats.acceptedSameAcademy,
  acceptedAtMainPhaseStart: r.stats.acceptedAtMainPhaseStart,
  origins: r.stats.origins,
});
const by = (r: MMRecord, o: string) => r.stats.origins.find((x) => x.origin === o)!;

beforeAll(async () => {
  for await (const r of readCsv('fixtures/live/monmaster-opendata/mon_master_2024_2025.csv'))
    records.push(normalizeRow(r, 'main'));
  for await (const r of readCsv('fixtures/live/monmaster-opendata/mon_master_2023.csv'))
    records.push(normalizeRow(r, '2023'));
});
afterAll(() => prisma.$disconnect());

describe('column mapping', () => {
  it('2025: applications = main + complementary phase, offers and accepted from *_total', () => {
    const vnp = rec('2500101KDKQN', 2025);
    expect(by(vnp, 'LICENCE').accepted).toBe(16);
    expect(vnp.stats).toMatchObject({
      acceptedSameInstitution: 7,
      acceptedSameAcademy: 10,
      acceptedAtMainPhaseStart: 12,
    });
    // MBA 2024 took part in the complementary phase: its candidates are counted in.
    const mba = rec('2400126NBJPY', 2024);
    expect(mba.stats.participatedPc).toBe(true);
    const total = mba.stats.origins.reduce((a, o) => a + (o.applications ?? 0), 0);
    expect(total).toBe((mba.stats.applicationsPp ?? 0) + (mba.stats.applicationsPc ?? 0));
  });

  it('2024 has the same schema as 2025', () => {
    const r = rec('2000144GANLI', 2024);
    expect(
      r.stats.origins.every(
        (o) => o.applications != null && o.offers != null && o.accepted != null,
      ),
    ).toBe(true);
    expect(r.stats.acceptedSameAcademy).toBe(3);
  });

  it('2023: BUT is absent from the schema, so null and never 0; the academy column is n_accept_acad', () => {
    const r = rec('2000144GANLI', 2023);
    expect(by(r, 'BUT')).toEqual({
      origin: 'BUT',
      applications: null,
      offers: null,
      accepted: null,
    });
    expect(by(r, 'LICENCE').applications).not.toBeNull();
    expect(r.stats.acceptedSameAcademy).toBe(4);
    expect(r.stats.acceptedAtMainPhaseStart).toBe(14);
  });

  it('an origin missing from a file gives null, not 0', () => {
    const o = originsOf(
      { n_can_lg3_pp: '5', n_prop_lg3_total: '2', n_accept_lg3_total: '1' },
      'main',
    );
    expect(o.find((x) => x.origin === 'LICENCE')).toMatchObject({
      applications: 5,
      offers: 2,
      accepted: 1,
    });
    expect(o.find((x) => x.origin === 'MASTER')).toMatchObject({
      applications: null,
      offers: null,
      accepted: null,
    });
  });
});

describe('sums', () => {
  it('on every pilot row, the origins add up to the totals (applications, offers, accepted)', () => {
    expect(records.length).toBe(24);
    for (const r of records) {
      const sum = (k: 'applications' | 'offers' | 'accepted') =>
        r.stats.origins.reduce((a, o) => a + (o[k] ?? 0), 0);
      expect(sum('applications'), r.ifc).toBe(
        (r.stats.applicationsPp ?? 0) + (r.stats.applicationsPc ?? 0),
      );
      expect(sum('offers'), r.ifc).toBe(r.stats.offers);
      expect(sum('accepted'), r.ifc).toBe(r.stats.accepted);
    }
  });

  it('the summary groups « Autre » and « Non inscrit », and its groups add up to the total', () => {
    const s = summarizeOrigins([asStat(rec('2500101KDKQN', 2025))])!;
    expect(s.stages.accepted.groups.map((g) => g.label)).toEqual([
      'Licence générale',
      'Licence pro',
      'BUT',
      'Master',
      'Autre ou non inscrit',
    ]);
    for (const stage of ['applications', 'offers', 'accepted'] as const)
      expect(s.stages[stage].groups.reduce((a, g) => a + (g.n ?? 0), 0)).toBe(
        s.stages[stage].total,
      );
    expect(s.stages.accepted.total).toBe(18);
    expect(s.stages.applications.total).toBe(320);
  });

  // The same check on the real national import: tests/data/national-import.test.ts.
});

describe('thresholds', () => {
  it('no rate under 10 applications (« n.c. »)', () => {
    expect(ratePer100(9, 3)).toBeNull();
    expect(ratePer100(10, 3)).toBe(30);
    expect(ratePer100(null, 3)).toBeNull();
    const s = summarizeOrigins([asStat(rec('2500101KDKQN', 2025))])!;
    const lp = s.rates.find((r) => r.id === 'LICENCE_PRO')!;
    expect(lp.applications).toBe(8);
    expect(lp.rate).toBeNull();
    expect(s.rates.find((r) => r.id === 'LICENCE')!.rate).toBe(18); // 40 / 224
  });

  it('under 5 accepted in all, numbers only; from 5, percentages', () => {
    const base = asStat(rec('2500101KDKQN', 2025));
    const four: StatWithOrigins = {
      ...base,
      accepted: 4,
      acceptedSameInstitution: 2,
      acceptedSameAcademy: 3,
      acceptedAtMainPhaseStart: 1,
      origins: [{ origin: 'LICENCE', applications: 30, offers: 6, accepted: 4 }],
    };
    const s4 = summarizeOrigins([four])!;
    expect(s4.percentages).toBe(false);
    expect(s4.figures.map((f) => [f.id, f.n, f.share])).toEqual([
      ['institution', 2, null],
      ['academy', 1, null],
      ['start', 1, null],
    ]);
    const s18 = summarizeOrigins([base])!;
    expect(s18.percentages).toBe(true);
    expect(s18.figures.map((f) => f.share)).toEqual([39, 44, 67]); // 7/18, 1 − 10/18, 12/18
  });
});

describe('several Mon Master numbers for one program (ACPCI)', () => {
  it('adds the figures of 2000144GJ2FE and 2000144GHGRB for the latest session only', () => {
    const rows = [
      rec('2000144GJ2FE', 2025),
      rec('2000144GHGRB', 2025),
      rec('2000144GJ2FE', 2024),
      rec('2000144GHGRB', 2024),
      rec('2000144GJ2FE', 2023),
    ].map(asStat);
    const s = summarizeOrigins(rows)!;
    expect(s.session).toBe(2025);
    expect(s.entries).toBe(2);
    expect(s.stages.applications.total).toBe(168 + 252);
    expect(s.stages.offers.total).toBe(31 + 39);
    expect(s.stages.accepted.total).toBe(9 + 9);
    expect(s.acceptedTotal).toBe(18);
  });

  it('in the database, the ACPCI fiche adds its two numbers', async () => {
    const p = await prisma.program.findUniqueOrThrow({
      where: { slug: 'administration-culturelle-projets-culturels-internationaux' },
      select: {
        monMasterEntries: { select: { code: true } },
        admissionStats: {
          select: {
            session: true,
            monMasterEntryId: true,
            accepted: true,
            acceptedSameInstitution: true,
            acceptedSameAcademy: true,
            acceptedAtMainPhaseStart: true,
            origins: { select: { origin: true, applications: true, offers: true, accepted: true } },
          },
        },
      },
    });
    expect(p.monMasterEntries.map((e) => e.code).sort()).toEqual(['2000144GHGRB', '2000144GJ2FE']);
    const s = summarizeOrigins(p.admissionStats)!;
    expect(s.entries).toBe(2);
    expect(s.stages.applications.total).toBe(420);
  });
});
