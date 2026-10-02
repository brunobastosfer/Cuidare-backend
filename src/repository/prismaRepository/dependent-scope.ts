import type { Prisma } from '../../generated/prisma/client';
import type { DependentAccessRole } from '../../domain/models/dependent.model';

export function activeAccessWhere(
  userId: string,
  roles?: DependentAccessRole[],
): Prisma.UserDependentAccessWhereInput {
  return {
    userId,
    revokedAt: null,
    user: { deletedAt: null, status: 'ACTIVE' },
    ...(roles ? { role: { in: roles } } : {}),
  };
}
export function dependentScope(
  userId: string,
  roles?: DependentAccessRole[],
): Prisma.DependentWhereInput {
  return { deletedAt: null, access: { some: activeAccessWhere(userId, roles) } };
}
