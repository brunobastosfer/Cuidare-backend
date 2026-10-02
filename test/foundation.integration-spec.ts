import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { DependentsService } from '../src/modules/dependents/dependents.service';
import { ConsentsService } from '../src/modules/consents/consents.service';
import { USER_REPOSITORY, type UserRepository } from '../src/repository/user.repository';
import {
  DEPENDENT_ACCESS_REPOSITORY,
  type DependentAccessRepository,
} from '../src/repository/dependent-access.repository';
import {
  UNIT_OF_WORK_REPOSITORY,
  type UnitOfWorkRepository,
} from '../src/repository/unit-of-work.repository';
import { RepositoryConflictError } from '../src/repository/errors/repository.error';

let module: TestingModule | undefined;
let prisma: PrismaService;
let users: UserRepository;
let access: DependentAccessRepository;
let dependents: DependentsService;
let consents: ConsentsService;
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
  consents = module.get(ConsentsService);
});
afterAll(async () => {
  try {
    if (prisma && userIds.length > 0) {
      // Cleanup apenas das fixtures desta suíte, na ordem das FKs RESTRICT.
      await prisma.$transaction(async (tx) => {
        const owned = await tx.dependent.findMany({
          where: { createdByUserId: { in: userIds } },
          select: { id: true },
        });
        const dependentIds = owned.map((row) => row.id);
        await tx.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
        await tx.consent.deleteMany({ where: { userId: { in: userIds } } });
        await tx.userDependentAccess.deleteMany({
          where: { OR: [{ userId: { in: userIds } }, { dependentId: { in: dependentIds } }] },
        });
        await tx.dependent.deleteMany({ where: { id: { in: dependentIds } } });
        await tx.user.deleteMany({ where: { id: { in: userIds } } });
      });
    }
  } finally {
    await module?.close();
  }
});
async function createUser() {
  const user = await users.create({
    name: 'Fixture',
    email: 'foundation-' + randomUUID() + '@example.com',
    passwordHash: 'fixture-only-not-for-login',
  });
  userIds.push(user.id);
  return user;
}

test('PostgreSQL mantém data civil, OWNER/audit atômicos, isolamento e permissões', async () => {
  const owner = await createUser();
  const other = await createUser();
  const dependent = await dependents.create(owner.id, {
    fullName: 'Fixture child',
    birthDate: '2020-02-29',
    relationship: 'PARENT',
  });
  expect(dependent.birthDate.toISOString()).toBe('2020-02-29T00:00:00.000Z');
  expect(await access.findActive(owner.id, dependent.id)).toMatchObject({
    role: 'OWNER',
    relationship: 'PARENT',
  });
  expect(await prisma.auditLog.findMany({ where: { dependentId: dependent.id } })).toEqual([
    expect.objectContaining({ action: 'DEPENDENT_CREATED', actorId: owner.id, metadata: {} }),
  ]);
  expect(await dependents.list(other.id, { limit: 50, offset: 0 })).toEqual([]);
  await expect(dependents.find(dependent.id, other.id)).rejects.toBeInstanceOf(NotFoundException);
  await expect(
    dependents.update(dependent.id, other.id, { fullName: 'No access' }),
  ).rejects.toBeInstanceOf(NotFoundException);
  await expect(dependents.remove(dependent.id, other.id)).rejects.toBeInstanceOf(NotFoundException);
  await access.create({
    userId: other.id,
    dependentId: dependent.id,
    role: 'VIEWER',
    relationship: null,
  });
  await expect(
    dependents.update(dependent.id, other.id, { fullName: 'Viewer denied' }),
  ).rejects.toBeInstanceOf(NotFoundException);
  await prisma.userDependentAccess.update({
    where: { userId_dependentId: { userId: other.id, dependentId: dependent.id } },
    data: { role: 'EDITOR' },
  });
  expect((await dependents.update(dependent.id, other.id, { preferredName: 'New' })).fullName).toBe(
    dependent.fullName,
  );
  await expect(dependents.remove(dependent.id, other.id)).rejects.toBeInstanceOf(NotFoundException);
  await expect(
    consents.accept(other.id, {
      type: 'TEST_DEPENDENT',
      policyVersion: 'v1',
      dependentId: dependent.id,
    }),
  ).rejects.toBeInstanceOf(NotFoundException);
  await prisma.userDependentAccess.update({
    where: { userId_dependentId: { userId: other.id, dependentId: dependent.id } },
    data: { revokedAt: new Date() },
  });
  await expect(dependents.find(dependent.id, other.id)).rejects.toBeInstanceOf(NotFoundException);
});

