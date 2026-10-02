import { randomUUID } from 'node:crypto';
import type {
  SchoolEnrollment,
  SchoolReport,
  SchoolReportDetails,
} from '../../src/domain/models/education.model';
import type { DependentAccessRole } from '../../src/domain/models/dependent.model';
import type { Document } from '../../src/domain/models/document.model';
import type { EducationRepository } from '../../src/repository/education.repository';
import { matchesTimelineQuery, compareTimelinePositions } from '../../src/domain/timeline-query';
// Fixture somente: não substitui constraints, isolamento e locks PostgreSQL.
export class InMemoryEducation implements EducationRepository {
  readonly enrollments = new Map<string, SchoolEnrollment>();
  readonly reports = new Map<string, SchoolReport>();
  constructor(
    private readonly role: (userId: string, dependentId: string) => DependentAccessRole | null,
    private readonly documents: Map<string, Document>,
  ) {}
  details(row: SchoolReport): SchoolReportDetails {
    const enrollment = row.enrollmentId ? this.enrollments.get(row.enrollmentId) : null,
      document = row.documentId ? this.documents.get(row.documentId) : null;
    return {
      ...row,
      enrollment: enrollment ? { id: enrollment.id, deletedAt: enrollment.deletedAt } : null,
      document: document ? { id: document.id, deletedAt: document.deletedAt } : null,
    };
  }
  private visible<T extends SchoolEnrollment | SchoolReport>(
    rows: Map<string, T>,
    id: string,
    dependentId: string,
    userId: string,
    roles: DependentAccessRole[] = ['OWNER', 'EDITOR', 'VIEWER'],
  ) {
    const row = rows.get(id),
      role = this.role(userId, dependentId);
    return row && !row.deletedAt && row.dependentId === dependentId && role && roles.includes(role)
      ? row
      : null;
  }
  listEnrollments: EducationRepository['listEnrollments'] = (
    dependentId,
    userId,
    { limit, offset },
  ) =>
    Promise.resolve(
      [...this.enrollments.values()]
        .filter((r) => this.visible(this.enrollments, r.id, dependentId, userId))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id))
        .slice(offset, offset + limit)
        .map((r) => ({ ...r })),
    );
  findEnrollment: EducationRepository['findEnrollment'] = (id, dependentId, userId) => {
    const row = this.visible(this.enrollments, id, dependentId, userId);
    return Promise.resolve(row ? { ...row } : null);
  };
  createEnrollment: EducationRepository['createEnrollment'] = (data) => {
    const row: SchoolEnrollment = {
      ...data,
      id: randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };
    this.enrollments.set(row.id, row);
    return Promise.resolve({ ...row });
  };
  updateEnrollment: EducationRepository['updateEnrollment'] = (id, dependentId, userId, data) => {
    const current = this.visible(this.enrollments, id, dependentId, userId, ['OWNER', 'EDITOR']);
    if (!current) return Promise.resolve(null);
    const row = { ...current, ...data, updatedAt: new Date() };
    this.enrollments.set(id, row);
    return Promise.resolve({ ...row });
  };
  deleteEnrollment: EducationRepository['deleteEnrollment'] = (id, dependentId, userId, now) => {
    const row = this.visible(this.enrollments, id, dependentId, userId, ['OWNER']);
    if (!row) return Promise.resolve(false);
    this.enrollments.set(id, { ...row, deletedAt: now, updatedAt: now });
    return Promise.resolve(true);
  };
  listReports: EducationRepository['listReports'] = (dependentId, userId, { limit, offset }) =>
    Promise.resolve(
      [...this.reports.values()]
        .filter((r) => this.visible(this.reports, r.id, dependentId, userId))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id))
        .slice(offset, offset + limit)
        .map((r) => this.details(r)),
    );
  findReport: EducationRepository['findReport'] = (id, dependentId, userId) => {
    const row = this.visible(this.reports, id, dependentId, userId);
    return Promise.resolve(row ? this.details(row) : null);
  };
  createReport: EducationRepository['createReport'] = (data) => {
    const row: SchoolReport = {
      ...data,
      id: randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };
    this.reports.set(row.id, row);
    return Promise.resolve(this.details(row));
  };
  updateReport: EducationRepository['updateReport'] = (id, dependentId, userId, data) => {
    const current = this.visible(this.reports, id, dependentId, userId, ['OWNER', 'EDITOR']);
    if (!current) return Promise.resolve(null);
    const row = { ...current, ...data, updatedAt: new Date() };
    this.reports.set(id, row);
    return Promise.resolve(this.details(row));
  };
  deleteReport: EducationRepository['deleteReport'] = (id, dependentId, userId, now) => {
    const row = this.visible(this.reports, id, dependentId, userId, ['OWNER']);
    if (!row) return Promise.resolve(false);
    this.reports.set(id, { ...row, deletedAt: now, updatedAt: now });
    return Promise.resolve(true);
  };
  readTimeline: EducationRepository['readTimeline'] = (query) =>
    Promise.resolve(
      [...this.reports.values()]
        .filter((r) => this.visible(this.reports, r.id, query.dependentId, query.userId))
        .map((r) => ({
          id: 'school-report-recorded:' + r.id,
          sourceId: r.id,
          dependentId: r.dependentId,
          type: 'SCHOOL_REPORT_RECORDED' as const,
          title: 'Fixture',
          summary: null,
          sourceType: 'SCHOOL_REPORT',
          eventDate: r.reportDate,
          createdAt: r.createdAt,
        }))
        .filter((e) => matchesTimelineQuery(e, query))
        .sort((a, b) => compareTimelinePositions(a, b, query.order))
        .slice(0, query.take)
        .map((e) => ({
          id: e.sourceId,
          dependentId: e.dependentId,
          reportDate: e.eventDate,
          createdAt: e.createdAt,
        })),
    );
}
