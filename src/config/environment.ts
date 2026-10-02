import { z } from 'zod';
import { isAbsolute } from 'node:path';
import { parseConsentPolicies } from './consent-policies';
import { parseRetentionDays } from './privacy-settings';

const numberFromEnv = (fallback: number, min: number, max: number) =>
  z.coerce.number().int().min(min).max(max).default(fallback);

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().min(1).default('127.0.0.1'),
    PORT: numberFromEnv(3000, 1, 65535),
    DATABASE_URL: z
      .url()
      .refine((value) => /^postgres(ql)?:\/\//.test(value), 'Use uma URL PostgreSQL.'),
    JWT_SECRET: z
      .string()
      .min(48)
      .refine((value) => !value.includes('CHANGE_ME'), 'Gere um segredo aleatório.'),
    JWT_ISSUER: z.string().min(1).default('cuidare-backend'),
    JWT_AUDIENCE: z.string().min(1).default('cuidare-app'),
    JWT_TTL_SECONDS: numberFromEnv(900, 60, 3600),
    REFRESH_TTL_SECONDS: numberFromEnv(2592000, 3600, 7776000),
    EMAIL_VERIFICATION_TTL_SECONDS: numberFromEnv(86400, 300, 172800),
    PASSWORD_RESET_TTL_SECONDS: numberFromEnv(1800, 300, 3600),
    AUTH_REQUIRE_VERIFIED_EMAIL: z.enum(['true', 'false']).default('true'),
    AUTH_LOGIN_IDENTITY_MAX: numberFromEnv(10, 1, 100),
    AUTH_REQUEST_IDENTITY_MAX: numberFromEnv(3, 1, 20),
    AUTH_IP_MAX: numberFromEnv(20, 1, 200),
    AUTH_RATE_WINDOW_SECONDS: numberFromEnv(900, 60, 3600),
    AUTH_RESPONSE_MIN_MS: numberFromEnv(250, 0, 2000),
    EMAIL_TRANSPORT: z.enum(['disabled', 'smtp']).default('disabled'),
    EMAIL_FROM: z.email().optional(),
    SMTP_HOST: z
      .string()
      .regex(/^[a-zA-Z0-9.-]{1,253}$/)
      .optional(),
    SMTP_PORT: numberFromEnv(465, 1, 65535),
    SMTP_SECURE: z.enum(['true', 'false']).default('true'),
    SMTP_USER: z.string().min(1).max(254).optional(),
    SMTP_PASSWORD: z.string().min(1).optional(),
    CORS_ORIGINS: z.string().default(''),
    TRUST_PROXY_HOPS: numberFromEnv(0, 0, 3),
    RATE_LIMIT_TTL_MS: numberFromEnv(60000, 1000, 3600000),
    RATE_LIMIT_MAX: numberFromEnv(100, 1, 10000),
    SWAGGER_ENABLED: z.enum(['true', 'false']).default('false'),
    DOCUMENT_STORAGE_DRIVER: z.enum(['local']).default('local'),
    DOCUMENT_STORAGE_ROOT: z.string().min(1).max(1000).default('.private-documents'),
    DOCUMENT_MAX_BYTES: numberFromEnv(5242880, 1024, 20971520),
    DOCUMENT_MAX_STORED_BYTES: numberFromEnv(104857600, 1024, 1073741824),
    DOCUMENT_MAX_STORED_FILES: numberFromEnv(500, 1, 10000),
    DOCUMENT_IO_CONCURRENCY: numberFromEnv(2, 1, 8),
    DOCUMENT_ALLOWED_MIME_TYPES: z
      .string()
      .default('application/pdf,image/png,image/jpeg')
      .transform((value, context) => {
        const types = value.split(',').map((v) => v.trim());
        if (
          !types.length ||
          types.some((type) => !['application/pdf', 'image/png', 'image/jpeg'].includes(type)) ||
          new Set(types).size !== types.length
        ) {
          context.addIssue({
            code: 'custom',
            message: 'Use uma lista não vazia e sem repetição de PDF, PNG e JPEG.',
          });
          return z.NEVER;
        }
        return types;
      }),
    DOCUMENT_SCANNER: z.enum(['disabled', 'clamav']).default('disabled'),
    DOCUMENT_SCAN_HOST: z
      .string()
      .regex(/^[a-zA-Z0-9.-]{1,253}$/)
      .default('127.0.0.1'),
    DOCUMENT_SCAN_PORT: numberFromEnv(3310, 1, 65535),
    DOCUMENT_SCAN_TIMEOUT_MS: numberFromEnv(5000, 100, 30000),
    PRIVACY_EXPORT_MAX_ITEMS: numberFromEnv(1000, 1, 10000),
    VACCINATION_STATUS_MAX_ITEMS: numberFromEnv(1000, 1, 5000),
    PRIVACY_EXPORT_MAX_BYTES: numberFromEnv(2097152, 1024, 10485760),
    PRIVACY_RETENTION_DAYS: z
      .string()
      .default('{}')
      .transform((value, context) => {
        try {
          return parseRetentionDays(value);
        } catch {
          context.addIssue({
            code: 'custom',
            message: 'Configure um JSON válido de retenção, sem prazos presumidos.',
          });
          return z.NEVER;
        }
      }),
    CONSENT_POLICIES: z
      .string()
      .default('{}')
      .transform((value, context) => {
        try {
          return parseConsentPolicies(value);
        } catch {
          context.addIssue({
            code: 'custom',
            message: 'Configure um JSON válido de políticas de consentimento.',
          });
          return z.NEVER;
        }
      }),
  })
  .superRefine((config, context) => {
    if (config.DOCUMENT_MAX_STORED_BYTES < config.DOCUMENT_MAX_BYTES)
      context.addIssue({
        code: 'custom',
        path: ['DOCUMENT_MAX_STORED_BYTES'],
        message: 'Quota deve comportar um upload máximo.',
      });
    if (
      config.NODE_ENV === 'production' &&
      config.DOCUMENT_SCANNER !== 'disabled' &&
      !isAbsolute(config.DOCUMENT_STORAGE_ROOT)
    )
      context.addIssue({
        code: 'custom',
        path: ['DOCUMENT_STORAGE_ROOT'],
        message: 'Storage de produção exige diretório privado absoluto.',
      });
    if (
      config.NODE_ENV === 'production' &&
      (config.AUTH_REQUIRE_VERIFIED_EMAIL !== 'true' || config.AUTH_RESPONSE_MIN_MS < 200)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['AUTH_REQUIRE_VERIFIED_EMAIL'],
        message: 'Produção exige email verificado e resposta mínima de 200ms.',
      });
    }
    if (
      config.EMAIL_TRANSPORT === 'smtp' &&
      (!config.SMTP_HOST ||
        !config.EMAIL_FROM ||
        Boolean(config.SMTP_USER) !== Boolean(config.SMTP_PASSWORD))
    ) {
      context.addIssue({
        code: 'custom',
        path: ['EMAIL_TRANSPORT'],
        message: 'SMTP exige host/remetente e credenciais completas quando utilizadas.',
      });
    }
    for (const origin of config.CORS_ORIGINS.split(',')
      .map((value) => value.trim())
      .filter(Boolean)) {
      try {
        const url = new URL(origin);
        if (
          !['http:', 'https:'].includes(url.protocol) ||
          url.origin !== origin ||
          (config.NODE_ENV === 'production' && url.protocol !== 'https:')
        )
          throw new Error();
      } catch {
        context.addIssue({
          code: 'custom',
          path: ['CORS_ORIGINS'],
          message:
            'Configure origens HTTP(S) exatas, sem wildcard ou caminhos; produção exige HTTPS.',
        });
      }
    }
    if (config.NODE_ENV === 'production' && config.SWAGGER_ENABLED === 'true') {
      context.addIssue({
        code: 'custom',
        path: ['SWAGGER_ENABLED'],
        message: 'Swagger público não é habilitado em produção.',
      });
    }
    if (config.DATABASE_URL.includes('CHANGE_ME')) {
      context.addIssue({
        code: 'custom',
        path: ['DATABASE_URL'],
        message: 'Configure a credencial do banco.',
      });
    }
  });

export type Environment = z.infer<typeof environmentSchema>;

export function validateEnvironment(values: Record<string, unknown>): Environment {
  const result = environmentSchema.safeParse(values);
  if (!result.success) {
    // Somente nomes e regras; nunca imprime valores secretos.
    const issues = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new Error(`Configuração inválida: ${issues.join('; ')}`);
  }
  return result.data;
}
