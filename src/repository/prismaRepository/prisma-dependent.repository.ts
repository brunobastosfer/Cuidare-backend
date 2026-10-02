import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type {
  CreateDependent,
  DependentAccessRole,
  UpdateDependent,
} from '../../domain/models/dependent.model';
import type { DependentRepository, Pagination } from '../dependent.repository';
import { dependentScope } from './dependent-scope';
import { prismaOperation } from './prisma-operation';

@Injectable()
export class PrismaDependentRepository implements DependentRepository {
  constructor(@Inject(PrismaService) private readonly prisma: Prisma.TransactionClient) {}

  listForUser(userId: string, { limit, offset }: Pagination) {
    return prismaOperation(() =>
      this.prisma.dependent.findMany({
        where: dependentScope(userId),
        take: limit,
        skip: offset,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      }),
    );
  }
  findForUser(id: string, userId: string) {
    return prismaOperation(() =>
      this.prisma.dependent.findFirst({ where: { id, ...dependentScope(userId) } }),
    );
  }
  create(data: CreateDependent) {
    return prismaOperation(() =>
      this.prisma.dependent.create({
        data: {
          fullName: data.fullName,
          preferredName: data.preferredName,
          birthDate: data.birthDate,
          createdByUserId: data.createdByUserId,
        },
      }),
    );
  }
  async updateForUser(
    id: string,
    userId: string,
    roles: DependentAccessRole[],
    data: UpdateDependent,
  ) {
    const rows = await prismaOperation(() =>
      this.prisma.dependent.updateManyAndReturn({
        where: { id, ...dependentScope(userId, roles) },
        data: {
          ...(data.fullName !== undefined ? { fullName: data.fullName } : {}),
          ...(data.preferredName !== undefined ? { preferredName: data.preferredName } : {}),
          ...(data.birthDate !== undefined ? { birthDate: data.birthDate } : {}),
        },
      }),
    );
    return rows[0] ?? null;
  }
  async softDeleteForUser(id: string, userId: string) {
    const result = await prismaOperation(() =>
      this.prisma.dependent.updateMany({
        where: { id, ...dependentScope(userId, ['OWNER']) },
        data: { deletedAt: new Date() },
      }),
    );
    return result.count === 1;
  }
}
