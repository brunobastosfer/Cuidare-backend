import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  DOCUMENT_MIME_TYPES,
  type Document,
  type DocumentMimeType,
  type CreateDocument,
  type UpdateDocument,
} from '../../domain/models/document.model';
import type { DependentAccessRole } from '../../domain/models/dependent.model';
import type { DocumentRepository } from '../document.repository';
import type { Pagination } from '../dependent.repository';
import type { TimelineSourceQuery } from '../timeline-source.repository';
import { dependentScope } from './dependent-scope';
import { prismaOperation } from './prisma-operation';
import { instantTimelineWhere } from './instant-timeline-where';
export function documentScope(
  dependentId: string,
  userId: string,
  roles?: DependentAccessRole[],
): Prisma.DocumentWhereInput {
  return { dependentId, deletedAt: null, dependent: dependentScope(userId, roles) };
}
export function documentRecord(row: Prisma.DocumentGetPayload<object>): Document {
  if (!DOCUMENT_MIME_TYPES.some((type) => type === row.mimeType))
    throw new Error('Metadados de documento inconsistentes.');
  return { ...row, mimeType: row.mimeType as DocumentMimeType };
}
@Injectable()
export class PrismaDocumentRepository implements DocumentRepository {
  constructor(@Inject(PrismaService) private readonly prisma: Prisma.TransactionClient) {}
  list(dependentId: string, userId: string, { limit, offset }: Pagination) {
    return prismaOperation(async () =>
      (
        await this.prisma.document.findMany({
          where: documentScope(dependentId, userId),
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          take: limit,
          skip: offset,
        })
      ).map(documentRecord),
    );
  }
  find(id: string, dependentId: string, userId: string) {
    return prismaOperation(async () => {
      const row = await this.prisma.document.findFirst({
        where: { id, ...documentScope(dependentId, userId) },
      });
      return row ? documentRecord(row) : null;
    });
  }
  create(data: CreateDocument) {
    return prismaOperation(async () =>
      documentRecord(
        await this.prisma.document.create({
          data: {
            dependentId: data.dependentId,
            category: data.category,
            title: data.title,
            description: data.description,
            storageKey: data.storageKey,
            originalFileName: data.originalFileName,
            mimeType: data.mimeType,
            size: data.size,
            checksum: data.checksum,
            createdByUserId: data.createdByUserId,
            documentDate: data.documentDate,
            scannedAt: data.scannedAt,
          },
        }),
      ),
    );
  }
  async update(id: string, dependentId: string, userId: string, data: UpdateDocument) {
    const rows = await prismaOperation(() =>
      this.prisma.document.updateManyAndReturn({
        where: { id, ...documentScope(dependentId, userId, ['OWNER', 'EDITOR']) },
        data: {
          ...(data.category !== undefined ? { category: data.category } : {}),
          ...(data.title !== undefined ? { title: data.title } : {}),
          ...(data.description !== undefined ? { description: data.description } : {}),
          ...(data.documentDate !== undefined ? { documentDate: data.documentDate } : {}),
        },
      }),
    );
    return rows[0] ? documentRecord(rows[0]) : null;
  }
  async delete(id: string, dependentId: string, userId: string, now: Date) {
    return (
      (
        await prismaOperation(() =>
          this.prisma.document.updateMany({
            where: { id, ...documentScope(dependentId, userId, ['OWNER']) },
            data: { deletedAt: now },
          }),
        )
      ).count === 1
    );
  }
  storageUsage(dependentId: string, userId: string) {
    return prismaOperation(async () => {
      const result = await this.prisma.document.aggregate({
        where: { dependentId, dependent: dependentScope(userId, ['OWNER', 'EDITOR']) },
        _count: { id: true },
        _sum: { size: true },
      });
      return { files: result._count.id, bytes: result._sum.size ?? 0 };
    });
  }
  readTimeline(query: TimelineSourceQuery) {
    return prismaOperation(() =>
      this.prisma.document.findMany({
        where: {
          ...documentScope(query.dependentId, query.userId),
          createdAt: { lte: query.snapshotAt },
          AND: instantTimelineWhere(query, 'createdAt', 'document-uploaded:'),
        },
        select: { id: true, dependentId: true, createdAt: true },
        orderBy: [{ createdAt: query.order }, { id: query.order }],
        take: query.take,
      }),
    );
  }
}
