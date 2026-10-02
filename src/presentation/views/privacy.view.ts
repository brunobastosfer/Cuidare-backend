import type {
  AccountDeletionRequest,
  PrivacyExportSnapshot,
} from '../../domain/models/privacy.model';
import { careTaskView } from './care-task.view';
import { consentView } from './consent.view';
import { medicationView, medicationTreatmentView } from './medication.view';
import { appointmentView, recommendationView } from './appointment.view';
import { documentView } from './document.view';
import { vaccinationView } from './vaccination.view';
import { enrollmentView, schoolReportView } from './education.view';
export function deletionRequestView(request: AccountDeletionRequest) {
  return {
    id: request.id,
    status: request.status,
    requestedAt: request.requestedAt,
    retentionNotBeforeAt: request.retentionNotBeforeAt,
    accountAccessClosed: true,
    message:
      'Acesso encerrado. Eliminação definitiva depende de revisão de retenção e registros relacionados.',
  };
}
export function privacyExportView(
  id: string,
  generatedAt: Date,
  scope: string[],
  snapshot: PrivacyExportSnapshot,
) {
  const a = snapshot.account;
  return {
    schemaVersion: '1.5',
    format: 'JSON',
    exportId: id,
    generatedAt,
    scope: { dependentIds: [...scope] },
    data: {
      account: a
        ? {
            id: a.id,
            name: a.name,
            email: a.email,
            status: a.status,
            emailVerifiedAt: a.emailVerifiedAt,
            createdAt: a.createdAt,
            updatedAt: a.updatedAt,
          }
        : null,
      dependents: snapshot.dependents.map((d) => ({
        id: d.id,
        fullName: d.fullName,
        preferredName: d.preferredName,
        birthDate: d.birthDate.toISOString().slice(0, 10),
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
      })),
      dependentAccess: snapshot.access.map((a) => ({
        dependentId: a.dependentId,
        role: a.role,
        relationship: a.relationship,
        createdAt: a.createdAt,
      })),
      careTasks: snapshot.careTasks.map(careTaskView),
      medications: snapshot.medications.map(medicationView),
      medicationTreatments: snapshot.medicationTreatments.map(medicationTreatmentView),
      appointments: snapshot.appointments.map(appointmentView),
      medicalRecommendations: snapshot.medicalRecommendations.map(recommendationView),
      documents: snapshot.documents.map(documentView),
      vaccinations: snapshot.vaccinations.map(vaccinationView),
      schoolEnrollments: snapshot.schoolEnrollments.map(enrollmentView),
      schoolReports: snapshot.schoolReports.map(schoolReportView),
      consents: snapshot.consents.map(consentView),
      sessions: snapshot.sessions.map((s) => ({
        id: s.id,
        authenticationMethod: s.authenticationMethod,
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
        revokedAt: s.revokedAt,
      })),
      auditEvents: snapshot.auditEvents.map((a) => ({
        id: a.id,
        action: a.action,
        resourceType: a.resourceType,
        resourceId: a.resourceId,
        dependentId: a.dependentId,
        timestamp: a.timestamp,
      })),
      exportHistory: snapshot.exportHistory.map((e) => ({
        id: e.id,
        format: e.format,
        createdAt: e.createdAt,
      })),
    },
  };
}
