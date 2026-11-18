/**
 * Pre-commit (Husky, .husky/pre-commit): ESLint and Prettier on the staged files, then the
 * typing of the whole project once (incremental, without the file list: tsc keeps tsconfig.json).
 */
export default {
  '*.{ts,tsx,js,mjs,cjs}': ['eslint --fix --no-warn-ignored', 'prettier --write'],
  '*.{json,md,yml,yaml,css}': ['prettier --write'],
  '*.{ts,tsx}': () => 'tsc --noEmit --incremental',
};
