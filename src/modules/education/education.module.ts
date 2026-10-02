import { Module } from '@nestjs/common';
import { RepositoryModule } from '../../repository/repository.module';
import { DependentsModule } from '../dependents/dependents.module';
import { AuditModule } from '../audit/audit.module';
import { EducationController } from './education.controller';
import { EducationService } from './education.service';
import { SchoolReportTimelineSource } from './school-report-timeline.source';
@Module({
  imports: [RepositoryModule, DependentsModule, AuditModule],
  controllers: [EducationController],
  providers: [EducationService, SchoolReportTimelineSource],
  exports: [SchoolReportTimelineSource],
})
export class EducationModule {}
