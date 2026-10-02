import {
  BadRequestException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AccountTokenPurpose } from '../../domain/models/auth-session.model';
import {
  UNIT_OF_WORK_REPOSITORY,
  type UnitOfWorkRepository,
} from '../../repository/unit-of-work.repository';
import {
  ACCOUNT_NOTIFICATION_GATEWAY,
  type AccountNotificationGateway,
} from './account-notification.gateway';
import { AuditService } from '../audit/audit.service';
import { OpaqueTokenService } from './opaque-token.service';
import { PasswordService } from './password.service';
import { AuthRateLimitService } from './auth-rate-limit.service';
import { PublicResponseService } from './public-response.service';
import { NEUTRAL_AUTH_RESPONSE } from './auth.service';
@Injectable()
export class AccountSecurityService {
  constructor(
    @Inject(UNIT_OF_WORK_REPOSITORY) private readonly transactions: UnitOfWorkRepository,
    @Inject(ACCOUNT_NOTIFICATION_GATEWAY)
    private readonly notifications: AccountNotificationGateway,
    private readonly tokens: OpaqueTokenService,
    private readonly config: ConfigService,
    private readonly passwords: PasswordService,
    private readonly audit: AuditService,
    private readonly rates: AuthRateLimitService,
    private readonly responses: PublicResponseService,
  ) {}
  request(purpose: AccountTokenPurpose, email: string, ip: string) {
    return this.responses.run(async () => {
      if (!this.notifications.isAvailable())
        throw new ServiceUnavailableException(
          'Entrega de instruções temporariamente indisponível.',
        );
      if (!(await this.rates.consume(purpose, email, ip))) return NEUTRAL_AUTH_RESPONSE;
      const token = this.tokens.generate(purpose);
      const recipient = await this.transactions.run(async (repositories) => {
        const user = await repositories.users.findByEmail(email);
        if (
          !user ||
          user.status !== 'ACTIVE' ||
          user.deletedAt ||
          (purpose === 'EMAIL_VERIFICATION' && user.emailVerifiedAt)
        )
          return null;
        const now = new Date();
        await repositories.accountTokens.revokeForUser(user.id, purpose, now);
        await repositories.accountTokens.create({
          userId: user.id,
          purpose,
          credentialVersion: user.credentialVersion,
          tokenHash: this.tokens.hash(purpose, token),
          expiresAt: new Date(
            now.getTime() +
              this.config.getOrThrow<number>(
                purpose === 'EMAIL_VERIFICATION'
                  ? 'EMAIL_VERIFICATION_TTL_SECONDS'
                  : 'PASSWORD_RESET_TTL_SECONDS',
              ) *
                1000,
          ),
        });
        return user.email;
      });
      if (recipient) this.notifications.enqueue({ recipient, purpose, token });
      return NEUTRAL_AUTH_RESPONSE;
    });
  }
  async verifyEmail(token: string) {
    await this.consume(token, 'EMAIL_VERIFICATION');
  }
  async resetPassword(token: string, password: string) {
    const passwordHash = await this.passwords.hash(password);
    const recipient = await this.consume(token, 'PASSWORD_RESET', passwordHash);
    this.notifications.enqueue({ recipient, purpose: 'PASSWORD_CHANGED' });
  }
  private async consume(
    token: string,
    purpose: AccountTokenPurpose,
    passwordHash?: string,
  ): Promise<string> {
    if (!this.tokens.valid(purpose, token))
      throw new BadRequestException('Código inválido ou expirado.');
    return this.transactions.run(async (repositories) => {
      const now = new Date();
      const credential = await repositories.accountTokens.findByHash(
        this.tokens.hash(purpose, token),
        purpose,
      );
      if (!credential || credential.usedAt || credential.revokedAt || credential.expiresAt <= now)
        throw new BadRequestException('Código inválido ou expirado.');
      const user = await repositories.users.findById(credential.userId);
      if (
        !user ||
        user.status !== 'ACTIVE' ||
        user.deletedAt ||
        user.credentialVersion !== credential.credentialVersion ||
        !(await repositories.accountTokens.consume(credential.id, now))
      )
        throw new BadRequestException('Código inválido ou expirado.');
      if (purpose === 'EMAIL_VERIFICATION') {
        if (!(await repositories.users.verifyEmail(user.id, user.credentialVersion, now)))
          throw new BadRequestException('Código inválido ou expirado.');
      } else {
        if (
          !passwordHash ||
          !(await repositories.users.resetPassword(user.id, user.credentialVersion, passwordHash))
        )
          throw new BadRequestException('Código inválido ou expirado.');
        await repositories.sessions.revokeAll(user.id, now);
        await repositories.accountTokens.revokeForUser(user.id, 'EMAIL_VERIFICATION', now);
      }
      await repositories.accountTokens.revokeForUser(user.id, purpose, now);
      await this.audit.record(repositories.auditLogs, {
        actorId: user.id,
        action: purpose === 'EMAIL_VERIFICATION' ? 'EMAIL_VERIFIED' : 'PASSWORD_RESET',
        resourceType: 'USER',
        resourceId: user.id,
        dependentId: null,
        metadata: {},
      });
      return user.email;
    });
  }
}
