import {
  BadRequestException,
  Inject,
  Injectable,
  UnauthorizedException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ConsentPolicies } from '../../config/consent-policies';
import { CONSENT_REPOSITORY, type ConsentRepository } from '../../repository/consent.repository';
import type { Pagination } from '../../repository/dependent.repository';
import {
  UNIT_OF_WORK_REPOSITORY,
  type UnitOfWorkRepository,
} from '../../repository/unit-of-work.repository';
import { AuditService } from '../audit/audit.service';
import { DependentAuthorizationService } from '../dependents/dependent-authorization.service';
import type { AcceptConsentDto } from './dto/accept-consent.dto';
@Injectable()
export class ConsentsService {
  constructor(
    @Inject(CONSENT_REPOSITORY) private readonly consents: ConsentRepository,
    @Inject(UNIT_OF_WORK_REPOSITORY) private readonly transactions: UnitOfWorkRepository,
    private readonly config: ConfigService,
    private readonly authorization: DependentAuthorizationService,
    private readonly audit: AuditService,
  ) {}
  list(userId: string, pagination: Pagination) {
    return this.consents.listForUser(userId, pagination);
  }
  async accept(userId: string, dto: AcceptConsentDto) {
    const policies = this.config.getOrThrow<ConsentPolicies>('CONSENT_POLICIES');
    const policy = Object.hasOwn(policies, dto.type) ? policies[dto.type] : undefined;
    if (
      !policy ||
      policy.version !== dto.policyVersion ||
      (policy.scope === 'DEPENDENT') !== (dto.dependentId !== undefined)
    ) {
      throw new BadRequestException(
        'Política de consentimento não disponível para este escopo ou versão.',
      );
    }
    return this.transactions.run(async (repositories) => {
      const actor = await repositories.users.findById(userId);
      if (!actor || actor.status !== 'ACTIVE')
        throw new UnauthorizedException('Autenticação necessária.');
      if (dto.dependentId !== undefined) {
        await this.authorization.requireRole(
          userId,
          dto.dependentId,
          ['OWNER'],
          repositories.dependentAccess,
        );
      }
      const consent = await repositories.consents.create({
        userId,
        dependentId: dto.dependentId ?? null,
        type: dto.type,
        policyVersion: dto.policyVersion,
        consentBased: policy.consentBased ?? false,
      });
      await this.audit.record(repositories.auditLogs, {
        actorId: userId,
        action: 'CONSENT_ACCEPTED',
        resourceType: 'CONSENT',
        resourceId: consent.id,
        dependentId: consent.dependentId,
        metadata: {},
      });
      return consent;
    });
  }
  hasActive(
    userId: string,
    type: string,
    policyVersion: string,
    dependentId: string | null = null,
  ) {
    return this.consents.hasActive(userId, type, policyVersion, dependentId);
  }
  revoke(userId: string, id: string) {
    return this.transactions.run(async (repositories) => {
      const consent = await repositories.consents.findOwned(id, userId);
      if (!consent) throw new NotFoundException('Consentimento não encontrado.');
      if (!consent.consentBased)
        throw new ConflictException(
          'Registro não habilitado como tratamento baseado em consentimento.',
        );
      const count = await repositories.consents.revokeScope(
        userId,
        consent.type,
        consent.dependentId,
        new Date(),
      );
      if (count)
        await this.audit.record(repositories.auditLogs, {
          actorId: userId,
          action: 'CONSENT_REVOKED',
          resourceType: 'CONSENT',
          resourceId: consent.id,
          dependentId: consent.dependentId,
          metadata: {},
        });
      const updated = await repositories.consents.findOwned(id, userId);
      if (!updated) throw new NotFoundException('Consentimento não encontrado.');
      return updated;
    });
  }
}
