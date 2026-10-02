export type AuditAction =
  | 'USER_CREATED'
  | 'DEPENDENT_CREATED'
  | 'DEPENDENT_UPDATED'
  | 'DEPENDENT_DELETED'
  | 'CONSENT_ACCEPTED'
  | 'SESSION_CREATED'
  | 'SESSION_REVOKED'
  | 'ALL_SESSIONS_REVOKED'
  | 'REFRESH_ROTATED'
  | 'REFRESH_REUSE_DETECTED'
  | 'EMAIL_VERIFIED'
  | 'PASSWORD_RESET'
  | 'CONSENT_REVOKED'
  | 'DATA_EXPORTED'
  | 'ACCOUNT_DELETION_REQUESTED'
  | 'MEDICATION_CREATED'
  | 'MEDICATION_UPDATED'
  | 'MEDICATION_DELETED'
  | 'MEDICATION_TREATMENT_CREATED'
  | 'MEDICATION_TREATMENT_UPDATED'
  | 'MEDICATION_TREATMENT_DELETED'
  | 'APPOINTMENT_CREATED'
  | 'APPOINTMENT_UPDATED'
  | 'APPOINTMENT_DELETED'
  | 'MEDICAL_RECOMMENDATION_CREATED'
  | 'MEDICAL_RECOMMENDATION_UPDATED'
  | 'MEDICAL_RECOMMENDATION_DELETED'
  | 'DOCUMENT_UPLOADED'
  | 'DOCUMENT_UPDATED'
  | 'DOCUMENT_DELETED'
  | 'DOCUMENT_VIEWED'
  | 'DOCUMENT_DOWNLOADED'
  | 'VACCINATION_CREATED'
  | 'VACCINATION_UPDATED'
  | 'VACCINATION_DELETED'
  | 'SCHOOL_ENROLLMENT_CREATED'
  | 'SCHOOL_ENROLLMENT_UPDATED'
  | 'SCHOOL_ENROLLMENT_DELETED'
  | 'SCHOOL_REPORT_CREATED'
  | 'SCHOOL_REPORT_UPDATED'
  | 'SCHOOL_REPORT_DELETED';
export type AuditResourceType =
  | 'USER'
  | 'DEPENDENT'
  | 'CONSENT'
  | 'SESSION'
  | 'PRIVACY_EXPORT'
  | 'ACCOUNT_DELETION_REQUEST'
  | 'MEDICATION'
  | 'MEDICATION_TREATMENT'
  | 'APPOINTMENT'
  | 'MEDICAL_RECOMMENDATION'
  | 'DOCUMENT'
  | 'DEPENDENT_VACCINATION'
  | 'SCHOOL_ENROLLMENT'
  | 'SCHOOL_REPORT';
export type AuditedDependentField = 'fullName' | 'preferredName' | 'birthDate';
export const AUDITED_TREATMENT_FIELDS = [
  'dosage',
  'unit',
  'frequency',
  'route',
  'startDate',
  'endDate',
  'continuousUse',
  'instructions',
  'prescribedBy',
  'reason',
  'notes',
  'status',
] as const;
export type AuditedTreatmentField = (typeof AUDITED_TREATMENT_FIELDS)[number];
export const AUDITED_APPOINTMENT_FIELDS = [
  'date',
  'specialty',
  'professionalName',
  'institutionName',
  'reason',
  'notes',
  'followUpDate',
] as const;
export const AUDITED_RECOMMENDATION_FIELDS = [
  'title',
  'description',
  'status',
  'startDate',
  'endDate',
] as const;
export type AuditedAppointmentField = (typeof AUDITED_APPOINTMENT_FIELDS)[number];
export type AuditedRecommendationField = (typeof AUDITED_RECOMMENDATION_FIELDS)[number];
export const AUDITED_DOCUMENT_FIELDS = [
  'category',
  'title',
  'description',
  'documentDate',
] as const;
export type AuditedDocumentField = (typeof AUDITED_DOCUMENT_FIELDS)[number];
export const AUDITED_VACCINATION_FIELDS = [
  'dose',
  'administeredAt',
  'institutionName',
  'batchNumber',
  'notes',
  'documentId',
] as const;
export type AuditedVaccinationField = (typeof AUDITED_VACCINATION_FIELDS)[number];

export const AUDITED_ENROLLMENT_FIELDS = [
  'schoolName',
  'schoolYear',
  'grade',
  'className',
  'startDate',
  'endDate',
] as const;
export const AUDITED_REPORT_FIELDS = [
  'enrollmentId',
  'title',
  'reportDate',
  'summary',
  'observations',
  'documentId',
] as const;
export type AuditedEnrollmentField = (typeof AUDITED_ENROLLMENT_FIELDS)[number];
export type AuditedReportField = (typeof AUDITED_REPORT_FIELDS)[number];

export interface CreateAuditLog {
  actorId: string;
  action: AuditAction;
  resourceType: AuditResourceType;
  resourceId: string;
  dependentId: string | null;
  metadata: {
    changedFields?: (
      | AuditedDependentField
      | AuditedTreatmentField
      | AuditedAppointmentField
      | AuditedRecommendationField
      | AuditedDocumentField
      | AuditedVaccinationField
      | AuditedEnrollmentField
      | AuditedReportField
      | 'name'
    )[];
  };
}

export interface AuditLog extends CreateAuditLog {
  id: string;
  timestamp: Date;
}
