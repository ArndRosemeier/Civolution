import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

const TRANSCENDENTALS = [
  'pow', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2', 'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh',
  'exp', 'expm1', 'log', 'log2', 'log10', 'log1p', 'cbrt', 'hypot',
];

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**', 'data/**', '**/test-results/**', '**/playwright-report/**', 'packages/client/public/**', '**/*.local.ts'] },
  {
    files: ['**/*.ts', '**/*.tsx'],
    extends: [js.configs.recommended, ...tseslint.configs.strictTypeChecked],
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // Indexed access is typed `T | undefined` (noUncheckedIndexedAccess); binary parsers
      // check bounds themselves, so `!` is the honest spelling there.
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // Determinism (PLAN.md section 5): game logic is a pure function of state, command and
    // the seeded PRNG stored in state. No ambient time, no Math.random, no transcendental
    // functions whose results differ between JavaScript engines. This is a tripwire for the
    // obvious spellings; golden state hashes catch the rest.
    files: [
      'packages/engine/src/**/*.ts',
      'packages/ai/src/**/*.ts',
      'packages/automation/src/**/*.ts',
      'packages/sim/src/**/*.ts',
    ],
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use the seeded PRNG carried in game state.' },
        { object: 'Date', property: 'now', message: 'No ambient time in game logic.' },
        { object: 'performance', property: 'now', message: 'No ambient time in game logic.' },
        { object: 'process', property: 'hrtime', message: 'No ambient time in game logic.' },
        ...TRANSCENDENTALS.map((property) => ({
          object: 'Math',
          property,
          message: 'Transcendental functions are not portable across JavaScript engines; use integer or fixed-point maths.',
        })),
      ],
      'no-restricted-globals': ['error', { name: 'Date', message: 'No ambient time in game logic.' }],
      'no-restricted-syntax': [
        'error',
        { selector: "BinaryExpression[operator='**']", message: 'Use integer maths; ** on non-integers is not portable.' },
      ],
    },
  },
  {
    // The browser client.
    files: ['packages/client/src/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    files: ['eslint.config.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },
);
