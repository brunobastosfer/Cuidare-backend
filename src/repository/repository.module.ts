import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { CARE_TASK_REPOSITORY } from './care-task.repository';
import { USER_REPOSITORY } from './user.repository';
import { PrismaCareTaskRepository } from './prismaRepository/prisma-care-task.repository';
import { PrismaUserRepository } from './prismaRepository/prisma-user.repository';
import { DEPENDENT_REPOSITORY } from './dependent.repository';
import { DEPENDENT_ACCESS_REPOSITORY } from './dependent-access.repository';
import { CONSENT_REPOSITORY } from './consent.repository';
import { AUDIT_LOG_REPOSITORY } from './audit-log.repository';
import { UNIT_OF_WORK_REPOSITORY } from './unit-of-work.repository';
import { PrismaDependentRepository } from './prismaRepository/prisma-dependent.repository';
import { PrismaDependentAccessRepository } from './prismaRepository/prisma-dependent-access.repository';
import { PrismaConsentRepository } from './prismaRepository/prisma-consent.repository';
import { PrismaAuditLogRepository } from './prismaRepository/prisma-audit-log.repository';
import { PrismaUnitOfWorkRepository } from './prismaRepository/prisma-unit-of-work.repository';
import { AUTH_SESSION_REPOSITORY } from './auth-session.repository';
import { ACCOUNT_TOKEN_REPOSITORY } from './account-token.repository';
import { AUTH_RATE_LIMIT_REPOSITORY } from './auth-rate-limit.repository';
import { PrismaAuthSessionRepository } from './prismaRepository/prisma-auth-session.repository';
import { PrismaAccountTokenRepository } from './prismaRepository/prisma-account-token.repository';
import { PrismaAuthRateLimitRepository } from './prismaRepository/prisma-auth-rate-limit.repository';
import { PRIVACY_REPOSITORY } from './privacy.repository';
import { PrismaPrivacyRepository } from './prismaRepository/prisma-privacy.repository';
import { MEDICATION_REPOSITORY } from './medication.repository';
import { PrismaMedicationRepository } from './prismaRepository/prisma-medication.repository';
import { APPOINTMENT_REPOSITORY } from './appointment.repository';
import { PrismaAppointmentRepository } from './prismaRepository/prisma-appointment.repository';
import { DOCUMENT_REPOSITORY } from './document.repository';
import { PrismaDocumentRepository } from './prismaRepository/prisma-document.repository';
import { VACCINATION_REPOSITORY } from './vaccination.repository';
import { PrismaVaccinationRepository } from './prismaRepository/prisma-vaccination.repository';

import { EDUCATION_REPOSITORY } from './education.repository';
import { PrismaEducationRepository } from './prismaRepository/prisma-education.repository';

@Module({
  imports: [DatabaseModule],
  providers: [
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    { provide: CARE_TASK_REPOSITORY, useClass: PrismaCareTaskRepository },
    { provide: DEPENDENT_REPOSITORY, useClass: PrismaDependentRepository },
    { provide: DEPENDENT_ACCESS_REPOSITORY, useClass: PrismaDependentAccessRepository },
    { provide: CONSENT_REPOSITORY, useClass: PrismaConsentRepository },
    { provide: AUDIT_LOG_REPOSITORY, useClass: PrismaAuditLogRepository },
    { provide: UNIT_OF_WORK_REPOSITORY, useClass: PrismaUnitOfWorkRepository },
    { provide: AUTH_SESSION_REPOSITORY, useClass: PrismaAuthSessionRepository },
    { provide: ACCOUNT_TOKEN_REPOSITORY, useClass: PrismaAccountTokenRepository },
    { provide: AUTH_RATE_LIMIT_REPOSITORY, useClass: PrismaAuthRateLimitRepository },
    { provide: PRIVACY_REPOSITORY, useClass: PrismaPrivacyRepository },
    { provide: MEDICATION_REPOSITORY, useClass: PrismaMedicationRepository },
    { provide: APPOINTMENT_REPOSITORY, useClass: PrismaAppointmentRepository },
    { provide: DOCUMENT_REPOSITORY, useClass: PrismaDocumentRepository },
    { provide: VACCINATION_REPOSITORY, useClass: PrismaVaccinationRepository },
    { provide: EDUCATION_REPOSITORY, useClass: PrismaEducationRepository },
  ],
  exports: [
    USER_REPOSITORY,
    CARE_TASK_REPOSITORY,
    DEPENDENT_REPOSITORY,
    DEPENDENT_ACCESS_REPOSITORY,
    CONSENT_REPOSITORY,
    AUDIT_LOG_REPOSITORY,
    UNIT_OF_WORK_REPOSITORY,
    AUTH_SESSION_REPOSITORY,
    ACCOUNT_TOKEN_REPOSITORY,
    AUTH_RATE_LIMIT_REPOSITORY,
    PRIVACY_REPOSITORY,
    MEDICATION_REPOSITORY,
    APPOINTMENT_REPOSITORY,
    DOCUMENT_REPOSITORY,
    VACCINATION_REPOSITORY,
    EDUCATION_REPOSITORY,
  ],
})
export class RepositoryModule {}
