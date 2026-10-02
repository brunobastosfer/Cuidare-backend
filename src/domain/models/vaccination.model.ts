export const VACCINE_SCHEDULE_TYPES = ['PUBLIC', 'PRIVATE_COMPLEMENTARY'] as const;
export type VaccineScheduleType = (typeof VACCINE_SCHEDULE_TYPES)[number];
export interface VaccineReference {
  id: string;
  source: string;
  sourceVersion: string;
  validFrom: Date;
  validUntil: Date | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}
export interface VaccineCatalog extends VaccineReference {
  code: string;
  name: string;
}
export interface VaccineSchedule extends VaccineReference {
  name: string;
  type: VaccineScheduleType;
  ruleModel: 'BIRTH_AGE_FIXED_V1';
}
export interface VaccineScheduleDose {
  id: string;
  scheduleId: string;
  vaccineId: string;
  dose: string;
  dueAgeMonths: number;
  dueAgeDays: number;
  vaccine: VaccineCatalog;
}
export interface VaccinationFields {
  dose: string;
  administeredAt: Date;
  institutionName: string | null;
  batchNumber: string | null;
  notes: string | null;
  documentId: string | null;
}
export interface DependentVaccination extends VaccinationFields {
  id: string;
  dependentId: string;
  vaccineId: string;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}
export interface VaccinationDetails extends DependentVaccination {
  vaccine: VaccineCatalog;
  document: { id: string; deletedAt: Date | null } | null;
}
export type CreateVaccination = Omit<
  DependentVaccination,
  'id' | 'createdAt' | 'updatedAt' | 'deletedAt'
>;
export type UpdateVaccination = Partial<VaccinationFields>;
export type VaccinationScheduleStatus = 'REGISTRADA' | 'PREVISTA' | 'ATRASADA';
export interface VaccinationStatusItem {
  rule: VaccineScheduleDose;
  expectedDate: Date;
  status: VaccinationScheduleStatus;
  recordIds: string[];
}
