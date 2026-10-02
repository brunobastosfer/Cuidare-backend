export interface CareTask {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
}

export type CreateCareTask = Pick<CareTask, 'title' | 'description' | 'ownerId'>;
export type UpdateCareTask = Partial<Pick<CareTask, 'title' | 'description' | 'completed'>>;
export interface ListCareTasks {
  limit: number;
  offset: number;
}
