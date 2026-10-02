import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { PrismaService } from '../../src/database/prisma.service';
import { USER_REPOSITORY } from '../../src/repository/user.repository';
import { CARE_TASK_REPOSITORY } from '../../src/repository/care-task.repository';
import { InMemoryUserRepository, InMemoryCareTaskRepository } from './in-memory.repositories';
import { InMemoryFoundation } from './in-memory-foundation';
import { DEPENDENT_REPOSITORY } from '../../src/repository/dependent.repository';
import { DEPENDENT_ACCESS_REPOSITORY } from '../../src/repository/dependent-access.repository';
import { CONSENT_REPOSITORY } from '../../src/repository/consent.repository';
import { AUDIT_LOG_REPOSITORY } from '../../src/repository/audit-log.repository';
import { UNIT_OF_WORK_REPOSITORY } from '../../src/repository/unit-of-work.repository';
import { AUTH_SESSION_REPOSITORY } from '../../src/repository/auth-session.repository';
import { ACCOUNT_TOKEN_REPOSITORY } from '../../src/repository/account-token.repository';
import { AUTH_RATE_LIMIT_REPOSITORY } from '../../src/repository/auth-rate-limit.repository';
import { ACCOUNT_NOTIFICATION_GATEWAY } from '../../src/modules/auth/account-notification.gateway';
import { InMemoryAccountNotifications } from './in-memory-auth';
import { PRIVACY_REPOSITORY } from '../../src/repository/privacy.repository';
import { MEDICATION_REPOSITORY } from '../../src/repository/medication.repository';
import { APPOINTMENT_REPOSITORY } from '../../src/repository/appointment.repository';
import { DOCUMENT_REPOSITORY } from '../../src/repository/document.repository';
import { VACCINATION_REPOSITORY } from '../../src/repository/vaccination.repository';
import { FILE_STORAGE_REPOSITORY } from '../../src/repository/file-storage.repository';
import { MALWARE_SCANNER_REPOSITORY } from '../../src/repository/malware-scanner.repository';
import { InMemoryFileStorage, FakeMalwareScanner } from './in-memory-documents';

import { EDUCATION_REPOSITORY } from '../../src/repository/education.repository';
export async function createTestApp() {
  const users = new InMemoryUserRepository();
  const tasks = new InMemoryCareTaskRepository();
  const foundation = new InMemoryFoundation(users, tasks);
  const notifications = new InMemoryAccountNotifications();
  const storage = new InMemoryFileStorage(),
    scanner = new FakeMalwareScanner();
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue({})
    .overrideProvider(USER_REPOSITORY)
    .useValue(users)
    .overrideProvider(CARE_TASK_REPOSITORY)
    .useValue(tasks)
    .overrideProvider(DEPENDENT_REPOSITORY)
    .useValue(foundation.dependents)
    .overrideProvider(DEPENDENT_ACCESS_REPOSITORY)
    .useValue(foundation.dependentAccess)
    .overrideProvider(CONSENT_REPOSITORY)
    .useValue(foundation.consents)
    .overrideProvider(AUDIT_LOG_REPOSITORY)
    .useValue(foundation.auditLogs)
    .overrideProvider(UNIT_OF_WORK_REPOSITORY)
    .useValue(foundation)
    .overrideProvider(PRIVACY_REPOSITORY)
    .useValue(foundation.privacy)
    .overrideProvider(MEDICATION_REPOSITORY)
    .useValue(foundation.medications)
    .overrideProvider(APPOINTMENT_REPOSITORY)
    .useValue(foundation.appointments)
    .overrideProvider(DOCUMENT_REPOSITORY)
    .useValue(foundation.documents)
    .overrideProvider(EDUCATION_REPOSITORY)
    .useValue(foundation.education)
    .overrideProvider(VACCINATION_REPOSITORY)
    .useValue(foundation.vaccinations)
    .overrideProvider(FILE_STORAGE_REPOSITORY)
    .useValue(storage)
    .overrideProvider(MALWARE_SCANNER_REPOSITORY)
    .useValue(scanner)
    .overrideProvider(AUTH_SESSION_REPOSITORY)
    .useValue(foundation.auth.sessions)
    .overrideProvider(ACCOUNT_TOKEN_REPOSITORY)
    .useValue(foundation.auth.accountTokens)
    .overrideProvider(AUTH_RATE_LIMIT_REPOSITORY)
    .useValue(foundation.auth.rates)
    .overrideProvider(ACCOUNT_NOTIFICATION_GATEWAY)
    .useValue(notifications)
    .compile();
  const app = module.createNestApplication<NestExpressApplication>({
    logger: ['error'],
    bodyParser: false,
    abortOnError: false,
  });
  configureApp(app);
  await app.init();
  return { app, users, tasks, foundation, notifications, storage, scanner };
}
