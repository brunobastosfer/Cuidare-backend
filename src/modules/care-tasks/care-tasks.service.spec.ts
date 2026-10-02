import { randomUUID } from 'node:crypto';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { InMemoryCareTaskRepository } from '../../../test/helpers/in-memory.repositories';
import { CareTasksService } from './care-tasks.service';

test('mantém o proprietário na criação e impede acesso cruzado', async () => {
  const service = new CareTasksService(new InMemoryCareTaskRepository());
  const owner = randomUUID();
  const other = randomUUID();
  const task = await service.create(owner, { title: 'Conversar', description: 'Combinar horário' });
  expect(task.ownerId).toBe(owner);
  await expect(service.find(task.id, other)).rejects.toBeInstanceOf(NotFoundException);
  await expect(service.update(task.id, other, { completed: true })).rejects.toBeInstanceOf(
    NotFoundException,
  );
  await expect(service.remove(task.id, other)).rejects.toBeInstanceOf(NotFoundException);
  expect((await service.find(task.id, owner)).completed).toBe(false);
});

test('rejeita alteração vazia e pagina a listagem', async () => {
  const service = new CareTasksService(new InMemoryCareTaskRepository());
  const owner = randomUUID();
  const task = await service.create(owner, { title: 'Conversar', description: '' });
  await expect(service.update(task.id, owner, {})).rejects.toBeInstanceOf(BadRequestException);
  expect(await service.list(owner, { limit: 1, offset: 1 })).toHaveLength(0);
  await service.remove(task.id, owner);
  await expect(service.find(task.id, owner)).rejects.toBeInstanceOf(NotFoundException);
});
