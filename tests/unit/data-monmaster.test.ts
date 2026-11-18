/** monmaster-opendata on the real pilot rows of fixtures/live (sessions 2023, 2024, 2025). No network. */
import { describe, expect, it, beforeAll } from 'vitest';
import { readCsv } from '@/lib/data/csv';
import { normProgramTitle } from '@/lib/data/normalize';
import { matchFormations, type ProgramRef } from '@/lib/connectors/monmaster-opendata/match';
import {
  cleanTitle,
  displayedRank,
  normalizeRow,
  outOfBounds,
  specificPlaces,
  type MMRecord,
} from '@/lib/connectors/monmaster-opendata/normalize';

const T = { high: 0.9, autoLink: 0.97, propose: 0.75, duplicate: 0.95 };
const records: MMRecord[] = [];
const rec = (ifc: string, session: number) =>
  records.find((r) => r.ifc === ifc && r.session === session)!;

beforeAll(async () => {
  for await (const r of readCsv('fixtures/live/monmaster-opendata/mon_master_2024_2025.csv'))
    records.push(normalizeRow(r, 'main'));
  for await (const r of readCsv('fixtures/live/monmaster-opendata/mon_master_2023.csv'))
    records.push(normalizeRow(r, '2023'));
});

/** The 7 pilot fiches of the seed, with their known numbers. */
const seed = (): ProgramRef[] => {
  const p = (
    id: string,
    uni: string,
    title: string,
    city: string,
    ifcs: string[],
    workStudy = false,
  ): ProgramRef => ({
    id,
    universityId: uni,
    titleKey: normProgramTitle(title),
    cityKey: city,
    workStudy,
    entries: ifcs.map((ifc) => ({ ifc, inmp: null, sessions: [2025] })),
  });
  return [
    p('vnp', 'nantes', 'Valorisation des nouveaux patrimoines', 'nantes', ['2500101KDKQN']),
    p(
      'epic',
      'nantes',
      'Expertise des médiations, professions et institutions de la culture (EPIC)',
      'nantes',
      ['2500101KWEVZ'],
    ),
    p('mcci', 'nantes', 'Médiation culturelle et communication internationale', 'nantes', [
      '2500101KNGLJ',
    ]),
    p('hacm', 'nantes', 'Histoire de l’art et culture matérielle', 'nantes', ['2500101K7QD2']),
    p(
      'acpci',
      'saclay',
      'Administration culturelle / Projets culturels internationaux (ACPCI)',
      'guyancourt',
      ['2000144GJ2FE', '2000144GHGRB'],
    ),
    p(
      'emas',
      'saclay',
      'Événementiel, médiation des arts et des sciences (EMAS)',
      'versailles',
      ['2000144GANLI'],
      true,
    ),
    p('mba', 'urca', 'Musées, bibliothèques, archives', 'troyes', ['2400126NBJPY']),
  ];
};
const UNI: Record<string, string> = {
  '0442953W': 'nantes',
  '0912408Y': 'saclay',
  '0511296G': 'urca',
};
const run = (programs: ProgramRef[]) =>
  matchFormations({
    records: records.filter((r) => UNI[r.uai]),
    programs,
    universityOf: (u) => UNI[u] ?? null,
    decisions: new Map(),
    thresholds: T,
  });

