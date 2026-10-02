import { randomUUID } from 'node:crypto';
import { Test, type TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { AppointmentsService } from '../src/modules/appointments/appointments.service';
import { DependentsService } from '../src/modules/dependents/dependents.service';
import { TimelineService } from '../src/modules/timeline/timeline.service';
import { USER_REPOSITORY, type UserRepository } from '../src/repository/user.repository';
import {
  UNIT_OF_WORK_REPOSITORY,
  type UnitOfWorkRepository,
} from '../src/repository/unit-of-work.repository';
import { appointmentDto, recommendationDto } from './helpers/appointment-fixture';
import { timelineQuery } from './helpers/timeline-fixture';
let module: TestingModule | undefined,
  prisma: PrismaService,
  users: UserRepository,
  transactions: UnitOfWorkRepository,
  appointments: AppointmentsService,
  dependents: DependentsService,
  timeline: TimelineService;
const userIds: string[] = [];
beforeAll(async () => {
  module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  await module.init();
  prisma = module.get(PrismaService);
  users = module.get<UserRepository>(USER_REPOSITORY);
  transactions = module.get<UnitOfWorkRepository>(UNIT_OF_WORK_REPOSITORY);
  appointments = module.get(AppointmentsService);
  dependents = module.get(DependentsService);
  timeline = module.get(TimelineService);
});
afterAll(async () => {
  try {
    if (prisma && userIds.length)
      await prisma.$transaction(async (tx) => {
        const rows = await tx.dependent.findMany({
            where: { createdByUserId: { in: userIds } },
            select: { id: true },
          }),
          ids = rows.map((d) => d.id);
        await tx.medicalRecommendation.deleteMany({ where: { dependentId: { in: ids } } });
        await tx.appointment.deleteMany({ where: { dependentId: { in: ids } } });
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
    email: 'appointment-db-' + randomUUID() + '@example.com',
    passwordHash: 'fixture-no-login',
  });
  userIds.push(user.id);
  const child = await dependents.create(user.id, { fullName: 'Fixture', birthDate: '2020-01-01' });
  const appointment = await appointments.create(user.id, child.id, appointmentDto());
  return { user, child, appointment };
}
test('PostgreSQL: instantes/civil dates, FK composta e CHECKs sem campos vazios/períodos invertidos', async () => {
  const a = await fixture(),
    b = await fixture();
  const rec = await appointments.createRecommendation(
    a.user.id,
    a.child.id,
    a.appointment.id,
    recommendationDto(),
  );
  expect(a.appointment.date.toISOString()).toBe('2026-01-01T14:30:00.123Z');
  expect(rec.startDate.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  await expect(
    prisma.medicalRecommendation.create({
      data: {
        dependentId: a.child.id,
        appointmentId: b.appointment.id,
        title: 'Fixture',
        description: 'Fixture',
        startDate: new Date('2026-01-01'),
      },
    }),
  ).rejects.toThrow();
  await expect(
    prisma.medicalRecommendation.update({ where: { id: rec.id }, data: { status: 'COMPLETED' } }),
  ).rejects.toThrow();
  await expect(
    prisma.medicalRecommendation.update({
      where: { id: rec.id },
      data: { endDate: new Date('2025-01-01') },
    }),
  ).rejects.toThrow();
  await expect(
    prisma.medicalRecommendation.update({ where: { id: rec.id }, data: { title: ' ' } }),
  ).rejects.toThrow();
  await expect(
    prisma.appointment.update({ where: { id: a.appointment.id }, data: { reason: ' ' } }),
  ).rejects.toThrow();
  await expect(
    prisma.appointment.update({
      where: { id: a.appointment.id },
      data: { followUpDate: new Date('2025-01-01') },
    }),
  ).rejects.toThrow();
});
test('PostgreSQL: autorização A/B/VIEWER/EDITOR, IDs filhos, soft delete e revogação', async () => {
  const a = await fixture(),
    b = await fixture();
  const rec = await appointments.createRecommendation(
    a.user.id,
    a.child.id,
    a.appointment.id,
    recommendationDto(),
  );
  await expect(appointments.find(b.user.id, a.child.id, a.appointment.id)).rejects.toThrow();
  await prisma.userDependentAccess.create({
    data: { userId: b.user.id, dependentId: a.child.id, role: 'VIEWER' },
  });
  expect(
    (await appointments.findRecommendation(b.user.id, a.child.id, a.appointment.id, rec.id)).id,
  ).toBe(rec.id);
  await expect(
    appointments.updateRecommendation(b.user.id, a.child.id, a.appointment.id, rec.id, {
      title: 'Denied',
    }),
  ).rejects.toThrow();
  await prisma.userDependentAccess.update({
    where: { userId_dependentId: { userId: b.user.id, dependentId: a.child.id } },
    data: { role: 'EDITOR' },
  });
  await appointments.update(b.user.id, a.child.id, a.appointment.id, { notes: 'Correction' });
  await expect(
    appointments.deleteRecommendation(b.user.id, a.child.id, a.appointment.id, rec.id),
  ).rejects.toThrow();
  await expect(
    appointments.findRecommendation(a.user.id, a.child.id, b.appointment.id, rec.id),
  ).rejects.toThrow();
  await prisma.userDependentAccess.update({
    where: { userId_dependentId: { userId: b.user.id, dependentId: a.child.id } },
    data: { revokedAt: new Date() },
  });
  await expect(appointments.find(b.user.id, a.child.id, a.appointment.id)).rejects.toThrow();
  await appointments.deleteRecommendation(a.user.id, a.child.id, a.appointment.id, rec.id);
  await appointments.delete(a.user.id, a.child.id, a.appointment.id);
  expect(await prisma.medicalRecommendation.count({ where: { id: rec.id } })).toBe(1);
  expect(await prisma.appointment.count({ where: { id: a.appointment.id } })).toBe(1);
  await expect(
    appointments.findRecommendation(a.user.id, a.child.id, a.appointment.id, rec.id),
  ).rejects.toThrow();
});
test('PostgreSQL: rollback transacional reverte registro e audit', async () => {
  const a = await fixture(),
    marker = 'rollback-' + randomUUID();
  await expect(
    transactions.run(async (r) => {
      const rec = await r.appointments.createRecommendation({
        dependentId: a.child.id,
        appointmentId: a.appointment.id,
        title: marker,
        description: 'Fixture',
        status: 'PENDING',
        startDate: new Date('2026-01-01'),
        endDate: null,
        completedAt: null,
      });
      await r.auditLogs.append({
        actorId: a.user.id,
        dependentId: a.child.id,
        action: 'MEDICAL_RECOMMENDATION_CREATED',
        resourceType: 'MEDICAL_RECOMMENDATION',
        resourceId: rec.id,
        metadata: {},
      });
      throw new Error('rollback fixture');
    }),
  ).rejects.toThrow('rollback fixture');
  expect(
    await prisma.medicalRecommendation.count({ where: { dependentId: a.child.id, title: marker } }),
  ).toBe(0);
  expect(
    await prisma.auditLog.count({
      where: { actorId: a.user.id, action: 'MEDICAL_RECOMMENDATION_CREATED' },
    }),
  ).toBe(0);
});
test('PostgreSQL: keyset entre namespaces/empates nas duas ordens e filtro inclusivo com ms', async () => {
  const a = await fixture(),
    instant = new Date('2026-01-01T14:30:00.123Z');
  const rec = await appointments.createRecommendation(
    a.user.id,
    a.child.id,
    a.appointment.id,
    recommendationDto({ status: 'COMPLETED' }),
  );
  await prisma.dependent.update({ where: { id: a.child.id }, data: { createdAt: instant } });
  await prisma.appointment.update({
    where: { id: a.appointment.id },
    data: { createdAt: instant },
  });
  await prisma.medicalRecommendation.update({
    where: { id: rec.id },
    data: { createdAt: instant, completedAt: instant },
  });
  for (const order of ['asc', 'desc'] as const) {
    const ids: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await timeline.list(
        a.user.id,
        a.child.id,
        timelineQuery({ order, limit: 1, ...(cursor ? { cursor } : {}) }),
      );
      ids.push(...page.items.map((e) => e.id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(4);
    expect(ids).toEqual(order === 'asc' ? [...ids].sort() : [...ids].sort().reverse());
  }
  expect(
    (
      await timeline.list(
        a.user.id,
        a.child.id,
        timelineQuery({
          type: 'APPOINTMENT_RECORDED',
          from: instant.toISOString(),
          to: instant.toISOString(),
        }),
      )
    ).items,
  ).toHaveLength(1);
  expect(
    (
      await timeline.list(
        a.user.id,
        a.child.id,
        timelineQuery({ type: 'APPOINTMENT_RECORDED', from: '2026-01-01T14:30:00.124Z' }),
      )
    ).items,
  ).toEqual([]);
});
test('PostgreSQL: criação concorrente com exclusão do pai não deixa filho ativo sob pai excluído', async () => {
  const a = await fixture();
  const results = await Promise.allSettled([
    appointments.createRecommendation(a.user.id, a.child.id, a.appointment.id, recommendationDto()),
    appointments.delete(a.user.id, a.child.id, a.appointment.id),
  ]);
  expect(results.filter((r) => r.status === 'fulfilled').length).toBe(1);
  const parent = await prisma.appointment.findUniqueOrThrow({ where: { id: a.appointment.id } });
  const active = await prisma.medicalRecommendation.count({
    where: { appointmentId: parent.id, deletedAt: null },
  });
  expect(Boolean(parent.deletedAt) && active > 0).toBe(false);
});
test('PostgreSQL: exportação seleciona OWNER, omite excluídos e respeita limite max+1', async () => {
  const a = await fixture(),
    b = await fixture();
  const rec = await appointments.createRecommendation(
    a.user.id,
    a.child.id,
    a.appointment.id,
    recommendationDto(),
  );
  const own = await transactions.run((r) =>
    r.privacy.readExport(a.user.id, [a.child.id, b.child.id], 1000),
  );
  expect(own.appointments.map((row) => row.id)).toEqual([a.appointment.id]);
  expect(own.medicalRecommendations.map((row) => row.id)).toEqual([rec.id]);
  expect(
    (await transactions.run((r) => r.privacy.readExport(a.user.id, [], 1000))).appointments,
  ).toEqual([]);
  await appointments.create(a.user.id, a.child.id, appointmentDto());
  expect(
    (await transactions.run((r) => r.privacy.readExport(a.user.id, [a.child.id], 1))).appointments,
  ).toHaveLength(2);
  await appointments.deleteRecommendation(a.user.id, a.child.id, a.appointment.id, rec.id);
  expect(
    (await transactions.run((r) => r.privacy.readExport(a.user.id, [a.child.id], 1000)))
      .medicalRecommendations,
  ).toEqual([]);
});
