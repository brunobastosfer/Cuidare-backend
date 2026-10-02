import { Module } from '@nestjs/common';
import { RepositoryModule } from '../../repository/repository.module';
import { DependentsModule } from '../dependents/dependents.module';
import { AuditModule } from '../audit/audit.module';
import { MedicationsController } from './medications.controller';
import { MedicationsService } from './medications.service';
import { MedicationTimelineSource } from './medication-timeline.source';
@Module({
  imports: [RepositoryModule, DependentsModule, AuditModule],
  controllers: [MedicationsController],
  providers: [MedicationsService, MedicationTimelineSource],
  exports: [MedicationTimelineSource],
})
export class MedicationsModule {}
