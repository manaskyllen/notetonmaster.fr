import { expect, test, type Page } from '@playwright/test';
import {
  codeFrom,
  linkFrom,
  sql,
  typeCode,
  uniqueEmail,
  waitForHydration,
  waitForMail,
} from './helpers';

/**
 * Login by 6-digit code, the link of the same mail as a fallback.
 * Mail scanners open links before the person: a GET must never log in nor burn anything.
 */
const VNP = 'valorisation-des-nouveaux-patrimoines';

/** Asks a code from /connexion (or from the login page already open, `stay`). */
async function askCode(page: Page, email: string, stay = false) {
  const since = new Date();
  if (!stay) await page.goto('/connexion');
  await waitForHydration(page);
  await page.getByLabel('Ton adresse mail').fill(email);
  await page.getByRole('button', { name: 'Recevoir mon code' }).click();
  await expect(page.getByRole('heading', { name: 'Saisis ton code' })).toBeVisible();
  return waitForMail(email, /code de connexion/i, since);
}

const dashboard = (page: Page) =>
  expect(page.getByRole('heading', { name: 'Ton tableau de bord', level: 1 })).toBeVisible();
/** The message under the code boxes (Next.js has its own route announcer alert). */
const codeError = (page: Page) => page.locator('p[role="alert"]');
const wrong = (code: string) => String((Number(code) + 1) % 1_000_000).padStart(6, '0');

test('the mail holds a code and a link; the code screen has six numeric boxes', async ({
  page,
}) => {
  const email = uniqueEmail('code');
  const mail = await askCode(page, email);
  expect(mail.Subject).toMatch(/^\d{3} \d{3} · ton code de connexion/);
  expect(mail.Text).toMatch(/Ton code :\s*\d{3} \d{3}/);
  expect(mail.HTML).toContain('Se connecter sur cet appareil');
  const boxes = page.locator('[data-code-box]');
  await expect(boxes).toHaveCount(6);
  await expect(boxes.first()).toHaveAttribute('autocomplete', 'one-time-code');
  await expect(boxes.first()).toHaveAttribute('inputmode', 'numeric');
  await expect(
    page.getByRole('button', { name: /Renvoyer un code \(dans \d+ s\)/ }),
  ).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Changer d’adresse' })).toBeVisible();
});

test('typing moves box to box; the code (mail read on any device) logs in and kills the link', async ({
  page,
  browser,
}) => {
  const email = uniqueEmail('code-ok');
  const mail = await askCode(page, email);
  await page.getByRole('textbox', { name: 'Chiffre 1 sur 6' }).click();
  await page.keyboard.type(codeFrom(mail).slice(0, 2));
  await expect(page.getByRole('textbox', { name: 'Chiffre 3 sur 6' })).toBeFocused();
  await page.keyboard.type(codeFrom(mail).slice(2));
  await dashboard(page);

  const other = await browser.newContext();
  const phone = await other.newPage();
  await phone.goto(linkFrom(mail.HTML, '/connexion/lien/'));
  await expect(phone.getByRole('heading', { name: 'Ce lien ne marche plus' })).toBeVisible();
  await other.close();
});

test('pasting the whole code fills the six boxes and logs in', async ({ page }) => {
  const email = uniqueEmail('code-paste');
  const mail = await askCode(page, email);
  const code = codeFrom(mail);
  // Pasted into the third box, as « 482 913 » with its space: it still starts at the first.
  await page.getByRole('textbox', { name: 'Chiffre 3 sur 6' }).evaluate(
    (el, text) => {
      const data = new DataTransfer();
      data.setData('text/plain', text);
      el.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
      );
    },
    `${code.slice(0, 3)} ${code.slice(3)}`,
  );
  await dashboard(page);
});

test('a scanner opening the link (plain GET) logs nobody in and burns nothing', async ({
  page,
  request,
}) => {
  const email = uniqueEmail('code-robot');
  const mail = await askCode(page, email);
  const link = linkFrom(mail.HTML, '/connexion/lien/');
  // What Safe Links and university gateways do: GET (and HEAD) the link, follow redirects.
  const res = await request.get(link);
  expect(res.status()).toBe(200);
  expect(res.headers()['set-cookie'] ?? '').not.toContain('nm_student');
  expect(await res.text()).toContain('Confirmer la connexion');
  await request.head(link);
  // The person still logs in with the code afterwards.
  await typeCode(page, codeFrom(mail));
  await dashboard(page);
});

