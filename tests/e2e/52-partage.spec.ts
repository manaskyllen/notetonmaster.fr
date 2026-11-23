import AxeBuilder from '@axe-core/playwright';
import { devices, expect, test, type Locator, type Page } from '@playwright/test';
import { qrMatrix, qrPath } from '@/lib/qr/matrix';
import { horizontalOverflow } from './responsive';
import { loginStudent, sql, uniqueEmail, waitForHydration } from './helpers';

/** « Partager » of a fiche parcours (issue #13): the panel, its two tabs, the sheet on a phone. */
const VNP = 'valorisation-des-nouveaux-patrimoines';
const PARCOURS = 'Valorisation des nouveaux patrimoines';
const TRACKERS = /utm_|[?&]source=|[?&]ref=|fbclid|gclid/;

/**
 * A copy button after a click: « done » with one check only (no « ✓ » in the text), the same
 * width, then back to « label » after 2 seconds.
 */
async function copyFeedback(button: Locator, label: string, done: string) {
  const live = button.locator('[aria-live="polite"]');
  await expect(live).toHaveText(label);
  const width = (await button.boundingBox())!.width;
  await button.click();
  await expect(button).toHaveAttribute('data-ok', 'true');
  await expect(live).toHaveText(done);
  await expect(button).not.toContainText('✓');
  await expect(button.locator('svg:visible')).toHaveCount(1);
  await expect(button.locator('.nm-i-ok svg')).toBeVisible();
  // Once the small pop is over: the width has not moved.
  await expect
    .poll(async () => Math.abs((await button.boundingBox())!.width - width))
    .toBeLessThanOrEqual(1);
  await expect(live).toHaveText(label, { timeout: 4000 });
  await expect(button).toHaveAttribute('data-ok', 'false');
  await expect(button.locator('svg:visible')).toHaveCount(1);
}

const seriousAxe = async (page: Page, include: string) =>
  (
    await new AxeBuilder({ page })
      .include(include)
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze()
  ).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');

