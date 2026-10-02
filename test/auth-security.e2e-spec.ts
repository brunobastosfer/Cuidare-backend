import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import request from 'supertest';
import { z } from 'zod';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createTestApp } from './helpers/create-test-app';
import { authPassword } from './helpers/auth-fixture';
const sessionSchema = z
  .object({
    accessToken: z.string(),
    refreshToken: z.string(),
    expiresIn: z.number(),
    refreshExpiresIn: z.number(),
    tokenType: z.literal('Bearer'),
    user: z
      .object({ id: z.uuid(), name: z.string(), email: z.string(), createdAt: z.string() })
      .strict(),
  })
  .strict();
let f: Awaited<ReturnType<typeof createTestApp>> | undefined;
let server: Server;
beforeEach(async () => {
  f = await createTestApp();
  server = f.app.getHttpServer();
});
afterEach(async () => {
  await f?.app.close();
  f = undefined;
});
function fixture() {
  if (!f) throw new Error();
  return f;
}
async function register(email = 'person@example.com') {
  const response = await request(server)
    .post('/api/v1/auth/register')
    .send({ name: 'Fictício', email, password: authPassword })
    .expect(202);
  expect(response.body).toEqual({ message: 'Solicitação recebida.' });
}
async function login(email = 'person@example.com', password = authPassword) {
  const response = await request(server)
    .post('/api/v1/auth/login')
    .send({ email, password })
    .expect(200);
  return sessionSchema.parse(response.body);
}
async function start(email = 'person@example.com') {
  await register(email);
  return login(email);
}
function code() {
  const token = fixture().notifications.messages.at(-1)?.token;
  if (!token) throw new Error('Código ausente');
  return token;
}

test('cadastro neutro inclusive duplicado/excluído, sem sessão ou dados pessoais', async () => {
  await register();
  await register();
  const user = await fixture().users.findByEmail('person@example.com');
  if (!user) throw new Error();
  fixture().users.rows.set(user.email, { ...user, deletedAt: new Date() });
  await register();
  expect(fixture().users.rows.size).toBe(1);
  expect(fixture().foundation.auth.sessionRows.size).toBe(0);
});

test('rotação substitui refresh; replay revoga access e refresh da família', async () => {
  const first = await start();
  const other = await login();
  const refreshed = await request(server)
    .post('/api/v1/auth/refresh')
    .send({ refreshToken: first.refreshToken })
    .expect(200);
  const next = sessionSchema.parse(refreshed.body);
  expect(next.refreshToken).not.toBe(first.refreshToken);
  await request(server)
    .post('/api/v1/auth/refresh')
    .send({ refreshToken: first.refreshToken })
    .expect(401);
  await request(server)
    .post('/api/v1/auth/refresh')
    .send({ refreshToken: next.refreshToken })
    .expect(401);
  for (const token of [first.accessToken, next.accessToken])
    await request(server).get('/api/v1/me').auth(token, { type: 'bearer' }).expect(401);
  await request(server).get('/api/v1/me').auth(other.accessToken, { type: 'bearer' }).expect(200);
});

test('logout atual e global invalidam tokens imediatamente, sem afetar outro usuário', async () => {
  const first = await start();
  const second = await login();
  const other = await start('other@example.com');
  await request(server)
    .post('/api/v1/auth/logout')
    .auth(first.accessToken, { type: 'bearer' })
    .expect(204);
  await request(server).get('/api/v1/me').auth(first.accessToken, { type: 'bearer' }).expect(401);
  await request(server)
    .post('/api/v1/auth/refresh')
    .send({ refreshToken: first.refreshToken })
    .expect(401);
  await request(server).get('/api/v1/me').auth(second.accessToken, { type: 'bearer' }).expect(200);
  await request(server)
    .post('/api/v1/auth/logout-all')
    .auth(second.accessToken, { type: 'bearer' })
    .expect(204);
  await request(server).get('/api/v1/me').auth(second.accessToken, { type: 'bearer' }).expect(401);
  await request(server).get('/api/v1/me').auth(other.accessToken, { type: 'bearer' }).expect(200);
});

