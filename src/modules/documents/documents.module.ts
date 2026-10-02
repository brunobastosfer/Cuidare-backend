import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { RepositoryModule } from '../../repository/repository.module';
import { FILE_STORAGE_REPOSITORY } from '../../repository/file-storage.repository';
import { MALWARE_SCANNER_REPOSITORY } from '../../repository/malware-scanner.repository';
import { LocalFileStorageRepository } from '../../infrastructure/storage/local-file-storage.repository';
import { ClamAvScannerRepository } from '../../infrastructure/scanning/clamav-scanner.repository';
import { DependentsModule } from '../dependents/dependents.module';
import { AuditModule } from '../audit/audit.module';
import { DocumentsService } from './documents.service';
import { DocumentsController } from './documents.controller';
import { DocumentFileValidator } from './document-file-validator';
import { DocumentIoBudget } from './document-io-budget';
import { DocumentIoInterceptor } from './document-io.interceptor';
import { DocumentUploadGuard } from './document-upload.guard';
import { DocumentTimelineSource } from './document-timeline.source';
@Module({
  imports: [
    RepositoryModule,
    DependentsModule,
    AuditModule,
    MulterModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        limits: {
          fileSize: config.getOrThrow<number>('DOCUMENT_MAX_BYTES'),
          files: 1,
          fields: 4,
          parts: 5,
          fieldSize: 2048,
          fieldNameSize: 100,
        },
      }),
    }),
  ],
  controllers: [DocumentsController],
  providers: [
    DocumentsService,
    DocumentFileValidator,
    DocumentIoBudget,
    DocumentIoInterceptor,
    DocumentUploadGuard,
    DocumentTimelineSource,
    { provide: FILE_STORAGE_REPOSITORY, useClass: LocalFileStorageRepository },
    { provide: MALWARE_SCANNER_REPOSITORY, useClass: ClamAvScannerRepository },
  ],
  exports: [DocumentTimelineSource],
})
export class DocumentsModule {}
