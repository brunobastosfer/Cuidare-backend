import { parseRetentionDays } from './privacy-settings';
import { validateEnvironment } from './environment';
test('retenção não presume prazo; aceita somente categorias e dias explícitos', () => {
  expect(Object.values(parseRetentionDays('{}'))).toEqual(Array(13).fill(null));
  expect(parseRetentionDays('{"ACCOUNT":0,"AUDIT":30}')).toMatchObject({
    ACCOUNT: 0,
    AUDIT: 30,
    AUTH: null,
    MEDICATION: null,
    APPOINTMENT: null,
    DOCUMENT: null,
    VACCINATION: null,
    EDUCATION: null,
  });
});
test.each(['{"ACCOUNT":-1}', '{"AUDIT":1.5}', '{"secret":"private"}', '{"AUTH":"30"}', 'not json'])(
  'retenção inválida não revela valores: %s',
  (value) => {
    expect(() => parseRetentionDays(value)).toThrow('PRIVACY_RETENTION_DAYS');
    expect(() =>
      validateEnvironment({
        DATABASE_URL: 'postgresql://test:test@localhost/test',
        JWT_SECRET: 'a'.repeat(64),
        PRIVACY_RETENTION_DAYS: value,
      }),
    ).toThrow(/^(?![\s\S]*private)/);
  },
);
test.each([
  { PRIVACY_EXPORT_MAX_ITEMS: 0 },
  { PRIVACY_EXPORT_MAX_BYTES: 100 },
  { PRIVACY_EXPORT_MAX_ITEMS: 10001 },
])('exportação exige limites seguros', (override) => {
  expect(() =>
    validateEnvironment({
      DATABASE_URL: 'postgresql://test:test@localhost/test',
      JWT_SECRET: 'a'.repeat(64),
      ...override,
    }),
  ).toThrow();
});
