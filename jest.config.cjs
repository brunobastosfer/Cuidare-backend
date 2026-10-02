module.exports = {
  testEnvironment: 'node',
  // Argon2 real + bootstrap Nest, inclusive em runners com recursos limitados.
  testTimeout: 15000,
  rootDir: '.',
  setupFiles: ['<rootDir>/test/setup-env.ts'],
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  transform: { '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.json' }] },
  // Prisma gera imports .js, resolvidos para os fontes .ts durante os testes.
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  clearMocks: true,
  restoreMocks: true,
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.spec.ts', '!src/generated/**', '!src/main.ts'],
  coverageDirectory: 'coverage/unit',
};
