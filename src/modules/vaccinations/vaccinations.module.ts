import { Module } from '@nestjs/common';
import { RepositoryModule } from '../../repository/repository.module';
import { DependentsModule } from '../dependents/dependents.module';
import { AuditModule } from '../audit/audit.module';
import {
  VaccinationsController,
  VaccineCatalogController,
  VaccineSchedulesController,
} from './vaccinations.controller';
import { VaccinationsService } from './vaccinations.service';
import { VaccinationTimelineSource } from './vaccination-timeline.source';
@Module({
  imports: [RepositoryModule, DependentsModule, AuditModule],
  controllers: [VaccinationsController, VaccineCatalogController, VaccineSchedulesController],
  providers: [VaccinationsService, VaccinationTimelineSource],
  exports: [VaccinationTimelineSource],
})
export class VaccinationsModule {}
