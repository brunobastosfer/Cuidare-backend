import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { AuditedDependentField } from '../../domain/models/audit-log.model';
import type { UpdateDependent } from '../../domain/models/dependent.model';
import {
  DEPENDENT_REPOSITORY,
  type DependentRepository,
  type Pagination,
} from '../../repository/dependent.repository';
import {
  UNIT_OF_WORK_REPOSITORY,
  type UnitOfWorkRepository,
} from '../../repository/unit-of-work.repository';
import { AuditService } from '../audit/audit.service';
import { DependentAuthorizationService } from './dependent-authorization.service';
import type { CreateDependentDto } from './dto/create-dependent.dto';
import type { UpdateDependentDto } from './dto/update-dependent.dto';

@Injectable()
export class DependentsService {
  constructor(
    @Inject(DEPENDENT_REPOSITORY) private readonly dependents: DependentRepository,
    @Inject(UNIT_OF_WORK_REPOSITORY) private readonly transactions: UnitOfWorkRepository,
    private readonly authorization: DependentAuthorizationService,
    private readonly audit: AuditService,
  ) {}
  list(userId: string, pagination: Pagination) {
    return this.dependents.listForUser(userId, pagination);
  }
  async find(id: string, userId: string) {
    const dependent = await this.dependents.findForUser(id, userId);
    if (!dependent) throw new NotFoundException('Dependente não encontrado.');
    return dependent;
  }
  create(userId: string, dto: CreateDependentDto) {
    return this.transactions.run(async (repositories) => {
      const actor = await repositories.users.findById(userId);
      if (!actor || actor.status !== 'ACTIVE')
        throw new UnauthorizedException('Autenticação necessária.');
      const dependent = await repositories.dependents.create({
        fullName: dto.fullName,
        preferredName: dto.preferredName ?? null,
        birthDate: new Date(dto.birthDate + 'T00:00:00.000Z'),
        createdByUserId: userId,
      });
      await repositories.dependentAccess.create({
        userId,
        dependentId: dependent.id,
        role: 'OWNER',
        relationship: dto.relationship ?? null,
      });
      await this.audit.record(repositories.auditLogs, {
        actorId: userId,
        action: 'DEPENDENT_CREATED',
        resourceType: 'DEPENDENT',
        resourceId: dependent.id,
        dependentId: dependent.id,
        metadata: {},
      });
      return dependent;
    });
  }
  async update(id: string, userId: string, dto: UpdateDependentDto) {
    const changes: UpdateDependent = {
      ...(dto.fullName !== undefined ? { fullName: dto.fullName } : {}),
      ...(dto.preferredName !== undefined ? { preferredName: dto.preferredName } : {}),
      ...(dto.birthDate !== undefined
        ? { birthDate: new Date(dto.birthDate + 'T00:00:00.000Z') }
        : {}),
    };
    if (Object.keys(changes).length === 0)
      throw new BadRequestException('Informe ao menos um campo para atualizar.');
    return this.transactions.run(async (repositories) => {
      await this.authorization.requireRole(
        userId,
        id,
        ['OWNER', 'EDITOR'],
        repositories.dependentAccess,
      );
      const dependent = await repositories.dependents.updateForUser(
        id,
        userId,
        ['OWNER', 'EDITOR'],
        changes,
      );
      if (!dependent) throw new NotFoundException('Dependente não encontrado.');
      await this.audit.record(repositories.auditLogs, {
        actorId: userId,
        action: 'DEPENDENT_UPDATED',
        resourceType: 'DEPENDENT',
        resourceId: id,
        dependentId: id,
        metadata: { changedFields: Object.keys(changes) as AuditedDependentField[] },
      });
      return dependent;
    });
  }
  async remove(id: string, userId: string) {
    await this.transactions.run(async (repositories) => {
      await this.authorization.requireRole(userId, id, ['OWNER'], repositories.dependentAccess);
      if (!(await repositories.dependents.softDeleteForUser(id, userId)))
        throw new NotFoundException('Dependente não encontrado.');
      await this.audit.record(repositories.auditLogs, {
        actorId: userId,
        action: 'DEPENDENT_DELETED',
        resourceType: 'DEPENDENT',
        resourceId: id,
        dependentId: id,
        metadata: {},
      });
    });
  }
}
