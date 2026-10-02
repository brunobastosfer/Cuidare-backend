import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { z } from 'zod';
import { createTestApp } from './helpers/create-test-app';
import { referenceFixture, vaccinationDto } from './helpers/vaccination-fixture';
import {
  vaccinationSchema,
  vaccineSchema,
  scheduleSchema,
  vaccinationStatusSchema,
} from './helpers/vaccination-schemas';
import { authPassword } from './helpers/auth-fixture';
import type { DependentAccessRole } from '../src/domain/models/dependent.model';
let f: Awaited<ReturnType<typeof createTestApp>> | undefined, server: Server;
const original = { ...process.env };
beforeEach(async () => {
  f = await createTestApp();
  server = f.app.getHttpServer();
});
afterEach(async () => {
  await f?.app.close();
  f = undefined;
  for (const key of ['VACCINATION_STATUS_MAX_ITEMS', 'PRIVACY_EXPORT_MAX_ITEMS']) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
});
function current() {
  if (!f) throw new Error('Fixture ausente');
  return f;
}
async function actor(email = 'vaccine-owner@example.com') {
  await request(server)
    .post('/api/v1/auth/register')
    .send({ name: 'Fixture', email, password: authPassword })
    .expect(202);
  const res = await request(server)
    .post('/api/v1/auth/login')
    .send({ email, password: authPassword })
    .expect(200);
  return z.object({ accessToken: z.string(), user: z.object({ id: z.uuid() }) }).parse(res.body);
}
async function child(token: string) {
  const res = await request(server)
    .post('/api/v1/dependents')
    .auth(token, { type: 'bearer' })
    .send({ fullName: 'Fixture', birthDate: '2020-02-29' })
    .expect(201);
  return z.object({ id: z.uuid() }).parse(res.body).id;
}
const base = (id: string) => '/api/v1/dependents/' + id + '/vaccinations';
async function fixture() {
  const user = await actor(),
    dependentId = await child(user.accessToken),
    references = referenceFixture(current().foundation.vaccinations);
  const res = await request(server)
    .post(base(dependentId))
    .auth(user.accessToken, { type: 'bearer' })
    .send(vaccinationDto(references.vaccine.id, { notes: 'Nota privada de teste' }))
    .expect(201);
  const record = vaccinationSchema.parse(res.body);
  return { ...references, user, dependentId, record, path: base(dependentId) + '/' + record.id };
}
test('referências começam vazias e exigem autenticação; não podem ser publicadas pela API', async () => {
  await request(server).get('/api/v1/vaccine-catalog').expect(401);
  const user = await actor();
  for (const route of ['/api/v1/vaccine-catalog', '/api/v1/vaccine-schedules']) {
    const res = await request(server)
      .get(route)
      .auth(user.accessToken, { type: 'bearer' })
      .expect(200);
    expect(res.body as unknown).toEqual([]);
    await request(server)
      .post(route)
      .auth(user.accessToken, { type: 'bearer' })
      .send({ name: 'Untrusted' })
      .expect(404);
  }
});
test('referências revisadas têm origem/versão, tipo e paginação; retiradas não reaparecem', async () => {
  const a = await fixture();
  const catalog = await request(server)
    .get('/api/v1/vaccine-catalog?limit=1&offset=0')
    .auth(a.user.accessToken, { type: 'bearer' })
    .expect(200);
  expect(z.array(vaccineSchema).parse(catalog.body)).toHaveLength(1);
  const schedule = await request(server)
    .get('/api/v1/vaccine-schedules/' + a.schedule.id)
    .auth(a.user.accessToken, { type: 'bearer' })
    .expect(200);
  expect(scheduleSchema.parse(schedule.body).sourceVersion).toBe('test-v1');
  const privateList = await request(server)
    .get('/api/v1/vaccine-schedules?type=PRIVATE_COMPLEMENTARY')
    .auth(a.user.accessToken, { type: 'bearer' })
    .expect(200);
  expect(privateList.body as unknown).toEqual([]);
  await request(server)
    .get('/api/v1/vaccine-schedules/' + a.schedule.id + '/doses')
    .auth(a.user.accessToken, { type: 'bearer' })
    .expect(200);
  current().foundation.vaccinations.catalog.set(a.vaccine.id, { ...a.vaccine, reviewedAt: null });
  await request(server)
    .get('/api/v1/vaccine-catalog/' + a.vaccine.id)
    .auth(a.user.accessToken, { type: 'bearer' })
    .expect(404);
  await request(server).get(a.path).auth(a.user.accessToken, { type: 'bearer' }).expect(200);
});
test('CRUD HTTP, data civil e projeções sem campos técnicos; exclusão é lógica', async () => {
  const a = await fixture();
  expect(a.record.administeredAt).toBe('2021-02-28');
  const listed = await request(server)
    .get(base(a.dependentId))
    .auth(a.user.accessToken, { type: 'bearer' })
    .expect(200);
  expect(z.array(vaccinationSchema).parse(listed.body)).toEqual([a.record]);
  expect(listed.headers['cache-control']).toBe('no-store');
  const edited = await request(server)
    .patch(a.path)
    .auth(a.user.accessToken, { type: 'bearer' })
    .send({ dose: '  TEST-DOSE  ', notes: null, batchNumber: 'TEST-BATCH' })
    .expect(200);
  expect(vaccinationSchema.parse(edited.body)).toMatchObject({
    notes: null,
    dose: 'TEST-DOSE',
    batchNumber: 'TEST-BATCH',
  });
  expect(JSON.stringify(current().foundation.auditRows)).not.toMatch(/Nota privada|TEST-BATCH/);
  await request(server).delete(a.path).auth(a.user.accessToken, { type: 'bearer' }).expect(204);
  await request(server).get(a.path).auth(a.user.accessToken, { type: 'bearer' }).expect(404);
  expect(current().foundation.vaccinations.rows.get(a.record.id)?.deletedAt).not.toBeNull();
});
test.each(['OWNER', 'EDITOR', 'VIEWER'] as DependentAccessRole[])(
  'HTTP papel %s e revogação imediata',
  async (role) => {
    const a = await fixture(),
      other = await actor('other-vaccine@example.com'),
      access = await current().foundation.dependentAccess.create({
        userId: other.user.id,
        dependentId: a.dependentId,
        role,
        relationship: null,
      });
    await request(server).get(a.path).auth(other.accessToken, { type: 'bearer' }).expect(200);
    await request(server)
      .patch(a.path)
      .auth(other.accessToken, { type: 'bearer' })
      .send({ notes: 'X' })
      .expect(role === 'VIEWER' ? 404 : 200);
    await request(server)
      .delete(a.path)
      .auth(other.accessToken, { type: 'bearer' })
      .expect(role === 'OWNER' ? 204 : 404);
    current().foundation.accessRows.set(access.id, { ...access, revokedAt: new Date() });
    await request(server)
      .get(base(a.dependentId))
      .auth(other.accessToken, { type: 'bearer' })
      .expect(404);
  },
);
test('BOLA/IDOR impede consulta, edição, exclusão e classificação de dependente alheio', async () => {
  const a = await fixture(),
    other = await actor('stranger-vaccine@example.com'),
    another = await child(a.user.accessToken);
  await request(server).get(a.path).auth(other.accessToken, { type: 'bearer' }).expect(404);
  await request(server)
    .patch(a.path)
    .auth(other.accessToken, { type: 'bearer' })
    .send({ notes: 'X' })
    .expect(404);
  await request(server).delete(a.path).auth(other.accessToken, { type: 'bearer' }).expect(404);
  await request(server)
    .get(base(a.dependentId) + '/schedule-status?scheduleId=' + a.schedule.id)
    .auth(other.accessToken, { type: 'bearer' })
    .expect(404);
  await request(server)
    .get(base(another) + '/' + a.record.id)
    .auth(a.user.accessToken, { type: 'bearer' })
    .expect(404);
});
test.each([
  { dose: null },
  { dose: '' },
  { dose: 'a'.repeat(41) },
  { administeredAt: '2021-02-29' },
  { administeredAt: '2999-01-01' },
  { administeredAt: '2019-01-01' },
  { institutionName: [] },
  { notes: 'a'.repeat(2001) },
  { documentId: 'invalid' },
  { createdByUserId: randomUUID() },
  { status: 'REGISTRADA' },
  { deletedAt: null },
  { dependentId: randomUUID() },
])('HTTP recusa dados inválidos/mass assignment %j', async (override) => {
  const a = await fixture();
  await request(server)
    .post(base(a.dependentId))
    .auth(a.user.accessToken, { type: 'bearer' })
    .send({ ...vaccinationDto(a.vaccine.id), ...override })
    .expect(400);
  expect(current().foundation.vaccinations.rows.size).toBe(1);
});
test('PATCH não troca vaccineId e não aceita atualização vazia', async () => {
  const a = await fixture();
  for (const body of [{ vaccineId: randomUUID() }, {}])
    await request(server)
      .patch(a.path)
      .auth(a.user.accessToken, { type: 'bearer' })
      .send(body)
      .expect(400);
});
test('classificação explícita: registrada, prevista e atrasada, com origem e versão', async () => {
  const a = await fixture(),
    path = base(a.dependentId) + '/schedule-status';
  await request(server).get(path).auth(a.user.accessToken, { type: 'bearer' }).expect(400);
  for (const [asOf, status] of [
    ['2021-02-27', 'PREVISTA'],
    ['2021-03-01', 'REGISTRADA'],
  ]) {
    const res = await request(server)
      .get(path)
      .query({ scheduleId: a.schedule.id, asOf })
      .auth(a.user.accessToken, { type: 'bearer' })
      .expect(200);
    expect(vaccinationStatusSchema.parse(res.body)).toMatchObject({
      schedule: { source: 'TEST_ONLY_NOT_CLINICAL', sourceVersion: 'test-v1' },
      items: [{ status }],
    });
  }
  await request(server).delete(a.path).auth(a.user.accessToken, { type: 'bearer' }).expect(204);
  const late = await request(server)
    .get(path)
    .query({ scheduleId: a.schedule.id, asOf: '2021-03-01' })
    .auth(a.user.accessToken, { type: 'bearer' })
    .expect(200);
  expect(vaccinationStatusSchema.parse(late.body).items[0]?.status).toBe('ATRASADA');
});
test('limites de classificação/privacidade retornam 413, sem resultado incompleto', async () => {
  const a = await fixture();
  current().app.get(ConfigService).set('VACCINATION_STATUS_MAX_ITEMS', 1);
  current().foundation.vaccinations.doses.set(randomUUID(), {
    ...a.rule,
    id: randomUUID(),
    dose: 'SECOND-TEST',
  });
  await request(server)
    .get(base(a.dependentId) + '/schedule-status')
    .query({ scheduleId: a.schedule.id })
    .auth(a.user.accessToken, { type: 'bearer' })
    .expect(413);
  current().app.get(ConfigService).set('PRIVACY_EXPORT_MAX_ITEMS', 1);
  await request(server)
    .post(base(a.dependentId))
    .auth(a.user.accessToken, { type: 'bearer' })
    .send(vaccinationDto(a.vaccine.id))
    .expect(201);
  await request(server)
    .post('/api/v1/privacy/exports')
    .auth(a.user.accessToken, { type: 'bearer' })
    .send({ password: authPassword, format: 'JSON', dependentIds: [a.dependentId] })
    .expect(413);
});
test('timeline mínima, exportação 1.5 opt-in OWNER e remoção de registros excluídos', async () => {
  const a = await fixture();
  const timeline = await request(server)
    .get('/api/v1/dependents/' + a.dependentId + '/timeline?type=VACCINATION_RECORDED')
    .auth(a.user.accessToken, { type: 'bearer' })
    .expect(200);
  expect(
    z
      .object({
        items: z.array(
          z.object({
            title: z.literal('Vacinação informada'),
            summary: z.null(),
            eventDate: z.string(),
          }),
        ),
      })
      .parse(timeline.body).items,
  ).toHaveLength(1);
  expect(JSON.stringify(timeline.body)).not.toMatch(/Nota privada|Referência fictícia/);
  for (const dependentIds of [[a.dependentId]]) {
    const exp = await request(server)
      .post('/api/v1/privacy/exports')
      .auth(a.user.accessToken, { type: 'bearer' })
      .send({ password: authPassword, format: 'JSON', dependentIds })
      .expect(200);
    expect(
      z
        .object({
          schemaVersion: z.literal('1.5'),
          data: z.object({ vaccinations: z.array(vaccinationSchema) }),
        })
        .parse(exp.body).data.vaccinations,
    ).toHaveLength(dependentIds.length);
  }
  await request(server).delete(a.path).auth(a.user.accessToken, { type: 'bearer' }).expect(204);
  const exp = await request(server)
    .post('/api/v1/privacy/exports')
    .auth(a.user.accessToken, { type: 'bearer' })
    .send({ password: authPassword, format: 'JSON', dependentIds: [a.dependentId] })
    .expect(200);
  expect(
    z.object({ data: z.object({ vaccinations: z.array(vaccinationSchema) }) }).parse(exp.body).data
      .vaccinations,
  ).toEqual([]);
});
test('link documental usa módulo protegido: não aceita outro dependente nem documento excluído', async () => {
  const a = await fixture(),
    repo = current().foundation.documents,
    doc = await repo.create({
      dependentId: a.dependentId,
      category: 'VACCINE_RECORD',
      title: 'TEST',
      description: null,
      storageKey: randomUUID() + '.bin',
      originalFileName: 'test.pdf',
      mimeType: 'application/pdf',
      size: 20,
      checksum: 'a'.repeat(64),
      scannedAt: new Date(),
      createdByUserId: a.user.user.id,
      documentDate: null,
    });
  repo.rows.set(doc.id, { ...doc, dependentId: randomUUID() });
  await request(server)
    .patch(a.path)
    .auth(a.user.accessToken, { type: 'bearer' })
    .send({ documentId: doc.id })
    .expect(404);
  repo.rows.set(doc.id, doc);
  const attached = await request(server)
    .patch(a.path)
    .auth(a.user.accessToken, { type: 'bearer' })
    .send({ documentId: doc.id })
    .expect(200);
  expect(vaccinationSchema.parse(attached.body).documentId).toBe(doc.id);
  repo.rows.set(doc.id, { ...doc, deletedAt: new Date() });
  const found = await request(server)
    .get(a.path)
    .auth(a.user.accessToken, { type: 'bearer' })
    .expect(200);
  expect(vaccinationSchema.parse(found.body).documentId).toBeNull();
  await request(server)
    .patch(a.path)
    .auth(a.user.accessToken, { type: 'bearer' })
    .send({ documentId: doc.id })
    .expect(404);
});
