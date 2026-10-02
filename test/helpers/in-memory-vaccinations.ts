import { randomUUID } from 'node:crypto';
import type {
  VaccineCatalog,
  VaccineSchedule,
  VaccineScheduleDose,
  DependentVaccination,
  VaccinationDetails,
} from '../../src/domain/models/vaccination.model';
import type { DependentAccessRole } from '../../src/domain/models/dependent.model';
import type { Document } from '../../src/domain/models/document.model';
import type { VaccinationRepository } from '../../src/repository/vaccination.repository';
import { matchesTimelineQuery, compareTimelinePositions } from '../../src/domain/timeline-query';
// Apenas testes: as referências não são seeds nem orientação clínica.
export class InMemoryVaccinations implements VaccinationRepository {
  readonly catalog = new Map<string, VaccineCatalog>();
  readonly schedules = new Map<string, VaccineSchedule>();
  readonly doses = new Map<string, VaccineScheduleDose>();
  readonly rows = new Map<string, DependentVaccination>();
  constructor(
    private readonly role: (userId: string, dependentId: string) => DependentAccessRole | null,
    private readonly documents: Map<string, Document>,
  ) {}
  private reviewed(row: VaccineCatalog | VaccineSchedule) {
    return !row.deletedAt && row.reviewedAt !== null && row.reviewedAt <= new Date();
  }
  details(row: DependentVaccination): VaccinationDetails {
    const doc = row.documentId ? this.documents.get(row.documentId) : null;
    return {
      ...row,
      vaccine: { ...this.catalog.get(row.vaccineId)! },
      document: doc ? { id: doc.id, deletedAt: doc.deletedAt } : null,
    };
  }
  private visible(
    id: string,
    dependentId: string,
    userId: string,
    roles: DependentAccessRole[] = ['OWNER', 'EDITOR', 'VIEWER'],
  ) {
    const row = this.rows.get(id),
      role = this.role(userId, dependentId);
    return row && !row.deletedAt && row.dependentId === dependentId && role && roles.includes(role)
      ? row
      : null;
  }
  listCatalog: VaccinationRepository['listCatalog'] = ({ limit, offset }) =>
    Promise.resolve(
      [...this.catalog.values()]
        .filter((r) => this.reviewed(r))
        .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
        .slice(offset, offset + limit)
        .map((r) => ({ ...r })),
    );
  findCatalog: VaccinationRepository['findCatalog'] = (id) => {
    const row = this.catalog.get(id);
    return Promise.resolve(row && this.reviewed(row) ? { ...row } : null);
  };
  listSchedules: VaccinationRepository['listSchedules'] = ({ limit, offset }, type) =>
    Promise.resolve(
      [...this.schedules.values()]
        .filter((r) => this.reviewed(r) && (!type || r.type === type))
        .sort((a, b) => b.validFrom.getTime() - a.validFrom.getTime() || a.id.localeCompare(b.id))
        .slice(offset, offset + limit)
        .map((r) => ({ ...r })),
    );
  findSchedule: VaccinationRepository['findSchedule'] = (id) => {
    const row = this.schedules.get(id);
    return Promise.resolve(row && this.reviewed(row) ? { ...row } : null);
  };
  listScheduleDoses: VaccinationRepository['listScheduleDoses'] = (id, { limit, offset }) => {
    const schedule = this.schedules.get(id);
    return Promise.resolve(
      !schedule || !this.reviewed(schedule)
        ? []
        : [...this.doses.values()]
            .filter((r) => r.scheduleId === id)
            .sort(
              (a, b) =>
                a.dueAgeMonths - b.dueAgeMonths ||
                a.dueAgeDays - b.dueAgeDays ||
                a.id.localeCompare(b.id),
            )
            .slice(offset, offset + limit)
            .map((r) => ({ ...r, vaccine: { ...this.catalog.get(r.vaccineId)! } })),
    );
  };
  list: VaccinationRepository['list'] = (dependentId, userId, { limit, offset }) =>
    Promise.resolve(
      [...this.rows.values()]
        .filter((r) => this.visible(r.id, dependentId, userId))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id))
        .slice(offset, offset + limit)
        .map((r) => this.details(r)),
    );
  find: VaccinationRepository['find'] = (id, dependentId, userId) => {
    const row = this.visible(id, dependentId, userId);
    return Promise.resolve(row ? this.details(row) : null);
  };
  create: VaccinationRepository['create'] = (data) => {
    const row: DependentVaccination = {
      ...data,
      id: randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };
    this.rows.set(row.id, row);
    return Promise.resolve(this.details(row));
  };
  update: VaccinationRepository['update'] = (id, dependentId, userId, data) => {
    const current = this.visible(id, dependentId, userId, ['OWNER', 'EDITOR']);
    if (!current) return Promise.resolve(null);
    const row = { ...current, ...data, updatedAt: new Date() };
    this.rows.set(id, row);
    return Promise.resolve(this.details(row));
  };
  delete: VaccinationRepository['delete'] = (id, dependentId, userId, now) => {
    const row = this.visible(id, dependentId, userId, ['OWNER']);
    if (!row) return Promise.resolve(false);
    this.rows.set(id, { ...row, deletedAt: now, updatedAt: now });
    return Promise.resolve(true);
  };
  readTimeline: VaccinationRepository['readTimeline'] = (query) =>
    Promise.resolve(
      [...this.rows.values()]
        .filter((row) => this.visible(row.id, query.dependentId, query.userId))
        .map((row) => ({
          id: 'vaccination-recorded:' + row.id,
          sourceId: row.id,
          dependentId: row.dependentId,
          type: 'VACCINATION_RECORDED' as const,
          title: 'Fixture',
          summary: null,
          sourceType: 'DEPENDENT_VACCINATION',
          eventDate: row.administeredAt,
          createdAt: row.createdAt,
        }))
        .filter((event) => matchesTimelineQuery(event, query))
        .sort((a, b) => compareTimelinePositions(a, b, query.order))
        .slice(0, query.take)
        .map((event) => ({
          id: event.sourceId,
          dependentId: event.dependentId,
          administeredAt: event.eventDate,
          createdAt: event.createdAt,
        })),
    );
}
