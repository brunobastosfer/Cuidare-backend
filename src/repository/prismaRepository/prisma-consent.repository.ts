import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { CreateConsent } from '../../domain/models/consent.model';
import type { ConsentRepository } from '../consent.repository';
import type { Pagination } from '../dependent.repository';
import { dependentScope } from './dependent-scope';
import { prismaOperation } from './prisma-operation';

@Injectable()
export class PrismaConsentRepository implements ConsentRepository {
  constructor(@Inject(PrismaService) private readonly prisma: Prisma.TransactionClient) {}
  create(data: CreateConsent) {
    return prismaOperation(() =>
      this.prisma.consent.create({
        data: {
          userId: data.userId,
          dependentId: data.dependentId,
          type: data.type,
          policyVersion: data.policyVersion,
          consentBased: data.consentBased ?? false,
          metadata: { source: 'SELF_SERVICE' },
        },
      }),
    );
  }
  listForUser(userId: string, { limit, offset }: Pagination) {
    return prismaOperation(() =>
      this.prisma.consent.findMany({
        where: {
          userId,
          user: { status: 'ACTIVE', deletedAt: null },
          OR: [{ dependentId: null }, { dependent: dependentScope(userId) }],
        },
        take: limit,
        skip: offset,
        orderBy: [{ acceptedAt: 'desc' }, { id: 'asc' }],
      }),
    );
  }
  findOwned(id: string, userId: string) {
    // Retirar o próprio consentimento não exige manter acesso ao dependente.
    return prismaOperation(() =>
      this.prisma.consent.findFirst({
        where: { id, userId, user: { status: 'ACTIVE', deletedAt: null } },
      }),
    );
  }
  async revokeScope(userId: string, type: string, dependentId: string | null, now: Date) {
    const result = await prismaOperation(() =>
      this.prisma.consent.updateMany({
        where: {
          userId,
          type,
          dependentId,
          consentBased: true,
          revokedAt: null,
          user: { status: 'ACTIVE', deletedAt: null },
        },
        data: { revokedAt: now },
      }),
    );
    return result.count;
  }
  async hasActive(userId: string, type: string, policyVersion: string, dependentId: string | null) {
    const row = await prismaOperation(() =>
      this.prisma.consent.findFirst({
        where: {
          userId,
          type,
          policyVersion,
          dependentId,
          consentBased: true,
          revokedAt: null,
          user: { status: 'ACTIVE', deletedAt: null },
          ...(dependentId ? { dependent: dependentScope(userId, ['OWNER']) } : {}),
        },
        select: { id: true },
      }),
    );
    return Boolean(row);
  }
}