test('sessão expirada ou SID de outro usuário não autoriza acesso; JWT legado é inválido', async () => {
  const first = await start();
  const other = await start('other@example.com');
  const jwt = fixture().app.get(JwtService);
  const payload = jwt.decode<{ sid: string; cv: number }>(first.accessToken);
  const forged = await jwt.signAsync({
    sub: other.user.id,
    sid: payload.sid,
    cv: payload.cv,
    tokenUse: 'access',
  });
  await request(server).get('/api/v1/me').auth(forged, { type: 'bearer' }).expect(401);
  const legacy = await jwt.signAsync({ sub: first.user.id });
  await request(server).get('/api/v1/me').auth(legacy, { type: 'bearer' }).expect(401);
  const row = fixture().foundation.auth.sessionRows.get(payload.sid);
  if (!row) throw new Error();
  fixture().foundation.auth.sessionRows.set(row.id, { ...row, expiresAt: new Date(0) });
  await request(server).get('/api/v1/me').auth(first.accessToken, { type: 'bearer' }).expect(401);
  await request(server)
    .post('/api/v1/auth/refresh')
    .send({ refreshToken: first.refreshToken })
    .expect(401);
});

test('email verificado é exigido quando habilitado; confirmação tem uso único', async () => {
  fixture().app.get(ConfigService).set('AUTH_REQUIRE_VERIFIED_EMAIL', 'true');
  await register();
  const invalid = await request(server)
    .post('/api/v1/auth/login')
    .send({ email: 'person@example.com', password: authPassword })
    .expect(401);
  expect(invalid.body as unknown).toMatchObject({ message: 'Credenciais inválidas.' });
  await request(server)
    .post('/api/v1/auth/request-email-verification')
    .send({ email: 'PERSON@example.com' })
    .expect(202);
  const token = code();
  await request(server).post('/api/v1/auth/verify-email').send({ token }).expect(204);
  await request(server).post('/api/v1/auth/verify-email').send({ token }).expect(400);
  const session = await login();
  await request(server)
    .get('/api/v1/dependents')
    .auth(session.accessToken, { type: 'bearer' })
    .expect(200);
});

test('recuperação não enumera e reset revoga todas as sessões sem login automático', async () => {
  const first = await start();
  const other = await login();
  const existing = await request(server)
    .post('/api/v1/auth/forgot-password')
    .send({ email: 'person@example.com' })
    .expect(202);
  const missing = await request(server)
    .post('/api/v1/auth/forgot-password')
    .send({ email: 'missing@example.com' })
    .expect(202);
  expect(existing.body).toEqual(missing.body);
  const token = code();
  const newPassword = 'Uma nova senha segura e extensa!';
  await request(server)
    .post('/api/v1/auth/reset-password')
    .send({ token, password: newPassword, passwordConfirmation: newPassword })
    .expect(204);
  await request(server)
    .post('/api/v1/auth/reset-password')
    .send({ token, password: newPassword, passwordConfirmation: newPassword })
    .expect(400);
  for (const accessToken of [first.accessToken, other.accessToken])
    await request(server).get('/api/v1/me').auth(accessToken, { type: 'bearer' }).expect(401);
  await request(server)
    .post('/api/v1/auth/refresh')
    .send({ refreshToken: first.refreshToken })
    .expect(401);
  await request(server)
    .post('/api/v1/auth/login')
    .send({ email: 'person@example.com', password: authPassword })
    .expect(401);
  expect((await login('person@example.com', newPassword)).user.id).toBe(first.user.id);
});

