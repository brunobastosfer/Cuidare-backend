import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import request from 'supertest';
import { z } from 'zod';
import { createTestApp } from './helpers/create-test-app';
import { appointmentDto, recommendationDto } from './helpers/appointment-fixture';
import { appointmentSchema, recommendationSchema } from './helpers/appointment-schemas';
import { TIMELINE_EVENT_TYPES } from '../src/domain/models/timeline-event.model';
import type { DependentAccessRole } from '../src/domain/models/dependent.model';
let f: Awaited<ReturnType<typeof createTestApp>> | undefined, server: Server;
const password = 'Senha fictícia para consultas, exclusiva de testes!';
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
async function actor(email = 'appointment-owner@example.com') {
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
    .send({ fullName: 'Fixture child', birthDate: '2020-01-01' })
    .expect(201);
  return z.object({ id: z.uuid() }).parse(response.body).id;
}
const base = (dependentId: string) => '/api/v1/dependents/' + dependentId + '/appointments';
async function fixture() {
  const user = await actor(),
    dependentId = await child(user.accessToken);
  const a = await request(server)
    .post(base(dependentId))
    .auth(user.accessToken, { type: 'bearer' })
    .send(
      appointmentDto({ notes: 'Nota fictícia privada', professionalName: 'Profissional fictício' }),
    )
    .expect(201);
  const appointment = appointmentSchema.parse(a.body),
    path = base(dependentId) + '/' + appointment.id;
  const r = await request(server)
    .post(path + '/recommendations')
    .auth(user.accessToken, { type: 'bearer' })
    .send(recommendationDto())
    .expect(201);
  const recommendation = recommendationSchema.parse(r.body),
    recPath = path + '/recommendations/' + recommendation.id;
  return { user, dependentId, appointment, recommendation, path, recPath };
}
const pageSchema = z
  .object({
    items: z.array(
      z
        .object({
          id: z.string(),
          dependentId: z.uuid(),
          type: z.enum(TIMELINE_EVENT_TYPES),
          title: z.string(),
          summary: z.string().nullable(),
          sourceId: z.uuid(),
          sourceType: z.string(),
          eventDate: z.string(),
          createdAt: z.string(),
        })
        .strict(),
    ),
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
  })
  .strict();
