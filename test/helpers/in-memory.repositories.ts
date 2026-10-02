import { randomUUID } from 'node:crypto';
import type { User, CreateUser } from '../../src/domain/models/user.model';
import type {
  CareTask,
  CreateCareTask,
  ListCareTasks,
  UpdateCareTask,
} from '../../src/domain/models/care-task.model';
import type { UserRepository } from '../../src/repository/user.repository';
import type { CareTaskRepository } from '../../src/repository/care-task.repository';
import { RepositoryConflictError } from '../../src/repository/errors/repository.error';

export class InMemoryUserRepository implements UserRepository {
  readonly rows = new Map<string, User>();

  findById(id: string) {
    const user = Array.from(this.rows.values()).find((row) => row.id === id && !row.deletedAt);
    return Promise.resolve(user ? { ...user } : null);
  }

  findByEmail(email: string) {
    const user = this.rows.get(email.trim().toLowerCase());
    return Promise.resolve(user && !user.deletedAt ? { ...user } : null);
  }

  create(data: CreateUser) {
    const email = data.email.trim().toLowerCase();
    if (this.rows.has(email)) return Promise.reject(new RepositoryConflictError());
    const user: User = {
      ...data,
      email,
      id: randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
      status: 'ACTIVE',
      emailVerifiedAt: null,
      deletedAt: null,
      credentialVersion: 0,
    };
    this.rows.set(user.email, user);
    return Promise.resolve({ ...user });
  }

  verifyEmail(id: string, credentialVersion: number, now: Date) {
    const row = Array.from(this.rows.values()).find(
      (user) =>
        user.id === id &&
        user.credentialVersion === credentialVersion &&
        user.status === 'ACTIVE' &&
        !user.deletedAt &&
        !user.emailVerifiedAt,
    );
    if (row) this.rows.set(row.email, { ...row, emailVerifiedAt: now, updatedAt: now });
    return Promise.resolve(Boolean(row));
  }
  resetPassword(id: string, credentialVersion: number, passwordHash: string) {
    const row = Array.from(this.rows.values()).find(
      (user) =>
        user.id === id &&
        user.credentialVersion === credentialVersion &&
        user.status === 'ACTIVE' &&
        !user.deletedAt,
    );
    if (row)
      this.rows.set(row.email, {
        ...row,
        passwordHash,
        credentialVersion: credentialVersion + 1,
        updatedAt: new Date(),
      });
    return Promise.resolve(Boolean(row));
  }
  closeAccount(id: string, credentialVersion: number, now: Date) {
    const row = Array.from(this.rows.values()).find(
      (user) =>
        user.id === id &&
        user.credentialVersion === credentialVersion &&
        user.status === 'ACTIVE' &&
        !user.deletedAt,
    );
    if (row)
      this.rows.set(row.email, {
        ...row,
        deletedAt: now,
        status: 'BLOCKED',
        credentialVersion: credentialVersion + 1,
        updatedAt: now,
      });
    return Promise.resolve(Boolean(row));
  }
}

export class InMemoryCareTaskRepository implements CareTaskRepository {
  readonly rows = new Map<string, CareTask>();

  listByOwner(ownerId: string, { limit, offset }: ListCareTasks) {
    return Promise.resolve(
      Array.from(this.rows.values())
        .filter((task) => task.ownerId === ownerId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id))
        .slice(offset, offset + limit)
        .map((task) => ({ ...task })),
    );
  }

  findByOwner(id: string, ownerId: string) {
    const task = this.rows.get(id);
    return Promise.resolve(task?.ownerId === ownerId ? { ...task } : null);
  }

  create(data: CreateCareTask) {
    const task: CareTask = {
      ...data,
      id: randomUUID(),
      completed: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.rows.set(task.id, task);
    return Promise.resolve({ ...task });
  }

  updateByOwner(id: string, ownerId: string, data: UpdateCareTask) {
    const task = this.rows.get(id);
    if (!task || task.ownerId !== ownerId) return Promise.resolve(null);
    const updated = { ...task, ...data, updatedAt: new Date() };
    this.rows.set(id, updated);
    return Promise.resolve({ ...updated });
  }

  deleteByOwner(id: string, ownerId: string) {
    const task = this.rows.get(id);
    return Promise.resolve(task?.ownerId === ownerId && this.rows.delete(id));
  }
}
