export const MEDICATION_TREATMENT_STATUSES = ['ACTIVE', 'COMPLETED', 'SUSPENDED'] as const;
export type MedicationTreatmentStatus = (typeof MEDICATION_TREATMENT_STATUSES)[number];
export type MedicationTimelineType = 'MEDICATION_STARTED' | 'MEDICATION_COMPLETED';
export function medicationEventPrefix(type: MedicationTimelineType) {
  return type === 'MEDICATION_STARTED' ? 'medication-started:' : 'medication-completed:';
}
export interface Medication {
  id: string;
  dependentId: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}
export interface TreatmentFields {
  dosage: string;
  unit: string;
  frequency: string;
  route: string | null;
  startDate: Date;
  endDate: Date | null;
  continuousUse: boolean;
  instructions: string | null;
  prescribedBy: string | null;
  reason: string | null;
  notes: string | null;
  status: MedicationTreatmentStatus;
}
export interface MedicationTreatment extends TreatmentFields {
  id: string;
  dependentId: string;
  medicationId: string;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}
export interface MedicationTreatmentDetails extends MedicationTreatment {
  medication: Medication;
}
export type CreateMedicationTreatment = TreatmentFields & {
  dependentId: string;
  medicationId: string;
  completedAt: Date | null;
};
export type UpdateMedicationTreatment = Partial<TreatmentFields> & { completedAt?: Date | null };
export interface TreatmentTimelineRecord {
  id: string;
  dependentId: string;
  eventDate: Date;
  createdAt: Date;
}
