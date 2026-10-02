import { ConfigService } from '@nestjs/config';
import { timelineFixture } from './timeline-fixture';
import { InMemoryFileStorage, FakeMalwareScanner } from './in-memory-documents';
import { DocumentsService } from '../../src/modules/documents/documents.service';
import { DocumentFileValidator } from '../../src/modules/documents/document-file-validator';
import { DocumentTimelineSource } from '../../src/modules/documents/document-timeline.source';
import { AuditService } from '../../src/modules/audit/audit.service';
import type { CreateDocumentDto } from '../../src/modules/documents/dto/document.dto';
export const DOCUMENT_TEST_CONFIG = {
  DOCUMENT_STORAGE_ROOT: '.private-documents',
  DOCUMENT_MAX_BYTES: 5242880,
  DOCUMENT_MAX_STORED_BYTES: 104857600,
  DOCUMENT_MAX_STORED_FILES: 500,
  DOCUMENT_IO_CONCURRENCY: 2,
  DOCUMENT_ALLOWED_MIME_TYPES: ['application/pdf', 'image/png', 'image/jpeg'],
  DOCUMENT_SCANNER: 'disabled',
  DOCUMENT_SCAN_HOST: '127.0.0.1',
  DOCUMENT_SCAN_PORT: 3310,
  DOCUMENT_SCAN_TIMEOUT_MS: 1000,
};
// Bytes exclusivamente fictícios para validar a infraestrutura, não documentos de titulares.
export const pngBytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+XbT8AAAAASUVORK5CYII=',
  'base64',
);
export const pdfBytes = Buffer.from(
  '%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n',
  'ascii',
);
export function documentFile(
  bytes = pngBytes,
  originalname = 'fixture.png',
  mimetype = 'image/png',
) {
  return { buffer: Buffer.from(bytes), size: bytes.length, originalname, mimetype };
}
export function documentDto(overrides: Partial<CreateDocumentDto> = {}): CreateDocumentDto {
  return { category: 'OTHER', title: 'Documento fictício', ...overrides };
}
export async function documentFixture() {
  const f = await timelineFixture(),
    storage = new InMemoryFileStorage(),
    scanner = new FakeMalwareScanner(),
    config = new ConfigService(DOCUMENT_TEST_CONFIG);
  const validator = new DocumentFileValidator(config);
  const documents = new DocumentsService(
    f.foundation,
    f.authorization,
    new AuditService(),
    storage,
    scanner,
    validator,
    config,
  );
  return {
    ...f,
    storage,
    scanner,
    config,
    validator,
    documents,
    source: new DocumentTimelineSource(),
  };
}
