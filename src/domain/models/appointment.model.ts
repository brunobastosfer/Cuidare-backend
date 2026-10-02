export const RECOMMENDATION_STATUSES = [
  'PENDING',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
] as const;
export type RecommendationStatus = (typeof RECOMMENDATION_STATUSES)[number];
export interface AppointmentFields {
  date: Date;
  specialty: string | null;
  professionalName: string | null;
  institutionName: string | null;
  reason: string;
  notes: string | null;
  followUpDate: Date | null;
}
export interface Appointment extends AppointmentFields {
  id: string;
  dependentId: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}
export type CreateAppointment = AppointmentFields & { dependentId: string };
export type UpdateAppointment = Partial<AppointmentFields>;
export interface RecommendationFields {
  title: string;
  description: string;
  status: RecommendationStatus;
  startDate: Date;
  endDate: Date | null;
}
export interface MedicalRecommendation extends RecommendationFields {
  id: string;
  dependentId: string;
  appointmentId: string;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}
export type CreateRecommendation = RecommendationFields & {
  dependentId: string;
  appointmentId: string;
  completedAt: Date | null;
};
export type UpdateRecommendation = Partial<RecommendationFields & { completedAt: Date | null }>;
export type AppointmentTimelineType =
  'APPOINTMENT_RECORDED' | 'MEDICAL_RECOMMENDATION_RECORDED' | 'MEDICAL_RECOMMENDATION_COMPLETED';
export function appointmentEventPrefix(type: AppointmentTimelineType) {
  return (
    {
      APPOINTMENT_RECORDED: 'appointment-recorded:',
      MEDICAL_RECOMMENDATION_RECORDED: 'recommendation-recorded:',
      MEDICAL_RECOMMENDATION_COMPLETED: 'recommendation-completed:',
    } as const
  )[type];
}
export interface AppointmentTimelineRecord {
  id: string;
  dependentId: string;
  eventDate: Date;
  createdAt: Date;
}
