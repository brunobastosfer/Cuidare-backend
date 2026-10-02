import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { z } from 'zod';
import { createTestApp } from './helpers/create-test-app';

const sessionSchema = z.object({
  accessToken: z.string(),
  tokenType: z.literal('Bearer'),
  expiresIn: z.number(),
  user: z.object({ id: z.uuid(), name: z.string(), email: z.string() }),
});
const taskSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  description: z.string(),
  completed: z.boolean(),
});
const errorSchema = z.object({
  statusCode: z.number(),
  message: z.union([z.string(), z.array(z.string())]),
  requestId: z.string(),
});
const password = 'Uma senha segura para testes!';

let app: NestExpressApplication;
let server: Server;
let fixtures: Awaited<ReturnType<typeof createTestApp>>;

beforeEach(async () => {
  fixtures = await createTestApp();
  app = fixtures.app;
  server = app.getHttpServer();
});
afterEach(async () => {
  if (app) await app.close();
});

async function register(email = 'alice@example.com') {
  const registration = await request(server)
    .post('/api/v1/auth/register')
    .send({ name: 'Alice', email, password })
    .expect(202);
  expect(registration.body).toEqual({ message: 'Solicitação recebida.' });
  const response = await request(server)
    .post('/api/v1/auth/login')
    .send({ email, password })
    .expect(200);
  // Inspeciona o JSON bruto ANTES do parse Zod, que pode retirar campos extras.
  expect(Object.keys((response.body as { user: object }).user).sort()).toEqual([
    'createdAt',
    'email',
    'id',
    'name',
  ]);
  expect(JSON.stringify(response.body)).not.toContain('passwordHash');
  return sessionSchema.parse(response.body);
}

async function createTask(token: string) {
  const response = await request(server)
    .post('/api/v1/care-tasks')
    .auth(token, { type: 'bearer' })
    .send({ title: 'Conversar', description: 'Combinar um horário.' })
    .expect(201);
  return taskSchema.parse(response.body);
}

test('health público inclui headers de segurança e correlação', async () => {
  const response = await request(server).get('/api/v1/health').expect(200);
  expect(response.body).toEqual({ status: 'ok' });
  expect(response.headers['x-content-type-options']).toBe('nosniff');
  expect(response.headers['x-frame-options']).toBe('DENY');
  expect(response.headers['cache-control']).toBe('no-store');
  expect(response.headers['x-powered-by']).toBeUndefined();
  expect(response.headers['x-request-id']).toEqual(expect.any(String));
  expect(response.headers['content-security-policy']).toEqual(expect.any(String));
});

test('cadastra, normaliza email e não retorna senha ou hash', async () => {
  const session = await register(' Alice@Example.com ');
  expect(session.user.email).toBe('alice@example.com');
  expect(session.expiresIn).toBe(900);
  const stored = await fixtures.users.findByEmail(session.user.email);
  expect(stored?.passwordHash).toMatch(/^\$argon2id/);
  expect(JSON.stringify(session.user)).not.toContain('password');
  const response = await request(server)
    .post('/api/v1/auth/login')
    .send({ email: 'ALICE@example.com', password })
    .expect(200);
  expect(sessionSchema.parse(response.body).user.id).toBe(session.user.id);
});

test('credenciais inválidas usam a mesma mensagem para usuário existente e inexistente', async () => {
  await register();
  const existing = await request(server)
    .post('/api/v1/auth/login')
    .send({ email: 'alice@example.com', password: 'wrong' })
    .expect(401);
  const missing = await request(server)
    .post('/api/v1/auth/login')
    .send({ email: 'missing@example.com', password: 'wrong' })
    .expect(401);
  expect(errorSchema.parse(existing.body).message).toBe('Credenciais inválidas.');
  expect(errorSchema.parse(missing.body).message).toBe('Credenciais inválidas.');
});

test('cadastro duplicado usa resposta neutra sem trocar senha ou expor existência', async () => {
  await register();
  const response = await request(server)
    .post('/api/v1/auth/register')
    .send({ name: 'Alice', email: 'alice@example.com', password })
    .expect(202);
  expect(response.body).toEqual({ message: 'Solicitação recebida.' });
});

test.each([
  { name: 'Alice', email: 'alice@example.com', password: 'short' },
  { name: 'Alice', email: 'not-email', password },
  { name: 'Alice', email: 'alice@example.com', password, role: 'ADMIN' },
])('valida cadastro e rejeita atribuição de campos extras: %j', async (payload) => {
  await request(server).post('/api/v1/auth/register').send(payload).expect(400);
});

test('rotas privadas exigem autenticação', async () => {
  await request(server).get('/api/v1/care-tasks').expect(401);
  await request(server).get('/api/v1/care-tasks').auth('forged', { type: 'bearer' }).expect(401);
});

test.each(['expired', 'audience', 'issuer', 'algorithm'])(
  'recusa JWT com %s incorreto',
  async (mode) => {
    const session = await register();
    const jwt = new JwtService();
    const claims = z
      .object({ sid: z.uuid(), cv: z.number() })
      .parse(app.get(JwtService).decode(session.accessToken));
    const token = await jwt.signAsync(
      { sub: session.user.id, sid: claims.sid, cv: claims.cv, tokenUse: 'access' },
      {
        secret: app.get(ConfigService).getOrThrow<string>('JWT_SECRET'),
        algorithm: mode === 'algorithm' ? 'HS384' : 'HS256',
        expiresIn: mode === 'expired' ? -1 : 900,
        audience: mode === 'audience' ? 'other-app' : 'cuidare-app',
        issuer: mode === 'issuer' ? 'other-backend' : 'cuidare-backend',
      },
    );
    await request(server).get('/api/v1/care-tasks').auth(token, { type: 'bearer' }).expect(401);
  },
);

