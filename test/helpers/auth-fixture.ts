import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { validateEnvironment } from '../../src/config/environment';
import { AuthService } from '../../src/modules/auth/auth.service';
import { AccountSecurityService } from '../../src/modules/auth/account-security.service';
import { AuthRateLimitService } from '../../src/modules/auth/auth-rate-limit.service';
import { OpaqueTokenService } from '../../src/modules/auth/opaque-token.service';
import { PublicResponseService } from '../../src/modules/auth/public-response.service';
import { PasswordService } from '../../src/modules/auth/password.service';
import { AuditService } from '../../src/modules/audit/audit.service';
import { InMemoryUserRepository } from './in-memory.repositories';
import { InMemoryFoundation } from './in-memory-foundation';
import { InMemoryAccountNotifications } from './in-memory-auth';
export const authPassword = 'Senha forte e longa de teste!';
export async function authFixture() {
  const config = new ConfigService(
    validateEnvironment({
      ...process.env,
      AUTH_REQUIRE_VERIFIED_EMAIL: 'false',
      AUTH_RESPONSE_MIN_MS: '0',
    }),
  );
  const passwords = new PasswordService();
  await passwords.onModuleInit();
  const users = new InMemoryUserRepository();
  const foundation = new InMemoryFoundation(users);
  const notifications = new InMemoryAccountNotifications();
  const tokens = new OpaqueTokenService(config);
  const rates = new AuthRateLimitService(foundation, tokens, config);
  const responses = new PublicResponseService(config);
  const audit = new AuditService();
  const jwt = new JwtService({
    secret: config.getOrThrow<string>('JWT_SECRET'),
    signOptions: {
      algorithm: 'HS256',
      issuer: 'cuidare-backend',
      audience: 'cuidare-app',
      expiresIn: 900,
    },
  });
  const auth = new AuthService(
    users,
    passwords,
    jwt,
    config,
    foundation,
    audit,
    tokens,
    rates,
    responses,
  );
  const account = new AccountSecurityService(
    foundation,
    notifications,
    tokens,
    config,
    passwords,
    audit,
    rates,
    responses,
  );
  await auth.register(
    { name: 'Fixture', email: 'fixture@example.com', password: authPassword },
    '127.0.0.1',
  );
  const user = await users.findByEmail('fixture@example.com');
  if (!user) throw new Error('Fixture ausente');
  return {
    auth,
    account,
    users,
    foundation,
    notifications,
    config,
    passwords,
    tokens,
    rates,
    responses,
    jwt,
    user,
  };
}
