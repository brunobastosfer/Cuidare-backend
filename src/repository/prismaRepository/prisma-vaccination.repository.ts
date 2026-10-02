import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { VaccinationRepository } from '../vaccination.repository';
import type { DependentAccessRole } from '../../domain/models/dependent.model';
import type {
  CreateVaccination,
  UpdateVaccination,
  VaccineScheduleType,
} from '../../domain/models/vaccination.model';
import type { Pagination } from '../dependent.repository';
import type { TimelineSourceQuery } from '../timeline-source.repository';
import { dependentScope } from './dependent-scope';
import { prismaOperation } from './prisma-operation';
import { civilEventTimelineWhere } from './civil-event-timeline-where';
export const vaccinationInclude = {
  vaccine: true,
  document: { select: { id: true, deletedAt: true } },
} as const;
export const reviewedReferenceScope = () => ({
  deletedAt: null,
  reviewedAt: { not: null, lte: new Date() },
});
export function vaccinationScope(
  dependentId: string,
  userId: string,
  roles?: DependentAccessRole[],
): Prisma.DependentVaccinationWhereInput {
  return { dependentId, deletedAt: null, dependent: dependentScope(userId, roles) };
}
@Injectable()
export class PrismaVaccinationRepository implements VaccinationRepository {
  constructor(@Inject(PrismaService) private readonly prisma: Prisma.TransactionClient) {}
  listCatalog({ limit, offset }: Pagination) {
    return prismaOperation(() =>
      this.prisma.vaccineCatalog.findMany({
        where: reviewedReferenceScope(),
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        take: limit,
        skip: offset,
      }),
    );
  }
  findCatalog(id: string) {
    return prismaOperation(() =>
      this.prisma.vaccineCatalog.findFirst({ where: { id, ...reviewedReferenceScope() } }),
    );
  }
  listSchedules({ limit, offset }: Pagination, type?: VaccineScheduleType) {
    return prismaOperation(() =>
      this.prisma.vaccineSchedule.findMany({
        where: { ...reviewedReferenceScope(), ...(type ? { type } : {}) },
        orderBy: [{ validFrom: 'desc' }, { id: 'asc' }],
        take: limit,
        skip: offset,
      }),
    );
  }
  findSchedule(id: string) {
    return prismaOperation(() =>
      this.prisma.vaccineSchedule.findFirst({ where: { id, ...reviewedReferenceScope() } }),
    );
  }
  listScheduleDoses(scheduleId: string, { limit, offset }: Pagination) {
    return prismaOperation(() =>
      this.prisma.vaccineScheduleDose.findMany({
        where: { scheduleId, schedule: reviewedReferenceScope() },
        include: { vaccine: true },
        orderBy: [{ dueAgeMonths: 'asc' }, { dueAgeDays: 'asc' }, { id: 'asc' }],
        take: limit,
        skip: offset,
      }),
    );
  }
  list(dependentId: string, userId: string, { limit, offset }: Pagination) {
    return prismaOperation(() =>
      this.prisma.dependentVaccination.findMany({
        where: vaccinationScope(dependentId, userId),
        include: vaccinationInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: limit,
        skip: offset,
      }),
    );
  }
  find(id: string, dependentId: string, userId: string) {
    return prismaOperation(() =>
      this.prisma.dependentVaccination.findFirst({
        where: { id, ...vaccinationScope(dependentId, userId) },
        include: vaccinationInclude,
      }),
    );
  }
  create(data: CreateVaccination) {
    return prismaOperation(() =>
      this.prisma.dependentVaccination.create({
        data: {
          dependentId: data.dependentId,
          vaccineId: data.vaccineId,
          dose: data.dose,
          administeredAt: data.administeredAt,
          institutionName: data.institutionName,
          batchNumber: data.batchNumber,
          notes: data.notes,
          documentId: data.documentId,
          createdByUserId: data.createdByUserId,
        },
        include: vaccinationInclude,
      }),
    );
  }
  async update(id: string, dependentId: string, userId: string, data: UpdateVaccination) {
    const rows = await prismaOperation(() =>
      this.prisma.dependentVaccination.updateManyAndReturn({
        where: { id, ...vaccinationScope(dependentId, userId, ['OWNER', 'EDITOR']) },
        data: {
          ...(data.dose !== undefined ? { dose: data.dose } : {}),
          ...(data.administeredAt !== undefined ? { administeredAt: data.administeredAt } : {}),
          ...(data.institutionName !== undefined ? { institutionName: data.institutionName } : {}),
          ...(data.batchNumber !== undefined ? { batchNumber: data.batchNumber } : {}),
          ...(data.notes !== undefined ? { notes: data.notes } : {}),
          ...(data.documentId !== undefined ? { documentId: data.documentId } : {}),
        },
        include: vaccinationInclude,
      }),
    );
    return rows[0] ?? null;
  }
  async delete(id: string, dependentId: string, userId: string, now: Date) {
    return (
      (
        await prismaOperation(() =>
          this.prisma.dependentVaccination.updateMany({
            where: { id, ...vaccinationScope(dependentId, userId, ['OWNER']) },
            data: { deletedAt: now },
          }),
        )
      ).count === 1
    );
  }
  readTimeline(query: TimelineSourceQuery) {
    return prismaOperation(() =>
      this.prisma.dependentVaccination.findMany({
        where: {
          ...vaccinationScope(query.dependentId, query.userId),
          createdAt: { lte: query.snapshotAt },
          AND: civilEventTimelineWhere(query, 'administeredAt', 'vaccination-recorded:'),
        },
        select: { id: true, dependentId: true, administeredAt: true, createdAt: true },
        orderBy: [{ administeredAt: query.order }, { id: query.order }],
        take: query.take,
      }),
    );
  }
}