test.each(['missing-expiration', 'invalid-subject'])(
  'recusa JWT com claims inválidos: %s',
  async (mode) => {
    const session = await register();
    const claims = z
      .object({ sid: z.uuid(), cv: z.number() })
      .parse(app.get(JwtService).decode(session.accessToken));
    const jwt = new JwtService();
    const token = await jwt.signAsync(
      {
        sub: mode === 'invalid-subject' ? 'not-a-user-id' : session.user.id,
        sid: claims.sid,
        cv: claims.cv,
        tokenUse: 'access',
      },
      {
        secret: app.get(ConfigService).getOrThrow<string>('JWT_SECRET'),
        algorithm: 'HS256',
        ...(mode === 'missing-expiration' ? {} : { expiresIn: 900 }),
        audience: 'cuidare-app',
        issuer: 'cuidare-backend',
      },
    );
    await request(server).get('/api/v1/care-tasks').auth(token, { type: 'bearer' }).expect(401);
  },
);

test('CRUD de cuidados usa o proprietário autenticado e preserva o contrato do app', async () => {
  const { accessToken } = await register();
  const task = await createTask(accessToken);
  const list = await request(server)
    .get('/api/v1/care-tasks')
    .auth(accessToken, { type: 'bearer' })
    .expect(200);
  expect(z.array(taskSchema).parse(list.body)).toEqual([task]);
  expect(JSON.stringify(list.body)).not.toContain('ownerId');
  const update = await request(server)
    .patch(`/api/v1/care-tasks/${task.id}`)
    .auth(accessToken, { type: 'bearer' })
    .send({ completed: true })
    .expect(200);
  expect(taskSchema.parse(update.body).completed).toBe(true);
  await request(server)
    .delete(`/api/v1/care-tasks/${task.id}`)
    .auth(accessToken, { type: 'bearer' })
    .expect(204);
  await request(server)
    .get(`/api/v1/care-tasks/${task.id}`)
    .auth(accessToken, { type: 'bearer' })
    .expect(404);
});

test('um usuário não pode ler, editar ou excluir cuidados de outro', async () => {
  const alice = await register();
  const bob = await register('bob@example.com');
  const task = await createTask(alice.accessToken);
  const path = `/api/v1/care-tasks/${task.id}`;
  await request(server).get(path).auth(bob.accessToken, { type: 'bearer' }).expect(404);
  await request(server)
    .patch(path)
    .auth(bob.accessToken, { type: 'bearer' })
    .send({ completed: true })
    .expect(404);
  await request(server).delete(path).auth(bob.accessToken, { type: 'bearer' }).expect(404);
  const list = await request(server)
    .get('/api/v1/care-tasks')
    .auth(bob.accessToken, { type: 'bearer' })
    .expect(200);
  expect(list.body).toEqual([]);
  const unchanged = await request(server)
    .get(path)
    .auth(alice.accessToken, { type: 'bearer' })
    .expect(200);
  expect(taskSchema.parse(unchanged.body).completed).toBe(false);
});

test.each([{ completed: 'true' }, { completed: null }, { ownerId: randomUUID() }, {}])(
  'rejeita payload inválido ou tentativa de alterar proprietário: %j',
  async (payload) => {
    const { accessToken } = await register();
    const task = await createTask(accessToken);
    await request(server)
      .patch(`/api/v1/care-tasks/${task.id}`)
      .auth(accessToken, { type: 'bearer' })
      .send(payload)
      .expect(400);
  },
);

test('valida UUID e limita a paginação', async () => {
  const { accessToken } = await register();
  await request(server)
    .get('/api/v1/care-tasks/not-uuid')
    .auth(accessToken, { type: 'bearer' })
    .expect(400);
  await request(server)
    .get('/api/v1/care-tasks?limit=1000')
    .auth(accessToken, { type: 'bearer' })
    .expect(400);
});

test('aplica CORS com lista explícita e permite clientes nativos sem Origin', async () => {
  const allowed = await request(server)
    .get('/api/v1/health')
    .set('Origin', 'http://localhost:8081')
    .expect(200);
  expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:8081');
  await request(server).get('/api/v1/health').set('Origin', 'https://evil.example').expect(403);
});

test('limita força bruta e não confia em X-Forwarded-For por padrão', async () => {
  for (let index = 0; index < 5; index++) {
    await request(server)
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', `10.0.0.${index + 1}`)
      .send({ email: 'missing@example.com', password: 'wrong' })
      .expect(401);
  }
  await request(server)
    .post('/api/v1/auth/login')
    .set('X-Forwarded-For', '10.0.0.100')
    .send({ email: 'missing@example.com', password: 'wrong' })
    .expect(429);
});

test('rejeita JSON malformado e payload muito grande', async () => {
  await request(server)
    .post('/api/v1/auth/login')
    .set('Content-Type', 'application/json')
    .send('{ invalid')
    .expect(400);
  await request(server)
    .post('/api/v1/auth/login')
    .send({ padding: 'x'.repeat(40000) })
    .expect(413);
});

test('erro inesperado não expõe SQL, stack ou segredos', async () => {
  const { accessToken } = await register();
  jest
    .spyOn(fixtures.tasks, 'listByOwner')
    .mockRejectedValueOnce(new Error('SELECT password_hash; secret=private-token'));
  const response = await request(server)
    .get('/api/v1/care-tasks')
    .auth(accessToken, { type: 'bearer' })
    .expect(500);
  expect(errorSchema.parse(response.body).message).toBe('Erro interno. Tente novamente.');
  expect(JSON.stringify(response.body)).not.toContain('private-token');
  expect(JSON.stringify(response.body)).not.toContain('stack');
});
