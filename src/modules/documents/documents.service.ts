import { createHash, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  UNIT_OF_WORK_REPOSITORY,
  type UnitOfWorkRepository,
} from '../../repository/unit-of-work.repository';
import {
  FILE_STORAGE_REPOSITORY,
  type FileStorageRepository,
} from '../../repository/file-storage.repository';
import {
  MALWARE_SCANNER_REPOSITORY,
  type MalwareScannerRepository,
} from '../../repository/malware-scanner.repository';
import type { Pagination } from '../../repository/dependent.repository';
import type { UploadedDocumentFile, UpdateDocument } from '../../domain/models/document.model';
import type { AuditedDocumentField } from '../../domain/models/audit-log.model';
import { DependentAuthorizationService } from '../dependents/dependent-authorization.service';
import { AuditService } from '../audit/audit.service';
import { isCivilDate } from '../../common/validation/civil-date';
import type { CreateDocumentDto, UpdateDocumentDto } from './dto/document.dto';
import { DocumentFileValidator } from './document-file-validator';
@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);
  constructor(
    @Inject(UNIT_OF_WORK_REPOSITORY) private readonly transactions: UnitOfWorkRepository,
    private readonly authorization: DependentAuthorizationService,
    private readonly audit: AuditService,
    @Inject(FILE_STORAGE_REPOSITORY) private readonly storage: FileStorageRepository,
    @Inject(MALWARE_SCANNER_REPOSITORY) private readonly scanner: MalwareScannerRepository,
    private readonly validator: DocumentFileValidator,
    private readonly config: ConfigService,
  ) {}
  list(userId: string, dependentId: string, pagination: Pagination) {
    return this.transactions.run(async (r) => {
      await this.authorization.requireRole(
        userId,
        dependentId,
        ['OWNER', 'EDITOR', 'VIEWER'],
        r.dependentAccess,
      );
      return r.documents.list(dependentId, userId, pagination);
    });
  }
  find(userId: string, dependentId: string, id: string) {
    return this.transactions.run(async (r) => {
      await this.authorization.requireRole(
        userId,
        dependentId,
        ['OWNER', 'EDITOR', 'VIEWER'],
        r.dependentAccess,
      );
      const row = await r.documents.find(id, dependentId, userId);
      if (!row) throw new NotFoundException('Documento não encontrado.');
      await this.audit.record(r.auditLogs, {
        actorId: userId,
        dependentId,
        action: 'DOCUMENT_VIEWED',
        resourceType: 'DOCUMENT',
        resourceId: id,
        metadata: {},
      });
      return row;
    });
  }
  async upload(
    userId: string,
    dependentId: string,
    dto: CreateDocumentDto,
    file: UploadedDocumentFile | undefined,
  ) {
    await this.authorization.requireRole(userId, dependentId, ['OWNER', 'EDITOR']);
    if (!this.scanner.configured)
      throw new ServiceUnavailableException('Verificação de arquivos indisponível.');
    const metadata = await this.validator.validate(file);
    const documentDate = dto.documentDate ? this.civil(dto.documentDate) : null;
    let verdict;
    try {
      verdict = await this.scanner.scan(file!.buffer);
    } catch {
      throw new ServiceUnavailableException('Verificação de arquivos indisponível.');
    }
    if (verdict === 'INFECTED') throw new BadRequestException('Arquivo não permitido.');
    if (verdict !== 'CLEAN')
      throw new ServiceUnavailableException('Verificação de arquivos indisponível.');
    const key = randomUUID() + '.bin',
      scannedAt = new Date();
    try {
      await this.storage.put(key, file!.buffer);
    } catch {
      throw new ServiceUnavailableException('Armazenamento de arquivos indisponível.');
    }
    try {
      // Storage/scan fora da callback repetível. Reautorizar e auditar no commit.
      return await this.transactions.run(async (r) => {
        await this.authorization.requireRole(
          userId,
          dependentId,
          ['OWNER', 'EDITOR'],
          r.dependentAccess,
        );
        const usage = await r.documents.storageUsage(dependentId, userId);
        if (
          usage.files >= this.config.getOrThrow<number>('DOCUMENT_MAX_STORED_FILES') ||
          usage.bytes + metadata.size > this.config.getOrThrow<number>('DOCUMENT_MAX_STORED_BYTES')
        )
          throw new PayloadTooLargeException('Quota de documentos do dependente atingida.');
        const row = await r.documents.create({
          ...metadata,
          dependentId,
          storageKey: key,
          createdByUserId: userId,
          scannedAt,
          category: dto.category,
          title: dto.title,
          description: dto.description ?? null,
          documentDate,
        });
        await this.audit.record(r.auditLogs, {
          actorId: userId,
          dependentId,
          action: 'DOCUMENT_UPLOADED',
          resourceType: 'DOCUMENT',
          resourceId: row.id,
          metadata: {},
        });
        return row;
      });
    } catch (error) {
      try {
        await this.storage.remove(key);
      } catch {
        this.logger.error({ event: 'document_upload_cleanup_failed' });
      } // Sem key, nomes, bytes ou driver.
      throw error;
    }
  }
  async update(userId: string, dependentId: string, id: string, dto: UpdateDocumentDto) {
    const changes: UpdateDocument = {};
    for (const key of ['category', 'title', 'description'] as const)
      if (dto[key] !== undefined) Object.assign(changes, { [key]: dto[key] });
    if (dto.documentDate !== undefined)
      changes.documentDate = dto.documentDate === null ? null : this.civil(dto.documentDate);
    if (!Object.keys(changes).length)
      throw new BadRequestException('Informe ao menos um campo para atualizar.');
    return this.transactions.run(async (r) => {
      await this.authorization.requireRole(
        userId,
        dependentId,
        ['OWNER', 'EDITOR'],
        r.dependentAccess,
      );
      const row = await r.documents.update(id, dependentId, userId, changes);
      if (!row) throw new NotFoundException('Documento não encontrado.');
      await this.audit.record(r.auditLogs, {
        actorId: userId,
        dependentId,
        action: 'DOCUMENT_UPDATED',
        resourceType: 'DOCUMENT',
        resourceId: id,
        metadata: { changedFields: Object.keys(changes) as AuditedDocumentField[] },
      });
      return row;
    });
  }
  delete(userId: string, dependentId: string, id: string) {
    return this.transactions.run(async (r) => {
      await this.authorization.requireRole(userId, dependentId, ['OWNER'], r.dependentAccess);
      if (!(await r.documents.delete(id, dependentId, userId, new Date())))
        throw new NotFoundException('Documento não encontrado.');
      await this.audit.record(r.auditLogs, {
        actorId: userId,
        dependentId,
        action: 'DOCUMENT_DELETED',
        resourceType: 'DOCUMENT',
        resourceId: id,
        metadata: {},
      });
      // Preservar bytes para revisão de retention; não unlink em soft delete.
    });
  }
  async download(userId: string, dependentId: string, id: string) {
    const before = await this.transactions.run(async (r) => {
      await this.authorization.requireRole(
        userId,
        dependentId,
        ['OWNER', 'EDITOR', 'VIEWER'],
        r.dependentAccess,
      );
      const row = await r.documents.find(id, dependentId, userId);
      if (!row) throw new NotFoundException('Documento não encontrado.');
      return row;
    });
    let bytes: Buffer;
    try {
      bytes = await this.storage.get(before.storageKey, before.size);
      if (
        bytes.length !== before.size ||
        createHash('sha256').update(bytes).digest('hex') !== before.checksum
      )
        throw new Error('Integridade inválida.');
    } catch {
      throw new ServiceUnavailableException('Conteúdo de documento indisponível.');
    }
    const row = await this.transactions.run(async (r) => {
      await this.authorization.requireRole(
        userId,
        dependentId,
        ['OWNER', 'EDITOR', 'VIEWER'],
        r.dependentAccess,
      );
      const current = await r.documents.find(id, dependentId, userId);
      if (
        !current ||
        current.storageKey !== before.storageKey ||
        current.checksum !== before.checksum
      )
        throw new NotFoundException('Documento não encontrado.');
      await this.audit.record(r.auditLogs, {
        actorId: userId,
        dependentId,
        action: 'DOCUMENT_DOWNLOADED',
        resourceType: 'DOCUMENT',
        resourceId: id,
        metadata: {},
      });
      return current;
    });
    return { row, bytes };
  }
  private civil(value: string) {
    if (!isCivilDate(value)) throw new BadRequestException('Data do documento inválida.');
    return new Date(value + 'T00:00:00.000Z');
  }
}
