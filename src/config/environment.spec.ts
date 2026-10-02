import { validateEnvironment } from './environment';

const valid = {
  DATABASE_URL: 'postgresql://user:secret@localhost:5432/test',
  JWT_SECRET: 'a'.repeat(64),
};

test('valida e converte a configuração com valores padrão seguros', () => {
  expect(validateEnvironment(valid)).toMatchObject({
    PORT: 3000,
    TRUST_PROXY_HOPS: 0,
    JWT_TTL_SECONDS: 900,
    SWAGGER_ENABLED: 'false',
    CONSENT_POLICIES: {},
    DOCUMENT_SCANNER: 'disabled',
    DOCUMENT_MAX_BYTES: 5242880,
    DOCUMENT_IO_CONCURRENCY: 2,
    VACCINATION_STATUS_MAX_ITEMS: 1000,
    DOCUMENT_ALLOWED_MIME_TYPES: ['application/pdf', 'image/png', 'image/jpeg'],
  });
});

test.each([
  { JWT_SECRET: 'short' },
  { VACCINATION_STATUS_MAX_ITEMS: '0' },
  { VACCINATION_STATUS_MAX_ITEMS: '5001' },
  { VACCINATION_STATUS_MAX_ITEMS: '1.5' },
  { DOCUMENT_MAX_BYTES: '20971521' },
  { DOCUMENT_IO_CONCURRENCY: '0' },
  { DOCUMENT_MAX_STORED_FILES: '0' },
  { DOCUMENT_MAX_STORED_BYTES: '1000' },
  { DOCUMENT_ALLOWED_MIME_TYPES: 'text/html' },
  { DOCUMENT_ALLOWED_MIME_TYPES: 'image/png,image/png' },
  { DOCUMENT_ALLOWED_MIME_TYPES: '' },
  { DOCUMENT_SCAN_HOST: 'http://scanner/path' },
  { DOCUMENT_SCAN_TIMEOUT_MS: '30001' },
  { DOCUMENT_STORAGE_DRIVER: 'public' },
  {
    NODE_ENV: 'production',
    DOCUMENT_SCANNER: 'clamav',
    DOCUMENT_STORAGE_ROOT: '.private-documents',
  },
  { PORT: 'NaN' },
  { JWT_TTL_SECONDS: '999999' },
  { REFRESH_TTL_SECONDS: '0' },
  { PASSWORD_RESET_TTL_SECONDS: '86400' },
  { NODE_ENV: 'production', AUTH_REQUIRE_VERIFIED_EMAIL: 'false' },
  { NODE_ENV: 'production', AUTH_RESPONSE_MIN_MS: '0' },
  { EMAIL_TRANSPORT: 'smtp' },
  {
    EMAIL_TRANSPORT: 'smtp',
    SMTP_HOST: 'smtp.example.com',
    EMAIL_FROM: 'sender@example.com',
    SMTP_USER: 'user',
  },
  { DATABASE_URL: 'mysql://localhost/test' },
  { CORS_ORIGINS: '*' },
  { CORS_ORIGINS: 'https://app.example.com/path' },
  { NODE_ENV: 'production', CORS_ORIGINS: 'http://app.example.com' },
  { NODE_ENV: 'production', SWAGGER_ENABLED: 'true' },
  { CONSENT_POLICIES: 'not JSON' },
  { CONSENT_POLICIES: '{"NOTICE":{"version":"v1","scope":"ALL"}}' },
  { CONSENT_POLICIES: '{"NOTICE":{"version":"v1","scope":"ACCOUNT","secret":"private"}}' },
])('rejeita configuração insegura: %j', (override) => {
  expect(() => validateEnvironment({ ...valid, ...override })).toThrow('Configuração inválida');
});

test('a mensagem de validação não expõe o segredo recebido', () => {
  expect(() => validateEnvironment({ ...valid, JWT_SECRET: 'private-token' })).toThrow(
    /^(?![\s\S]*private-token)/,
  );
});
