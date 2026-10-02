import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { authFixture, authPassword } from '../../../test/helpers/auth-fixture';
function lastCode(f: Awaited<ReturnType<typeof authFixture>>) {
  const token = f.notifications.messages.at(-1)?.token;
  if (!token) throw new Error('Código ausente');
  return token;
}
test('pedido para email existente/inexistente é neutro; código tem uso único e finalidade', async () => {
  const f = await authFixture();
  const existing = await f.account.request('EMAIL_VERIFICATION', f.user.email, 'ip');
  const missing = await f.account.request('EMAIL_VERIFICATION', 'missing@example.com', 'ip');
  expect(existing).toEqual(missing);
  expect(f.notifications.messages).toHaveLength(1);
  const token = lastCode(f);
  expect(JSON.stringify([...f.foundation.auth.tokenRows.values()])).not.toContain(token);
  await expect(f.account.resetPassword(token, authPassword)).rejects.toBeInstanceOf(
    BadRequestException,
  );
  await f.account.verifyEmail(token);
  expect((await f.users.findById(f.user.id))?.emailVerifiedAt).not.toBeNull();
  await expect(f.account.verifyEmail(token)).rejects.toBeInstanceOf(BadRequestException);
});
test('reemissão revoga o anterior e código expirado/inválido não confirma email', async () => {
  const f = await authFixture();
  await f.account.request('EMAIL_VERIFICATION', f.user.email, 'ip');
  const first = lastCode(f);
  await f.account.request('EMAIL_VERIFICATION', f.user.email, 'ip');
  const second = lastCode(f);
  await expect(f.account.verifyEmail(first)).rejects.toBeInstanceOf(BadRequestException);
  const row = [...f.foundation.auth.tokenRows.values()].find(
    (item) => item.tokenHash === f.tokens.hash('EMAIL_VERIFICATION', second),
  );
  if (!row) throw new Error();
  f.foundation.auth.tokenRows.set(row.id, { ...row, expiresAt: new Date(0) });
  await expect(f.account.verifyEmail(second)).rejects.toBeInstanceOf(BadRequestException);
  expect((await f.users.findById(f.user.id))?.emailVerifiedAt).toBeNull();
});
test('reset altera hash Argon2, invalida sessões e demais códigos, sem login automático', async () => {
  const f = await authFixture();
  const session = await f.auth.login({ email: f.user.email, password: authPassword }, 'ip');
  await f.account.request('EMAIL_VERIFICATION', f.user.email, 'ip');
  const verification = lastCode(f);
  await f.account.request('PASSWORD_RESET', f.user.email, 'ip');
  const token = lastCode(f);
  await f.account.resetPassword(token, 'Senha nova com comprimento seguro!');
  const user = await f.users.findById(f.user.id);
  expect(user?.passwordHash).toMatch(/^\$argon2id/);
  expect(user?.credentialVersion).toBe(1);
  await expect(f.auth.refresh(session.refreshToken)).rejects.toThrow();
  await expect(
    f.auth.login({ email: f.user.email, password: authPassword }, 'ip'),
  ).rejects.toThrow();
  await expect(f.account.resetPassword(token, authPassword)).rejects.toBeInstanceOf(
    BadRequestException,
  );
  await expect(f.account.verifyEmail(verification)).rejects.toBeInstanceOf(BadRequestException);
  expect(f.notifications.messages.at(-1)?.purpose).toBe('PASSWORD_CHANGED');
  expect(
    (
      await f.auth.login(
        { email: f.user.email, password: 'Senha nova com comprimento seguro!' },
        'ip',
      )
    ).user.id,
  ).toBe(f.user.id);
});
test('reset/uso único são atômicos com auditoria e bloqueio de usuário', async () => {
  const f = await authFixture();
  await f.account.request('PASSWORD_RESET', f.user.email, 'ip');
  const token = lastCode(f);
  jest.spyOn(f.foundation.auditLogs, 'append').mockRejectedValueOnce(new Error('audit'));
  await expect(
    f.account.resetPassword(token, 'Senha nova com comprimento seguro!'),
  ).rejects.toThrow();
  expect((await f.users.findById(f.user.id))?.credentialVersion).toBe(0);
  expect([...f.foundation.auth.tokenRows.values()][0]?.usedAt).toBeNull();
  f.users.rows.set(f.user.email, { ...f.user, status: 'BLOCKED' });
  await expect(f.account.resetPassword(token, authPassword)).rejects.toBeInstanceOf(
    BadRequestException,
  );
});
test('confirmação concorrente só admite um sucesso', async () => {
  const f = await authFixture();
  await f.account.request('EMAIL_VERIFICATION', f.user.email, 'ip');
  const token = lastCode(f);
  const results = await Promise.allSettled([
    f.account.verifyEmail(token),
    f.account.verifyEmail(token),
  ]);
  expect(results.filter((row) => row.status === 'fulfilled')).toHaveLength(1);
  expect(f.foundation.auditRows.filter((row) => row.action === 'EMAIL_VERIFIED')).toHaveLength(1);
});
test('email desativado responde indisponibilidade para qualquer endereço antes de consultar usuário', async () => {
  const f = await authFixture();
  f.notifications.available = false;
  const spy = jest.spyOn(f.users, 'findByEmail');
  for (const email of [f.user.email, 'missing@example.com'])
    await expect(f.account.request('PASSWORD_RESET', email, 'ip')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  expect(spy).not.toHaveBeenCalled();
});
