/** RNCP reader on the real pilot fiches (fixtures/live/rncp/fiches_pilotes_v4_1.xml). No network. */
import { createReadStream } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { frDate, readFiches, type RncpFiche } from '@/lib/connectors/rncp/parse';
import {
  lookupRncpName,
  mentionTitleFromRncp,
} from '@/lib/connectors/monmaster-opendata/mention-names';
import { normMention } from '@/lib/data/normalize';

async function fiches() {
  const out: { fiche: RncpFiche; missing: string[] }[] = [];
  for await (const f of readFiches(
    createReadStream('fixtures/live/rncp/fiches_pilotes_v4_1.xml', { highWaterMark: 1024 }),
  ))
    out.push(f);
  return out;
}

describe('RNCP export (pilot fiches)', () => {
  it('reads RNCP42684 and RNCP35804 in stream, even with tiny chunks', async () => {
    const all = await fiches();
    expect(all.map((f) => f.fiche.code)).toEqual(['RNCP42684', 'RNCP35804']);
    expect(all.every((f) => f.missing.length === 0)).toBe(true);
    const [now, old] = [all[0]!.fiche, all[1]!.fiche];
    expect(now).toMatchObject({
      mentionTitle: 'Culture, patrimoine et médiation',
      master: true,
      level: 7,
      active: true,
      validFrom: '2026-06-06',
      validTo: '2031-06-05',
      previous: ['RNCP35804'],
    });
    expect(now.certifiers.map((c) => c.name)).toContain('UNIVERSITE PARIS-SACLAY');
    expect(now.lastDelivery).toBe('2034-06-05');
    expect(old).toMatchObject({
      active: false,
      validTo: '2026-07-15',
      next: ['RNCP42684'],
      lastDelivery: '2029-07-15',
    });
  });

  it('names a mention from its RNCP title (accents), never from the upper case Mon Master label', () => {
    expect(mentionTitleFromRncp('Culture, patrimoine et médiation (fiche nationale)')).toBe(
      'Culture, patrimoine et médiation',
    );
    const names = new Map([
      [
        normMention('Comptabilité, contrôle, audit'),
        { code: 'RNCP1', title: 'Comptabilité, contrôle, audit' },
      ],
    ]);
    expect(lookupRncpName(names, normMention('COMPTABILITE - CONTROLE - AUDIT'))?.title).toBe(
      'Comptabilité, contrôle, audit',
    );
    expect(lookupRncpName(names, normMention('DROIT DES AFFAIRES'))).toBeNull();
  });

  it('dates', () => {
    expect(frDate('05/06/2031')).toBe('2031-06-05');
    expect(frDate('')).toBeNull();
  });

  it('only the number, level, title, state and dates are read: no ROME codes, skill blocks or jobs', async () => {
    const fiche = (await fiches())[0]!.fiche;
    expect(fiche).not.toHaveProperty('blocks');
    expect(fiche).not.toHaveProperty('rome');
    expect(fiche).not.toHaveProperty('jobs');
  });
});