test('computer: the popover, its tabs, the message, copy, WhatsApp and QR code', async ({
  page,
  context,
  baseURL,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const fiche = `${baseURL}/parcours/${VNP}`;
  const form = `${baseURL}/avis/nouveau?parcours=${VNP}`;
  await page.goto(`/parcours/${VNP}`);
  await waitForHydration(page);
  const hero = page.locator('section').filter({ has: page.getByRole('heading', { level: 1 }) });
  const share = hero.getByRole('button', { name: 'Partager' });
  await expect(share).toHaveAttribute('aria-expanded', 'false');
  // Between « Suivre » and « Donner mon avis ».
  const order = await hero
    .locator('a, button')
    .evaluateAll((els) => els.map((e) => e.textContent?.trim() ?? ''));
  const at = (t: RegExp) => order.findIndex((x) => t.test(x));
  expect(at(/^Suivre/)).toBeLessThan(at(/^Partager$/));
  expect(at(/^Partager$/)).toBeLessThan(at(/^Donner mon avis/));
  // As tall as « Suivre » and « Donner mon avis ».
  const heights = await Promise.all(
    [
      hero.getByRole('link', { name: /^Suivre/ }),
      share,
      hero.getByRole('link', { name: /Donner mon avis/ }),
    ].map(async (l) => Math.round((await l.boundingBox())!.height)),
  );
  expect(new Set(heights).size).toBe(1);

  // The panel is a chunk of its own, fetched on the first click only.
  const scripts: string[] = [];
  page.on('request', (r) => {
    if (r.resourceType() === 'script') scripts.push(r.url());
  });
  const h1 = hero.getByRole('heading', { level: 1 });
  const offset = async () => (await h1.boundingBox())!.y - (await hero.boundingBox())!.y;
  const before = await offset();
  await share.focus();
  await page.keyboard.press('Enter');
  const panel = page.getByRole('dialog', { name: 'Partager' });
  await expect(panel).toBeVisible();
  expect(scripts.length).toBeGreaterThan(0);
  await expect(share).toHaveAttribute('aria-expanded', 'true');
  await expect(share).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(share).toHaveCSS('color', 'rgb(59, 35, 184)');
  // 14 px under the button, centred on it; the hero does not scroll.
  const b = (await share.boundingBox())!;
  await expect
    .poll(async () => Math.round((await panel.boundingBox())!.y - (b.y + b.height)))
    .toBe(14);
  const p = (await panel.boundingBox())!;
  expect(Math.abs(p.x + p.width / 2 - (b.x + b.width / 2))).toBeLessThan(2);
  expect(p.width).toBe(420);
  expect(await offset()).toBe(before);

  // « Inviter ma promo » is open, and has the focus.
  const promo = panel.getByRole('tab', { name: 'Inviter ma promo' });
  const master = panel.getByRole('tab', { name: 'Le master' });
  await expect(promo).toHaveAttribute('aria-selected', 'true');
  await expect(promo).toBeFocused();
  const message = panel.locator('[data-share-message]');
  const promoText = `Hello la promo ! On peut donner un avis anonyme sur notre master en 5 minutes. Ça aide celles et ceux qui candidatent l’an prochain → ${form}`;
  await expect(message).toHaveText(promoText);

  expect(await seriousAxe(page, '[data-share-panel]')).toEqual([]);

  // Copy the message and the link.
  const copyButtons = panel.locator('button[data-ok]');
  await copyFeedback(copyButtons.nth(0), 'Copier le message', 'Message copié');
  const clip = async () => page.evaluate(() => navigator.clipboard.readText());
  expect(await clip()).toBe(promoText);

  // WhatsApp: the message and the link, encoded.
  const wa = await panel.getByRole('link', { name: 'WhatsApp' }).getAttribute('href');
  expect(wa).toBe(`https://wa.me/?text=${encodeURIComponent(promoText)}`);

  // QR code of the link of the selected tab.
  const qrButton = panel.getByRole('button', { name: 'QR code' });
  await expect(qrButton).toHaveAttribute('aria-expanded', 'false');
  await qrButton.click();
  await expect(qrButton).toHaveAttribute('aria-expanded', 'true');
  const qr = panel.getByRole('img', { name: 'QR code vers le formulaire d’avis de ce master' });
  await expect(qr.locator('path')).toHaveAttribute('d', qrPath(qrMatrix(form)));
  await expect(panel).toContainText('À montrer en cours : chacun scanne');

  // « Le master » (arrow keys): the fiche, its message, its link, its QR code.
  await promo.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(master).toBeFocused();
  await expect(master).toHaveAttribute('aria-selected', 'true');
  await expect(message).toHaveText(
    `Regarde ce master : ${PARCOURS} à Nantes, avec les chiffres d’admission et des avis d’étudiant·es → ${fiche}`,
  );
  await expect(
    panel.getByRole('img', { name: 'QR code vers la fiche de ce master' }).locator('path'),
  ).toHaveAttribute('d', qrPath(qrMatrix(fiche)));
  await expect(panel).toContainText('À scanner pour ouvrir la fiche du master.');
  await copyFeedback(copyButtons.nth(1), 'Copier le lien', 'Lien copié');
  expect(await clip()).toBe(fiche);
  expect(await panel.getByRole('link', { name: 'WhatsApp' }).getAttribute('href')).toContain(
    encodeURIComponent(fiche),
  );

  // No tracker anywhere.
  const hrefs = await panel
    .locator('a[href]')
    .evaluateAll((as) => as.map((a) => decodeURIComponent(a.getAttribute('href') ?? '')));
  for (const h of [...hrefs, await clip(), fiche, form]) expect(h).not.toMatch(TRACKERS);

  // Escape closes and gives the focus back; ✕ and a click outside close too.
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(share).toBeFocused();
  await expect(share).toHaveAttribute('aria-expanded', 'false');
  await share.click();
  await panel.getByRole('button', { name: 'Fermer' }).click();
  await expect(panel).toHaveCount(0);
  await expect(share).toBeFocused();
  await share.click();
  await expect(panel).toBeVisible();
  await h1.click();
  await expect(panel).toHaveCount(0);
});

for (const width of [1440, 1024, 800])
  test(`computer at ${width} px: the popover hangs from « Partager », whole and on top`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/parcours/${VNP}`);
    await waitForHydration(page);
    const share = page.getByRole('button', { name: 'Partager', exact: true });
    await share.scrollIntoViewIfNeeded();
    await share.click();
    const panel = page.getByRole('dialog', { name: 'Partager' });
    await expect(panel).toBeVisible();
    // The arrow points to the middle of the button.
    const b = (await share.boundingBox())!;
    const arrow = (await panel.locator('[data-share-arrow]').boundingBox())!;
    expect(Math.abs(arrow.x + arrow.width / 2 - (b.x + b.width / 2))).toBeLessThanOrEqual(4);
    // Whole inside the window, 16 px from its edges at least.
    const box = (await panel.boundingBox())!;
    const vw = await page.evaluate(() => document.documentElement.clientWidth);
    expect(box.x).toBeGreaterThanOrEqual(16);
    expect(box.x + box.width).toBeLessThanOrEqual(vw - 16);
    expect((await horizontalOverflow(page)).over).toBeLessThanOrEqual(0);
    // Not cut by the hero: its last line is visible and is what a click there reaches.
    const last = panel.getByRole('button', { name: 'QR code' });
    await last.scrollIntoViewIfNeeded();
    await expect(last).toBeInViewport();
    const l = (await last.boundingBox())!;
    const hit = await page.evaluate(
      ([x, y]) => !!document.elementFromPoint(x!, y!)?.closest('[data-share-panel]'),
      [l.x + 4, l.y + l.height / 2],
    );
    expect(hit).toBe(true);
    expect(await seriousAxe(page, '[data-share-panel]')).toEqual([]);
  });

for (const width of [390, 320])
  test(`phone at ${width} px: a modal sheet, « Partager… » opens the share sheet of the phone`, async ({
    browser,
    baseURL,
  }) => {
    const { defaultBrowserType: _, ...pixel } = devices['Pixel 7'];
    void _;
    const context = await browser.newContext({
      ...pixel,
      viewport: { width, height: 844 },
      baseURL,
      locale: 'fr-FR',
    });
    await context.addInitScript(() => {
      const w = window as unknown as { __shared: ShareData[] };
      w.__shared = [];
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: async (data: ShareData) => {
          w.__shared.push(data);
        },
      });
    });
    const page = await context.newPage();
    await page.goto(`/parcours/${VNP}`);
    await waitForHydration(page);
    const share = page.getByRole('button', { name: 'Partager', exact: true });
    await share.click();
    const sheet = page.getByRole('dialog', { name: 'Partager' });
    await expect(sheet).toBeVisible();
    await expect(page.locator('dialog[data-share-panel="sheet"][open]')).toHaveCount(1);
    await expect(sheet.getByRole('tab', { name: 'Inviter ma promo' })).toBeFocused();
    // No WhatsApp: the share sheet of the phone has it.
    await expect(sheet.getByRole('link', { name: 'WhatsApp' })).toHaveCount(0);
    expect((await horizontalOverflow(page)).over).toBeLessThanOrEqual(0);
    expect(await seriousAxe(page, '[data-share-panel]')).toEqual([]);

    const text = async () => {
      const [m, u] = await Promise.all([
        sheet.locator('[data-share-message]').textContent(),
        sheet.locator('[data-share-message] span').textContent(),
      ]);
      return m!.slice(0, m!.length - u!.length).trim();
    };
    const message = await text();
    await sheet.getByRole('button', { name: 'Partager…' }).click();
    await sheet.getByRole('tab', { name: 'Le master' }).click();
    const fiche = await text();
    await sheet.getByRole('button', { name: 'Partager…' }).click();
    const shared = await page.evaluate(
      () => (window as unknown as { __shared: ShareData[] }).__shared,
    );
    expect(shared).toEqual([
      {
        title: `Donne ton avis sur ${PARCOURS}`,
        text: message,
        url: `${baseURL}/avis/nouveau?parcours=${VNP}`,
      },
      {
        title: expect.stringMatching(new RegExp(`^${PARCOURS} — .+, sur notetonmaster$`)),
        text: fiche,
        url: `${baseURL}/parcours/${VNP}`,
      },
    ]);
    expect(message).toMatch(/^Hello la promo !/);
    expect(fiche).toMatch(/^Regarde ce master : /);
    // On a phone: « Copier » and « QR code » under « Partager… ».
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await copyFeedback(sheet.locator('button[data-ok]'), 'Copier', 'Copié');
    await expect(sheet.getByRole('button', { name: 'QR code' })).toBeVisible();

    // Escape closes it, the focus comes back to « Partager ».
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await expect(share).toBeFocused();
    await context.close();
  });

test('the shared review link opens the form on the parcours, with or without an account; its preview', async ({
  page,
  request,
}) => {
  const form = `/avis/nouveau?parcours=${VNP}`;
  await page.goto(form);
  await waitForHydration(page);
  await expect(page.getByText(PARCOURS)).toBeVisible();
  await expect(page.getByRole('button', { name: /Changer/ })).toBeVisible();

  // Link preview: its own title and its lime image, never indexed.
  const html = await (await request.get(form)).text();
  expect(html).toContain(`<meta property="og:title" content="Donne ton avis sur ${PARCOURS}`);
  const image = /<meta property="og:image" content="([^"]*\/og\/avis\/[^"]+)"/.exec(html)?.[1];
  expect(image).toBeTruthy();
  const png = await request.get(new URL(image!.replaceAll('&amp;', '&')).pathname);
  expect(png.status()).toBe(200);
  expect(png.headers()['content-type']).toBe('image/png');
  expect(html).toMatch(/<meta name="robots" content="noindex, nofollow"/);

  await loginStudent(page, uniqueEmail('partage'));
  await page.goto(form);
  await waitForHydration(page);
  await expect(page.getByText(PARCOURS)).toBeVisible();
  await expect(page.getByRole('button', { name: /Changer/ })).toBeVisible();
});

