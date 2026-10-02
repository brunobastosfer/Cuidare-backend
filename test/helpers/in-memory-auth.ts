import { randomUUID } from 'node:crypto';
import type {
  AccountToken,
  AuthRateBucket,
  AuthSession,
  RefreshCredential,
} from '../../src/domain/models/auth-session.model';
import type { AuthSessionRepository } from '../../src/repository/auth-session.repository';
import type { AccountTokenRepository } from '../../src/repository/account-token.repository';
import type { AuthRateLimitRepository } from '../../src/repository/auth-rate-limit.repository';
import type {
  AccountNotification,
  AccountNotificationGateway,
} from '../../src/modules/auth/account-notification.gateway';
import type { InMemoryUserRepository } from './in-memory.repositories';

export class InMemoryAccountNotifications implements AccountNotificationGateway {
  available = true;
  readonly messages: AccountNotification[] = [];
  isAvailable() {
    return this.available;
  }
  enqueue(message: AccountNotification) {
    if (this.available) this.messages.push({ ...message });
  }
}
export class InMemoryAuthStorage {
  readonly sessionRows = new Map<string, AuthSession>();
  readonly refreshRows = new Map<string, RefreshCredential>();
  readonly tokenRows = new Map<string, AccountToken>();
  readonly rateRows = new Map<string, AuthRateBucket>();
  constructor(private readonly users: InMemoryUserRepository) {}
  private activeUser(id: string) {
    const user = Array.from(this.users.rows.values()).find((row) => row.id === id);
    return Boolean(user && user.status === 'ACTIVE' && !user.deletedAt);
  }
  readonly sessions: AuthSessionRepository = {
    create: (data) => {
      const row: AuthSession = {
        ...data,
        id: randomUUID(),
        authenticationMethod: 'PASSWORD',
        createdAt: new Date(),
        revokedAt: null,
      };
      this.sessionRows.set(row.id, row);
      return Promise.resolve({ ...row });
    },
    findById: (id) => Promise.resolve(this.sessionRows.get(id) ?? null),
    findActive: (id, userId, now) => {
      const row = this.sessionRows.get(id);
      return Promise.resolve(
        row &&
          row.userId === userId &&
          !row.revokedAt &&
          row.expiresAt > now &&
          this.activeUser(userId)
          ? { ...row }
          : null,
      );
    },
    createRefresh: (data) => {
      const row = { ...data, id: randomUUID(), createdAt: new Date(), usedAt: null };
      this.refreshRows.set(row.id, row);
      return Promise.resolve({ ...row });
    },
    findRefreshByHash: (hash) =>
      Promise.resolve(
        Array.from(this.refreshRows.values()).find((row) => row.tokenHash === hash) ?? null,
      ),
    consumeRefresh: (id, now) => {
      const row = this.refreshRows.get(id);
      const session = row ? this.sessionRows.get(row.sessionId) : undefined;
      if (
        !row ||
        row.usedAt ||
        row.expiresAt <= now ||
        !session ||
        session.revokedAt ||
        session.expiresAt <= now ||
        !this.activeUser(session.userId)
      )
        return Promise.resolve(false);
      this.refreshRows.set(id, { ...row, usedAt: now });
      return Promise.resolve(true);
    },
    revoke: (id, userId, now) => {
      const row = this.sessionRows.get(id);
      if (!row || row.userId !== userId || row.revokedAt) return Promise.resolve(false);
      this.sessionRows.set(id, { ...row, revokedAt: now });
      return Promise.resolve(true);
    },
    revokeAll: (userId, now) => {
      for (const row of this.sessionRows.values())
        if (row.userId === userId && !row.revokedAt)
          this.sessionRows.set(row.id, { ...row, revokedAt: now });
      return Promise.resolve();
    },
  };
  readonly accountTokens: AccountTokenRepository = {
    create: (data) => {
      const row = {
        ...data,
        id: randomUUID(),
        createdAt: new Date(),
        usedAt: null,
        revokedAt: null,
      };
      this.tokenRows.set(row.id, row);
      return Promise.resolve({ ...row });
    },
    findByHash: (hash, purpose) =>
      Promise.resolve(
        Array.from(this.tokenRows.values()).find(
          (row) => row.tokenHash === hash && row.purpose === purpose,
        ) ?? null,
      ),
    consume: (id, now) => {
      const row = this.tokenRows.get(id);
      if (
        !row ||
        row.usedAt ||
        row.revokedAt ||
        row.expiresAt <= now ||
        !this.activeUser(row.userId)
      )
        return Promise.resolve(false);
      this.tokenRows.set(id, { ...row, usedAt: now });
      return Promise.resolve(true);
    },
    revokeForUser: (userId, purpose, now) => {
      for (const row of this.tokenRows.values())
        if (row.userId === userId && row.purpose === purpose && !row.usedAt && !row.revokedAt)
          this.tokenRows.set(row.id, { ...row, revokedAt: now });
      return Promise.resolve();
    },
  };
  readonly rates: AuthRateLimitRepository = {
    find: (key) => Promise.resolve(this.rateRows.get(key) ?? null),
    save: (data) => {
      this.rateRows.set(data.key, { ...data });
      return Promise.resolve();
    },
  };
}
