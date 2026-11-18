import { expect, test } from '@playwright/test';
import { loginAdmin, loginStudent, sql, uniqueEmail, waitForHydration } from './helpers';

/** Questions publiques (feature 6). The demo account has a verified parcours on VNP. */
const VNP = '/parcours/valorisation-des-nouveaux-patrimoines';
const DEMO = 'alexis.demo@demo.notetonmaster.local';

async function publishFirst(page: import('@playwright/test').Page, text: string) {
  await page.goto('/admin/moderation?file=questions');
  if (page.url().includes('/admin/login')) {
    await loginAdmin(page);
    await page.goto('/admin/moderation?file=questions');
  }
  await waitForHydration(page);
  await page
    .getByRole('region', { name: 'Questions publiques' })
    .getByRole('button')
    .filter({ hasText: text })
    .first()
    .click();
  await page
    .getByRole('region', { name: 'Détail' })
    .getByRole('button', { name: 'Publier', exact: true })
    .click();
  await expect(page.getByText(/(Question|Réponse) publiée\./)).toBeVisible();
}

test('ask, moderate, answer as a verified alum; votes; no answer without verification', async ({
  page,
  browser,
}) => {
  const tag = Date.now().toString(36);
  const question = `Les cours sont-ils regroupés sur quelques jours ? (${tag})`;
  try {
    await loginStudent(page, DEMO);
    await page.goto(VNP);
    await page.getByRole('tab', { name: /^Questions \(\d+\)$/ }).click();
    await waitForHydration(page);
    const panel = page.getByRole('tabpanel', { name: /^Questions/ });
    await panel.getByRole('button', { name: 'Poser une question' }).click();
    await panel.getByLabel('Ta question').fill(question);
    await panel.getByRole('button', { name: 'Envoyer' }).click();
    await expect(
      panel.getByText('Ta question sera publiée sous un pseudonyme après relecture.'),
    ).toBeVisible();

    await publishFirst(page, tag);

    // visitor: the question, its vote, « Pas encore de réponse »
    const visitor = await browser.newPage();
    await visitor.goto(`${VNP}?qtri=recentes`);
    const card = visitor.getByRole('article').filter({ hasText: question });
    await expect(
      card.getByText('Pas encore de réponse · les ancien·nes ont été prévenu·es'),
    ).toBeVisible();
    await expect(card.getByRole('button', { name: 'Répondre' })).toHaveCount(0);
    await waitForHydration(visitor);
    const vote = card.getByRole('button', { name: /^Moi aussi je me pose la question/ });
    // the Server Action itself (not the review-views beacon), before reloading
    const saved = visitor.waitForResponse((r) => !!r.request().headers()['next-action'] && r.ok());
    await vote.click();
    await saved;
    await expect(vote).toHaveAttribute('aria-pressed', 'true');
    await expect(vote).toHaveAccessibleName('Moi aussi je me pose la question (1)');
    await visitor.reload();
    await expect(
      visitor
        .getByRole('article')
        .filter({ hasText: question })
        .getByRole('button', { name: /^Moi aussi/ }),
    ).toHaveAttribute('aria-pressed', 'true');

    // an account without a verified parcours cannot answer
    const stranger = await browser.newPage();
    await loginStudent(stranger, uniqueEmail('questions'));
    await stranger.goto(`${VNP}?qtri=recentes`);
    await expect(
      stranger
        .getByRole('article')
        .filter({ hasText: question })
        .getByRole('button', { name: 'Répondre' }),
    ).toHaveCount(0);

    // the verified alum answers (still logged in: the admin session is a separate cookie)
    await page.goto(`${VNP}?qtri=recentes`);
    const mine = page.getByRole('article').filter({ hasText: question });
    await waitForHydration(page);
    await mine.getByRole('button', { name: 'Répondre' }).click();
    await mine
      .getByLabel('Ta réponse')
      .fill('Oui : en M2, les cours sont regroupés du lundi au mercredi.');
    await mine.getByRole('button', { name: 'Envoyer' }).click();
    await expect(mine.getByText('Ta réponse sera publiée après relecture.')).toBeVisible();
    await publishFirst(page, tag);

    await visitor.goto(`${VNP}?qtri=recentes`);
    const answered = visitor.getByRole('article').filter({ hasText: question });
    await expect(answered.getByText('Parcours vérifié')).toBeVisible();
    await expect(answered.getByText('les cours sont regroupés du lundi au mercredi')).toBeVisible();
    await expect(answered.getByText(/Posée en [a-zéû]+ \d{4} · 1 réponse/)).toBeVisible();
  } finally {
    await sql(`DELETE FROM "Question" WHERE body LIKE $1`, [`%(${tag})`]);
  }
});
