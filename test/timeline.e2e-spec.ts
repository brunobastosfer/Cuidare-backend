import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import request from 'supertest';
import { z } from 'zod';
import {
  TIMELINE_SOURCES,
  type TimelineSource,
} from '../src/repository/timeline-source.repository';
import { RepositoryUnavailableError } from '../src/repository/errors/repository.error';
import { createTestApp } from './helpers/create-test-app';
import { syntheticEvent, syntheticSource } from './helpers/timeline-fixture';

const pageSchema = z
  .object({
    items: z.array(
      z
        .object({
          id: z.string(),
          dependentId: z.uuid(),
          type: z.literal('DEPENDENT_CREATED'),
          title: z.string(),
          eventDate: z.string(),
          summary: z.string().nullable(),
          sourceId: z.uuid(),
          sourceType: z.string(),
          createdAt: z.string(),
        })
        .strict(),
    ),
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
  })
  .strict();
const sessionSchema = z.object({ accessToken: z.string(), user: z.object({ id: z.uuid() }) });
const password = 'Senha exclusiva para fixture timeline!';
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
async function register(email = 'timeline-owner@example.com') {
  await request(server)
    .post('/api/v1/auth/register')
    .send({ name: 'Fixture', email, password })
    .expect(202);
  const response = await request(server)
    .post('/api/v1/auth/login')
    .send({ email, password })
    .expect(200);
  return sessionSchema.parse(response.body);
}
async function dependent(token: string) {
  const response = await request(server)
    .post('/api/v1/dependents')
    .auth(token, { type: 'bearer' })
    .send({
      fullName: 'Nome sensível fictício não expor',
      preferredName: 'Não expor',
      birthDate: '2020-02-29',
    })
    .expect(201);
  return z.object({ id: z.uuid(), createdAt: z.string() }).parse(response.body);
}
function path(id: string) {
  return '/api/v1/dependents/' + id + '/timeline';
}
function addFixtures(dependentId: string) {
  const rows = [1, 2, 3].map((n) => syntheticEvent(dependentId, 'TEST_A', n));
  const source = syntheticSource('TEST_A', rows);
  current().app.get<TimelineSource[]>(TIMELINE_SOURCES).push(source);
  return { rows, source };
}
test('fluxo mínimo real: cadastro do dependente aparece sem nome/nascimento/autor, cache privado e erro padronizado', async () => {
  const session = await register();
  const child = await dependent(session.accessToken);
  const response = await request(server)
    .get(path(child.id))
    .auth(session.accessToken, { type: 'bearer' })
    .expect(200);
  expect(pageSchema.parse(response.body)).toEqual({
    items: [
      {
        id: 'dependent-created:' + child.id,
        dependentId: child.id,
        type: 'DEPENDENT_CREATED',
        title: 'Dependente cadastrado',
        eventDate: child.createdAt,
        summary: null,
        sourceId: child.id,
        sourceType: 'DEPENDENT',
        createdAt: child.createdAt,
      },
    ],
    nextCursor: null,
    hasMore: false,
  });
  expect(response.headers['cache-control']).toBe('no-store');
  expect(response.headers['x-content-type-options']).toBe('nosniff');
  expect(JSON.stringify(response.body)).not.toContain('2020-02-29');
  expect(JSON.stringify(response.body)).not.toContain('Nome sensível');
  expect(JSON.stringify(response.body)).not.toContain(session.user.id);
  await request(server).get(path(child.id)).expect(401);
  await request(server)
    .post(path(child.id))
    .auth(session.accessToken, { type: 'bearer' })
    .send({ title: 'Não criar' })
    .expect(404);
});
test('nega A/B e ID desconhecido com a mesma mensagem', async () => {
  const owner = await register();
  const other = await register('timeline-other@example.com');
  const child = await dependent(owner.accessToken);
  const denied = await request(server)
    .get(path(child.id))
    .auth(other.accessToken, { type: 'bearer' })
    .expect(404);
  const missing = await request(server)
    .get(path(randomUUID()))
    .auth(other.accessToken, { type: 'bearer' })
    .expect(404);
  expect(z.object({ message: z.string() }).parse(denied.body).message).toBe(
    z.object({ message: z.string() }).parse(missing.body).message,
  );
});
test.each(['EDITOR', 'VIEWER'] as const)(
  'leitura %s termina com revogação do vínculo',
  async (role) => {
    const owner = await register();
    const other = await register('timeline-other@example.com');
    const child = await dependent(owner.accessToken);
    const access = await current().foundation.dependentAccess.create({
      userId: other.user.id,
      dependentId: child.id,
      role,
      relationship: null,
    });
    await request(server)
      .get(path(child.id))
      .auth(other.accessToken, { type: 'bearer' })
      .expect(200);
    current().foundation.accessRows.set(access.id, { ...access, revokedAt: new Date() });
    await request(server)
      .get(path(child.id))
      .auth(other.accessToken, { type: 'bearer' })
      .expect(404);
  },
);
test('soft delete do dependente, conta bloqueada e sessão revogada impedem a timeline', async () => {
  const session = await register();
  const child = await dependent(session.accessToken);
  await request(server)
    .delete('/api/v1/dependents/' + child.id)
    .auth(session.accessToken, { type: 'bearer' })
    .expect(204);
  await request(server)
    .get(path(child.id))
    .auth(session.accessToken, { type: 'bearer' })
    .expect(404);
  const user = await current().users.findById(session.user.id);
  if (!user) throw new Error('Usuário ausente');
  current().users.rows.set(user.email, { ...user, status: 'BLOCKED' });
  await request(server)
    .get(path(child.id))
    .auth(session.accessToken, { type: 'bearer' })
    .expect(401);
  current().users.rows.set(user.email, user);
  await request(server)
    .post('/api/v1/auth/logout')
    .auth(session.accessToken, { type: 'bearer' })
    .send({})
    .expect(204);
  await request(server)
    .get(path(child.id))
    .auth(session.accessToken, { type: 'bearer' })
    .expect(401);
});
test.each(['asc', 'desc'] as const)(
  'página HTTP %s agrega fontes sintéticas, empates, filtro e limite',
  async (order) => {
    const session = await register();
    const child = await dependent(session.accessToken);
    const { rows } = addFixtures(child.id);
    const query = {
      order,
      limit: 1,
      from: '2026-01-01T00:00:00Z',
      to: '2026-01-01T00:00:00Z',
      type: 'DEPENDENT_CREATED',
    };
    const ids: string[] = [];
    let cursor: string | undefined;
    do {
      const response = await request(server)
        .get(path(child.id))
        .query({ ...query, ...(cursor ? { cursor } : {}) })
        .auth(session.accessToken, { type: 'bearer' })
        .expect(200);
      const page = pageSchema.parse(response.body);
      ids.push(...page.items.map((event) => event.id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    const expected = rows.map((event) => event.id);
    expect(ids).toEqual(order === 'asc' ? expected : expected.reverse());
  },
);
test('recusa cursor alterado/outro usuário/outro dependente/filtros; cursor não permite acesso revogado', async () => {
  const owner = await register();
  const other = await register('timeline-other@example.com');
  const a = await dependent(owner.accessToken);
  const b = await dependent(owner.accessToken);
  addFixtures(a.id);
  const access = await current().foundation.dependentAccess.create({
    userId: other.user.id,
    dependentId: a.id,
    role: 'VIEWER',
    relationship: null,
  });
  const first = await request(server)
    .get(path(a.id))
    .query({ limit: 1, order: 'asc' })
    .auth(owner.accessToken, { type: 'bearer' })
    .expect(200);
  const cursor = pageSchema.parse(first.body).nextCursor!;
  await request(server)
    .get(path(a.id))
    .query({ cursor, order: 'asc' })
    .auth(other.accessToken, { type: 'bearer' })
    .expect(400);
  await request(server)
    .get(path(b.id))
    .query({ cursor, order: 'asc' })
    .auth(owner.accessToken, { type: 'bearer' })
    .expect(400);
  await request(server)
    .get(path(a.id))
    .query({ cursor, order: 'desc' })
    .auth(owner.accessToken, { type: 'bearer' })
    .expect(400);
  const parts = cursor.split('.');
  const tampered =
    'tl1.' + parts[1] + '.' + (parts[2]!.startsWith('A') ? 'B' : 'A') + parts[2]!.slice(1);
  await request(server)
    .get(path(a.id))
    .query({ cursor: tampered, order: 'asc' })
    .auth(owner.accessToken, { type: 'bearer' })
    .expect(400);
  const ownerAccess = Array.from(current().foundation.accessRows.values()).find(
    (row) => row.userId === owner.user.id && row.dependentId === a.id,
  )!;
  current().foundation.accessRows.set(ownerAccess.id, { ...ownerAccess, revokedAt: new Date() });
  await request(server)
    .get(path(a.id))
    .query({ cursor, order: 'asc' })
    .auth(owner.accessToken, { type: 'bearer' })
    .expect(404);
  expect(current().foundation.accessRows.get(access.id)?.revokedAt).toBeNull();
});
test.each([
  { limit: '0' },
  { limit: '101' },
  { limit: '1.5' },
  { limit: '' },
  { limit: 'NaN' },
  { limit: ['1', '2'] },
  { order: 'sideways' },
  { type: 'MEDICAL_PAYLOAD' },
  { type: ['DEPENDENT_CREATED', 'DEPENDENT_CREATED'] },
  { from: '2026-01-01' },
  { from: '2026-02-29T00:00:00Z' },
  { from: '2026-01-01T25:00:00Z' },
  { from: '2026-01-01T00:00:00-03:00' },
  { from: '2026-01-01T00:00:00' },
  { from: '2026-02-01T00:00:00Z', to: '2026-01-01T00:00:00Z' },
  { cursor: 'not-a-cursor' },
  { cursor: 'x'.repeat(1025) },
  { offset: 1 },
  { userId: randomUUID() },
  { dependentId: randomUUID() },
  { role: 'OWNER' },
])('validação recusa query inválida/assignment %j', async (query) => {
  const session = await register();
  const child = await dependent(session.accessToken);
  await request(server)
    .get(path(child.id))
    .query(query)
    .auth(session.accessToken, { type: 'bearer' })
    .expect(400);
});
test('período fora do cadastro retorna página vazia; UUID inválido retorna 400', async () => {
  const session = await register();
  const child = await dependent(session.accessToken);
  const empty = await request(server)
    .get(path(child.id))
    .query({ to: '2020-01-01T00:00:00Z' })
    .auth(session.accessToken, { type: 'bearer' })
    .expect(200);
  expect(pageSchema.parse(empty.body)).toEqual({ items: [], nextCursor: null, hasMore: false });
  await request(server)
    .get(path('not-uuid'))
    .auth(session.accessToken, { type: 'bearer' })
    .expect(400);
});
test('fonte falha sem retorno parcial e sem vazar mensagens internas', async () => {
  const session = await register();
  const child = await dependent(session.accessToken);
  const { source } = addFixtures(child.id);
  jest.spyOn(source, 'list').mockRejectedValue(new Error('sensitive-driver-content'));
  const failure = await request(server)
    .get(path(child.id))
    .auth(session.accessToken, { type: 'bearer' })
    .expect(500);
  expect(JSON.stringify(failure.body)).not.toContain('sensitive-driver-content');
  expect(z.object({ requestId: z.string(), message: z.string() }).parse(failure.body).message).toBe(
    'Erro interno. Tente novamente.',
  );
  jest.spyOn(source, 'list').mockRejectedValue(new RepositoryUnavailableError());
  await request(server)
    .get(path(child.id))
    .auth(session.accessToken, { type: 'bearer' })
    .expect(503);
});
