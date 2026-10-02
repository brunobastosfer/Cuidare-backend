import type { UserRepository } from './user.repository';
import type { DependentRepository } from './dependent.repository';
import type { DependentAccessRepository } from './dependent-access.repository';
import type { ConsentRepository } from './consent.repository';
import type { AuditLogRepository } from './audit-log.repository';
import type { AuthSessionRepository } from './auth-session.repository';
import type { AccountTokenRepository } from './account-token.repository';
import type { AuthRateLimitRepository } from './auth-rate-limit.repository';
import type { PrivacyRepository } from './privacy.repository';
import type { MedicationRepository } from './medication.repository';
import type { AppointmentRepository } from './appointment.repository';
import type { DocumentRepository } from './document.repository';
import type { VaccinationRepository } from './vaccination.repository';
import type { EducationRepository } from './education.repository';
export const UNIT_OF_WORK_REPOSITORY = Symbol('UNIT_OF_WORK_REPOSITORY');
export interface TransactionRepositories {
  users: UserRepository;
  dependents: DependentRepository;
  dependentAccess: DependentAccessRepository;
  consents: ConsentRepository;
  auditLogs: AuditLogRepository;
  sessions: AuthSessionRepository;
  accountTokens: AccountTokenRepository;
  authRateLimits: AuthRateLimitRepository;
  privacy: PrivacyRepository;
  medications: MedicationRepository;
  appointments: AppointmentRepository;
  documents: DocumentRepository;
  vaccinations: VaccinationRepository;
  education: EducationRepository;
}
export interface UnitOfWorkRepository {
  // A callback pode ser repetida após conflito; não faça I/O externo nela.
  run<T>(operation: (repositories: TransactionRepositories) => Promise<T>): Promise<T>;
}
