import { randomUUID } from 'node:crypto';
import type { Document } from '../../src/domain/models/document.model';
import type { DocumentRepository } from '../../src/repository/document.repository';
import type { DependentAccessRole } from '../../src/domain/models/dependent.model';
import type { FileStorageRepository } from '../../src/repository/file-storage.repository';
import type {
  MalwareScannerRepository,
  MalwareScanResult,
} from '../../src/repository/malware-scanner.repository';
import { compareTimelinePositions, matchesTimelineQuery } from '../../src/domain/timeline-query';
export class InMemoryDocuments implements DocumentRepository {
  readonly rows = new Map<string, Document>();
  constructor(
    private readonly role: (userId: string, dependentId: string) => DependentAccessRole | null,
  ) {}
  private findRow(
    id: string,
    dependentId: string,
    userId: string,
    roles: DependentAccessRole[] = ['OWNER', 'EDITOR', 'VIEWER'],
  ) {
    const row = this.rows.get(id),
      role = this.role(userId, dependentId);
    return row && !row.deletedAt && row.dependentId === dependentId && role && roles.includes(role)
      ? { ...row }
      : null;
  }
  list: DocumentRepository['list'] = (dependentId, userId, { limit, offset }) =>
    Promise.resolve(
      [...this.rows.values()]
        .filter((row) => this.findRow(row.id, dependentId, userId))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? -1 : 1))
        .slice(offset, offset + limit)
        .map((row) => ({ ...row })),
    );
  find: DocumentRepository['find'] = (id, dependentId, userId) =>
    Promise.resolve(this.findRow(id, dependentId, userId));
  create: DocumentRepository['create'] = (data) => {
    const row = {
      ...data,
      id: randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };
    this.rows.set(row.id, row);
    return Promise.resolve({ ...row });
  };
  update: DocumentRepository['update'] = (id, dependentId, userId, data) => {
    const row = this.findRow(id, dependentId, userId, ['OWNER', 'EDITOR']);
    if (!row) return Promise.resolve(null);
    const next = { ...row, ...data, updatedAt: new Date() };
    this.rows.set(id, next);
    return Promise.resolve({ ...next });
  };
  delete: DocumentRepository['delete'] = (id, dependentId, userId, now) => {
    const row = this.findRow(id, dependentId, userId, ['OWNER']);
    if (!row) return Promise.resolve(false);
    this.rows.set(id, { ...row, deletedAt: now, updatedAt: now });
    return Promise.resolve(true);
  };
  storageUsage: DocumentRepository['storageUsage'] = (dependentId, userId) => {
    const role = this.role(userId, dependentId);
    const rows =
      role && ['OWNER', 'EDITOR'].includes(role)
        ? [...this.rows.values()].filter((row) => row.dependentId === dependentId)
        : [];
    return Promise.resolve({
      files: rows.length,
      bytes: rows.reduce((total, row) => total + row.size, 0),
    });
  };
  readTimeline: DocumentRepository['readTimeline'] = (query) => {
    const events = [...this.rows.values()]
      .filter((row) => this.findRow(row.id, query.dependentId, query.userId))
      .map((row) => ({
        id: 'document-uploaded:' + row.id,
        dependentId: row.dependentId,
        type: 'DOCUMENT_UPLOADED' as const,
        title: 'Fixture',
        summary: null,
        sourceId: row.id,
        sourceType: 'DOCUMENT',
        eventDate: row.createdAt,
        createdAt: row.createdAt,
      }));
    return Promise.resolve(
      events
        .filter((event) => matchesTimelineQuery(event, query))
        .sort((a, b) => compareTimelinePositions(a, b, query.order))
        .slice(0, query.take)
        .map((event) => ({
          id: event.sourceId,
          dependentId: event.dependentId,
          createdAt: event.createdAt,
        })),
    );
  };
}
export class InMemoryFileStorage implements FileStorageRepository {
  readonly rows = new Map<string, Buffer>();
  readonly removed: string[] = [];
  put(key: string, bytes: Buffer) {
    if (this.rows.has(key)) return Promise.reject(new Error('immutable fixture'));
    this.rows.set(key, Buffer.from(bytes));
    return Promise.resolve();
  }
  get(key: string, maxBytes: number) {
    const bytes = this.rows.get(key);
    return bytes && bytes.length <= maxBytes
      ? Promise.resolve(Buffer.from(bytes))
      : Promise.reject(new Error('fixture unavailable'));
  }
  remove(key: string) {
    this.rows.delete(key);
    this.removed.push(key);
    return Promise.resolve();
  }
}
// Somente testes. Não é antivírus e nunca é adaptador de produção.
export class FakeMalwareScanner implements MalwareScannerRepository {
  configured = true;
  verdict: MalwareScanResult = 'CLEAN';
  scan(_bytes: Buffer) {
    return Promise.resolve(this.verdict);
  }
}
