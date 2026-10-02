import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type {
  AccountTokenPurpose,
  CreateAccountToken,
} from '../../domain/models/auth-session.model';
import type { AccountTokenRepository } from '../account-token.repository';
import { prismaOperation } from './prisma-operation';
@Injectable()
export class PrismaAccountTokenRepository implements AccountTokenRepository {
  constructor(@Inject(PrismaService) private readonly prisma: Prisma.TransactionClient) {}
  create(data: CreateAccountToken) {
    return prismaOperation(() =>
      this.prisma.accountToken.create({
        data: {
          userId: data.userId,
          purpose: data.purpose,
          tokenHash: data.tokenHash,
          credentialVersion: data.credentialVersion,
          expiresAt: data.expiresAt,
        },
      }),
    );
  }
  findByHash(tokenHash: string, purpose: AccountTokenPurpose) {
    return prismaOperation(() =>
      this.prisma.accountToken.findFirst({ where: { tokenHash, purpose } }),
    );
  }
  async consume(id: string, now: Date) {
    const result = await prismaOperation(() =>
      this.prisma.accountToken.updateMany({
        where: {
          id,
          usedAt: null,
          revokedAt: null,
          expiresAt: { gt: now },
          user: { deletedAt: null, status: 'ACTIVE' },
        },
        data: { usedAt: now },
      }),
    );
    return result.count === 1;
  }
  async revokeForUser(userId: string, purpose: AccountTokenPurpose, now: Date) {
    await prismaOperation(() =>
      this.prisma.accountToken.updateMany({
        where: { userId, purpose, usedAt: null, revokedAt: null },
        data: { revokedAt: now },
      }),
    );
  }
}
