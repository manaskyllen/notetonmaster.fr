import { expect, test } from '@playwright/test';
import { loginAdmin, sql, waitForHydration, waitForMail } from './helpers';

/** Droit de réponse (feature 5): verification, reply, moderation, display under the review. */
const VNP = 'valorisation-des-nouveaux-patrimoines';

test('a teaching team replies once under a review, after moderation', async ({ page }) => {
  const tag = Date.now().toString(36);
  const ref = `avis-e${tag}`.slice(0, 16);
  const title = `Voyage d’étude ${tag}`;
  await sql(
    `INSERT INTO "Review" (id, ref, "programId", "authorEmailHash", level, "cohortYear", "overallRating", title, pros, cons, status, "publishedAt", "updatedAt")
     SELECT gen_random_uuid()::text, $1, id, $2, 'M2', 2025, 2, $3, 'Des intervenant·es du métier toute l’année.',
            'Le voyage d’étude annoncé a été remplacé par deux sorties.', 'PUBLISHED', now(), now()
       FROM "Program" WHERE slug = $4`,
    [ref, `e2e:${tag}`, title, VNP],
  );
  try {
    await page.goto(`/parcours/${VNP}`);
    await page.getByRole('link', { name: /Vous êtes responsable de ce parcours/ }).click();
    await expect(page).toHaveURL(new RegExp(`/reponse-formation\\?parcours=${VNP}$`));
    await expect(
      page.getByRole('heading', { name: 'Droit de réponse de l’équipe pédagogique', level: 1 }),
    ).toBeVisible();
    await waitForHydration(page);

    const field = page.getByLabel('Adresse universitaire');
    const send = page.getByRole('button', { name: 'Recevoir un code' });
    await field.fill('anna.l@etu.univ-nantes.fr');
    await expect(
      page.getByText('Les adresses étudiantes ne sont pas acceptées', { exact: false }),
    ).toBeVisible();
    await expect(send).toBeDisabled();
    await field.fill('contact@gmail.com');
    await expect(
      page.getByText('Ce domaine ne correspond pas à l’établissement de ce parcours.'),
    ).toBeVisible();
    const email = `resp.${tag}@univ-nantes.fr`;
    await field.fill(email);
    await expect(page.getByText('Domaine reconnu : Nantes Université.')).toBeVisible();
    const since = new Date();
    await send.click();
    const mail = await waitForMail(email, /votre code notetonmaster/, since);
    const code = /\b(\d{6})\b/.exec(mail.Subject)![1]!;
    // Six boxes, as on the login pages: the sixth digit sends the code.
    await page.getByRole('textbox', { name: 'Chiffre 1 sur 6' }).click();
    await page.keyboard.type(code);

    await expect(
      page.getByRole('heading', { name: 'Les avis sur les parcours de Nantes Université' }),
    ).toBeVisible();
    await expect(page.locator('[aria-current="step"]')).toHaveText('2. Répondre');
    await page.getByRole('link', { name: 'Sans réponse' }).click();
    const card = page.locator('[data-review]').filter({ hasText: title });
    await expect(card).toBeVisible();
    await waitForHydration(page);
    await card.getByRole('button', { name: 'Répondre à cet avis' }).click();
    await card
      .getByLabel('Votre réponse')
      .fill(
        'Merci pour ce retour. Le voyage n’a pas pu être financé cette année ; il est rétabli pour la promotion suivante.',
      );
    await card.getByRole('button', { name: 'Envoyer en modération' }).click();
    await expect(card.getByText('Réponse envoyée')).toBeVisible();
    await page.goto('/reponse-formation?filtre=ma-reponse');
    await expect(
      page
        .locator('[data-review]')
        .filter({ hasText: title })
        .getByText('Ma réponse · En relecture'),
    ).toBeVisible();

    // moderation: new queue « Réponses des formations »
    await loginAdmin(page);
    await page.goto('/admin/moderation?file=reponses');
    await waitForHydration(page);
    const queue = page.getByRole('region', { name: 'Réponses des formations' });
    await queue.getByRole('button').filter({ hasText: title }).click();
    const detail = page.getByRole('region', { name: 'Détail' });
    await expect(
      detail.getByText('adresse vérifiée @univ-nantes.fr', { exact: false }),
    ).toBeVisible();
    await detail.getByRole('button', { name: 'Publier sous l’avis' }).click();
    await expect(page.getByText('Réponse publiée sous l’avis.')).toBeVisible();

    // public: dark block under the review
    await page.goto(`/parcours/${VNP}#${ref}`);
    const review = page.locator(`[id="${ref}"]`);
    await expect(review.getByText('Réponse de l’équipe pédagogique')).toBeVisible();
    await expect(
      review.getByText('Responsable du parcours · vérifié·e @univ-nantes.fr'),
    ).toBeVisible();
    await expect(review.getByText(/il est rétabli pour la promotion suivante/)).toBeVisible();
  } finally {
    await sql(`DELETE FROM "Review" WHERE ref = $1`, [ref]);
  }
});
