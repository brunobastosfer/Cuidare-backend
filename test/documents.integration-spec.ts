import { randomUUID } from 'node:crypto';
import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { DocumentsService } from '../src/modules/documents/documents.service';
import { DependentsService } from '../src/modules/dependents/dependents.service';
import { TimelineService } from '../src/modules/timeline/timeline.service';
import { AuditService } from '../src/modules/audit/audit.service';
import { USER_REPOSITORY, type UserRepository } from '../src/repository/user.repository';
import {
  UNIT_OF_WORK_REPOSITORY,
  type UnitOfWorkRepository,
} from '../src/repository/unit-of-work.repository';
import { FILE_STORAGE_REPOSITORY } from '../src/repository/file-storage.repository';
import { MALWARE_SCANNER_REPOSITORY } from '../src/repository/malware-scanner.repository';
import { InMemoryFileStorage, FakeMalwareScanner } from './helpers/in-memory-documents';
import { documentDto, documentFile } from './helpers/document-fixture';
import { timelineQuery } from './helpers/timeline-fixture';
let module: TestingModule | undefined,
  prisma: PrismaService,
  users: UserRepository,
  documents: DocumentsService,
  dependents: DependentsService,
  transactions: UnitOfWorkRepository,
  timeline: TimelineService;
const storage = new InMemoryFileStorage(),
  userIds: string[] = [];
