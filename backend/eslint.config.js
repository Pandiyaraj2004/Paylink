const js = require('@eslint/js');
const globals = require('globals');
const importPlugin = require('eslint-plugin-import');

module.exports = [
  { ignores: ['node_modules', 'coverage'] },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { ...globals.node, ...globals.jest },
    },
    plugins: { import: importPlugin },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // Matches the inline eslint-disable comments already throughout src/ —
      // structured startup/job logging (no-console), sequential job/loop
      // processing where each iteration depends on I/O from the previous one
      // (no-await-in-loop), loop early-continue (no-continue), a deliberate
      // infinite polling loop (no-constant-condition), and the Firebase
      // service-account JSON conditional-path require (global-require /
      // import/no-dynamic-require). Enabled here so those comments suppress
      // a real rule instead of reading as stale directives.
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-await-in-loop': 'warn',
      'no-continue': 'warn',
      'no-constant-condition': ['warn', { checkLoops: false }],
      'global-require': 'warn',
      'import/no-dynamic-require': 'warn',
    },
  },
];
