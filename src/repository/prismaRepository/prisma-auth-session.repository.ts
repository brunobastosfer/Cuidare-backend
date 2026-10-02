import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type {
  CreateAuthSession,
  CreateRefreshCredential,
} from '../../domain/models/auth-session.model';
import type { AuthSessionRepository } from '../auth-session.repository';
import { prismaOperation } from './prisma-operation';
@Injectable()
export class PrismaAuthSessionRepository implements AuthSessionRepository {
  constructor(@Inject(PrismaService) private readonly prisma: Prisma.TransactionClient) {}
  findById(id: string) {
    return prismaOperation(() => this.prisma.authSession.findUnique({ where: { id } }));
  }
  create(data: CreateAuthSession) {
    return prismaOperation(() =>
      this.prisma.authSession.create({
        data: {
          userId: data.userId,
          credentialVersion: data.credentialVersion,
          expiresAt: data.expiresAt,
        },
      }),
    );
  }
  findActive(id: string, userId: string, now: Date) {
    return prismaOperation(() =>
      this.prisma.authSession.findFirst({
        where: {
          id,
          userId,
          revokedAt: null,
          expiresAt: { gt: now },
          user: { deletedAt: null, status: 'ACTIVE' },
        },
      }),
    );
  }
  createRefresh(data: CreateRefreshCredential) {
    return prismaOperation(() =>
      this.prisma.refreshCredential.create({
        data: {
          sessionId: data.sessionId,
          tokenHash: data.tokenHash,
          expiresAt: data.expiresAt,
        },
      }),
    );
  }
  findRefreshByHash(tokenHash: string) {
    return prismaOperation(() =>
      this.prisma.refreshCredential.findUnique({ where: { tokenHash } }),
    );
  }
  async consumeRefresh(id: string, now: Date) {
    const result = await prismaOperation(() =>
      this.prisma.refreshCredential.updateMany({
        where: {
          id,
          usedAt: null,
          expiresAt: { gt: now },
          session: {
            revokedAt: null,
            expiresAt: { gt: now },
            user: { deletedAt: null, status: 'ACTIVE' },
          },
        },
        data: { usedAt: now },
      }),
    );
    return result.count === 1;
  }
  async revoke(id: string, userId: string, now: Date) {
    const result = await prismaOperation(() =>
      this.prisma.authSession.updateMany({
        where: { id, userId, revokedAt: null },
        data: { revokedAt: now },
      }),
    );
    return result.count === 1;
  }
  async revokeAll(userId: string, now: Date) {
    await prismaOperation(() =>
      this.prisma.authSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      }),
    );
  }
}