const originalQuota = process.env.DOCUMENT_MAX_STORED_FILES;
beforeAll(async () => {
  module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(FILE_STORAGE_REPOSITORY)
    .useValue(storage)
    .overrideProvider(MALWARE_SCANNER_REPOSITORY)
    .useValue(new FakeMalwareScanner())
    .compile();
  await module.init();
  prisma = module.get(PrismaService);
  users = module.get<UserRepository>(USER_REPOSITORY);
  transactions = module.get<UnitOfWorkRepository>(UNIT_OF_WORK_REPOSITORY);
  documents = module.get(DocumentsService);
  dependents = module.get(DependentsService);
  timeline = module.get(TimelineService);
});
afterEach(() => {
  jest.restoreAllMocks();
  if (originalQuota === undefined) delete process.env.DOCUMENT_MAX_STORED_FILES;
  else process.env.DOCUMENT_MAX_STORED_FILES = originalQuota;
  module?.get(ConfigService).set('DOCUMENT_MAX_STORED_FILES', Number(originalQuota ?? 500));
  if (originalQuota === undefined) delete process.env.DOCUMENT_MAX_STORED_FILES;
});
afterAll(async () => {
  try {
    if (prisma && userIds.length)
      await prisma.$transaction(async (tx) => {
        const children = await tx.dependent.findMany({
            where: { createdByUserId: { in: userIds } },
            select: { id: true },
          }),
          ids = children.map((row) => row.id);
        await tx.document.deleteMany({ where: { dependentId: { in: ids } } });
        await tx.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
        await tx.userDependentAccess.deleteMany({
          where: { OR: [{ userId: { in: userIds } }, { dependentId: { in: ids } }] },
        });
        await tx.dependent.deleteMany({ where: { id: { in: ids } } });
        await tx.user.deleteMany({ where: { id: { in: userIds } } });
      });
  } finally {
    await module?.close();
  }
});
async function actor() {
  const user = await users.create({
    name: 'Fixture',
    email: 'document-db-' + randomUUID() + '@example.com',
    passwordHash: 'fixture-no-login',
  });
  userIds.push(user.id);
  const child = await dependents.create(user.id, { fullName: 'Fixture', birthDate: '2020-01-01' });
  return { user, child };
}
async function fixture() {
  const a = await actor();
  const document = await documents.upload(
    a.user.id,
    a.child.id,
    documentDto({ documentDate: '2020-02-29' }),
    documentFile(),
  );
  return { ...a, document };
}
test('PostgreSQL: datas civis, MIME/size/checksum/key CHECKs, unicidade e FKs RESTRICT', async () => {
  const a = await fixture();
  expect(a.document.documentDate?.toISOString()).toBe('2020-02-29T00:00:00.000Z');
  for (const data of [
    { title: ' ' },
    { mimeType: 'text/html' },
    { size: 0 },
    { size: 20971521 },
    { checksum: 'forged' },
    { storageKey: '../secret' },
  ])
    await expect(prisma.document.update({ where: { id: a.document.id }, data })).rejects.toThrow();
  await expect(prisma.dependent.delete({ where: { id: a.child.id } })).rejects.toThrow();
  await expect(prisma.user.delete({ where: { id: a.user.id } })).rejects.toThrow();
  const data = { ...a.document, id: randomUUID() };
  await expect(prisma.document.create({ data })).rejects.toThrow();
});
test('PostgreSQL: BOLA, papéis, revogação, troca de dependente e soft delete do binário', async () => {
  const a = await fixture(),
    b = await actor();
  await expect(documents.download(b.user.id, a.child.id, a.document.id)).rejects.toThrow();
  await prisma.userDependentAccess.create({
    data: { userId: b.user.id, dependentId: a.child.id, role: 'VIEWER' },
  });
  expect((await documents.download(b.user.id, a.child.id, a.document.id)).bytes).toEqual(
    documentFile().buffer,
  );
  await expect(
    documents.update(b.user.id, a.child.id, a.document.id, { title: 'Denied' }),
  ).rejects.toThrow();
  await prisma.userDependentAccess.update({
    where: { userId_dependentId: { userId: b.user.id, dependentId: a.child.id } },
    data: { role: 'EDITOR' },
  });
  await documents.update(b.user.id, a.child.id, a.document.id, { title: 'Correction' });
  await expect(documents.delete(b.user.id, a.child.id, a.document.id)).rejects.toThrow();
  await expect(documents.find(a.user.id, b.child.id, a.document.id)).rejects.toThrow();
  await prisma.userDependentAccess.update({
    where: { userId_dependentId: { userId: b.user.id, dependentId: a.child.id } },
    data: { revokedAt: new Date() },
  });
  await expect(documents.download(b.user.id, a.child.id, a.document.id)).rejects.toThrow();
  await documents.delete(a.user.id, a.child.id, a.document.id);
  expect(await prisma.document.count({ where: { id: a.document.id } })).toBe(1);
  expect(storage.rows.has(a.document.storageKey)).toBe(true);
  await expect(documents.download(a.user.id, a.child.id, a.document.id)).rejects.toThrow();
});
test('PostgreSQL: falha de audit reverte metadados e compensa arquivo novo', async () => {
  const a = await actor(),
    before = storage.rows.size;
  jest.spyOn(module!.get(AuditService), 'record').mockRejectedValue(new Error('rollback fixture'));
  await expect(
    documents.upload(a.user.id, a.child.id, documentDto(), documentFile()),
  ).rejects.toThrow('rollback fixture');
  expect(await prisma.document.count({ where: { dependentId: a.child.id } })).toBe(0);
  expect(
    await prisma.auditLog.count({
      where: { dependentId: a.child.id, action: 'DOCUMENT_UPLOADED' },
    }),
  ).toBe(0);
  expect(storage.rows.size).toBe(before);
});
test('PostgreSQL: quota Serializable impede dois uploads simultâneos de ultrapassar limite', async () => {
  const a = await actor(),
    before = storage.rows.size;
  module!.get(ConfigService).set('DOCUMENT_MAX_STORED_FILES', 1);
  const results = await Promise.allSettled([
    documents.upload(a.user.id, a.child.id, documentDto(), documentFile()),
    documents.upload(a.user.id, a.child.id, documentDto(), documentFile()),
  ]);
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  expect(await prisma.document.count({ where: { dependentId: a.child.id } })).toBe(1);
  expect(storage.rows.size).toBe(before + 1);
  const row = await prisma.document.findFirstOrThrow({ where: { dependentId: a.child.id } });
  await documents.delete(a.user.id, a.child.id, row.id);
  await expect(
    documents.upload(a.user.id, a.child.id, documentDto(), documentFile()),
  ).rejects.toThrow();
});
test('PostgreSQL: keyset global com empate entre namespaces, filtros inclusivos e projeção mínima', async () => {
  const a = await fixture(),
    instant = new Date('2026-01-01T12:30:00.123Z');
  await prisma.dependent.update({ where: { id: a.child.id }, data: { createdAt: instant } });
  await prisma.document.update({ where: { id: a.document.id }, data: { createdAt: instant } });
  for (const order of ['asc', 'desc'] as const) {
    const ids: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await timeline.list(
        a.user.id,
        a.child.id,
        timelineQuery({ order, limit: 1, ...(cursor ? { cursor } : {}) }),
      );
      ids.push(...page.items.map((event) => event.id));
      cursor = page.nextCursor ?? undefined;
      expect(JSON.stringify(page)).not.toMatch(
        /fixture.png|Documento fictício|storageKey|checksum/,
      );
    } while (cursor);
    expect(new Set(ids).size).toBe(2);
    expect(ids).toEqual(order === 'asc' ? [...ids].sort() : [...ids].sort().reverse());
  }
  expect(
    (
      await timeline.list(
        a.user.id,
        a.child.id,
        timelineQuery({
          type: 'DOCUMENT_UPLOADED',
          from: instant.toISOString(),
          to: instant.toISOString(),
        }),
      )
    ).items,
  ).toHaveLength(1);
});
test('PostgreSQL: exportação OWNER selecionada, max+1 e omissão de documentos excluídos', async () => {
  const a = await fixture(),
    b = await fixture();
  await documents.upload(a.user.id, a.child.id, documentDto(), documentFile());
  const selected = await transactions.run((r) =>
    r.privacy.readExport(a.user.id, [a.child.id, b.child.id], 1),
  );
  expect(selected.documents).toHaveLength(2);
  expect(selected.documents.every((row) => row.dependentId === a.child.id)).toBe(true);
  expect(
    (await transactions.run((r) => r.privacy.readExport(a.user.id, [], 1000))).documents,
  ).toEqual([]);
  await documents.delete(a.user.id, a.child.id, a.document.id);
  expect(
    (
      await transactions.run((r) => r.privacy.readExport(a.user.id, [a.child.id], 1000))
    ).documents.map((row) => row.id),
  ).not.toContain(a.document.id);
});
