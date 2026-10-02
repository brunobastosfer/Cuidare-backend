import type { Prisma } from '../../generated/prisma/client';
import {
  PrismaEducationRepository,
  educationScope,
  schoolReportInclude,
} from './prisma-education.repository';
import type { TimelineSourceQuery } from '../timeline-source.repository';
function fixture() {
  const delegate = () => ({
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({ id: 'created' }),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    updateManyAndReturn: jest.fn().mockResolvedValue([]),
  });
  const db = { schoolEnrollment: delegate(), schoolReport: delegate() };
  return { db, r: new PrismaEducationRepository(db as unknown as Prisma.TransactionClient) };
}
test('escopo ativo por dependente, usuário e acesso em leituras estáveis/paginadas', async () => {
  const f = fixture(),
    scope = educationScope('child', 'actor');
  expect(scope).toEqual({
    dependentId: 'child',
    deletedAt: null,
    dependent: {
      deletedAt: null,
      access: {
        some: { userId: 'actor', revokedAt: null, user: { deletedAt: null, status: 'ACTIVE' } },
      },
    },
  });
  await f.r.listEnrollments('child', 'actor', { limit: 3, offset: 2 });
  await f.r.findEnrollment('id', 'child', 'actor');
  expect(f.db.schoolEnrollment.findMany).toHaveBeenCalledWith({
    where: scope,
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    take: 3,
    skip: 2,
  });
  expect(f.db.schoolEnrollment.findFirst).toHaveBeenCalledWith({ where: { id: 'id', ...scope } });
  await f.r.listReports('child', 'actor', { limit: 3, offset: 2 });
  await f.r.findReport('id', 'child', 'actor');
  expect(f.db.schoolReport.findMany).toHaveBeenCalledWith({
    where: scope,
    include: schoolReportInclude,
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    take: 3,
    skip: 2,
  });
  expect(f.db.schoolReport.findFirst).toHaveBeenCalledWith({
    where: { id: 'id', ...scope },
    include: schoolReportInclude,
  });
  expect(scope).not.toHaveProperty('enrollment');
  expect(schoolReportInclude).toEqual({
    enrollment: { select: { id: true, deletedAt: true } },
    document: { select: { id: true, deletedAt: true } },
  });
});
test('updates allowlisted condicionam OWNER/EDITOR; exclusões OWNER no SQL', async () => {
  const f = fixture(),
    now = new Date();
  await f.r.updateEnrollment('id', 'child', 'actor', {
    grade: null,
    dependentId: 'forged',
    createdByUserId: 'forged',
    deletedAt: now,
  } as Parameters<typeof f.r.updateEnrollment>[3]);
  expect(f.db.schoolEnrollment.updateManyAndReturn).toHaveBeenCalledWith({
    where: { id: 'id', ...educationScope('child', 'actor', ['OWNER', 'EDITOR']) },
    data: { grade: null },
  });
  await f.r.updateReport('id', 'child', 'actor', {
    summary: null,
    enrollmentId: null,
    dependentId: 'forged',
    deletedAt: now,
  } as Parameters<typeof f.r.updateReport>[3]);
  expect(f.db.schoolReport.updateManyAndReturn).toHaveBeenCalledWith({
    where: { id: 'id', ...educationScope('child', 'actor', ['OWNER', 'EDITOR']) },
    data: { summary: null, enrollmentId: null },
    include: schoolReportInclude,
  });
  for (const [op, delegate] of [
    [f.r.deleteEnrollment.bind(f.r), f.db.schoolEnrollment],
    [f.r.deleteReport.bind(f.r), f.db.schoolReport],
  ] as const) {
    expect(await op('id', 'child', 'actor', now)).toBe(true);
    expect(delegate.updateMany).toHaveBeenCalledWith({
      where: { id: 'id', ...educationScope('child', 'actor', ['OWNER']) },
      data: { deletedAt: now },
    });
    delegate.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await op('id', 'child', 'actor', now)).toBe(false);
  }
});
test('criações enumeram campos sem persistir propriedades extras', async () => {
  const f = fixture(),
    e = {
      dependentId: 'child',
      createdByUserId: 'actor',
      schoolName: 'Fixture',
      schoolYear: 2025,
      grade: null,
      className: null,
      startDate: new Date('2025-01-01'),
      endDate: null,
    };
  await f.r.createEnrollment({ ...e, deletedAt: new Date(), role: 'OWNER' } as Parameters<
    typeof f.r.createEnrollment
  >[0]);
  expect(f.db.schoolEnrollment.create).toHaveBeenCalledWith({ data: e });
  const r = {
    dependentId: 'child',
    createdByUserId: 'actor',
    enrollmentId: null,
    title: 'Fixture',
    reportDate: new Date('2025-01-01'),
    summary: null,
    observations: null,
    documentId: null,
  };
  await f.r.createReport({ ...r, deletedAt: new Date(), school: {} } as Parameters<
    typeof f.r.createReport
  >[0]);
  expect(f.db.schoolReport.create).toHaveBeenCalledWith({ data: r, include: schoolReportInclude });
});
test.each(['asc', 'desc'] as const)(
  'timeline %s SQL top-k, projeção mínima e cursor DATE',
  async (order) => {
    const f = fixture(),
      id = '00000000-0000-4000-8000-000000000001',
      date = new Date('2025-01-02');
    const q: TimelineSourceQuery = {
      userId: 'actor',
      dependentId: 'child',
      from: new Date('2025-01-01T00:00:00.001Z'),
      to: new Date('2025-01-03T14:00:00Z'),
      type: null,
      order,
      snapshotAt: new Date(),
      after: { eventDate: date, id: 'school-report-recorded:' + id },
      take: 4,
    };
    await f.r.readTimeline(q);
    expect(f.db.schoolReport.findMany).toHaveBeenCalledWith({
      where: {
        ...educationScope('child', 'actor'),
        createdAt: { lte: q.snapshotAt },
        AND: [
          { reportDate: { gte: date } },
          { reportDate: { lte: new Date('2025-01-03') } },
          {
            OR: [
              { reportDate: { [order === 'asc' ? 'gt' : 'lt']: date } },
              { reportDate: date, id: { [order === 'asc' ? 'gt' : 'lt']: id } },
            ],
          },
        ],
      },
      select: { id: true, dependentId: true, reportDate: true, createdAt: true },
      orderBy: [{ reportDate: order }, { id: order }],
      take: 4,
    });
  },
);
