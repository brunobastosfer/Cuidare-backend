import type {
  AccountToken,
  AccountTokenPurpose,
  CreateAccountToken,
} from '../domain/models/auth-session.model';
export const ACCOUNT_TOKEN_REPOSITORY = Symbol('ACCOUNT_TOKEN_REPOSITORY');
export interface AccountTokenRepository {
  create(data: CreateAccountToken): Promise<AccountToken>;
  findByHash(hash: string, purpose: AccountTokenPurpose): Promise<AccountToken | null>;
  consume(id: string, now: Date): Promise<boolean>;
  revokeForUser(userId: string, purpose: AccountTokenPurpose, now: Date): Promise<void>;
}
