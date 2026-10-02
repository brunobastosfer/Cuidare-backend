import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { CreateAuditLog } from '../../domain/models/audit-log.model';
import type { AuditLogRepository } from '../audit-log.repository';
import { prismaOperation } from './prisma-operation';

@Injectable()
export class PrismaAuditLogRepository implements AuditLogRepository {
  constructor(@Inject(PrismaService) private readonly prisma: Prisma.TransactionClient) {}
  async append(data: CreateAuditLog) {
    await prismaOperation(() =>
      this.prisma.auditLog.create({
        data: {
          actorId: data.actorId,
          action: data.action,
          resourceType: data.resourceType,
          resourceId: data.resourceId,
          dependentId: data.dependentId,
          metadata: data.metadata.changedFields
            ? { changedFields: data.metadata.changedFields }
            : {},
        },
      }),
    );
  }
}
