import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { z } from 'zod';
import { createTestApp } from './helpers/create-test-app';
import { documentSchema } from './helpers/document-schemas';
import { pngBytes } from './helpers/document-fixture';
import type { DependentAccessRole } from '../src/domain/models/dependent.model';
let f: Awaited<ReturnType<typeof createTestApp>> | undefined, server: Server;
const password = 'Senha fictícia para documentos, exclusiva de testes!';
const configKeys = [
  'DOCUMENT_IO_CONCURRENCY',
  'DOCUMENT_MAX_STORED_FILES',
  'DOCUMENT_MAX_STORED_BYTES',
];
const originalEnv = new Map(configKeys.map((key) => [key, process.env[key]]));
beforeEach(async () => {
  f = await createTestApp();
  server = f.app.getHttpServer();
});
afterEach(async () => {
  await f?.app.close();
  f = undefined;
  for (const [key, value] of originalEnv)
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
});
function current() {
  if (!f) throw new Error('Fixture ausente.');
  return f;
}
async function actor(email = 'document-owner@example.com') {
  await request(server)
    .post('/api/v1/auth/register')
    .send({ name: 'Fixture', email, password })
    .expect(202);
  const r = await request(server).post('/api/v1/auth/login').send({ email, password }).expect(200);
  return z.object({ accessToken: z.string(), user: z.object({ id: z.uuid() }) }).parse(r.body);
}
async function child(token: string) {
  const r = await request(server)
    .post('/api/v1/dependents')
    .auth(token, { type: 'bearer' })
    .send({ fullName: 'Fixture', birthDate: '2020-01-01' })
    .expect(201);
  return z.object({ id: z.uuid() }).parse(r.body).id;
}
const base = (dependentId: string) => '/api/v1/dependents/' + dependentId + '/documents';
function upload(token: string, dependentId: string) {
  return request(server)
    .post(base(dependentId))
    .auth(token, { type: 'bearer' })
    .field('category', 'EXAM')
    .field('title', 'Título fictício privado');
}
async function fixture() {
  const user = await actor(),
    dependentId = await child(user.accessToken);
  const r = await upload(user.accessToken, dependentId)
    .field('description', 'Descrição fictícia privada')
    .field('documentDate', '2020-02-29')
    .attach('file', pngBytes, { filename: 'fixture.png', contentType: 'image/png' })
    .expect(201);
  const document = documentSchema.parse(r.body);
  return { user, dependentId, document, path: base(dependentId) + '/' + document.id };
}
test('upload, listagem, detalhe, download privado, edição e soft delete com auditoria mínima', async () => {
  const a = await fixture();
  expect(current().storage.rows.size).toBe(1);
  const internal = current().foundation.documents.rows.get(a.document.id);
  expect(internal?.storageKey).toMatch(/^[0-9a-f-]{36}\.bin$/);
  expect(internal?.checksum).toMatch(/^[0-9a-f]{64}$/);
  const list = await request(server)
    .get(base(a.dependentId))
    .query({ limit: 1 })
    .auth(a.user.accessToken, { type: 'bearer' })
    .expect(200);
  expect(z.array(documentSchema).parse(list.body)).toEqual([a.document]);
  const detail = await request(server)
    .get(a.path)
    .auth(a.user.accessToken, { type: 'bearer' })
    .expect(200);
  expect(documentSchema.parse(detail.body)).toEqual(a.document);
  const download = await request(server)
    .get(a.path + '/content')
    .auth(a.user.accessToken, { type: 'bearer' })
    .expect(200);
  expect(download.body).toEqual(pngBytes);
  expect(download.headers).toMatchObject({
    'cache-control': 'no-store',
    'content-type': 'image/png',
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'; sandbox",
  });
  expect(download.headers['content-disposition']).toBe(
    'attachment; filename="document-' + a.document.id + '.png"',
  );
  expect(download.headers['content-length']).toBe(String(pngBytes.length));
  const update = await request(server)
    .patch(a.path)
    .auth(a.user.accessToken, { type: 'bearer' })
    .send({ title: 'Correção', description: null, documentDate: null })
    .expect(200);
  expect(documentSchema.parse(update.body)).toMatchObject({
    title: 'Correção',
    description: null,
    documentDate: null,
  });
  await request(server).delete(a.path).auth(a.user.accessToken, { type: 'bearer' }).expect(204);
  await request(server).get(a.path).auth(a.user.accessToken, { type: 'bearer' }).expect(404);
  await request(server)
    .get(a.path + '/content')
    .auth(a.user.accessToken, { type: 'bearer' })
    .expect(404);
  expect(current().storage.rows.size).toBe(1);
  expect(current().foundation.documents.rows.get(a.document.id)?.deletedAt).toBeInstanceOf(Date);
  const audit = JSON.stringify(current().foundation.auditRows);
  expect(audit).toContain('DOCUMENT_VIEWED');
  expect(audit).toContain('DOCUMENT_DOWNLOADED');
  expect(audit).not.toMatch(
    /fixture.png|Título fictício privado|Descrição fictícia privada|storageKey|checksum|iVBOR/,
  );
});
test.each(['OWNER', 'EDITOR', 'VIEWER'] as DependentAccessRole[])(
  'papel %s em metadados e binário; revogação imediata',
  async (role) => {
    const a = await fixture(),
      other = await actor('document-role@example.com');
    const access = await current().foundation.dependentAccess.create({
      userId: other.user.id,
      dependentId: a.dependentId,
      role,
      relationship: null,
    });
    for (const path of [a.path, a.path + '/content', base(a.dependentId)])
      await request(server).get(path).auth(other.accessToken, { type: 'bearer' }).expect(200);
    await request(server)
      .patch(a.path)
      .auth(other.accessToken, { type: 'bearer' })
      .send({ title: 'Correção' })
      .expect(role === 'VIEWER' ? 404 : 200);
    await upload(other.accessToken, a.dependentId)
      .attach('file', pngBytes, 'fixture.png')
      .expect(role === 'VIEWER' ? 404 : 201);
    await request(server)
      .delete(a.path)
      .auth(other.accessToken, { type: 'bearer' })
      .expect(role === 'OWNER' ? 204 : 404);
    current().foundation.accessRows.set(access.id, { ...access, revokedAt: new Date() });
    await request(server)
      .get(base(a.dependentId))
      .auth(other.accessToken, { type: 'bearer' })
      .expect(404);
    await request(server)
      .get(a.path + '/content')
      .auth(other.accessToken, { type: 'bearer' })
      .expect(404);
  },
);
test('A/B, ID aleatório e troca de dependente não leem nem alteram objetos; autorização precede parsing', async () => {
  const a = await fixture(),
    other = await actor('document-stranger@example.com'),
    otherOwn = await child(a.user.accessToken);
  const before = current().storage.rows.size,
    scan = jest.spyOn(current().scanner, 'scan');
  for (const path of [a.path, a.path + '/content', base(a.dependentId)])
    await request(server).get(path).auth(other.accessToken, { type: 'bearer' }).expect(404);
  await request(server)
    .patch(a.path)
    .auth(other.accessToken, { type: 'bearer' })
    .send({ title: 'Negado' })
    .expect(404);
  await request(server).delete(a.path).auth(other.accessToken, { type: 'bearer' }).expect(404);
  await upload(other.accessToken, a.dependentId)
    .attach('wrong', pngBytes, 'fixture.png')
    .expect(404);
  for (const id of [a.document.id, randomUUID()])
    await request(server)
      .get(base(otherOwn) + '/' + id + '/content')
      .auth(a.user.accessToken, { type: 'bearer' })
      .expect(404);
  expect(scan).not.toHaveBeenCalled();
  expect(current().storage.rows.size).toBe(before);
});
test('JWT obrigatório e IDs/query validados', async () => {
  const a = await fixture();
  await request(server)
    .get(a.path + '/content')
    .expect(401);
  await request(server)
    .post(base(a.dependentId))
    .attach('file', pngBytes, 'fixture.png')
    .expect(401);
  await request(server)
    .get(base('invalid'))
    .auth(a.user.accessToken, { type: 'bearer' })
    .expect(400);
  await request(server)
    .get(base(a.dependentId))
    .query({ limit: 101 })
    .auth(a.user.accessToken, { type: 'bearer' })
    .expect(400);
});
test.each([
  ['MZ fictional executable', 'fixture.png', 'image/png'],
  ['<svg></svg>', 'fixture.png', 'image/png'],
  ['<html>fixture</html>', 'fixture.pdf', 'application/pdf'],
  ['%PDF-1.7\ntruncated', 'fixture.pdf', 'application/pdf'],
] as const)('conteúdo malicioso/falso recusado: %s', async (bytes, filename, contentType) => {
  const user = await actor(),
    id = await child(user.accessToken);
  await upload(user.accessToken, id)
    .attach('file', Buffer.from(bytes), { filename, contentType })
    .expect(400);
  expect(current().storage.rows.size).toBe(0);
});
test.each(['fixture.exe', 'fixture.svg', 'fixture.pdf'])(
  'extensão não concordante recusada: %s',
  async (filename) => {
    const user = await actor(),
      id = await child(user.accessToken);
    await upload(user.accessToken, id)
      .attach('file', pngBytes, { filename, contentType: 'image/png' })
      .expect(400);
  },
);
test('MIME mentiroso, mass assignment multipart, múltiplos arquivos e arquivo ausente', async () => {
  const user = await actor(),
    id = await child(user.accessToken);
  await upload(user.accessToken, id)
    .attach('file', pngBytes, { filename: 'fixture.png', contentType: 'application/pdf' })
    .expect(400);
  await upload(user.accessToken, id)
    .field('storageKey', '../secret')
    .attach('file', pngBytes, 'fixture.png')
    .expect(400);
  await upload(user.accessToken, id)
    .attach('file', pngBytes, 'a.png')
    .attach('file', pngBytes, 'b.png')
    .expect(400);
  await upload(user.accessToken, id).expect(400);
});
test.each([
  { title: null },
  { category: 'INVALID' },
  { title: ' ' },
  { documentDate: '2026-02-30' },
  { checksum: 'forged' },
  { storageKey: '../secret' },
  { createdByUserId: randomUUID() },
  {},
])('PATCH allowlist e validação: %j', async (body) => {
  const a = await fixture();
  await request(server)
    .patch(a.path)
    .auth(a.user.accessToken, { type: 'bearer' })
    .send(body)
    .expect(400);
});
test('limite multipart de bytes, campo e número de campos', async () => {
  const user = await actor(),
    id = await child(user.accessToken);
  await upload(user.accessToken, id)
    .attach('file', Buffer.alloc(5242881), 'fixture.png')
    .expect(413);
  await upload(user.accessToken, id)
    .field('description', 'a'.repeat(3000))
    .attach('file', pngBytes, 'fixture.png')
    .expect(400);
  await upload(user.accessToken, id)
    .field('description', 'a')
    .field('documentDate', '2026-01-01')
    .field('extra', 'x')
    .attach('file', pngBytes, 'fixture.png')
    .expect(400);
  expect(current().storage.rows.size).toBe(0);
});
test.each(['INFECTED', 'UNAVAILABLE'] as const)(
  'scanner %s não persiste metadados/objeto',
  async (verdict) => {
    const user = await actor(),
      id = await child(user.accessToken);
    current().scanner.verdict = verdict;
    await upload(user.accessToken, id)
      .attach('file', pngBytes, 'fixture.png')
      .expect(verdict === 'INFECTED' ? 400 : 503);
    expect(current().storage.rows.size).toBe(0);
    expect(current().foundation.documents.rows.size).toBe(0);
  },
);
test('scanner desabilitado bloqueia antes de interpretar arquivo', async () => {
  const user = await actor(),
    id = await child(user.accessToken);
  current().scanner.configured = false;
  await upload(user.accessToken, id).attach('wrong', pngBytes, 'fixture.png').expect(503);
});
test('falha de audit compensa objeto novo; falha de integridade não entrega bytes', async () => {
  const a = await fixture(),
    spy = jest
      .spyOn(current().foundation.auditLogs, 'append')
      .mockRejectedValue(new Error('secret-storage-details'));
  const failed = await upload(a.user.accessToken, a.dependentId)
    .attach('file', pngBytes, 'fixture.png')
    .expect(500);
  expect(JSON.stringify(failed.body)).not.toContain('secret-storage-details');
  expect(current().storage.rows.size).toBe(1);
  expect(current().foundation.documents.rows.size).toBe(1);
  spy.mockRestore();
  const row = current().foundation.documents.rows.get(a.document.id)!;
  current().storage.rows.set(row.storageKey, Buffer.from('corrupted'));
  await request(server)
    .get(a.path + '/content')
    .auth(a.user.accessToken, { type: 'bearer' })
    .expect(503);
  expect(current().foundation.auditRows.some((r) => r.action === 'DOCUMENT_DOWNLOADED')).toBe(
    false,
  );
});
test('quota inclui soft delete e conserva somente o objeto já confirmado', async () => {
  const a = await fixture();
  current().app.get(ConfigService).set('DOCUMENT_MAX_STORED_FILES', 1);
  await request(server).delete(a.path).auth(a.user.accessToken, { type: 'bearer' }).expect(204);
  await upload(a.user.accessToken, a.dependentId)
    .attach('file', pngBytes, 'fixture.png')
    .expect(413);
  expect(current().storage.rows.size).toBe(1);
});
test('orçamento concorrente libera slot após erro de parsing', async () => {
  const user = await actor(),
    id = await child(user.accessToken);
  current().app.get(ConfigService).set('DOCUMENT_IO_CONCURRENCY', 1);
  await upload(user.accessToken, id).attach('wrong', pngBytes, 'fixture.png').expect(400);
  let complete: (() => void) | undefined, entered: (() => void) | undefined;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const wait = new Promise<void>((resolve) => {
    complete = resolve;
  });
  jest.spyOn(current().scanner, 'scan').mockImplementation(async () => {
    entered!();
    await wait;
    return 'CLEAN';
  });
  const first = upload(user.accessToken, id)
    .attach('file', pngBytes, 'fixture.png')
    .expect(201)
    .then((r) => r);
  await started;
  await upload(user.accessToken, id).attach('file', pngBytes, 'fixture.png').expect(429);
  complete!();
  await first;
});
test('rate limit dedicado a downloads', async () => {
  const a = await fixture();
  for (let i = 0; i < 20; i++)
    await request(server)
      .get(a.path + '/content')
      .auth(a.user.accessToken, { type: 'bearer' })
      .expect(200);
  await request(server)
    .get(a.path + '/content')
    .auth(a.user.accessToken, { type: 'bearer' })
    .expect(429);
});
test('timeline agrega documento sem conteúdo e exportação 1.3 só inclui metadados opt-in', async () => {
  const a = await fixture();
  const page = await request(server)
    .get('/api/v1/dependents/' + a.dependentId + '/timeline')
    .query({ type: 'DOCUMENT_UPLOADED' })
    .auth(a.user.accessToken, { type: 'bearer' })
    .expect(200);
  expect(
    z
      .object({
        items: z.array(
          z.object({
            type: z.literal('DOCUMENT_UPLOADED'),
            title: z.literal('Documento enviado'),
            summary: z.null(),
          }),
        ),
      })
      .parse(page.body).items,
  ).toHaveLength(1);
  expect(JSON.stringify(page.body)).not.toMatch(
    /fixture.png|Título fictício privado|storageKey|checksum/,
  );
  const schema = z.object({
    schemaVersion: z.literal('1.5'),
    data: z.object({ documents: z.array(documentSchema) }),
  });
  const empty = await request(server)
    .post('/api/v1/privacy/exports')
    .auth(a.user.accessToken, { type: 'bearer' })
    .send({ format: 'JSON', password })
    .expect(200);
  expect(schema.parse(empty.body).data.documents).toEqual([]);
  const selected = await request(server)
    .post('/api/v1/privacy/exports')
    .auth(a.user.accessToken, { type: 'bearer' })
    .send({ format: 'JSON', password, dependentIds: [a.dependentId] })
    .expect(200);
  expect(schema.parse(selected.body).data.documents).toEqual([a.document]);
  expect(JSON.stringify(selected.body)).not.toMatch(/storageKey|checksum|scannedAt|iVBOR/);
});
test('exportação recusa VIEWER e omite documento excluído', async () => {
  const a = await fixture(),
    other = await actor('document-export@example.com');
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
  await request(server).delete(a.path).auth(a.user.accessToken, { type: 'bearer' }).expect(204);
  const selected = await request(server)
    .post('/api/v1/privacy/exports')
    .auth(a.user.accessToken, { type: 'bearer' })
    .send({ format: 'JSON', password, dependentIds: [a.dependentId] })
    .expect(200);
  expect(
    z.object({ data: z.object({ documents: z.array(documentSchema) }) }).parse(selected.body).data
      .documents,
  ).toEqual([]);
});
