import { randomUUID } from 'node:crypto';
import { Test, type TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { DependentsService } from '../src/modules/dependents/dependents.service';
import { TimelineService } from '../src/modules/timeline/timeline.service';
import { DependentTimelineSource } from '../src/modules/dependents/dependent-timeline.source';
import { USER_REPOSITORY, type UserRepository } from '../src/repository/user.repository';
import {
  DEPENDENT_ACCESS_REPOSITORY,
  type DependentAccessRepository,
} from '../src/repository/dependent-access.repository';
import {
  UNIT_OF_WORK_REPOSITORY,
  type UnitOfWorkRepository,
} from '../src/repository/unit-of-work.repository';
import { timelineQuery } from './helpers/timeline-fixture';

let module: TestingModule | undefined;
let prisma: PrismaService;
let users: UserRepository;
let access: DependentAccessRepository;
let dependents: DependentsService;
let timeline: TimelineService;
let source: DependentTimelineSource;
let transactions: UnitOfWorkRepository;
const userIds: string[] = [];
beforeAll(async () => {
  module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  await module.init();
  prisma = module.get(PrismaService);
  users = module.get<UserRepository>(USER_REPOSITORY);
  access = module.get<DependentAccessRepository>(DEPENDENT_ACCESS_REPOSITORY);
  transactions = module.get<UnitOfWorkRepository>(UNIT_OF_WORK_REPOSITORY);
  dependents = module.get(DependentsService);
  timeline = module.get(TimelineService);
  source = module.get(DependentTimelineSource);
});
afterAll(async () => {
  try {
    if (prisma && userIds.length)
      await prisma.$transaction(async (tx) => {
        const owned = await tx.dependent.findMany({
          where: { createdByUserId: { in: userIds } },
          select: { id: true },
        });
        const ids = owned.map((row) => row.id);
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
    email: 'timeline-db-' + randomUUID() + '@example.com',
    passwordHash: 'fixture-no-login',
  });
  userIds.push(user.id);
  return user;
}
test('PostgreSQL projeta criação UTC, aplica período e fonte conserva escopo autorizado', async () => {
  const owner = await actor();
  const other = await actor();
  const child = await dependents.create(owner.id, { fullName: 'Fixture', birthDate: '2020-02-29' });
  const page = await timeline.list(
    owner.id,
    child.id,
    timelineQuery({
      from: child.createdAt.toISOString(),
      to: child.createdAt.toISOString(),
      type: 'DEPENDENT_CREATED',
    }),
  );
  expect(page.items).toEqual([
    expect.objectContaining({ sourceId: child.id, eventDate: child.createdAt, summary: null }),
  ]);
  expect(page).toMatchObject({ hasMore: false, nextCursor: null });
  await expect(timeline.list(other.id, child.id, timelineQuery())).rejects.toThrow(
    'Dependente não encontrado.',
  );
  const query = {
    userId: other.id,
    dependentId: child.id,
    from: null,
    to: null,
    type: null,
    order: 'desc' as const,
    snapshotAt: new Date(),
    after: null,
    take: 2,
  };
  expect(await transactions.run((repositories) => source.list(query, repositories))).toEqual([]);
});
test('PostgreSQL permite VIEWER/EDITOR, revogação e soft delete sem expor trilha de audit', async () => {
  const owner = await actor();
  const other = await actor();
  const child = await dependents.create(owner.id, { fullName: 'Fixture', birthDate: '2020-01-01' });
  await access.create({
    userId: other.id,
    dependentId: child.id,
    role: 'VIEWER',
    relationship: null,
  });
  expect((await timeline.list(other.id, child.id, timelineQuery())).items).toHaveLength(1);
  await prisma.userDependentAccess.update({
    where: { userId_dependentId: { userId: other.id, dependentId: child.id } },
    data: { role: 'EDITOR' },
  });
  await dependents.update(child.id, other.id, { preferredName: 'Fixture edit' });
  expect((await timeline.list(other.id, child.id, timelineQuery())).items).toHaveLength(1);
  await prisma.userDependentAccess.update({
    where: { userId_dependentId: { userId: other.id, dependentId: child.id } },
    data: { revokedAt: new Date() },
  });
  await expect(timeline.list(other.id, child.id, timelineQuery())).rejects.toThrow(
    'Dependente não encontrado.',
  );
  await dependents.remove(child.id, owner.id);
  await expect(timeline.list(owner.id, child.id, timelineQuery())).rejects.toThrow(
    'Dependente não encontrado.',
  );
  expect(await prisma.dependent.count({ where: { id: child.id } })).toBe(1);
  expect(await prisma.auditLog.count({ where: { dependentId: child.id } })).toBe(3);
});
