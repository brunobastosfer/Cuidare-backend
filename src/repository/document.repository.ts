import type {
  Document,
  CreateDocument,
  UpdateDocument,
  DocumentTimelineRecord,
} from '../domain/models/document.model';
import type { Pagination } from './dependent.repository';
import type { TimelineSourceQuery } from './timeline-source.repository';
export const DOCUMENT_REPOSITORY = Symbol('DOCUMENT_REPOSITORY');
export interface DocumentRepository {
  list(dependentId: string, userId: string, pagination: Pagination): Promise<Document[]>;
  find(id: string, dependentId: string, userId: string): Promise<Document | null>;
  create(data: CreateDocument): Promise<Document>;
  update(
    id: string,
    dependentId: string,
    userId: string,
    data: UpdateDocument,
  ): Promise<Document | null>;
  delete(id: string, dependentId: string, userId: string, now: Date): Promise<boolean>;
  // Inclui registros retidos/excluídos para evitar bypass por soft delete.
  storageUsage(dependentId: string, userId: string): Promise<{ files: number; bytes: number }>;
  readTimeline(query: TimelineSourceQuery): Promise<DocumentTimelineRecord[]>;
}
