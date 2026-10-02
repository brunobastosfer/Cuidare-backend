import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { z } from 'zod';
import { createTestApp } from './helpers/create-test-app';
import { enrollmentDto, reportDto } from './helpers/education-fixture';
import { enrollmentSchema, schoolReportSchema } from './helpers/education-schemas';
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
  for (const key of ['PRIVACY_EXPORT_MAX_ITEMS', 'PRIVACY_EXPORT_MAX_BYTES'])
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
});
function current() {
  if (!f) throw new Error('Fixture ausente');
  return f;
}
async function actor(email = 'education-owner@example.com') {
  await request(server)
    .post('/api/v1/auth/register')
    .send({ name: 'Fixture', email, password: authPassword })
    .expect(202);
  const r = await request(server)
    .post('/api/v1/auth/login')
    .send({ email, password: authPassword })
    .expect(200);
  return z.object({ accessToken: z.string(), user: z.object({ id: z.uuid() }) }).parse(r.body);
}
async function child(token: string) {
  const r = await request(server)
    .post('/api/v1/dependents')
    .auth(token, { type: 'bearer' })
    .send({ fullName: 'Fixture', birthDate: '2020-02-29' })
    .expect(201);
  return z.object({ id: z.uuid() }).parse(r.body).id;
}
const base = (id: string) => '/api/v1/dependents/' + id + '/education';
async function fixture() {
  const a = await actor(),
    dependentId = await child(a.accessToken),
    path = base(dependentId);
  const e = await request(server)
      .post(path + '/enrollments')
      .auth(a.accessToken, { type: 'bearer' })
      .send(enrollmentDto({ schoolName: ' Escola fictícia ', className: 'A' }))
      .expect(201),
    enrollment = enrollmentSchema.parse(e.body);
  const r = await request(server)
    .post(path + '/reports')
    .auth(a.accessToken, { type: 'bearer' })
    .send(reportDto({ enrollmentId: enrollment.id, summary: 'Resumo privado' }))
    .expect(201);
  return { a, dependentId, path, enrollment, report: schoolReportSchema.parse(r.body) };
}
test('CRUDs paginados, datas civis, nullable e exclusão de matrícula preserva relatório', async () => {
  const x = await fixture(),
    token = x.a.accessToken,
    e = x.path + '/enrollments/' + x.enrollment.id,
    r = x.path + '/reports/' + x.report.id;
  expect(x.enrollment.schoolName).toBe('Escola fictícia');
  for (const [route, schema] of [
    [e, enrollmentSchema],
    [r, schoolReportSchema],
  ] as const) {
    const res = await request(server).get(route).auth(token, { type: 'bearer' }).expect(200);
    schema.parse(res.body);
  }
  const updated = await request(server)
    .patch(e)
    .auth(token, { type: 'bearer' })
    .send({ grade: '1', className: null, endDate: '2025-03-01' })
    .expect(200);
  expect(enrollmentSchema.parse(updated.body).className).toBeNull();
  const edited = await request(server)
    .patch(r)
    .auth(token, { type: 'bearer' })
    .send({ observations: 'Observação privada', summary: null })
    .expect(200);
  expect(schoolReportSchema.parse(edited.body).summary).toBeNull();
  for (const [route, schema] of [
    ['enrollments', enrollmentSchema],
    ['reports', schoolReportSchema],
  ] as const) {
    const res = await request(server)
      .get(x.path + '/' + route + '?limit=1&offset=0')
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(z.array(schema).parse(res.body)).toHaveLength(1);
    expect(
      (
        await request(server)
          .get(x.path + '/' + route + '?offset=1')
          .auth(token, { type: 'bearer' })
          .expect(200)
      ).body as unknown,
    ).toEqual([]);
  }
  await request(server).delete(e).auth(token, { type: 'bearer' }).expect(204);
  const remaining = await request(server).get(r).auth(token, { type: 'bearer' }).expect(200);
  expect(schoolReportSchema.parse(remaining.body).enrollmentId).toBeNull();
  await request(server)
    .patch(r)
    .auth(token, { type: 'bearer' })
    .send({ title: 'Corrigido' })
    .expect(200);
  await request(server)
    .patch(r)
    .auth(token, { type: 'bearer' })
    .send({ enrollmentId: x.enrollment.id })
    .expect(404);
  await request(server).delete(r).auth(token, { type: 'bearer' }).expect(204);
  await request(server).get(r).auth(token, { type: 'bearer' }).expect(404);
  expect(JSON.stringify(current().foundation.auditRows)).not.toMatch(
    /Resumo privado|Observação privada|Escola fictícia|Corrigido/,
  );
});
test.each(['OWNER', 'EDITOR', 'VIEWER'] as DependentAccessRole[])(
  'permissões HTTP %s',
  async (role) => {
    const x = await fixture(),
      b = await actor('role@example.com'),
      e = x.path + '/enrollments/' + x.enrollment.id,
      r = x.path + '/reports/' + x.report.id;
    await current().foundation.dependentAccess.create({
      userId: b.user.id,
      dependentId: x.dependentId,
      role,
      relationship: null,
    });
    for (const route of [e, r])
      await request(server).get(route).auth(b.accessToken, { type: 'bearer' }).expect(200);
    await request(server)
      .post(x.path + '/enrollments')
      .auth(b.accessToken, { type: 'bearer' })
      .send(enrollmentDto())
      .expect(role === 'VIEWER' ? 404 : 201);
    await request(server)
      .post(x.path + '/reports')
      .auth(b.accessToken, { type: 'bearer' })
      .send(reportDto())
      .expect(role === 'VIEWER' ? 404 : 201);
    await request(server)
      .patch(e)
      .auth(b.accessToken, { type: 'bearer' })
      .send({ grade: 'G' })
      .expect(role === 'VIEWER' ? 404 : 200);
    await request(server)
      .patch(r)
      .auth(b.accessToken, { type: 'bearer' })
      .send({ summary: 'S' })
      .expect(role === 'VIEWER' ? 404 : 200);
    for (const route of [e, r])
      await request(server)
        .delete(route)
        .auth(b.accessToken, { type: 'bearer' })
        .expect(role === 'OWNER' ? 204 : 404);
    await request(server)
      .post('/api/v1/privacy/exports')
      .auth(b.accessToken, { type: 'bearer' })
      .send({ format: 'JSON', password: authPassword, dependentIds: [x.dependentId] })
      .expect(role === 'OWNER' ? 200 : 404);
  },
);
test('autenticação, estranho, BOLA entre dependentes e acesso revogado', async () => {
  const x = await fixture(),
    b = await actor('other@example.com'),
    other = await child(x.a.accessToken);
  for (const route of [x.path + '/enrollments', x.path + '/reports']) {
    await request(server).get(route).expect(401);
    await request(server).get(route).auth(b.accessToken, { type: 'bearer' }).expect(404);
  }
  for (const [route, id, payload] of [
    ['enrollments', x.enrollment.id, { grade: 'G' }],
    ['reports', x.report.id, { title: 'T' }],
  ] as const) {
    const p = base(other) + '/' + route + '/' + id;
    await request(server).get(p).auth(x.a.accessToken, { type: 'bearer' }).expect(404);
    await request(server)
      .patch(p)
      .auth(x.a.accessToken, { type: 'bearer' })
      .send(payload)
      .expect(404);
    await request(server).delete(p).auth(x.a.accessToken, { type: 'bearer' }).expect(404);
  }
  await request(server)
    .post(base(other) + '/reports')
    .auth(x.a.accessToken, { type: 'bearer' })
    .send(reportDto({ enrollmentId: x.enrollment.id }))
    .expect(404);
  const access = [...current().foundation.accessRows.values()].find(
    (a) => a.dependentId === x.dependentId,
  )!;
  current().foundation.accessRows.set(access.id, { ...access, revokedAt: new Date() });
  await request(server)
    .get(x.path + '/reports/' + x.report.id)
    .auth(x.a.accessToken, { type: 'bearer' })
    .expect(404);
});
test.each([
  { schoolYear: '2025' },
  { schoolName: null },
  { schoolName: ' ' },
  { grade: 'x'.repeat(121) },
  { className: 'x'.repeat(81) },
  { startDate: '2025-02-29' },
  { startDate: '2019-01-01' },
  { endDate: '2024-01-01' },
  { dependentId: randomUUID() },
  { createdByUserId: randomUUID() },
  { deletedAt: null },
])('matrícula inválida/mass assignment %j', async (override) => {
  const a = await actor(),
    d = await child(a.accessToken);
  await request(server)
    .post(base(d) + '/enrollments')
    .auth(a.accessToken, { type: 'bearer' })
    .send({ ...enrollmentDto(), ...override })
    .expect(400);
  expect(current().foundation.education.enrollments.size).toBe(0);
});
test.each([
  { title: null },
  { title: ' ' },
  { summary: 'x'.repeat(2001) },
  { observations: 'x'.repeat(2001) },
  { reportDate: '2025-02-29' },
  { reportDate: '2999-01-01' },
  { reportDate: '2019-01-01' },
  { enrollmentId: 'bad' },
  { documentId: 'bad' },
  { createdAt: '2025-01-01' },
  { status: 'APPROVED' },
])('relatório inválido/mass assignment %j', async (override) => {
  const a = await actor(),
    d = await child(a.accessToken);
  await request(server)
    .post(base(d) + '/reports')
    .auth(a.accessToken, { type: 'bearer' })
    .send({ ...reportDto(), ...override })
    .expect(400);
  expect(current().foundation.education.reports.size).toBe(0);
});
test('PATCH vazio, campos obrigatórios nulos, IDs e filtros inválidos', async () => {
  const x = await fixture();
  for (const [route, id, payload] of [
    ['enrollments', x.enrollment.id, { schoolYear: null }],
    ['reports', x.report.id, { title: null }],
  ] as const) {
    const p = x.path + '/' + route + '/' + id;
    for (const body of [{}, payload, { dependentId: randomUUID() }])
      await request(server)
        .patch(p)
        .auth(x.a.accessToken, { type: 'bearer' })
        .send(body)
        .expect(400);
    await request(server)
      .get(x.path + '/' + route + '/bad')
      .auth(x.a.accessToken, { type: 'bearer' })
      .expect(400);
    for (const q of ['?limit=101', '?offset=-1', '?schoolYear=2025'])
      await request(server)
        .get(x.path + '/' + route + q)
        .auth(x.a.accessToken, { type: 'bearer' })
        .expect(400);
  }
});
async function metadataDocument(dependentId: string, userId: string) {
  return current().foundation.documents.create({
    dependentId,
    createdByUserId: userId,
    category: 'SCHOOL_REPORT',
    title: 'Fixture',
    description: null,
    documentDate: null,
    storageKey: randomUUID() + '.bin',
    originalFileName: 'private.pdf',
    mimeType: 'application/pdf',
    size: 20,
    checksum: 'a'.repeat(64),
    scannedAt: new Date(),
  });
}
test('anexo autorizado, rejeição cruzada, soft delete, detach e reassociação', async () => {
  const x = await fixture(),
    other = await child(x.a.accessToken),
    foreign = await metadataDocument(other, x.a.user.id),
    own = await metadataDocument(x.dependentId, x.a.user.id),
    p = x.path + '/reports/' + x.report.id;
  await request(server)
    .patch(p)
    .auth(x.a.accessToken, { type: 'bearer' })
    .send({ documentId: foreign.id })
    .expect(404);
  await request(server)
    .post(x.path + '/reports')
    .auth(x.a.accessToken, { type: 'bearer' })
    .send(reportDto({ documentId: foreign.id }))
    .expect(404);
  const linked = await request(server)
    .patch(p)
    .auth(x.a.accessToken, { type: 'bearer' })
    .send({ documentId: own.id, enrollmentId: null })
    .expect(200);
  expect(schoolReportSchema.parse(linked.body).documentId).toBe(own.id);
  await current().foundation.documents.delete(own.id, x.dependentId, x.a.user.id, new Date());
  const res = await request(server).get(p).auth(x.a.accessToken, { type: 'bearer' }).expect(200);
  expect(schoolReportSchema.parse(res.body).documentId).toBeNull();
  await request(server)
    .patch(p)
    .auth(x.a.accessToken, { type: 'bearer' })
    .send({ summary: 'Correção textual' })
    .expect(200);
  await request(server)
    .patch(p)
    .auth(x.a.accessToken, { type: 'bearer' })
    .send({ documentId: own.id })
    .expect(404);
  await request(server)
    .patch(p)
    .auth(x.a.accessToken, { type: 'bearer' })
    .send({ documentId: null, enrollmentId: x.enrollment.id })
    .expect(200);
});
test('timeline mínima com cursor e exportação 1.5 opt-in sem internals', async () => {
  const x = await fixture(),
    token = x.a.accessToken;
  await request(server)
    .post(x.path + '/reports')
    .auth(token, { type: 'bearer' })
    .send(reportDto({ summary: 'Segredo', reportDate: '2025-06-02' }))
    .expect(201);
  const timeline =
    '/api/v1/dependents/' +
    x.dependentId +
    '/timeline?type=SCHOOL_REPORT_RECORDED&limit=1&order=asc';
  const a = await request(server).get(timeline).auth(token, { type: 'bearer' }).expect(200);
  const schema = z.object({
      items: z.array(
        z.object({
          sourceId: z.uuid(),
          title: z.literal('Relatório escolar informado'),
          summary: z.null(),
          sourceType: z.literal('SCHOOL_REPORT'),
        }),
      ),
      nextCursor: z.string().nullable(),
      hasMore: z.boolean(),
    }),
    first = schema.parse(a.body);
  expect(first.hasMore).toBe(true);
  expect(JSON.stringify(a.body)).not.toMatch(/Resumo privado|Segredo|Escola fictícia/);
  const next = await request(server)
    .get(timeline + '&cursor=' + encodeURIComponent(first.nextCursor!))
    .auth(token, { type: 'bearer' })
    .expect(200);
  expect(schema.parse(next.body).items[0]?.sourceId).not.toBe(first.items[0]?.sourceId);
  const exp = z.object({
    schemaVersion: z.literal('1.5'),
    data: z.object({
      schoolEnrollments: z.array(enrollmentSchema),
      schoolReports: z.array(schoolReportSchema),
    }),
  });
  const own = await request(server)
    .post('/api/v1/privacy/exports')
    .auth(token, { type: 'bearer' })
    .send({ format: 'JSON', password: authPassword })
    .expect(200);
  expect(exp.parse(own.body).data.schoolReports).toEqual([]);
  await request(server)
    .delete(x.path + '/enrollments/' + x.enrollment.id)
    .auth(token, { type: 'bearer' })
    .expect(204);
  const selected = await request(server)
    .post('/api/v1/privacy/exports')
    .auth(token, { type: 'bearer' })
    .send({ format: 'JSON', password: authPassword, dependentIds: [x.dependentId] })
    .expect(200);
  const data = exp.parse(selected.body).data;
  expect(data.schoolEnrollments).toEqual([]);
  expect(data.schoolReports).toHaveLength(2);
  expect(data.schoolReports.find((r) => r.id === x.report.id)?.enrollmentId).toBeNull();
  expect(JSON.stringify(selected.body)).not.toMatch(
    /storageKey|checksum|passwordHash|createdByUserId|deletedAt/,
  );
});
test.each(['schoolEnrollments', 'schoolReports'] as const)(
  'exportação limita coleção %s sem entregar parcial',
  async (collection) => {
    const x = await fixture(),
      config = current().app.get(ConfigService);
    const snapshot = await current().foundation.privacy.readExport(
      x.a.user.id,
      [x.dependentId],
      1000,
    );
    jest.spyOn(current().foundation.privacy, 'readExport').mockResolvedValue({
      ...snapshot,
      auditEvents: [],
      [collection]: [...snapshot[collection], ...snapshot[collection]],
    });
    config.set('PRIVACY_EXPORT_MAX_ITEMS', 1);
    await request(server)
      .post('/api/v1/privacy/exports')
      .auth(x.a.accessToken, { type: 'bearer' })
      .send({ format: 'JSON', password: authPassword, dependentIds: [x.dependentId] })
      .expect(413);
    expect(current().foundation.exportRows.size).toBe(0);
  },
);
