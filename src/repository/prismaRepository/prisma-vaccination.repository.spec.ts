import type { Prisma } from '../../generated/prisma/client';
import {
  PrismaVaccinationRepository,
  vaccinationScope,
  vaccinationInclude,
} from './prisma-vaccination.repository';
import { civilEventTimelineWhere } from './civil-event-timeline-where';
import type { TimelineSourceQuery } from '../timeline-source.repository';
function fixture() {
  const delegate = () => ({
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({ id: 'created' }),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    updateManyAndReturn: jest.fn().mockResolvedValue([]),
  });
  const db = {
    vaccineCatalog: delegate(),
    vaccineSchedule: delegate(),
    vaccineScheduleDose: delegate(),
    dependentVaccination: delegate(),
  };
  return {
    db,
    repository: new PrismaVaccinationRepository(db as unknown as Prisma.TransactionClient),
  };
}
const query: TimelineSourceQuery = {
  userId: 'actor',
  dependentId: 'child',
  from: null,
  to: null,
  type: null,
  order: 'asc',
  snapshotAt: new Date(),
  after: null,
  take: 4,
};
test('queries escopam usuário/conta/vínculo ativos e dependente não excluído', async () => {
  const f = fixture();
  expect(vaccinationScope('child', 'actor')).toEqual({
    dependentId: 'child',
    deletedAt: null,
    dependent: {
      deletedAt: null,
      access: {
        some: { userId: 'actor', revokedAt: null, user: { deletedAt: null, status: 'ACTIVE' } },
      },
    },
  });
  await f.repository.list('child', 'actor', { limit: 10, offset: 2 });
  expect(f.db.dependentVaccination.findMany).toHaveBeenCalledWith({
    where: vaccinationScope('child', 'actor'),
    include: vaccinationInclude,
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    take: 10,
    skip: 2,
  });
  await f.repository.find('id', 'child', 'actor');
  expect(f.db.dependentVaccination.findFirst).toHaveBeenCalledWith({
    where: { id: 'id', ...vaccinationScope('child', 'actor') },
    include: vaccinationInclude,
  });
});
test('referências são somente revisadas, não excluídas e consultas paginadas', async () => {
  const f = fixture();
  await f.repository.listCatalog({ limit: 10, offset: 2 });
  expect(f.db.vaccineCatalog.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { deletedAt: null, reviewedAt: { not: null, lte: expect.any(Date) as unknown } },
      take: 10,
      skip: 2,
    }),
  );
  await f.repository.findCatalog('id');
  expect(f.db.vaccineCatalog.findFirst).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({ id: 'id', deletedAt: null }) as unknown,
    }),
  );
  await f.repository.listSchedules({ limit: 5, offset: 0 }, 'PRIVATE_COMPLEMENTARY');
  expect(f.db.vaccineSchedule.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({ type: 'PRIVATE_COMPLEMENTARY' }) as unknown,
      take: 5,
    }),
  );
  await f.repository.listScheduleDoses('schedule', { limit: 11, offset: 0 });
  expect(f.db.vaccineScheduleDose.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        scheduleId: 'schedule',
        schedule: { deletedAt: null, reviewedAt: { not: null, lte: expect.any(Date) as unknown } },
      },
      include: { vaccine: true },
      take: 11,
    }),
  );
});
test('update e delete condicionam papéis no SQL; allowlist impede trocar referência/identidade', async () => {
  const f = fixture();
  await f.repository.update('id', 'child', 'actor', {
    notes: null,
    vaccineId: 'forged',
    dependentId: 'forged',
    createdByUserId: 'forged',
    deletedAt: new Date(),
  } as Parameters<typeof f.repository.update>[3]);
  expect(f.db.dependentVaccination.updateManyAndReturn).toHaveBeenCalledWith({
    where: { id: 'id', ...vaccinationScope('child', 'actor', ['OWNER', 'EDITOR']) },
    data: { notes: null },
    include: vaccinationInclude,
  });
  const now = new Date();
  await f.repository.delete('id', 'child', 'actor', now);
  expect(f.db.dependentVaccination.updateMany).toHaveBeenCalledWith({
    where: { id: 'id', ...vaccinationScope('child', 'actor', ['OWNER']) },
    data: { deletedAt: now },
  });
  f.db.dependentVaccination.updateMany.mockResolvedValueOnce({ count: 0 });
  expect(await f.repository.delete('id', 'child', 'actor', now)).toBe(false);
});
test('create enumera os campos sem mass assignment', async () => {
  const f = fixture(),
    data = {
      dependentId: 'child',
      vaccineId: 'vaccine',
      dose: 'TEST',
      administeredAt: new Date('2020-01-01'),
      institutionName: null,
      batchNumber: null,
      notes: null,
      documentId: null,
      createdByUserId: 'actor',
    };
  await f.repository.create({ ...data, role: 'OWNER', deletedAt: new Date() } as Parameters<
    typeof f.repository.create
  >[0]);
  expect(f.db.dependentVaccination.create).toHaveBeenCalledWith({
    data,
    include: vaccinationInclude,
  });
});
test('timeline SQL limita top-k, snapshot e projeta só metadata mínima', async () => {
  const f = fixture();
  await f.repository.readTimeline(query);
  expect(f.db.dependentVaccination.findMany).toHaveBeenCalledWith({
    where: { ...vaccinationScope('child', 'actor'), createdAt: { lte: query.snapshotAt }, AND: [] },
    select: { id: true, dependentId: true, administeredAt: true, createdAt: true },
    orderBy: [{ administeredAt: 'asc' }, { id: 'asc' }],
    take: 4,
  });
});
test('filtros de instantes preservam precisão DATE: ceil from e floor to', () => {
  expect(
    civilEventTimelineWhere(
      {
        ...query,
        from: new Date('2020-01-01T00:00:00.001Z'),
        to: new Date('2020-01-03T12:00:00Z'),
      },
      'administeredAt',
      'vaccination-recorded:',
    ),
  ).toEqual([
    { administeredAt: { gte: new Date('2020-01-02') } },
    { administeredAt: { lte: new Date('2020-01-03') } },
  ]);
});
test.each(['asc', 'desc'] as const)(
  'cursor DATE %s de outro namespace mantém comparação global',
  (order) => {
    const date = new Date('2020-01-01');
    const before = civilEventTimelineWhere(
      {
        ...query,
        order,
        after: { eventDate: date, id: 'document-uploaded:00000000-0000-4000-8000-000000000001' },
      },
      'administeredAt',
      'vaccination-recorded:',
    );
    expect(before).toEqual([
      {
        OR:
          order === 'asc'
            ? [{ administeredAt: { gt: date } }, { administeredAt: date }]
            : [{ administeredAt: { lt: date } }],
      },
    ]);
  },
);
test('cursor com horário não vira empate artificial de DATE', () => {
  expect(
    civilEventTimelineWhere(
      {
        ...query,
        after: {
          eventDate: new Date('2020-01-01T12:00:00Z'),
          id: 'vaccination-recorded:00000000-0000-4000-8000-000000000001',
        },
      },
      'administeredAt',
      'vaccination-recorded:',
    ),
  ).toEqual([{ OR: [{ administeredAt: { gt: new Date('2020-01-01') } }] }]);
});
