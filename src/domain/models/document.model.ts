export const DOCUMENT_CATEGORIES = [
  'PRESCRIPTION',
  'MEDICAL_REPORT',
  'EXAM',
  'MEDICAL_CERTIFICATE',
  'SCHOOL_REPORT',
  'VACCINE_RECORD',
  'OTHER',
] as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];
export const DOCUMENT_MIME_TYPES = ['application/pdf', 'image/png', 'image/jpeg'] as const;
export type DocumentMimeType = (typeof DOCUMENT_MIME_TYPES)[number];
export interface DocumentMetadata {
  category: DocumentCategory;
  title: string;
  description: string | null;
  documentDate: Date | null;
}
export interface Document extends DocumentMetadata {
  id: string;
  dependentId: string;
  storageKey: string;
  originalFileName: string;
  mimeType: DocumentMimeType;
  size: number;
  checksum: string;
  createdByUserId: string;
  scannedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}
export type CreateDocument = Omit<Document, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>;
export type UpdateDocument = Partial<DocumentMetadata>;
export interface UploadedDocumentFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}
export interface DocumentTimelineRecord {
  id: string;
  dependentId: string;
  createdAt: Date;
}
