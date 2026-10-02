import { Module } from '@nestjs/common';
import { RepositoryModule } from '../../repository/repository.module';
import { AuditModule } from '../audit/audit.module';
import { DependentAuthorizationService } from './dependent-authorization.service';
import { DependentsService } from './dependents.service';
import { DependentsController } from './dependents.controller';
import { DependentTimelineSource } from './dependent-timeline.source';
@Module({
  imports: [RepositoryModule, AuditModule],
  controllers: [DependentsController],
  providers: [DependentsService, DependentAuthorizationService, DependentTimelineSource],
  exports: [DependentAuthorizationService, DependentTimelineSource],
})
export class DependentsModule {}
