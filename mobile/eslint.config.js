const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier');
const { defineConfig } = require('eslint/config');

module.exports = defineConfig([
  expoConfig,
  prettierConfig,
  {
    ignores: ['dist/**', 'coverage/**', '.expo/**', 'node_modules/**'],
  },
]);
