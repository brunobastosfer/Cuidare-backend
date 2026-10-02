import { Prisma } from '../../generated/prisma/client';
import type { PrismaService } from '../../database/prisma.service';
import { RepositoryRetryableError, RepositoryUnavailableError } from '../errors/repository.error';
import { PrismaUnitOfWorkRepository } from './prisma-unit-of-work.repository';

const conflict = () =>
  new Prisma.PrismaClientKnownRequestError('transaction conflict', {
    code: 'P2034',
    clientVersion: 'test',
  });

test('repete criação concorrente de bucket, sem repetir conflitos normais de negócio', async () => {
  const transaction = jest
    .fn()
    .mockRejectedValueOnce(new RepositoryRetryableError())
    .mockResolvedValue('done');
  const repository = new PrismaUnitOfWorkRepository({
    $transaction: transaction,
  } as unknown as PrismaService);
  expect(await repository.run(() => Promise.resolve('done'))).toBe('done');
  expect(transaction).toHaveBeenCalledTimes(2);
});
test('usa Serializable e reexecuta callback somente para conflito transitório', async () => {
  const transaction = jest.fn().mockRejectedValueOnce(conflict()).mockResolvedValue('done');
  const repository = new PrismaUnitOfWorkRepository({
    $transaction: transaction,
  } as unknown as PrismaService);
  expect(await repository.run(() => Promise.resolve('done'))).toBe('done');
  expect(transaction).toHaveBeenCalledTimes(2);
  expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
    isolationLevel: 'Serializable',
    maxWait: 5000,
    timeout: 5000,
  });
});
test('limita conflitos a três tentativas e retorna indisponibilidade', async () => {
  const transaction = jest.fn().mockRejectedValue(conflict());
  const repository = new PrismaUnitOfWorkRepository({
    $transaction: transaction,
  } as unknown as PrismaService);
  await expect(repository.run(() => Promise.resolve('done'))).rejects.toBeInstanceOf(
    RepositoryUnavailableError,
  );
  expect(transaction).toHaveBeenCalledTimes(3);
});
test('não repete callback para erro de regra ou auditoria', async () => {
  const error = new Error('audit failed');
  const transaction = jest.fn().mockRejectedValue(error);
  const repository = new PrismaUnitOfWorkRepository({
    $transaction: transaction,
  } as unknown as PrismaService);
  await expect(repository.run(() => Promise.resolve('done'))).rejects.toBe(error);
  expect(transaction).toHaveBeenCalledTimes(1);
});
test('repositories entregues ao service usam o cliente da mesma transação', async () => {
  const create = jest.fn().mockResolvedValue({ id: 'created' });
  const findEnrollments = jest.fn().mockResolvedValue([]);
  const findReports = jest.fn().mockResolvedValue([]);
  const transaction = jest.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
    callback({
      user: { create },
      schoolEnrollment: { findMany: findEnrollments },
      schoolReport: { findMany: findReports },
    }),
  );
  const repository = new PrismaUnitOfWorkRepository({
    $transaction: transaction,
  } as unknown as PrismaService);
  await repository.run(async (repositories) => {
    expect(Object.keys(repositories).sort()).toEqual([
      'accountTokens',
      'appointments',
      'auditLogs',
      'authRateLimits',
      'consents',
      'dependentAccess',
      'dependents',
      'documents',
      'education',
      'medications',
      'privacy',
      'sessions',
      'users',
      'vaccinations',
    ]);
    await repositories.users.create({
      name: 'Test',
      email: 'TEST@EXAMPLE.COM',
      passwordHash: 'fixture',
    });
    await repositories.education.listEnrollments('child', 'actor', { limit: 1, offset: 0 });
    await repositories.education.listReports('child', 'actor', { limit: 1, offset: 0 });
  });
  expect(findEnrollments).toHaveBeenCalledTimes(1);
  expect(findReports).toHaveBeenCalledTimes(1);
  expect(create).toHaveBeenCalledWith({
    data: { name: 'Test', email: 'test@example.com', passwordHash: 'fixture' },
  });
});
