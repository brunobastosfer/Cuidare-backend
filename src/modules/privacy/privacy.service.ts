import { randomUUID } from 'node:crypto';
import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RetentionDays } from '../../config/privacy-settings';
import { USER_REPOSITORY, type UserRepository } from '../../repository/user.repository';
import {
  UNIT_OF_WORK_REPOSITORY,
  type UnitOfWorkRepository,
} from '../../repository/unit-of-work.repository';
import { PasswordService } from '../auth/password.service';
import { AuditService } from '../audit/audit.service';
import { PRIVACY_EXPORT_FORMATTER, type PrivacyExportFormatter } from './privacy-export-formatter';
import type { ExportPrivacyDto, RequestAccountDeletionDto } from './dto/privacy.dto';
@Injectable()
export class PrivacyService {
  constructor(
    @Inject(UNIT_OF_WORK_REPOSITORY) private readonly transactions: UnitOfWorkRepository,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    private readonly passwords: PasswordService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    @Inject(PRIVACY_EXPORT_FORMATTER) private readonly formatter: PrivacyExportFormatter,
  ) {}
  async export(userId: string, dto: ExportPrivacyDto) {
    if (dto.format !== this.formatter.format)
      throw new BadRequestException('Formato de exportação não disponível.');
    const actor = await this.reauthenticate(userId, dto.password);
    return this.transactions.run(async (repositories) => {
      const current = await repositories.users.findById(userId);
      if (
        !current ||
        current.status !== 'ACTIVE' ||
        current.passwordHash !== actor.passwordHash ||
        current.credentialVersion !== actor.credentialVersion
      )
        throw new UnauthorizedException('Confirmação de identidade inválida.');
      const ids = dto.dependentIds ?? [];
      const max = this.config.getOrThrow<number>('PRIVACY_EXPORT_MAX_ITEMS');
      if (ids.length > max)
        throw new HttpException(
          'Exportação excede o limite disponível; solicite atendimento pelo canal de privacidade.',
          HttpStatus.PAYLOAD_TOO_LARGE,
        );
      const snapshot = await repositories.privacy.readExport(userId, ids, max);
      if (!snapshot.account) throw new UnauthorizedException('Autenticação necessária.');
      if (snapshot.dependents.length !== ids.length)
        throw new NotFoundException('Escopo de exportação não disponível.');
      if (Object.values(snapshot).some((value) => Array.isArray(value) && value.length > max))
        throw new HttpException(
          'Exportação excede o limite disponível; solicite atendimento pelo canal de privacidade.',
          HttpStatus.PAYLOAD_TOO_LARGE,
        );
      const id = randomUUID();
      const payload = this.formatter.formatSnapshot(id, new Date(), ids, snapshot);
      if (
        this.formatter.sizeBytes(payload) >
        this.config.getOrThrow<number>('PRIVACY_EXPORT_MAX_BYTES')
      )
        throw new HttpException(
          'Exportação excede o limite disponível; solicite atendimento pelo canal de privacidade.',
          HttpStatus.PAYLOAD_TOO_LARGE,
        );
      await repositories.privacy.recordExport(id, userId);
      await this.audit.record(repositories.auditLogs, {
        actorId: userId,
        action: 'DATA_EXPORTED',
        resourceType: 'PRIVACY_EXPORT',
        resourceId: id,
        dependentId: null,
        metadata: {},
      });
      return payload;
    });
  }
  async requestDeletion(userId: string, dto: RequestAccountDeletionDto) {
    if (dto.confirmation !== 'DELETE_MY_ACCOUNT')
      throw new BadRequestException('Confirmação de fechamento inválida.');
    const snapshot = await this.reauthenticate(userId, dto.password);
    return this.transactions.run(async (repositories) => {
      const user = await repositories.users.findById(userId);
      if (
        !user ||
        user.status !== 'ACTIVE' ||
        user.passwordHash !== snapshot.passwordHash ||
        user.credentialVersion !== snapshot.credentialVersion
      )
        throw new UnauthorizedException('Confirmação de identidade inválida.');
      const now = new Date();
      const policy = this.config.getOrThrow<RetentionDays>('PRIVACY_RETENTION_DAYS');
      const request = await repositories.privacy.createDeletionRequest({
        userId,
        retentionPolicy: policy,
        retentionNotBeforeAt:
          policy.ACCOUNT === null ? null : new Date(now.getTime() + policy.ACCOUNT * 86400000),
      });
      if (!(await repositories.users.closeAccount(userId, user.credentialVersion, now)))
        throw new UnauthorizedException('Confirmação de identidade inválida.');
      await repositories.sessions.revokeAll(userId, now);
      await repositories.accountTokens.revokeForUser(userId, 'EMAIL_VERIFICATION', now);
      await repositories.accountTokens.revokeForUser(userId, 'PASSWORD_RESET', now);
      await repositories.dependentAccess.revokeAllForUser(userId, now);
      await this.audit.record(repositories.auditLogs, {
        actorId: userId,
        action: 'ACCOUNT_DELETION_REQUESTED',
        resourceType: 'ACCOUNT_DELETION_REQUEST',
        resourceId: request.id,
        dependentId: null,
        metadata: {},
      });
      return request;
    });
  }
  private async reauthenticate(userId: string, password: string) {
    const user = await this.users.findById(userId);
    if (
      !user ||
      user.status !== 'ACTIVE' ||
      !(await this.passwords.verify(password, user.passwordHash))
    )
      throw new UnauthorizedException('Confirmação de identidade inválida.');
    return user;
  }
}