describe('Mon Master pilot rows', () => {
  it('reads the 2023 schema and the 2024-2025 schema', () => {
    expect(rec('2500101KDKQN', 2025).stats).toMatchObject({
      capacity: 19,
      applications: 320,
      offers: 47,
      accepted: 18,
      rankPp: 48,
    });
    expect(rec('2000144GJ2FE', 2023).stats).toMatchObject({
      applications: 248,
      offers: 24,
      accepted: 9,
      rankPp: 47,
    });
    expect(rec('2500101KNGLJ', 2025).stats.accepted).toBe(33); // MCCI: 33 accepted for 28 places
    expect(rec('2400126NBJPY', 2025).stats).toMatchObject({
      capacity: 15,
      applications: 496,
      offers: 51,
      rankPp: 141,
    });
    expect(rec('2000144GJ2FE', 2025).title).toBe(
      'Administration culturelle / Projets Culturels Internationaux',
    );
    expect(rec('2000144GJ2FE', 2024).title).toBe(rec('2000144GJ2FE', 2025).title); // #PR1138 and (PR1138)
    expect(records.every((r) => !outOfBounds(r))).toBe(true);
  });

  it('places: EMAS in Guyancourt in 2023-2024, Versailles in 2025; VNP at the FLCE in 2025', () => {
    expect(specificPlaces(rec('2000144GANLI', 2025))[0]!.commune).toBe('VERSAILLES');
    expect(specificPlaces(rec('2000144GANLI', 2024))[0]!.commune).toBe('GUYANCOURT');
    expect(specificPlaces(rec('2000144GANLI', 2023))[0]!.commune).toBe('GUYANCOURT');
    expect(specificPlaces(rec('2500101KDKQN', 2025)).map((p) => p.label)).toEqual([
      'Faculté des Langues et cultures étrangères (FLCE)',
    ]);
  });

  it('rank rule: complementary phase when published, else main; never in work-study', () => {
    expect(displayedRank(rec('2000144GANLI', 2025).stats, true)).toMatchObject({
      rank: null,
      reason: 'alternance',
    });
    expect(displayedRank(rec('2500101KDKQN', 2025).stats, false)).toEqual({
      rank: 48,
      phase: 'PP',
    });
    // Troyes 2024: took part in the complementary phase (pc = 1) but no PC rank published → PP rank
    const troyes = rec('2400126NBJPY', 2024);
    expect(troyes.stats.participatedPc).toBe(true);
    expect(displayedRank(troyes.stats, false)).toEqual({ rank: 208, phase: 'PP' });
    expect(displayedRank({ ...troyes.stats, rankPc: 250 }, false)).toEqual({
      rank: 250,
      phase: 'PC',
    });
  });

  it('links every 2025 pilot by its known number', () => {
    const m = run(seed());
    for (const [ifc, id] of Object.entries({
      '2500101KDKQN': 'vnp',
      '2500101KWEVZ': 'epic',
      '2500101KNGLJ': 'mcci',
      '2500101K7QD2': 'hacm',
      '2000144GJ2FE': 'acpci',
      '2000144GHGRB': 'acpci',
      '2000144GANLI': 'emas',
      '2400126NBJPY': 'mba',
    }))
      expect(m.get(ifc)).toMatchObject({ status: 'LINKED', programId: id });
  });

  it('re-accreditation of Nantes: old numbers linked when the title is identical, proposed otherwise', () => {
    const m = run(seed());
    expect(m.get('1703164RZYBS')).toMatchObject({ status: 'LINKED', programId: 'vnp' }); // VNP
    expect(m.get('1703164R5PND')).toMatchObject({ status: 'LINKED', programId: 'epic' }); // EPIC, (EPIC) is an alias
    expect(m.get('1703164RGHQC')).toMatchObject({ status: 'LINKED', programId: 'mcci' }); // MCCI 2024 « (MCCI) »
    expect(m.get('1703164R2HNX')).toMatchObject({ status: 'PROPOSED', programId: 'hacm' }); // longer title in Mon Master
  });

  it('Troyes 2023 (other mention, other title) is history without a fiche', () => {
    expect(run(seed()).get('1801037C1PKT')?.status).toBe('IGNORED');
  });

  it('ACPCI without its fiche: two separate fiches and a recommended merge proposal, never an automatic merge', () => {
    const m = run(seed().filter((p) => p.id !== 'acpci'));
    expect(m.get('2000144GHGRB')).toMatchObject({ status: 'NEW' });
    expect(m.get('2000144GHGRB')).not.toHaveProperty('merge');
    expect(m.get('2000144GJ2FE')).toMatchObject({
      status: 'NEW',
      merge: { withIfc: '2000144GHGRB', recommended: true, groupSize: 2 },
    });
  });

  it('a merge is recommended only in a group of 2 numbers, never for an MEEF mention', () => {
    const base = rec('2000144GJ2FE', 2025);
    const twin = (ifc: string, extra: Partial<MMRecord> = {}): MMRecord => ({
      ...base,
      ifc,
      ...extra,
    });
    const go = (recs: MMRecord[]) =>
      matchFormations({
        records: recs,
        programs: [],
        universityOf: () => 'saclay',
        decisions: new Map(),
        thresholds: T,
      });
    expect(go([twin('A1'), twin('A2')]).get('A2')).toMatchObject({ merge: { recommended: true } });
    expect(go([twin('A1'), twin('A2'), twin('A3')]).get('A3')).toMatchObject({
      merge: { recommended: false, groupSize: 3 },
    });
    const meef = {
      mention: "METIERS DE L'ENSEIGNEMENT, DE L'EDUCATION ET DE LA FORMATION (MEEF), 2ND DEGRE",
      discipline: 'MEEF',
    };
    expect(go([twin('B1', meef), twin('B2', meef)]).get('B2')).toMatchObject({
      merge: { recommended: false },
    });
  });

  it('cleans new titles minimally: spaces, brackets, apostrophes, quotes; never the case or accents', () => {
    expect(cleanTitle('  Santé Arts Cultures (MISAC )  ')).toBe('Santé Arts Cultures (MISAC)');
    expect(cleanTitle("Histoire de l'art et culture matérielle")).toBe(
      'Histoire de l’art et culture matérielle',
    );
    expect(cleanTitle('Evénementiel, Médiation des "Arts"')).toBe(
      'Evénementiel, Médiation des « Arts »',
    );
  });
});
