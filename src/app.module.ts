import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { validateEnvironment } from './config/environment';
import { AuthModule } from './modules/auth/auth.module';
import { JwtAuthGuard } from './modules/auth/jwt-auth.guard';
import { CareTasksModule } from './modules/care-tasks/care-tasks.module';
import { HealthController } from './modules/health/health.controller';
import { UsersModule } from './modules/users/users.module';
import { DependentsModule } from './modules/dependents/dependents.module';
import { ConsentsModule } from './modules/consents/consents.module';
import { PrivacyModule } from './modules/privacy/privacy.module';
import { TimelineModule } from './modules/timeline/timeline.module';
import { MedicationsModule } from './modules/medications/medications.module';
import { AppointmentsModule } from './modules/appointments/appointments.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { VaccinationsModule } from './modules/vaccinations/vaccinations.module';

import { EducationModule } from './modules/education/education.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      ignoreEnvFile: process.env.NODE_ENV === 'test',
      validate: validateEnvironment,
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: config.getOrThrow<number>('RATE_LIMIT_TTL_MS'),
          limit: config.getOrThrow<number>('RATE_LIMIT_MAX'),
        },
      ],
    }),
    AuthModule,
    CareTasksModule,
    UsersModule,
    DependentsModule,
    ConsentsModule,
    PrivacyModule,
    TimelineModule,
    MedicationsModule,
    AppointmentsModule,
    DocumentsModule,
    VaccinationsModule,
    EducationModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useExisting: JwtAuthGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule {}
