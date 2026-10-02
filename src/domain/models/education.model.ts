export interface EnrollmentFields {
  schoolName: string;
  schoolYear: number;
  grade: string | null;
  className: string | null;
  startDate: Date;
  endDate: Date | null;
}
export interface SchoolEnrollment extends EnrollmentFields {
  id: string;
  dependentId: string;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}
export interface ReportFields {
  enrollmentId: string | null;
  title: string;
  reportDate: Date;
  summary: string | null;
  observations: string | null;
  documentId: string | null;
}
export interface SchoolReport extends ReportFields {
  id: string;
  dependentId: string;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}
export interface SchoolReportDetails extends SchoolReport {
  enrollment: { id: string; deletedAt: Date | null } | null;
  document: { id: string; deletedAt: Date | null } | null;
}
export type CreateEnrollment = EnrollmentFields &
  Pick<SchoolEnrollment, 'dependentId' | 'createdByUserId'>;
export type UpdateEnrollment = Partial<EnrollmentFields>;
export type CreateReport = ReportFields & Pick<SchoolReport, 'dependentId' | 'createdByUserId'>;
export type UpdateReport = Partial<ReportFields>;
