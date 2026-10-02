import { Module } from '@nestjs/common';
import { RepositoryModule } from '../../repository/repository.module';
import { DependentsModule } from '../dependents/dependents.module';
import { AuditModule } from '../audit/audit.module';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';
import {
  AppointmentTimelineSource,
  RecommendationTimelineSource,
} from './appointment-timeline.source';
@Module({
  imports: [RepositoryModule, DependentsModule, AuditModule],
  controllers: [AppointmentsController],
  providers: [AppointmentsService, AppointmentTimelineSource, RecommendationTimelineSource],
  exports: [AppointmentTimelineSource, RecommendationTimelineSource],
})
export class AppointmentsModule {}
