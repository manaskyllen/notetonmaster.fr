/**
 * Lighthouse CI (`make lhci`, the CI job, or by hand after a deploy):
 *   LHCI_BASE_URL=https://notetonmaster.fr npx @lhci/cli@0.14.0 autorun --config=lighthouserc.cjs
 * Mobile (simulated 4G, CPU ×4). Two lists (LHCI_LIST):
 * - `models` (pull requests): one page of each kind, one run each: home, fiche parcours, mention,
 *   university, city, Explorer;
 * - `full` (default: main, the night, by hand): the same plus the three indexes, median of 3 runs.
 * Same thresholds in both: fails when one is not met; LCP warns above 2.5 s and fails above 3.5 s
 * (simulated mobile: see the LCP note in the assertions below).
 *
 * Outside production the site answers « X-Robots-Tag: noindex » on purpose (proxy.ts): the
 * `is-crawlable` audit is skipped there, so that « SEO = 100 » measures everything else.
 * INP needs real interactions: Lighthouse (navigation) cannot measure it; Total Blocking Time is
 * its lab proxy here, and `make vitals` (scripts/web-vitals.mjs) measures INP itself.
 */
const BASE = (process.env.LHCI_BASE_URL || 'http://localhost:3002').replace(/\/$/, '');
// On shared CI machines (LHCI_RUNNER=github) the CPU skews timings: performance, LCP, TBT and
// server response are indicative there (LCP still fails above 3.5 s); SEO = 100 and CLS < 0.1
// stay blocking everywhere.
const ciRunner = process.env.LHCI_RUNNER === 'github';
const timing = ciRunner ? 'warn' : 'error';
const production = BASE === 'https://notetonmaster.fr';
const MODELS = [
  '/',
  `/parcours/${process.env.LHCI_PARCOURS || 'valorisation-des-nouveaux-patrimoines'}`,
  `/mentions/${process.env.LHCI_MENTION || 'culture-patrimoine-et-mediation'}`,
  `/universites/${process.env.LHCI_UNIVERSITE || 'nantes-universite'}`,
  `/masters/${process.env.LHCI_VILLE || 'nantes'}`,
  '/explorer',
];
const models = process.env.LHCI_LIST === 'models';
const PAGES = models ? MODELS : [...MODELS, '/mentions', '/universites', '/masters'];

module.exports = {
  ci: {
    collect: {
      url: PAGES.map((p) => BASE + p),
      numberOfRuns: models ? 1 : 3,
      ...(process.env.CHROME_PATH ? { chromePath: process.env.CHROME_PATH } : {}),
      settings: {
        preset: 'perf',
        formFactor: 'mobile',
        throttlingMethod: 'simulate',
        onlyCategories: ['performance', 'seo', 'accessibility', 'best-practices'],
        chromeFlags: '--headless=new --no-sandbox',
        ...(production ? {} : { skipAudits: ['is-crawlable'] }),
      },
    },
    // LCP on two levels: a warning above 2.5 s, a failure above 3.5 s. The Lighthouse LCP is
    // simulated (4G, CPU ×4) and puts the framework JavaScript and the preloaded fonts on the
    // critical path, far above the LCP measured on the same load: failing at 2.5 s would block on
    // what the site does not control, 3.5 s still catches a real regression. To revisit with field
    // data (75th percentile of real visitors). LHCI takes one assertion per audit: two matrices
    // that both match every page.
    assert: {
      assertMatrix: [
        {
          matchingUrlPattern: '.*',
          aggregationMethod: 'median-run',
          assertions: {
            'categories:performance': [timing, { minScore: 0.9 }],
            'categories:seo': ['error', { minScore: 1 }],
            'categories:accessibility': ['error', { minScore: 0.95 }],
            'largest-contentful-paint': ['error', { maxNumericValue: 3500 }],
            'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
            'total-blocking-time': [timing, { maxNumericValue: 200 }],
            'server-response-time': [timing, { maxNumericValue: 300 }],
            // ≈ 160 KB of it is the framework (React, React DOM, Next.js router and runtime),
            // out of reach without another framework: reported, not blocking.
            'resource-summary:script:size': ['warn', { maxNumericValue: 153600 }],
          },
        },
        {
          matchingUrlPattern: '.*',
          aggregationMethod: 'median-run',
          assertions: { 'largest-contentful-paint': ['warn', { maxNumericValue: 2500 }] },
        },
        // The home, the most visited page and the door from search engines: stricter than the
        // others. Its timings (performance, LCP < 2 s, TBT) follow the machine rule above:
        // blocking on a measuring machine (make lhci, by hand), indicative on shared CI runners,
        // where the simulated LCP of the home is ≈ 3 s; the LCP ≤ 3.5 s guard of every page
        // still blocks there. CLS and SEO block everywhere.
        {
          matchingUrlPattern: '^https?://[^/]+/$',
          aggregationMethod: 'median-run',
          assertions: {
            'categories:performance': [timing, { minScore: 0.95 }],
            'categories:seo': ['error', { minScore: 1 }],
            'largest-contentful-paint': [timing, { maxNumericValue: 2000 }],
            'cumulative-layout-shift': ['error', { maxNumericValue: 0.05 }],
            'total-blocking-time': [timing, { maxNumericValue: 150 }],
          },
        },
      ],
    },
    upload: { target: 'filesystem', outputDir: process.env.LHCI_OUTPUT_DIR || '.lighthouseci' },
  },
};
