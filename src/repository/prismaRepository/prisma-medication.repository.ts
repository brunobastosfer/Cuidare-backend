import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  medicationEventPrefix,
  type CreateMedicationTreatment,
  type UpdateMedicationTreatment,
  type MedicationTimelineType,
} from '../../domain/models/medication.model';
import type { DependentAccessRole } from '../../domain/models/dependent.model';
import type { MedicationRepository } from '../medication.repository';
import type { Pagination } from '../dependent.repository';
import type { TimelineSourceQuery } from '../timeline-source.repository';
import { dependentScope } from './dependent-scope';
import { prismaOperation } from './prisma-operation';
import { civilEventTimelineWhere } from './civil-event-timeline-where';

export function productScope(
  dependentId: string,
  userId: string,
  roles?: DependentAccessRole[],
): Prisma.MedicationWhereInput {
  return { dependentId, deletedAt: null, dependent: dependentScope(userId, roles) };
}
export function treatmentScope(
  dependentId: string,
  userId: string,
  roles?: DependentAccessRole[],
): Prisma.MedicationTreatmentWhereInput {
  return {
    dependentId,
    deletedAt: null,
    dependent: dependentScope(userId, roles),
    medication: { dependentId, deletedAt: null },
  };
}
export function civilTimelineWhere(
  query: TimelineSourceQuery,
  type: MedicationTimelineType,
): Prisma.MedicationTreatmentWhereInput[] {
  return civilEventTimelineWhere(
    query,
    type === 'MEDICATION_STARTED' ? 'startDate' : 'endDate',
    medicationEventPrefix(type),
  );
}
function treatmentData(
  data: UpdateMedicationTreatment,
): Prisma.MedicationTreatmentUpdateManyMutationInput {
  return {
    ...(data.dosage !== undefined ? { dosage: data.dosage } : {}),
    ...(data.unit !== undefined ? { unit: data.unit } : {}),
    ...(data.frequency !== undefined ? { frequency: data.frequency } : {}),
    ...(data.route !== undefined ? { route: data.route } : {}),
    ...(data.startDate !== undefined ? { startDate: data.startDate } : {}),
    ...(data.endDate !== undefined ? { endDate: data.endDate } : {}),
    ...(data.continuousUse !== undefined ? { continuousUse: data.continuousUse } : {}),
    ...(data.instructions !== undefined ? { instructions: data.instructions } : {}),
    ...(data.prescribedBy !== undefined ? { prescribedBy: data.prescribedBy } : {}),
    ...(data.reason !== undefined ? { reason: data.reason } : {}),
    ...(data.notes !== undefined ? { notes: data.notes } : {}),
    ...(data.status !== undefined ? { status: data.status } : {}),
    ...(data.completedAt !== undefined ? { completedAt: data.completedAt } : {}),
  };
}
@Injectable()
export class PrismaMedicationRepository implements MedicationRepository {
  constructor(@Inject(PrismaService) private readonly prisma: Prisma.TransactionClient) {}
  listProducts(dependentId: string, userId: string, { limit, offset }: Pagination) {
    return prismaOperation(() =>
      this.prisma.medication.findMany({
        where: productScope(dependentId, userId),
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: limit,
        skip: offset,
      }),
    );
  }
  findProduct(id: string, dependentId: string, userId: string) {
    return prismaOperation(() =>
      this.prisma.medication.findFirst({ where: { id, ...productScope(dependentId, userId) } }),
    );
  }
  createProduct(dependentId: string, name: string) {
    return prismaOperation(() => this.prisma.medication.create({ data: { dependentId, name } }));
  }
  async updateProduct(id: string, dependentId: string, userId: string, name: string) {
    const rows = await prismaOperation(() =>
      this.prisma.medication.updateManyAndReturn({
        where: { id, ...productScope(dependentId, userId, ['OWNER', 'EDITOR']) },
        data: { name },
      }),
    );
    return rows[0] ?? null;
  }
  async hasTreatments(medicationId: string, dependentId: string, userId: string) {
    return (
      (await prismaOperation(() =>
        this.prisma.medicationTreatment.findFirst({
          where: { medicationId, ...treatmentScope(dependentId, userId) },
          select: { id: true },
        }),
      )) !== null
    );
  }
  async deleteProduct(id: string, dependentId: string, userId: string, now: Date) {
    const result = await prismaOperation(() =>
      this.prisma.medication.updateMany({
        where: {
          id,
          ...productScope(dependentId, userId, ['OWNER']),
          treatments: { none: { deletedAt: null } },
        },
        data: { deletedAt: now },
      }),
    );
    return result.count === 1;
  }
  listTreatments(dependentId: string, userId: string, { limit, offset }: Pagination) {
    return prismaOperation(() =>
      this.prisma.medicationTreatment.findMany({
        where: treatmentScope(dependentId, userId),
        include: { medication: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: limit,
        skip: offset,
      }),
    );
  }
  findTreatment(id: string, dependentId: string, userId: string) {
    return prismaOperation(() =>
      this.prisma.medicationTreatment.findFirst({
        where: { id, ...treatmentScope(dependentId, userId) },
        include: { medication: true },
      }),
    );
  }
  createTreatment(data: CreateMedicationTreatment) {
    return prismaOperation(() =>
      this.prisma.medicationTreatment.create({
        data: {
          dependentId: data.dependentId,
          medicationId: data.medicationId,
          dosage: data.dosage,
          unit: data.unit,
          frequency: data.frequency,
          route: data.route,
          startDate: data.startDate,
          endDate: data.endDate,
          continuousUse: data.continuousUse,
          instructions: data.instructions,
          prescribedBy: data.prescribedBy,
          reason: data.reason,
          notes: data.notes,
          status: data.status,
          completedAt: data.completedAt,
        },
        include: { medication: true },
      }),
    );
  }
  async updateTreatment(
    id: string,
    dependentId: string,
    userId: string,
    roles: DependentAccessRole[],
    data: UpdateMedicationTreatment,
  ) {
    const rows = await prismaOperation(() =>
      this.prisma.medicationTreatment.updateManyAndReturn({
        where: { id, ...treatmentScope(dependentId, userId, roles) },
        data: treatmentData(data),
        include: { medication: true },
      }),
    );
    return rows[0] ?? null;
  }
  async deleteTreatment(id: string, dependentId: string, userId: string, now: Date) {
    const result = await prismaOperation(() =>
      this.prisma.medicationTreatment.updateMany({
        where: { id, ...treatmentScope(dependentId, userId, ['OWNER']) },
        data: { deletedAt: now },
      }),
    );
    return result.count === 1;
  }
  readTimeline(query: TimelineSourceQuery, type: MedicationTimelineType) {
    return prismaOperation(async () => {
      const start = type === 'MEDICATION_STARTED';
      const rows = await this.prisma.medicationTreatment.findMany({
        where: {
          ...treatmentScope(query.dependentId, query.userId),
          ...(start
            ? { createdAt: { lte: query.snapshotAt } }
            : {
                status: 'COMPLETED',
                endDate: { not: null },
                completedAt: { not: null, lte: query.snapshotAt },
              }),
          AND: civilTimelineWhere(query, type),
        },
        select: {
          id: true,
          dependentId: true,
          startDate: true,
          endDate: true,
          createdAt: true,
          completedAt: true,
        },
        orderBy: [{ [start ? 'startDate' : 'endDate']: query.order }, { id: query.order }],
        take: query.take,
      });
      return rows.map((row) => {
        const eventDate = start ? row.startDate : row.endDate;
        const createdAt = start ? row.createdAt : row.completedAt;
        if (!eventDate || !createdAt) throw new Error('Evento de tratamento inconsistente.');
        return { id: row.id, dependentId: row.dependentId, eventDate, createdAt };
      });
    });
  }
}
