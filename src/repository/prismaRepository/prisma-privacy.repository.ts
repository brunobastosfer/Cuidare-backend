import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { CreateAccountDeletionRequest } from '../../domain/models/privacy.model';
import type { PrivacyRepository } from '../privacy.repository';
import { dependentScope } from './dependent-scope';
import { prismaOperation } from './prisma-operation';
import { parseRetentionDays } from '../../config/privacy-settings';
import { documentRecord } from './prisma-document.repository';
import { vaccinationInclude } from './prisma-vaccination.repository';
import { schoolReportInclude } from './prisma-education.repository';
@Injectable()
export class PrismaPrivacyRepository implements PrivacyRepository {
  constructor(@Inject(PrismaService) private readonly prisma: Prisma.TransactionClient) {}
  readExport(userId: string, dependentIds: string[], maxItems: number) {
    return prismaOperation(async () => {
      const scope = { id: { in: dependentIds }, ...dependentScope(userId, ['OWNER']) };
      const ownDependentScope = { OR: [{ dependentId: null }, { dependent: scope }] };
      const take = maxItems + 1;
      const [
        account,
        dependents,
        access,
        careTasks,
        consents,
        sessions,
        auditEvents,
        exportHistory,
        medications,
        medicationTreatments,
        appointments,
        medicalRecommendations,
        documents,
        vaccinations,
        schoolEnrollments,
        schoolReports,
      ] = await Promise.all([
        this.prisma.user.findFirst({
          where: { id: userId, deletedAt: null, status: 'ACTIVE' },
          select: {
            id: true,
            name: true,
            email: true,
            status: true,
            emailVerifiedAt: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
        this.prisma.dependent.findMany({
          where: scope,
          take,
          orderBy: { id: 'asc' },
          select: {
            id: true,
            fullName: true,
            preferredName: true,
            birthDate: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
        this.prisma.userDependentAccess.findMany({
          where: { userId, revokedAt: null, dependent: scope },
          take,
          orderBy: { id: 'asc' },
          select: { dependentId: true, role: true, relationship: true, createdAt: true },
        }),
        this.prisma.careTask.findMany({ where: { ownerId: userId }, take, orderBy: { id: 'asc' } }),
        this.prisma.consent.findMany({
          where: { userId, ...ownDependentScope },
          take,
          orderBy: { id: 'asc' },
        }),
        this.prisma.authSession.findMany({
          where: { userId },
          take,
          orderBy: { id: 'asc' },
          select: {
            id: true,
            authenticationMethod: true,
            createdAt: true,
            expiresAt: true,
            revokedAt: true,
          },
        }),
        this.prisma.auditLog.findMany({
          where: { actorId: userId, ...ownDependentScope },
          take,
          orderBy: { id: 'asc' },
          select: {
            id: true,
            action: true,
            resourceType: true,
            resourceId: true,
            dependentId: true,
            timestamp: true,
          },
        }),
        this.prisma.privacyExportRecord.findMany({
          where: { userId },
          take,
          orderBy: { id: 'asc' },
        }),
        this.prisma.medication.findMany({
          where: { dependent: scope, deletedAt: null },
          take,
          orderBy: { id: 'asc' },
        }),
        this.prisma.medicationTreatment.findMany({
          where: { dependent: scope, deletedAt: null, medication: { deletedAt: null } },
          include: { medication: true },
          take,
          orderBy: { id: 'asc' },
        }),
        this.prisma.appointment.findMany({
          where: { dependent: scope, deletedAt: null },
          take,
          orderBy: { id: 'asc' },
        }),
        this.prisma.medicalRecommendation.findMany({
          where: { dependent: scope, deletedAt: null, appointment: { deletedAt: null } },
          take,
          orderBy: { id: 'asc' },
        }),
        this.prisma.document.findMany({
          where: { dependent: scope, deletedAt: null },
          take,
          orderBy: { id: 'asc' },
        }),
        this.prisma.dependentVaccination.findMany({
          where: { dependent: scope, deletedAt: null },
          include: vaccinationInclude,
          take,
          orderBy: { id: 'asc' },
        }),
        this.prisma.schoolEnrollment.findMany({
          where: { dependent: scope, deletedAt: null },
          take,
          orderBy: { id: 'asc' },
        }),
        this.prisma.schoolReport.findMany({
          where: { dependent: scope, deletedAt: null },
          include: schoolReportInclude,
          take,
          orderBy: { id: 'asc' },
        }),
      ]);
      return {
        account,
        dependents,
        access,
        careTasks,
        consents,
        sessions,
        auditEvents,
        exportHistory,
        medications,
        medicationTreatments,
        appointments,
        medicalRecommendations,
        documents: documents.map(documentRecord),
        vaccinations,
        schoolEnrollments,
        schoolReports,
      };
    });
  }
  recordExport(id: string, userId: string) {
    return prismaOperation(() => this.prisma.privacyExportRecord.create({ data: { id, userId } }));
  }
  createDeletionRequest(data: CreateAccountDeletionRequest) {
    return prismaOperation(async () => {
      const row = await this.prisma.accountDeletionRequest.create({
        data: {
          userId: data.userId,
          retentionNotBeforeAt: data.retentionNotBeforeAt,
          retentionPolicy: data.retentionPolicy,
        },
      });
      return { ...row, retentionPolicy: parseRetentionDays(JSON.stringify(row.retentionPolicy)) };
    });
  }
}
