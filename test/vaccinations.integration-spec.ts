import { randomUUID } from 'node:crypto';
import { Test, type TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { USER_REPOSITORY, type UserRepository } from '../src/repository/user.repository';
import {
  VACCINATION_REPOSITORY,
  type VaccinationRepository,
} from '../src/repository/vaccination.repository';
import {
  UNIT_OF_WORK_REPOSITORY,
  type UnitOfWorkRepository,
} from '../src/repository/unit-of-work.repository';
import { DependentsService } from '../src/modules/dependents/dependents.service';
import { VaccinationsService } from '../src/modules/vaccinations/vaccinations.service';
import { TimelineService } from '../src/modules/timeline/timeline.service';
import { AuditService } from '../src/modules/audit/audit.service';
import { vaccinationView } from '../src/presentation/views/vaccination.view';
import { referenceFixture, vaccinationDto } from './helpers/vaccination-fixture';
import { InMemoryVaccinations } from './helpers/in-memory-vaccinations';
import { timelineQuery } from './helpers/timeline-fixture';
let module: TestingModule | undefined,
  prisma: PrismaService,
  users: UserRepository,
  dependents: DependentsService,
  vaccinations: VaccinationsService,
  repository: VaccinationRepository,
  transactions: UnitOfWorkRepository,
  timeline: TimelineService;
const userIds: string[] = [],
  catalogIds: string[] = [],
  scheduleIds: string[] = [];
beforeAll(async () => {
  module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  await module.init();
  prisma = module.get(PrismaService);
  users = module.get<UserRepository>(USER_REPOSITORY);
  dependents = module.get(DependentsService);
  vaccinations = module.get(VaccinationsService);
  repository = module.get<VaccinationRepository>(VACCINATION_REPOSITORY);
  transactions = module.get<UnitOfWorkRepository>(UNIT_OF_WORK_REPOSITORY);
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
          ids = children.map((row) => row.id);
        // Remover somente IDs criados por esta suite no banco exclusivo cuidare_test.
        await tx.dependentVaccination.deleteMany({ where: { dependentId: { in: ids } } });
        await tx.document.deleteMany({ where: { dependentId: { in: ids } } });
        await tx.vaccineScheduleDose.deleteMany({ where: { scheduleId: { in: scheduleIds } } });
        await tx.vaccineSchedule.deleteMany({ where: { id: { in: scheduleIds } } });
        await tx.vaccineCatalog.deleteMany({ where: { id: { in: catalogIds } } });
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
    email: 'vaccine-db-' + randomUUID() + '@example.com',
    passwordHash: 'fixture-no-login',
  });
  userIds.push(user.id);
  const child = await dependents.create(user.id, { fullName: 'Fixture', birthDate: '2020-02-29' });
  return { user, child };
}
async function fixture() {
  const a = await actor(),
    refs = referenceFixture(new InMemoryVaccinations(() => null, new Map()));
  catalogIds.push(refs.vaccine.id);
  scheduleIds.push(refs.schedule.id);
  // Conteúdo fictício exclusivamente no banco de testes. Não é importador nem seed de produção.
  const version = 'test-' + randomUUID();
  const vaccine = await prisma.vaccineCatalog.create({
    data: { ...refs.vaccine, sourceVersion: version },
  });
  const schedule = await prisma.vaccineSchedule.create({
    data: { ...refs.schedule, sourceVersion: version },
  });
  const ruleData = {
    id: refs.rule.id,
    scheduleId: schedule.id,
    vaccineId: vaccine.id,
    dose: refs.rule.dose,
    dueAgeMonths: refs.rule.dueAgeMonths,
    dueAgeDays: refs.rule.dueAgeDays,
  };
  const rule = await prisma.vaccineScheduleDose.create({ data: ruleData });
  const record = await vaccinations.create(a.user.id, a.child.id, vaccinationDto(vaccine.id));
  return { ...a, vaccine, schedule, rule, record };
}
test('PostgreSQL: CHECKs, unicidade de referências/doses, DATE UTC e FKs RESTRICT', async () => {
  const a = await fixture();
  expect(a.record.administeredAt.toISOString()).toBe('2021-02-28T00:00:00.000Z');
  for (const data of [
    { source: '' },
    { sourceVersion: ' ' },
    { validUntil: new Date('2019-01-01') },
  ])
    await expect(
      prisma.vaccineCatalog.update({ where: { id: a.vaccine.id }, data }),
    ).rejects.toThrow();
  for (const data of [{ dueAgeMonths: -1 }, { dueAgeDays: 367 }, { dose: ' ' }])
    await expect(
      prisma.vaccineScheduleDose.update({ where: { id: a.rule.id }, data }),
    ).rejects.toThrow();
  await expect(
    prisma.dependentVaccination.update({ where: { id: a.record.id }, data: { dose: ' ' } }),
  ).rejects.toThrow();
  await expect(
    prisma.vaccineCatalog.create({ data: { ...a.vaccine, id: randomUUID() } }),
  ).rejects.toThrow();
  await expect(
    prisma.vaccineScheduleDose.create({ data: { ...a.rule, id: randomUUID() } }),
  ).rejects.toThrow();
  await expect(prisma.vaccineCatalog.delete({ where: { id: a.vaccine.id } })).rejects.toThrow();
  await expect(prisma.dependent.delete({ where: { id: a.child.id } })).rejects.toThrow();
});
test('PostgreSQL: BOLA, roles, revogação, escopo cruzado e soft delete', async () => {
  const a = await fixture(),
    b = await actor();
  await expect(vaccinations.find(b.user.id, a.child.id, a.record.id)).rejects.toThrow();
  await prisma.userDependentAccess.create({
    data: { userId: b.user.id, dependentId: a.child.id, role: 'VIEWER' },
  });
  await vaccinations.find(b.user.id, a.child.id, a.record.id);
  await expect(
    vaccinations.update(b.user.id, a.child.id, a.record.id, { notes: 'X' }),
  ).rejects.toThrow();
  await prisma.userDependentAccess.update({
    where: { userId_dependentId: { userId: b.user.id, dependentId: a.child.id } },
    data: { role: 'EDITOR' },
  });
  await vaccinations.update(b.user.id, a.child.id, a.record.id, { notes: 'Correction' });
  await expect(vaccinations.delete(b.user.id, a.child.id, a.record.id)).rejects.toThrow();
  await expect(vaccinations.find(a.user.id, b.child.id, a.record.id)).rejects.toThrow();
  await prisma.userDependentAccess.update({
    where: { userId_dependentId: { userId: b.user.id, dependentId: a.child.id } },
    data: { revokedAt: new Date() },
  });
  await expect(vaccinations.find(b.user.id, a.child.id, a.record.id)).rejects.toThrow();
  await vaccinations.delete(a.user.id, a.child.id, a.record.id);
  expect(await prisma.dependentVaccination.count({ where: { id: a.record.id } })).toBe(1);
  await expect(vaccinations.find(a.user.id, a.child.id, a.record.id)).rejects.toThrow();
});
test('PostgreSQL: documento/dependente FK composta, exclusão lógica esconde só o vínculo', async () => {
  const a = await fixture(),
    b = await actor();
  const doc = await prisma.document.create({
    data: {
      dependentId: b.child.id,
      category: 'VACCINE_RECORD',
      title: 'Fixture',
      storageKey: randomUUID() + '.bin',
      originalFileName: 'test.pdf',
      mimeType: 'application/pdf',
      size: 20,
      checksum: 'a'.repeat(64),
      scannedAt: new Date(),
      createdByUserId: b.user.id,
    },
  });
  await expect(
    prisma.dependentVaccination.update({
      where: { id: a.record.id },
      data: { documentId: doc.id },
    }),
  ).rejects.toThrow();
  await expect(
    vaccinations.update(a.user.id, a.child.id, a.record.id, { documentId: doc.id }),
  ).rejects.toThrow();
  const ownDoc = await prisma.document.create({
    data: {
      ...doc,
      id: randomUUID(),
      dependentId: a.child.id,
      storageKey: randomUUID() + '.bin',
      createdByUserId: a.user.id,
    },
  });
  await vaccinations.update(a.user.id, a.child.id, a.record.id, { documentId: ownDoc.id });
  await expect(prisma.document.delete({ where: { id: ownDoc.id } })).rejects.toThrow();
  await prisma.document.update({ where: { id: ownDoc.id }, data: { deletedAt: new Date() } });
  expect(
    vaccinationView(await vaccinations.find(a.user.id, a.child.id, a.record.id)).documentId,
  ).toBeNull();
});
test('PostgreSQL: auditoria e registro são atômicos em criação/edição/exclusão', async () => {
  const a = await fixture();
  jest.spyOn(module!.get(AuditService), 'record').mockRejectedValue(new Error('rollback fixture'));
  await expect(
    vaccinations.create(a.user.id, a.child.id, vaccinationDto(a.vaccine.id)),
  ).rejects.toThrow('rollback fixture');
  await expect(
    vaccinations.update(a.user.id, a.child.id, a.record.id, { notes: 'X' }),
  ).rejects.toThrow('rollback fixture');
  await expect(vaccinations.delete(a.user.id, a.child.id, a.record.id)).rejects.toThrow(
    'rollback fixture',
  );
  expect(await prisma.dependentVaccination.count({ where: { dependentId: a.child.id } })).toBe(1);
  expect(
    await prisma.dependentVaccination.findUnique({ where: { id: a.record.id } }),
  ).toMatchObject({ notes: null, deletedAt: null });
});
test('PostgreSQL: timeline keyset global, filtro instantâneo e snapshot top-k', async () => {
  const a = await fixture();
  await vaccinations.create(a.user.id, a.child.id, vaccinationDto(a.vaccine.id));
  const first = await timeline.list(
    a.user.id,
    a.child.id,
    timelineQuery({ type: 'VACCINATION_RECORDED', limit: 1, order: 'asc' }),
  );
  expect(first.hasMore).toBe(true);
  const second = await timeline.list(
    a.user.id,
    a.child.id,
    timelineQuery({
      type: 'VACCINATION_RECORDED',
      limit: 1,
      order: 'asc',
      cursor: first.nextCursor!,
    }),
  );
  expect(second.items[0]?.id).not.toBe(first.items[0]?.id);
  expect(second.hasMore).toBe(false);
  expect(
    (
      await timeline.list(
        a.user.id,
        a.child.id,
        timelineQuery({ type: 'VACCINATION_RECORDED', from: '2021-02-28T00:00:00.001Z' }),
      )
    ).items,
  ).toEqual([]);
  const rows = await repository.readTimeline({
    userId: a.user.id,
    dependentId: a.child.id,
    from: null,
    to: null,
    type: null,
    order: 'asc',
    snapshotAt: new Date('2019-01-01'),
    after: null,
    take: 1,
  });
  expect(rows).toEqual([]);
});
test('PostgreSQL: comparação versionada e exportação escopada preservam histórico retirado', async () => {
  const a = await fixture();
  expect(
    (
      await vaccinations.scheduleStatus(a.user.id, a.child.id, {
        scheduleId: a.schedule.id,
        asOf: '2021-03-01',
      })
    ).items[0]?.status,
  ).toBe('REGISTRADA');
  await prisma.vaccineCatalog.update({
    where: { id: a.vaccine.id },
    data: { deletedAt: new Date() },
  });
  await expect(
    vaccinations.create(a.user.id, a.child.id, vaccinationDto(a.vaccine.id)),
  ).rejects.toThrow();
  await expect(
    vaccinations.scheduleStatus(a.user.id, a.child.id, { scheduleId: a.schedule.id }),
  ).rejects.toThrow();
  const exported = await transactions.run((r) =>
    r.privacy.readExport(a.user.id, [a.child.id], 100),
  );
  expect(exported.vaccinations[0]?.vaccine.sourceVersion).toBe(a.vaccine.sourceVersion);
  expect(
    (await transactions.run((r) => r.privacy.readExport(a.user.id, [], 100))).vaccinations,
  ).toEqual([]);
});
