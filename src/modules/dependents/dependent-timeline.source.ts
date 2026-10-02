import { Injectable } from '@nestjs/common';
import type { TimelineEvent } from '../../domain/models/timeline-event.model';
import type {
  TimelineSource,
  TimelineSourceQuery,
} from '../../repository/timeline-source.repository';
import type { TransactionRepositories } from '../../repository/unit-of-work.repository';
import { matchesTimelineQuery } from '../../domain/timeline-query';

@Injectable()
export class DependentTimelineSource implements TimelineSource {
  readonly sourceType = 'DEPENDENT';
  readonly types = ['DEPENDENT_CREATED'] as const;
  async list(
    query: TimelineSourceQuery,
    repositories: TransactionRepositories,
  ): Promise<TimelineEvent[]> {
    if (query.type && query.type !== 'DEPENDENT_CREATED') return [];
    // Leitura por PK + vínculo ativo/conta ativa/soft delete, não por ID isolado.
    const dependent = await repositories.dependents.findForUser(query.dependentId, query.userId);
    if (!dependent) return [];
    const event: TimelineEvent = {
      id: 'dependent-created:' + dependent.id,
      dependentId: dependent.id,
      type: 'DEPENDENT_CREATED',
      title: 'Dependente cadastrado',
      eventDate: dependent.createdAt,
      summary: null,
      sourceId: dependent.id,
      sourceType: this.sourceType,
      createdAt: dependent.createdAt,
    };
    return matchesTimelineQuery(event, query) ? [event] : [];
  }
}
