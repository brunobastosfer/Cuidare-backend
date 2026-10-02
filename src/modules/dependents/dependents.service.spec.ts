import { NotFoundException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { InMemoryFoundation } from '../../../test/helpers/in-memory-foundation';
import { InMemoryUserRepository } from '../../../test/helpers/in-memory.repositories';
import { AuditService } from '../audit/audit.service';
import { DependentsService } from './dependents.service';
import { DependentAuthorizationService } from './dependent-authorization.service';

async function fixture() {
  const users = new InMemoryUserRepository();
  const foundation = new InMemoryFoundation(users);
  const service = new DependentsService(
    foundation.dependents,
    foundation,
    new DependentAuthorizationService(foundation.dependentAccess),
    new AuditService(),
  );
  const owner = await users.create({
    name: 'Owner',
    email: 'owner@example.com',
    passwordHash: 'fixture',
  });
  const other = await users.create({
    name: 'Other',
    email: 'other@example.com',
    passwordHash: 'fixture',
  });
  const dependent = await service.create(owner.id, {
    fullName: 'Pessoa fictícia',
    birthDate: '2020-02-29',
    relationship: 'PARENT',
  });
  return { users, foundation, service, owner, other, dependent };
}
test('criação atômica associa OWNER e parentesco ao vínculo, não ao perfil', async () => {
  const { foundation, owner, dependent } = await fixture();
  expect(await foundation.dependentAccess.findActive(owner.id, dependent.id)).toMatchObject({
    role: 'OWNER',
    relationship: 'PARENT',
  });
  expect(foundation.auditRows).toEqual([
    expect.objectContaining({
      action: 'DEPENDENT_CREATED',
      dependentId: dependent.id,
      metadata: {},
    }),
  ]);
  expect(dependent.birthDate.toISOString()).toBe('2020-02-29T00:00:00.000Z');
});
test('isola A/B e rejeita vínculo inexistente em leitura, escrita e exclusão', async () => {
  const { service, other, dependent } = await fixture();
  expect(await service.list(other.id, { limit: 50, offset: 0 })).toEqual([]);
  await expect(service.find(dependent.id, other.id)).rejects.toBeInstanceOf(NotFoundException);
  await expect(
    service.update(dependent.id, other.id, { fullName: 'Outro nome' }),
  ).rejects.toBeInstanceOf(NotFoundException);
  await expect(service.remove(dependent.id, other.id)).rejects.toBeInstanceOf(NotFoundException);
});
test.each(['EDITOR', 'VIEWER'] as const)('aplica menor privilégio para %s', async (role) => {
  const { service, foundation, other, dependent } = await fixture();
  await foundation.dependentAccess.create({
    userId: other.id,
    dependentId: dependent.id,
    role,
    relationship: null,
  });
  expect((await service.find(dependent.id, other.id)).id).toBe(dependent.id);
  const change = service.update(dependent.id, other.id, { preferredName: 'Apelido' });
  if (role === 'EDITOR') expect((await change).preferredName).toBe('Apelido');
  else await expect(change).rejects.toBeInstanceOf(NotFoundException);
  await expect(service.remove(dependent.id, other.id)).rejects.toBeInstanceOf(NotFoundException);
});
test('soft delete oculta registros e vínculos, preservando histórico', async () => {
  const { service, foundation, owner, dependent } = await fixture();
  await service.remove(dependent.id, owner.id);
  expect(foundation.dependentRows.get(dependent.id)?.deletedAt).toBeInstanceOf(Date);
  expect(foundation.accessRows.size).toBe(1);
  expect(await foundation.dependentAccess.findActive(owner.id, dependent.id)).toBeNull();
  expect(await service.list(owner.id, { limit: 50, offset: 0 })).toEqual([]);
  await expect(service.remove(dependent.id, owner.id)).rejects.toBeInstanceOf(NotFoundException);
});
test('rollback de criação, alteração e exclusão se auditoria falhar', async () => {
  const { service, foundation, owner, dependent } = await fixture();
  jest.spyOn(foundation.auditLogs, 'append').mockRejectedValue(new Error('audit unavailable'));
  await expect(
    service.create(owner.id, { fullName: 'Nova pessoa', birthDate: '2021-01-01' }),
  ).rejects.toThrow('audit unavailable');
  expect(foundation.dependentRows.size).toBe(1);
  expect(foundation.accessRows.size).toBe(1);
  await expect(
    service.update(dependent.id, owner.id, { fullName: 'Não persistir' }),
  ).rejects.toThrow();
  expect(foundation.dependentRows.get(dependent.id)?.fullName).toBe(dependent.fullName);
  await expect(service.remove(dependent.id, owner.id)).rejects.toThrow();
  expect(foundation.dependentRows.get(dependent.id)?.deletedAt).toBeNull();
  expect(foundation.auditRows).toHaveLength(1);
});
test('updates parciais preservam campos; null remove apenas preferredName', async () => {
  const { service, owner, dependent } = await fixture();
  await expect(service.update(dependent.id, owner.id, {})).rejects.toBeInstanceOf(
    BadRequestException,
  );
  await service.update(dependent.id, owner.id, { preferredName: 'Apelido' });
  const updated = await service.update(dependent.id, owner.id, { preferredName: null });
  expect(updated.preferredName).toBeNull();
  expect(updated.fullName).toBe(dependent.fullName);
});
test('não cria dependente para ator bloqueado', async () => {
  const { service, foundation, users, owner } = await fixture();
  users.rows.set(owner.email, { ...owner, status: 'BLOCKED' });
  await expect(
    service.create(owner.id, { fullName: 'Pessoa', birthDate: '2020-01-01' }),
  ).rejects.toBeInstanceOf(UnauthorizedException);
  expect(foundation.dependentRows.size).toBe(1);
});
