import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { RepositoryModule } from '../../repository/repository.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PasswordService } from './password.service';
import { AuditModule } from '../audit/audit.module';
import { AccountSecurityService } from './account-security.service';
import { OpaqueTokenService } from './opaque-token.service';
import { AuthRateLimitService } from './auth-rate-limit.service';
import { PublicResponseService } from './public-response.service';
import { ACCOUNT_NOTIFICATION_GATEWAY } from './account-notification.gateway';
import { SmtpAccountNotificationGateway } from '../../infrastructure/email/smtp-account-notification.gateway';

@Module({
  imports: [
    RepositoryModule,
    AuditModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          algorithm: 'HS256',
          expiresIn: config.getOrThrow<number>('JWT_TTL_SECONDS'),
          issuer: config.getOrThrow<string>('JWT_ISSUER'),
          audience: config.getOrThrow<string>('JWT_AUDIENCE'),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    JwtAuthGuard,
    AccountSecurityService,
    OpaqueTokenService,
    AuthRateLimitService,
    PublicResponseService,
    { provide: ACCOUNT_NOTIFICATION_GATEWAY, useClass: SmtpAccountNotificationGateway },
  ],
  exports: [JwtAuthGuard, PasswordService],
})
export class AuthModule {}
