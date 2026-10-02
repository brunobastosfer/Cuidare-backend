import { Injectable } from '@nestjs/common';
import type { TimelineEvent } from '../../domain/models/timeline-event.model';
import type {
  TimelineSource,
  TimelineSourceQuery,
} from '../../repository/timeline-source.repository';
import type { TransactionRepositories } from '../../repository/unit-of-work.repository';
@Injectable()
export class DocumentTimelineSource implements TimelineSource {
  readonly sourceType = 'DOCUMENT';
  readonly types = ['DOCUMENT_UPLOADED'] as const;
  async list(
    query: TimelineSourceQuery,
    repositories: TransactionRepositories,
  ): Promise<TimelineEvent[]> {
    if (query.type && query.type !== 'DOCUMENT_UPLOADED') return [];
    const rows = await repositories.documents.readTimeline(query);
    return rows.map((row) => ({
      id: 'document-uploaded:' + row.id,
      dependentId: row.dependentId,
      sourceId: row.id,
      sourceType: this.sourceType,
      type: 'DOCUMENT_UPLOADED',
      title: 'Documento enviado',
      summary: null,
      eventDate: row.createdAt,
      createdAt: row.createdAt,
    }));
  }
}
