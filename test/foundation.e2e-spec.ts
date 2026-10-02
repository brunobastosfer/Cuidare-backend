import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { z } from 'zod';
import { createTestApp } from './helpers/create-test-app';
import { RepositoryUnavailableError } from '../src/repository/errors/repository.error';

const sessionSchema = z
  .object({
    accessToken: z.string(),
    tokenType: z.literal('Bearer'),
    expiresIn: z.number(),
    refreshToken: z.string(),
    refreshExpiresIn: z.number(),
    user: z
      .object({ id: z.uuid(), name: z.string(), email: z.string(), createdAt: z.string() })
      .strict(),
  })
  .strict();
const dependentSchema = z
  .object({
    id: z.uuid(),
    fullName: z.string(),
    preferredName: z.string().nullable(),
    birthDate: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();
const consentSchema = z
  .object({
    id: z.uuid(),
    dependentId: z.uuid().nullable(),
    type: z.string(),
    policyVersion: z.string(),
    acceptedAt: z.string(),
    revokedAt: z.string().nullable(),
  })
  .strict();
const password = 'Senha longa exclusiva para testes!';
let fixtures: Awaited<ReturnType<typeof createTestApp>> | undefined;
let server: Server;
beforeEach(async () => {
  fixtures = await createTestApp();
  server = fixtures.app.getHttpServer();
});
afterEach(async () => {
  await fixtures?.app.close();
  fixtures = undefined;
});
function current() {
  if (!fixtures) throw new Error('Fixture ausente');
  return fixtures;
}
async function register(email = 'owner@example.com') {
  const registration = await request(server)
    .post('/api/v1/auth/register')
    .send({ name: 'Responsável fictício', email, password })
    .expect(202);
  expect(registration.body).toEqual({ message: 'Solicitação recebida.' });
  const response = await request(server)
    .post('/api/v1/auth/login')
    .send({ email, password })
    .expect(200);
  return sessionSchema.parse(response.body);
}
async function createDependent(token: string) {
  const response = await request(server)
    .post('/api/v1/dependents')
    .auth(token, { type: 'bearer' })
    .send({
      fullName: 'Dependente fictício',
      preferredName: 'Apelido',
      birthDate: '2020-02-29',
      relationship: 'PARENT',
    })
    .expect(201);
  return dependentSchema.parse(response.body);
}
const accountConsent = { type: 'TEST_NOTICE', policyVersion: 'v1' };
const dependentConsent = { type: 'TEST_DEPENDENT', policyVersion: 'v1' };

test('perfil e sessões retornam apenas campos públicos; cadastro registra audit sem dados pessoais', async () => {
  const session = await register();
  const response = await request(server)
    .get('/api/v1/me')
    .auth(session.accessToken, { type: 'bearer' })
    .expect(200);
  expect(response.body).toEqual(session.user);
  const stored = await current().users.findById(session.user.id);
  expect(stored).toMatchObject({ status: 'ACTIVE', emailVerifiedAt: null, deletedAt: null });
  expect(stored?.updatedAt).toBeInstanceOf(Date);
  expect(current().foundation.auditRows.filter((row) => row.action === 'USER_CREATED')).toEqual([
    {
      actorId: session.user.id,
      action: 'USER_CREATED',
      resourceType: 'USER',
      resourceId: session.user.id,
      dependentId: null,
      metadata: {},
    },
  ]);
  const login = await request(server)
    .post('/api/v1/auth/login')
    .send({ email: session.user.email, password })
    .expect(200);
  sessionSchema.parse(login.body);
});

test.each(['blocked', 'deleted', 'missing'])(
  'JWT de conta %s é recusado e email excluído permanece reservado',
  async (state) => {
    const session = await register();
    const f = current();
    const user = await f.users.findById(session.user.id);
    if (!user) throw new Error('Missing user');
    if (state === 'missing') f.users.rows.delete(user.email);
    else
      f.users.rows.set(user.email, {
        ...user,
        ...(state === 'blocked' ? { status: 'BLOCKED' as const } : { deletedAt: new Date() }),
      });
    await request(server)
      .get('/api/v1/me')
      .auth(session.accessToken, { type: 'bearer' })
      .expect(401);
    await request(server)
      .get('/api/v1/dependents')
      .auth(session.accessToken, { type: 'bearer' })
      .expect(401);
    await request(server)
      .post('/api/v1/auth/login')
      .send({ email: session.user.email, password })
      .expect(401);
    if (state === 'deleted')
      await request(server)
        .post('/api/v1/auth/register')
        .send({ name: 'Outra pessoa', email: session.user.email, password })
        .expect(202);
  },
);

test('JWT assinado com subject inexistente não autoriza criação', async () => {
  const token = await current().app.get(JwtService).signAsync({ sub: randomUUID() });
  await request(server)
    .post('/api/v1/dependents')
    .auth(token, { type: 'bearer' })
    .send({ fullName: 'Teste', birthDate: '2020-01-01' })
    .expect(401);
});

test('isola dependentes A/B em lista, leitura, alteração, exclusão e consentimento', async () => {
  const alice = await register();
  const bob = await register('bob@example.com');
  const a = await createDependent(alice.accessToken);
  const b = await createDependent(bob.accessToken);
  const list = await request(server)
    .get('/api/v1/dependents')
    .auth(bob.accessToken, { type: 'bearer' })
    .expect(200);
  expect(z.array(dependentSchema).parse(list.body)).toEqual([b]);
  const path = '/api/v1/dependents/' + a.id;
  await request(server).get(path).auth(bob.accessToken, { type: 'bearer' }).expect(404);
  await request(server)
    .patch(path)
    .auth(bob.accessToken, { type: 'bearer' })
    .send({ fullName: 'Não autorizado' })
    .expect(404);
  await request(server).delete(path).auth(bob.accessToken, { type: 'bearer' }).expect(404);
  await request(server)
    .post('/api/v1/consents')
    .auth(bob.accessToken, { type: 'bearer' })
    .send({ ...dependentConsent, dependentId: a.id })
    .expect(404);
  await request(server)
    .get('/api/v1/dependents/' + randomUUID())
    .auth(bob.accessToken, { type: 'bearer' })
    .expect(404);
  expect((await current().foundation.dependents.findForUser(a.id, alice.user.id))?.fullName).toBe(
    a.fullName,
  );
});

test.each(['EDITOR', 'VIEWER'] as const)(
  'papel %s respeita permissões e revogação do vínculo',
  async (role) => {
    const owner = await register();
    const other = await register('other@example.com');
    const dependent = await createDependent(owner.accessToken);
    const access = await current().foundation.dependentAccess.create({
      userId: other.user.id,
      dependentId: dependent.id,
      role,
      relationship: null,
    });
    const path = '/api/v1/dependents/' + dependent.id;
    await request(server).get(path).auth(other.accessToken, { type: 'bearer' }).expect(200);
    await request(server)
      .patch(path)
      .auth(other.accessToken, { type: 'bearer' })
      .send({ preferredName: 'Nome novo' })
      .expect(role === 'EDITOR' ? 200 : 404);
    await request(server).delete(path).auth(other.accessToken, { type: 'bearer' }).expect(404);
    await request(server)
      .post('/api/v1/consents')
      .auth(other.accessToken, { type: 'bearer' })
      .send({ ...dependentConsent, dependentId: dependent.id })
      .expect(404);
    current().foundation.accessRows.set(access.id, { ...access, revokedAt: new Date() });
    await request(server).get(path).auth(other.accessToken, { type: 'bearer' }).expect(404);
    const list = await request(server)
      .get('/api/v1/dependents')
      .auth(other.accessToken, { type: 'bearer' })
      .expect(200);
    expect(list.body).toEqual([]);
  },
);

test('update parcial, consentimentos e exclusão lógica preservam histórico sem expor metadados internos', async () => {
  const owner = await register();
  const dependent = await createDependent(owner.accessToken);
  const path = '/api/v1/dependents/' + dependent.id;
  const updated = await request(server)
    .patch(path)
    .auth(owner.accessToken, { type: 'bearer' })
    .send({ preferredName: null })
    .expect(200);
  expect(dependentSchema.parse(updated.body)).toMatchObject({
    fullName: dependent.fullName,
    preferredName: null,
    birthDate: '2020-02-29',
  });
  const account = await request(server)
    .post('/api/v1/consents')
    .auth(owner.accessToken, { type: 'bearer' })
    .send(accountConsent)
    .expect(201);
  const child = await request(server)
    .post('/api/v1/consents')
    .auth(owner.accessToken, { type: 'bearer' })
    .send({ ...dependentConsent, dependentId: dependent.id })
    .expect(201);
  const accountRecord = consentSchema.parse(account.body);
  consentSchema.parse(child.body);
  const other = await register('other@example.com');
  const otherList = await request(server)
    .get('/api/v1/consents')
    .auth(other.accessToken, { type: 'bearer' })
    .expect(200);
  expect(otherList.body).toEqual([]);
  await request(server).delete(path).auth(owner.accessToken, { type: 'bearer' }).expect(204);
  await request(server).get(path).auth(owner.accessToken, { type: 'bearer' }).expect(404);
  await request(server)
    .patch(path)
    .auth(owner.accessToken, { type: 'bearer' })
    .send({ fullName: 'Não restaurar' })
    .expect(404);
  await request(server).delete(path).auth(owner.accessToken, { type: 'bearer' }).expect(404);
  const list = await request(server)
    .get('/api/v1/dependents')
    .auth(owner.accessToken, { type: 'bearer' })
    .expect(200);
  expect(list.body).toEqual([]);
  const consents = await request(server)
    .get('/api/v1/consents')
    .auth(owner.accessToken, { type: 'bearer' })
    .expect(200);
  expect(z.array(consentSchema).parse(consents.body)).toEqual([accountRecord]);
  expect(current().foundation.consentRows.size).toBe(2);
  expect(current().foundation.dependentRows.get(dependent.id)?.deletedAt).toBeInstanceOf(Date);
  const serialized = JSON.stringify(current().foundation.auditRows);
  expect(serialized).not.toContain('Dependente fictício');
  expect(serialized).not.toContain('2020-02-29');
  expect(serialized).not.toContain(password);
  expect(serialized).not.toContain(owner.accessToken);
  expect(current().foundation.auditRows).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        action: 'DEPENDENT_UPDATED',
        metadata: { changedFields: ['preferredName'] },
      }),
      expect.objectContaining({ action: 'DEPENDENT_DELETED', metadata: {} }),
    ]),
  );
});

