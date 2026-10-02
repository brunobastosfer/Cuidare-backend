import { ConfigService } from '@nestjs/config';
import { OpaqueTokenService } from './opaque-token.service';
test('tokens têm 256 bits aleatórios, hashes separados por finalidade e formato limitado', () => {
  const tokens = new OpaqueTokenService(new ConfigService({ JWT_SECRET: 'test-secret'.repeat(6) }));
  const token = tokens.generate('REFRESH');
  expect(tokens.valid('REFRESH', token)).toBe(true);
  expect(tokens.valid('PASSWORD_RESET', token)).toBe(false);
  expect(tokens.generate('REFRESH')).not.toBe(token);
  expect(tokens.hash('REFRESH', token)).toMatch(/^[a-f0-9]{64}$/);
  expect(tokens.hash('REFRESH', token)).not.toBe(tokens.hash('PASSWORD_RESET', token));
  expect(tokens.valid('REFRESH', 'rf_' + 'a'.repeat(44))).toBe(false);
  expect(tokens.rateKey('IP', 'test')).not.toBe(tokens.rateKey('IDENTITY', 'test'));
});
