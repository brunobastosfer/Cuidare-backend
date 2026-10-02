import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  UNIT_OF_WORK_REPOSITORY,
  type UnitOfWorkRepository,
  type TransactionRepositories,
} from '../../repository/unit-of-work.repository';
import type { Pagination } from '../../repository/dependent.repository';
import type {
  EnrollmentFields,
  UpdateEnrollment,
  UpdateReport,
} from '../../domain/models/education.model';
import type {
  AuditedEnrollmentField,
  AuditedReportField,
} from '../../domain/models/audit-log.model';
import { isCivilDate } from '../../common/validation/civil-date';
import { DependentAuthorizationService } from '../dependents/dependent-authorization.service';
import { AuditService } from '../audit/audit.service';
import type {
  CreateEnrollmentDto,
  UpdateEnrollmentDto,
  CreateReportDto,
  UpdateReportDto,
} from './dto/education.dto';
@Injectable()
export class EducationService {
  constructor(
    @Inject(UNIT_OF_WORK_REPOSITORY) private readonly transactions: UnitOfWorkRepository,
    private readonly authorization: DependentAuthorizationService,
    private readonly audit: AuditService,
  ) {}
  listEnrollments(userId: string, dependentId: string, pagination: Pagination) {
    return this.transactions.run(async (r) => {
      await this.read(r, userId, dependentId);
      return r.education.listEnrollments(dependentId, userId, pagination);
    });
  }
  findEnrollment(userId: string, dependentId: string, id: string) {
    return this.transactions.run(async (r) => {
      await this.read(r, userId, dependentId);
      const row = await r.education.findEnrollment(id, dependentId, userId);
      if (!row) throw new NotFoundException('Matrícula não encontrada.');
      return row;
    });
  }
  createEnrollment(userId: string, dependentId: string, dto: CreateEnrollmentDto) {
    return this.transactions.run(async (r) => {
      const dependent = await this.write(r, userId, dependentId);
      const fields: EnrollmentFields = {
        schoolName: dto.schoolName,
        schoolYear: dto.schoolYear,
        grade: dto.grade ?? null,
        className: dto.className ?? null,
        startDate: this.civil(dto.startDate),
        endDate: dto.endDate ? this.civil(dto.endDate) : null,
      };
      this.enrollmentPeriod(fields, dependent.birthDate);
      const row = await r.education.createEnrollment({
        ...fields,
        dependentId,
        createdByUserId: userId,
      });
      await this.audit.record(r.auditLogs, {
        actorId: userId,
        dependentId,
        action: 'SCHOOL_ENROLLMENT_CREATED',
        resourceType: 'SCHOOL_ENROLLMENT',
        resourceId: row.id,
        metadata: {},
      });
      return row;
    });
  }
  async updateEnrollment(
    userId: string,
    dependentId: string,
    id: string,
    dto: UpdateEnrollmentDto,
  ) {
    const changes: UpdateEnrollment = {};
    for (const key of ['schoolName', 'schoolYear', 'grade', 'className'] as const)
      if (dto[key] !== undefined) Object.assign(changes, { [key]: dto[key] });
    if (dto.startDate !== undefined) changes.startDate = this.civil(dto.startDate);
    if (dto.endDate !== undefined)
      changes.endDate = dto.endDate === null ? null : this.civil(dto.endDate);
    this.nonempty(changes);
    return this.transactions.run(async (r) => {
      const dependent = await this.write(r, userId, dependentId),
        current = await r.education.findEnrollment(id, dependentId, userId);
      if (!current) throw new NotFoundException('Matrícula não encontrada.');
      this.enrollmentPeriod({ ...current, ...changes }, dependent.birthDate);
      const row = await r.education.updateEnrollment(id, dependentId, userId, changes);
      if (!row) throw new NotFoundException('Matrícula não encontrada.');
      await this.audit.record(r.auditLogs, {
        actorId: userId,
        dependentId,
        action: 'SCHOOL_ENROLLMENT_UPDATED',
        resourceType: 'SCHOOL_ENROLLMENT',
        resourceId: id,
        metadata: { changedFields: Object.keys(changes) as AuditedEnrollmentField[] },
      });
      return row;
    });
  }
  deleteEnrollment(userId: string, dependentId: string, id: string) {
    return this.transactions.run(async (r) => {
      await this.authorization.requireRole(userId, dependentId, ['OWNER'], r.dependentAccess);
      if (!(await r.education.deleteEnrollment(id, dependentId, userId, new Date())))
        throw new NotFoundException('Matrícula não encontrada.');
      await this.audit.record(r.auditLogs, {
        actorId: userId,
        dependentId,
        action: 'SCHOOL_ENROLLMENT_DELETED',
        resourceType: 'SCHOOL_ENROLLMENT',
        resourceId: id,
        metadata: {},
      });
    });
  }
  listReports(userId: string, dependentId: string, pagination: Pagination) {
    return this.transactions.run(async (r) => {
      await this.read(r, userId, dependentId);
      return r.education.listReports(dependentId, userId, pagination);
    });
  }
  findReport(userId: string, dependentId: string, id: string) {
    return this.transactions.run(async (r) => {
      await this.read(r, userId, dependentId);
      const row = await r.education.findReport(id, dependentId, userId);
      if (!row) throw new NotFoundException('Relatório não encontrado.');
      return row;
    });
  }
  createReport(userId: string, dependentId: string, dto: CreateReportDto) {
    return this.transactions.run(async (r) => {
      const dependent = await this.write(r, userId, dependentId),
        reportDate = this.civil(dto.reportDate);
      this.reportDate(reportDate, dependent.birthDate);
      await this.links(r, userId, dependentId, dto.enrollmentId ?? null, dto.documentId ?? null);
      const row = await r.education.createReport({
        dependentId,
        createdByUserId: userId,
        enrollmentId: dto.enrollmentId ?? null,
        title: dto.title,
        reportDate,
        summary: dto.summary ?? null,
        observations: dto.observations ?? null,
        documentId: dto.documentId ?? null,
      });
      await this.audit.record(r.auditLogs, {
        actorId: userId,
        dependentId,
        action: 'SCHOOL_REPORT_CREATED',
        resourceType: 'SCHOOL_REPORT',
        resourceId: row.id,
        metadata: {},
      });
      return row;
    });
  }
  async updateReport(userId: string, dependentId: string, id: string, dto: UpdateReportDto) {
    const changes: UpdateReport = {};
    for (const key of ['enrollmentId', 'title', 'summary', 'observations', 'documentId'] as const)
      if (dto[key] !== undefined) Object.assign(changes, { [key]: dto[key] });
    if (dto.reportDate !== undefined) changes.reportDate = this.civil(dto.reportDate);
    this.nonempty(changes);
    return this.transactions.run(async (r) => {
      const dependent = await this.write(r, userId, dependentId),
        current = await r.education.findReport(id, dependentId, userId);
      if (!current) throw new NotFoundException('Relatório não encontrado.');
      this.reportDate(changes.reportDate ?? current.reportDate, dependent.birthDate);
      // Vínculos antigos excluídos não ressuscitam, nem impedem correção textual.
      await this.links(r, userId, dependentId, dto.enrollmentId, dto.documentId);
      const row = await r.education.updateReport(id, dependentId, userId, changes);
      if (!row) throw new NotFoundException('Relatório não encontrado.');
      await this.audit.record(r.auditLogs, {
        actorId: userId,
        dependentId,
        action: 'SCHOOL_REPORT_UPDATED',
        resourceType: 'SCHOOL_REPORT',
        resourceId: id,
        metadata: { changedFields: Object.keys(changes) as AuditedReportField[] },
      });
      return row;
    });
  }
  deleteReport(userId: string, dependentId: string, id: string) {
    return this.transactions.run(async (r) => {
      await this.authorization.requireRole(userId, dependentId, ['OWNER'], r.dependentAccess);
      if (!(await r.education.deleteReport(id, dependentId, userId, new Date())))
        throw new NotFoundException('Relatório não encontrado.');
      await this.audit.record(r.auditLogs, {
        actorId: userId,
        dependentId,
        action: 'SCHOOL_REPORT_DELETED',
        resourceType: 'SCHOOL_REPORT',
        resourceId: id,
        metadata: {},
      });
    });
  }
  private read(r: TransactionRepositories, userId: string, dependentId: string) {
    return this.authorization.requireRole(
      userId,
      dependentId,
      ['OWNER', 'EDITOR', 'VIEWER'],
      r.dependentAccess,
    );
  }
  private async write(r: TransactionRepositories, userId: string, dependentId: string) {
    await this.authorization.requireRole(
      userId,
      dependentId,
      ['OWNER', 'EDITOR'],
      r.dependentAccess,
    );
    const dependent = await r.dependents.findForUser(dependentId, userId);
    if (!dependent) throw new NotFoundException('Dependente não encontrado.');
    return dependent;
  }
  private async links(
    r: TransactionRepositories,
    userId: string,
    dependentId: string,
    enrollmentId?: string | null,
    documentId?: string | null,
  ) {
    if (enrollmentId && !(await r.education.findEnrollment(enrollmentId, dependentId, userId)))
      throw new NotFoundException('Matrícula não encontrada.');
    if (documentId && !(await r.documents.find(documentId, dependentId, userId)))
      throw new NotFoundException('Documento não encontrado.');
  }
  private enrollmentPeriod(fields: EnrollmentFields, birthDate: Date) {
    if (!Number.isInteger(fields.schoolYear) || fields.schoolYear < 1 || fields.schoolYear > 9999)
      throw new BadRequestException('Ano escolar inválido.');
    if (fields.startDate < birthDate || (fields.endDate && fields.endDate < fields.startDate))
      throw new BadRequestException('Período escolar inválido.');
  }
  private reportDate(date: Date, birthDate: Date) {
    if (date < birthDate || date.toISOString().slice(0, 10) > new Date().toISOString().slice(0, 10))
      throw new BadRequestException('Data do relatório anterior ao nascimento ou futura.');
  }
  private nonempty(changes: object) {
    if (!Object.keys(changes).length)
      throw new BadRequestException('Informe ao menos um campo para atualizar.');
  }
  private civil(value: string) {
    if (!isCivilDate(value)) throw new BadRequestException('Data escolar inválida.');
    return new Date(value + 'T00:00:00.000Z');
  }
}
