import type {
  SchoolEnrollment,
  SchoolReportDetails,
  CreateEnrollment,
  UpdateEnrollment,
  CreateReport,
  UpdateReport,
} from '../domain/models/education.model';
import type { Pagination } from './dependent.repository';
import type { TimelineSourceQuery } from './timeline-source.repository';
export const EDUCATION_REPOSITORY = Symbol('EDUCATION_REPOSITORY');
export interface EducationRepository {
  listEnrollments(
    dependentId: string,
    userId: string,
    pagination: Pagination,
  ): Promise<SchoolEnrollment[]>;
  findEnrollment(id: string, dependentId: string, userId: string): Promise<SchoolEnrollment | null>;
  createEnrollment(data: CreateEnrollment): Promise<SchoolEnrollment>;
  updateEnrollment(
    id: string,
    dependentId: string,
    userId: string,
    data: UpdateEnrollment,
  ): Promise<SchoolEnrollment | null>;
  deleteEnrollment(id: string, dependentId: string, userId: string, now: Date): Promise<boolean>;
  listReports(
    dependentId: string,
    userId: string,
    pagination: Pagination,
  ): Promise<SchoolReportDetails[]>;
  findReport(id: string, dependentId: string, userId: string): Promise<SchoolReportDetails | null>;
  createReport(data: CreateReport): Promise<SchoolReportDetails>;
  updateReport(
    id: string,
    dependentId: string,
    userId: string,
    data: UpdateReport,
  ): Promise<SchoolReportDetails | null>;
  deleteReport(id: string, dependentId: string, userId: string, now: Date): Promise<boolean>;
  readTimeline(
    query: TimelineSourceQuery,
  ): Promise<{ id: string; dependentId: string; reportDate: Date; createdAt: Date }[]>;
}
