import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { z } from 'zod';
import { createTestApp } from './helpers/create-test-app';
import { authPassword } from './helpers/auth-fixture';
import { medicationSchema, medicationTreatmentSchema } from './helpers/medication-schemas';
import { appointmentSchema, recommendationSchema } from './helpers/appointment-schemas';
import { documentSchema } from './helpers/document-schemas';
import { vaccinationSchema } from './helpers/vaccination-schemas';
import { enrollmentSchema, schoolReportSchema } from './helpers/education-schemas';
let f: Awaited<ReturnType<typeof createTestApp>> | undefined;
let server: Server;
const original = { ...process.env };
beforeEach(async () => {
  f = await createTestApp();
  server = f.app.getHttpServer();
});
afterEach(async () => {
  await f?.app.close();
  f = undefined;
  for (const key of [
    'PRIVACY_RETENTION_DAYS',
    'PRIVACY_EXPORT_MAX_ITEMS',
    'PRIVACY_EXPORT_MAX_BYTES',
    'CONSENT_POLICIES',
  ]) {
    const value = original[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});
function fixtures() {
  if (!f) throw new Error();
  return f;
}
const sessionSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  user: z.object({ id: z.uuid(), email: z.string() }),
});
async function register(email = 'privacy-owner@example.com') {
  await request(server)
    .post('/api/v1/auth/register')
    .send({ name: 'Responsável fictício', email, password: authPassword })
    .expect(202);
  const response = await request(server)
    .post('/api/v1/auth/login')
    .send({ email, password: authPassword })
    .expect(200);
  return sessionSchema.parse(response.body);
}
async function dependent(token: string, fullName = 'Criança fictícia') {
  const response = await request(server)
    .post('/api/v1/dependents')
    .auth(token, { type: 'bearer' })
    .send({ fullName, birthDate: '2020-02-29' })
    .expect(201);
  return z.object({ id: z.uuid() }).parse(response.body).id;
}
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
const exportSchema = z
  .object({
    schemaVersion: z.literal('1.5'),
    format: z.literal('JSON'),
    exportId: z.uuid(),
    generatedAt: z.string(),
    scope: z.object({ dependentIds: z.array(z.uuid()) }).strict(),
    data: z
      .object({
        medications: z.array(medicationSchema),
        medicationTreatments: z.array(medicationTreatmentSchema),
        appointments: z.array(appointmentSchema),
        medicalRecommendations: z.array(recommendationSchema),
        documents: z.array(documentSchema),
        vaccinations: z.array(vaccinationSchema),
        schoolEnrollments: z.array(enrollmentSchema),
        schoolReports: z.array(schoolReportSchema),
        account: z
          .object({
            id: z.uuid(),
            name: z.string(),
            email: z.string(),
            status: z.literal('ACTIVE'),
            emailVerifiedAt: z.string().nullable(),
            createdAt: z.string(),
            updatedAt: z.string(),
          })
          .strict(),
        dependents: z.array(
          z
            .object({
              id: z.uuid(),
              fullName: z.string(),
              preferredName: z.string().nullable(),
              birthDate: z.string(),
              createdAt: z.string(),
              updatedAt: z.string(),
            })
            .strict(),
        ),
        dependentAccess: z.array(
          z
            .object({
              dependentId: z.uuid(),
              role: z.literal('OWNER'),
              relationship: z.string().nullable(),
              createdAt: z.string(),
            })
            .strict(),
        ),
        careTasks: z.array(
          z
            .object({
              id: z.uuid(),
              title: z.string(),
              description: z.string(),
              completed: z.boolean(),
              createdAt: z.string(),
              updatedAt: z.string(),
            })
            .strict(),
        ),
        consents: z.array(consentSchema),
        sessions: z.array(
          z
            .object({
              id: z.uuid(),
              authenticationMethod: z.literal('PASSWORD'),
              createdAt: z.string(),
              expiresAt: z.string(),
              revokedAt: z.string().nullable(),
            })
            .strict(),
        ),
        auditEvents: z.array(
          z
            .object({
              id: z.uuid(),
              action: z.string(),
              resourceType: z.string(),
              resourceId: z.uuid(),
              dependentId: z.uuid().nullable(),
              timestamp: z.string(),
            })
            .strict(),
        ),
        exportHistory: z.array(
          z.object({ id: z.uuid(), format: z.literal('JSON'), createdAt: z.string() }).strict(),
        ),
      })
      .strict(),
  })
  .strict();
