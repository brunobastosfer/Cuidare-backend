import { Module } from '@nestjs/common';
import { RepositoryModule } from '../../repository/repository.module';
import { TIMELINE_SOURCES } from '../../repository/timeline-source.repository';
import { DependentsModule } from '../dependents/dependents.module';
import { DependentTimelineSource } from '../dependents/dependent-timeline.source';
import { MedicationsModule } from '../medications/medications.module';
import { MedicationTimelineSource } from '../medications/medication-timeline.source';
import { AppointmentsModule } from '../appointments/appointments.module';
import {
  AppointmentTimelineSource,
  RecommendationTimelineSource,
} from '../appointments/appointment-timeline.source';
import { TimelineController } from './timeline.controller';
import { TimelineService } from './timeline.service';
import { TimelineCursorService } from './timeline-cursor.service';
import { DocumentsModule } from '../documents/documents.module';
import { DocumentTimelineSource } from '../documents/document-timeline.source';
import { VaccinationsModule } from '../vaccinations/vaccinations.module';
import { VaccinationTimelineSource } from '../vaccinations/vaccination-timeline.source';
import { EducationModule } from '../education/education.module';
import { SchoolReportTimelineSource } from '../education/school-report-timeline.source';
@Module({
  imports: [
    RepositoryModule,
    DependentsModule,
    MedicationsModule,
    AppointmentsModule,
    DocumentsModule,
    VaccinationsModule,
    EducationModule,
  ],
  controllers: [TimelineController],
  providers: [
    TimelineService,
    TimelineCursorService,
    {
      provide: TIMELINE_SOURCES,
      inject: [
        DependentTimelineSource,
        MedicationTimelineSource,
        AppointmentTimelineSource,
        RecommendationTimelineSource,
        DocumentTimelineSource,
        VaccinationTimelineSource,
        SchoolReportTimelineSource,
      ],
      useFactory: (
        source: DependentTimelineSource,
        medications: MedicationTimelineSource,
        appointments: AppointmentTimelineSource,
        recommendations: RecommendationTimelineSource,
        documents: DocumentTimelineSource,
        vaccinations: VaccinationTimelineSource,
        education: SchoolReportTimelineSource,
      ) => [source, medications, appointments, recommendations, documents, vaccinations, education],
    },
  ],
  exports: [TimelineService],
})
export class TimelineModule {}
