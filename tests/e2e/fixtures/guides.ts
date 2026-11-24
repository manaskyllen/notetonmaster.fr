/**
 * Guides of the end-to-end tests (/guides, /guides/{slug}, the section of the city pages):
 * - a published Strasbourg guide, with tokens, a ranking table, a « Questions fréquentes » section
 *   and links to the city page and to another guide;
 * - a draft (its address answers 404);
 * - 25 « Méthode » guides about every city, published one hour apart: 20 per page, so page 2 of
 *   /guides?sujet=methode shows the 5 oldest.
 * Then the figures of the guides, as after a sync.
 */
import { prisma } from '@/lib/db';
import { refreshArticleFigures } from '@/lib/articles/figures.server';

export const E2E_GUIDE = 'e2e-guide-strasbourg';
export const E2E_DRAFT = 'e2e-guide-brouillon';

const BODY = `Strasbourg compte **{{ville.parcours}} parcours de master** publics, dans {{ville.etablissements}} établissements. Les chiffres viennent de note ton master et de Mon Master.

::: chiffres-ville :::

## Les masters les plus demandés

Les formations qui reçoivent le plus de candidatures, d'après la session {{session}}.

::: classement type=plus-demandes limite=5 min_candidatures=0 :::

Tous les parcours sont sur la [page Strasbourg](/masters/strasbourg), et la méthode dans [le guide de pagination 01](/guides/e2e-pagination-01).

## Bien lire un taux d'accès

Un taux d'accès compare des propositions à des candidatures.

## Questions fréquentes

**Combien y a-t-il de masters à Strasbourg ?**
{{ville.parcours}} parcours de master publics.

**Où trouver tous les masters ?**
Sur la [page Strasbourg](/masters/strasbourg).
`;

export async function loadGuides() {
  const at = (h: number) => new Date(Date.UTC(2026, 9, 1, 8) + h * 3600_000);
  await prisma.article.create({
    data: {
      slug: E2E_GUIDE,
      title: 'Masters à Strasbourg : le guide de test',
      city: 'strasbourg',
      theme: 'SELECTIVITE',
      lede: 'Un guide de test pour les parcours de Strasbourg. Les chiffres viennent de la base.',
      body: BODY,
      metaDescription:
        'Guide de test des masters à Strasbourg : les parcours les plus demandés, la sélectivité et les questions fréquentes, avec les chiffres Mon Master.',
      keyword: 'master Strasbourg',
      searchKeywords: ['unistra', 'essai'],
      relatedSlugs: ['e2e-pagination-25'],
      status: 'PUBLISHED',
      online: true,
      publishedAt: at(100),
    },
  });
  await prisma.article.create({
    data: {
      slug: E2E_DRAFT,
      title: 'Brouillon de test',
      city: 'strasbourg',
      lede: 'Jamais public.',
      body: 'Brouillon.',
      metaDescription: 'Brouillon.',
    },
  });
  for (let i = 1; i <= 25; i++) {
    const n = String(i).padStart(2, '0');
    await prisma.article.create({
      data: {
        slug: `e2e-pagination-${n}`,
        title: `Guide de pagination ${n}`,
        theme: 'METHODE',
        lede: `Le guide de pagination numéro ${n}. Il sert aux tests.`,
        body: `Texte du guide ${n}.`,
        metaDescription: `Guide de pagination ${n}.`,
        status: 'PUBLISHED',
        online: true,
        publishedAt: at(i),
      },
    });
  }
  await refreshArticleFigures();
}
