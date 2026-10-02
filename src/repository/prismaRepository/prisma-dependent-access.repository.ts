import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { CreateDependentAccess } from '../../domain/models/dependent.model';
import type { DependentAccessRepository } from '../dependent-access.repository';
import { activeAccessWhere } from './dependent-scope';
import { prismaOperation } from './prisma-operation';

@Injectable()
export class PrismaDependentAccessRepository implements DependentAccessRepository {
  constructor(@Inject(PrismaService) private readonly prisma: Prisma.TransactionClient) {}
  findActive(userId: string, dependentId: string) {
    return prismaOperation(() =>
      this.prisma.userDependentAccess.findFirst({
        where: { dependentId, ...activeAccessWhere(userId), dependent: { deletedAt: null } },
      }),
    );
  }
  create(data: CreateDependentAccess) {
    return prismaOperation(() =>
      this.prisma.userDependentAccess.create({
        data: {
          userId: data.userId,
          dependentId: data.dependentId,
          role: data.role,
          relationship: data.relationship,
        },
      }),
    );
  }
  async revokeAllForUser(userId: string, now: Date) {
    await prismaOperation(() =>
      this.prisma.userDependentAccess.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      }),
    );
  }
}
