/**
 * Lighthouse CI on an address: `pnpm lighthouse --url=https://notetonmaster.fr`.
 * Thresholds in lighthouserc.cjs (SEO = 100 and CLS < 0.1 blocking; performance and LCP only
 * indicative on shared CI machines, LHCI_RUNNER=github). Needs Chrome: on this project's machines,
 * run it in the Playwright container (`make lhci`), which sets CHROME_PATH.
 */
import { spawnSync } from 'node:child_process';

const url = (
  process.argv.find((a) => a.startsWith('--url='))?.slice(6) ?? 'http://localhost:3002'
).replace(/\/$/, '');
const r = spawnSync('npx', ['--yes', '@lhci/cli@0.14.0', 'autorun', '--config=lighthouserc.cjs'], {
  stdio: 'inherit',
  env: { ...process.env, LHCI_BASE_URL: url },
});
console.log(
  r.status === 0
    ? `✅ Lighthouse : seuils tenus sur ${url}`
    : `❌ Lighthouse : seuil dépassé sur ${url}`,
);
process.exit(r.status ?? 1);