/** Sends a review of VNP from the form (without account unless the page is logged in). */
async function sendReview(page: Page, account: boolean, email = uniqueEmail('promo')) {
  await page.goto(`/avis/nouveau?parcours=${VNP}`);
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await waitForHydration(page);
  await page.getByRole('radio', { name: 'En M2' }).click();
  await page.getByLabel('Entré·e en').selectOption(String(new Date().getFullYear() - 1));
  await page.getByRole('button', { name: 'Continuer' }).click();
  await page
    .getByRole('radiogroup', { name: 'Note globale' })
    .getByRole('radio', { name: '4 sur 5' })
    .click();
  await page.getByLabel('Ce que tu as aimé').fill('Des sorties sur le terrain chaque mois.');
  await page.getByLabel('Ce que tu n’as pas aimé').fill('Un emploi du temps qui change souvent.');
  await page.getByRole('button', { name: 'Continuer' }).click();
  if (!account) {
    await page.getByRole('radio', { name: /Sans compte/ }).click();
    await page.getByLabel(/Ton adresse mail/).fill(email);
  }
  await page.getByLabel(/je respecte la/).check();
  await page.getByRole('button', { name: 'Envoyer mon avis' }).click();
  await expect(page.getByRole('heading', { name: 'Merci, c’est envoyé !' })).toBeVisible();
  return email;
}

