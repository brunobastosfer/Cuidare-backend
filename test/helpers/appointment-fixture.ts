import { timelineFixture } from './timeline-fixture';
import { AppointmentsService } from '../../src/modules/appointments/appointments.service';
import { AuditService } from '../../src/modules/audit/audit.service';
import {
  AppointmentTimelineSource,
  RecommendationTimelineSource,
} from '../../src/modules/appointments/appointment-timeline.source';
import type {
  CreateAppointmentDto,
  CreateRecommendationDto,
} from '../../src/modules/appointments/dto/appointment.dto';
export function appointmentDto(
  overrides: Partial<CreateAppointmentDto> = {},
): CreateAppointmentDto {
  return { date: '2026-01-01T14:30:00.123Z', reason: 'Motivo fictício informado', ...overrides };
}
export function recommendationDto(
  overrides: Partial<CreateRecommendationDto> = {},
): CreateRecommendationDto {
  return {
    title: 'Registro fictício',
    description: 'Texto fictício fornecido pelo responsável, sem orientação clínica.',
    startDate: '2026-01-01',
    ...overrides,
  };
}
export async function appointmentFixture() {
  const f = await timelineFixture();
  const service = new AppointmentsService(f.foundation, f.authorization, new AuditService());
  const appointment = await service.create(f.user.id, f.dependent.id, appointmentDto());
  const sources = [new AppointmentTimelineSource(), new RecommendationTimelineSource()];
  return { ...f, appointments: service, appointment, sources };
}
