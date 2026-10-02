import { createHash, createHmac, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
export type TokenPurpose = 'REFRESH' | 'EMAIL_VERIFICATION' | 'PASSWORD_RESET';
const prefixes: Record<TokenPurpose, string> = {
  REFRESH: 'rf',
  EMAIL_VERIFICATION: 'ev',
  PASSWORD_RESET: 'pr',
};
@Injectable()
export class OpaqueTokenService {
  constructor(private readonly config: ConfigService) {}
  generate(purpose: TokenPurpose): string {
    return prefixes[purpose] + '_' + randomBytes(32).toString('base64url');
  }
  hash(purpose: TokenPurpose, token: string): string {
    return createHash('sha256')
      .update(purpose + '\0' + token)
      .digest('hex');
  }
  valid(purpose: TokenPurpose, token: string): boolean {
    return new RegExp('^' + prefixes[purpose] + '_[A-Za-z0-9_-]{43}$').test(token);
  }
  rateKey(scope: string, value: string): string {
    return createHmac('sha256', this.config.getOrThrow<string>('JWT_SECRET'))
      .update('auth-rate\0' + scope + '\0' + value)
      .digest('hex');
  }
}
