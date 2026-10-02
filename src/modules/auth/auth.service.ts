import {
  Inject,
  Injectable,
  HttpException,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { User } from '../../domain/models/user.model';
import type { AuthSession } from '../../domain/models/auth-session.model';
import { userView } from '../../presentation/views/user.view';
import { USER_REPOSITORY, type UserRepository } from '../../repository/user.repository';
import { RepositoryConflictError } from '../../repository/errors/repository.error';
import {
  UNIT_OF_WORK_REPOSITORY,
  type UnitOfWorkRepository,
} from '../../repository/unit-of-work.repository';
import type { LoginDto } from './dto/login.dto';
import type { RegisterDto } from './dto/register.dto';
import { PasswordService } from './password.service';
import { AuditService } from '../audit/audit.service';
import { OpaqueTokenService } from './opaque-token.service';
import { AuthRateLimitService } from './auth-rate-limit.service';
import { PublicResponseService } from './public-response.service';
export const NEUTRAL_AUTH_RESPONSE = { message: 'Solicitação recebida.' } as const;
@Injectable()
export class AuthService {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    private readonly passwords: PasswordService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    @Inject(UNIT_OF_WORK_REPOSITORY) private readonly transactions: UnitOfWorkRepository,
    private readonly audit: AuditService,
    private readonly tokens: OpaqueTokenService,
    private readonly rates: AuthRateLimitService,
    private readonly responses: PublicResponseService,
  ) {}
  register(dto: RegisterDto, ip: string) {
    return this.responses.run(async () => {
      if (!(await this.rates.consume('REGISTER', dto.email, ip))) return NEUTRAL_AUTH_RESPONSE;
      const passwordHash = await this.passwords.hash(dto.password);
      try {
        await this.transactions.run(async (repositories) => {
          if (await repositories.users.findByEmail(dto.email)) return;
          const created = await repositories.users.create({
            name: dto.name,
            email: dto.email,
            passwordHash,
          });
          await this.audit.record(repositories.auditLogs, {
            actorId: created.id,
            action: 'USER_CREATED',
            resourceType: 'USER',
            resourceId: created.id,
            dependentId: null,
            metadata: {},
          });
        });
      } catch (error) {
        if (!(error instanceof RepositoryConflictError)) throw error;
      }
      return NEUTRAL_AUTH_RESPONSE;
    });
  }
  login(dto: LoginDto, ip: string) {
    return this.responses.run(async () => {
      if (!(await this.rates.consume('LOGIN', dto.email, ip)))
        throw new HttpException(
          'Tentativas temporariamente limitadas.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      const snapshot = await this.users.findByEmail(dto.email);
      const valid = await this.passwords.verify(dto.password, snapshot?.passwordHash);
      if (!snapshot || !valid || !this.eligible(snapshot))
        throw new UnauthorizedException('Credenciais inválidas.');
      const refreshToken = this.tokens.generate('REFRESH');
      const result = await this.transactions.run(async (repositories) => {
        const user = await repositories.users.findById(snapshot.id);
        if (
          !user ||
          !this.eligible(user) ||
          user.credentialVersion !== snapshot.credentialVersion ||
          user.passwordHash !== snapshot.passwordHash
        )
          throw new UnauthorizedException('Credenciais inválidas.');
        const session = await repositories.sessions.create({
          userId: user.id,
          credentialVersion: user.credentialVersion,
          expiresAt: new Date(
            Date.now() + this.config.getOrThrow<number>('REFRESH_TTL_SECONDS') * 1000,
          ),
        });
        await repositories.sessions.createRefresh({
          sessionId: session.id,
          tokenHash: this.tokens.hash('REFRESH', refreshToken),
          expiresAt: session.expiresAt,
        });
        await this.audit.record(repositories.auditLogs, {
          actorId: user.id,
          action: 'SESSION_CREATED',
          resourceType: 'SESSION',
          resourceId: session.id,
          dependentId: null,
          metadata: {},
        });
        return { user, session };
      });
      return this.response(result.user, result.session, refreshToken);
    });
  }
  async refresh(refreshToken: string) {
    if (!this.tokens.valid('REFRESH', refreshToken))
      throw new UnauthorizedException('Credencial inválida ou expirada.');
    const next = this.tokens.generate('REFRESH');
    const result = await this.transactions.run(async (repositories) => {
      const now = new Date();
      const credential = await repositories.sessions.findRefreshByHash(
        this.tokens.hash('REFRESH', refreshToken),
      );
      if (!credential) return null;
      const session = await repositories.sessions.findById(credential.sessionId);
      if (!session || session.revokedAt || session.expiresAt <= now || credential.expiresAt <= now)
        return null;
      const user = await repositories.users.findById(session.userId);
      if (!user || !this.eligible(user) || session.credentialVersion !== user.credentialVersion)
        return null;
      if (credential.usedAt) {
        await repositories.sessions.revoke(session.id, user.id, now);
        await this.audit.record(repositories.auditLogs, {
          actorId: user.id,
          action: 'REFRESH_REUSE_DETECTED',
          resourceType: 'SESSION',
          resourceId: session.id,
          dependentId: null,
          metadata: {},
        });
        // 401 só após commit, para não desfazer a revogação da família.
        return null;
      }
      if (!(await repositories.sessions.consumeRefresh(credential.id, now))) return null;
      await repositories.sessions.createRefresh({
        sessionId: session.id,
        tokenHash: this.tokens.hash('REFRESH', next),
        expiresAt: session.expiresAt,
      });
      await this.audit.record(repositories.auditLogs, {
        actorId: user.id,
        action: 'REFRESH_ROTATED',
        resourceType: 'SESSION',
        resourceId: session.id,
        dependentId: null,
        metadata: {},
      });
      return { user, session };
    });
    if (!result) throw new UnauthorizedException('Credencial inválida ou expirada.');
    return this.response(result.user, result.session, next);
  }
  async logout(userId: string, sessionId: string) {
    await this.transactions.run(async (repositories) => {
      if (await repositories.sessions.revoke(sessionId, userId, new Date()))
        await this.audit.record(repositories.auditLogs, {
          actorId: userId,
          action: 'SESSION_REVOKED',
          resourceType: 'SESSION',
          resourceId: sessionId,
          dependentId: null,
          metadata: {},
        });
    });
  }
  async logoutAll(userId: string) {
    await this.transactions.run(async (repositories) => {
      await repositories.sessions.revokeAll(userId, new Date());
      await this.audit.record(repositories.auditLogs, {
        actorId: userId,
        action: 'ALL_SESSIONS_REVOKED',
        resourceType: 'USER',
        resourceId: userId,
        dependentId: null,
        metadata: {},
      });
    });
  }
  private eligible(user: User): boolean {
    return (
      user.status === 'ACTIVE' &&
      !user.deletedAt &&
      (this.config.getOrThrow<string>('AUTH_REQUIRE_VERIFIED_EMAIL') !== 'true' ||
        user.emailVerifiedAt !== null)
    );
  }
  private async response(user: User, session: AuthSession, refreshToken: string) {
    const remaining = Math.floor((session.expiresAt.getTime() - Date.now()) / 1000);
    if (remaining <= 0) throw new UnauthorizedException('Credencial inválida ou expirada.');
    const expiresIn = Math.min(this.config.getOrThrow<number>('JWT_TTL_SECONDS'), remaining);
    return {
      accessToken: await this.jwt.signAsync(
        { sub: user.id, sid: session.id, cv: user.credentialVersion, tokenUse: 'access' },
        { expiresIn },
      ),
      tokenType: 'Bearer',
      expiresIn,
      refreshToken,
      refreshExpiresIn: remaining,
      user: userView(user),
    };
  }
}
