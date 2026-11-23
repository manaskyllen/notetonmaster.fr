import { describe, expect, it } from 'vitest';
import { detectNamedPerson } from '@/lib/domain/names';
import { cleanTitle, TITLE_MAX, titleHasLink, titleHint } from '@/lib/domain/review-title';
import { reviewEditSchema, reviewSchema, reviewStep2 } from '@/lib/validation';

/** « Ton master en une phrase » (issue #20). */
const step2 = {
  overallRating: 4,
  pros: 'Beaucoup de terrain et des intervenant·es du métier.',
  cons: 'Le premier semestre est très chargé, les salles loin.',
  scores: {},
};
const title = (t: unknown) => reviewStep2.safeParse({ ...step2, title: t });

describe('review title', () => {
  it('removes the quotes typed, the line breaks and the extra spaces', () => {
    expect(cleanTitle('« Le terrain avant tout »')).toBe('Le terrain avant tout');
    expect(cleanTitle('"Le terrain avant tout"')).toBe('Le terrain avant tout');
    expect(cleanTitle('“Le terrain” avant tout')).toBe('Le terrain avant tout');
    expect(cleanTitle("'Le terrain avant tout'")).toBe('Le terrain avant tout');
    expect(cleanTitle('‘ Le terrain ’')).toBe('Le terrain');
    expect(cleanTitle('  Le   terrain\navant\r\ntout  ')).toBe('Le terrain avant tout');
    // An apostrophe inside is kept.
    expect(cleanTitle('L’histoire de l’art, enfin')).toBe('L’histoire de l’art, enfin');
    expect(cleanTitle(null)).toBe('');
  });

  it('is required, 5 to 80 characters once cleaned', () => {
    expect(title('Le terrain avant tout').success).toBe(true);
    expect(title('').success).toBe(false);
    expect(title(undefined).success).toBe(false);
    expect(title('Top').success).toBe(false);
    // 3 characters inside quotes are still 3 characters.
    expect(title('« Top »').success).toBe(false);
    expect(title('x'.repeat(TITLE_MAX)).success).toBe(true);
    expect(title('x'.repeat(TITLE_MAX + 1)).success).toBe(false);
    const parsed = title('« Le terrain avant tout »');
    expect(parsed.success && parsed.data.title).toBe('Le terrain avant tout');
  });

  it('refuses links', () => {
    expect(titleHasLink('Voir https://exemple.fr')).toBe(true);
    expect(titleHasLink('Tout sur www.exemple.org')).toBe(true);
    expect(titleHasLink('Mon blog exemple.fr')).toBe(true);
    expect(titleHasLink('Le terrain avant tout')).toBe(false);
    expect(titleHasLink('Master 2. Bon choix')).toBe(false);
    expect(title('Tout est sur monblog.fr').success).toBe(false);
  });

  it('is checked for names like the other fields', () => {
    expect(detectNamedPerson('Merci Mme Durand').found).toBe(true);
    expect(detectNamedPerson('Le terrain avant tout').found).toBe(false);
  });

  it('is part of a new review, optional when editing an old one', () => {
    const review = {
      programSlug: 'valorisation-des-nouveaux-patrimoines',
      level: 'M2',
      cohortYear: 2024,
      mode: 'none',
      email: 'a@exemple.fr',
      acceptsQuestions: false,
      wantsBadge: false,
      charter: true,
      ...step2,
    };
    expect(reviewSchema.safeParse(review).success).toBe(false);
    expect(reviewSchema.safeParse({ ...review, title: 'Le terrain avant tout' }).success).toBe(
      true,
    );
    const edit = { ...step2, level: 'M2', cohortYear: 2024 };
    expect(reviewEditSchema.safeParse({ ...edit, title: '' }).success).toBe(true);
    expect(reviewEditSchema.safeParse({ ...edit, title: 'Top' }).success).toBe(false);
  });

  it('counts the characters left, as the other fields do', () => {
    expect(titleHint('').text).toBe('Ce sera le titre de ton avis. Encore 5 caractères au moins');
    expect(titleHint('Bien').text).toBe(
      'Ce sera le titre de ton avis. Encore 1 caractère au moins',
    );
    expect(titleHint('« Le terrain avant tout »')).toEqual({
      text: 'Ce sera le titre de ton avis. 59 caractères restants',
      tone: 'ok',
    });
  });
});