const reviewsOfVnp = async () =>
  (
    await sql<{ reviewCount: number }>(`SELECT "reviewCount" FROM "Program" WHERE slug = $1`, [VNP])
  )[0]!.reviewCount;

const AFTER = `Hello la promo ! Je viens de donner mon avis sur notre master. C’est anonyme et ça prend 5 minutes. Ça aide vraiment celles et ceux qui candidatent l’an prochain. À vous →`;

test('after a review, without account: the confirmation sentence, the invitation, the panel', async ({
  page,
  baseURL,
}) => {
  const email = await sendReview(page, false);
  const thanks = page.locator('section.nm-thanks');
  await expect(thanks).toContainText(
    `Confirme ton avis avec le code ou le lien envoyé à ${email}. Il passera ensuite en relecture (48 h maximum).`,
  );
  const invite = thanks.locator('[data-promo-invite]');
  const n = await reviewsOfVnp();
  await expect(invite).toContainText(
    n >= 20
      ? 'Invite ta promo à donner son avis.'
      : n === 0
        ? 'Ce master n’a pas encore d’avis.'
        : `Ce master n’a que ${n} avis.`,
  );
  await expect(invite.locator('.nm-sticker')).toHaveText(`${n}avis`);
  await expect(invite.locator('.nm-sticker')).toHaveAttribute('aria-hidden', 'true');
  // One button in the invitation, two links at most: here only « Explorer d'autres masters ».
  await expect(invite.getByRole('button')).toHaveCount(1);
  await expect(thanks.getByRole('link', { name: /Faire vérifier mon parcours/ })).toHaveCount(0);
  await expect(thanks.getByRole('link', { name: /Explorer d’autres masters/ })).toBeVisible();
  await expect(thanks).not.toContainText('Et ta promo');
  await expect(thanks).not.toContainText(`${baseURL}/avis/nouveau`);
  expect(await seriousAxe(page, 'section.nm-thanks')).toEqual([]);

  // « Inviter ma promo » opens the panel on « Inviter ma promo », with the message of after.
  const button = invite.getByRole('button', { name: 'Inviter ma promo' });
  await button.click();
  const panel = page.getByRole('dialog', { name: 'Partager' });
  await expect(panel.getByRole('tab', { name: 'Inviter ma promo' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(panel.locator('[data-share-message]')).toHaveText(
    `${AFTER} ${baseURL}/avis/nouveau?parcours=${VNP}`,
  );
  const box = (await panel.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(await seriousAxe(page, '[data-share-panel]')).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(button).toBeFocused();
});

test('after a review, with an account: the review sentence and the two links', async ({ page }) => {
  await loginStudent(page, uniqueEmail('promo-compte'));
  await sendReview(page, true);
  const thanks = page.locator('section.nm-thanks');
  await expect(thanks.getByRole('paragraph').first()).toHaveText(
    'Ton avis est en relecture (48 h maximum).',
  );
  const n = await reviewsOfVnp();
  await expect(thanks.locator('[data-promo-invite]')).toContainText(
    n >= 20 ? 'Invite ta promo à donner son avis.' : `${n}`,
  );
  await expect(thanks.locator('[data-promo-invite]').getByRole('button')).toHaveCount(1);
  await expect(thanks.getByRole('link', { name: /Faire vérifier mon parcours/ })).toHaveAttribute(
    'href',
    `/espace/verification?parcours=${VNP}`,
  );
  await expect(thanks.getByRole('link', { name: /Explorer d’autres masters/ })).toBeVisible();
  expect(await seriousAxe(page, 'section.nm-thanks')).toEqual([]);
});

for (const width of [390, 320])
  test(`after a review on a phone (${width} px): « Inviter ma promo » opens the share sheet of the phone`, async ({
    browser,
    baseURL,
  }) => {
    const { defaultBrowserType: _, ...pixel } = devices['Pixel 7'];
    void _;
    const context = await browser.newContext({
      ...pixel,
      viewport: { width, height: 844 },
      baseURL,
      locale: 'fr-FR',
    });
    await context.addInitScript(() => {
      const w = window as unknown as { __shared: ShareData[] };
      w.__shared = [];
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: async (data: ShareData) => {
          w.__shared.push(data);
        },
      });
    });
    const page = await context.newPage();
    await sendReview(page, false);
    expect((await horizontalOverflow(page)).over).toBeLessThanOrEqual(0);
    await page.getByRole('button', { name: 'Inviter ma promo' }).click();
    const shared = await page.evaluate(
      () => (window as unknown as { __shared: ShareData[] }).__shared,
    );
    expect(shared).toEqual([
      {
        title: `Donne ton avis sur ${PARCOURS}`,
        text: AFTER,
        url: `${baseURL}/avis/nouveau?parcours=${VNP}`,
      },
    ]);
    // Directly the share sheet of the phone: no panel.
    await expect(page.getByRole('dialog', { name: 'Partager' })).toHaveCount(0);
    expect(await seriousAxe(page, 'section.nm-thanks')).toEqual([]);
    await context.close();
  });

test('no « Partager » on a parcours outside the open cities', async ({ page }) => {
  const [closed] = await sql<{ slug: string }>(
    `SELECT slug FROM "Program" WHERE "isPublished" AND NOT "inOpenZone" ORDER BY slug LIMIT 1`,
  );
  test.skip(!closed, 'no parcours outside the open cities in the fixtures');
  const r = await page.goto(`/parcours/${closed!.slug}`);
  expect(r?.status()).toBe(404);
  await expect(page.getByRole('button', { name: 'Partager' })).toHaveCount(0);
});
