import { Prisma } from '../../generated/prisma/client';
import { RepositoryConflictError, RepositoryUnavailableError } from '../errors/repository.error';

export async function prismaOperation<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') throw new RepositoryConflictError();
      if (['P1001', 'P1002', 'P1008', 'P1017', 'P2024'].includes(error.code)) {
        throw new RepositoryUnavailableError();
      }
    }
    throw error;
  }
}
