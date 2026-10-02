import { randomUUID } from 'node:crypto';
import { Test, type TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { USER_REPOSITORY, type UserRepository } from '../src/repository/user.repository';
import {
  EDUCATION_REPOSITORY,
  type EducationRepository,
} from '../src/repository/education.repository';
import { PRIVACY_REPOSITORY, type PrivacyRepository } from '../src/repository/privacy.repository';
import { DependentsService } from '../src/modules/dependents/dependents.service';
import { EducationService } from '../src/modules/education/education.service';
import { AuditService } from '../src/modules/audit/audit.service';
import { TimelineService } from '../src/modules/timeline/timeline.service';
import { schoolReportView, enrollmentView } from '../src/presentation/views/education.view';
import { enrollmentDto, reportDto } from './helpers/education-fixture';
import { timelineQuery } from './helpers/timeline-fixture';
let module: TestingModule | undefined,
  prisma: PrismaService,
  users: UserRepository,
  dependents: DependentsService,
  education: EducationService,
  repository: EducationRepository,
  privacy: PrivacyRepository,
  timeline: TimelineService;
const userIds: string[] = [];
beforeAll(async () => {
  module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  await module.init();
  prisma = module.get(PrismaService);
  users = module.get<UserRepository>(USER_REPOSITORY);
  dependents = module.get(DependentsService);
  education = module.get(EducationService);
  repository = module.get<EducationRepository>(EDUCATION_REPOSITORY);
  privacy = module.get<PrivacyRepository>(PRIVACY_REPOSITORY);
  timeline = module.get(TimelineService);
});
afterEach(() => jest.restoreAllMocks());
afterAll(async () => {
  try {
    if (prisma && userIds.length)
      await prisma.$transaction(async (tx) => {
        const children = await tx.dependent.findMany({
            where: { createdByUserId: { in: userIds } },
            select: { id: true },
          }),
          ids = children.map((r) => r.id);
        // Somente IDs desta suite, no banco exclusivo cuidare_test.
        await tx.schoolReport.deleteMany({ where: { dependentId: { in: ids } } });
        await tx.schoolEnrollment.deleteMany({ where: { dependentId: { in: ids } } });
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
    email: 'education-db-' + randomUUID() + '@example.com',
    passwordHash: 'fixture-no-login',
  });
  userIds.push(user.id);
  return {
    user,
    child: await dependents.create(user.id, { fullName: 'Fixture', birthDate: '2020-02-29' }),
  };
}
async function fixture() {
  const a = await actor(),
    enrollment = await education.createEnrollment(a.user.id, a.child.id, enrollmentDto()),
    report = await education.createReport(
      a.user.id,
      a.child.id,
      reportDto({ enrollmentId: enrollment.id }),
    );
  return { ...a, enrollment, report };
}
test('PostgreSQL: CHECKs, DATE UTC e matrícula/dependente FK composta RESTRICT', async () => {
  const a = await fixture(),
    b = await fixture();
  expect(a.enrollment.startDate.toISOString()).toBe('2025-01-01T00:00:00.000Z');
  expect(a.report.reportDate.toISOString()).toBe('2025-06-01T00:00:00.000Z');
  for (const data of [
    { schoolName: ' ' },
    { schoolYear: 0 },
    { schoolYear: 10000 },
    { grade: ' ' },
    { className: '' },
    { endDate: new Date('2024-01-01') },
  ])
    await expect(
      prisma.schoolEnrollment.update({ where: { id: a.enrollment.id }, data }),
    ).rejects.toThrow();
  for (const data of [
    { title: ' ' },
    { summary: '' },
    { observations: ' ' },
    { enrollmentId: b.enrollment.id },
  ])
    await expect(
      prisma.schoolReport.update({ where: { id: a.report.id }, data }),
    ).rejects.toThrow();
  await expect(
    prisma.schoolEnrollment.delete({ where: { id: a.enrollment.id } }),
  ).rejects.toThrow();
  await expect(prisma.dependent.delete({ where: { id: a.child.id } })).rejects.toThrow();
});
test('PostgreSQL: BOLA, papéis, revogação e matrícula soft delete preserva relatório', async () => {
  const a = await fixture(),
    b = await actor();
  await expect(education.findReport(b.user.id, a.child.id, a.report.id)).rejects.toThrow();
  const access = await prisma.userDependentAccess.create({
    data: { userId: b.user.id, dependentId: a.child.id, role: 'VIEWER' },
  });
  await education.findEnrollment(b.user.id, a.child.id, a.enrollment.id);
  await education.findReport(b.user.id, a.child.id, a.report.id);
  await expect(
    education.updateEnrollment(b.user.id, a.child.id, a.enrollment.id, { grade: 'G' }),
  ).rejects.toThrow();
  await prisma.userDependentAccess.update({ where: { id: access.id }, data: { role: 'EDITOR' } });
  await education.updateReport(b.user.id, a.child.id, a.report.id, { summary: 'Correção' });
  await expect(education.deleteReport(b.user.id, a.child.id, a.report.id)).rejects.toThrow();
  await expect(education.findReport(a.user.id, b.child.id, a.report.id)).rejects.toThrow();
  await prisma.userDependentAccess.update({
    where: { id: access.id },
    data: { revokedAt: new Date() },
  });
  await expect(education.findReport(b.user.id, a.child.id, a.report.id)).rejects.toThrow();
  await education.deleteEnrollment(a.user.id, a.child.id, a.enrollment.id);
  expect(
    schoolReportView(await education.findReport(a.user.id, a.child.id, a.report.id)).enrollmentId,
  ).toBeNull();
  await education.updateReport(a.user.id, a.child.id, a.report.id, { title: 'Correção' });
  await expect(
    education.updateReport(a.user.id, a.child.id, a.report.id, { enrollmentId: a.enrollment.id }),
  ).rejects.toThrow();
  expect(await prisma.schoolEnrollment.count({ where: { id: a.enrollment.id } })).toBe(1);
});
test('PostgreSQL: documento FK composta, soft delete, reatribuição e projeção segura', async () => {
  const a = await fixture(),
    b = await actor();
  const doc = await prisma.document.create({
    data: {
      dependentId: b.child.id,
      createdByUserId: b.user.id,
      category: 'SCHOOL_REPORT',
      title: 'Fixture',
      storageKey: randomUUID() + '.bin',
      originalFileName: 'test.pdf',
      mimeType: 'application/pdf',
      size: 20,
      checksum: 'a'.repeat(64),
      scannedAt: new Date(),
    },
  });
  await expect(
    prisma.schoolReport.update({ where: { id: a.report.id }, data: { documentId: doc.id } }),
  ).rejects.toThrow();
  await expect(
    education.updateReport(a.user.id, a.child.id, a.report.id, { documentId: doc.id }),
  ).rejects.toThrow();
  const own = await prisma.document.create({
    data: {
      ...doc,
      id: randomUUID(),
      dependentId: a.child.id,
      createdByUserId: a.user.id,
      storageKey: randomUUID() + '.bin',
    },
  });
  await education.updateReport(a.user.id, a.child.id, a.report.id, { documentId: own.id });
  await expect(prisma.document.delete({ where: { id: own.id } })).rejects.toThrow();
  await prisma.document.update({ where: { id: own.id }, data: { deletedAt: new Date() } });
  expect(
    schoolReportView(await education.findReport(a.user.id, a.child.id, a.report.id)).documentId,
  ).toBeNull();
  await education.updateReport(a.user.id, a.child.id, a.report.id, { summary: 'Correção' });
  await education.updateReport(a.user.id, a.child.id, a.report.id, {
    documentId: null,
    enrollmentId: null,
  });
});
test('PostgreSQL: todas as seis mutações são atômicas com auditoria', async () => {
  const a = await fixture(),
    u = a.user.id,
    d = a.child.id;
  jest.spyOn(module!.get(AuditService), 'record').mockRejectedValue(new Error('rollback fixture'));
  for (const op of [
    () => education.createEnrollment(u, d, enrollmentDto()),
    () => education.updateEnrollment(u, d, a.enrollment.id, { schoolName: 'Changed' }),
    () => education.deleteEnrollment(u, d, a.enrollment.id),
    () => education.createReport(u, d, reportDto()),
    () => education.updateReport(u, d, a.report.id, { title: 'Changed' }),
    () => education.deleteReport(u, d, a.report.id),
  ])
    await expect(op()).rejects.toThrow('rollback fixture');
  expect(await prisma.schoolEnrollment.count({ where: { dependentId: d } })).toBe(1);
  expect(await prisma.schoolReport.count({ where: { dependentId: d } })).toBe(1);
  expect(
    await prisma.schoolEnrollment.findUnique({ where: { id: a.enrollment.id } }),
  ).toMatchObject({ schoolName: 'Escola fictícia', deletedAt: null });
  expect(await prisma.schoolReport.findUnique({ where: { id: a.report.id } })).toMatchObject({
    title: 'Relatório fictício',
    deletedAt: null,
  });
});
test.each(['asc', 'desc'] as const)(
  'PostgreSQL: timeline %s keyset DATE global, filtros e top-k',
  async (order) => {
    const a = await fixture(),
      u = a.user.id,
      d = a.child.id;
    await education.createReport(u, d, reportDto());
    await education.createReport(u, d, reportDto({ reportDate: '2025-06-02' }));
    let page = await timeline.list(
      u,
      d,
      timelineQuery({ limit: 1, order, type: 'SCHOOL_REPORT_RECORDED' }),
    );
    const ids = page.items.map((e) => e.sourceId);
    const late = await education.createReport(u, d, reportDto({ reportDate: '2025-01-01' }));
    await prisma.schoolReport.update({
      where: { id: late.id },
      data: { createdAt: new Date(Date.now() + 1000) },
    });
    while (page.nextCursor) {
      page = await timeline.list(
        u,
        d,
        timelineQuery({ limit: 1, order, type: 'SCHOOL_REPORT_RECORDED', cursor: page.nextCursor }),
      );
      ids.push(...page.items.map((e) => e.sourceId));
    }
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
    expect(
      (
        await timeline.list(
          u,
          d,
          timelineQuery({
            type: 'SCHOOL_REPORT_RECORDED',
            from: '2025-06-01T00:00:00.001Z',
            to: '2025-06-02T13:00:00Z',
          }),
        )
      ).items,
    ).toHaveLength(1);
    const rows = await repository.readTimeline({
      userId: u,
      dependentId: d,
      type: null,
      from: null,
      to: null,
      order,
      snapshotAt: new Date(),
      after: null,
      take: 1,
    });
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0]!).sort()).toEqual(['createdAt', 'dependentId', 'id', 'reportDate']);
  },
);
test('PostgreSQL: exportação OWNER opt-in, max+1 e registros independentes de matrícula', async () => {
  const a = await fixture(),
    b = await actor();
  expect((await privacy.readExport(a.user.id, [], 10)).schoolReports).toEqual([]);
  expect((await privacy.readExport(b.user.id, [a.child.id], 10)).schoolReports).toEqual([]);
  const first = await privacy.readExport(a.user.id, [a.child.id], 10);
  expect(enrollmentView(first.schoolEnrollments[0]!)).not.toHaveProperty('createdByUserId');
  expect(schoolReportView(first.schoolReports[0]!)).not.toHaveProperty('document');
  await education.createReport(a.user.id, a.child.id, reportDto());
  expect((await privacy.readExport(a.user.id, [a.child.id], 1)).schoolReports).toHaveLength(2);
  await education.deleteEnrollment(a.user.id, a.child.id, a.enrollment.id);
  const second = await privacy.readExport(a.user.id, [a.child.id], 10);
  expect(second.schoolEnrollments).toEqual([]);
  expect(second.schoolReports).toHaveLength(2);
  expect(
    schoolReportView(second.schoolReports.find((r) => r.id === a.report.id)!).enrollmentId,
  ).toBeNull();
  await education.deleteReport(a.user.id, a.child.id, a.report.id);
  expect((await privacy.readExport(a.user.id, [a.child.id], 10)).schoolReports).toHaveLength(1);
});
