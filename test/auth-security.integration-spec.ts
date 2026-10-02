import { randomUUID } from 'node:crypto';
import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { AuthService } from '../src/modules/auth/auth.service';
import { AccountSecurityService } from '../src/modules/auth/account-security.service';
import { OpaqueTokenService } from '../src/modules/auth/opaque-token.service';
import { PasswordService } from '../src/modules/auth/password.service';
import { ACCOUNT_NOTIFICATION_GATEWAY } from '../src/modules/auth/account-notification.gateway';
import { USER_REPOSITORY, type UserRepository } from '../src/repository/user.repository';
import { InMemoryAccountNotifications } from './helpers/in-memory-auth';
import { authPassword } from './helpers/auth-fixture';
let module: TestingModule | undefined;
let prisma: PrismaService;
let auth: AuthService;
let account: AccountSecurityService;
let users: UserRepository;
let tokens: OpaqueTokenService;
const notifications = new InMemoryAccountNotifications();
const userIds: string[] = [];
const rateKeys: string[] = [];
beforeAll(async () => {
  module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ACCOUNT_NOTIFICATION_GATEWAY)
    .useValue(notifications)
    .compile();
  await module.init();
  prisma = module.get(PrismaService);
  auth = module.get(AuthService);
  account = module.get(AccountSecurityService);
  users = module.get<UserRepository>(USER_REPOSITORY);
  tokens = module.get(OpaqueTokenService);
});
afterAll(async () => {
  try {
    if (prisma && userIds.length)
      await prisma.$transaction(async (tx) => {
        const sessions = await tx.authSession.findMany({
          where: { userId: { in: userIds } },
          select: { id: true },
        });
        await tx.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
        await tx.accountToken.deleteMany({ where: { userId: { in: userIds } } });
        await tx.refreshCredential.deleteMany({
          where: { sessionId: { in: sessions.map((row) => row.id) } },
        });
        await tx.authSession.deleteMany({ where: { userId: { in: userIds } } });
        await tx.user.deleteMany({ where: { id: { in: userIds } } });
        await tx.authRateBucket.deleteMany({ where: { key: { in: rateKeys } } });
      });
  } finally {
    await module?.close();
  }
});
async function userFixture() {
  if (!module) throw new Error();
  const email = 'auth-integration-' + randomUUID() + '@example.com';
  const ip = 'fixture-' + randomUUID();
  const user = await users.create({
    name: 'Auth fixture',
    email,
    passwordHash: await module.get(PasswordService).hash(authPassword),
  });
  userIds.push(user.id);
  for (const scope of ['LOGIN', 'EMAIL_VERIFICATION', 'PASSWORD_RESET']) {
    rateKeys.push(tokens.rateKey(scope + ':IDENTITY', email), tokens.rateKey(scope + ':IP', ip));
  }
  return { user, ip };
}
test('rotação concorrente PostgreSQL produz um sucesso e revogação por replay persistida', async () => {
  const { user, ip } = await userFixture();
  const session = await auth.login({ email: user.email, password: authPassword }, ip);
  const results = await Promise.allSettled([
    auth.refresh(session.refreshToken),
    auth.refresh(session.refreshToken),
  ]);
  expect(results.filter((row) => row.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter((row) => row.status === 'rejected')).toHaveLength(1);
  expect(await prisma.authSession.count({ where: { userId: user.id, revokedAt: null } })).toBe(0);
  expect(
    await prisma.auditLog.count({ where: { actorId: user.id, action: 'REFRESH_REUSE_DETECTED' } }),
  ).toBe(1);
  const stored = await prisma.refreshCredential.findMany({
    where: { session: { userId: user.id } },
  });
  expect(JSON.stringify(stored)).not.toContain(session.refreshToken);
});
test('reset concorrente PostgreSQL só usa código uma vez e revoga sessões', async () => {
  const { user, ip } = await userFixture();
  await auth.login({ email: user.email, password: authPassword }, ip);
  await account.request('PASSWORD_RESET', user.email, ip);
  const token = notifications.messages.at(-1)?.token;
  if (!token) throw new Error();
  const password = 'Nova senha extensa para integração!';
  const results = await Promise.allSettled([
    account.resetPassword(token, password),
    account.resetPassword(token, password),
  ]);
  expect(results.filter((row) => row.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter((row) => row.status === 'rejected')).toHaveLength(1);
  expect((await users.findById(user.id))?.credentialVersion).toBe(1);
  expect(await prisma.authSession.count({ where: { userId: user.id, revokedAt: null } })).toBe(0);
  expect(
    await prisma.accountToken.count({ where: { userId: user.id, usedAt: { not: null } } }),
  ).toBe(1);
});
test('buckets compartilhados limitam logins concorrentes em IPs distintos', async () => {
  const { user, ip } = await userFixture();
  if (!module) throw new Error();
  module.get(ConfigService).set('AUTH_LOGIN_IDENTITY_MAX', 1);
  rateKeys.push(tokens.rateKey('LOGIN:IP', ip + '-other'));
  const results = await Promise.allSettled([
    auth.login({ email: user.email, password: authPassword }, ip),
    auth.login({ email: user.email, password: authPassword }, ip + '-other'),
  ]);
  expect(results.filter((row) => row.status === 'fulfilled')).toHaveLength(1);
  expect(await prisma.authSession.count({ where: { userId: user.id } })).toBe(1);
});
