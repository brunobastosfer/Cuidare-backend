import { randomUUID } from 'node:crypto';
import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { PrivacyService } from '../src/modules/privacy/privacy.service';
import { AuthService } from '../src/modules/auth/auth.service';
import { OpaqueTokenService } from '../src/modules/auth/opaque-token.service';
import { PasswordService } from '../src/modules/auth/password.service';
import { ConsentsService } from '../src/modules/consents/consents.service';
import { DependentsService } from '../src/modules/dependents/dependents.service';
import { USER_REPOSITORY, type UserRepository } from '../src/repository/user.repository';
import {
  DEPENDENT_ACCESS_REPOSITORY,
  type DependentAccessRepository,
} from '../src/repository/dependent-access.repository';
import {
  UNIT_OF_WORK_REPOSITORY,
  type UnitOfWorkRepository,
} from '../src/repository/unit-of-work.repository';
import { authPassword } from './helpers/auth-fixture';
import { parseRetentionDays } from '../src/config/privacy-settings';
let module: TestingModule | undefined;
let prisma: PrismaService;
let users: UserRepository;
let access: DependentAccessRepository;
let privacy: PrivacyService;
let auth: AuthService;
let consents: ConsentsService;
let dependents: DependentsService;
const userIds: string[] = [];
const rateKeys: string[] = [];
const originalPolicy = process.env.CONSENT_POLICIES;
beforeAll(async () => {
  module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  await module.init();
  prisma = module.get(PrismaService);
  users = module.get<UserRepository>(USER_REPOSITORY);
  access = module.get<DependentAccessRepository>(DEPENDENT_ACCESS_REPOSITORY);
  privacy = module.get(PrivacyService);
  auth = module.get(AuthService);
  consents = module.get(ConsentsService);
  dependents = module.get(DependentsService);
  module
    .get(ConfigService)
    .set('CONSENT_POLICIES', { OPTIONAL: { version: 'v1', scope: 'ACCOUNT', consentBased: true } });
});
afterAll(async () => {
  try {
    if (prisma && userIds.length)
      await prisma.$transaction(async (tx) => {
        const children = await tx.dependent.findMany({
          where: { createdByUserId: { in: userIds } },
          select: { id: true },
        });
        const dependentIds = children.map((d) => d.id);
        const sessions = await tx.authSession.findMany({
          where: { userId: { in: userIds } },
          select: { id: true },
        });
        await tx.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
        await tx.privacyExportRecord.deleteMany({ where: { userId: { in: userIds } } });
        await tx.accountDeletionRequest.deleteMany({ where: { userId: { in: userIds } } });
        await tx.consent.deleteMany({ where: { userId: { in: userIds } } });
        await tx.accountToken.deleteMany({ where: { userId: { in: userIds } } });
        await tx.refreshCredential.deleteMany({
          where: { sessionId: { in: sessions.map((s) => s.id) } },
        });
        await tx.authSession.deleteMany({ where: { userId: { in: userIds } } });
        await tx.userDependentAccess.deleteMany({
          where: { OR: [{ userId: { in: userIds } }, { dependentId: { in: dependentIds } }] },
        });
        await tx.dependent.deleteMany({ where: { id: { in: dependentIds } } });
        await tx.careTask.deleteMany({ where: { ownerId: { in: userIds } } });
        await tx.user.deleteMany({ where: { id: { in: userIds } } });
        await tx.authRateBucket.deleteMany({ where: { key: { in: rateKeys } } });
      });
  } finally {
    await module?.close();
    if (originalPolicy === undefined) delete process.env.CONSENT_POLICIES;
    else process.env.CONSENT_POLICIES = originalPolicy;
  }
});
async function userFixture() {
  if (!module) throw new Error();
  const email = 'privacy-integration-' + randomUUID() + '@example.com';
  const ip = 'privacy-fixture-' + randomUUID();
  const user = await users.create({
    name: 'Pessoa fictícia',
    email,
    passwordHash: await module.get(PasswordService).hash(authPassword),
  });
  userIds.push(user.id);
  const tokens = module.get(OpaqueTokenService);
  rateKeys.push(tokens.rateKey('LOGIN:IDENTITY', email), tokens.rateKey('LOGIN:IP', ip));
  return { user, ip };
}
test('PostgreSQL exporta snapshot próprio/OWNER e não dados de outro responsável ou VIEWER', async () => {
  const a = await userFixture();
  const b = await userFixture();
  const child = await dependents.create(a.user.id, {
    fullName: 'Criança fictícia',
    birthDate: '2020-02-29',
  });
  await access.create({
    userId: b.user.id,
    dependentId: child.id,
    role: 'VIEWER',
    relationship: null,
  });
  const json = await privacy.export(a.user.id, {
    password: authPassword,
    format: 'JSON',
    dependentIds: [child.id],
  });
  expect(json.data.dependents.map((d) => d.id)).toEqual([child.id]);
  expect(JSON.stringify(json)).not.toContain(a.user.passwordHash);
  expect(JSON.stringify(json)).not.toContain(b.user.id);
  await expect(
    privacy.export(b.user.id, { password: authPassword, format: 'JSON', dependentIds: [child.id] }),
  ).rejects.toBeInstanceOf(NotFoundException);
  expect(await prisma.privacyExportRecord.count({ where: { userId: a.user.id } })).toBe(1);
  expect(await prisma.privacyExportRecord.count({ where: { userId: b.user.id } })).toBe(0);
});
test('fechamento concorrente gera um recibo, revoga sessões e preserva outro OWNER/filho', async () => {
  const a = await userFixture();
  const b = await userFixture();
  const child = await dependents.create(a.user.id, {
    fullName: 'Criança fictícia',
    birthDate: '2020-01-01',
  });
  await access.create({
    userId: b.user.id,
    dependentId: child.id,
    role: 'OWNER',
    relationship: null,
  });
  const session = await auth.login({ email: a.user.email, password: authPassword }, a.ip);
  const dto = { password: authPassword, confirmation: 'DELETE_MY_ACCOUNT' } as const;
  const results = await Promise.allSettled([
    privacy.requestDeletion(a.user.id, dto),
    privacy.requestDeletion(a.user.id, dto),
  ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(await prisma.accountDeletionRequest.count({ where: { userId: a.user.id } })).toBe(1);
  expect(await users.findById(a.user.id)).toBeNull();
  expect(await prisma.user.count({ where: { id: a.user.id } })).toBe(1);
  await expect(auth.refresh(session.refreshToken)).rejects.toThrow();
  expect(await access.findActive(b.user.id, child.id)).not.toBeNull();
  expect((await prisma.dependent.findUnique({ where: { id: child.id } }))?.deletedAt).toBeNull();
});
test('revogação concorrente só registra um evento e retira todas as repetições do escopo', async () => {
  const { user } = await userFixture();
  const first = await consents.accept(user.id, { type: 'OPTIONAL', policyVersion: 'v1' });
  await consents.accept(user.id, { type: 'OPTIONAL', policyVersion: 'v1' });
  await Promise.all([consents.revoke(user.id, first.id), consents.revoke(user.id, first.id)]);
  expect(await consents.hasActive(user.id, 'OPTIONAL', 'v1')).toBe(false);
  expect(await prisma.consent.count({ where: { userId: user.id, revokedAt: null } })).toBe(0);
  expect(
    await prisma.auditLog.count({ where: { actorId: user.id, action: 'CONSENT_REVOKED' } }),
  ).toBe(1);
});
test('FK de audit inválida desfaz recibo, fechamento e revogações na transação real', async () => {
  const { user, ip } = await userFixture();
  await auth.login({ email: user.email, password: authPassword }, ip);
  if (!module) throw new Error();
  const transactions = module.get<UnitOfWorkRepository>(UNIT_OF_WORK_REPOSITORY);
  await expect(
    transactions.run(async (r) => {
      const now = new Date();
      const receipt = await r.privacy.createDeletionRequest({
        userId: user.id,
        retentionNotBeforeAt: null,
        retentionPolicy: parseRetentionDays('{}'),
      });
      await r.users.closeAccount(user.id, user.credentialVersion, now);
      await r.sessions.revokeAll(user.id, now);
      await r.auditLogs.append({
        actorId: randomUUID(),
        action: 'ACCOUNT_DELETION_REQUESTED',
        resourceType: 'ACCOUNT_DELETION_REQUEST',
        resourceId: receipt.id,
        dependentId: null,
        metadata: {},
      });
    }),
  ).rejects.toThrow();
  expect(await users.findById(user.id)).not.toBeNull();
  expect(await prisma.accountDeletionRequest.count({ where: { userId: user.id } })).toBe(0);
  expect(await prisma.authSession.count({ where: { userId: user.id, revokedAt: null } })).toBe(1);
});
