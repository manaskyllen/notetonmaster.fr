import { expect, test, type Locator, type Page } from '@playwright/test';
import { animationsDone, loginAdmin, waitForHydration } from './helpers';

/**
 * Switches: one component for every role="switch". The knob slides on `left` with a bounce and stretches
 * then tightens at each change, never on page load; hover halo; stretched while pressed;
 * nothing moves with reduced motion; a disabled switch has neither halo nor stretch.
 */
async function settings(page: Page) {
  await loginAdmin(page);
  await page.goto('/admin/parametres');
  await waitForHydration(page);
  const sw = page.getByRole('switch').first();
  await expect(sw).toBeVisible();
  return sw;
}

/** Running animations of the knob of a switch. */
const knobAnimations = (sw: Locator) =>
  sw.evaluate((el) =>
    el
      .querySelector('.knob')!
      .getAnimations()
      .filter((a) => a.playState === 'running')
      .map((a) => (a as CSSAnimation).animationName ?? (a as CSSTransition).transitionProperty),
  );
const knobStyle = (sw: Locator, prop: string) =>
  sw.evaluate((el, p) => getComputedStyle(el.querySelector('.knob')!).getPropertyValue(p), prop);

test('a switch: Space and Enter toggle it, the knob bounces and stretches at each change only', async ({
  page,
}) => {
  const sw = await settings(page);
  // every switch of the page is the shared component, with a name
  for (const s of await page.getByRole('switch').all()) {
    await expect(s).toHaveClass(/\bsw\b/);
    await expect(s).toHaveAccessibleName(/.+/);
  }
  // nothing stretches on page load
  await expect(sw).not.toHaveAttribute('data-moved');
  expect(await knobAnimations(sw)).toEqual([]);
  expect(await knobStyle(sw, 'transition-duration')).toMatch(/^0\.42s/);
  expect(await knobStyle(sw, 'transition-timing-function')).toContain(
    'cubic-bezier(0.34, 1.56, 0.64, 1)',
  );
  expect(await knobStyle(sw, 'box-shadow')).toContain('rgba(22, 19, 31, 0.28)');
  await expect(sw).toHaveCSS('transition-duration', /^0\.25s/);

  const before = (await sw.getAttribute('aria-checked')) === 'true';
  const left0 = await knobStyle(sw, 'left');
  await sw.focus();
  await page.keyboard.press('Space');
  await expect(sw).toHaveAttribute('aria-checked', String(!before));
  await expect(sw).toHaveAttribute('data-moved');
  expect(await knobAnimations(sw)).toEqual(
    expect.arrayContaining([before ? 'knob-off' : 'knob-on']),
  );
  expect(await knobStyle(sw, 'transform-origin')).toMatch(before ? /^0px/ : /^24px/);
  await animationsDone(sw);
  expect(await knobStyle(sw, 'left')).not.toBe(left0);
  // the focus ring stays
  expect(await sw.evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe('none');

  await page.keyboard.press('Enter');
  await expect(sw).toHaveAttribute('aria-checked', String(before));
  expect(await knobAnimations(sw)).toEqual(
    expect.arrayContaining([before ? 'knob-on' : 'knob-off']),
  );
  await animationsDone(sw);

  // hover: a discreet violet halo; pressed: the knob already stretches
  await sw.hover();
  await expect(sw).toHaveCSS('box-shadow', 'rgba(90, 59, 240, 0.14) 0px 0px 0px 4px');
  await page.mouse.down();
  await expect.poll(() => knobStyle(sw, 'transform')).toBe('matrix(1.28, 0, 0, 1, 0, 0)');
  await page.mouse.move(0, 0);
  await page.mouse.up();

  // disabled: neither halo nor stretch
  await sw.evaluate((el) => el.setAttribute('disabled', ''));
  await sw.hover({ force: true });
  await expect(sw).toHaveCSS('box-shadow', 'none');
  await page.mouse.down();
  await animationsDone(sw);
  expect(await knobStyle(sw, 'transform')).toBe('none');
  await page.mouse.up();
});

test.describe('reduced motion', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('the switch changes without any animation or transition', async ({ page }) => {
    const sw = await settings(page);
    // 0.01ms: the site-wide reduced-motion rule (app/globals.css), i.e. no transition
    await expect(sw).toHaveCSS('transition-duration', /^(0s|1e-05s)$/);
    expect(await knobStyle(sw, 'transition-duration')).toMatch(/^(0s|1e-05s)$/);
    await sw.click();
    await expect(sw).toHaveAttribute('data-moved');
    expect(await knobAnimations(sw)).toEqual([]);
    expect(await knobStyle(sw, 'animation-name')).toBe('none');
  });
});
