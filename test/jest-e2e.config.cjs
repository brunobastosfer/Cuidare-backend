module.exports = {
  ...require('../jest.config.cjs'),
  rootDir: '..',
  setupFiles: ['<rootDir>/test/setup-env.ts'],
  testMatch: ['<rootDir>/test/**/*.e2e-spec.ts'],
  coverageDirectory: 'coverage/e2e',
};
