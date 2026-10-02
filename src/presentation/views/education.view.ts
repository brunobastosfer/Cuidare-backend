import type { SchoolEnrollment, SchoolReportDetails } from '../../domain/models/education.model';
export function enrollmentView(row: SchoolEnrollment) {
  return {
    id: row.id,
    dependentId: row.dependentId,
    schoolName: row.schoolName,
    schoolYear: row.schoolYear,
    grade: row.grade,
    className: row.className,
    startDate: row.startDate.toISOString().slice(0, 10),
    endDate: row.endDate?.toISOString().slice(0, 10) ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
export function schoolReportView(row: SchoolReportDetails) {
  return {
    id: row.id,
    dependentId: row.dependentId,
    enrollmentId: row.enrollment && !row.enrollment.deletedAt ? row.enrollment.id : null,
    title: row.title,
    reportDate: row.reportDate.toISOString().slice(0, 10),
    summary: row.summary,
    observations: row.observations,
    documentId: row.document && !row.document.deletedAt ? row.document.id : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
