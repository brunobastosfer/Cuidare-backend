import { randomUUID } from 'node:crypto';
import { Test, type TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { MedicationsService } from '../src/modules/medications/medications.service';
import { DependentsService } from '../src/modules/dependents/dependents.service';
import { TimelineService } from '../src/modules/timeline/timeline.service';
import { USER_REPOSITORY, type UserRepository } from '../src/repository/user.repository';
import {
  UNIT_OF_WORK_REPOSITORY,
  type UnitOfWorkRepository,
} from '../src/repository/unit-of-work.repository';
import { treatmentDto } from './helpers/medication-fixture';
import { timelineQuery } from './helpers/timeline-fixture';
let module: TestingModule | undefined,
  prisma: PrismaService,
  users: UserRepository,
  transactions: UnitOfWorkRepository,
  dependents: DependentsService,
  medications: MedicationsService,
  timeline: TimelineService;
const userIds: string[] = [];
beforeAll(async () => {
  module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  await module.init();
  prisma = module.get(PrismaService);
  users = module.get<UserRepository>(USER_REPOSITORY);
  transactions = module.get<UnitOfWorkRepository>(UNIT_OF_WORK_REPOSITORY);
  dependents = module.get(DependentsService);
  medications = module.get(MedicationsService);
  timeline = module.get(TimelineService);
});
afterAll(async () => {
  try {
    if (prisma && userIds.length)
      await prisma.$transaction(async (tx) => {
        const children = await tx.dependent.findMany({
            where: { createdByUserId: { in: userIds } },
            select: { id: true },
          }),
          ids = children.map((d) => d.id);
        await tx.medicationTreatment.deleteMany({ where: { dependentId: { in: ids } } });
        await tx.medication.deleteMany({ where: { dependentId: { in: ids } } });
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
async function fixture() {
  const user = await users.create({
    name: 'Fixture',
    email: 'med-db-' + randomUUID() + '@example.com',
    passwordHash: 'fixture-no-login',
  });
  userIds.push(user.id);
  const child = await dependents.create(user.id, { fullName: 'Fixture', birthDate: '2020-01-01' });
  const product = await medications.createProduct(user.id, child.id, { name: 'Produto fictício' });
  return { user, child, product };
}
test('PostgreSQL: DATE/textos/estados e FK composta impedem mover produto entre dependentes', async () => {
  const a = await fixture(),
    b = await fixture();
  const row = await medications.createTreatment(a.user.id, a.child.id, treatmentDto(a.product.id));
  expect(row.startDate.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  expect(row.dosage).toBe('1 gota por kg');
  await expect(
    medications.createTreatment(a.user.id, a.child.id, treatmentDto(b.product.id)),
  ).rejects.toThrow('Medicamento não encontrado.');
  await expect(
    prisma.medicationTreatment.create({
      data: {
        dependentId: a.child.id,
        medicationId: b.product.id,
        dosage: 'Texto',
        unit: 'Texto',
        frequency: 'Texto',
        startDate: new Date('2026-01-01'),
      },
    }),
  ).rejects.toThrow();
  await expect(
    prisma.medicationTreatment.update({ where: { id: row.id }, data: { status: 'COMPLETED' } }),
  ).rejects.toThrow();
  await expect(
    prisma.medicationTreatment.update({
      where: { id: row.id },
      data: { endDate: new Date('2025-12-31') },
    }),
  ).rejects.toThrow();
  await expect(
    prisma.medication.create({ data: { dependentId: a.child.id, name: ' ' } }),
  ).rejects.toThrow();
  await expect(
    prisma.medicationTreatment.update({ where: { id: row.id }, data: { dosage: ' ' } }),
  ).rejects.toThrow();
});
test('PostgreSQL: autorização A/B/VIEWER/EDITOR, exclusão lógica e vínculo revogado', async () => {
  const a = await fixture(),
    b = await fixture();
  const row = await medications.createTreatment(a.user.id, a.child.id, treatmentDto(a.product.id));
  await expect(medications.findTreatment(b.user.id, a.child.id, row.id)).rejects.toThrow(
    'Dependente não encontrado.',
  );
  await prisma.userDependentAccess.create({
    data: { userId: b.user.id, dependentId: a.child.id, role: 'VIEWER' },
  });
  expect((await medications.findTreatment(b.user.id, a.child.id, row.id)).id).toBe(row.id);
  await expect(
    medications.updateTreatment(b.user.id, a.child.id, row.id, { notes: 'Negado' }),
  ).rejects.toThrow();
  await prisma.userDependentAccess.update({
    where: { userId_dependentId: { userId: b.user.id, dependentId: a.child.id } },
    data: { role: 'EDITOR' },
  });
  await medications.updateTreatment(b.user.id, a.child.id, row.id, { notes: 'Informado' });
  await expect(medications.deleteTreatment(b.user.id, a.child.id, row.id)).rejects.toThrow();
  await prisma.userDependentAccess.update({
    where: { userId_dependentId: { userId: b.user.id, dependentId: a.child.id } },
    data: { revokedAt: new Date() },
  });
  await expect(medications.findTreatment(b.user.id, a.child.id, row.id)).rejects.toThrow();
  await medications.deleteTreatment(a.user.id, a.child.id, row.id);
  expect(await prisma.medicationTreatment.count({ where: { id: row.id } })).toBe(1);
  await expect(medications.findTreatment(a.user.id, a.child.id, row.id)).rejects.toThrow(
    'Tratamento não encontrado.',
  );
});
test('PostgreSQL: timeline top-k/empates entre namespaces nas duas ordens e período UTC com hora', async () => {
  const f = await fixture();
  await medications.createTreatment(
    f.user.id,
    f.child.id,
    treatmentDto(f.product.id, { status: 'COMPLETED', endDate: '2026-01-01' }),
  );
  await medications.createTreatment(
    f.user.id,
    f.child.id,
    treatmentDto(f.product.id, { status: 'COMPLETED', endDate: '2026-01-03' }),
  );
  for (const order of ['asc', 'desc'] as const) {
    const ids: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await timeline.list(
        f.user.id,
        f.child.id,
        timelineQuery({ order, limit: 1, ...(cursor ? { cursor } : {}) }),
      );
      ids.push(...page.items.map((e) => e.id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(ids).toHaveLength(5);
    expect(new Set(ids).size).toBe(5);
  }
  const empty = await timeline.list(
    f.user.id,
    f.child.id,
    timelineQuery({ type: 'MEDICATION_STARTED', from: '2026-01-01T12:00:00Z' }),
  );
  expect(empty.items).toEqual([]);
  const exact = await timeline.list(
    f.user.id,
    f.child.id,
    timelineQuery({
      type: 'MEDICATION_STARTED',
      from: '2026-01-01T00:00:00Z',
      to: '2026-01-01T00:00:00Z',
    }),
  );
  expect(exact.items).toHaveLength(2);
});
test('PostgreSQL: transaction rollback em falha de audit e exportação OWNER minimizada', async () => {
  const f = await fixture();
  const count = await prisma.medication.count({ where: { dependentId: f.child.id } });
  await expect(
    transactions.run(async (r) => {
      const product = await r.medications.createProduct(f.child.id, 'Rollback');
      await r.auditLogs.append({
        actorId: randomUUID(),
        action: 'MEDICATION_CREATED',
        resourceType: 'MEDICATION',
        resourceId: product.id,
        dependentId: f.child.id,
        metadata: {},
      });
    }),
  ).rejects.toThrow();
  expect(await prisma.medication.count({ where: { dependentId: f.child.id } })).toBe(count);
  const row = await medications.createTreatment(f.user.id, f.child.id, treatmentDto(f.product.id));
  const snapshot = await transactions.run((r) =>
    r.privacy.readExport(f.user.id, [f.child.id], 100),
  );
  expect(snapshot.medicationTreatments.map((t) => t.id)).toEqual([row.id]);
  expect(
    (await transactions.run((r) => r.privacy.readExport(f.user.id, [], 100))).medications,
  ).toEqual([]);
});
test('PostgreSQL: remoção de produto versus criação concorrente nunca deixa tratamento visível órfão', async () => {
  const f = await fixture();
  const outcomes = await Promise.allSettled([
    medications.createTreatment(f.user.id, f.child.id, treatmentDto(f.product.id)),
    medications.deleteProduct(f.user.id, f.child.id, f.product.id),
  ]);
  expect(outcomes.filter((r) => r.status === 'fulfilled').length).toBeGreaterThanOrEqual(1);
  const product = await prisma.medication.findUniqueOrThrow({ where: { id: f.product.id } });
  const visible = await prisma.medicationTreatment.count({
    where: { medicationId: f.product.id, deletedAt: null },
  });
  expect(product.deletedAt === null || visible === 0).toBe(true);
});
