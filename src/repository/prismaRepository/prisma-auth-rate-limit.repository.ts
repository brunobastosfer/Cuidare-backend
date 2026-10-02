import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { AuthRateBucket } from '../../domain/models/auth-session.model';
import type { AuthRateLimitRepository } from '../auth-rate-limit.repository';
import { prismaOperation } from './prisma-operation';
import { RepositoryRetryableError } from '../errors/repository.error';
@Injectable()
export class PrismaAuthRateLimitRepository implements AuthRateLimitRepository {
  constructor(@Inject(PrismaService) private readonly prisma: Prisma.TransactionClient) {}
  find(key: string) {
    return prismaOperation(() => this.prisma.authRateBucket.findUnique({ where: { key } }));
  }
  async save(data: AuthRateBucket) {
    const values = {
      count: data.count,
      windowStartedAt: data.windowStartedAt,
      expiresAt: data.expiresAt,
    };
    await prismaOperation(async () => {
      try {
        await this.prisma.authRateBucket.upsert({
          where: { key: data.key },
          create: { key: data.key, ...values },
          update: values,
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
          throw new RepositoryRetryableError();
        throw error;
      }
    });
  }
}