test('fluxo HTTP funcional e projeções exatas: CRUD, estados e soft delete', async () => {
  const a = await fixture();
  const get = await request(server)
    .get(a.path)
    .auth(a.user.accessToken, { type: 'bearer' })
    .expect(200);
  expect(appointmentSchema.parse(get.body)).toEqual(a.appointment);
  expect(get.headers['cache-control']).toBe('no-store');
  const rec = await request(server)
    .get(a.recPath)
    .auth(a.user.accessToken, { type: 'bearer' })
    .expect(200);
  expect(recommendationSchema.parse(rec.body)).toEqual(a.recommendation);
  const list = await request(server)
    .get(base(a.dependentId))
    .query({ limit: 1, offset: 0 })
    .auth(a.user.accessToken, { type: 'bearer' })
    .expect(200);
  expect(z.array(appointmentSchema).parse(list.body)).toEqual([a.appointment]);
  const recs = await request(server)
    .get(a.path + '/recommendations')
    .auth(a.user.accessToken, { type: 'bearer' })
    .expect(200);
  expect(z.array(recommendationSchema).parse(recs.body)).toEqual([a.recommendation]);
  await request(server)
    .patch(a.path)
    .auth(a.user.accessToken, { type: 'bearer' })
    .send({ notes: null, followUpDate: '2026-02-01T14:30:00Z' })
    .expect(200);
  await request(server)
    .patch(a.recPath)
    .auth(a.user.accessToken, { type: 'bearer' })
    .send({ status: 'IN_PROGRESS', endDate: '2026-02-01' })
    .expect(200);
  await request(server)
    .patch(a.recPath)
    .auth(a.user.accessToken, { type: 'bearer' })
    .send({ status: 'PENDING', endDate: null })
    .expect(200);
  await request(server)
    .patch(a.recPath)
    .auth(a.user.accessToken, { type: 'bearer' })
    .send({ status: 'COMPLETED' })
    .expect(200);
  await request(server)
    .patch(a.recPath)
    .auth(a.user.accessToken, { type: 'bearer' })
    .send({ status: 'IN_PROGRESS' })
    .expect(409);
  await request(server).delete(a.path).auth(a.user.accessToken, { type: 'bearer' }).expect(409);
  await request(server).delete(a.recPath).auth(a.user.accessToken, { type: 'bearer' }).expect(204);
  await request(server).get(a.recPath).auth(a.user.accessToken, { type: 'bearer' }).expect(404);
  await request(server).delete(a.path).auth(a.user.accessToken, { type: 'bearer' }).expect(204);
  await request(server).get(a.path).auth(a.user.accessToken, { type: 'bearer' }).expect(404);
  await request(server)
    .get(a.path + '/recommendations')
    .auth(a.user.accessToken, { type: 'bearer' })
    .expect(404);
  expect(current().foundation.appointments.rows.get(a.appointment.id)?.deletedAt).toBeInstanceOf(
    Date,
  );
  const audit = JSON.stringify(current().foundation.auditRows);
  expect(audit).not.toContain(a.appointment.reason);
  expect(audit).not.toContain(a.appointment.professionalName);
  expect(audit).not.toContain(a.recommendation.description);
});
test.each(['OWNER', 'EDITOR', 'VIEWER'] as DependentAccessRole[])(
  'HTTP papel %s nas duas entidades; revogação vale imediatamente',
  async (role) => {
    const a = await fixture(),
      other = await actor('role@example.com');
    const access = await current().foundation.dependentAccess.create({
      userId: other.user.id,
      dependentId: a.dependentId,
      role,
      relationship: null,
    });
    await request(server).get(a.path).auth(other.accessToken, { type: 'bearer' }).expect(200);
    await request(server).get(a.recPath).auth(other.accessToken, { type: 'bearer' }).expect(200);
    const write = role === 'VIEWER' ? 404 : 200,
      create = role === 'VIEWER' ? 404 : 201;
    await request(server)
      .patch(a.path)
      .auth(other.accessToken, { type: 'bearer' })
      .send({ notes: 'Correção' })
      .expect(write);
    await request(server)
      .patch(a.recPath)
      .auth(other.accessToken, { type: 'bearer' })
      .send({ status: 'CANCELLED' })
      .expect(write);
    const extra = await request(server)
      .post(base(a.dependentId))
      .auth(other.accessToken, { type: 'bearer' })
      .send(appointmentDto())
      .expect(create);
    await request(server)
      .post(a.path + '/recommendations')
      .auth(other.accessToken, { type: 'bearer' })
      .send(recommendationDto())
      .expect(create);
    if (role !== 'OWNER') {
      await request(server)
        .delete(a.recPath)
        .auth(other.accessToken, { type: 'bearer' })
        .expect(404);
      await request(server).delete(a.path).auth(other.accessToken, { type: 'bearer' }).expect(404);
    } else {
      await request(server)
        .delete(a.recPath)
        .auth(other.accessToken, { type: 'bearer' })
        .expect(204);
      await request(server)
        .delete(base(a.dependentId) + '/' + appointmentSchema.parse(extra.body).id)
        .auth(other.accessToken, { type: 'bearer' })
        .expect(204);
    }
    current().foundation.accessRows.set(access.id, { ...access, revokedAt: new Date() });
    await request(server).get(a.path).auth(other.accessToken, { type: 'bearer' }).expect(404);
    await request(server)
      .get('/api/v1/dependents/' + a.dependentId + '/timeline')
      .auth(other.accessToken, { type: 'bearer' })
      .expect(404);
  },
);
test('A/B e troca de pai/dependente impedem IDOR mesmo com dois dependentes próprios', async () => {
  const a = await fixture(),
    stranger = await actor('stranger@example.com');
  for (const target of [a.path, a.recPath]) {
    await request(server).get(target).auth(stranger.accessToken, { type: 'bearer' }).expect(404);
    await request(server)
      .patch(target)
      .auth(stranger.accessToken, { type: 'bearer' })
      .send(target === a.path ? { notes: 'Negado' } : { title: 'Negado' })
      .expect(404);
    await request(server).delete(target).auth(stranger.accessToken, { type: 'bearer' }).expect(404);
  }
  await request(server)
    .get(base(a.dependentId))
    .auth(stranger.accessToken, { type: 'bearer' })
    .expect(404);
  await request(server)
    .post(base(a.dependentId))
    .auth(stranger.accessToken, { type: 'bearer' })
    .send(appointmentDto())
    .expect(404);
  await request(server)
    .post(a.path + '/recommendations')
    .auth(stranger.accessToken, { type: 'bearer' })
    .send(recommendationDto())
    .expect(404);
  const ownOther = await child(a.user.accessToken);
  await request(server)
    .get(base(ownOther) + '/' + a.appointment.id)
    .auth(a.user.accessToken, { type: 'bearer' })
    .expect(404);
  await request(server)
    .get(base(ownOther) + '/' + a.appointment.id + '/recommendations/' + a.recommendation.id)
    .auth(a.user.accessToken, { type: 'bearer' })
    .expect(404);
  const second = await request(server)
    .post(base(a.dependentId))
    .auth(a.user.accessToken, { type: 'bearer' })
    .send(appointmentDto())
    .expect(201);
  const wrongParent =
    base(a.dependentId) +
    '/' +
    appointmentSchema.parse(second.body).id +
    '/recommendations/' +
    a.recommendation.id;
  await request(server).get(wrongParent).auth(a.user.accessToken, { type: 'bearer' }).expect(404);
  await request(server)
    .patch(wrongParent)
    .auth(a.user.accessToken, { type: 'bearer' })
    .send({ title: 'Negado' })
    .expect(404);
  await request(server)
    .delete(wrongParent)
    .auth(a.user.accessToken, { type: 'bearer' })
    .expect(404);
});
test('JWT obrigatório, IDs validados e campos internos não aceitos no corpo', async () => {
  const a = await fixture();
  await request(server).get(a.path).expect(401);
  await request(server).post(base(a.dependentId)).send(appointmentDto()).expect(401);
  await request(server).get(a.recPath).expect(401);
  await request(server)
    .get(base('invalid'))
    .auth(a.user.accessToken, { type: 'bearer' })
    .expect(400);
  await request(server)
    .post(base(a.dependentId))
    .auth(a.user.accessToken, { type: 'bearer' })
    .send({ ...appointmentDto(), dependentId: randomUUID(), deletedAt: null, recommendations: [] })
    .expect(400);
  await request(server)
    .post(a.path + '/recommendations')
    .auth(a.user.accessToken, { type: 'bearer' })
    .send({
      ...recommendationDto(),
      appointmentId: randomUUID(),
      completedAt: new Date().toISOString(),
    })
    .expect(400);
  await request(server)
    .patch(a.path)
    .auth(a.user.accessToken, { type: 'bearer' })
    .send({ reason: 'a'.repeat(33000) })
    .expect(413);
  await request(server)
    .get(base(a.dependentId))
    .query({ limit: 101 })
    .auth(a.user.accessToken, { type: 'bearer' })
    .expect(400);
  await request(server)
    .get(a.path + '/recommendations')
    .query({ offset: -1 })
    .auth(a.user.accessToken, { type: 'bearer' })
    .expect(400);
});
test.each([
  { reason: null },
  { date: null },
  { date: '2026-02-30T00:00:00Z' },
  { date: '2026-01-01T24:00:00Z' },
  { reason: ' ' },
  { notes: 'a'.repeat(2001) },
  { followUpDate: '2025-01-01T00:00:00Z' },
  {},
])('PATCH consulta inválido %j', async (body) => {
  const a = await fixture();
  await request(server)
    .patch(a.path)
    .auth(a.user.accessToken, { type: 'bearer' })
    .send(body)
    .expect(400);
});
test.each([
  { title: null },
  { status: null },
  { status: 'DONE' },
  { startDate: '2026-02-29' },
  { endDate: '2025-01-01' },
  { title: ' ' },
  { description: 'a'.repeat(2001) },
  {},
])('PATCH recomendação inválido %j', async (body) => {
  const a = await fixture();
  await request(server)
    .patch(a.recPath)
    .auth(a.user.accessToken, { type: 'bearer' })
    .send(body)
    .expect(400);
});
test.each(['asc', 'desc'] as const)(
  'timeline HTTP %s: três fontes reais, detalhe protegido e sem payload clínico',
  async (order) => {
    const a = await fixture();
    await request(server)
      .patch(a.recPath)
      .auth(a.user.accessToken, { type: 'bearer' })
      .send({ status: 'COMPLETED' })
      .expect(200);
    const rows = [];
    let cursor: string | undefined;
    do {
      const response = await request(server)
        .get('/api/v1/dependents/' + a.dependentId + '/timeline')
        .query({ order, limit: 1, ...(cursor ? { cursor } : {}) })
        .auth(a.user.accessToken, { type: 'bearer' })
        .expect(200);
      const page = pageSchema.parse(response.body);
      rows.push(...page.items);
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(rows).toHaveLength(4);
    expect(new Set(rows.map((e) => e.id)).size).toBe(4);
    expect(rows.filter((e) => e.sourceType === 'MEDICAL_RECOMMENDATION')).toHaveLength(2);
    expect(JSON.stringify(rows)).not.toContain(a.recommendation.description);
    expect(JSON.stringify(rows)).not.toContain(a.appointment.professionalName);
    const exact = await request(server)
      .get('/api/v1/dependents/' + a.dependentId + '/timeline')
      .query({ type: 'APPOINTMENT_RECORDED', from: a.appointment.date, to: a.appointment.date })
      .auth(a.user.accessToken, { type: 'bearer' })
      .expect(200);
    expect(pageSchema.parse(exact.body).items).toHaveLength(1);
  },
);
test('exportação 1.3 é opt-in OWNER, limita escopo e omite soft delete/campos técnicos', async () => {
  const a = await fixture();
  const own = await request(server)
    .post('/api/v1/privacy/exports')
    .auth(a.user.accessToken, { type: 'bearer' })
    .send({ format: 'JSON', password })
    .expect(200);
  const schema = z.object({
    schemaVersion: z.literal('1.5'),
    data: z.object({
      appointments: z.array(appointmentSchema),
      medicalRecommendations: z.array(recommendationSchema),
    }),
  });
  expect(schema.parse(own.body).data).toEqual({ appointments: [], medicalRecommendations: [] });
  const selected = await request(server)
    .post('/api/v1/privacy/exports')
    .auth(a.user.accessToken, { type: 'bearer' })
    .send({ format: 'JSON', password, dependentIds: [a.dependentId] })
    .expect(200);
  expect(schema.parse(selected.body).data).toEqual({
    appointments: [a.appointment],
    medicalRecommendations: [a.recommendation],
  });
  expect(JSON.stringify(selected.body)).not.toContain('completedAt');
  expect(JSON.stringify(selected.body)).not.toContain('deletedAt');
});
test('exportação recusa VIEWER e omite recomendações excluídas sem enfraquecer rate limit', async () => {
  const a = await fixture();
  const schema = z.object({
    data: z.object({
      appointments: z.array(appointmentSchema),
      medicalRecommendations: z.array(recommendationSchema),
    }),
  });
  const other = await actor('privacy-viewer@example.com');
  await current().foundation.dependentAccess.create({
    userId: other.user.id,
    dependentId: a.dependentId,
    role: 'VIEWER',
    relationship: null,
  });
  await request(server)
    .post('/api/v1/privacy/exports')
    .auth(other.accessToken, { type: 'bearer' })
    .send({ format: 'JSON', password, dependentIds: [a.dependentId] })
    .expect(404);
  await request(server).delete(a.recPath).auth(a.user.accessToken, { type: 'bearer' }).expect(204);
  const after = await request(server)
    .post('/api/v1/privacy/exports')
    .auth(a.user.accessToken, { type: 'bearer' })
    .send({ format: 'JSON', password, dependentIds: [a.dependentId] })
    .expect(200);
  expect(schema.parse(after.body).data.medicalRecommendations).toEqual([]);
});
test('falha transacional vira erro genérico sem payload e não deixa dados parciais', async () => {
  const a = await fixture();
  const error = 'Conteúdo sensível não pode aparecer na resposta';
  jest.spyOn(current().foundation.auditLogs, 'append').mockRejectedValue(new Error(error));
  const response = await request(server)
    .patch(a.recPath)
    .auth(a.user.accessToken, { type: 'bearer' })
    .send({ status: 'COMPLETED' })
    .expect(500);
  expect(JSON.stringify(response.body)).not.toContain(error);
  expect(current().foundation.appointments.recommendations.get(a.recommendation.id)).toMatchObject({
    status: 'PENDING',
    completedAt: null,
  });
});