test.each([
  { birthDate: '2021-02-29' },
  { birthDate: '9999-01-01' },
  { birthDate: null },
  { birthDate: '2020-01-01T00:00:00Z' },
  { fullName: null },
  { preferredName: 123 },
  { createdByUserId: randomUUID() },
  { role: 'OWNER' },
  { relationship: 'ADMIN' },
  { deletedAt: '2020-01-01' },
])('validação recusa datas inválidas e mass assignment %j', async (extra) => {
  const owner = await register();
  await request(server)
    .post('/api/v1/dependents')
    .auth(owner.accessToken, { type: 'bearer' })
    .send({ fullName: 'Pessoa fictícia', birthDate: '2020-01-01', ...extra })
    .expect(400);
  expect(current().foundation.dependentRows.size).toBe(0);
});

test.each([
  {},
  { fullName: null },
  { birthDate: null },
  { birthDate: '2023-02-29' },
  { role: 'OWNER' },
  { relationship: 'PARENT' },
  { createdByUserId: randomUUID() },
])('patch recusa payload %j', async (payload) => {
  const owner = await register();
  const dependent = await createDependent(owner.accessToken);
  await request(server)
    .patch('/api/v1/dependents/' + dependent.id)
    .auth(owner.accessToken, { type: 'bearer' })
    .send(payload)
    .expect(400);
});

