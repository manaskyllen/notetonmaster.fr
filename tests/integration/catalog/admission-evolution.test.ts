/** « Comment ce master évolue » (feature 2): history across numbers, annotations, promos. */
import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import {
  evolutionAnnotations,
  evolutionPoints,
  historyStats,
  promoRatings,
  type EvolutionStat,
} from '@/lib/domain/admission-evolution';
import { getEvolution } from '@/lib/queries/evolution';

afterAll(() => prisma.$disconnect());

const stat = (
  session: number,
  entry: string,
  o: Partial<EvolutionStat> & { lieux?: string; mention?: string; alternance?: string } = {},
): EvolutionStat => ({
  session,
  entry,
  applications: o.applications ?? 100,
  offers: o.offers ?? 10,
  capacity: o.capacity ?? 20,
  raw: {
    lieux: o.lieux ?? 'Campus - NANTES (44)',
    mention: o.mention ?? 'CULTURE, PATRIMOINE ET MEDIATION',
    alternance: o.alternance ?? '0',
  },
});

async function evolutionOf(slug: string) {
  const p = await prisma.program.findUniqueOrThrow({
    where: { slug },
    select: { id: true, title: true, accreditationId: true, mention: { select: { name: true } } },
  });
  return getEvolution({
    id: p.id,
    title: p.title,
    accreditationId: p.accreditationId,
    mentionName: p.mention.name,
  });
}

describe('history across number changes', () => {
  it('Nantes (VNP): 2023 and 2024 under the former number of the former mention, 2025 under the new one', async () => {
    const e = await evolutionOf('valorisation-des-nouveaux-patrimoines');
    expect(e.points.map((p) => [p.session, p.applications, p.offers])).toEqual([
      [2023, 113, 23],
      [2024, 145, 34],
      [2025, 320, 47],
    ]);
    expect(e.points.at(-1)!.rate).toBe(14.7);
    // the accented name comes from the predecessor accreditation (« succède à »)
    expect(e.annotations).toContainEqual({
      kind: 'mention',
      when: '2023 et 2024',
      text: 'le parcours dépendait de l’ancienne mention « Civilisations, cultures et sociétés », sous un autre numéro Mon Master.',
    });
    expect(e.annotations.some((a) => a.kind === 'place')).toBe(false); // Nantes all along
  });

  it('EMAS: the move from Guyancourt to Versailles in 2025', async () => {
    const e = await evolutionOf('evenementiel-mediation-des-arts-et-des-sciences');
    expect(e.points.map((p) => p.session)).toEqual([2023, 2024, 2025]);
    expect(e.annotations).toContainEqual({
      kind: 'place',
      when: '2025',
      text: 'la formation passe de Guyancourt à Versailles.',
    });
    expect(e.annotations).toContainEqual({
      kind: 'capacity',
      when: '2025',
      text: '22 places au lieu de 20.',
    });
  });

  it('inherits the sessions of the same parcours under a former accreditation, never a covered session', () => {
    const own = [stat(2025, 'NEW', { applications: 300 })];
    const old = [
      stat(2023, 'OLD', { applications: 110 }),
      stat(2024, 'OLD', { applications: 140 }),
      stat(2025, 'OLD', { applications: 999 }),
    ];
    const h = historyStats(own, old);
    expect(h.map((s) => [s.session, s.applications])).toEqual([
      [2023, 110],
      [2024, 140],
      [2025, 300],
    ]);
  });

  it('adds two numbers of one session, and never draws an absent session as 0', () => {
    const pts = evolutionPoints([
      stat(2023, 'A', { applications: 100, offers: 10 }),
      stat(2023, 'B', { applications: 50, offers: 5 }),
      stat(2025, 'A', { applications: 200, offers: 20 }),
    ]);
    expect(pts).toEqual([
      { session: 2023, applications: 150, offers: 15, rate: 10 },
      { session: 2025, applications: 200, offers: 20, rate: 10 },
    ]);
  });
});

describe('annotations', () => {
  it('work-study and places', () => {
    const a = evolutionAnnotations(
      [
        stat(2024, 'A', { alternance: '0', capacity: 20 }),
        stat(2025, 'A', { alternance: '1', capacity: 24 }),
      ],
      { mentionName: 'Culture, patrimoine et médiation' },
    );
    expect(a).toEqual([
      { kind: 'capacity', when: '2025', text: '24 places au lieu de 20.' },
      { kind: 'workStudy', when: '2025', text: 'la formation passe en alternance.' },
    ]);
  });

  it('a former mention on the same number does not say « sous un autre numéro »', () => {
    const a = evolutionAnnotations(
      [stat(2024, 'A', { mention: 'CIVILISATIONS, CULTURES ET SOCIETES' }), stat(2025, 'A')],
      { mentionName: 'Culture, patrimoine et médiation' },
      new Map([['civilisations cultures et societes', 'Civilisations, cultures et sociétés']]),
    );
    expect(a).toEqual([
      {
        kind: 'mention',
        when: '2024',
        text: 'le parcours dépendait de l’ancienne mention « Civilisations, cultures et sociétés ».',
      },
    ]);
  });
});

describe('the rating, promo by promo', () => {
  it('a promo appears from 3 published reviews; none: the list is empty (section hidden)', () => {
    expect(
      promoRatings([
        { cohortYear: 2024, avg: 3.9, count: 4 },
        { cohortYear: 2023, avg: 4.2, count: 3 },
        { cohortYear: 2025, avg: 5, count: 2 },
      ]),
    ).toEqual([
      { year: 2023, avg: 4.2, count: 3 },
      { year: 2024, avg: 3.9, count: 4 },
    ]);
    expect(promoRatings([{ cohortYear: 2025, avg: 4, count: 2 }])).toEqual([]);
  });
});
