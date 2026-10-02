import type { Appointment, MedicalRecommendation } from '../../domain/models/appointment.model';
export function appointmentView(row: Appointment) {
  return {
    id: row.id,
    dependentId: row.dependentId,
    date: row.date,
    specialty: row.specialty,
    professionalName: row.professionalName,
    institutionName: row.institutionName,
    reason: row.reason,
    notes: row.notes,
    followUpDate: row.followUpDate,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
export function recommendationView(row: MedicalRecommendation) {
  return {
    id: row.id,
    dependentId: row.dependentId,
    appointmentId: row.appointmentId,
    title: row.title,
    description: row.description,
    status: row.status,
    startDate: row.startDate.toISOString().slice(0, 10),
    endDate: row.endDate?.toISOString().slice(0, 10) ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
