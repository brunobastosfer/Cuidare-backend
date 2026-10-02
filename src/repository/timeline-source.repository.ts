import type {
  TimelineEvent,
  TimelineEventType,
  TimelineReadQuery,
} from '../domain/models/timeline-event.model';
import type { TransactionRepositories } from './unit-of-work.repository';
export const TIMELINE_SOURCES = Symbol('TIMELINE_SOURCES');

export type TimelineSourceQuery = TimelineReadQuery;
// Cada módulo projeta sua fonte da verdade, com escopo autorizado no repository.
// Aplicar filtros/keyset ANTES de take. Não fazer I/O externo na transação.
export interface TimelineSource {
  readonly sourceType: string;
  readonly types: readonly TimelineEventType[];
  list(query: TimelineSourceQuery, repositories: TransactionRepositories): Promise<TimelineEvent[]>;
}
