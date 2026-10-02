import type {
  VaccineCatalog,
  VaccineSchedule,
  VaccineScheduleDose,
  VaccineScheduleType,
  VaccinationDetails,
  CreateVaccination,
  UpdateVaccination,
} from '../domain/models/vaccination.model';
import type { Pagination } from './dependent.repository';
import type { TimelineSourceQuery } from './timeline-source.repository';
export const VACCINATION_REPOSITORY = Symbol('VACCINATION_REPOSITORY');
// Referências somente leitura na API. Publicação/importação humana validada é operação separada.
export interface VaccinationRepository {
  listCatalog(pagination: Pagination): Promise<VaccineCatalog[]>;
  findCatalog(id: string): Promise<VaccineCatalog | null>;
  listSchedules(pagination: Pagination, type?: VaccineScheduleType): Promise<VaccineSchedule[]>;
  findSchedule(id: string): Promise<VaccineSchedule | null>;
  listScheduleDoses(scheduleId: string, pagination: Pagination): Promise<VaccineScheduleDose[]>;
  list(dependentId: string, userId: string, pagination: Pagination): Promise<VaccinationDetails[]>;
  find(id: string, dependentId: string, userId: string): Promise<VaccinationDetails | null>;
  create(data: CreateVaccination): Promise<VaccinationDetails>;
  update(
    id: string,
    dependentId: string,
    userId: string,
    data: UpdateVaccination,
  ): Promise<VaccinationDetails | null>;
  delete(id: string, dependentId: string, userId: string, now: Date): Promise<boolean>;
  readTimeline(
    query: TimelineSourceQuery,
  ): Promise<{ id: string; dependentId: string; administeredAt: Date; createdAt: Date }[]>;
}
