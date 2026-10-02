import type { Prisma } from '../../generated/prisma/client';
import { PrismaUserRepository } from './prisma-user.repository';
import { PrismaDependentRepository } from './prisma-dependent.repository';
import { PrismaDependentAccessRepository } from './prisma-dependent-access.repository';
import { PrismaConsentRepository } from './prisma-consent.repository';
import { PrismaAuditLogRepository } from './prisma-audit-log.repository';
import type { CreateAuditLog } from '../../domain/models/audit-log.model';

function setup() {
  const delegate = () => ({
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({ id: 'created' }),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    updateManyAndReturn: jest.fn().mockResolvedValue([]),
  });
  const db = {
    user: delegate(),
    dependent: delegate(),
    userDependentAccess: delegate(),
    consent: delegate(),
    auditLog: delegate(),
  };
  const tx = db as unknown as Prisma.TransactionClient;
  return {
    db,
    users: new PrismaUserRepository(tx),
    dependents: new PrismaDependentRepository(tx),
    access: new PrismaDependentAccessRepository(tx),
    consents: new PrismaConsentRepository(tx),
    audit: new PrismaAuditLogRepository(tx),
  };
}
const activeUser = { deletedAt: null, status: 'ACTIVE' };
const activeAccess = { userId: 'actor', revokedAt: null, user: activeUser };
const visibleDependent = { deletedAt: null, access: { some: activeAccess } };

test('usuários são normalizados, emails excluídos não são lidos e input não atribui status', async () => {
  const { db, users } = setup();
  await users.findByEmail(' TEST@EXAMPLE.COM ');
  expect(db.user.findFirst).toHaveBeenCalledWith({
    where: { email: 'test@example.com', deletedAt: null },
  });
  await users.findById('actor');
  expect(db.user.findFirst).toHaveBeenLastCalledWith({ where: { id: 'actor', deletedAt: null } });
  await users.create({
    name: 'Test',
    email: ' TEST@EXAMPLE.COM ',
    passwordHash: 'fixture',
    status: 'BLOCKED',
  } as Parameters<typeof users.create>[0]);
  expect(db.user.create).toHaveBeenCalledWith({
    data: { name: 'Test', email: 'test@example.com', passwordHash: 'fixture' },
  });
});

test('listas e leitura usam vínculo ativo, conta ativa e soft delete no banco', async () => {
  const { db, dependents } = setup();
  await dependents.listForUser('actor', { limit: 10, offset: 2 });
  expect(db.dependent.findMany).toHaveBeenCalledWith({
    where: visibleDependent,
    take: 10,
    skip: 2,
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
  });
  await dependents.findForUser('dependent', 'actor');
  expect(db.dependent.findFirst).toHaveBeenCalledWith({
    where: { id: 'dependent', ...visibleDependent },
  });
});

test('update aplica papéis e vínculo no próprio where; exclusão é lógica e apenas OWNER', async () => {
  const { db, dependents } = setup();
  expect(
    await dependents.updateForUser('dependent', 'actor', ['OWNER', 'EDITOR'], {
      preferredName: null,
    }),
  ).toBeNull();
  expect(db.dependent.updateManyAndReturn).toHaveBeenCalledWith({
    where: {
      id: 'dependent',
      deletedAt: null,
      access: { some: { ...activeAccess, role: { in: ['OWNER', 'EDITOR'] } } },
    },
    data: { preferredName: null },
  });
  expect(await dependents.softDeleteForUser('dependent', 'actor')).toBe(false);
  expect(db.dependent.updateMany).toHaveBeenCalledWith({
    where: {
      id: 'dependent',
      deletedAt: null,
      access: { some: { ...activeAccess, role: { in: ['OWNER'] } } },
    },
    data: { deletedAt: expect.any(Date) as Date },
  });
  expect(db.dependent.findFirst).not.toHaveBeenCalled();
});

test('repository não aceita criação/mudanças de campos internos por mass assignment', async () => {
  const { db, dependents } = setup();
  const birthDate = new Date('2020-01-01T00:00:00Z');
  await dependents.create({
    fullName: 'Test',
    preferredName: null,
    birthDate,
    createdByUserId: 'actor',
    deletedAt: new Date(),
  } as Parameters<typeof dependents.create>[0]);
  expect(db.dependent.create).toHaveBeenCalledWith({
    data: { fullName: 'Test', preferredName: null, birthDate, createdByUserId: 'actor' },
  });
  await dependents.updateForUser('dependent', 'actor', ['OWNER'], {
    fullName: 'Updated',
    createdByUserId: 'other',
  } as Parameters<typeof dependents.updateForUser>[3]);
  expect(db.dependent.updateManyAndReturn).toHaveBeenCalledWith(
    expect.objectContaining({ data: { fullName: 'Updated' } }),
  );
});

test('vínculos revogados/dependentes excluídos e contas inativas ficam fora da policy', async () => {
  const { db, access } = setup();
  await access.findActive('actor', 'dependent');
  expect(db.userDependentAccess.findFirst).toHaveBeenCalledWith({
    where: { dependentId: 'dependent', ...activeAccess, dependent: { deletedAt: null } },
  });
  await access.create({
    userId: 'actor',
    dependentId: 'dependent',
    role: 'OWNER',
    relationship: 'PARENT',
  });
  expect(db.userDependentAccess.create).toHaveBeenCalledWith({
    data: { userId: 'actor', dependentId: 'dependent', role: 'OWNER', relationship: 'PARENT' },
  });
});

test('consentimentos filtram titular e acesso atual; metadata não vem do cliente', async () => {
  const { db, consents } = setup();
  await consents.listForUser('actor', { limit: 10, offset: 0 });
  expect(db.consent.findMany).toHaveBeenCalledWith({
    where: {
      userId: 'actor',
      user: activeUser,
      OR: [{ dependentId: null }, { dependent: visibleDependent }],
    },
    take: 10,
    skip: 0,
    orderBy: [{ acceptedAt: 'desc' }, { id: 'asc' }],
  });
  await consents.create({
    userId: 'actor',
    dependentId: null,
    type: 'NOTICE',
    policyVersion: 'v1',
    metadata: { secret: 'forged' },
  } as Parameters<typeof consents.create>[0]);
  expect(db.consent.create).toHaveBeenCalledWith({
    data: {
      userId: 'actor',
      dependentId: null,
      type: 'NOTICE',
      policyVersion: 'v1',
      metadata: { source: 'SELF_SERVICE' },
      consentBased: false,
    },
  });
});

test('audit projeta somente campos e metadata segura, sem retornar entidade ao consumidor', async () => {
  const { db, audit } = setup();
  const event: CreateAuditLog = {
    actorId: 'actor',
    action: 'DEPENDENT_UPDATED',
    resourceType: 'DEPENDENT',
    resourceId: 'dependent',
    dependentId: 'dependent',
    metadata: { changedFields: ['fullName'] },
  };
  expect(await audit.append(event)).toBeUndefined();
  expect(db.auditLog.create).toHaveBeenCalledWith({ data: event });
});
