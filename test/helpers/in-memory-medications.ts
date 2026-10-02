import { randomUUID } from 'node:crypto';
import type { Medication, MedicationTreatment } from '../../src/domain/models/medication.model';
import { medicationEventPrefix } from '../../src/domain/models/medication.model';
import { matchesTimelineQuery, compareTimelinePositions } from '../../src/domain/timeline-query';
import type { MedicationRepository } from '../../src/repository/medication.repository';
import type { DependentAccessRole } from '../../src/domain/models/dependent.model';
import { RepositoryConflictError } from '../../src/repository/errors/repository.error';
// Fixture, não implementação de produção; constraints/locks requerem PostgreSQL.
export class InMemoryMedications implements MedicationRepository {
  readonly products = new Map<string, Medication>();
  readonly treatments = new Map<string, MedicationTreatment>();
  constructor(
    private readonly role: (userId: string, dependentId: string) => DependentAccessRole | null,
  ) {}
  private product(
    id: string,
    dependentId: string,
    userId: string,
    roles: DependentAccessRole[] = ['OWNER', 'EDITOR', 'VIEWER'],
  ) {
    const row = this.products.get(id);
    const role = this.role(userId, dependentId);
    return row && !row.deletedAt && row.dependentId === dependentId && role && roles.includes(role)
      ? row
      : null;
  }
  private treatment(
    id: string,
    dependentId: string,
    userId: string,
    roles: DependentAccessRole[] = ['OWNER', 'EDITOR', 'VIEWER'],
  ) {
    const row = this.treatments.get(id);
    const product = row && this.product(row.medicationId, dependentId, userId, roles);
    return row && !row.deletedAt && row.dependentId === dependentId && product
      ? { ...row, medication: { ...product } }
      : null;
  }
  listProducts: MedicationRepository['listProducts'] = (dependentId, userId, { limit, offset }) =>
    Promise.resolve(
      [...this.products.values()]
        .filter((row) => this.product(row.id, dependentId, userId))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? -1 : 1))
        .slice(offset, offset + limit)
        .map((row) => ({ ...row })),
    );
  findProduct: MedicationRepository['findProduct'] = (id, dependentId, userId) =>
    Promise.resolve(this.product(id, dependentId, userId));
  createProduct: MedicationRepository['createProduct'] = (dependentId, name) => {
    const row: Medication = {
      id: randomUUID(),
      dependentId,
      name,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };
    this.products.set(row.id, row);
    return Promise.resolve({ ...row });
  };
  updateProduct: MedicationRepository['updateProduct'] = (id, dependentId, userId, name) => {
    const current = this.product(id, dependentId, userId, ['OWNER', 'EDITOR']);
    if (!current) return Promise.resolve(null);
    const row = { ...current, name, updatedAt: new Date() };
    this.products.set(id, row);
    return Promise.resolve({ ...row });
  };
  hasTreatments: MedicationRepository['hasTreatments'] = (id, dependentId, userId) =>
    Promise.resolve(
      [...this.treatments.values()].some(
        (t) => t.medicationId === id && this.treatment(t.id, dependentId, userId),
      ),
    );
  deleteProduct: MedicationRepository['deleteProduct'] = (id, dependentId, userId, now) => {
    const row = this.product(id, dependentId, userId, ['OWNER']);
    if (!row || [...this.treatments.values()].some((t) => t.medicationId === id && !t.deletedAt))
      return Promise.resolve(false);
    this.products.set(id, { ...row, deletedAt: now, updatedAt: now });
    return Promise.resolve(true);
  };
  listTreatments: MedicationRepository['listTreatments'] = (
    dependentId,
    userId,
    { limit, offset },
  ) =>
    Promise.resolve(
      [...this.treatments.values()]
        .map((t) => this.treatment(t.id, dependentId, userId))
        .filter((t) => t !== null)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? -1 : 1))
        .slice(offset, offset + limit),
    );
  findTreatment: MedicationRepository['findTreatment'] = (id, dependentId, userId) =>
    Promise.resolve(this.treatment(id, dependentId, userId));
  createTreatment: MedicationRepository['createTreatment'] = (data) => {
    const p = this.products.get(data.medicationId);
    if (!p || p.deletedAt || p.dependentId !== data.dependentId)
      return Promise.reject(new RepositoryConflictError());
    const row: MedicationTreatment = {
      ...data,
      id: randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };
    this.treatments.set(row.id, row);
    return Promise.resolve({ ...row, medication: { ...p } });
  };
  updateTreatment: MedicationRepository['updateTreatment'] = (
    id,
    dependentId,
    userId,
    roles,
    data,
  ) => {
    const current = this.treatment(id, dependentId, userId, roles);
    if (!current) return Promise.resolve(null);
    const { medication, ...base } = current;
    const row = { ...base, ...data, updatedAt: new Date() };
    this.treatments.set(id, row);
    return Promise.resolve({ ...row, medication });
  };
  deleteTreatment: MedicationRepository['deleteTreatment'] = (id, dependentId, userId, now) => {
    const current = this.treatment(id, dependentId, userId, ['OWNER']);
    if (!current) return Promise.resolve(false);
    const row = this.treatments.get(id)!;
    this.treatments.set(id, { ...row, deletedAt: now, updatedAt: now });
    return Promise.resolve(true);
  };
  readTimeline: MedicationRepository['readTimeline'] = (query, type) => {
    const events = [...this.treatments.values()].flatMap((row) => {
      const current = this.treatment(row.id, query.dependentId, query.userId);
      if (
        !current ||
        (type === 'MEDICATION_COMPLETED' &&
          (row.status !== 'COMPLETED' || !row.endDate || !row.completedAt))
      )
        return [];
      const eventDate = type === 'MEDICATION_STARTED' ? row.startDate : row.endDate!;
      const createdAt = type === 'MEDICATION_STARTED' ? row.createdAt : row.completedAt!;
      return [
        {
          id: medicationEventPrefix(type) + row.id,
          dependentId: row.dependentId,
          type,
          title: 'Fixture',
          summary: null,
          eventDate,
          createdAt,
          sourceId: row.id,
          sourceType: 'MEDICATION_TREATMENT',
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
