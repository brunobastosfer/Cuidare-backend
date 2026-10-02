import type { Dependent } from '../../domain/models/dependent.model';
export function dependentView(dependent: Dependent) {
  return {
    id: dependent.id,
    fullName: dependent.fullName,
    preferredName: dependent.preferredName,
    birthDate: dependent.birthDate.toISOString().slice(0, 10),
    createdAt: dependent.createdAt,
    updatedAt: dependent.updatedAt,
  };
}
