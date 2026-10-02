import { randomUUID } from 'node:crypto';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaDocumentRepository, documentScope } from './prisma-document.repository';
import { dependentScope } from './dependent-scope';
import { instantTimelineWhere } from './instant-timeline-where';
import type { TimelineSourceQuery } from '../timeline-source.repository';
function fixture() {
  const db = {
    document: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ mimeType: 'image/png' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      updateManyAndReturn: jest.fn().mockResolvedValue([]),
      aggregate: jest.fn().mockResolvedValue({ _count: { id: 2 }, _sum: { size: 100 } }),
    },
  };
  return {
    db,
    repository: new PrismaDocumentRepository(db as unknown as Prisma.TransactionClient),
  };
}
const query: TimelineSourceQuery = {
  userId: 'actor',
  dependentId: 'child',
  from: null,
  to: null,
  order: 'asc',
  type: null,
  after: null,
  snapshotAt: new Date(),
  take: 3,
};
test('leituras exigem vínculo ativo e soft delete; quota inclui bytes retidos', async () => {
  const { db, repository } = fixture();
  await repository.find('id', 'child', 'actor');
  expect(db.document.findFirst).toHaveBeenCalledWith({
    where: { id: 'id', ...documentScope('child', 'actor') },
  });
  expect(documentScope('child', 'actor')).toEqual({
    dependentId: 'child',
    deletedAt: null,
    dependent: {
      deletedAt: null,
      access: {
        some: { userId: 'actor', revokedAt: null, user: { status: 'ACTIVE', deletedAt: null } },
      },
    },
  });
  await repository.list('child', 'actor', { limit: 5, offset: 2 });
  expect(db.document.findMany).toHaveBeenCalledWith({
    where: documentScope('child', 'actor'),
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    take: 5,
    skip: 2,
  });
  expect(await repository.storageUsage('child', 'actor')).toEqual({ files: 2, bytes: 100 });
  expect(db.document.aggregate).toHaveBeenCalledWith({
    where: { dependentId: 'child', dependent: dependentScope('actor', ['OWNER', 'EDITOR']) },
    _count: { id: true },
    _sum: { size: true },
  });
});
test('criação/alteração enumeram campos e não aceitam identidade, movimentação ou replace de conteúdo', async () => {
  const { db, repository } = fixture();
  const data = {
    dependentId: 'child',
    category: 'OTHER' as const,
    title: 'Fixture',
    description: null,
    storageKey: randomUUID() + '.bin',
    originalFileName: 'fixture.png',
    mimeType: 'image/png' as const,
    size: 50,
    checksum: 'a'.repeat(64),
    createdByUserId: 'actor',
    documentDate: null,
    scannedAt: new Date(),
  };
  await repository.create({ ...data, id: 'client', deletedAt: new Date() } as Parameters<
    typeof repository.create
  >[0]);
  expect(db.document.create).toHaveBeenCalledWith({ data });
  await repository.update('id', 'child', 'actor', {
    title: 'Correction',
    description: null,
    storageKey: '../secret',
    dependentId: 'foreign',
    checksum: 'forged',
  } as Parameters<typeof repository.update>[3]);
  expect(db.document.updateManyAndReturn).toHaveBeenCalledWith({
    where: { id: 'id', ...documentScope('child', 'actor', ['OWNER', 'EDITOR']) },
    data: { title: 'Correction', description: null },
  });
  const now = new Date();
  expect(await repository.delete('id', 'child', 'actor', now)).toBe(true);
  expect(db.document.updateMany).toHaveBeenCalledWith({
    where: { id: 'id', ...documentScope('child', 'actor', ['OWNER']) },
    data: { deletedAt: now },
  });
});
test('MIME inesperado do banco falha fechado', async () => {
  const { db, repository } = fixture();
  db.document.findFirst.mockResolvedValueOnce({ mimeType: 'text/html' });
  await expect(repository.find('id', 'child', 'actor')).rejects.toThrow();
});
test('projeção de timeline é mínima e aplica keyset/top-k no SQL', async () => {
  const { db, repository } = fixture();
  await repository.readTimeline(query);
  expect(db.document.findMany).toHaveBeenCalledWith({
    where: { ...documentScope('child', 'actor'), createdAt: { lte: query.snapshotAt }, AND: [] },
    select: { id: true, dependentId: true, createdAt: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: 3,
  });
});
test.each(['asc', 'desc'] as const)(
  'keyset global %s com outros namespaces e datas inclusivas',
  (order) => {
    const now = new Date('2026-01-01T12:00:00.123Z'),
      id = randomUUID(),
      op = order === 'asc' ? 'gt' : 'lt';
    expect(
      instantTimelineWhere(
        { ...query, order, after: { eventDate: now, id: 'document-uploaded:' + id } },
        'createdAt',
        'document-uploaded:',
      ),
    ).toEqual([{ OR: [{ createdAt: { [op]: now } }, { createdAt: now, id: { [op]: id } }] }]);
    expect(
      instantTimelineWhere(
        { ...query, order, after: { eventDate: now, id: 'dependent-created:' + id } },
        'createdAt',
        'document-uploaded:',
      ),
    ).toEqual([
      { OR: [{ createdAt: { [op]: now } }, ...(order === 'asc' ? [{ createdAt: now }] : [])] },
    ]);
    expect(
      instantTimelineWhere({ ...query, from: now, to: now }, 'createdAt', 'document-uploaded:'),
    ).toEqual([{ createdAt: { gte: now } }, { createdAt: { lte: now } }]);
    expect(() =>
      instantTimelineWhere(
        { ...query, after: { eventDate: now, id: 'document-uploaded:invalid' } },
        'createdAt',
        'document-uploaded:',
      ),
    ).toThrow();
  },
);