const exportDto = { format: 'JSON', password: authPassword };
const deletionDto = { password: authPassword, confirmation: 'DELETE_MY_ACCOUNT' };
test.each(['/exports', '/account-deletion-requests', '/consents/' + randomUUID() + '/revoke'])(
  'privacidade exige autenticação: %s',
  async (path) => {
    await request(server)
      .post('/api/v1/privacy' + path)
      .send({})
      .expect(401);
  },
);
test('exportação JSON tem projeção estrita, escopo OWNER e nenhum dado/credencial de outro titular', async () => {
  const alice = await register();
  const bob = await register('privacy-other@example.com');
  const a = await dependent(alice.accessToken);
  const b = await dependent(bob.accessToken, 'Nome privado de outro dependente');
  await request(server)
    .post('/api/v1/care-tasks')
    .auth(bob.accessToken, { type: 'bearer' })
    .send({ title: 'Título privado de outro titular', description: 'Não exportar' })
    .expect(201);
  const response = await request(server)
    .post('/api/v1/privacy/exports')
    .auth(alice.accessToken, { type: 'bearer' })
    .send({ ...exportDto, dependentIds: [a] })
    .expect(200);
  exportSchema.parse(response.body);
  expect(response.headers['cache-control']).toBe('no-store');
  expect(response.headers['content-disposition']).toBe(
    'attachment; filename="cuidare-export.json"',
  );
  const serialized = JSON.stringify(response.body);
  const stored = await fixtures().users.findById(alice.user.id);
  for (const value of [
    bob.user.id,
    bob.user.email,
    b,
    'Título privado',
    alice.accessToken,
    alice.refreshToken,
    stored?.passwordHash ?? '',
    'credentialVersion',
    'tokenHash',
    'metadata',
  ])
    expect(serialized).not.toContain(value);
  const record = exportSchema.parse(response.body);
  expect(record.data.dependents.map((d) => d.id)).toEqual([a]);
  expect(fixtures().foundation.auditRows.at(-1)).toMatchObject({
    action: 'DATA_EXPORTED',
    metadata: {},
  });
});
test('nenhum dependente é implicitamente exportado; histórico não contém arquivos', async () => {
  const alice = await register();
  await dependent(alice.accessToken);
  const first = await request(server)
    .post('/api/v1/privacy/exports')
    .auth(alice.accessToken, { type: 'bearer' })
    .send(exportDto)
    .expect(200);
  const second = await request(server)
    .post('/api/v1/privacy/exports')
    .auth(alice.accessToken, { type: 'bearer' })
    .send(exportDto)
    .expect(200);
  expect(exportSchema.parse(first.body).data.dependents).toEqual([]);
  expect(exportSchema.parse(second.body).data.exportHistory).toHaveLength(1);
  expect(Object.keys([...fixtures().foundation.exportRows.values()][0] ?? {}).sort()).toEqual([
    'createdAt',
    'format',
    'id',
    'userId',
  ]);
  await request(server)
    .post('/api/v1/privacy/exports')
    .auth(alice.accessToken, { type: 'bearer' })
    .send(exportDto)
    .expect(429);
});
test.each(['other', 'random', 'VIEWER', 'EDITOR', 'revoked', 'deleted'])(
  'escopo não permitido %s falha sem exportação parcial',
  async (state) => {
    const alice = await register();
    const bob = await register('privacy-other@example.com');
    const child = await dependent(bob.accessToken);
    if (state !== 'other' && state !== 'random') {
      const access = await fixtures().foundation.dependentAccess.create({
        userId: alice.user.id,
        dependentId: child,
        role: state === 'VIEWER' ? 'VIEWER' : state === 'EDITOR' ? 'EDITOR' : 'OWNER',
        relationship: null,
      });
      if (state === 'revoked')
        fixtures().foundation.accessRows.set(access.id, { ...access, revokedAt: new Date() });
      if (state === 'deleted')
        await fixtures().foundation.dependents.softDeleteForUser(child, bob.user.id);
    }
    const response = await request(server)
      .post('/api/v1/privacy/exports')
      .auth(alice.accessToken, { type: 'bearer' })
      .send({ ...exportDto, dependentIds: [state === 'random' ? randomUUID() : child] })
      .expect(404);
    expect(response.body).not.toHaveProperty('data');
    expect(fixtures().foundation.exportRows.size).toBe(0);
  },
);
test.each([
  { userId: randomUUID() },
  { ownerId: randomUUID() },
  { format: 'PDF' },
  { dependentIds: null },
  { dependentIds: ['not-uuid'] },
  { dependentIds: Array(21).fill(randomUUID()) },
  { password: null },
])('DTO rejeita exportação inválida/mass assignment: %j', async (override) => {
  const alice = await register();
  await request(server)
    .post('/api/v1/privacy/exports')
    .auth(alice.accessToken, { type: 'bearer' })
    .send({ ...exportDto, ...override })
    .expect(400);
  expect(fixtures().foundation.exportRows.size).toBe(0);
});
test('sem senha ou com senha errada não exporta nem fecha conta', async () => {
  const alice = await register();
  await request(server)
    .post('/api/v1/privacy/exports')
    .auth(alice.accessToken, { type: 'bearer' })
    .send({ format: 'JSON' })
    .expect(400);
  await request(server)
    .post('/api/v1/privacy/exports')
    .auth(alice.accessToken, { type: 'bearer' })
    .send({ ...exportDto, password: 'wrong' })
    .expect(401);
  await request(server)
    .post('/api/v1/privacy/account-deletion-requests')
    .auth(alice.accessToken, { type: 'bearer' })
    .send({ ...deletionDto, password: 'wrong' })
    .expect(401);
  expect(await fixtures().users.findById(alice.user.id)).not.toBeNull();
});
test('limites de itens/bytes falham sem recibo ou conteúdo parcial', async () => {
  const alice = await register();
  fixtures().app.get(ConfigService).set('PRIVACY_EXPORT_MAX_ITEMS', 1);
  await request(server)
    .post('/api/v1/privacy/exports')
    .auth(alice.accessToken, { type: 'bearer' })
    .send(exportDto)
    .expect(413);
  fixtures().app.get(ConfigService).set('PRIVACY_EXPORT_MAX_ITEMS', 1000);
  fixtures().app.get(ConfigService).set('PRIVACY_EXPORT_MAX_BYTES', 1024);
  await request(server)
    .post('/api/v1/care-tasks')
    .auth(alice.accessToken, { type: 'bearer' })
    .send({ title: 'Rotina', description: 'x'.repeat(1500) })
    .expect(201);
  await request(server)
    .post('/api/v1/privacy/exports')
    .auth(alice.accessToken, { type: 'bearer' })
    .send(exportDto)
    .expect(413);
  expect(fixtures().foundation.exportRows.size).toBe(0);
});
test.each([
  { confirmation: 'DELETE' },
  { userId: randomUUID() },
  { status: 'COMPLETED' },
  { retentionNotBeforeAt: '2020-01-01' },
])('cliente não escolhe identidade/status/retenção do fechamento: %j', async (override) => {
  const alice = await register();
  await request(server)
    .post('/api/v1/privacy/account-deletion-requests')
    .auth(alice.accessToken, { type: 'bearer' })
    .send({ ...deletionDto, ...override })
    .expect(400);
  expect(fixtures().foundation.deletionRows.size).toBe(0);
});
test('fechamento revoga JWT/refresh e acessos próprios, preservando dependente e outro responsável', async () => {
  const alice = await register();
  const bob = await register('privacy-other@example.com');
  const child = await dependent(alice.accessToken);
  await fixtures().foundation.dependentAccess.create({
    userId: bob.user.id,
    dependentId: child,
    role: 'OWNER',
    relationship: null,
  });
  const response = await request(server)
    .post('/api/v1/privacy/account-deletion-requests')
    .auth(alice.accessToken, { type: 'bearer' })
    .send(deletionDto)
    .expect(202);
  z.object({
    id: z.uuid(),
    status: z.literal('PENDING_REVIEW'),
    requestedAt: z.string(),
    retentionNotBeforeAt: z.null(),
    accountAccessClosed: z.literal(true),
    message: z.string(),
  })
    .strict()
    .parse(response.body);
  await request(server).get('/api/v1/me').auth(alice.accessToken, { type: 'bearer' }).expect(401);
  await request(server)
    .post('/api/v1/auth/refresh')
    .send({ refreshToken: alice.refreshToken })
    .expect(401);
  await request(server)
    .post('/api/v1/auth/login')
    .send({ email: alice.user.email, password: authPassword })
    .expect(401);
  await request(server)
    .get('/api/v1/dependents/' + child)
    .auth(bob.accessToken, { type: 'bearer' })
    .expect(200);
  expect(fixtures().users.rows.has(alice.user.email)).toBe(true);
});
test('revogação própria atinge repetições do escopo e não outro titular; não exige política ainda publicada', async () => {
  const alice = await register();
  const bob = await register('privacy-other@example.com');
  fixtures()
    .app.get(ConfigService)
    .set('CONSENT_POLICIES', { OPTIONAL: { version: 'v1', scope: 'ACCOUNT', consentBased: true } });
  const accepted = await request(server)
    .post('/api/v1/consents')
    .auth(alice.accessToken, { type: 'bearer' })
    .send({ type: 'OPTIONAL', policyVersion: 'v1' })
    .expect(201);
  const id = consentSchema.parse(accepted.body).id;
  await request(server)
    .post('/api/v1/consents')
    .auth(alice.accessToken, { type: 'bearer' })
    .send({ type: 'OPTIONAL', policyVersion: 'v1' })
    .expect(201);
  const other = await request(server)
    .post('/api/v1/consents')
    .auth(bob.accessToken, { type: 'bearer' })
    .send({ type: 'OPTIONAL', policyVersion: 'v1' })
    .expect(201);
  fixtures().app.get(ConfigService).set('CONSENT_POLICIES', {});
  await request(server)
    .post('/api/v1/privacy/consents/' + id + '/revoke')
    .auth(bob.accessToken, { type: 'bearer' })
    .send({})
    .expect(404);
  const revoked = await request(server)
    .post('/api/v1/privacy/consents/' + id + '/revoke')
    .auth(alice.accessToken, { type: 'bearer' })
    .send({})
    .expect(200);
  expect(consentSchema.parse(revoked.body).revokedAt).not.toBeNull();
  expect(
    fixtures().foundation.consentRows.get(consentSchema.parse(other.body).id)?.revokedAt,
  ).toBeNull();
  expect(
    [...fixtures().foundation.consentRows.values()]
      .filter((c) => c.userId === alice.user.id)
      .every((c) => c.revokedAt !== null),
  ).toBe(true);
  await request(server)
    .post('/api/v1/privacy/consents/' + id + '/revoke')
    .auth(alice.accessToken, { type: 'bearer' })
    .send({})
    .expect(200);
  expect(
    fixtures().foundation.auditRows.filter((a) => a.action === 'CONSENT_REVOKED'),
  ).toHaveLength(1);
});
test('avisos legados não são rotulados consentimento; propriedade consentBased não vem do cliente', async () => {
  const alice = await register();
  const accepted = await request(server)
    .post('/api/v1/consents')
    .auth(alice.accessToken, { type: 'bearer' })
    .send({ type: 'TEST_NOTICE', policyVersion: 'v1' })
    .expect(201);
  const id = consentSchema.parse(accepted.body).id;
  await request(server)
    .post('/api/v1/privacy/consents/' + id + '/revoke')
    .auth(alice.accessToken, { type: 'bearer' })
    .send({})
    .expect(409);
  await request(server)
    .post('/api/v1/consents')
    .auth(alice.accessToken, { type: 'bearer' })
    .send({ type: 'TEST_NOTICE', policyVersion: 'v1', consentBased: true })
    .expect(400);
  await request(server)
    .post('/api/v1/privacy/consents/' + randomUUID() + '/revoke')
    .auth(alice.accessToken, { type: 'bearer' })
    .send({})
    .expect(404);
  await request(server)
    .post('/api/v1/privacy/consents/' + id + '/revoke')
    .auth(alice.accessToken, { type: 'bearer' })
    .send({ userId: randomUUID() })
    .expect(400);
});
test('falha de audit desfaz exportação e fechamento, mantendo acesso e nenhum segredo na resposta', async () => {
  const alice = await register();
  jest
    .spyOn(fixtures().foundation.auditLogs, 'append')
    .mockRejectedValueOnce(new Error('private-data'))
    .mockRejectedValueOnce(new Error('private-data'));
  const response = await request(server)
    .post('/api/v1/privacy/exports')
    .auth(alice.accessToken, { type: 'bearer' })
    .send(exportDto)
    .expect(500);
  expect(JSON.stringify(response.body)).not.toContain('private-data');
  await request(server)
    .post('/api/v1/privacy/account-deletion-requests')
    .auth(alice.accessToken, { type: 'bearer' })
    .send(deletionDto)
    .expect(500);
  expect(fixtures().foundation.exportRows.size + fixtures().foundation.deletionRows.size).toBe(0);
  await request(server).get('/api/v1/me').auth(alice.accessToken, { type: 'bearer' }).expect(200);
});
