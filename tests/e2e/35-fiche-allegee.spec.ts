import { expect, test } from '@playwright/test';
import { sql, waitForHydration } from './helpers';
import { E2E_EXTRAS } from './fixtures/names';

/** Fiche parcours: reviews first, identity at the bottom. */
const VNP = 'valorisation-des-nouveaux-patrimoines';

test('hero: only « Suivre », « Partager » and « Donner mon avis »; tabs over the whole width, no column', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/parcours/${VNP}`);
  await waitForHydration(page);
  const hero = page.locator('section').filter({ has: page.getByRole('heading', { level: 1 }) });
  // anonymous: « Suivre » is a link to the login code, which follows the master on the way back
  await expect(
    hero.getByRole('link', { name: /^Suivre : .* \(connexion requise\)$/ }),
  ).toBeVisible();
  await expect(hero.getByRole('link', { name: 'Donner mon avis' })).toBeVisible();
  await expect(hero.getByRole('button', { name: 'Partager' })).toBeVisible();
  await expect(hero.getByRole('button', { name: /vœux/ })).toHaveCount(0);
  await expect(page.getByRole('complementary')).toHaveCount(0);
  await expect(page.getByRole('tab')).toHaveText([
    'Avis',
    /^Questions \(\d+\)$/,
    'Programme',
    'Admission',
  ]);
  const tabs = page.locator('#avis');
  const main = page.locator('main > div');
  expect((await tabs.boundingBox())!.width).toBeGreaterThan(
    (await main.boundingBox())!.width - 120,
  );
  await expect(page.getByText(/Vivre à/)).toHaveCount(0);

  // « Répondre aux avis »: a plain link at the bottom of the Avis tab, under the charter note
  const charter = tabs.getByText(/charte de modération/);
  const reply = tabs.getByRole('link', {
    name: 'Vous êtes responsable de ce parcours ? Répondre aux avis',
  });
  await expect(reply).toBeVisible();
  expect((await reply.boundingBox())!.y).toBeGreaterThan((await charter.boundingBox())!.y);
});

test('?onglet=debouches opens the Avis tab', async ({ page }) => {
  await page.goto(`/parcours/${VNP}?onglet=debouches`);
  await waitForHydration(page);
  await expect(page.getByRole('tab', { name: 'Avis' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: /Débouchés/ })).toHaveCount(0);
});

test('« Même mention, ailleurs »: same city first, never the current parcours, at most 4 cards', async ({
  page,
}) => {
  await page.goto(`/parcours/${VNP}`);
  const block = page.getByRole('region', { name: 'Même mention, ailleurs' });
  await expect(block.getByText(/^D’autres parcours du master /)).toBeVisible();
  await expect(
    block.getByRole('link', { name: /^Voir les \d+ parcours de la mention →$/ }),
  ).toBeVisible();
  const cards = block.getByRole('listitem');
  const n = await cards.count();
  expect(n).toBeGreaterThan(0);
  expect(n).toBeLessThanOrEqual(4);
  await expect(
    block.getByRole('link', { name: 'Valorisation des nouveaux patrimoines', exact: true }),
  ).toHaveCount(0);
  // the cards of Nantes come before the others
  const cities = await cards.evaluateAll((els) =>
    els.map((e) => e.querySelector('div > span + span')?.textContent ?? ''),
  );
  const firstOther = cities.findIndex((c) => c !== 'Nantes');
  if (firstOther >= 0) expect(cities.slice(firstOther).includes('Nantes')).toBe(false);
  // never places on a card
  await expect(block.getByText(/places|candidatures/i)).toHaveCount(0);
});

test('« Même mention, ailleurs » is hidden when the mention has a single parcours', async ({
  page,
}) => {
  // « Études nordiques », a mention with a single parcours: tests/e2e/fixtures/extras.ts.
  const [{ n }] = (await sql<{ n: number }>(
    `SELECT count(*)::int n FROM "ProgramSearchIndex" WHERE "mentionSlug" = $1`,
    [E2E_EXTRAS.single.mention],
  )) as [{ n: number }];
  expect(n).toBe(1);
  await page.goto(`/parcours/${E2E_EXTRAS.single.program}`);
  await expect(page.getByRole('heading', { name: 'Fiche d’identité' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Même mention, ailleurs' })).toHaveCount(0);
});

test('Fiche d’identité: at the very bottom, lines from the data, sources computed', async ({
  page,
}) => {
  await page.goto(`/parcours/${VNP}`);
  const id = page.getByRole('region', { name: 'Fiche d’identité' });
  await expect(id.getByRole('heading', { name: 'Fiche d’identité' })).toHaveCSS(
    'font-size',
    '13px',
  );
  await expect(id.locator('dt')).toHaveText([
    'Université',
    'Composante',
    'Mention',
    'Certification',
    'Candidature',
    'Code établissement',
  ]);
  await expect(id.getByText(/^RNCP\d+ · niveau 7$/)).toBeVisible();
  await expect(id.getByRole('link', { name: /^Mon Master · n° \w+ ↗/ })).toHaveAttribute(
    'href',
    /^https:\/\/monmaster\.gouv\.fr\/formation\//,
  );
  await expect(id.getByText(/^UAI \w+$/)).toBeVisible();
  await expect(
    id.getByText(/^Sources : .*Mon Master.*\. Mise à jour le \d{1,2} \w+ \d{4} ·/),
  ).toBeVisible();
  await expect(id.getByRole('link', { name: 'Signaler une erreur' })).toHaveAttribute(
    'href',
    `/a-propos?sujet=error&parcours=${VNP}#contact`,
  );
  await expect(page.getByText(/Frais d’inscription/)).toHaveCount(0);
  // nothing after it but the footer
  const last = await page
    .locator('main > div')
    .evaluate((el) => el.lastElementChild?.getAttribute('aria-labelledby'));
  expect(last).toBe('id-title');
});

test('Fiche d’identité: an unknown line is left out', async ({ page }) => {
  const [p] = await sql<{ slug: string }>(
    `SELECT i.slug FROM "ProgramSearchIndex" i JOIN "Program" p ON p.id = i."programId"
      WHERE i."isPublicSector" AND p."componentId" IS NULL ORDER BY i.slug LIMIT 1`,
  );
  expect(p, 'a published parcours without component (fixtures)').toBeTruthy();
  await page.goto(`/parcours/${p!.slug}`);
  const id = page.getByRole('region', { name: 'Fiche d’identité' });
  await expect(id.locator('dt', { hasText: 'Université' })).toBeVisible();
  await expect(id.locator('dt', { hasText: 'Composante' })).toHaveCount(0);
});
