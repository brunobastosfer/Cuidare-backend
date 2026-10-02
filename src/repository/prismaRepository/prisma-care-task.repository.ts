import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import type {
  CreateCareTask,
  ListCareTasks,
  UpdateCareTask,
} from '../../domain/models/care-task.model';
import type { CareTaskRepository } from '../care-task.repository';
import { prismaOperation } from './prisma-operation';

@Injectable()
export class PrismaCareTaskRepository implements CareTaskRepository {
  constructor(private readonly prisma: PrismaService) {}

  listByOwner(ownerId: string, { limit, offset }: ListCareTasks) {
    return prismaOperation(() =>
      this.prisma.careTask.findMany({
        where: { ownerId },
        take: limit,
        skip: offset,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      }),
    );
  }

  findByOwner(id: string, ownerId: string) {
    return prismaOperation(() => this.prisma.careTask.findFirst({ where: { id, ownerId } }));
  }

  create(data: CreateCareTask) {
    return prismaOperation(() => this.prisma.careTask.create({ data }));
  }

  updateByOwner(id: string, ownerId: string, data: UpdateCareTask) {
    // O filtro de proprietário faz parte da própria escrita, evitando check-then-update.
    return prismaOperation(async () => {
      const tasks = await this.prisma.careTask.updateManyAndReturn({
        where: { id, ownerId },
        data,
      });
      return tasks[0] ?? null;
    });
  }

  deleteByOwner(id: string, ownerId: string) {
    return prismaOperation(async () => {
      const result = await this.prisma.careTask.deleteMany({ where: { id, ownerId } });
      return result.count > 0;
    });
  }
}
