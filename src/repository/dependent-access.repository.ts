import type { CreateDependentAccess, UserDependentAccess } from '../domain/models/dependent.model';
export const DEPENDENT_ACCESS_REPOSITORY = Symbol('DEPENDENT_ACCESS_REPOSITORY');
export interface DependentAccessRepository {
  findActive(userId: string, dependentId: string): Promise<UserDependentAccess | null>;
  create(data: CreateDependentAccess): Promise<UserDependentAccess>;
  revokeAllForUser(userId: string, now: Date): Promise<void>;
}
