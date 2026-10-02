import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  UNIT_OF_WORK_REPOSITORY,
  type UnitOfWorkRepository,
  type TransactionRepositories,
} from '../../repository/unit-of-work.repository';
import type { Pagination } from '../../repository/dependent.repository';
import type {
  UpdateVaccination,
  VaccineReference,
  VaccineScheduleType,
} from '../../domain/models/vaccination.model';
import type { AuditedVaccinationField } from '../../domain/models/audit-log.model';
import { evaluateVaccinationSchedule, referenceApplies } from '../../domain/vaccination-schedule';
import { isCivilDate } from '../../common/validation/civil-date';
import { DependentAuthorizationService } from '../dependents/dependent-authorization.service';
import { AuditService } from '../audit/audit.service';
import type {
  CreateVaccinationDto,
  UpdateVaccinationDto,
  VaccinationScheduleStatusDto,
} from './dto/vaccination.dto';
@Injectable()
export class VaccinationsService {
  constructor(
    @Inject(UNIT_OF_WORK_REPOSITORY) private readonly transactions: UnitOfWorkRepository,
    private readonly authorization: DependentAuthorizationService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}
  listCatalog(pagination: Pagination) {
    return this.transactions.run((r) => r.vaccinations.listCatalog(pagination));
  }
  findCatalog(id: string) {
    return this.transactions.run(async (r) => {
      const row = await r.vaccinations.findCatalog(id);
      if (!row) throw new NotFoundException('Referência não encontrada.');
      return row;
    });
  }
  listSchedules(pagination: Pagination, type?: VaccineScheduleType) {
    return this.transactions.run((r) => r.vaccinations.listSchedules(pagination, type));
  }
  findSchedule(id: string) {
    return this.transactions.run(async (r) => {
      const row = await r.vaccinations.findSchedule(id);
      if (!row) throw new NotFoundException('Referência não encontrada.');
      return row;
    });
  }
  listScheduleDoses(id: string, pagination: Pagination) {
    return this.transactions.run(async (r) => {
      const schedule = await r.vaccinations.findSchedule(id);
      if (!schedule) throw new NotFoundException('Referência não encontrada.');
      const items = await r.vaccinations.listScheduleDoses(id, pagination);
      if (items.some((rule) => !this.ready(rule.vaccine)))
        throw new BadRequestException('Referências do calendário indisponíveis.');
      return { schedule, items };
    });
  }
  list(userId: string, dependentId: string, pagination: Pagination) {
    return this.transactions.run(async (r) => {
      await this.requireRead(r, userId, dependentId);
      return r.vaccinations.list(dependentId, userId, pagination);
    });
  }
  find(userId: string, dependentId: string, id: string) {
    return this.transactions.run(async (r) => {
      await this.requireRead(r, userId, dependentId);
      const row = await r.vaccinations.find(id, dependentId, userId);
      if (!row) throw new NotFoundException('Registro não encontrado.');
      return row;
    });
  }
  create(userId: string, dependentId: string, dto: CreateVaccinationDto) {
    return this.transactions.run(async (r) => {
      await this.authorization.requireRole(
        userId,
        dependentId,
        ['OWNER', 'EDITOR'],
        r.dependentAccess,
      );
      const dependent = await r.dependents.findForUser(dependentId, userId);
      if (!dependent) throw new NotFoundException('Dependente não encontrado.');
      const vaccine = await r.vaccinations.findCatalog(dto.vaccineId);
      if (!vaccine) throw new NotFoundException('Referência não encontrada.');
      const administeredAt = this.civil(dto.administeredAt);
      this.validateDate(administeredAt, dependent.birthDate);
      if (!referenceApplies(vaccine, administeredAt))
        throw new BadRequestException('Referência fora de vigência na data informada.');
      await this.requireDocument(r, userId, dependentId, dto.documentId ?? null);
      const row = await r.vaccinations.create({
        dependentId,
        vaccineId: vaccine.id,
        createdByUserId: userId,
        dose: dto.dose,
        administeredAt,
        institutionName: dto.institutionName ?? null,
        batchNumber: dto.batchNumber ?? null,
        notes: dto.notes ?? null,
        documentId: dto.documentId ?? null,
      });
      await this.audit.record(r.auditLogs, {
        actorId: userId,
        dependentId,
        action: 'VACCINATION_CREATED',
        resourceType: 'DEPENDENT_VACCINATION',
        resourceId: row.id,
        metadata: {},
      });
      return row;
    });
  }
  async update(userId: string, dependentId: string, id: string, dto: UpdateVaccinationDto) {
    const changes: UpdateVaccination = {};
    for (const key of ['dose', 'institutionName', 'batchNumber', 'notes', 'documentId'] as const)
      if (dto[key] !== undefined) Object.assign(changes, { [key]: dto[key] });
    if (dto.administeredAt !== undefined) changes.administeredAt = this.civil(dto.administeredAt);
    if (!Object.keys(changes).length)
      throw new BadRequestException('Informe ao menos um campo para atualizar.');
    return this.transactions.run(async (r) => {
      await this.authorization.requireRole(
        userId,
        dependentId,
        ['OWNER', 'EDITOR'],
        r.dependentAccess,
      );
      const current = await r.vaccinations.find(id, dependentId, userId),
        dependent = await r.dependents.findForUser(dependentId, userId);
      if (!current || !dependent) throw new NotFoundException('Registro não encontrado.');
      const next = { ...current, ...changes };
      this.validateDate(next.administeredAt, dependent.birthDate);
      if (!referenceApplies(current.vaccine, next.administeredAt))
        throw new BadRequestException('Referência fora de vigência na data informada.');
      if (dto.documentId !== undefined)
        await this.requireDocument(r, userId, dependentId, dto.documentId);
      const row = await r.vaccinations.update(id, dependentId, userId, changes);
      if (!row) throw new NotFoundException('Registro não encontrado.');
      await this.audit.record(r.auditLogs, {
        actorId: userId,
        dependentId,
        action: 'VACCINATION_UPDATED',
        resourceType: 'DEPENDENT_VACCINATION',
        resourceId: id,
        metadata: { changedFields: Object.keys(changes) as AuditedVaccinationField[] },
      });
      return row;
    });
  }
  delete(userId: string, dependentId: string, id: string) {
    return this.transactions.run(async (r) => {
      await this.authorization.requireRole(userId, dependentId, ['OWNER'], r.dependentAccess);
      if (!(await r.vaccinations.delete(id, dependentId, userId, new Date())))
        throw new NotFoundException('Registro não encontrado.');
      await this.audit.record(r.auditLogs, {
        actorId: userId,
        dependentId,
        action: 'VACCINATION_DELETED',
        resourceType: 'DEPENDENT_VACCINATION',
        resourceId: id,
        metadata: {},
      });
    });
  }
  async scheduleStatus(userId: string, dependentId: string, dto: VaccinationScheduleStatusDto) {
    const asOf = this.civil(dto.asOf ?? new Date().toISOString().slice(0, 10));
    return this.transactions.run(async (r) => {
      await this.requireRead(r, userId, dependentId);
      const dependent = await r.dependents.findForUser(dependentId, userId);
      if (!dependent) throw new NotFoundException('Dependente não encontrado.');
      this.validateDate(asOf, dependent.birthDate);
      const schedule = await r.vaccinations.findSchedule(dto.scheduleId);
      if (!schedule) throw new NotFoundException('Referência não encontrada.');
      if (!referenceApplies(schedule, asOf))
        throw new BadRequestException('Calendário fora de vigência na data informada.');
      const max = this.config.getOrThrow<number>('VACCINATION_STATUS_MAX_ITEMS');
      const rules = await r.vaccinations.listScheduleDoses(schedule.id, {
        limit: max + 1,
        offset: 0,
      });
      const records = await r.vaccinations.list(dependentId, userId, { limit: max + 1, offset: 0 });
      if (rules.length > max || records.length > max)
        throw new PayloadTooLargeException('Comparação excede o limite disponível.');
      if (!rules.length || rules.some((rule) => !this.ready(rule.vaccine)))
        throw new BadRequestException('Referências do calendário indisponíveis.');
      if (schedule.ruleModel !== 'BIRTH_AGE_FIXED_V1')
        throw new BadRequestException('Modelo de calendário não suportado.');
      try {
        return {
          schedule,
          asOf,
          items: evaluateVaccinationSchedule(dependent.birthDate, asOf, rules, records),
        };
      } catch {
        throw new BadRequestException('Regra temporal não suportada.');
      }
    });
  }
  private requireRead(r: TransactionRepositories, userId: string, dependentId: string) {
    return this.authorization.requireRole(
      userId,
      dependentId,
      ['OWNER', 'EDITOR', 'VIEWER'],
      r.dependentAccess,
    );
  }
  private async requireDocument(
    r: TransactionRepositories,
    userId: string,
    dependentId: string,
    id: string | null,
  ) {
    if (id && !(await r.documents.find(id, dependentId, userId)))
      throw new NotFoundException('Documento não encontrado.');
  }
  private ready(reference: VaccineReference) {
    return (
      !reference.deletedAt && reference.reviewedAt !== null && reference.reviewedAt <= new Date()
    );
  }
  private civil(value: string) {
    if (!isCivilDate(value)) throw new BadRequestException('Data inválida.');
    return new Date(value + 'T00:00:00.000Z');
  }
  private validateDate(date: Date, birthDate: Date) {
    if (date < birthDate || date.toISOString().slice(0, 10) > new Date().toISOString().slice(0, 10))
      throw new BadRequestException('Data anterior ao nascimento ou futura.');
  }
}