test.each([
  { type: 'UNKNOWN', policyVersion: 'v1' },
  { ...accountConsent, policyVersion: 'v0' },
  dependentConsent,
  { ...accountConsent, dependentId: randomUUID() },
  { ...accountConsent, userId: randomUUID() },
  { ...accountConsent, metadata: { secret: 'not-accepted' } },
  { ...accountConsent, acceptedAt: '2020-01-01' },
  { ...accountConsent, dependentId: null },
])('aceite recusa política, escopo ou propriedade não permitida %j', async (payload) => {
  const owner = await register();
  await request(server)
    .post('/api/v1/consents')
    .auth(owner.accessToken, { type: 'bearer' })
    .send(payload)
    .expect(400);
  expect(current().foundation.consentRows.size).toBe(0);
});

test('políticas desativadas recusam aceites sem presumir base legal', async () => {
  const owner = await register();
  current().app.get(ConfigService).set('CONSENT_POLICIES', {});
  await request(server)
    .post('/api/v1/consents')
    .auth(owner.accessToken, { type: 'bearer' })
    .send(accountConsent)
    .expect(400);
});

test('rollback completo se auditoria falhar no cadastro, dependente ou consentimento', async () => {
  const owner = await register();
  const dependent = await createDependent(owner.accessToken);
  const f = current();
  jest
    .spyOn(f.foundation.auditLogs, 'append')
    .mockRejectedValue(new Error('unavailable-audit-driver'));
  await request(server)
    .post('/api/v1/auth/register')
    .send({ name: 'Outra pessoa', email: 'rollback@example.com', password })
    .expect(500);
  expect(await f.users.findByEmail('rollback@example.com')).toBeNull();
  await request(server)
    .post('/api/v1/dependents')
    .auth(owner.accessToken, { type: 'bearer' })
    .send({ fullName: 'Não persistir', birthDate: '2020-01-01' })
    .expect(500);
  expect(f.foundation.dependentRows.size).toBe(1);
  expect(f.foundation.accessRows.size).toBe(1);
  await request(server)
    .patch('/api/v1/dependents/' + dependent.id)
    .auth(owner.accessToken, { type: 'bearer' })
    .send({ fullName: 'Não persistir' })
    .expect(500);
  await request(server)
    .delete('/api/v1/dependents/' + dependent.id)
    .auth(owner.accessToken, { type: 'bearer' })
    .expect(500);
  expect(f.foundation.dependentRows.get(dependent.id)).toMatchObject({
    fullName: dependent.fullName,
    deletedAt: null,
  });
  await request(server)
    .post('/api/v1/consents')
    .auth(owner.accessToken, { type: 'bearer' })
    .send(accountConsent)
    .expect(500);
  expect(f.foundation.consentRows.size).toBe(0);
  expect(f.foundation.auditRows).toHaveLength(3);
});

