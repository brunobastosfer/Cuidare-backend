import type { CareTask } from '../../domain/models/care-task.model';

export function careTaskView(task: CareTask) {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    completed: task.completed,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}
