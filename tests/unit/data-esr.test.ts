/** esr-etablissements on the real extracts of fixtures/live (pilot rows): no network. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readCsv } from '@/lib/data/csv';
import { indexCommunes, resolveCommune, type Commune } from '@/lib/data/geo';
import { matchUniversity, type UniversityIndex } from '@/lib/data/match';
import { normalizeEtab } from '@/lib/connectors/esr-etablissements';

const T = { high: 0.9, autoLink: 0.97, propose: 0.75, duplicate: 0.95 };

async function etabs() {
  const out = [];
  for await (const r of readCsv('fixtures/live/esr-etablissements/principaux_etablissements.csv'))
    out.push(normalizeEtab(r));
  return out;
}

describe('esr-etablissements (pilot rows)', () => {
  it('normalises the pilot universities', async () => {
    const byUai = new Map((await etabs()).map((e) => [e.uai, e]));
    const saclay = byUai.get('0912408Y')!;
    expect(saclay.paysage).toBe('G2qA7');
    expect(saclay.oldUais).toEqual(['0912330N', '0911101C']);
    expect(saclay.lat).toBeCloseTo(48.709629);
    expect(saclay.shortName).toBeNull();
    const urca = byUai.get('0511296G')!;
    expect(urca.shortName).toBe('URCA');
    expect(urca.comCode).toBe('51454');
    const nantes = byUai.get('0442953W')!;
    expect(nantes.shortName).toBeNull(); // « NU » is a sigle: search keyword only
    expect(nantes.acronym).toBe('NU');
    expect(nantes.oldUais).toEqual(['0440984F']);
    expect(byUai.get('0781944P')!.shortName).toBe('UVSQ');
  });

  it('matches by UAI, former UAI, Paysage, then name + commune', () => {
    const idx: UniversityIndex = {
      byUai: new Map([['0442953W', 'nantes']]),
      byPaysage: new Map([['G2qA7', 'saclay']]),
      list: [
        { id: 'nantes', name: 'Nantes Université', key: 'nantes universite', city: 'nantes' },
        {
          id: 'urca',
          name: 'Université de Reims Champagne-Ardenne',
          key: 'universite de reims champagne ardenne',
          city: 'reims',
        },
      ],
    };
    expect(matchUniversity(idx, { uai: '0440984F', oldUais: [], name: 'x' }, T).status).toBe('NEW');
    expect(matchUniversity(idx, { uai: 'X', oldUais: ['0442953W'], name: 'x' }, T)).toMatchObject({
      status: 'LINKED',
      id: 'nantes',
    });
    expect(matchUniversity(idx, { uai: 'X', paysage: 'G2qA7', name: 'x' }, T)).toMatchObject({
      status: 'LINKED',
      id: 'saclay',
    });
    expect(
      matchUniversity(idx, { name: 'Université de Reims Champagne Ardenne', commune: 'Reims' }, T),
    ).toMatchObject({ status: 'LINKED', id: 'urca' });
    expect(
      matchUniversity(idx, { name: 'Université de Reims-Champagne', commune: 'Reims' }, T).status,
    ).toBe('PROPOSED');
    expect(matchUniversity(idx, { name: 'Université de Reims', commune: 'Reims' }, T).status).toBe(
      'NEW',
    );
  });

  it('resolves Mon Master communes by name and department', () => {
    const idx = indexCommunes(
      JSON.parse(
        readFileSync('fixtures/live/esr-etablissements/geo_communes.json', 'utf8'),
      ) as Commune[],
    );
    expect(resolveCommune(idx, 'TROYES', '10')?.code).toBe('10387');
    expect(resolveCommune(idx, 'GUYANCOURT', '78')?.code).toBe('78297');
    expect(resolveCommune(idx, 'PARIS 13', '75')?.code).toBe('75056');
    expect(resolveCommune(idx, 'SAINT-DENIS', '93')?.code).toBeTruthy();
    expect(resolveCommune(idx, 'SAINT-DENIS', null)).toBeNull(); // ambiguous without department
  });
});
