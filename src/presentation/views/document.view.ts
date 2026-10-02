import type { Document } from '../../domain/models/document.model';
export function documentView(row: Document) {
  return {
    id: row.id,
    dependentId: row.dependentId,
    category: row.category,
    title: row.title,
    description: row.description,
    originalFileName: row.originalFileName,
    mimeType: row.mimeType,
    size: row.size,
    documentDate: row.documentDate?.toISOString().slice(0, 10) ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
