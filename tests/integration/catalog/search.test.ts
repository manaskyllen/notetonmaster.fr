import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import {
  codeCandidates,
  looksLikeCode,
  matchCode,
  matchedByText,
  matchLocal,
  normalizeCode,
  rankScore,
} from '@/lib/domain/search';
import { search, searchPage } from '@/lib/domain/search.server';
import { browsePrograms } from '@/lib/catalog/browse';
import { EMPTY_FILTERS, readFilters } from '@/lib/catalog/filters';

/** Pure rules of the search. */
describe('search: codes', () => {
  it('normalises codes: case, spaces, dashes', () => {
    expect(normalizeCode('rncp 42684')).toBe('RNCP42684');
    expect(normalizeCode('RNCP-42684')).toBe('RNCP42684');
    expect(normalizeCode('2500101kdkqn')).toBe('2500101KDKQN');
  });
  it('recognises code shapes', () => {
    for (const c of ['RNCP42684', '42684', '0442953W', '2500101KDKQN', '2500101'])
      expect(looksLikeCode(c), c).toBe(true);
    for (const c of ['NANTES', 'M2', '2025', 'RNCP']) expect(looksLikeCode(c), c).toBe(false);
  });
  it('joins two words into one code only when they form an RNCP, UAI or Mon Master number', () => {
    expect(codeCandidates('rncp 42684')).toEqual([{ code: 'RNCP42684', words: [0, 1] }]);
    expect(codeCandidates('2500101 kdkqn')).toEqual([{ code: '2500101KDKQN', words: [0, 1] }]);
    expect(codeCandidates('42684 nantes')).toEqual([{ code: '42684', words: [0] }]);
    expect(codeCandidates('patrimoine nantes')).toEqual([]);
  });
  it('matches a bare RNCP number and code prefixes', () => {
    expect(matchCode('42684', 'RNCP42684')).toBe('exact');
    expect(matchCode('2500101', '2500101KDKQN')).toBe('prefix');
    expect(matchCode('RNCP35804', 'RNCP42684')).toBe(null);
  });
  it('filters a local list by text and codes', () => {
    const codes = [{ kind: 'RNCP' as const, value: 'RNCP42684', label: 'RNCP' }];
    expect(matchLocal(['Valorisation', 'Nantes'], codes, 'rncp 42684 nantes')).toEqual({
      kind: 'RNCP',
      value: 'RNCP42684',
      label: 'RNCP',
    });
    expect(matchLocal(['Valorisation', 'Nantes'], codes, 'nantes')).toEqual({ kind: 'TEXT' });
    expect(matchLocal(['Valorisation', 'Nantes'], [], 'RNCP42684')).toBe(null);
    expect(matchedByText({ kind: 'RNCP', value: 'RNCP42684', label: 'RNCP' })).toBe(
      'RNCP · RNCP42684',
    );
  });
  it('ranks identifiers above titles above text', () => {
    const exact = rankScore({ identifier: 'exact', title: 'x', query: 'y' });
    const prefix = rankScore({ identifier: 'prefix', title: 'x', query: 'y' });
    const title = rankScore({ title: 'Nantes Université', query: 'nantes universite' });
    const start = rankScore({ title: 'Nantes Université', query: 'nantes' });
    const text = rankScore({ title: 'x', query: 'y', tsRank: 0.9 });
    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(title);
    expect(title).toBeGreaterThan(start);
    expect(start).toBeGreaterThan(text);
  });
});

