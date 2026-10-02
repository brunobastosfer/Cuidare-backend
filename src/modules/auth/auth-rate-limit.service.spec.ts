import { authFixture } from '../../../test/helpers/auth-fixture';
test('limite por identidade persiste e independe de IP/existência, sem armazenar email/IP puro', async () => {
  const f = await authFixture();
  f.config.set('AUTH_LOGIN_IDENTITY_MAX', 2);
  expect(await f.rates.consume('LOGIN', 'Person@Example.com', '10.0.0.1')).toBe(true);
  expect(await f.rates.consume('LOGIN', 'person@example.com', '10.0.0.2')).toBe(true);
  expect(await f.rates.consume('LOGIN', 'person@example.com', '10.0.0.3')).toBe(false);
  const rows = JSON.stringify([...f.foundation.auth.rateRows.values()]);
  expect(rows).not.toContain('person@example.com');
  expect(rows).not.toContain('10.0.0.');
});
test('limite por IP impede múltiplas identidades e janelas expiradas são renovadas', async () => {
  const f = await authFixture();
  f.config.set('AUTH_IP_MAX', 1);
  expect(await f.rates.consume('LOGIN', 'one@example.com', 'ip')).toBe(true);
  expect(await f.rates.consume('LOGIN', 'two@example.com', 'ip')).toBe(false);
  for (const row of f.foundation.auth.rateRows.values())
    f.foundation.auth.rateRows.set(row.key, { ...row, expiresAt: new Date(0) });
  expect(await f.rates.consume('LOGIN', 'two@example.com', 'ip')).toBe(true);
});
test('tentativas concorrentes respeitam o orçamento transacional', async () => {
  const f = await authFixture();
  f.config.set('AUTH_LOGIN_IDENTITY_MAX', 1);
  expect(
    await Promise.all([
      f.rates.consume('LOGIN', 'one@example.com', 'a'),
      f.rates.consume('LOGIN', 'one@example.com', 'b'),
    ]),
  ).toEqual([true, false]);
});
