import type {
  CareTask,
  CreateCareTask,
  ListCareTasks,
  UpdateCareTask,
} from '../domain/models/care-task.model';

export const CARE_TASK_REPOSITORY = Symbol('CARE_TASK_REPOSITORY');

export interface CareTaskRepository {
  listByOwner(ownerId: string, pagination: ListCareTasks): Promise<CareTask[]>;
  findByOwner(id: string, ownerId: string): Promise<CareTask | null>;
  create(data: CreateCareTask): Promise<CareTask>;
  updateByOwner(id: string, ownerId: string, data: UpdateCareTask): Promise<CareTask | null>;
  deleteByOwner(id: string, ownerId: string): Promise<boolean>;
}
