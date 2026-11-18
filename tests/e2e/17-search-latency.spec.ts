import { expect, test } from '@playwright/test';
import { waitForHydration } from './helpers';

/**
 * Time from the last keystroke to the suggestions on screen: debounce (120 ms) plus
 * the answer and the render. Budget: 150 ms after the debounce on the production build
 * (`make prod-local`, LATENCY_BUDGET_MS=270); the dev server (on-demand compilation) gets more.
 */
const BUDGET = Number(process.env.LATENCY_BUDGET_MS) || 600;

test('palette: suggestions appear quickly after the last keystroke', async ({ page }) => {
  await page.goto('/parcours/valorisation-des-nouveaux-patrimoines');
  await waitForHydration(page);
  const palette = page.getByRole('dialog', { name: 'Recherche et navigation' });
  await expect(async () => {
    await page.keyboard.press('Control+k');
    await expect(palette).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  const input = palette.getByRole('combobox');
  // Warm-up query (first compilation of the route in dev).
  await input.pressSequentially('nantes', { delay: 30 });
  await expect(palette.getByRole('option').first()).toBeVisible();
  await input.fill('');

  const timings: number[] = [];
  for (const q of ['patrimoine', 'droit des', 'médiation']) {
    await input.fill('');
    await input.pressSequentially(q.slice(0, -1), { delay: 40 });
    const t = await page.evaluate(
      (last) =>
        new Promise<number>((resolve) => {
          const input = document.querySelector<HTMLInputElement>('[role="combobox"]')!;
          const box = document.querySelector('dialog[open]')!;
          const start = performance.now();
          // The listbox is re-created when the results change: read it again each time.
          const obs = new MutationObserver(() => {
            const list = box.querySelector('[role="listbox"]');
            if (list?.textContent?.toLowerCase().includes(last.toLowerCase().slice(0, 4))) {
              obs.disconnect();
              resolve(performance.now() - start);
            }
          });
          obs.observe(box, { childList: true, subtree: true, characterData: true });
          // The last keystroke.
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
          setter.call(input, input.value + last.slice(-1));
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }),
      q,
    );
    timings.push(t);
  }
  console.log(
    `suggestions après la dernière frappe : ${timings.map((t) => `${Math.round(t)} ms`).join(', ')}`,
  );
  for (const t of timings) expect(t).toBeLessThan(BUDGET);
});
