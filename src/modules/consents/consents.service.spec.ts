import { BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InMemoryFoundation } from '../../../test/helpers/in-memory-foundation';
import { InMemoryUserRepository } from '../../../test/helpers/in-memory.repositories';
import { AuditService } from '../audit/audit.service';
import { DependentAuthorizationService } from '../dependents/dependent-authorization.service';
import { ConsentsService } from './consents.service';

async function fixture(
  policies: object = {
    NOTICE: { version: 'v1', scope: 'ACCOUNT' },
    CHILD: { version: 'v1', scope: 'DEPENDENT' },
  },
) {
  const users = new InMemoryUserRepository();
  const f = new InMemoryFoundation(users);
  const user = await users.create({
    name: 'Test',
    email: 'test@example.com',
    passwordHash: 'fixture',
  });
  const dependent = await f.dependents.create({
    fullName: 'Test Child',
    preferredName: null,
    birthDate: new Date('2020-01-01'),
    createdByUserId: user.id,
  });
  await f.dependentAccess.create({
    userId: user.id,
    dependentId: dependent.id,
    role: 'OWNER',
    relationship: null,
  });
  const service = new ConsentsService(
    f.consents,
    f,
    new ConfigService({ CONSENT_POLICIES: policies }),
    new DependentAuthorizationService(f.dependentAccess),
    new AuditService(),
  );
  return { f, user, dependent, service };
}
test('políticas desativadas por padrão e versões/escopos incompatíveis são recusados', async () => {
  const disabled = await fixture({});
  await expect(
    disabled.service.accept(disabled.user.id, { type: 'NOTICE', policyVersion: 'v1' }),
  ).rejects.toBeInstanceOf(BadRequestException);
  const { service, user, dependent } = await fixture();
  await expect(
    service.accept(user.id, { type: 'NOTICE', policyVersion: 'v0' }),
  ).rejects.toBeInstanceOf(BadRequestException);
  await expect(
    service.accept(user.id, { type: 'CHILD', policyVersion: 'v1' }),
  ).rejects.toBeInstanceOf(BadRequestException);
  await expect(
    service.accept(user.id, { type: 'NOTICE', policyVersion: 'v1', dependentId: dependent.id }),
  ).rejects.toBeInstanceOf(BadRequestException);
});
test('aceite e audit são atômicos; lista só aceites próprios visíveis', async () => {
  const { service, f, user, dependent } = await fixture();
  const consent = await service.accept(user.id, {
    type: 'CHILD',
    policyVersion: 'v1',
    dependentId: dependent.id,
  });
  expect(await service.list(user.id, { limit: 50, offset: 0 })).toEqual([consent]);
  expect(f.auditRows[0]).toMatchObject({ action: 'CONSENT_ACCEPTED', metadata: {} });
  jest.spyOn(f.auditLogs, 'append').mockRejectedValue(new Error('audit failure'));
  await expect(service.accept(user.id, { type: 'NOTICE', policyVersion: 'v1' })).rejects.toThrow();
  expect(f.consentRows.size).toBe(1);
  await f.dependents.softDeleteForUser(dependent.id, user.id);
  expect(await service.list(user.id, { limit: 50, offset: 0 })).toEqual([]);
});
test.each(['EDITOR', 'VIEWER'] as const)(
  'papel %s não registra consentimento do dependente',
  async (role) => {
    const { service, f, user, dependent } = await fixture();
    const other = await f.users.create({
      name: 'Other',
      email: 'other@example.com',
      passwordHash: 'fixture',
    });
    await f.dependentAccess.create({
      userId: other.id,
      dependentId: dependent.id,
      role,
      relationship: null,
    });
    await expect(
      service.accept(other.id, { type: 'CHILD', policyVersion: 'v1', dependentId: dependent.id }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(f.consentRows.size).toBe(0);
    expect((await f.dependentAccess.findActive(user.id, dependent.id))?.role).toBe('OWNER');
  },
);

test('revoga todas as versões/repetições do escopo, sem afetar outro titular/escopo; idempotente', async () => {
  const { service, f, user, dependent } = await fixture({
    NOTICE: { version: 'v1', scope: 'ACCOUNT', consentBased: true },
  });
  const first = await service.accept(user.id, { type: 'NOTICE', policyVersion: 'v1' });
  await service.accept(user.id, { type: 'NOTICE', policyVersion: 'v1' });
  await f.consents.create({
    userId: user.id,
    type: 'NOTICE',
    policyVersion: 'v0',
    dependentId: null,
    consentBased: true,
  });
  const otherScope = await f.consents.create({
    userId: user.id,
    type: 'NOTICE',
    policyVersion: 'v1',
    dependentId: dependent.id,
    consentBased: true,
  });
  expect(await service.hasActive(user.id, 'NOTICE', 'v1')).toBe(true);
  expect((await service.revoke(user.id, first.id)).revokedAt).not.toBeNull();
  expect(await service.hasActive(user.id, 'NOTICE', 'v1')).toBe(false);
  expect(await service.hasActive(user.id, 'NOTICE', 'v0')).toBe(false);
  expect(f.consentRows.get(otherScope.id)?.revokedAt).toBeNull();
  await service.revoke(user.id, first.id);
  expect(f.auditRows.filter((a) => a.action === 'CONSENT_REVOKED')).toHaveLength(1);
});
test('registro legado/aviso não presume consentimento; outro titular e desconhecido recebem 404', async () => {
  const { service, f, user } = await fixture();
  const notice = await service.accept(user.id, { type: 'NOTICE', policyVersion: 'v1' });
  await expect(service.revoke(user.id, notice.id)).rejects.toBeInstanceOf(ConflictException);
  const other = await f.users.create({
    name: 'Other',
    email: 'other@example.com',
    passwordHash: 'fixture',
  });
  await expect(service.revoke(other.id, notice.id)).rejects.toBeInstanceOf(NotFoundException);
  await expect(service.revoke(user.id, 'missing')).rejects.toBeInstanceOf(NotFoundException);
});
test('titular pode retirar consentimento próprio após perder acesso ao dependente', async () => {
  const { service, f, user, dependent } = await fixture({
    CHILD: { version: 'v1', scope: 'DEPENDENT', consentBased: true },
  });
  const consent = await service.accept(user.id, {
    type: 'CHILD',
    policyVersion: 'v1',
    dependentId: dependent.id,
  });
  await f.dependentAccess.revokeAllForUser(user.id, new Date());
  expect((await service.revoke(user.id, consent.id)).revokedAt).not.toBeNull();
  expect(await service.hasActive(user.id, 'CHILD', 'v1', dependent.id)).toBe(false);
});
test('revogação falhando no audit mantém todos os aceites ativos', async () => {
  const { service, f, user } = await fixture({
    NOTICE: { version: 'v1', scope: 'ACCOUNT', consentBased: true },
  });
  const consent = await service.accept(user.id, { type: 'NOTICE', policyVersion: 'v1' });
  jest.spyOn(f.auditLogs, 'append').mockRejectedValueOnce(new Error('audit'));
  await expect(service.revoke(user.id, consent.id)).rejects.toThrow();
  expect(await service.hasActive(user.id, 'NOTICE', 'v1')).toBe(true);
});
