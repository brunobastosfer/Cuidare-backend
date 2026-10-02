// Ambiente exclusivo de testes; não lê nem altera as credenciais reais.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:5432/cuidare_test';
process.env.JWT_SECRET = 'cuidare-test-only-secret-'.repeat(4);
process.env.JWT_ISSUER = 'cuidare-backend';
process.env.JWT_AUDIENCE = 'cuidare-app';
process.env.JWT_TTL_SECONDS = '900';
process.env.CORS_ORIGINS = 'http://localhost:8081';
process.env.SWAGGER_ENABLED = 'false';
process.env.TRUST_PROXY_HOPS = '0';
process.env.RATE_LIMIT_MAX = '100';
process.env.RATE_LIMIT_TTL_MS = '60000';
process.env.AUTH_REQUIRE_VERIFIED_EMAIL = 'false'; // Somente fixtures de regressão.
process.env.AUTH_RESPONSE_MIN_MS = '0';
process.env.EMAIL_TRANSPORT = 'disabled'; // SMTP real nunca é utilizado nos testes.
process.env.DOCUMENT_STORAGE_DRIVER = 'local';
process.env.DOCUMENT_STORAGE_ROOT = '.private-documents';
process.env.DOCUMENT_MAX_BYTES = '5242880';
process.env.VACCINATION_STATUS_MAX_ITEMS = '1000';
process.env.DOCUMENT_MAX_STORED_BYTES = '104857600';
process.env.DOCUMENT_MAX_STORED_FILES = '500';
process.env.DOCUMENT_IO_CONCURRENCY = '2';
process.env.DOCUMENT_ALLOWED_MIME_TYPES = 'application/pdf,image/png,image/jpeg';
process.env.DOCUMENT_SCANNER = 'disabled'; // Scanners fictícios só via override; não usa clamd real.
process.env.DOCUMENT_SCAN_HOST = '127.0.0.1';
process.env.DOCUMENT_SCAN_PORT = '3310';
process.env.DOCUMENT_SCAN_TIMEOUT_MS = '1000';
process.env.CONSENT_POLICIES = JSON.stringify({
  TEST_NOTICE: { version: 'v1', scope: 'ACCOUNT' },
  TEST_DEPENDENT: { version: 'v1', scope: 'DEPENDENT' },
});
