// Light load on the key routes (`make perf`): p50 / p95 / p99 of the time to first byte, size
// of the HTML, and JavaScript loaded by a first visit (compressed, from the page's <script> tags).
// node scripts/perf.mjs [--base=http://localhost:3002] [--n=20] [--c=2] [--json=file]
import { writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const BASE = arg('base', process.env.PERF_BASE ?? 'http://localhost:3002');
const N = Number(arg('n', 20));
const C = Number(arg('c', 2));

// The fiches are found on the site itself, so that they exist on any database (demo seed in the
// CI, national data with `make perf`): never a fixed address that may answer 404.
async function firstLink(page, prefix) {
  const res = await fetch(BASE + page);
  const html = await res.text();
  const at = html.indexOf(`href="${prefix}`);
  const href = at < 0 ? null : html.slice(at + 6, html.indexOf('"', at + 6)).split(/[#?]/)[0];
  if (!href) throw new Error(`${page} (${res.status}): aucun lien ${prefix}… à mesurer`);
  return href;
}
const firstMention = () => firstLink('/mentions', '/mentions/');
const biggestMention = () => firstLink('/mentions?tri=parcours', '/mentions/');
const firstUniversity = () => firstLink('/universites?tri=masters', '/universites/');
const firstParcours = async () => firstLink(await biggestMention(), '/parcours/');
async function reviewReply() {
  const slug = (await firstParcours()).replace('/parcours/', '');
  return `/reponse-formation?parcours=${slug}`;
}

// Performance budgets (TTFB p95, ms): 100 for pages served from cache, 300 for Explorer, the
// search and the fiches, 80 for the suggestions; first-load JavaScript 150 KB compressed.
const ROUTES = [
  ['Accueil', '/', null, 300],
  ['Accueil · recherche « droit »', '/?q=droit', null, 300],
  ['Explorer', '/explorer', null, 300],
  [
    'Explorer · 4 filtres',
    '/explorer?domaine=droit-economie-gestion&modalite=alternance&entree=M1&acces=selectif',
    null,
    300,
  ],
  ['Explorer · page 2', '/explorer?page=2', null, 300],
  ['Fiche parcours', null, firstParcours, 300],
  ['Fiche mention (première de l’index)', null, firstMention, 300],
  ['Fiche mention (la plus grosse)', null, biggestMention, 300],
  ['Fiche université (la plus grosse)', null, firstUniversity, 300],
  ['À propos', '/a-propos', null, 100],
  ['Répondre aux avis', null, reviewReply, 300],
  ['Index des mentions', '/mentions', null, 100],
  ['Suggestions « patrimoine nantes »', '/api/search?q=patrimoine%20nantes&limit=8', null, 80],
  ['Suggestions « dro »', '/api/search?q=dro&limit=8', null, 80],
  [
    'Palette « rncp 42684 »',
    '/api/search?q=rncp%2042684&limits=program:7,mention:4,university:4,city:4',
    null,
    80,
  ],
];
// JavaScript budget (perf-budget.json): the CI fails above jsKbMax, warns above the target.
const BUDGET = JSON.parse(
  (await import('node:fs')).readFileSync(new URL('../perf-budget.json', import.meta.url), 'utf8'),
);
const JS_BUDGET_KB = BUDGET.jsKbMax;
const JS_TARGET_KB = BUDGET.jsKbTarget;
// --js-only: only the JavaScript weight (CI machines skew timings).
const JS_ONLY = process.argv.includes('--js-only');
const failures = [];
const warnings = [];

const pct = (xs, p) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
};

async function ttfb(url) {
  const t0 = performance.now();
  const res = await fetch(url, { headers: { 'accept-encoding': 'identity' } });
  const reader = res.body.getReader();
  const first = await reader.read();
  const t1 = performance.now();
  let size = first.value?.length ?? 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
  }
  return { ms: t1 - t0, total: performance.now() - t0, size, status: res.status };
}

const jsCache = new Map();
async function jsWeight(path) {
  const html = await (await fetch(BASE + path)).text();
  const srcs = [...html.matchAll(/<script[^>]+src="([^"]+\.js[^"]*)"/g)].map((m) => m[1]);
  let gz = 0;
  for (const s of new Set(srcs)) {
    if (!jsCache.has(s)) {
      const buf = Buffer.from(await (await fetch(new URL(s, BASE))).arrayBuffer());
      jsCache.set(s, gzipSync(buf).length);
    }
    gz += jsCache.get(s);
  }
  return gz;
}

const only = arg('only', null);
const out = [];
for (const [label, fixed, resolve, budget] of ROUTES.filter(
  ([l, fixed]) => (!only || l.includes(only)) && !(JS_ONLY && fixed?.startsWith('/api/')),
)) {
  let path;
  try {
    path = fixed ?? (await resolve());
  } catch (e) {
    failures.push(`${label}: ${e.message}`);
    console.log(`${label.padEnd(42)} introuvable (${e.message})`);
    continue;
  }
  const url = BASE + path;
  await ttfb(url); // warm-up (compilation, caches)
  const runs = [];
  for (let i = 0; i < N; i += C)
    runs.push(...(await Promise.all(Array.from({ length: Math.min(C, N - i) }, () => ttfb(url)))));
  const ms = runs.map((r) => r.ms);
  const row = {
    label,
    path,
    status: runs[0].status,
    p50: Math.round(pct(ms, 50)),
    p95: Math.round(pct(ms, 95)),
    p99: Math.round(pct(ms, 99)),
    full95: Math.round(
      pct(
        runs.map((r) => r.total),
        95,
      ),
    ),
    kb: Math.round(runs[0].size / 1024),
    jsKb: path.startsWith('/api/') ? null : Math.round((await jsWeight(path)) / 1024),
  };
  row.budget = budget;
  out.push(row);
  // A page that does not answer 200 measures an error page, not the page: always a failure.
  if (runs.some((r) => r.status !== 200))
    failures.push(`${label}: ${path} répond ${[...new Set(runs.map((r) => r.status))].join(', ')}`);
  if (!JS_ONLY && row.p95 > budget)
    failures.push(`${label}: TTFB p95 ${row.p95} ms > ${budget} ms`);
  if (row.jsKb != null && row.jsKb > JS_BUDGET_KB)
    failures.push(`${label}: JS ${row.jsKb} Ko > ${JS_BUDGET_KB} Ko`);
  else if (row.jsKb != null && row.jsKb > JS_TARGET_KB)
    warnings.push(`${label}: JS ${row.jsKb} Ko, au-dessus de l’objectif de ${JS_TARGET_KB} Ko`);
  console.log(
    `${label.padEnd(42)} ${String(row.status).padEnd(4)} TTFB p50 ${String(row.p50).padStart(6)} ms  p95 ${String(row.p95).padStart(6)} ms  p99 ${String(row.p99).padStart(6)} ms  complet p95 ${String(row.full95).padStart(6)} ms  HTML ${String(row.kb).padStart(6)} Ko  JS ${row.jsKb ?? '–'} Ko gz`,
  );
}
const json = arg('json', null);
if (json)
  writeFileSync(
    json,
    JSON.stringify({ base: BASE, n: N, at: new Date().toISOString(), routes: out }, null, 2),
  );

// Everything on stdout, in order, after the table; exitCode rather than exit(), which may cut a
// piped stdout before its end (the CI log showed a line after the summary).
if (warnings.length) console.log(`\n⚠️ Au-dessus de l’objectif :\n- ${warnings.join('\n- ')}`);
if (failures.length) console.log(`\nBudgets dépassés :\n- ${failures.join('\n- ')}`);
if (process.argv.includes('--assert') && failures.length) process.exitCode = 1;
