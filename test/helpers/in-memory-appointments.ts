import { randomUUID } from 'node:crypto';
import {
  appointmentEventPrefix,
  type Appointment,
  type MedicalRecommendation,
} from '../../src/domain/models/appointment.model';
import type { AppointmentRepository } from '../../src/repository/appointment.repository';
import type { DependentAccessRole } from '../../src/domain/models/dependent.model';
import { compareTimelinePositions, matchesTimelineQuery } from '../../src/domain/timeline-query';
import { RepositoryConflictError } from '../../src/repository/errors/repository.error';
// Fixture: não substitui constraints, locks e testes em PostgreSQL.
export class InMemoryAppointments implements AppointmentRepository {
  readonly rows = new Map<string, Appointment>();
  readonly recommendations = new Map<string, MedicalRecommendation>();
  constructor(
    private readonly role: (userId: string, dependentId: string) => DependentAccessRole | null,
  ) {}
  private appointment(
    id: string,
    dependentId: string,
    userId: string,
    roles: DependentAccessRole[] = ['OWNER', 'EDITOR', 'VIEWER'],
  ) {
    const row = this.rows.get(id),
      role = this.role(userId, dependentId);
    return row && !row.deletedAt && row.dependentId === dependentId && role && roles.includes(role)
      ? { ...row }
      : null;
  }
  private recommendation(
    id: string,
    appointmentId: string,
    dependentId: string,
    userId: string,
    roles: DependentAccessRole[] = ['OWNER', 'EDITOR', 'VIEWER'],
  ) {
    const row = this.recommendations.get(id);
    return row &&
      !row.deletedAt &&
      row.appointmentId === appointmentId &&
      row.dependentId === dependentId &&
      this.appointment(appointmentId, dependentId, userId, roles)
      ? { ...row }
      : null;
  }
  list: AppointmentRepository['list'] = (dependentId, userId, { limit, offset }) =>
    Promise.resolve(
      [...this.rows.values()]
        .filter((row) => this.appointment(row.id, dependentId, userId))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? -1 : 1))
        .slice(offset, offset + limit)
        .map((row) => ({ ...row })),
    );
  find: AppointmentRepository['find'] = (id, dependentId, userId) =>
    Promise.resolve(this.appointment(id, dependentId, userId));
  create: AppointmentRepository['create'] = (data) => {
    const row = {
      ...data,
      id: randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };
    this.rows.set(row.id, row);
    return Promise.resolve({ ...row });
  };
  update: AppointmentRepository['update'] = (id, dependentId, userId, data) => {
    const row = this.appointment(id, dependentId, userId, ['OWNER', 'EDITOR']);
    if (!row) return Promise.resolve(null);
    const next = { ...row, ...data, updatedAt: new Date() };
    this.rows.set(id, next);
    return Promise.resolve({ ...next });
  };
  hasRecommendations: AppointmentRepository['hasRecommendations'] = (id, dependentId, userId) =>
    Promise.resolve(
      [...this.recommendations.values()].some((row) =>
        this.recommendation(row.id, id, dependentId, userId),
      ),
    );
  delete: AppointmentRepository['delete'] = (id, dependentId, userId, now) => {
    const row = this.appointment(id, dependentId, userId, ['OWNER']);
    if (
      !row ||
      [...this.recommendations.values()].some((r) => r.appointmentId === id && !r.deletedAt)
    )
      return Promise.resolve(false);
    this.rows.set(id, { ...row, deletedAt: now, updatedAt: now });
    return Promise.resolve(true);
  };
  listRecommendations: AppointmentRepository['listRecommendations'] = (
    appointmentId,
    dependentId,
    userId,
    { limit, offset },
  ) =>
    Promise.resolve(
      [...this.recommendations.values()]
        .filter((row) => this.recommendation(row.id, appointmentId, dependentId, userId))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? -1 : 1))
        .slice(offset, offset + limit)
        .map((row) => ({ ...row })),
    );
  findRecommendation: AppointmentRepository['findRecommendation'] = (
    id,
    appointmentId,
    dependentId,
    userId,
  ) => Promise.resolve(this.recommendation(id, appointmentId, dependentId, userId));
  createRecommendation: AppointmentRepository['createRecommendation'] = (data) => {
    const appointment = this.rows.get(data.appointmentId);
    if (!appointment || appointment.deletedAt || appointment.dependentId !== data.dependentId)
      return Promise.reject(new RepositoryConflictError());
    const row = {
      ...data,
      id: randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };
    this.recommendations.set(row.id, row);
    return Promise.resolve({ ...row });
  };
  updateRecommendation: AppointmentRepository['updateRecommendation'] = (
    id,
    appointmentId,
    dependentId,
    userId,
    data,
  ) => {
    const row = this.recommendation(id, appointmentId, dependentId, userId, ['OWNER', 'EDITOR']);
    if (!row) return Promise.resolve(null);
    const next = { ...row, ...data, updatedAt: new Date() };
    this.recommendations.set(id, next);
    return Promise.resolve({ ...next });
  };
  deleteRecommendation: AppointmentRepository['deleteRecommendation'] = (
    id,
    appointmentId,
    dependentId,
    userId,
    now,
  ) => {
    const row = this.recommendation(id, appointmentId, dependentId, userId, ['OWNER']);
    if (!row) return Promise.resolve(false);
    this.recommendations.set(id, { ...row, deletedAt: now, updatedAt: now });
    return Promise.resolve(true);
  };
  readTimeline: AppointmentRepository['readTimeline'] = (query, type) => {
    const rows =
      type === 'APPOINTMENT_RECORDED'
        ? [...this.rows.values()]
        : [...this.recommendations.values()];
    const events = rows.flatMap((row) => {
      if (
        !this.appointment(
          'appointmentId' in row ? row.appointmentId : row.id,
          query.dependentId,
          query.userId,
        ) ||
        row.deletedAt ||
        row.dependentId !== query.dependentId
      )
        return [];
      if (
        type === 'MEDICAL_RECOMMENDATION_COMPLETED' &&
        (!('status' in row) || row.status !== 'COMPLETED' || !row.completedAt)
      )
        return [];
      const eventDate =
        'date' in row
          ? row.date
          : type === 'MEDICAL_RECOMMENDATION_COMPLETED'
            ? row.completedAt!
            : row.createdAt;
      const createdAt = type === 'MEDICAL_RECOMMENDATION_COMPLETED' ? eventDate : row.createdAt;
      return [
        {
          id: appointmentEventPrefix(type) + row.id,
          dependentId: row.dependentId,
          type,
          title: 'Fixture',
          summary: null,
          sourceId: row.id,
          sourceType: 'date' in row ? 'APPOINTMENT' : 'MEDICAL_RECOMMENDATION',
          eventDate,
          createdAt,
        },
      ];
    });
    return Promise.resolve(
      events
        .filter((event) => matchesTimelineQuery(event, query))
        .sort((a, b) => compareTimelinePositions(a, b, query.order))
        .slice(0, query.take)
        .map((event) => ({
          id: event.sourceId,
          dependentId: event.dependentId,
          eventDate: event.eventDate,
          createdAt: event.createdAt,
        })),
    );
  };
}
