// Heaviest modules of the browser JavaScript loaded by a first visit of a route, from the
// Turbopack analysis (`pnpm analyze` runs `next analyze --output`, then this script). Chunks
// loaded on demand (next/dynamic, import()) are left out, unless --lazy. Sizes are those of the
// analyzer (compressed per module): the order matters more than the exact total, which
// scripts/perf.mjs measures on the real build.
//   node scripts/analyze-js.mjs [--route=/a-propos] [--top=25] [--by=module|package] [--lazy]
// @next/bundle-analyzer only reads webpack builds; `next build` here is Turbopack.
import { spawnSync } from 'node:child_process';

const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const ROUTE = arg('route', '/_not-found');
const TOP = Number(arg('top', 25));
const BY = arg('by', 'module');

const res = spawnSync('node_modules/.bin/next', ['analyze', 'export', '--route', ROUTE], {
  encoding: 'utf8',
  maxBuffer: 1 << 30,
});
if (res.status !== 0) {
  console.error(res.stderr || 'next analyze export failed: run `pnpm analyze` first.');
  process.exit(1);
}

const short = (p) => {
  const path = p.replace(/^\[project\]\//, '');
  const nm = path.match(
    /node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?((?:@[^/]+\/)?[^/]+)(\/.*)?$/,
  );
  if (!nm) return { pkg: 'app', mod: path };
  return { pkg: nm[1], mod: `${nm[1]}${nm[2] ?? ''}` };
};

const LAZY = process.argv.includes('--lazy');
const lines = res.stdout
  .split('\n')
  .filter(Boolean)
  .map((l) => JSON.parse(l));
// A chunk is « first visit » when a non-async group (bootstrap, layouts and page) outputs it.
const eager = new Set();
const lazy = new Set();
for (const g of lines)
  if (g.type === 'group') for (const o of g.outputs) (g.kind === 'async' ? lazy : eager).add(o);

const sizes = new Map();
let total = 0;
for (const part of lines) {
  if (part.type !== 'part') continue;
  if (!LAZY && lazy.has(part.filename) && !eager.has(part.filename)) continue;
  if (!/^\[client-fs\]\/_next\/static\/chunks\/.*\.js$/.test(part.filename)) continue; // browser JavaScript only
  const { pkg, mod } = short(part.source_path);
  const key = BY === 'package' ? pkg : mod;
  sizes.set(key, (sizes.get(key) ?? 0) + part.compressed_size);
  total += part.compressed_size;
}
console.log(`${ROUTE}: ${(total / 1024).toFixed(1)} KB (compressed, analyzer)`);
for (const [k, v] of [...sizes].sort((a, b) => b[1] - a[1]).slice(0, TOP))
  console.log(`${(v / 1024).toFixed(1).padStart(7)} KB  ${k}`);
