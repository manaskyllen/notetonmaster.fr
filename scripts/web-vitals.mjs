// Largest Contentful Paint and Interaction to Next Paint on a mobile profile (390×844, simulated
// 4G: 150 ms RTT, 1.6 Mb/s down, 750 kb/s up; CPU slowed down 4×), measured in Chromium through
// PerformanceObserver. node scripts/web-vitals.mjs [--base=…] [--runs=3] [--json=file]
import { writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const BASE = arg('base', 'http://localhost:3002');
const RUNS = Number(arg('runs', 3));

const PAGES = [
  ['Accueil', '/'],
  ['Explorer (avec filtres)', '/explorer?domaine=droit-economie-gestion&modalite=alternance'],
  ['Fiche parcours', null],
  ['À propos', '/a-propos'],
];

const browser = await chromium.launch();
async function measure(path, interact) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.addInitScript(() => {
    window.__lcp = 0;
    window.__inp = 0;
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) window.__lcp = e.startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((l) => {
      // INP counts interactions only (clicks, taps, keys: interactionId > 0), not hovers.
      for (const e of l.getEntries())
        if (e.interactionId) window.__inp = Math.max(window.__inp, e.duration);
    }).observe({ type: 'event', buffered: true, durationThreshold: 16 });
  });
  await page.goto(BASE + path, { waitUntil: 'load', timeout: 180_000 });
  // The interaction happens once the page is idle (hydrated), as a reader would.
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(Number(arg('settle', 1500)));
  const lcp = await page.evaluate(() => window.__lcp);
  await interact(page);
  await page.waitForTimeout(800);
  const inp = await page.evaluate(() => window.__inp);
  await ctx.close();
  return { lcp, inp };
}

// One typical interaction per page: typing in the search field, or opening a filter / a tab.
async function interact(page) {
  const field = page.locator('input[type="search"]:visible').first();
  if (await field.count()) {
    await field.click();
    await page.keyboard.type('droit', { delay: 60 });
    return;
  }
  const btn = page.locator('main button').first();
  if (await btn.count()) await btn.click().catch(() => {});
}

let parcours = '/parcours/valorisation-des-nouveaux-patrimoines';
{
  const html = await (await fetch(`${BASE}/mentions/droit`)).text();
  parcours = html.match(/href="(\/parcours\/[^"#?]+)"/)?.[1] ?? parcours;
}
const out = [];
for (const [label, p] of PAGES) {
  const path = p ?? parcours;
  const runs = [];
  for (let i = 0; i < RUNS; i++) runs.push(await measure(path, interact));
  const med = (k) => [...runs.map((r) => r[k])].sort((a, b) => a - b)[Math.floor(runs.length / 2)];
  const row = { label, path, lcp: Math.round(med('lcp')), inp: Math.round(med('inp')) };
  out.push(row);
  console.log(
    `${label.padEnd(28)} LCP ${String(row.lcp).padStart(6)} ms   INP ${String(row.inp).padStart(5)} ms`,
  );
}
await browser.close();
const json = arg('json', null);
if (json)
  writeFileSync(
    json,
    JSON.stringify({ base: BASE, at: new Date().toISOString(), pages: out }, null, 2),
  );

// Performance budgets: LCP < 2.5 s, INP < 200 ms.
if (process.argv.includes('--assert')) {
  const bad = out.filter((r) => r.lcp > 2500 || r.inp > 200);
  if (bad.length) {
    console.error(
      `Budgets dépassés : ${bad.map((r) => `${r.label} (LCP ${r.lcp} ms, INP ${r.inp} ms)`).join(' ; ')}`,
    );
    process.exit(1);
  }
}
