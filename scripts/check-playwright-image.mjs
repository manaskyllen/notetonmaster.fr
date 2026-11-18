// The Playwright image follows @playwright/test (CI job lint-type): the browsers of an image are
// built for one Playwright version only. Fails when they differ.
// - package.json: @playwright/test pinned on an exact version;
// - docker-compose.yml: the e2e service (make e2e, make e2e-full, make lhci) uses its image;
// - .github/workflows/ci.yml: the e2e job takes the version from package.json (changes job), so it
//   cannot differ; checked here so that a hand-written tag never comes back.
// A Dependabot update of @playwright/test fails here until docker-compose.yml follows, in the
// same pull request.
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const version = JSON.parse(read('package.json')).devDependencies['@playwright/test'];
const errors = [];
if (!/^\d+\.\d+\.\d+$/.test(version ?? ''))
  errors.push(`package.json : @playwright/test doit être une version exacte (trouvé : ${version})`);

const images = [
  ...read('docker-compose.yml').matchAll(/mcr\.microsoft\.com\/playwright:v([^\s'"-]+)/g),
];
if (!images.length) errors.push('docker-compose.yml : image Playwright introuvable');
for (const [, tag] of images)
  if (tag !== version)
    errors.push(`docker-compose.yml : image Playwright v${tag}, @playwright/test ${version}`);

const ci = read('.github/workflows/ci.yml');
for (const [, tag] of ci.matchAll(/mcr\.microsoft\.com\/playwright:v([^\s'"-]+)/g))
  if (tag !== '${{' && !tag.startsWith('${{'))
    errors.push(
      `ci.yml : tag écrit à la main (v${tag}) : il doit venir de needs.changes.outputs.playwright`,
    );

if (errors.length) {
  console.error(`❌ Image Playwright et @playwright/test divergent :\n- ${errors.join('\n- ')}`);
  process.exit(1);
}
console.log(`✅ Image Playwright v${version}, comme @playwright/test`);
