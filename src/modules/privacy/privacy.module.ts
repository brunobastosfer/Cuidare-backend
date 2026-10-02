import { Module } from '@nestjs/common';
import { RepositoryModule } from '../../repository/repository.module';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { ConsentsModule } from '../consents/consents.module';
import { PrivacyController } from './privacy.controller';
import { PrivacyService } from './privacy.service';
import { JsonPrivacyExportFormatter } from './json-privacy-export.formatter';
import { PRIVACY_EXPORT_FORMATTER } from './privacy-export-formatter';
@Module({
  imports: [RepositoryModule, AuthModule, AuditModule, ConsentsModule],
  controllers: [PrivacyController],
  providers: [
    PrivacyService,
    { provide: PRIVACY_EXPORT_FORMATTER, useClass: JsonPrivacyExportFormatter },
  ],
})
export class PrivacyModule {}
