import { expect, test } from '@playwright/test';
import { linkFrom, loginStudent, uniqueEmail, waitForMail } from './helpers';

test('anonymous question: author notified, replies from space, asker gets the answer', async ({
  browser,
}) => {
  const asker = uniqueEmail('question');
  const question = `Est-ce que les visites de terrain ont lieu toutes les semaines ? (${Date.now()})`;

  // Visitor asks a question on "Le terrain avant tout" (author: anna, open to questions).
  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto('/parcours/valorisation-des-nouveaux-patrimoines');
  const card = visitor.locator('#avis-7f3a21');
  const askButton = card.getByRole('button', { name: 'Poser une question' });
  const dialog = visitor.getByRole('dialog', { name: 'Poser une question' });
  // The button opens a modal (clicked again until the page is hydrated); Escape closes it and
  // gives focus back to the button.
  await expect(async () => {
    await askButton.click();
    await expect(dialog).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  await expect(dialog.getByLabel('Ta question')).toBeVisible();
  await visitor.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(askButton).toBeFocused();
  await askButton.click();
  await dialog.getByLabel('Ta question').fill(`${question} Écris-moi à moi@exemple.fr`);
  await expect(dialog.getByText('il sera masqué')).toBeVisible();
  await dialog.getByLabel('Ton adresse mail, pour recevoir la réponse').fill(asker);
  const sinceAsk = new Date();
  await dialog.getByRole('button', { name: 'Envoyer anonymement' }).click();
  const done = visitor.getByRole('dialog', { name: 'Question envoyée' });
  await expect(done).toBeVisible();
  await done.getByRole('button', { name: 'Fermer', exact: true }).last().click();
  await expect(card.getByText('Question envoyée : la réponse t’arrivera par mail.')).toBeVisible();

  // The author receives the mail "Quelqu’un te demande de l’aide sur ton avis", without the asker's address.
  const mail = await waitForMail(
    'alexis.demo@demo.notetonmaster.local',
    /Quelqu.un te demande de l.aide/,
    sinceAsk,
  );
  expect(mail.Text).toContain('Est-ce que les visites de terrain');
  expect(mail.Text).toContain('[coordonnées masquées]');
  expect(mail.Text).not.toContain(asker);

  // The author logs in, sees the unread badge, opens the thread and replies.
  const author = await (await browser.newContext()).newPage();
  await loginStudent(author, 'alexis.demo@demo.notetonmaster.local');
  await expect(author.getByRole('banner').getByRole('link', { name: /Mon espace/ })).toContainText(
    /\d/,
  );
  await author.getByRole('tab', { name: /Messages/ }).click();
  const messages = author.locator('#messages');
  await messages
    .getByRole('link', { name: /Étudiant·e anonyme/ })
    .filter({ hasText: question })
    .click();
  await expect(author).toHaveURL(/\/espace\/messages\/[a-z0-9]+$/);
  // In the open thread (the list shows it too, as a preview).
  await expect(messages.getByText(question.split(' (')[0]!).last()).toBeVisible();
  const sinceReply = new Date();
  await messages.getByLabel('Ta réponse').fill('Oui, presque chaque semaine au premier semestre.');
  await messages.getByRole('button', { name: 'Envoyer' }).click();
  await expect(
    messages.getByText('Oui, presque chaque semaine au premier semestre.'),
  ).toBeVisible();

  // The asker (no account) receives the answer with a single-use reply link.
  const reply = await waitForMail(asker, /réponse à ta question/, sinceReply);
  expect(reply.Text).toContain('Oui, presque chaque semaine');
  expect(reply.Text).not.toContain('alexis.demo@');
  await visitor.goto(linkFrom(reply.HTML, '/reponse/'));
  await expect(visitor.getByText('Oui, presque chaque semaine au premier semestre.')).toBeVisible();
  await visitor.getByLabel('Ta réponse').fill('Merci beaucoup pour ta réponse !');
  await visitor.getByRole('button', { name: 'Répondre anonymement' }).click();
  await expect(visitor.getByText('Réponse envoyée')).toBeVisible();
});
