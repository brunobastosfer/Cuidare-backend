import { Injectable } from '@nestjs/common';
import { medicationEventPrefix } from '../../domain/models/medication.model';
import type { TimelineEvent } from '../../domain/models/timeline-event.model';
import { compareTimelinePositions } from '../../domain/timeline-query';
import type {
  TimelineSource,
  TimelineSourceQuery,
} from '../../repository/timeline-source.repository';
import type { TransactionRepositories } from '../../repository/unit-of-work.repository';
@Injectable()
export class MedicationTimelineSource implements TimelineSource {
  readonly sourceType = 'MEDICATION_TREATMENT';
  readonly types = ['MEDICATION_STARTED', 'MEDICATION_COMPLETED'] as const;
  async list(
    query: TimelineSourceQuery,
    repositories: TransactionRepositories,
  ): Promise<TimelineEvent[]> {
    const events: TimelineEvent[] = [];
    for (const type of this.types) {
      if (query.type && query.type !== type) continue;
      const rows = await repositories.medications.readTimeline(query, type);
      events.push(
        ...rows.map((row) => ({
          id: medicationEventPrefix(type) + row.id,
          dependentId: row.dependentId,
          type,
          sourceId: row.id,
          sourceType: this.sourceType,
          title:
            type === 'MEDICATION_STARTED'
              ? 'Tratamento registrado: início'
              : 'Tratamento registrado: conclusão',
          summary: null,
          eventDate: row.eventDate,
          createdAt: row.createdAt,
        })),
      );
    }
    return events.sort((a, b) => compareTimelinePositions(a, b, query.order)).slice(0, query.take);
  }
}
