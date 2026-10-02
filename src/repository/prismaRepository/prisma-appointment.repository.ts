import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type {
  CreateAppointment,
  UpdateAppointment,
  CreateRecommendation,
  UpdateRecommendation,
  AppointmentTimelineType,
} from '../../domain/models/appointment.model';
import type { DependentAccessRole } from '../../domain/models/dependent.model';
import type { AppointmentRepository } from '../appointment.repository';
import type { Pagination } from '../dependent.repository';
import type { TimelineSourceQuery } from '../timeline-source.repository';
import { dependentScope } from './dependent-scope';
import { prismaOperation } from './prisma-operation';
import { appointmentTimelineWhere } from './appointment-timeline-where';
export function appointmentScope(
  dependentId: string,
  userId: string,
  roles?: DependentAccessRole[],
): Prisma.AppointmentWhereInput {
  return { dependentId, deletedAt: null, dependent: dependentScope(userId, roles) };
}
export function recommendationScope(
  dependentId: string,
  userId: string,
  roles?: DependentAccessRole[],
): Prisma.MedicalRecommendationWhereInput {
  return {
    dependentId,
    deletedAt: null,
    dependent: dependentScope(userId, roles),
    appointment: { dependentId, deletedAt: null },
  };
}
function appointmentData(data: UpdateAppointment): Prisma.AppointmentUpdateManyMutationInput {
  return {
    ...(data.date !== undefined ? { date: data.date } : {}),
    ...(data.reason !== undefined ? { reason: data.reason } : {}),
    ...(data.specialty !== undefined ? { specialty: data.specialty } : {}),
    ...(data.professionalName !== undefined ? { professionalName: data.professionalName } : {}),
    ...(data.institutionName !== undefined ? { institutionName: data.institutionName } : {}),
    ...(data.notes !== undefined ? { notes: data.notes } : {}),
    ...(data.followUpDate !== undefined ? { followUpDate: data.followUpDate } : {}),
  };
}
function recommendationData(
  data: UpdateRecommendation,
): Prisma.MedicalRecommendationUpdateManyMutationInput {
  return {
    ...(data.title !== undefined ? { title: data.title } : {}),
    ...(data.description !== undefined ? { description: data.description } : {}),
    ...(data.status !== undefined ? { status: data.status } : {}),
    ...(data.startDate !== undefined ? { startDate: data.startDate } : {}),
    ...(data.endDate !== undefined ? { endDate: data.endDate } : {}),
    ...(data.completedAt !== undefined ? { completedAt: data.completedAt } : {}),
  };
}
@Injectable()
export class PrismaAppointmentRepository implements AppointmentRepository {
  constructor(@Inject(PrismaService) private readonly prisma: Prisma.TransactionClient) {}
  list(dependentId: string, userId: string, { limit, offset }: Pagination) {
    return prismaOperation(() =>
      this.prisma.appointment.findMany({
        where: appointmentScope(dependentId, userId),
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: limit,
        skip: offset,
      }),
    );
  }
  find(id: string, dependentId: string, userId: string) {
    return prismaOperation(() =>
      this.prisma.appointment.findFirst({
        where: { id, ...appointmentScope(dependentId, userId) },
      }),
    );
  }
  create(data: CreateAppointment) {
    return prismaOperation(() =>
      this.prisma.appointment.create({
        data: {
          dependentId: data.dependentId,
          date: data.date,
          reason: data.reason,
          specialty: data.specialty,
          professionalName: data.professionalName,
          institutionName: data.institutionName,
          notes: data.notes,
          followUpDate: data.followUpDate,
        },
      }),
    );
  }
  async update(id: string, dependentId: string, userId: string, data: UpdateAppointment) {
    const rows = await prismaOperation(() =>
      this.prisma.appointment.updateManyAndReturn({
        where: { id, ...appointmentScope(dependentId, userId, ['OWNER', 'EDITOR']) },
        data: appointmentData(data),
      }),
    );
    return rows[0] ?? null;
  }
  async hasRecommendations(appointmentId: string, dependentId: string, userId: string) {
    return (
      (await prismaOperation(() =>
        this.prisma.medicalRecommendation.findFirst({
          where: { appointmentId, ...recommendationScope(dependentId, userId) },
          select: { id: true },
        }),
      )) !== null
    );
  }
  async delete(id: string, dependentId: string, userId: string, now: Date) {
    const result = await prismaOperation(() =>
      this.prisma.appointment.updateMany({
        where: {
          id,
          ...appointmentScope(dependentId, userId, ['OWNER']),
          recommendations: { none: { deletedAt: null } },
        },
        data: { deletedAt: now },
      }),
    );
    return result.count === 1;
  }
  listRecommendations(
    appointmentId: string,
    dependentId: string,
    userId: string,
    { limit, offset }: Pagination,
  ) {
    return prismaOperation(() =>
      this.prisma.medicalRecommendation.findMany({
        where: { appointmentId, ...recommendationScope(dependentId, userId) },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: limit,
        skip: offset,
      }),
    );
  }
  findRecommendation(id: string, appointmentId: string, dependentId: string, userId: string) {
    return prismaOperation(() =>
      this.prisma.medicalRecommendation.findFirst({
        where: { id, appointmentId, ...recommendationScope(dependentId, userId) },
      }),
    );
  }
  createRecommendation(data: CreateRecommendation) {
    return prismaOperation(() =>
      this.prisma.medicalRecommendation.create({
        data: {
          dependentId: data.dependentId,
          appointmentId: data.appointmentId,
          title: data.title,
          description: data.description,
          status: data.status,
          startDate: data.startDate,
          endDate: data.endDate,
          completedAt: data.completedAt,
        },
      }),
    );
  }
  async updateRecommendation(
    id: string,
    appointmentId: string,
    dependentId: string,
    userId: string,
    data: UpdateRecommendation,
  ) {
    const rows = await prismaOperation(() =>
      this.prisma.medicalRecommendation.updateManyAndReturn({
        where: {
          id,
          appointmentId,
          ...recommendationScope(dependentId, userId, ['OWNER', 'EDITOR']),
        },
        data: recommendationData(data),
      }),
    );
    return rows[0] ?? null;
  }
  async deleteRecommendation(
    id: string,
    appointmentId: string,
    dependentId: string,
    userId: string,
    now: Date,
  ) {
    const result = await prismaOperation(() =>
      this.prisma.medicalRecommendation.updateMany({
        where: { id, appointmentId, ...recommendationScope(dependentId, userId, ['OWNER']) },
        data: { deletedAt: now },
      }),
    );
    return result.count === 1;
  }
  readTimeline(query: TimelineSourceQuery, type: AppointmentTimelineType) {
    return prismaOperation(async () => {
      const AND = appointmentTimelineWhere(query, type);
      if (type === 'APPOINTMENT_RECORDED') {
        const rows = await this.prisma.appointment.findMany({
          where: {
            ...appointmentScope(query.dependentId, query.userId),
            createdAt: { lte: query.snapshotAt },
            AND,
          },
          select: { id: true, dependentId: true, date: true, createdAt: true },
          orderBy: [{ date: query.order }, { id: query.order }],
          take: query.take,
        });
        return rows.map((row) => ({
          id: row.id,
          dependentId: row.dependentId,
          eventDate: row.date,
          createdAt: row.createdAt,
        }));
      }
      const completed = type === 'MEDICAL_RECOMMENDATION_COMPLETED';
      const rows = await this.prisma.medicalRecommendation.findMany({
        where: {
          ...recommendationScope(query.dependentId, query.userId),
          ...(completed
            ? { status: 'COMPLETED', completedAt: { not: null, lte: query.snapshotAt } }
            : { createdAt: { lte: query.snapshotAt } }),
          AND,
        },
        select: { id: true, dependentId: true, createdAt: true, completedAt: true },
        orderBy: [{ [completed ? 'completedAt' : 'createdAt']: query.order }, { id: query.order }],
        take: query.take,
      });
      return rows.map((row) => {
        const date = completed ? row.completedAt : row.createdAt;
        if (!date) throw new Error('Evento de recomendação inconsistente.');
        return { id: row.id, dependentId: row.dependentId, eventDate: date, createdAt: date };
      });
    });
  }
}
