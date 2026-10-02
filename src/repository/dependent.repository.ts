import type {
  CreateDependent,
  Dependent,
  DependentAccessRole,
  UpdateDependent,
} from '../domain/models/dependent.model';
export const DEPENDENT_REPOSITORY = Symbol('DEPENDENT_REPOSITORY');
export interface Pagination {
  limit: number;
  offset: number;
}
export interface DependentRepository {
  listForUser(userId: string, pagination: Pagination): Promise<Dependent[]>;
  findForUser(id: string, userId: string): Promise<Dependent | null>;
  create(data: CreateDependent): Promise<Dependent>;
  updateForUser(
    id: string,
    userId: string,
    roles: DependentAccessRole[],
    data: UpdateDependent,
  ): Promise<Dependent | null>;
  softDeleteForUser(id: string, userId: string): Promise<boolean>;
}
