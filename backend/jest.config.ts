import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  testTimeout: 30000,
  maxWorkers: 1,

  // Load .env.test trước khi bất kỳ test file nào được import
  setupFiles: ['<rootDir>/src/__tests__/load-env.ts'],

  // beforeAll / afterAll / beforeEach chạy cho mỗi test file
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/jest-setup.ts'],

  // Tạo test DB + chạy migration — chạy 1 lần trước tất cả test
  globalSetup: '<rootDir>/src/__tests__/global-setup.ts',

  // Đóng connection sau khi tất cả test xong
  globalTeardown: '<rootDir>/src/__tests__/global-teardown.ts',

  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },

  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/__tests__/**',
    '!src/migrations/**',
    '!src/app.ts',
    '!src/server.ts',
  ],
};

export default config;
