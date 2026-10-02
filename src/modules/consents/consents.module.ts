import { Module } from '@nestjs/common';
import { RepositoryModule } from '../../repository/repository.module';
import { AuditModule } from '../audit/audit.module';
import { DependentsModule } from '../dependents/dependents.module';
import { ConsentsController } from './consents.controller';
import { ConsentsService } from './consents.service';
@Module({
  imports: [RepositoryModule, AuditModule, DependentsModule],
  controllers: [ConsentsController],
  providers: [ConsentsService],
  exports: [ConsentsService],
})
export class ConsentsModule {}