test('falha ao consultar usuário no guard mantém erro 503, sem mascarar como JWT inválido', async () => {
  const owner = await register();
  jest.spyOn(current().users, 'findById').mockRejectedValueOnce(new RepositoryUnavailableError());
  await request(server).get('/api/v1/me').auth(owner.accessToken, { type: 'bearer' }).expect(503);
});

test('novas rotas exigem autenticação, limitam paginação e não disponibilizam audit/access públicos', async () => {
  for (const path of ['me', 'dependents', 'consents'])
    await request(server)
      .get('/api/v1/' + path)
      .expect(401);
  const owner = await register();
  for (const path of ['dependents', 'consents']) {
    await request(server)
      .get('/api/v1/' + path + '?limit=101')
      .auth(owner.accessToken, { type: 'bearer' })
      .expect(400);
    await request(server)
      .get('/api/v1/' + path + '?offset=-1')
      .auth(owner.accessToken, { type: 'bearer' })
      .expect(400);
  }
  await request(server)
    .get('/api/v1/dependents/not-uuid')
    .auth(owner.accessToken, { type: 'bearer' })
    .expect(400);
  await request(server)
    .get('/api/v1/audit-logs')
    .auth(owner.accessToken, { type: 'bearer' })
    .expect(404);
  await request(server)
    .post('/api/v1/dependents/' + randomUUID() + '/access')
    .auth(owner.accessToken, { type: 'bearer' })
    .send({ role: 'OWNER' })
    .expect(404);
});
