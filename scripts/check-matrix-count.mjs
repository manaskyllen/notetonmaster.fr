/**
 * Fails when the rights matrix ran fewer tests than expected (CI job « integration »): a suite
 * whose preparation fails reports its tests as skipped, and must never go unnoticed.
 *   node scripts/check-matrix-count.mjs vitest-report.json 300
 */
import { readFileSync } from 'node:fs';

const [file = 'vitest-report.json', min = '300'] = process.argv.slice(2);
let report;
try {
  report = JSON.parse(readFileSync(file, 'utf8'));
} catch {
  console.error(`❌ Rapport ${file} illisible : la suite d'intégration n'a pas tourné.`);
  process.exit(1);
}
const matrix = report.testResults.filter((f) => /rights-matrix\.test\.ts$/.test(f.name));
const tests = matrix.flatMap((f) => f.assertionResults);
const ran = tests.filter((t) => t.status === 'passed' || t.status === 'failed');
const passed = tests.filter((t) => t.status === 'passed');
console.log(
  `Matrice des droits : ${ran.length} tests exécutés (${passed.length} réussis), ${tests.length - ran.length} sautés.`,
);
if (ran.length < Number(min)) {
  console.error(
    `❌ Moins de ${min} tests exécutés : la matrice des droits n'a pas réellement tourné.`,
  );
  process.exit(1);
}
console.log(`✅ Au moins ${min} tests de la matrice exécutés.`);
