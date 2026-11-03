// ESLint flat config for every workspace.
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**', '**/playwright-report/**', '**/test-results/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Web app (browser)
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // The two core hooks rules. The React Compiler rules in the plugin's
      // newer presets mostly flag the player's imperative DOM code, which is
      // being rewritten into components in Phase 2 (docs/ROADMAP.md).
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },

  // Node-side files: configs, tests, e2e
  {
    files: ['*.{js,ts}', 'apps/*/*.{js,ts}', 'apps/web/e2e/**/*.ts', '**/*.test.{ts,tsx}'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },

  // Project-wide adjustments
  {
    rules: {
      // the YouTube IFrame API and a few DOM shims are untyped
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },
)
