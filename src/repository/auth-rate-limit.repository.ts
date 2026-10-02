import type { AuthRateBucket } from '../domain/models/auth-session.model';
export const AUTH_RATE_LIMIT_REPOSITORY = Symbol('AUTH_RATE_LIMIT_REPOSITORY');
export interface AuthRateLimitRepository {
  // Invocar em UnitOfWork Serializable para tornar leitura+escrita atômicas.
  find(key: string): Promise<AuthRateBucket | null>;
  save(data: AuthRateBucket): Promise<void>;
}