test('the link logs in another device, and then the code no longer works', async ({
  page,
  browser,
}) => {
  const email = uniqueEmail('code-device');
  const mail = await askCode(page, email);
  const other = await browser.newContext();
  const phone = await other.newPage();
  await phone.goto(linkFrom(mail.HTML, '/connexion/lien/'));
  await expect(phone.getByRole('heading', { name: 'Confirmer la connexion' })).toBeVisible();
  await phone.getByRole('button', { name: 'Me connecter sur cet appareil' }).click();
  await dashboard(phone);
  await other.close();

  await typeCode(page, codeFrom(mail));
  await expect(codeError(page)).toHaveText(/a expiré ou a déjà servi/);
});

test('5 wrong codes lock the code, even the right one afterwards', async ({ page }) => {
  const email = uniqueEmail('code-tries');
  const mail = await askCode(page, email);
  const code = codeFrom(mail);
  for (let i = 1; i <= 4; i++) {
    await typeCode(page, wrong(code));
    await expect(codeError(page)).toHaveText(
      `Ce n’est pas le bon code. Encore ${5 - i} essai${5 - i > 1 ? 's' : ''}.`,
    );
  }
  await typeCode(page, wrong(code));
  await expect(codeError(page)).toHaveText(/Trop d’essais avec ce code/);
  await typeCode(page, code);
  await expect(codeError(page)).toHaveText(/Trop d’essais avec ce code/);
  const [row] = await sql<{ attempts: number }>(
    `SELECT attempts FROM "MagicLinkToken" WHERE purpose = 'LOGIN' ORDER BY "createdAt" DESC LIMIT 1`,
  );
  expect(row!.attempts).toBe(5);
});

test('the code expires after 10 minutes', async ({ page }) => {
  const email = uniqueEmail('code-expired');
  const mail = await askCode(page, email);
  const [row] = await sql<{ minutes: number }>(
    `SELECT EXTRACT(EPOCH FROM ("expiresAt" - "createdAt")) / 60 AS minutes FROM "MagicLinkToken"
      WHERE purpose = 'LOGIN' ORDER BY "createdAt" DESC LIMIT 1`,
  );
  expect(Math.round(Number(row!.minutes))).toBe(10);
  await sql(
    `UPDATE "MagicLinkToken" SET "expiresAt" = now() - interval '1 second'
      WHERE id = (SELECT id FROM "MagicLinkToken" WHERE purpose = 'LOGIN' ORDER BY "createdAt" DESC LIMIT 1)`,
  );
  await typeCode(page, codeFrom(mail));
  await expect(codeError(page)).toHaveText(/a expiré ou a déjà servi/);
  await page.goto(linkFrom(mail.HTML, '/connexion/lien/'));
  await expect(page.getByRole('heading', { name: 'Ce lien ne marche plus' })).toBeVisible();
});

test('the code is stored hashed only', async ({ page }) => {
  const email = uniqueEmail('code-hash');
  const mail = await askCode(page, email);
  const [row] = await sql<{ codeHash: string }>(
    `SELECT "codeHash" FROM "MagicLinkToken" WHERE purpose = 'LOGIN' ORDER BY "createdAt" DESC LIMIT 1`,
  );
  expect(row!.codeHash).toMatch(/^[0-9a-f]{64}$/);
  expect(row!.codeHash).not.toContain(codeFrom(mail));
});

test('« Suivre » without account: code, then back on the fiche with the master followed', async ({
  page,
}) => {
  await page.goto(`/parcours/${VNP}`);
  await waitForHydration(page);
  // This fiche's own button (the page also lists other parcours, each with theirs).
  await page
    .getByRole('link', {
      name: 'Suivre : Valorisation des nouveaux patrimoines (connexion requise)',
    })
    .first()
    .click();
  await expect(page).toHaveURL(/\/connexion\?suite=.+&suivre=/);
  const mail = await askCode(page, uniqueEmail('code-follow'), true);
  await typeCode(page, codeFrom(mail));
  await expect(page).toHaveURL(new RegExp(`/parcours/${VNP}$`));
  await expect(page.getByRole('button', { name: 'Suivre ce master' }).first()).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('« Poser une question » without account: back on the fiche with the form open', async ({
  page,
}) => {
  await page.goto(`/parcours/${VNP}?qtri=populaires`);
  await waitForHydration(page);
  await page.getByRole('link', { name: 'Poser une question' }).click();
  await expect(page).toHaveURL(/\/connexion\?suite=/);
  const mail = await askCode(page, uniqueEmail('code-question'), true);
  await typeCode(page, codeFrom(mail));
  await expect(page).toHaveURL(new RegExp(`/parcours/${VNP}`));
  await expect(page.getByRole('button', { name: 'Poser une question' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
});
