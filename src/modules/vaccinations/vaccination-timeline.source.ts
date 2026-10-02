import { Injectable } from '@nestjs/common';
import type {
  TimelineSource,
  TimelineSourceQuery,
} from '../../repository/timeline-source.repository';
import type { TransactionRepositories } from '../../repository/unit-of-work.repository';
@Injectable()
export class VaccinationTimelineSource implements TimelineSource {
  readonly sourceType = 'DEPENDENT_VACCINATION';
  readonly types = ['VACCINATION_RECORDED'] as const;
  async list(query: TimelineSourceQuery, r: TransactionRepositories) {
    if (query.type && query.type !== this.types[0]) return [];
    return (await r.vaccinations.readTimeline(query)).map((row) => ({
      id: 'vaccination-recorded:' + row.id,
      dependentId: row.dependentId,
      type: this.types[0],
      title: 'Vacinação informada',
      summary: null,
      sourceId: row.id,
      sourceType: this.sourceType,
      eventDate: row.administeredAt,
      createdAt: row.createdAt,
    }));
  }
}