test('código reemitido, expirado ou de outra finalidade é inválido', async () => {
  await register();
  await request(server)
    .post('/api/v1/auth/request-email-verification')
    .send({ email: 'person@example.com' })
    .expect(202);
  const old = code();
  await request(server)
    .post('/api/v1/auth/request-email-verification')
    .send({ email: 'person@example.com' })
    .expect(202);
  await request(server).post('/api/v1/auth/verify-email').send({ token: old }).expect(400);
  const current = code();
  const row = [...fixture().foundation.auth.tokenRows.values()].find(
    (token) => token.purpose === 'EMAIL_VERIFICATION' && !token.revokedAt,
  );
  if (!row) throw new Error();
  fixture().foundation.auth.tokenRows.set(row.id, { ...row, expiresAt: new Date(0) });
  await request(server).post('/api/v1/auth/verify-email').send({ token: current }).expect(400);
  await request(server)
    .post('/api/v1/auth/reset-password')
    .send({ token: current, password: authPassword, passwordConfirmation: authPassword })
    .expect(400);
});

test('limite por identidade permanece mesmo mudando IP e não distingue emails existentes', async () => {
  const config = fixture().app.get(ConfigService);
  config.set('AUTH_LOGIN_IDENTITY_MAX', 2);
  config.set('TRUST_PROXY_HOPS', 1);
  // Não confia em header no middleware já criado; usa orçamento persistente também.
  for (let i = 0; i < 2; i++)
    await request(server)
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', '10.0.0.' + i)
      .send({ email: 'missing@example.com', password: 'wrong' })
      .expect(401);
  await request(server)
    .post('/api/v1/auth/login')
    .set('X-Forwarded-For', '10.0.0.20')
    .send({ email: 'missing@example.com', password: 'wrong' })
    .expect(429);
});

test.each([
  { path: 'refresh', body: { refreshToken: 'bad' } },
  { path: 'refresh', body: { refreshToken: 'rf_' + 'a'.repeat(43), userId: randomUUID() } },
  {
    path: 'verify-email',
    body: { token: 'ev_' + 'a'.repeat(43), emailVerifiedAt: new Date().toISOString() },
  },
  { path: 'forgot-password', body: { email: 'person@example.com', userId: randomUUID() } },
  {
    path: 'reset-password',
    body: { token: 'pr_' + 'a'.repeat(43), password: 'short', passwordConfirmation: 'short' },
  },
  {
    path: 'reset-password',
    body: {
      token: 'pr_' + 'a'.repeat(43),
      password: authPassword,
      passwordConfirmation: 'Outra senha longa de teste!',
    },
  },
])('DTO rejeita mass assignment e valida tokens/senhas %j', async ({ path, body }) => {
  await request(server)
    .post('/api/v1/auth/' + path)
    .send(body)
    .expect(400);
});

test('logout deriva sessão e usuário do guard, nunca do corpo; autenticação obrigatória', async () => {
  const session = await start();
  await request(server).post('/api/v1/auth/logout').expect(401);
  await request(server).post('/api/v1/auth/logout-all').expect(401);
  await request(server)
    .post('/api/v1/auth/logout')
    .auth(session.accessToken, { type: 'bearer' })
    .send({ sessionId: randomUUID() })
    .expect(400);
  await request(server).get('/api/v1/me').auth(session.accessToken, { type: 'bearer' }).expect(200);
});

test('auditoria e banco não contêm tokens/senhas, e falha de audit desfaz rotação', async () => {
  const session = await start();
  const state = fixture().foundation;
  jest
    .spyOn(state.auditLogs, 'append')
    .mockRejectedValueOnce(new Error('driver=secret-do-not-log'));
  const failed = await request(server)
    .post('/api/v1/auth/refresh')
    .send({ refreshToken: session.refreshToken })
    .expect(500);
  expect(JSON.stringify(failed.body)).not.toContain('secret-do-not-log');
  const retried = await request(server)
    .post('/api/v1/auth/refresh')
    .send({ refreshToken: session.refreshToken })
    .expect(200);
  sessionSchema.parse(retried.body);
  const serialized = JSON.stringify({
    sessions: [...state.auth.sessionRows.values()],
    refresh: [...state.auth.refreshRows.values()],
    audit: state.auditRows,
  });
  expect(serialized).not.toContain(session.accessToken);
  expect(serialized).not.toContain(session.refreshToken);
  expect(serialized).not.toContain(authPassword);
});
