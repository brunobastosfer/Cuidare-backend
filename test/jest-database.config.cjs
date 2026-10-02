module.exports = {
  ...require('../jest.config.cjs'),
  rootDir: '..',
  setupFiles: ['<rootDir>/test/setup-database-env.ts'],
  testMatch: ['<rootDir>/test/**/*.integration-spec.ts'],
  testTimeout: 15000,
};
