import type { User } from './user.model';
import type { Dependent, UserDependentAccess } from './dependent.model';
import type { CareTask } from './care-task.model';
import type { Consent } from './consent.model';
import type { AuthSession } from './auth-session.model';
import type { AuditLog } from './audit-log.model';
import type { RetentionDays } from './data-retention.model';
import type { Medication, MedicationTreatmentDetails } from './medication.model';
import type { Appointment, MedicalRecommendation } from './appointment.model';
import type { Document } from './document.model';
import type { VaccinationDetails } from './vaccination.model';
import type { SchoolEnrollment, SchoolReportDetails } from './education.model';
export interface PrivacyExportRecord {
  id: string;
  userId: string;
  format: 'JSON';
  createdAt: Date;
}
export interface AccountDeletionRequest {
  id: string;
  userId: string;
  status: 'PENDING_REVIEW';
  requestedAt: Date;
  retentionNotBeforeAt: Date | null;
  retentionPolicy: RetentionDays;
}
export type CreateAccountDeletionRequest = Pick<
  AccountDeletionRequest,
  'userId' | 'retentionNotBeforeAt' | 'retentionPolicy'
>;
export interface PrivacyExportSnapshot {
  account: Pick<
    User,
    'id' | 'name' | 'email' | 'status' | 'emailVerifiedAt' | 'createdAt' | 'updatedAt'
  > | null;
  dependents: Pick<
    Dependent,
    'id' | 'fullName' | 'preferredName' | 'birthDate' | 'createdAt' | 'updatedAt'
  >[];
  access: Pick<UserDependentAccess, 'dependentId' | 'role' | 'relationship' | 'createdAt'>[];
  careTasks: CareTask[];
  consents: Consent[];
  sessions: Pick<
    AuthSession,
    'id' | 'authenticationMethod' | 'createdAt' | 'expiresAt' | 'revokedAt'
  >[];
  auditEvents: Pick<
    AuditLog,
    'id' | 'action' | 'resourceType' | 'resourceId' | 'dependentId' | 'timestamp'
  >[];
  exportHistory: PrivacyExportRecord[];
  medications: Medication[];
  medicationTreatments: MedicationTreatmentDetails[];
  appointments: Appointment[];
  medicalRecommendations: MedicalRecommendation[];
  documents: Document[];
  vaccinations: VaccinationDetails[];
  schoolEnrollments: SchoolEnrollment[];
  schoolReports: SchoolReportDetails[];
}
