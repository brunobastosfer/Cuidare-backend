import { timelineFixture } from './timeline-fixture';
import { EducationService } from '../../src/modules/education/education.service';
import { AuditService } from '../../src/modules/audit/audit.service';
import { SchoolReportTimelineSource } from '../../src/modules/education/school-report-timeline.source';
import type {
  CreateEnrollmentDto,
  CreateReportDto,
} from '../../src/modules/education/dto/education.dto';
export function enrollmentDto(overrides: Partial<CreateEnrollmentDto> = {}): CreateEnrollmentDto {
  return { schoolName: 'Escola fictícia', schoolYear: 2025, startDate: '2025-01-01', ...overrides };
}
export function reportDto(overrides: Partial<CreateReportDto> = {}): CreateReportDto {
  return { title: 'Relatório fictício', reportDate: '2025-06-01', ...overrides };
}
export async function educationFixture() {
  const f = await timelineFixture(),
    education = new EducationService(f.foundation, f.authorization, new AuditService());
  const enrollment = await education.createEnrollment(f.user.id, f.dependent.id, enrollmentDto());
  const report = await education.createReport(
    f.user.id,
    f.dependent.id,
    reportDto({ enrollmentId: enrollment.id }),
  );
  return { ...f, education, enrollment, report, sources: [new SchoolReportTimelineSource()] };
}
