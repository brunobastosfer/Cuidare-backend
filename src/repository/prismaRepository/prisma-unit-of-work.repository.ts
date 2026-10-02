import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { TransactionRepositories, UnitOfWorkRepository } from '../unit-of-work.repository';
import { RepositoryRetryableError, RepositoryUnavailableError } from '../errors/repository.error';
import { PrismaUserRepository } from './prisma-user.repository';
import { PrismaDependentRepository } from './prisma-dependent.repository';
import { PrismaDependentAccessRepository } from './prisma-dependent-access.repository';
import { PrismaConsentRepository } from './prisma-consent.repository';
import { PrismaAuditLogRepository } from './prisma-audit-log.repository';
import { prismaOperation } from './prisma-operation';
import { PrismaAuthSessionRepository } from './prisma-auth-session.repository';
import { PrismaAccountTokenRepository } from './prisma-account-token.repository';
import { PrismaAuthRateLimitRepository } from './prisma-auth-rate-limit.repository';
import { PrismaPrivacyRepository } from './prisma-privacy.repository';
import { PrismaMedicationRepository } from './prisma-medication.repository';
import { PrismaAppointmentRepository } from './prisma-appointment.repository';
import { PrismaDocumentRepository } from './prisma-document.repository';
import { PrismaVaccinationRepository } from './prisma-vaccination.repository';

import { PrismaEducationRepository } from './prisma-education.repository';

@Injectable()
export class PrismaUnitOfWorkRepository implements UnitOfWorkRepository {
  constructor(private readonly prisma: PrismaService) {}
  async run<T>(operation: (repositories: TransactionRepositories) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await prismaOperation(() =>
          this.prisma.$transaction(
            async (tx) =>
              operation({
                users: new PrismaUserRepository(tx),
                dependents: new PrismaDependentRepository(tx),
                dependentAccess: new PrismaDependentAccessRepository(tx),
                consents: new PrismaConsentRepository(tx),
                auditLogs: new PrismaAuditLogRepository(tx),
                sessions: new PrismaAuthSessionRepository(tx),
                accountTokens: new PrismaAccountTokenRepository(tx),
                authRateLimits: new PrismaAuthRateLimitRepository(tx),
                privacy: new PrismaPrivacyRepository(tx),
                medications: new PrismaMedicationRepository(tx),
                appointments: new PrismaAppointmentRepository(tx),
                documents: new PrismaDocumentRepository(tx),
                vaccinations: new PrismaVaccinationRepository(tx),
                education: new PrismaEducationRepository(tx),
              }),
            {
              isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
              maxWait: 5000,
              timeout: 5000,
            },
          ),
        );
      } catch (error) {
        if (
          !(error instanceof RepositoryRetryableError) &&
          (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2034')
        )
          throw error;
        if (attempt === 2) throw new RepositoryUnavailableError();
      }
    }
    throw new RepositoryUnavailableError();
  }
}
