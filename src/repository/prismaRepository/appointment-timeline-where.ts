import type { TimelineSourceQuery } from '../timeline-source.repository';
import {
  appointmentEventPrefix,
  type AppointmentTimelineType,
} from '../../domain/models/appointment.model';
import { instantTimelineWhere } from './instant-timeline-where';
export function appointmentTimelineWhere(
  query: TimelineSourceQuery,
  type: AppointmentTimelineType,
) {
  const column =
    type === 'APPOINTMENT_RECORDED'
      ? 'date'
      : type === 'MEDICAL_RECOMMENDATION_RECORDED'
        ? 'createdAt'
        : 'completedAt';
  return instantTimelineWhere(query, column, appointmentEventPrefix(type));
}