test('soft delete preserva consentimentos/audit e oculta leituras, sem apagar em cascade', async () => {
  const owner = await createUser();
  const dependent = await dependents.create(owner.id, {
    fullName: 'Fixture child',
    birthDate: '2020-01-01',
  });
  const consent = await consents.accept(owner.id, {
    type: 'TEST_DEPENDENT',
    policyVersion: 'v1',
    dependentId: dependent.id,
  });
  expect(
    await prisma.consent.findUnique({ where: { id: consent.id }, select: { metadata: true } }),
  ).toEqual({ metadata: { source: 'SELF_SERVICE' } });
  await dependents.remove(dependent.id, owner.id);
  expect(
    (await prisma.dependent.findUnique({ where: { id: dependent.id } }))?.deletedAt,
  ).toBeInstanceOf(Date);
  expect(await prisma.consent.count({ where: { id: consent.id } })).toBe(1);
  expect(await prisma.auditLog.count({ where: { dependentId: dependent.id } })).toBe(3);
  expect(await consents.list(owner.id, { limit: 50, offset: 0 })).toEqual([]);
  expect(await access.findActive(owner.id, dependent.id)).toBeNull();
  await expect(dependents.find(dependent.id, owner.id)).rejects.toBeInstanceOf(NotFoundException);
});

test('transação real desfaz entidade/vínculo/consentimento se audit violar FK', async () => {
  const owner = await createUser();
  const count = await prisma.dependent.count({ where: { createdByUserId: owner.id } });
  await expect(
    transactions.run(async (repositories) => {
      const dependent = await repositories.dependents.create({
        fullName: 'Rollback child',
        preferredName: null,
        birthDate: new Date('2020-01-01'),
        createdByUserId: owner.id,
      });
      await repositories.dependentAccess.create({
        userId: owner.id,
        dependentId: dependent.id,
        role: 'OWNER',
        relationship: null,
      });
      await repositories.consents.create({
        userId: owner.id,
        dependentId: dependent.id,
        type: 'TEST_DEPENDENT',
        policyVersion: 'v1',
      });
      await repositories.auditLogs.append({
        actorId: randomUUID(),
        action: 'DEPENDENT_CREATED',
        resourceType: 'DEPENDENT',
        resourceId: dependent.id,
        dependentId: dependent.id,
        metadata: {},
      });
    }),
  ).rejects.toThrow();
  expect(await prisma.dependent.count({ where: { createdByUserId: owner.id } })).toBe(count);
  expect(await prisma.userDependentAccess.count({ where: { userId: owner.id } })).toBe(0);
  expect(await prisma.consent.count({ where: { userId: owner.id } })).toBe(0);
});

test('user excluído não é retornado e email permanece único', async () => {
  const user = await createUser();
  await prisma.user.update({ where: { id: user.id }, data: { deletedAt: new Date() } });
  expect(await users.findById(user.id)).toBeNull();
  expect(await users.findByEmail(user.email)).toBeNull();
  await expect(
    users.create({ name: 'Duplicate', email: user.email.toUpperCase(), passwordHash: 'fixture' }),
  ).rejects.toBeInstanceOf(RepositoryConflictError);
});
