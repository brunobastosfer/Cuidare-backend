import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { CreateUser } from '../../domain/models/user.model';
import type { UserRepository } from '../user.repository';
import { prismaOperation } from './prisma-operation';

@Injectable()
export class PrismaUserRepository implements UserRepository {
  constructor(@Inject(PrismaService) private readonly prisma: Prisma.TransactionClient) {}

  findById(id: string) {
    return prismaOperation(() => this.prisma.user.findFirst({ where: { id, deletedAt: null } }));
  }

  findByEmail(email: string) {
    return prismaOperation(() =>
      this.prisma.user.findFirst({ where: { email: email.trim().toLowerCase(), deletedAt: null } }),
    );
  }

  create(data: CreateUser) {
    return prismaOperation(() =>
      this.prisma.user.create({
        data: {
          name: data.name,
          email: data.email.trim().toLowerCase(),
          passwordHash: data.passwordHash,
        },
      }),
    );
  }

  async verifyEmail(id: string, credentialVersion: number, now: Date) {
    const result = await prismaOperation(() =>
      this.prisma.user.updateMany({
        where: { id, credentialVersion, deletedAt: null, status: 'ACTIVE', emailVerifiedAt: null },
        data: { emailVerifiedAt: now },
      }),
    );
    return result.count === 1;
  }
  async resetPassword(id: string, credentialVersion: number, passwordHash: string) {
    const result = await prismaOperation(() =>
      this.prisma.user.updateMany({
        where: { id, credentialVersion, deletedAt: null, status: 'ACTIVE' },
        data: { passwordHash, credentialVersion: { increment: 1 } },
      }),
    );
    return result.count === 1;
  }
  async closeAccount(id: string, credentialVersion: number, now: Date) {
    const result = await prismaOperation(() =>
      this.prisma.user.updateMany({
        where: { id, credentialVersion, deletedAt: null, status: 'ACTIVE' },
        data: { deletedAt: now, status: 'BLOCKED', credentialVersion: { increment: 1 } },
      }),
    );
    return result.count === 1;
  }
}
