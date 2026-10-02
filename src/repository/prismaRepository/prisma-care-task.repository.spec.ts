import type { PrismaService } from '../../database/prisma.service';
import { PrismaCareTaskRepository } from './prisma-care-task.repository';

function setup() {
  const delegate = {
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue(null),
    updateManyAndReturn: jest.fn().mockResolvedValue([]),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    create: jest.fn(),
  };
  // Mock somente da fronteira do driver; o repository real executa todas as operações.
  const prisma = { careTask: delegate } as unknown as PrismaService;
  return { repository: new PrismaCareTaskRepository(prisma), delegate };
}

test('inclui ownerId em leituras e paginação limitada', async () => {
  const { repository, delegate } = setup();
  await repository.listByOwner('owner', { limit: 20, offset: 2 });
  expect(delegate.findMany).toHaveBeenCalledWith(
    expect.objectContaining({ where: { ownerId: 'owner' }, take: 20, skip: 2 }),
  );
  await repository.findByOwner('task', 'owner');
  expect(delegate.findFirst).toHaveBeenCalledWith({ where: { id: 'task', ownerId: 'owner' } });
});

test('inclui ownerId nas escritas atômicas sem buscar antes para autorizar', async () => {
  const { repository, delegate } = setup();
  expect(await repository.updateByOwner('task', 'owner', { completed: true })).toBeNull();
  expect(delegate.updateManyAndReturn).toHaveBeenCalledWith({
    where: { id: 'task', ownerId: 'owner' },
    data: { completed: true },
  });
  expect(await repository.deleteByOwner('task', 'owner')).toBe(false);
  expect(delegate.deleteMany).toHaveBeenCalledWith({ where: { id: 'task', ownerId: 'owner' } });
  expect(delegate.findFirst).not.toHaveBeenCalled();
});
