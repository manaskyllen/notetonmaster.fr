/**
 * Publication of Mon Master: two UAIs sharing a Paysage id are one establishment. The second UAI
 * is attached to the first university, never written as a second row (paysageId is unique: the
 * row was silently skipped and its identifiers pointed to a missing university, which broke the
 * accreditations with a foreign key error on the first import of production).
 */
import { describe, expect, it } from 'vitest';
import { planUniversities } from '@/lib/connectors/monmaster-opendata/publish';

const uni = (uai: string, paysage: string | null) => ({
  id: null,
  uai,
  aliases: [],
  name: `Université ${uai}`,
  slug: `universite-${uai.toLowerCase()}`,
  paysage,
  ref: null,
});

let n = 0;
const newId = () => `id-${++n}`;

describe('universities of a Mon Master import', () => {
  it('a second UAI with the same Paysage id becomes a UAI of the first', () => {
    n = 0;
    const todo = new Map([
      ['0211237F', uni('0211237F', 'pAyS1')],
      ['0251215K', uni('0251215K', 'pAyS2')],
      ['0212345A', uni('0212345A', 'pAyS1')],
    ]);
    const aliases = new Map([['0212345A', new Set(['0219999Z'])]]);
    const r = planUniversities(todo, aliases, new Map(), newId);
    expect(r.created.map(([uai, , id]) => [uai, id])).toEqual([
      ['0211237F', 'id-1'],
      ['0251215K', 'id-2'],
    ]);
    expect(r.extraUais).toEqual([
      { universityId: 'id-1', uai: '0212345A' },
      { universityId: 'id-1', uai: '0219999Z' },
    ]);
  });

  it('a UAI whose Paysage id is already in the database joins that university', () => {
    const r = planUniversities(
      new Map([['0211237F', uni('0211237F', 'pAyS1')]]),
      new Map(),
      new Map([['pAyS1', 'existing']]),
      newId,
    );
    expect(r.created).toEqual([]);
    expect(r.extraUais).toEqual([{ universityId: 'existing', uai: '0211237F' }]);
  });

  it('without a Paysage id, every UAI is its own university', () => {
    n = 0;
    const r = planUniversities(
      new Map([
        ['0211237F', uni('0211237F', null)],
        ['0212345A', uni('0212345A', null)],
      ]),
      new Map(),
      new Map(),
      newId,
    );
    expect(r.created).toHaveLength(2);
    expect(r.extraUais).toEqual([]);
  });
});
