import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier/flat';
import security from 'eslint-plugin-security';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  security.configs.recommended,
  {
    rules: {
      // Errors: patterns that are dangerous whatever the context.
      'security/detect-eval-with-expression': 'error',
      'security/detect-new-buffer': 'error',
      'security/detect-buffer-noassert': 'error',
      'security/detect-pseudoRandomBytes': 'error',
      'security/detect-bidi-characters': 'error',
      'security/detect-disable-mustache-escape': 'error',
      'security/detect-no-csrf-before-method-override': 'error',
      'security/detect-non-literal-require': 'error',
      // Off: « obj[key] » is how typed records are read everywhere in this code base (keys
      // come from unions and zod enums); thousands of false positives, no signal.
      'security/detect-object-injection': 'off',
    },
  },
  prettier,
  globalIgnores([
    '.next/**',
    'dist/**',
    'lib/db/generated/**',
    'next-env.d.ts',
    'playwright-report/**',
    'test-results/**',
    'coverage/**',
    'design-reference/**',
  ]),
]);
