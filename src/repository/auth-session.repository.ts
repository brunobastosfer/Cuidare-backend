import type {
  AuthSession,
  CreateAuthSession,
  CreateRefreshCredential,
  RefreshCredential,
} from '../domain/models/auth-session.model';
export const AUTH_SESSION_REPOSITORY = Symbol('AUTH_SESSION_REPOSITORY');
export interface AuthSessionRepository {
  create(data: CreateAuthSession): Promise<AuthSession>;
  findById(id: string): Promise<AuthSession | null>;
  findActive(id: string, userId: string, now: Date): Promise<AuthSession | null>;
  createRefresh(data: CreateRefreshCredential): Promise<RefreshCredential>;
  findRefreshByHash(hash: string): Promise<RefreshCredential | null>;
  consumeRefresh(id: string, now: Date): Promise<boolean>;
  revoke(id: string, userId: string, now: Date): Promise<boolean>;
  revokeAll(userId: string, now: Date): Promise<void>;
}
