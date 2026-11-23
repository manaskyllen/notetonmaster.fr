import { describe, expect, it } from 'vitest';
import { ficheUrl, reviewFormTitle, reviewFormUrl, shareTargets } from '@/lib/domain/share';

/** « Partager » of a fiche parcours (issue #13). */
const input = {
  origin: 'https://notetonmaster.fr',
  slug: 'valorisation-des-nouveaux-patrimoines',
  parcours: 'Valorisation des nouveaux patrimoines',
  university: 'Nantes Université',
};

describe('share targets', () => {
  it('give the canonical fiche and the review form set on the parcours', () => {
    const [fiche, avis] = shareTargets(input);
    expect(fiche!.url).toBe(
      'https://notetonmaster.fr/parcours/valorisation-des-nouveaux-patrimoines',
    );
    expect(avis!.url).toBe(
      'https://notetonmaster.fr/avis/nouveau?parcours=valorisation-des-nouveaux-patrimoines',
    );
    expect(ficheUrl(input.origin, input.slug)).toBe(fiche!.url);
    expect(reviewFormUrl(input.origin, input.slug)).toBe(avis!.url);
  });

  it('never carry a tracking parameter', () => {
    for (const t of shareTargets(input)) {
      const u = new URL(t.url);
      expect([...u.searchParams.keys()].filter((k) => k !== 'parcours')).toEqual([]);
      expect(t.url).not.toMatch(/utm_|ref=|source=|fbclid|gclid/);
    }
  });

  it('have a title and a text of their own', () => {
    const [fiche, avis] = shareTargets(input);
    expect(fiche!.title).toBe(
      'Valorisation des nouveaux patrimoines — Nantes Université, sur notetonmaster',
    );
    expect(avis!.text).toBe(
      'Tu as fait le master Valorisation des nouveaux patrimoines ? Donne ton avis, c’est anonyme et ça aide les suivant·es.',
    );
    expect(avis!.title).toBe(reviewFormTitle(input.parcours));
    expect(reviewFormTitle(input.parcours)).toBe(
      'Donne ton avis sur Valorisation des nouveaux patrimoines',
    );
  });
});
