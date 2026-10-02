import type {
  Appointment,
  MedicalRecommendation,
  CreateAppointment,
  UpdateAppointment,
  CreateRecommendation,
  UpdateRecommendation,
  AppointmentTimelineType,
  AppointmentTimelineRecord,
} from '../domain/models/appointment.model';
import type { Pagination } from './dependent.repository';
import type { TimelineSourceQuery } from './timeline-source.repository';
export const APPOINTMENT_REPOSITORY = Symbol('APPOINTMENT_REPOSITORY');
export interface AppointmentRepository {
  list(dependentId: string, userId: string, pagination: Pagination): Promise<Appointment[]>;
  find(id: string, dependentId: string, userId: string): Promise<Appointment | null>;
  create(data: CreateAppointment): Promise<Appointment>;
  update(
    id: string,
    dependentId: string,
    userId: string,
    data: UpdateAppointment,
  ): Promise<Appointment | null>;
  hasRecommendations(id: string, dependentId: string, userId: string): Promise<boolean>;
  delete(id: string, dependentId: string, userId: string, now: Date): Promise<boolean>;
  listRecommendations(
    appointmentId: string,
    dependentId: string,
    userId: string,
    pagination: Pagination,
  ): Promise<MedicalRecommendation[]>;
  findRecommendation(
    id: string,
    appointmentId: string,
    dependentId: string,
    userId: string,
  ): Promise<MedicalRecommendation | null>;
  createRecommendation(data: CreateRecommendation): Promise<MedicalRecommendation>;
  updateRecommendation(
    id: string,
    appointmentId: string,
    dependentId: string,
    userId: string,
    data: UpdateRecommendation,
  ): Promise<MedicalRecommendation | null>;
  deleteRecommendation(
    id: string,
    appointmentId: string,
    dependentId: string,
    userId: string,
    now: Date,
  ): Promise<boolean>;
  readTimeline(
    query: TimelineSourceQuery,
    type: AppointmentTimelineType,
  ): Promise<AppointmentTimelineRecord[]>;
}
