import { randomUUID } from 'node:crypto';
import { Test, type TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { USER_REPOSITORY, type UserRepository } from '../src/repository/user.repository';
import {
  CARE_TASK_REPOSITORY,
  type CareTaskRepository,
} from '../src/repository/care-task.repository';
import { RepositoryConflictError } from '../src/repository/errors/repository.error';

let module: TestingModule;
let prisma: PrismaService;
let users: UserRepository;
let tasks: CareTaskRepository;
const createdUserIds: string[] = [];

beforeAll(async () => {
  module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  await module.init();
  prisma = module.get(PrismaService);
  users = module.get<UserRepository>(USER_REPOSITORY);
  tasks = module.get<CareTaskRepository>(CARE_TASK_REPOSITORY);
});

afterAll(async () => {
  try {
    // Remove somente os usuários criados por este teste; cuidados usam FK com cascade.
    if (prisma && createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
  } finally {
    if (module) await module.close();
  }
});

test('repositories reais persistem CRUD, isolam proprietários e traduzem conflito', async () => {
  const email = `integration-${randomUUID()}@example.com`;
  const alice = await users.create({
    name: 'Alice',
    email,
    passwordHash: 'fixture-only-not-a-login-hash',
  });
  createdUserIds.push(alice.id);
  const bob = await users.create({
    name: 'Bob',
    email: `integration-${randomUUID()}@example.com`,
    passwordHash: 'fixture-only-not-a-login-hash',
  });
  createdUserIds.push(bob.id);
  expect(await users.findByEmail(email)).toEqual(alice);
  await expect(
    users.create({ name: 'Duplicate', email, passwordHash: 'fixture-only' }),
  ).rejects.toBeInstanceOf(RepositoryConflictError);

  const task = await tasks.create({
    title: 'Cuidado real',
    description: 'Teste com PostgreSQL.',
    ownerId: alice.id,
  });
  expect(await tasks.listByOwner(alice.id, { limit: 50, offset: 0 })).toEqual([task]);
  expect(await tasks.listByOwner(bob.id, { limit: 50, offset: 0 })).toEqual([]);
  expect(await tasks.findByOwner(task.id, bob.id)).toBeNull();
  expect(await tasks.updateByOwner(task.id, bob.id, { completed: true })).toBeNull();
  expect(await tasks.deleteByOwner(task.id, bob.id)).toBe(false);
  const updated = await tasks.updateByOwner(task.id, alice.id, { completed: true });
  expect(updated?.completed).toBe(true);
  expect(updated?.title).toBe(task.title);
  expect(await tasks.deleteByOwner(task.id, alice.id)).toBe(true);
  expect(await tasks.findByOwner(task.id, alice.id)).toBeNull();
});
