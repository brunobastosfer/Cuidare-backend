import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import request from 'supertest';
import { z } from 'zod';
import { createTestApp } from './helpers/create-test-app';
import { medicationSchema, medicationTreatmentSchema } from './helpers/medication-schemas';
import { treatmentDto } from './helpers/medication-fixture';
const password = 'Senha fictícia exclusiva para medicamentos!';
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
function current() {
  if (!f) throw new Error('Fixture ausente');
  return f;
}
async function actor(email = 'med-owner@example.com') {
  await request(server)
    .post('/api/v1/auth/register')
    .send({ name: 'Fixture', email, password })
    .expect(202);
  const response = await request(server)
    .post('/api/v1/auth/login')
    .send({ email, password })
    .expect(200);
  return z
    .object({ accessToken: z.string(), user: z.object({ id: z.uuid() }) })
    .parse(response.body);
}
async function child(token: string) {
  const response = await request(server)
    .post('/api/v1/dependents')
    .auth(token, { type: 'bearer' })
    .send({ fullName: 'Fixture child', birthDate: '2020-02-29' })
    .expect(201);
  return z.object({ id: z.uuid() }).parse(response.body).id;
}
const base = (id: string) => '/api/v1/dependents/' + id;
async function product(token: string, id: string) {
  const response = await request(server)
    .post(base(id) + '/medication-products')
    .auth(token, { type: 'bearer' })
    .send({ name: 'Produto fictício' })
    .expect(201);
  return medicationSchema.parse(response.body);
}
async function treatment(token: string, id: string, medicationId: string) {
  const response = await request(server)
    .post(base(id) + '/medications')
    .auth(token, { type: 'bearer' })
    .send(treatmentDto(medicationId))
    .expect(201);
  return medicationTreatmentSchema.parse(response.body);
}
const timelinePage = z
  .object({
    items: z.array(
      z
        .object({
          id: z.string(),
          dependentId: z.uuid(),
          type: z.enum(['DEPENDENT_CREATED', 'MEDICATION_STARTED', 'MEDICATION_COMPLETED']),
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
test('fluxo funcional: produto, tratamento textual, correção, suspensão/retomada/conclusão e exclusão lógica', async () => {
  const user = await actor(),
    id = await child(user.accessToken),
    p = await product(user.accessToken, id);
  const row = await treatment(user.accessToken, id, p.id);
  expect(row).toMatchObject({
    dosage: '1 gota por kg',
    status: 'ACTIVE',
    continuousUse: false,
    startDate: '2026-01-01',
    endDate: null,
  });
  const path = base(id) + '/medications/' + row.id;
  const get = await request(server)
    .get(path)
    .auth(user.accessToken, { type: 'bearer' })
    .expect(200);
  expect(medicationTreatmentSchema.parse(get.body)).toEqual(row);
  expect(get.headers['cache-control']).toBe('no-store');
  const list = await request(server)
    .get(base(id) + '/medications')
    .query({ limit: 1, offset: 0 })
    .auth(user.accessToken, { type: 'bearer' })
    .expect(200);
  expect(z.array(medicationTreatmentSchema).parse(list.body)).toEqual([row]);
  await request(server)
    .patch(base(id) + '/medication-products/' + p.id)
    .auth(user.accessToken, { type: 'bearer' })
    .send({ name: 'Produto corrigido' })
    .expect(200);
  await request(server)
    .patch(path)
    .auth(user.accessToken, { type: 'bearer' })
    .send({ status: 'SUSPENDED', notes: 'Nota fictícia' })
    .expect(200);
  await request(server)
    .patch(path)
    .auth(user.accessToken, { type: 'bearer' })
    .send({ status: 'ACTIVE', route: null, notes: null })
    .expect(200);
  await request(server)
    .patch(path)
    .auth(user.accessToken, { type: 'bearer' })
    .send({ status: 'COMPLETED', endDate: '2026-01-03' })
    .expect(200);
  await request(server)
    .patch(path)
    .auth(user.accessToken, { type: 'bearer' })
    .send({ status: 'ACTIVE' })
    .expect(409);
  await request(server)
    .delete(base(id) + '/medication-products/' + p.id)
    .auth(user.accessToken, { type: 'bearer' })
    .expect(409);
  await request(server).delete(path).auth(user.accessToken, { type: 'bearer' }).expect(204);
  await request(server).get(path).auth(user.accessToken, { type: 'bearer' }).expect(404);
  await request(server)
    .delete(base(id) + '/medication-products/' + p.id)
    .auth(user.accessToken, { type: 'bearer' })
    .expect(204);
  await request(server)
    .get(base(id) + '/medication-products/' + p.id)
    .auth(user.accessToken, { type: 'bearer' })
    .expect(404);
  expect(current().foundation.medications.treatments.get(row.id)?.deletedAt).toBeInstanceOf(Date);
  const audit = JSON.stringify(current().foundation.auditRows);
  expect(audit).not.toContain(row.dosage);
  expect(audit).not.toContain('Nota fictícia');
  expect(audit).not.toContain('Produto corrigido');
});
test.each(['asc', 'desc'] as const)(
  'timeline %s faz keyset real, empates/data civil e oculta textos clínicos',
  async (order) => {
    const user = await actor(),
      id = await child(user.accessToken),
      p = await product(user.accessToken, id);
    const row = await treatment(user.accessToken, id, p.id);
    await request(server)
      .patch(base(id) + '/medications/' + row.id)
      .auth(user.accessToken, { type: 'bearer' })
      .send({ status: 'COMPLETED', endDate: '2026-01-01' })
      .expect(200);
    const events = [];
    let cursor: string | undefined;
    do {
      const response = await request(server)
        .get(base(id) + '/timeline')
        .query({ order, limit: 1, ...(cursor ? { cursor } : {}) })
        .auth(user.accessToken, { type: 'bearer' })
        .expect(200);
      const page = timelinePage.parse(response.body);
      events.push(...page.items);
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(events).toHaveLength(3);
    expect(new Set(events.map((event) => event.id)).size).toBe(3);
    expect(events.filter((event) => event.sourceType === 'MEDICATION_TREATMENT')).toHaveLength(2);
    expect(JSON.stringify(events)).not.toContain(row.dosage);
    expect(JSON.stringify(events)).not.toContain(row.medication.name);
    const empty = await request(server)
      .get(base(id) + '/timeline')
      .query({ type: 'MEDICATION_STARTED', from: '2026-01-01T12:00:00Z' })
      .auth(user.accessToken, { type: 'bearer' })
      .expect(200);
    expect(timelinePage.parse(empty.body).items).toEqual([]);
  },
);
test('nega A/B, IDs inexistentes e troca de recursos entre dois dependentes próprios em todas as operações', async () => {
  const a = await actor(),
    b = await actor('med-other@example.com');
  const id = await child(a.accessToken),
    otherId = await child(a.accessToken),
    p = await product(a.accessToken, id),
    row = await treatment(a.accessToken, id, p.id);
  for (const token of [b.accessToken]) {
    for (const suffix of [
      '/medications',
      '/medication-products',
      '/medications/' + row.id,
      '/medication-products/' + p.id,
    ]) {
      await request(server)
        .get(base(id) + suffix)
        .auth(token, { type: 'bearer' })
        .expect(404);
    }
    await request(server)
      .post(base(id) + '/medications')
      .auth(token, { type: 'bearer' })
      .send(treatmentDto(p.id))
      .expect(404);
    await request(server)
      .patch(base(id) + '/medications/' + row.id)
      .auth(token, { type: 'bearer' })
      .send({ notes: 'Negado' })
      .expect(404);
    await request(server)
      .delete(base(id) + '/medications/' + row.id)
      .auth(token, { type: 'bearer' })
      .expect(404);
    await request(server)
      .post(base(id) + '/medication-products')
      .auth(token, { type: 'bearer' })
      .send({ name: 'Negado' })
      .expect(404);
    await request(server)
      .patch(base(id) + '/medication-products/' + p.id)
      .auth(token, { type: 'bearer' })
      .send({ name: 'Negado' })
      .expect(404);
    await request(server)
      .delete(base(id) + '/medication-products/' + p.id)
      .auth(token, { type: 'bearer' })
      .expect(404);
  }
  for (const suffix of ['/medications/' + row.id, '/medication-products/' + p.id]) {
    await request(server)
      .get(base(otherId) + suffix)
      .auth(a.accessToken, { type: 'bearer' })
      .expect(404);
    await request(server)
      .delete(base(otherId) + suffix)
      .auth(a.accessToken, { type: 'bearer' })
      .expect(404);
  }
  await request(server)
    .patch(base(otherId) + '/medications/' + row.id)
    .auth(a.accessToken, { type: 'bearer' })
    .send({ notes: 'Negado' })
    .expect(404);
  await request(server)
    .post(base(otherId) + '/medications')
    .auth(a.accessToken, { type: 'bearer' })
    .send(treatmentDto(p.id))
    .expect(404);
  const absent = await request(server)
    .get(base(id) + '/medications/' + randomUUID())
    .auth(a.accessToken, { type: 'bearer' })
    .expect(404);
  const wrong = await request(server)
    .get(base(otherId) + '/medications/' + row.id)
    .auth(a.accessToken, { type: 'bearer' })
    .expect(404);
  expect(z.object({ message: z.string() }).parse(absent.body).message).toBe(
    z.object({ message: z.string() }).parse(wrong.body).message,
  );
});
test.each(['EDITOR', 'VIEWER'] as const)('papel %s, revogação e sessão inválida', async (role) => {
  const owner = await actor(),
    other = await actor('med-other@example.com'),
    id = await child(owner.accessToken),
    p = await product(owner.accessToken, id),
    row = await treatment(owner.accessToken, id, p.id);
  const access = await current().foundation.dependentAccess.create({
    userId: other.user.id,
    dependentId: id,
    role,
    relationship: null,
  });
  await request(server)
    .get(base(id) + '/medications/' + row.id)
    .auth(other.accessToken, { type: 'bearer' })
    .expect(200);
  await request(server)
    .patch(base(id) + '/medications/' + row.id)
    .auth(other.accessToken, { type: 'bearer' })
    .send({ notes: 'Informado' })
    .expect(role === 'EDITOR' ? 200 : 404);
  await request(server)
    .patch(base(id) + '/medication-products/' + p.id)
    .auth(other.accessToken, { type: 'bearer' })
    .send({ name: 'Informado' })
    .expect(role === 'EDITOR' ? 200 : 404);
  await request(server)
    .delete(base(id) + '/medications/' + row.id)
    .auth(other.accessToken, { type: 'bearer' })
    .expect(404);
  current().foundation.accessRows.set(access.id, { ...access, revokedAt: new Date() });
  await request(server)
    .get(base(id) + '/medications')
    .auth(other.accessToken, { type: 'bearer' })
    .expect(404);
  await request(server)
    .get(base(id) + '/timeline')
    .auth(other.accessToken, { type: 'bearer' })
    .expect(404);
  await request(server)
    .post('/api/v1/auth/logout')
    .auth(owner.accessToken, { type: 'bearer' })
    .send({})
    .expect(204);
  await request(server)
    .get(base(id) + '/medication-products')
    .auth(owner.accessToken, { type: 'bearer' })
    .expect(401);
});
test.each([
  { dosage: null },
  { dosage: 1 },
  { unit: '' },
  { frequency: ' ' },
  { route: 1 },
  { continuousUse: 'true' },
  { continuousUse: null },
  { status: 'PRESCRIBED' },
  { status: null },
  { startDate: '2026-02-30' },
  { startDate: '9999-01-01' },
  { endDate: '2025-12-31' },
  { status: 'COMPLETED' },
  { status: 'COMPLETED', endDate: '9999-01-01' },
  { medicationId: randomUUID() },
  { medicationName: 'Não aceitar atalho' },
  { dependentId: randomUUID() },
  { userId: randomUUID() },
  { role: 'OWNER' },
  { completedAt: '2026-01-01T00:00:00Z' },
  { deletedAt: null },
  { documentId: randomUUID() },
  { weight: 10 },
  { dosage: 'x'.repeat(121) },
])('DTO de criação recusa input inválido/assignment %j', async (extra) => {
  const owner = await actor(),
    id = await child(owner.accessToken),
    p = await product(owner.accessToken, id);
  await request(server)
    .post(base(id) + '/medications')
    .auth(owner.accessToken, { type: 'bearer' })
    .send({ ...treatmentDto(p.id), ...extra })
    .expect(Object.hasOwn(extra, 'medicationId') ? 404 : 400);
  expect(current().foundation.medications.treatments.size).toBe(0);
});
test.each([
  {},
  { dosage: null },
  { unit: null },
  { continuousUse: null },
  { notes: 123 },
  { notes: 'x'.repeat(2001) },
  { medicationId: randomUUID() },
  { dependentId: randomUUID() },
  { completedAt: '2026-01-01T00:00:00Z' },
  { startDate: '2027-01-01' },
  { endDate: '2025-12-31' },
])('PATCH recusa %j sem apagar orientação', async (extra) => {
  const owner = await actor(),
    id = await child(owner.accessToken),
    p = await product(owner.accessToken, id),
    row = await treatment(owner.accessToken, id, p.id);
  await request(server)
    .patch(base(id) + '/medications/' + row.id)
    .auth(owner.accessToken, { type: 'bearer' })
    .send(extra)
    .expect(400);
  expect(current().foundation.medications.treatments.get(row.id)?.dosage).toBe(row.dosage);
});
test('valida produto, UUID, paginação e autenticação; excluído logicamente não aceita novo tratamento', async () => {
  const owner = await actor(),
    id = await child(owner.accessToken),
    p = await product(owner.accessToken, id);
  for (const payload of [
    {},
    { name: null },
    { name: ' ' },
    { name: 'x'.repeat(161) },
    { name: 'Novo', dependentId: randomUUID() },
  ]) {
    await request(server)
      .post(base(id) + '/medication-products')
      .auth(owner.accessToken, { type: 'bearer' })
      .send(payload)
      .expect(400);
  }
  await request(server)
    .get(base(id) + '/medications')
    .expect(401);
  await request(server)
    .get(base('not-uuid') + '/medications')
    .auth(owner.accessToken, { type: 'bearer' })
    .expect(400);
  await request(server)
    .get(base(id) + '/medications/not-uuid')
    .auth(owner.accessToken, { type: 'bearer' })
    .expect(400);
  await request(server)
    .get(base(id) + '/medications')
    .query({ limit: 101 })
    .auth(owner.accessToken, { type: 'bearer' })
    .expect(400);
  await request(server)
    .get(base(id) + '/medication-products')
    .query({ offset: -1 })
    .auth(owner.accessToken, { type: 'bearer' })
    .expect(400);
  await request(server)
    .delete(base(id) + '/medication-products/' + p.id)
    .auth(owner.accessToken, { type: 'bearer' })
    .expect(204);
  await request(server)
    .post(base(id) + '/medications')
    .auth(owner.accessToken, { type: 'bearer' })
    .send(treatmentDto(p.id))
    .expect(404);
});
test('exportação 1.1 inclui medicações só com seleção OWNER, sem internos; fechamento preserva dependente de outro responsável', async () => {
  const owner = await actor(),
    other = await actor('med-other@example.com'),
    id = await child(owner.accessToken),
    p = await product(owner.accessToken, id),
    row = await treatment(owner.accessToken, id, p.id);
  await current().foundation.dependentAccess.create({
    userId: other.user.id,
    dependentId: id,
    role: 'OWNER',
    relationship: null,
  });
  const parseExport = (body: unknown) =>
    z
      .object({
        schemaVersion: z.literal('1.5'),
        data: z.object({
          medications: z.array(medicationSchema),
          medicationTreatments: z.array(medicationTreatmentSchema),
        }),
      })
      .parse(body);
  const own = await request(server)
    .post('/api/v1/privacy/exports')
    .auth(owner.accessToken, { type: 'bearer' })
    .send({ format: 'JSON', password })
    .expect(200);
  expect(parseExport(own.body).data.medicationTreatments).toEqual([]);
  const selected = await request(server)
    .post('/api/v1/privacy/exports')
    .auth(owner.accessToken, { type: 'bearer' })
    .send({ format: 'JSON', password, dependentIds: [id] })
    .expect(200);
  expect(parseExport(selected.body).data.medicationTreatments).toEqual([row]);
  expect(JSON.stringify(selected.body)).not.toContain('completedAt');
  await request(server)
    .post('/api/v1/privacy/account-deletion-requests')
    .auth(owner.accessToken, { type: 'bearer' })
    .send({ password, confirmation: 'DELETE_MY_ACCOUNT' })
    .expect(202);
  await request(server)
    .get(base(id) + '/medications')
    .auth(owner.accessToken, { type: 'bearer' })
    .expect(401);
  await request(server)
    .get(base(id) + '/medications/' + row.id)
    .auth(other.accessToken, { type: 'bearer' })
    .expect(200);
  expect(current().foundation.medications.treatments.size).toBe(1);
});
test('audit indisponível desfaz tratamento e status; erro não retorna conteúdo clínico', async () => {
  const owner = await actor(),
    id = await child(owner.accessToken),
    p = await product(owner.accessToken, id),
    row = await treatment(owner.accessToken, id, p.id);
  jest
    .spyOn(current().foundation.auditLogs, 'append')
    .mockRejectedValue(new Error('private-medical-driver'));
  await request(server)
    .post(base(id) + '/medications')
    .auth(owner.accessToken, { type: 'bearer' })
    .send(treatmentDto(p.id))
    .expect(500);
  const response = await request(server)
    .patch(base(id) + '/medications/' + row.id)
    .auth(owner.accessToken, { type: 'bearer' })
    .send({ status: 'COMPLETED', endDate: '2026-01-02' })
    .expect(500);
  expect(JSON.stringify(response.body)).not.toContain('private-medical-driver');
  expect(current().foundation.medications.treatments.get(row.id)).toMatchObject({
    status: 'ACTIVE',
    completedAt: null,
  });
});
