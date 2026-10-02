import type {
  Medication,
  MedicationTreatmentDetails,
  CreateMedicationTreatment,
  UpdateMedicationTreatment,
  MedicationTimelineType,
  TreatmentTimelineRecord,
} from '../domain/models/medication.model';
import type { DependentAccessRole } from '../domain/models/dependent.model';
import type { Pagination } from './dependent.repository';
import type { TimelineSourceQuery } from './timeline-source.repository';
export const MEDICATION_REPOSITORY = Symbol('MEDICATION_REPOSITORY');
export interface MedicationRepository {
  listProducts(dependentId: string, userId: string, pagination: Pagination): Promise<Medication[]>;
  findProduct(id: string, dependentId: string, userId: string): Promise<Medication | null>;
  createProduct(dependentId: string, name: string): Promise<Medication>;
  updateProduct(
    id: string,
    dependentId: string,
    userId: string,
    name: string,
  ): Promise<Medication | null>;
  hasTreatments(medicationId: string, dependentId: string, userId: string): Promise<boolean>;
  deleteProduct(id: string, dependentId: string, userId: string, now: Date): Promise<boolean>;
  listTreatments(
    dependentId: string,
    userId: string,
    pagination: Pagination,
  ): Promise<MedicationTreatmentDetails[]>;
  findTreatment(
    id: string,
    dependentId: string,
    userId: string,
  ): Promise<MedicationTreatmentDetails | null>;
  createTreatment(data: CreateMedicationTreatment): Promise<MedicationTreatmentDetails>;
  updateTreatment(
    id: string,
    dependentId: string,
    userId: string,
    roles: DependentAccessRole[],
    data: UpdateMedicationTreatment,
  ): Promise<MedicationTreatmentDetails | null>;
  deleteTreatment(id: string, dependentId: string, userId: string, now: Date): Promise<boolean>;
  readTimeline(
    query: TimelineSourceQuery,
    type: MedicationTimelineType,
  ): Promise<TreatmentTimelineRecord[]>;
}
