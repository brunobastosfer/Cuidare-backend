import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  AppointmentFields,
  RecommendationFields,
  UpdateAppointment,
  UpdateRecommendation,
} from '../../domain/models/appointment.model';
import type {
  AuditedAppointmentField,
  AuditedRecommendationField,
} from '../../domain/models/audit-log.model';
import {
  UNIT_OF_WORK_REPOSITORY,
  type UnitOfWorkRepository,
} from '../../repository/unit-of-work.repository';
import type { Pagination } from '../../repository/dependent.repository';
import { DependentAuthorizationService } from '../dependents/dependent-authorization.service';
import { AuditService } from '../audit/audit.service';
import { isCivilDate } from '../../common/validation/civil-date';
import { isUtcInstant } from '../../common/validation/utc-instant';
import type {
  CreateAppointmentDto,
  UpdateAppointmentDto,
  CreateRecommendationDto,
  UpdateRecommendationDto,
} from './dto/appointment.dto';
@Injectable()
export class AppointmentsService {
  constructor(
    @Inject(UNIT_OF_WORK_REPOSITORY) private readonly transactions: UnitOfWorkRepository,
    private readonly authorization: DependentAuthorizationService,
    private readonly audit: AuditService,
  ) {}
  list(userId: string, dependentId: string, pagination: Pagination) {
    return this.transactions.run(async (r) => {
      await this.authorization.requireRole(
        userId,
        dependentId,
        ['OWNER', 'EDITOR', 'VIEWER'],
        r.dependentAccess,
      );
      return r.appointments.list(dependentId, userId, pagination);
    });
  }
  find(userId: string, dependentId: string, id: string) {
    return this.transactions.run(async (r) => {
      await this.authorization.requireRole(
        userId,
        dependentId,
        ['OWNER', 'EDITOR', 'VIEWER'],
        r.dependentAccess,
      );
      const row = await r.appointments.find(id, dependentId, userId);
      if (!row) throw new NotFoundException('Consulta não encontrada.');
      return row;
    });
  }
  create(userId: string, dependentId: string, dto: CreateAppointmentDto) {
    return this.transactions.run(async (r) => {
      await this.authorization.requireRole(
        userId,
        dependentId,
        ['OWNER', 'EDITOR'],
        r.dependentAccess,
      );
      const fields: AppointmentFields = {
        date: this.instant(dto.date),
        reason: dto.reason,
        specialty: dto.specialty ?? null,
        professionalName: dto.professionalName ?? null,
        institutionName: dto.institutionName ?? null,
        notes: dto.notes ?? null,
        followUpDate: dto.followUpDate ? this.instant(dto.followUpDate) : null,
      };
      this.appointmentPeriod(fields);
      const row = await r.appointments.create({ ...fields, dependentId });
      await this.audit.record(r.auditLogs, {
        actorId: userId,
        action: 'APPOINTMENT_CREATED',
        resourceType: 'APPOINTMENT',
        resourceId: row.id,
        dependentId,
        metadata: {},
      });
      return row;
    });
  }
  async update(userId: string, dependentId: string, id: string, dto: UpdateAppointmentDto) {
    const changes: UpdateAppointment = {};
    for (const key of [
      'reason',
      'specialty',
      'professionalName',
      'institutionName',
      'notes',
    ] as const)
      if (dto[key] !== undefined) Object.assign(changes, { [key]: dto[key] });
    if (dto.date !== undefined) changes.date = this.instant(dto.date);
    if (dto.followUpDate !== undefined)
      changes.followUpDate = dto.followUpDate === null ? null : this.instant(dto.followUpDate);
    this.nonempty(changes);
    return this.transactions.run(async (r) => {
      await this.authorization.requireRole(
        userId,
        dependentId,
        ['OWNER', 'EDITOR'],
        r.dependentAccess,
      );
      const current = await r.appointments.find(id, dependentId, userId);
      if (!current) throw new NotFoundException('Consulta não encontrada.');
      this.appointmentPeriod({ ...current, ...changes });
      const row = await r.appointments.update(id, dependentId, userId, changes);
      if (!row) throw new NotFoundException('Consulta não encontrada.');
      await this.audit.record(r.auditLogs, {
        actorId: userId,
        action: 'APPOINTMENT_UPDATED',
        resourceType: 'APPOINTMENT',
        resourceId: id,
        dependentId,
        metadata: { changedFields: Object.keys(changes) as AuditedAppointmentField[] },
      });
      return row;
    });
  }
  delete(userId: string, dependentId: string, id: string) {
    return this.transactions.run(async (r) => {
      await this.authorization.requireRole(userId, dependentId, ['OWNER'], r.dependentAccess);
      if (!(await r.appointments.find(id, dependentId, userId)))
        throw new NotFoundException('Consulta não encontrada.');
      if (await r.appointments.hasRecommendations(id, dependentId, userId))
        throw new ConflictException('Consulta possui recomendações não excluídas.');
      if (!(await r.appointments.delete(id, dependentId, userId, new Date())))
        throw new NotFoundException('Consulta não encontrada.');
      await this.audit.record(r.auditLogs, {
        actorId: userId,
        action: 'APPOINTMENT_DELETED',
        resourceType: 'APPOINTMENT',
        resourceId: id,
        dependentId,
        metadata: {},
      });
    });
  }
  listRecommendations(
    userId: string,
    dependentId: string,
    appointmentId: string,
    pagination: Pagination,
  ) {
    return this.transactions.run(async (r) => {
      await this.authorization.requireRole(
        userId,
        dependentId,
        ['OWNER', 'EDITOR', 'VIEWER'],
        r.dependentAccess,
      );
      if (!(await r.appointments.find(appointmentId, dependentId, userId)))
        throw new NotFoundException('Consulta não encontrada.');
      return r.appointments.listRecommendations(appointmentId, dependentId, userId, pagination);
    });
  }
  findRecommendation(userId: string, dependentId: string, appointmentId: string, id: string) {
    return this.transactions.run(async (r) => {
      await this.authorization.requireRole(
        userId,
        dependentId,
        ['OWNER', 'EDITOR', 'VIEWER'],
        r.dependentAccess,
      );
      const row = await r.appointments.findRecommendation(id, appointmentId, dependentId, userId);
      if (!row) throw new NotFoundException('Recomendação não encontrada.');
      return row;
    });
  }
  createRecommendation(
    userId: string,
    dependentId: string,
    appointmentId: string,
    dto: CreateRecommendationDto,
  ) {
    return this.transactions.run(async (r) => {
      await this.authorization.requireRole(
        userId,
        dependentId,
        ['OWNER', 'EDITOR'],
        r.dependentAccess,
      );
      if (!(await r.appointments.find(appointmentId, dependentId, userId)))
        throw new NotFoundException('Consulta não encontrada.');
      const fields: RecommendationFields = {
        title: dto.title,
        description: dto.description,
        status: dto.status ?? 'PENDING',
        startDate: this.civil(dto.startDate),
        endDate: dto.endDate ? this.civil(dto.endDate) : null,
      };
      this.recommendationPeriod(fields);
      const row = await r.appointments.createRecommendation({
        ...fields,
        dependentId,
        appointmentId,
        completedAt: fields.status === 'COMPLETED' ? new Date() : null,
      });
      await this.audit.record(r.auditLogs, {
        actorId: userId,
        action: 'MEDICAL_RECOMMENDATION_CREATED',
        resourceType: 'MEDICAL_RECOMMENDATION',
        resourceId: row.id,
        dependentId,
        metadata: {},
      });
      return row;
    });
  }
  async updateRecommendation(
    userId: string,
    dependentId: string,
    appointmentId: string,
    id: string,
    dto: UpdateRecommendationDto,
  ) {
    const changes: UpdateRecommendation = {};
    for (const key of ['title', 'description', 'status'] as const)
      if (dto[key] !== undefined) Object.assign(changes, { [key]: dto[key] });
    if (dto.startDate !== undefined) changes.startDate = this.civil(dto.startDate);
    if (dto.endDate !== undefined)
      changes.endDate = dto.endDate === null ? null : this.civil(dto.endDate);
    this.nonempty(changes);
    return this.transactions.run(async (r) => {
      await this.authorization.requireRole(
        userId,
        dependentId,
        ['OWNER', 'EDITOR'],
        r.dependentAccess,
      );
      const current = await r.appointments.findRecommendation(
        id,
        appointmentId,
        dependentId,
        userId,
      );
      if (!current) throw new NotFoundException('Recomendação não encontrada.');
      const next = { ...current, ...changes };
      if (['COMPLETED', 'CANCELLED'].includes(current.status) && next.status !== current.status)
        throw new ConflictException(
          'Recomendação finalizada não pode mudar de estado; crie um novo registro.',
        );
      this.recommendationPeriod(next);
      // Callback pode repetir: campos técnicos não mutam o payload capturado/auditado.
      const data = {
        ...changes,
        ...(current.status !== 'COMPLETED' && next.status === 'COMPLETED'
          ? { completedAt: new Date() }
          : {}),
      };
      const row = await r.appointments.updateRecommendation(
        id,
        appointmentId,
        dependentId,
        userId,
        data,
      );
      if (!row) throw new NotFoundException('Recomendação não encontrada.');
      await this.audit.record(r.auditLogs, {
        actorId: userId,
        action: 'MEDICAL_RECOMMENDATION_UPDATED',
        resourceType: 'MEDICAL_RECOMMENDATION',
        resourceId: id,
        dependentId,
        metadata: { changedFields: Object.keys(changes) as AuditedRecommendationField[] },
      });
      return row;
    });
  }
  deleteRecommendation(userId: string, dependentId: string, appointmentId: string, id: string) {
    return this.transactions.run(async (r) => {
      await this.authorization.requireRole(userId, dependentId, ['OWNER'], r.dependentAccess);
      if (
        !(await r.appointments.deleteRecommendation(
          id,
          appointmentId,
          dependentId,
          userId,
          new Date(),
        ))
      )
        throw new NotFoundException('Recomendação não encontrada.');
      await this.audit.record(r.auditLogs, {
        actorId: userId,
        action: 'MEDICAL_RECOMMENDATION_DELETED',
        resourceType: 'MEDICAL_RECOMMENDATION',
        resourceId: id,
        dependentId,
        metadata: {},
      });
    });
  }
  private appointmentPeriod(fields: AppointmentFields) {
    if (fields.followUpDate && fields.followUpDate < fields.date)
      throw new BadRequestException('Retorno não pode anteceder a consulta.');
  }
  private recommendationPeriod(fields: RecommendationFields) {
    if (fields.endDate && fields.endDate < fields.startDate)
      throw new BadRequestException('Fim não pode anteceder o início.');
  }
  private nonempty(changes: object) {
    if (!Object.keys(changes).length)
      throw new BadRequestException('Informe ao menos um campo para atualizar.');
  }
  private instant(value: string) {
    if (!isUtcInstant(value)) throw new BadRequestException('Data da consulta inválida.');
    return new Date(value);
  }
  private civil(value: string) {
    if (!isCivilDate(value)) throw new BadRequestException('Data da recomendação inválida.');
    return new Date(value + 'T00:00:00.000Z');
  }
}
