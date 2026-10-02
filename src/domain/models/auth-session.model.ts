export interface AuthSession {
  id: string;
  userId: string;
  credentialVersion: number;
  authenticationMethod: 'PASSWORD';
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
}
export type CreateAuthSession = Pick<AuthSession, 'userId' | 'credentialVersion' | 'expiresAt'>;
export interface RefreshCredential {
  id: string;
  sessionId: string;
  tokenHash: string;
  createdAt: Date;
  expiresAt: Date;
  usedAt: Date | null;
}
export type CreateRefreshCredential = Pick<
  RefreshCredential,
  'sessionId' | 'tokenHash' | 'expiresAt'
>;
export type AccountTokenPurpose = 'EMAIL_VERIFICATION' | 'PASSWORD_RESET';
export interface AccountToken {
  id: string;
  userId: string;
  purpose: AccountTokenPurpose;
  tokenHash: string;
  credentialVersion: number;
  createdAt: Date;
  expiresAt: Date;
  usedAt: Date | null;
  revokedAt: Date | null;
}
export type CreateAccountToken = Pick<
  AccountToken,
  'userId' | 'purpose' | 'tokenHash' | 'credentialVersion' | 'expiresAt'
>;
export interface AuthRateBucket {
  key: string;
  count: number;
  windowStartedAt: Date;
  expiresAt: Date;
}