/** Integration: the seeded catalogue in the dev database (runs in the app container). */
describe('search: seeded catalogue', () => {
  afterAll(() => prisma.$disconnect());
  const programs = async (q: string) =>
    (await search(q, { types: ['program'] })).map((r) => r.href.replace('/parcours/', ''));

  it('finds every program of the mention by its RNCP number, written any way', async () => {
    // Every public program of the mention (pilot seed: 9; national data: more).
    const expected = await prisma.programSearchIndex.count({
      where: {
        isPublicSector: true,
        mentionId: (
          await prisma.identifier.findFirstOrThrow({
            where: { value: 'RNCP42684', entityType: 'MENTION' },
          })
        ).entityId,
      },
    });
    for (const q of ['RNCP42684', 'rncp 42684', '42684']) {
      const r = await search(q, { types: ['program'] });
      expect(r.length, q).toBe(expected);
      expect(r[0]!.matchedBy).toEqual({ kind: 'RNCP', value: 'RNCP42684', label: 'RNCP' });
    }
    const old = await search('RNCP35804', { types: ['mention'] });
    expect(old[0]!.matchedBy).toMatchObject({ kind: 'RNCP_PREVIOUS', label: 'RNCP (ancienne)' });
  });
  it('finds a program by its Mon Master number', async () => {
    expect(await programs('2500101kdkqn')).toEqual(['valorisation-des-nouveaux-patrimoines']);
    const r = await search('2500101KDKQN');
    expect(r[0]!.matchedBy).toEqual({
      kind: 'MONMASTER',
      value: '2500101KDKQN',
      label: 'Mon Master',
    });
  });
  it('finds Nantes Université and its programs by UAI', async () => {
    const r = await searchPage('0442953W', { limits: { program: 1000 } });
    const nantes = await prisma.programSearchIndex.count({
      where: { universityKey: '0442953W', isPublicSector: true },
    });
    expect(r.totals.program).toBe(nantes);
    // The university designated by its own UAI comes first.
    expect(r.results[0]).toMatchObject({ type: 'university', title: 'Nantes Université' });
  });
  it('requires every word: "patrimoine nantes" keeps programs about both', async () => {
    const found = await programs('patrimoine nantes');
    expect(found).toContain('valorisation-des-nouveaux-patrimoines');
    expect(found).not.toContain('evenementiel-mediation-des-arts-et-des-sciences');
    expect(await programs('PATRIMOINE   nantés')).toEqual(found);
  });
  it('tolerates a typo and an unfinished word', async () => {
    expect(await programs('patrimoin')).toContain('valorisation-des-nouveaux-patrimoines');
    expect(await programs('valorsation')).toContain('valorisation-des-nouveaux-patrimoines');
  });
  it('mixes a code and words', async () => {
    // (Versailles is not an open city since the launch on three cities)
    expect(await programs('rncp 42684 valorisation')).toEqual([
      'valorisation-des-nouveaux-patrimoines',
    ]);
  });
  it('returns nothing for an unknown code', async () => {
    expect(await search('RNCP99999')).toEqual([]);
    expect(await search('9999999ZZZZZ')).toEqual([]);
  });
  it('lists cities with their programs and region', async () => {
    const r = await search('loire atlantique', { types: ['city'] });
    expect(r.find((c) => c.title === 'Nantes')).toMatchObject({
      href: '/explorer?lieu=insee%3A44109',
    });
    expect(r.find((c) => c.title === 'Nantes')!.subtitle).toMatch(/Pays de la Loire · \d+ masters/);
  });
});

/** Ranking of the results, on the seed (pilot or national). */
describe('search: ranking', () => {
  it('puts « Valorisation des nouveaux patrimoines » in the top 3 for « patrimoine nantes »', async () => {
    const r = await search('patrimoine nantes', { types: ['program'], limit: 3 });
    expect(r.map((x) => x.title)).toContain('Valorisation des nouveaux patrimoines');
  });
  it('gives the mention first for its RNCP number', async () => {
    const r = await search('RNCP42684', { limit: 5 });
    expect(r[0]).toMatchObject({ type: 'mention', title: 'Culture, patrimoine et médiation' });
  });
  it('ranks an exact identifier above a title starting with the query above plain text', async () => {
    const r = await search('2500101KDKQN', { types: ['program'] });
    expect(r[0]!.matchedBy.kind).toBe('MONMASTER');
  });
  it('is stable from one page to the next: 5 pages, no duplicate, nothing missing', async () => {
    for (const q of ['', 'droit', 'master']) {
      const f = readFilters(q ? { q } : {});
      const all = await browsePrograms(f, {}, { offset: 0, limit: 100 });
      const paged = [];
      for (let p = 0; p < 5; p++)
        paged.push(...(await browsePrograms(f, {}, { offset: p * 20, limit: 20 })).rows);
      const ids = paged.map((r) => r.programId);
      expect(new Set(ids).size, q).toBe(ids.length);
      expect(ids, q).toEqual(all.rows.map((r) => r.programId));
    }
  });
  it('caps the public search at 1 000 results', async () => {
    const r = await browsePrograms({ ...EMPTY_FILTERS, q: 'master' }, {}, { offset: 0, limit: 1 });
    expect(r.reachable).toBe(Math.min(r.total, 1000));
    const none = await browsePrograms(EMPTY_FILTERS, {}, { offset: 0, limit: 1 });
    expect(none.reachable).toBe(none.total);
  });
});
