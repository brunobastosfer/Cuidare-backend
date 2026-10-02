import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreateCareTask,
  ListCareTasks,
  UpdateCareTask,
} from '../../domain/models/care-task.model';
import {
  CARE_TASK_REPOSITORY,
  type CareTaskRepository,
} from '../../repository/care-task.repository';

@Injectable()
export class CareTasksService {
  constructor(@Inject(CARE_TASK_REPOSITORY) private readonly tasks: CareTaskRepository) {}

  list(ownerId: string, pagination: ListCareTasks) {
    return this.tasks.listByOwner(ownerId, pagination);
  }
  create(ownerId: string, data: Omit<CreateCareTask, 'ownerId'>) {
    return this.tasks.create({ ...data, ownerId });
  }

  async find(id: string, ownerId: string) {
    const task = await this.tasks.findByOwner(id, ownerId);
    if (!task) throw new NotFoundException('Cuidado não encontrado.');
    return task;
  }

  async update(id: string, ownerId: string, data: UpdateCareTask) {
    // DTOs são instâncias de classe: campos opcionais podem existir com undefined.
    // Projeta somente campos presentes, sem apagar valores em atualizações parciais.
    const changes: UpdateCareTask = {
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.completed !== undefined ? { completed: data.completed } : {}),
    };
    if (Object.keys(changes).length === 0)
      throw new BadRequestException('Informe ao menos um campo para atualizar.');
    const task = await this.tasks.updateByOwner(id, ownerId, changes);
    if (!task) throw new NotFoundException('Cuidado não encontrado.');
    return task;
  }

  async remove(id: string, ownerId: string) {
    if (!(await this.tasks.deleteByOwner(id, ownerId)))
      throw new NotFoundException('Cuidado não encontrado.');
  }
}
