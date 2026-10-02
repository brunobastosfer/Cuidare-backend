import { Injectable } from '@nestjs/common';
import {
  appointmentEventPrefix,
  type AppointmentTimelineType,
} from '../../domain/models/appointment.model';
import type { TimelineEvent } from '../../domain/models/timeline-event.model';
import { compareTimelinePositions } from '../../domain/timeline-query';
import type {
  TimelineSource,
  TimelineSourceQuery,
} from '../../repository/timeline-source.repository';
import type { TransactionRepositories } from '../../repository/unit-of-work.repository';
async function read(
  source: TimelineSource,
  query: TimelineSourceQuery,
  r: TransactionRepositories,
) {
  const events: TimelineEvent[] = [];
  for (const type of source.types as readonly AppointmentTimelineType[]) {
    if (query.type && query.type !== type) continue;
    const rows = await r.appointments.readTimeline(query, type);
    const title = {
      APPOINTMENT_RECORDED: 'Consulta registrada',
      MEDICAL_RECOMMENDATION_RECORDED: 'Recomendação registrada pelo responsável',
      MEDICAL_RECOMMENDATION_COMPLETED: 'Recomendação marcada como concluída',
    }[type];
    events.push(
      ...rows.map((row) => ({
        id: appointmentEventPrefix(type) + row.id,
        dependentId: row.dependentId,
        type,
        title,
        summary: null,
        sourceId: row.id,
        sourceType: source.sourceType,
        eventDate: row.eventDate,
        createdAt: row.createdAt,
      })),
    );
  }
  return events.sort((a, b) => compareTimelinePositions(a, b, query.order)).slice(0, query.take);
}
@Injectable()
export class AppointmentTimelineSource implements TimelineSource {
  readonly sourceType = 'APPOINTMENT';
  readonly types = ['APPOINTMENT_RECORDED'] as const;
  list(query: TimelineSourceQuery, r: TransactionRepositories) {
    return read(this, query, r);
  }
}
@Injectable()
export class RecommendationTimelineSource implements TimelineSource {
  readonly sourceType = 'MEDICAL_RECOMMENDATION';
  readonly types = ['MEDICAL_RECOMMENDATION_RECORDED', 'MEDICAL_RECOMMENDATION_COMPLETED'] as const;
  list(query: TimelineSourceQuery, r: TransactionRepositories) {
    return read(this, query, r);
  }
}
