import { UnauthorizedException } from '@nestjs/common';
import { authFixture, authPassword } from '../../../test/helpers/auth-fixture';
test('sessões múltiplas armazenam apenas hash; rotação mantém limite absoluto', async () => {
  const f = await authFixture();
  const session = await f.auth.login({ email: f.user.email, password: authPassword }, 'ip');
  const other = await f.auth.login({ email: f.user.email, password: authPassword }, 'ip');
  expect(session.refreshToken).toMatch(/^rf_[A-Za-z0-9_-]{43}$/);
  expect(f.foundation.auth.sessionRows.size).toBe(2);
  expect(JSON.stringify([...f.foundation.auth.refreshRows.values()])).not.toContain(
    session.refreshToken,
  );
  const current = [...f.foundation.auth.refreshRows.values()].find(
    (row) => row.tokenHash === f.tokens.hash('REFRESH', session.refreshToken),
  );
  const rotated = await f.auth.refresh(session.refreshToken);
  expect(rotated.refreshToken).not.toBe(session.refreshToken);
  expect(f.foundation.auth.refreshRows.get(current?.id ?? '')?.usedAt).not.toBeNull();
  expect(f.foundation.auth.sessionRows.size).toBe(2);
  expect(f.foundation.auth.refreshRows.size).toBe(3);
  expect(rotated.refreshExpiresIn).toBeLessThanOrEqual(session.refreshExpiresIn);
  expect(other.user.id).toBe(session.user.id);
});
test('replay revoga a família antes do 401, sem revogar outra sessão', async () => {
  const f = await authFixture();
  const session = await f.auth.login({ email: f.user.email, password: authPassword }, 'ip');
  const other = await f.auth.login({ email: f.user.email, password: authPassword }, 'ip');
  const rotated = await f.auth.refresh(session.refreshToken);
  await expect(f.auth.refresh(session.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
  await expect(f.auth.refresh(rotated.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
  expect((await f.auth.refresh(other.refreshToken)).user.id).toBe(f.user.id);
  expect(f.foundation.auditRows.some((row) => row.action === 'REFRESH_REUSE_DETECTED')).toBe(true);
});
test('duas rotações concorrentes do mesmo token não criam duas credenciais utilizáveis', async () => {
  const f = await authFixture();
  const session = await f.auth.login({ email: f.user.email, password: authPassword }, 'ip');
  const results = await Promise.allSettled([
    f.auth.refresh(session.refreshToken),
    f.auth.refresh(session.refreshToken),
  ]);
  expect(results.filter((row) => row.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter((row) => row.status === 'rejected')).toHaveLength(1);
  expect([...f.foundation.auth.sessionRows.values()].every((row) => row.revokedAt !== null)).toBe(
    true,
  );
});
test('logout não aceita sessão de outro usuário; logout-all é limitado ao titular', async () => {
  const f = await authFixture();
  const session = await f.auth.login({ email: f.user.email, password: authPassword }, 'ip');
  await f.auth.register(
    { name: 'Other', email: 'other@example.com', password: authPassword },
    'ip',
  );
  const other = await f.auth.login({ email: 'other@example.com', password: authPassword }, 'ip');
  const payload = f.jwt.decode<{ sid: string }>(other.accessToken);
  await f.auth.logout(f.user.id, payload.sid);
  expect((await f.auth.refresh(other.refreshToken)).user.email).toBe('other@example.com');
  await f.auth.logoutAll(f.user.id);
  await expect(f.auth.refresh(session.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
});
test('token expirado, conta bloqueada e versão de credencial antiga não fazem refresh', async () => {
  const f = await authFixture();
  const session = await f.auth.login({ email: f.user.email, password: authPassword }, 'ip');
  const row = [...f.foundation.auth.sessionRows.values()][0];
  if (!row) throw new Error();
  f.foundation.auth.sessionRows.set(row.id, { ...row, expiresAt: new Date(0) });
  await expect(f.auth.refresh(session.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
  f.foundation.auth.sessionRows.set(row.id, row);
  f.users.rows.set(f.user.email, { ...f.user, status: 'BLOCKED' });
  await expect(f.auth.refresh(session.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
  f.users.rows.set(f.user.email, { ...f.user, credentialVersion: 1 });
  await expect(f.auth.refresh(session.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
});
test('login não cria sessão se a senha mudou após verificação; rollback se audit falhar', async () => {
  const f = await authFixture();
  const original = f.passwords.verify.bind(f.passwords);
  jest.spyOn(f.passwords, 'verify').mockImplementationOnce(async (password, hash) => {
    const valid = await original(password, hash);
    await f.users.resetPassword(
      f.user.id,
      0,
      await f.passwords.hash('Nova senha extensa e segura!'),
    );
    return valid;
  });
  await expect(
    f.auth.login({ email: f.user.email, password: authPassword }, 'ip'),
  ).rejects.toBeInstanceOf(UnauthorizedException);
  expect(f.foundation.auth.sessionRows.size).toBe(0);
  jest.spyOn(f.foundation.auditLogs, 'append').mockRejectedValue(new Error('audit failure'));
  await expect(
    f.auth.login({ email: f.user.email, password: 'Nova senha extensa e segura!' }, 'ip'),
  ).rejects.toThrow();
  expect(f.foundation.auth.sessionRows.size).toBe(0);
  expect(f.foundation.auth.refreshRows.size).toBe(0);
});
test('auditoria malsucedida desfaz rotação e revogação, sem consumir a credencial', async () => {
  const f = await authFixture();
  const session = await f.auth.login({ email: f.user.email, password: authPassword }, 'ip');
  const row = [...f.foundation.auth.refreshRows.values()][0];
  jest.spyOn(f.foundation.auditLogs, 'append').mockRejectedValue(new Error('audit failure'));
  await expect(f.auth.refresh(session.refreshToken)).rejects.toThrow();
  expect(f.foundation.auth.refreshRows.size).toBe(1);
  expect(f.foundation.auth.refreshRows.get(row?.id ?? '')?.usedAt).toBeNull();
  await expect(f.auth.logoutAll(f.user.id)).rejects.toThrow();
  expect([...f.foundation.auth.sessionRows.values()][0]?.revokedAt).toBeNull();
});
test('cadastro duplicado ou excluído é neutro e não altera senha', async () => {
  const f = await authFixture();
  const response = await f.auth.register(
    { name: 'Different', email: f.user.email, password: 'Senha completamente diferente!' },
    'ip',
  );
  expect(response).toEqual({ message: 'Solicitação recebida.' });
  expect((await f.users.findByEmail(f.user.email))?.passwordHash).toBe(f.user.passwordHash);
  f.users.rows.set(f.user.email, { ...f.user, deletedAt: new Date() });
  expect(
    await f.auth.register({ name: 'Different', email: f.user.email, password: authPassword }, 'ip'),
  ).toEqual(response);
  expect(f.users.rows.size).toBe(1);
});
