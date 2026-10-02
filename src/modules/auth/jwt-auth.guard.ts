import {
  Injectable,
  Inject,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { z } from 'zod';
import { PUBLIC_ROUTE } from '../../common/decorators/public.decorator';
import type { ApiRequest } from '../../common/types/request.types';
import { USER_REPOSITORY, type UserRepository } from '../../repository/user.repository';
import {
  AUTH_SESSION_REPOSITORY,
  type AuthSessionRepository,
} from '../../repository/auth-session.repository';

const claimsSchema = z.object({
  sub: z.uuid(),
  sid: z.uuid(),
  cv: z.number().int().nonnegative(),
  tokenUse: z.literal('access'),
  exp: z.number().int().positive(),
});

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(AUTH_SESSION_REPOSITORY) private readonly sessions: AuthSessionRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (
      this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const request = context.switchToHttp().getRequest<ApiRequest>();
    const authorization = request.headers.authorization;
    const token =
      typeof authorization === 'string' ? /^Bearer ([^\s]+)$/i.exec(authorization)?.[1] : undefined;
    if (!token || token.length > 4096) throw new UnauthorizedException('Autenticação necessária.');
    let claims: z.infer<typeof claimsSchema>;
    try {
      const payload = await this.jwt.verifyAsync<Record<string, unknown>>(token, {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
        algorithms: ['HS256'],
        issuer: this.config.getOrThrow<string>('JWT_ISSUER'),
        audience: this.config.getOrThrow<string>('JWT_AUDIENCE'),
      });
      claims = claimsSchema.parse(payload);
    } catch {
      throw new UnauthorizedException('Token inválido ou expirado.');
    }
    // Fora do catch criptográfico: indisponibilidade do banco não vira falso 401.
    const user = await this.users.findById(claims.sub);
    const session = await this.sessions.findActive(claims.sid, claims.sub, new Date());
    if (
      !user ||
      user.status !== 'ACTIVE' ||
      user.deletedAt ||
      !session ||
      user.credentialVersion !== claims.cv ||
      session.credentialVersion !== claims.cv ||
      (this.config.getOrThrow<string>('AUTH_REQUIRE_VERIFIED_EMAIL') === 'true' &&
        !user.emailVerifiedAt)
    )
      throw new UnauthorizedException('Token inválido ou expirado.');
    request.user = { id: user.id, sessionId: session.id };
    return true;
  }
}
