// @ts-check
const eslint = require('@eslint/js');
const tseslint = require('typescript-eslint');
const prettierConfig = require('eslint-config-prettier');

module.exports = tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettierConfig,
  {
    rules: {
      // Không dùng any — dùng unknown hoặc type cụ thể
      '@typescript-eslint/no-explicit-any': 'error',

      // Bắt buộc xử lý Promise
      '@typescript-eslint/no-floating-promises': 'error',

      // Không để biến unused (trừ prefix _)
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],

      // Không dùng console.log trực tiếp — phải dùng logger
      'no-console': 'error',

      // Bỏ require() — dùng import
      '@typescript-eslint/no-require-imports': 'error',
    },
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
      },
    },
  },
  {
    // Test files — Jest patterns dùng floating promises theo convention
    files: ['src/__tests__/**/*.ts'],
    rules: {
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-console': 'off',
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**', 'jest.config.ts'],
  },
);
