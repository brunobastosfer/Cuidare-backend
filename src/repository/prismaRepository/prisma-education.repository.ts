import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { EducationRepository } from '../education.repository';
import type { DependentAccessRole } from '../../domain/models/dependent.model';
import type {
  CreateEnrollment,
  UpdateEnrollment,
  CreateReport,
  UpdateReport,
} from '../../domain/models/education.model';
import type { Pagination } from '../dependent.repository';
import type { TimelineSourceQuery } from '../timeline-source.repository';
import { dependentScope } from './dependent-scope';
import { prismaOperation } from './prisma-operation';
import { civilEventTimelineWhere } from './civil-event-timeline-where';
export const schoolReportInclude = {
  enrollment: { select: { id: true, deletedAt: true } },
  document: { select: { id: true, deletedAt: true } },
} as const;
export function educationScope(dependentId: string, userId: string, roles?: DependentAccessRole[]) {
  return { dependentId, deletedAt: null, dependent: dependentScope(userId, roles) };
}
function enrollmentData(data: UpdateEnrollment): Prisma.SchoolEnrollmentUpdateManyMutationInput {
  return {
    ...(data.schoolName !== undefined ? { schoolName: data.schoolName } : {}),
    ...(data.schoolYear !== undefined ? { schoolYear: data.schoolYear } : {}),
    ...(data.grade !== undefined ? { grade: data.grade } : {}),
    ...(data.className !== undefined ? { className: data.className } : {}),
    ...(data.startDate !== undefined ? { startDate: data.startDate } : {}),
    ...(data.endDate !== undefined ? { endDate: data.endDate } : {}),
  };
}
function reportData(data: UpdateReport): Prisma.SchoolReportUpdateManyMutationInput {
  return {
    ...(data.enrollmentId !== undefined ? { enrollmentId: data.enrollmentId } : {}),
    ...(data.title !== undefined ? { title: data.title } : {}),
    ...(data.reportDate !== undefined ? { reportDate: data.reportDate } : {}),
    ...(data.summary !== undefined ? { summary: data.summary } : {}),
    ...(data.observations !== undefined ? { observations: data.observations } : {}),
    ...(data.documentId !== undefined ? { documentId: data.documentId } : {}),
  };
}
@Injectable()
export class PrismaEducationRepository implements EducationRepository {
  constructor(@Inject(PrismaService) private readonly prisma: Prisma.TransactionClient) {}
  listEnrollments(dependentId: string, userId: string, { limit, offset }: Pagination) {
    return prismaOperation(() =>
      this.prisma.schoolEnrollment.findMany({
        where: educationScope(dependentId, userId),
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: limit,
        skip: offset,
      }),
    );
  }
  findEnrollment(id: string, dependentId: string, userId: string) {
    return prismaOperation(() =>
      this.prisma.schoolEnrollment.findFirst({
        where: { id, ...educationScope(dependentId, userId) },
      }),
    );
  }
  createEnrollment(data: CreateEnrollment) {
    return prismaOperation(() =>
      this.prisma.schoolEnrollment.create({
        data: {
          dependentId: data.dependentId,
          createdByUserId: data.createdByUserId,
          schoolName: data.schoolName,
          schoolYear: data.schoolYear,
          grade: data.grade,
          className: data.className,
          startDate: data.startDate,
          endDate: data.endDate,
        },
      }),
    );
  }
  async updateEnrollment(id: string, dependentId: string, userId: string, data: UpdateEnrollment) {
    const rows = await prismaOperation(() =>
      this.prisma.schoolEnrollment.updateManyAndReturn({
        where: { id, ...educationScope(dependentId, userId, ['OWNER', 'EDITOR']) },
        data: enrollmentData(data),
      }),
    );
    return rows[0] ?? null;
  }
  async deleteEnrollment(id: string, dependentId: string, userId: string, now: Date) {
    return (
      (
        await prismaOperation(() =>
          this.prisma.schoolEnrollment.updateMany({
            where: { id, ...educationScope(dependentId, userId, ['OWNER']) },
            data: { deletedAt: now },
          }),
        )
      ).count === 1
    );
  }
  listReports(dependentId: string, userId: string, { limit, offset }: Pagination) {
    return prismaOperation(() =>
      this.prisma.schoolReport.findMany({
        where: educationScope(dependentId, userId),
        include: schoolReportInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: limit,
        skip: offset,
      }),
    );
  }
  findReport(id: string, dependentId: string, userId: string) {
    return prismaOperation(() =>
      this.prisma.schoolReport.findFirst({
        where: { id, ...educationScope(dependentId, userId) },
        include: schoolReportInclude,
      }),
    );
  }
  createReport(data: CreateReport) {
    return prismaOperation(() =>
      this.prisma.schoolReport.create({
        data: {
          dependentId: data.dependentId,
          createdByUserId: data.createdByUserId,
          enrollmentId: data.enrollmentId,
          title: data.title,
          reportDate: data.reportDate,
          summary: data.summary,
          observations: data.observations,
          documentId: data.documentId,
        },
        include: schoolReportInclude,
      }),
    );
  }
  async updateReport(id: string, dependentId: string, userId: string, data: UpdateReport) {
    const rows = await prismaOperation(() =>
      this.prisma.schoolReport.updateManyAndReturn({
        where: { id, ...educationScope(dependentId, userId, ['OWNER', 'EDITOR']) },
        data: reportData(data),
        include: schoolReportInclude,
      }),
    );
    return rows[0] ?? null;
  }
  async deleteReport(id: string, dependentId: string, userId: string, now: Date) {
    return (
      (
        await prismaOperation(() =>
          this.prisma.schoolReport.updateMany({
            where: { id, ...educationScope(dependentId, userId, ['OWNER']) },
            data: { deletedAt: now },
          }),
        )
      ).count === 1
    );
  }
  readTimeline(query: TimelineSourceQuery) {
    return prismaOperation(() =>
      this.prisma.schoolReport.findMany({
        where: {
          ...educationScope(query.dependentId, query.userId),
          createdAt: { lte: query.snapshotAt },
          AND: civilEventTimelineWhere(query, 'reportDate', 'school-report-recorded:'),
        },
        select: { id: true, dependentId: true, reportDate: true, createdAt: true },
        orderBy: [{ reportDate: query.order }, { id: query.order }],
        take: query.take,
      }),
    );
  }
}
