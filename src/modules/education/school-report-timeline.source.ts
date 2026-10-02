import { Injectable } from '@nestjs/common';
import type {
  TimelineSource,
  TimelineSourceQuery,
} from '../../repository/timeline-source.repository';
import type { TransactionRepositories } from '../../repository/unit-of-work.repository';
@Injectable()
export class SchoolReportTimelineSource implements TimelineSource {
  readonly sourceType = 'SCHOOL_REPORT';
  readonly types = ['SCHOOL_REPORT_RECORDED'] as const;
  async list(query: TimelineSourceQuery, r: TransactionRepositories) {
    if (query.type && query.type !== this.types[0]) return [];
    return (await r.education.readTimeline(query)).map((row) => ({
      id: 'school-report-recorded:' + row.id,
      dependentId: row.dependentId,
      type: this.types[0],
      title: 'Relatório escolar informado',
      summary: null,
      sourceId: row.id,
      sourceType: this.sourceType,
      eventDate: row.reportDate,
      createdAt: row.createdAt,
    }));
  }
}
