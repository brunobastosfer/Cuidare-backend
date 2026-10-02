import type { Prisma } from '../../generated/prisma/client';
import { PrismaPrivacyRepository } from './prisma-privacy.repository';
import { PrismaUserRepository } from './prisma-user.repository';
import { PrismaDependentAccessRepository } from './prisma-dependent-access.repository';
import { PrismaConsentRepository } from './prisma-consent.repository';
import { parseRetentionDays } from '../../config/privacy-settings';
function fixture() {
  const delegate = () => ({
    findFirst: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  });
  const db = {
    user: delegate(),
    dependent: delegate(),
    userDependentAccess: delegate(),
    careTask: delegate(),
    consent: delegate(),
    authSession: delegate(),
    auditLog: delegate(),
    privacyExportRecord: delegate(),
    accountDeletionRequest: delegate(),
    medication: delegate(),
    medicationTreatment: delegate(),
    appointment: delegate(),
    medicalRecommendation: delegate(),
    document: delegate(),
    dependentVaccination: delegate(),
    schoolEnrollment: delegate(),
    schoolReport: delegate(),
  };
  const tx = db as unknown as Prisma.TransactionClient;
  return {
    db,
    privacy: new PrismaPrivacyRepository(tx),
    users: new PrismaUserRepository(tx),
    access: new PrismaDependentAccessRepository(tx),
    consents: new PrismaConsentRepository(tx),
  };
}
test('snapshot usa seleção OWNER/ativo e não consulta dados secretos de conta/sessões/audit', async () => {
  const { db, privacy } = fixture();
  await privacy.readExport('actor', ['child'], 10);
  const scope = {
    id: { in: ['child'] },
    deletedAt: null,
    access: {
      some: {
        userId: 'actor',
        revokedAt: null,
        user: { deletedAt: null, status: 'ACTIVE' },
        role: { in: ['OWNER'] },
      },
    },
  };
  expect(db.dependent.findMany).toHaveBeenCalledWith(
    expect.objectContaining({ where: scope, take: 11 }),
  );
  expect(db.user.findFirst).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { id: 'actor', deletedAt: null, status: 'ACTIVE' },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        emailVerifiedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
  );
  expect(db.authSession.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { userId: 'actor' },
      take: 11,
      select: {
        id: true,
        authenticationMethod: true,
        createdAt: true,
        expiresAt: true,
        revokedAt: true,
      },
    }),
  );
  expect(db.userDependentAccess.findMany).toHaveBeenCalledWith(
    expect.objectContaining({ where: { userId: 'actor', revokedAt: null, dependent: scope } }),
  );
  expect(db.careTask.findMany).toHaveBeenCalledWith(
    expect.objectContaining({ where: { ownerId: 'actor' }, take: 11 }),
  );
  expect(db.medication.findMany).toHaveBeenCalledWith({
    where: { dependent: scope, deletedAt: null },
    take: 11,
    orderBy: { id: 'asc' },
  });
  expect(db.medicationTreatment.findMany).toHaveBeenCalledWith({
    where: { dependent: scope, deletedAt: null, medication: { deletedAt: null } },
    include: { medication: true },
    take: 11,
    orderBy: { id: 'asc' },
  });
  expect(db.appointment.findMany).toHaveBeenCalledWith({
    where: { dependent: scope, deletedAt: null },
    take: 11,
    orderBy: { id: 'asc' },
  });
  expect(db.medicalRecommendation.findMany).toHaveBeenCalledWith({
    where: { dependent: scope, deletedAt: null, appointment: { deletedAt: null } },
    take: 11,
    orderBy: { id: 'asc' },
  });
  expect(db.document.findMany).toHaveBeenCalledWith({
    where: { dependent: scope, deletedAt: null },
    take: 11,
    orderBy: { id: 'asc' },
  });
  expect(db.dependentVaccination.findMany).toHaveBeenCalledWith({
    where: { dependent: scope, deletedAt: null },
    include: { vaccine: true, document: { select: { id: true, deletedAt: true } } },
    take: 11,
    orderBy: { id: 'asc' },
  });
  expect(db.schoolEnrollment.findMany).toHaveBeenCalledWith({
    where: { dependent: scope, deletedAt: null },
    take: 11,
    orderBy: { id: 'asc' },
  });
  expect(db.schoolReport.findMany).toHaveBeenCalledWith({
    where: { dependent: scope, deletedAt: null },
    include: {
      enrollment: { select: { id: true, deletedAt: true } },
      document: { select: { id: true, deletedAt: true } },
    },
    take: 11,
    orderBy: { id: 'asc' },
  });
  expect(db.consent.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { userId: 'actor', OR: [{ dependentId: null }, { dependent: scope }] },
    }),
  );
  expect(db.auditLog.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { actorId: 'actor', OR: [{ dependentId: null }, { dependent: scope }] },
      select: {
        id: true,
        action: true,
        resourceType: true,
        resourceId: true,
        dependentId: true,
        timestamp: true,
      },
    }),
  );
});
test('somente metadados mínimos são persistidos; pedidos não aceitam status/identidade de cliente', async () => {
  const { db, privacy } = fixture();
  await privacy.recordExport('export', 'actor');
  expect(db.privacyExportRecord.create).toHaveBeenCalledWith({
    data: { id: 'export', userId: 'actor' },
  });
  const policy = parseRetentionDays('{}');
  db.accountDeletionRequest.create.mockResolvedValueOnce({ retentionPolicy: policy });
  await privacy.createDeletionRequest({
    userId: 'actor',
    retentionNotBeforeAt: null,
    retentionPolicy: policy,
    status: 'COMPLETED',
    password: 'private',
  } as Parameters<typeof privacy.createDeletionRequest>[0]);
  expect(db.accountDeletionRequest.create).toHaveBeenCalledWith({
    data: { userId: 'actor', retentionNotBeforeAt: null, retentionPolicy: policy },
  });
});
test('fechamento é condicional a versão/estado; só revoga acessos do titular', async () => {
  const { db, users, access } = fixture();
  const now = new Date();
  expect(await users.closeAccount('actor', 7, now)).toBe(true);
  expect(db.user.updateMany).toHaveBeenCalledWith({
    where: { id: 'actor', credentialVersion: 7, deletedAt: null, status: 'ACTIVE' },
    data: { deletedAt: now, status: 'BLOCKED', credentialVersion: { increment: 1 } },
  });
  await access.revokeAllForUser('actor', now);
  expect(db.userDependentAccess.updateMany).toHaveBeenCalledWith({
    where: { userId: 'actor', revokedAt: null },
    data: { revokedAt: now },
  });
});
test('consentimento próprio não exige vínculo atual para retirada; updates só no escopo consent-based', async () => {
  const { db, consents } = fixture();
  const now = new Date();
  await consents.findOwned('id', 'actor');
  expect(db.consent.findFirst).toHaveBeenCalledWith({
    where: { id: 'id', userId: 'actor', user: { status: 'ACTIVE', deletedAt: null } },
  });
  await consents.revokeScope('actor', 'OPTIONAL', 'child', now);
  expect(db.consent.updateMany).toHaveBeenCalledWith({
    where: {
      userId: 'actor',
      type: 'OPTIONAL',
      dependentId: 'child',
      consentBased: true,
      revokedAt: null,
      user: { status: 'ACTIVE', deletedAt: null },
    },
    data: { revokedAt: now },
  });
  await consents.hasActive('actor', 'OPTIONAL', 'v1', 'child');
  expect(db.consent.findFirst).toHaveBeenLastCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        userId: 'actor',
        policyVersion: 'v1',
        consentBased: true,
        revokedAt: null,
        dependent: expect.objectContaining({ deletedAt: null }) as unknown,
      }) as unknown,
      select: { id: true },
    }),
  );
});
