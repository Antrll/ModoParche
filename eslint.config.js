const globals = require('globals');

const propias = { L: 'readonly', MPSeguro: 'readonly', MPUtil: 'readonly', MPCheckin: 'readonly', MPMapa: 'readonly', Html5Qrcode: 'readonly', qrcode: 'readonly' };
const reglas = {
  'no-undef': 'error', 'no-dupe-keys': 'error', 'no-unreachable': 'error', 'no-dupe-else-if': 'error',
  'no-func-assign': 'error', 'no-import-assign': 'error', 'no-self-assign': 'error', 'no-unsafe-finally': 'error',
  'no-eval': 'error', 'no-implied-eval': 'error', 'no-new-func': 'error',
};

module.exports = [
  { ignores: ['dist/**', 'node_modules/**', 'src/vendor/**', 'respaldo-dashboard-anterior/**', '.agents/**', '.claude/**', 'supabase/functions/**', 'supabase/pruebas/**'] },
  { files: ['*.js'], languageOptions: { ecmaVersion: 2022, sourceType: 'script', globals: { ...globals.browser, ...propias } }, rules: reglas },
  { files: ['sw.js'], languageOptions: { globals: { ...globals.serviceworker } } },
  { files: ['api/**/*.js', 'eslint.config.js'], languageOptions: { ecmaVersion: 2022, sourceType: 'commonjs', globals: globals.node }, rules: reglas },
  { files: ['scripts/**/*.mjs', 'tests/**/*.{js,mjs}'], languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.node, ...globals.browser } }, rules: reglas },
];
