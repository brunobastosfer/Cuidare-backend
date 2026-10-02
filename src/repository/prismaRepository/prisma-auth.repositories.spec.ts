import { Prisma } from '../../generated/prisma/client';
import { PrismaAuthSessionRepository } from './prisma-auth-session.repository';
import { PrismaAccountTokenRepository } from './prisma-account-token.repository';
import { PrismaAuthRateLimitRepository } from './prisma-auth-rate-limit.repository';
import { PrismaUserRepository } from './prisma-user.repository';
import { RepositoryRetryableError } from '../errors/repository.error';
function setup() {
  const delegate = () => ({
    create: jest.fn().mockResolvedValue({}),
    findFirst: jest.fn().mockResolvedValue(null),
    findUnique: jest.fn().mockResolvedValue(null),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    upsert: jest.fn().mockResolvedValue({}),
  });
  const db = {
    user: delegate(),
    authSession: delegate(),
    refreshCredential: delegate(),
    accountToken: delegate(),
    authRateBucket: delegate(),
  };
  const tx = db as unknown as Prisma.TransactionClient;
  return {
    db,
    sessions: new PrismaAuthSessionRepository(tx),
    tokens: new PrismaAccountTokenRepository(tx),
    rates: new PrismaAuthRateLimitRepository(tx),
    users: new PrismaUserRepository(tx),
  };
}
const now = new Date();
test('consultas e revogações de sessão contêm titular/estado/expiração', async () => {
  const { db, sessions } = setup();
  await sessions.findActive('session', 'actor', now);
  expect(db.authSession.findFirst).toHaveBeenCalledWith({
    where: {
      id: 'session',
      userId: 'actor',
      revokedAt: null,
      expiresAt: { gt: now },
      user: { deletedAt: null, status: 'ACTIVE' },
    },
  });
  expect(await sessions.revoke('session', 'actor', now)).toBe(true);
  expect(db.authSession.updateMany).toHaveBeenCalledWith({
    where: { id: 'session', userId: 'actor', revokedAt: null },
    data: { revokedAt: now },
  });
  await sessions.revokeAll('actor', now);
  expect(db.authSession.updateMany).toHaveBeenLastCalledWith({
    where: { userId: 'actor', revokedAt: null },
    data: { revokedAt: now },
  });
});
test('refresh é consumido atomicamente apenas quando válido e família/usuário ativos', async () => {
  const { db, sessions } = setup();
  expect(await sessions.consumeRefresh('credential', now)).toBe(true);
  expect(db.refreshCredential.updateMany).toHaveBeenCalledWith({
    where: {
      id: 'credential',
      usedAt: null,
      expiresAt: { gt: now },
      session: {
        revokedAt: null,
        expiresAt: { gt: now },
        user: { deletedAt: null, status: 'ACTIVE' },
      },
    },
    data: { usedAt: now },
  });
  await sessions.findRefreshByHash('hash');
  expect(db.refreshCredential.findUnique).toHaveBeenCalledWith({ where: { tokenHash: 'hash' } });
  await sessions.createRefresh({ sessionId: 'session', tokenHash: 'hash', expiresAt: now });
  expect(db.refreshCredential.create).toHaveBeenCalledWith({
    data: { sessionId: 'session', tokenHash: 'hash', expiresAt: now },
  });
});
test('tokens de conta têm escopo, uso único, expiração e revogação, sem updates amplos', async () => {
  const { db, tokens } = setup();
  await tokens.findByHash('hash', 'PASSWORD_RESET');
  expect(db.accountToken.findFirst).toHaveBeenCalledWith({
    where: { tokenHash: 'hash', purpose: 'PASSWORD_RESET' },
  });
  expect(await tokens.consume('credential', now)).toBe(true);
  expect(db.accountToken.updateMany).toHaveBeenCalledWith({
    where: {
      id: 'credential',
      usedAt: null,
      revokedAt: null,
      expiresAt: { gt: now },
      user: { deletedAt: null, status: 'ACTIVE' },
    },
    data: { usedAt: now },
  });
  await tokens.revokeForUser('actor', 'EMAIL_VERIFICATION', now);
  expect(db.accountToken.updateMany).toHaveBeenLastCalledWith({
    where: { userId: 'actor', purpose: 'EMAIL_VERIFICATION', usedAt: null, revokedAt: null },
    data: { revokedAt: now },
  });
});
test('alterações de conta exigem versão atual e status; reset incrementa versão', async () => {
  const { db, users } = setup();
  expect(await users.verifyEmail('actor', 0, now)).toBe(true);
  expect(db.user.updateMany).toHaveBeenCalledWith({
    where: {
      id: 'actor',
      credentialVersion: 0,
      deletedAt: null,
      status: 'ACTIVE',
      emailVerifiedAt: null,
    },
    data: { emailVerifiedAt: now },
  });
  expect(await users.resetPassword('actor', 0, 'new-hash')).toBe(true);
  expect(db.user.updateMany).toHaveBeenLastCalledWith({
    where: { id: 'actor', credentialVersion: 0, deletedAt: null, status: 'ACTIVE' },
    data: { passwordHash: 'new-hash', credentialVersion: { increment: 1 } },
  });
});
test('bucket persiste somente chave pseudonimizada e disputa P2002 pede retry específico', async () => {
  const { db, rates } = setup();
  const data = { key: 'opaque', count: 1, windowStartedAt: now, expiresAt: now };
  await rates.save(data);
  expect(db.authRateBucket.upsert).toHaveBeenCalledWith({
    where: { key: 'opaque' },
    create: data,
    update: { count: 1, windowStartedAt: now, expiresAt: now },
  });
  db.authRateBucket.upsert.mockRejectedValueOnce(
    new Prisma.PrismaClientKnownRequestError('race', { code: 'P2002', clientVersion: 'test' }),
  );
  await expect(rates.save(data)).rejects.toBeInstanceOf(RepositoryRetryableError);
});
