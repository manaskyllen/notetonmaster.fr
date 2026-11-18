// Dev helper: screenshots of pages for visual checks.
// docker compose --profile e2e run --rm e2e node scripts/shot.mjs /path [/other] [--w=360] [--dark]
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const paths = args.filter((a) => a.startsWith('/'));
const width = Number(args.find((a) => a.startsWith('--w='))?.slice(4) ?? 1280);
const dark = args.includes('--dark');
const full = !args.includes('--viewport');
const base = process.env.BASE_URL ?? 'http://web:3000';
mkdirSync('.shots', { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width, height: 900 },
  colorScheme: dark ? 'dark' : 'light',
});
page.on('console', (m) => m.type() === 'error' && console.log('console error:', m.text()));
page.on('pageerror', (e) => console.log('page error:', e.message));
for (const p of paths) {
  const res = await page.goto(base + p, { waitUntil: 'load', timeout: 120000 });
  const name = `.shots/${p.replace(/[^a-z0-9]+/gi, '_') || 'root'}-${width}${dark ? '-dark' : ''}.png`;
  await page.screenshot({ path: name, fullPage: full, caret: 'initial' });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  console.log(res?.status(), name, overflow ? 'HORIZONTAL OVERFLOW' : '');
  if (overflow) {
    const offenders = await page.evaluate(() =>
      [...document.querySelectorAll('body *')]
        .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
        .filter(
          (el) =>
            !el.parentElement ||
            el.parentElement.getBoundingClientRect().right <= window.innerWidth + 1,
        )
        .slice(0, 8)
        .map(
          (el) =>
            `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 80)} -> ${Math.round(el.getBoundingClientRect().right)}`,
        ),
    );
    console.log(offenders.join('\n'));
  }
}
await browser.close();
