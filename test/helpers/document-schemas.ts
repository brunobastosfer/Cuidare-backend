import { z } from 'zod';
import { DOCUMENT_CATEGORIES, DOCUMENT_MIME_TYPES } from '../../src/domain/models/document.model';
export const documentSchema = z
  .object({
    id: z.uuid(),
    dependentId: z.uuid(),
    category: z.enum(DOCUMENT_CATEGORIES),
    title: z.string(),
    description: z.string().nullable(),
    originalFileName: z.string(),
    mimeType: z.enum(DOCUMENT_MIME_TYPES),
    size: z.number().int().positive(),
    documentDate: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();
