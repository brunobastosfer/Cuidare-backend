import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  AUDITED_TREATMENT_FIELDS,
  AUDITED_APPOINTMENT_FIELDS,
  AUDITED_RECOMMENDATION_FIELDS,
  AUDITED_DOCUMENT_FIELDS,
  AUDITED_VACCINATION_FIELDS,
  AUDITED_ENROLLMENT_FIELDS,
  AUDITED_REPORT_FIELDS,
  type CreateAuditLog,
} from '../../domain/models/audit-log.model';
import type { AuditLogRepository } from '../../repository/audit-log.repository';

const eventSchema = z
  .object({
    actorId: z.uuid(),
    action: z.enum([
      'USER_CREATED',
      'DEPENDENT_CREATED',
      'DEPENDENT_UPDATED',
      'DEPENDENT_DELETED',
      'CONSENT_ACCEPTED',
      'SESSION_CREATED',
      'SESSION_REVOKED',
      'ALL_SESSIONS_REVOKED',
      'REFRESH_ROTATED',
      'REFRESH_REUSE_DETECTED',
      'EMAIL_VERIFIED',
      'PASSWORD_RESET',
      'CONSENT_REVOKED',
      'DATA_EXPORTED',
      'ACCOUNT_DELETION_REQUESTED',
      'MEDICATION_CREATED',
      'MEDICATION_UPDATED',
      'MEDICATION_DELETED',
      'MEDICATION_TREATMENT_CREATED',
      'MEDICATION_TREATMENT_UPDATED',
      'MEDICATION_TREATMENT_DELETED',
      'APPOINTMENT_CREATED',
      'APPOINTMENT_UPDATED',
      'APPOINTMENT_DELETED',
      'MEDICAL_RECOMMENDATION_CREATED',
      'MEDICAL_RECOMMENDATION_UPDATED',
      'MEDICAL_RECOMMENDATION_DELETED',
      'DOCUMENT_UPLOADED',
      'DOCUMENT_UPDATED',
      'DOCUMENT_DELETED',
      'DOCUMENT_VIEWED',
      'DOCUMENT_DOWNLOADED',
      'VACCINATION_CREATED',
      'VACCINATION_UPDATED',
      'VACCINATION_DELETED',
      'SCHOOL_ENROLLMENT_CREATED',
      'SCHOOL_ENROLLMENT_UPDATED',
      'SCHOOL_ENROLLMENT_DELETED',
      'SCHOOL_REPORT_CREATED',
      'SCHOOL_REPORT_UPDATED',
      'SCHOOL_REPORT_DELETED',
    ]),
    resourceType: z.enum([
      'USER',
      'DEPENDENT',
      'CONSENT',
      'SESSION',
      'PRIVACY_EXPORT',
      'ACCOUNT_DELETION_REQUEST',
      'MEDICATION',
      'MEDICATION_TREATMENT',
      'APPOINTMENT',
      'MEDICAL_RECOMMENDATION',
      'DOCUMENT',
      'DEPENDENT_VACCINATION',
      'SCHOOL_ENROLLMENT',
      'SCHOOL_REPORT',
    ]),
    resourceId: z.uuid(),
    dependentId: z.uuid().nullable(),
    metadata: z
      .object({
        changedFields: z
          .array(
            z.enum([
              'fullName',
              'preferredName',
              'birthDate',
              'name',
              ...AUDITED_TREATMENT_FIELDS,
              ...AUDITED_APPOINTMENT_FIELDS,
              ...AUDITED_RECOMMENDATION_FIELDS,
              ...AUDITED_DOCUMENT_FIELDS,
              ...AUDITED_VACCINATION_FIELDS,
              ...AUDITED_ENROLLMENT_FIELDS,
              ...AUDITED_REPORT_FIELDS,
            ]),
          )
          .max(12)
          .optional(),
      })
      .strict(),
  })
  .strict()
  .superRefine((event, context) => {
    const allowed: readonly string[] =
      event.resourceType === 'DEPENDENT'
        ? ['fullName', 'preferredName', 'birthDate']
        : event.resourceType === 'MEDICATION'
          ? ['name']
          : event.resourceType === 'MEDICATION_TREATMENT'
            ? AUDITED_TREATMENT_FIELDS
            : event.resourceType === 'APPOINTMENT'
              ? AUDITED_APPOINTMENT_FIELDS
              : event.resourceType === 'MEDICAL_RECOMMENDATION'
                ? AUDITED_RECOMMENDATION_FIELDS
                : event.resourceType === 'DOCUMENT'
                  ? AUDITED_DOCUMENT_FIELDS
                  : event.resourceType === 'DEPENDENT_VACCINATION'
                    ? AUDITED_VACCINATION_FIELDS
                    : event.resourceType === 'SCHOOL_ENROLLMENT'
                      ? AUDITED_ENROLLMENT_FIELDS
                      : event.resourceType === 'SCHOOL_REPORT'
                        ? AUDITED_REPORT_FIELDS
                        : [];
    if (
      event.metadata.changedFields?.some((field) => !allowed.includes(field)) ||
      (event.action.startsWith('MEDICATION_TREATMENT_') &&
        event.resourceType !== 'MEDICATION_TREATMENT') ||
      (event.action.startsWith('MEDICATION_') &&
        !event.action.startsWith('MEDICATION_TREATMENT_') &&
        event.resourceType !== 'MEDICATION') ||
      (event.action.startsWith('APPOINTMENT_') && event.resourceType !== 'APPOINTMENT') ||
      (event.action.startsWith('MEDICAL_RECOMMENDATION_') &&
        event.resourceType !== 'MEDICAL_RECOMMENDATION') ||
      (event.action.startsWith('DOCUMENT_') && event.resourceType !== 'DOCUMENT') ||
      (event.action.startsWith('VACCINATION_') && event.resourceType !== 'DEPENDENT_VACCINATION') ||
      (event.action.startsWith('SCHOOL_ENROLLMENT_') &&
        event.resourceType !== 'SCHOOL_ENROLLMENT') ||
      (event.action.startsWith('SCHOOL_REPORT_') && event.resourceType !== 'SCHOOL_REPORT')
    )
      context.addIssue({
        code: 'custom',
        message: 'Metadados ou recurso incompatíveis com auditoria.',
      });
  });

@Injectable()
export class AuditService {
  record(repository: AuditLogRepository, event: CreateAuditLog): Promise<void> {
    // Allowlist impede payloads, nomes, tokens ou valores clínicos.
    const parsed = eventSchema.parse(event);
    return repository.append({
      ...parsed,
      metadata: parsed.metadata.changedFields
        ? { changedFields: parsed.metadata.changedFields }
        : {},
    });
  }
}
