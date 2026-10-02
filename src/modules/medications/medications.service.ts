import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuditedTreatmentField } from '../../domain/models/audit-log.model';
import type {
  TreatmentFields,
  UpdateMedicationTreatment,
} from '../../domain/models/medication.model';
import {
  UNIT_OF_WORK_REPOSITORY,
  type UnitOfWorkRepository,
} from '../../repository/unit-of-work.repository';
import type { Pagination } from '../../repository/dependent.repository';
import { DependentAuthorizationService } from '../dependents/dependent-authorization.service';
import { AuditService } from '../audit/audit.service';
import { isCivilDate } from '../../common/validation/civil-date';
import type {
  CreateMedicationTreatmentDto,
  UpdateMedicationTreatmentDto,
  MedicationProductDto,
} from './dto/medication.dto';
@Injectable()
export class MedicationsService {
  constructor(
    @Inject(UNIT_OF_WORK_REPOSITORY) private readonly transactions: UnitOfWorkRepository,
    private readonly authorization: DependentAuthorizationService,
    private readonly audit: AuditService,
  ) {}
  listProducts(userId: string, dependentId: string, pagination: Pagination) {
    return this.transactions.run(async (r) => {
      await this.authorization.requireRole(
        userId,
        dependentId,
        ['OWNER', 'EDITOR', 'VIEWER'],
        r.dependentAccess,
      );
      return r.medications.listProducts(dependentId, userId, pagination);
    });
  }
  findProduct(userId: string, dependentId: string, id: string) {
    return this.transactions.run(async (r) => {
      await this.authorization.requireRole(
        userId,
        dependentId,
        ['OWNER', 'EDITOR', 'VIEWER'],
        r.dependentAccess,
      );
      const product = await r.medications.findProduct(id, dependentId, userId);
      if (!product) throw new NotFoundException('Medicamento não encontrado.');
      return product;
    });
  }
  createProduct(userId: string, dependentId: string, dto: MedicationProductDto) {
    return this.transactions.run(async (r) => {
      await this.authorization.requireRole(
        userId,
        dependentId,
        ['OWNER', 'EDITOR'],
        r.dependentAccess,
      );
      const product = await r.medications.createProduct(dependentId, dto.name);
      await this.audit.record(r.auditLogs, {
        actorId: userId,
        action: 'MEDICATION_CREATED',
        resourceType: 'MEDICATION',
        resourceId: product.id,
        dependentId,
        metadata: {},
      });
      return product;
    });
  }
  updateProduct(userId: string, dependentId: string, id: string, dto: MedicationProductDto) {
    return this.transactions.run(async (r) => {
      await this.authorization.requireRole(
        userId,
        dependentId,
        ['OWNER', 'EDITOR'],
        r.dependentAccess,
      );
      const product = await r.medications.updateProduct(id, dependentId, userId, dto.name);
      if (!product) throw new NotFoundException('Medicamento não encontrado.');
      await this.audit.record(r.auditLogs, {
        actorId: userId,
        action: 'MEDICATION_UPDATED',
        resourceType: 'MEDICATION',
        resourceId: id,
        dependentId,
        metadata: { changedFields: ['name'] },
      });
      return product;
    });
  }
  deleteProduct(userId: string, dependentId: string, id: string) {
    return this.transactions.run(async (r) => {
      await this.authorization.requireRole(userId, dependentId, ['OWNER'], r.dependentAccess);
      if (!(await r.medications.findProduct(id, dependentId, userId)))
        throw new NotFoundException('Medicamento não encontrado.');
      if (await r.medications.hasTreatments(id, dependentId, userId))
        throw new ConflictException('Medicamento possui tratamentos não excluídos.');
      if (!(await r.medications.deleteProduct(id, dependentId, userId, new Date())))
        throw new NotFoundException('Medicamento não encontrado.');
      await this.audit.record(r.auditLogs, {
        actorId: userId,
        action: 'MEDICATION_DELETED',
        resourceType: 'MEDICATION',
        resourceId: id,
        dependentId,
        metadata: {},
      });
    });
  }
  listTreatments(userId: string, dependentId: string, pagination: Pagination) {
    return this.transactions.run(async (r) => {
      await this.authorization.requireRole(
        userId,
        dependentId,
        ['OWNER', 'EDITOR', 'VIEWER'],
        r.dependentAccess,
      );
      return r.medications.listTreatments(dependentId, userId, pagination);
    });
  }
  findTreatment(userId: string, dependentId: string, id: string) {
    return this.transactions.run(async (r) => {
      await this.authorization.requireRole(
        userId,
        dependentId,
        ['OWNER', 'EDITOR', 'VIEWER'],
        r.dependentAccess,
      );
      const row = await r.medications.findTreatment(id, dependentId, userId);
      if (!row) throw new NotFoundException('Tratamento não encontrado.');
      return row;
    });
  }
  createTreatment(userId: string, dependentId: string, dto: CreateMedicationTreatmentDto) {
    return this.transactions.run(async (r) => {
      await this.authorization.requireRole(
        userId,
        dependentId,
        ['OWNER', 'EDITOR'],
        r.dependentAccess,
      );
      if (!(await r.medications.findProduct(dto.medicationId, dependentId, userId)))
        throw new NotFoundException('Medicamento não encontrado.');
      const data: TreatmentFields = {
        dosage: dto.dosage,
        unit: dto.unit,
        frequency: dto.frequency,
        route: dto.route ?? null,
        startDate: this.toDate(dto.startDate),
        endDate: dto.endDate ? this.toDate(dto.endDate) : null,
        continuousUse: dto.continuousUse ?? false,
        status: dto.status ?? 'ACTIVE',
        instructions: dto.instructions ?? null,
        prescribedBy: dto.prescribedBy ?? null,
        reason: dto.reason ?? null,
        notes: dto.notes ?? null,
      };
      this.validatePeriod(data);
      const row = await r.medications.createTreatment({
        ...data,
        dependentId,
        medicationId: dto.medicationId,
        completedAt: data.status === 'COMPLETED' ? new Date() : null,
      });
      await this.audit.record(r.auditLogs, {
        actorId: userId,
        action: 'MEDICATION_TREATMENT_CREATED',
        resourceType: 'MEDICATION_TREATMENT',
        resourceId: row.id,
        dependentId,
        metadata: {},
      });
      return row;
    });
  }
  async updateTreatment(
    userId: string,
    dependentId: string,
    id: string,
    dto: UpdateMedicationTreatmentDto,
  ) {
    const fields = [
      'dosage',
      'unit',
      'frequency',
      'route',
      'continuousUse',
      'instructions',
      'prescribedBy',
      'reason',
      'notes',
      'status',
    ] as const;
    const changes: UpdateMedicationTreatment = {};
    for (const key of fields)
      if (dto[key] !== undefined) Object.assign(changes, { [key]: dto[key] });
    if (dto.startDate !== undefined) changes.startDate = this.toDate(dto.startDate);
    if (dto.endDate !== undefined)
      changes.endDate = dto.endDate === null ? null : this.toDate(dto.endDate);
    if (Object.keys(changes).length === 0)
      throw new BadRequestException('Informe ao menos um campo para atualizar.');
    return this.transactions.run(async (r) => {
      await this.authorization.requireRole(
        userId,
        dependentId,
        ['OWNER', 'EDITOR'],
        r.dependentAccess,
      );
      const current = await r.medications.findTreatment(id, dependentId, userId);
      if (!current) throw new NotFoundException('Tratamento não encontrado.');
      const next = { ...current, ...changes };
      if (current.status === 'COMPLETED' && next.status !== 'COMPLETED')
        throw new ConflictException(
          'Tratamento concluído não pode ser reaberto; crie um novo tratamento.',
        );
      this.validatePeriod(next);
      const changedFields = Object.keys(changes) as AuditedTreatmentField[];
      // Não mutar o closure: a UnitOfWork pode repetir esta callback.
      const writeChanges: UpdateMedicationTreatment = {
        ...changes,
        ...(current.status !== 'COMPLETED' && next.status === 'COMPLETED'
          ? { completedAt: new Date() }
          : {}),
      };
      const row = await r.medications.updateTreatment(
        id,
        dependentId,
        userId,
        ['OWNER', 'EDITOR'],
        writeChanges,
      );
      if (!row) throw new NotFoundException('Tratamento não encontrado.');
      await this.audit.record(r.auditLogs, {
        actorId: userId,
        action: 'MEDICATION_TREATMENT_UPDATED',
        resourceType: 'MEDICATION_TREATMENT',
        resourceId: id,
        dependentId,
        metadata: { changedFields },
      });
      return row;
    });
  }
  deleteTreatment(userId: string, dependentId: string, id: string) {
    return this.transactions.run(async (r) => {
      await this.authorization.requireRole(userId, dependentId, ['OWNER'], r.dependentAccess);
      if (!(await r.medications.deleteTreatment(id, dependentId, userId, new Date())))
        throw new NotFoundException('Tratamento não encontrado.');
      await this.audit.record(r.auditLogs, {
        actorId: userId,
        action: 'MEDICATION_TREATMENT_DELETED',
        resourceType: 'MEDICATION_TREATMENT',
        resourceId: id,
        dependentId,
        metadata: {},
      });
    });
  }
  private validatePeriod(data: TreatmentFields) {
    const today = new Date().toISOString().slice(0, 10);
    const valid = (date: Date) =>
      Number.isFinite(date.getTime()) &&
      date.toISOString().slice(11) === '00:00:00.000Z' &&
      date.getUTCFullYear() >= 1 &&
      date.getUTCFullYear() <= 9999;
    if (
      !valid(data.startDate) ||
      (data.endDate && !valid(data.endDate)) ||
      data.startDate.toISOString().slice(0, 10) > today ||
      (data.endDate && data.endDate < data.startDate) ||
      (data.status === 'COMPLETED' &&
        (!data.endDate || data.endDate.toISOString().slice(0, 10) > today))
    )
      throw new BadRequestException(
        'Período do tratamento inválido; conclusão exige data final não futura.',
      );
  }
  private toDate(value: string) {
    if (!isCivilDate(value)) throw new BadRequestException('Data do tratamento inválida.');
    return new Date(value + 'T00:00:00.000Z');
  }
}
