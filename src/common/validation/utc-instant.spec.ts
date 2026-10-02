import { isUtcInstant } from './utc-instant';
test.each([
  '2026-01-01T00:00:00Z',
  '2024-02-29T23:59:59.123Z',
  '0001-01-01T00:00:00.1Z',
  '9999-12-31T23:59:59Z',
])('aceita UTC explícito: %s', (value) => expect(isUtcInstant(value)).toBe(true));
test.each([
  null,
  123,
  '',
  '2026-02-29T00:00:00Z',
  '2026-01-01',
  '0000-01-01T00:00:00Z',
  '2026-01-01T24:00:00Z',
  '2026-01-01T23:60:00Z',
  '2026-01-01T00:00:60Z',
  '2026-01-01T00:00:00+00:00',
  '2026-01-01T00:00:00.1234Z',
])('rejeita instante inválido: %s', (value) => expect(isUtcInstant(value)).toBe(false));
