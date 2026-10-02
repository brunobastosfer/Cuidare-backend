import { randomUUID } from 'node:crypto';
import type { CreateAuditLog } from '../../src/domain/models/audit-log.model';
import type { Consent } from '../../src/domain/models/consent.model';
import type { Dependent, UserDependentAccess } from '../../src/domain/models/dependent.model';
import type { AuditLogRepository } from '../../src/repository/audit-log.repository';
import type { ConsentRepository } from '../../src/repository/consent.repository';
import type { DependentAccessRepository } from '../../src/repository/dependent-access.repository';
import type { DependentRepository } from '../../src/repository/dependent.repository';
import type {
  TransactionRepositories,
  UnitOfWorkRepository,
} from '../../src/repository/unit-of-work.repository';
import { RepositoryConflictError } from '../../src/repository/errors/repository.error';
import { InMemoryCareTaskRepository, type InMemoryUserRepository } from './in-memory.repositories';
import { InMemoryAuthStorage } from './in-memory-auth';
import { InMemoryMedications } from './in-memory-medications';
import { InMemoryAppointments } from './in-memory-appointments';
import { InMemoryDocuments } from './in-memory-documents';
import { InMemoryVaccinations } from './in-memory-vaccinations';
import type { PrivacyRepository } from '../../src/repository/privacy.repository';
import type {
  PrivacyExportRecord,
  AccountDeletionRequest,
} from '../../src/domain/models/privacy.model';

import { InMemoryEducation } from './in-memory-education';
// Fixture transacional. Constraints/locks PostgreSQL exigem os testes database.
export class InMemoryFoundation implements UnitOfWorkRepository {
  readonly dependentRows = new Map<string, Dependent>();
  readonly accessRows = new Map<string, UserDependentAccess>();
  readonly consentRows = new Map<string, Consent>();
  readonly auditRows: CreateAuditLog[] = [];
  readonly exportRows = new Map<string, PrivacyExportRecord>();
  readonly deletionRows = new Map<string, AccountDeletionRequest>();
  private tail: Promise<void> = Promise.resolve();

  readonly auth: InMemoryAuthStorage;
  readonly medications: InMemoryMedications;
  readonly appointments: InMemoryAppointments;
  readonly documents: InMemoryDocuments;
  readonly vaccinations: InMemoryVaccinations;
  readonly education: InMemoryEducation;
  constructor(
    readonly users: InMemoryUserRepository,
    readonly tasks = new InMemoryCareTaskRepository(),
  ) {
    this.auth = new InMemoryAuthStorage(users);
    this.medications = new InMemoryMedications(
      (userId, dependentId) => this.activeAccess(userId, dependentId)?.role ?? null,
    );
    this.appointments = new InMemoryAppointments(
      (userId, dependentId) => this.activeAccess(userId, dependentId)?.role ?? null,
    );
    this.documents = new InMemoryDocuments(
      (userId, dependentId) => this.activeAccess(userId, dependentId)?.role ?? null,
    );
    this.education = new InMemoryEducation(
      (userId, dependentId) => this.activeAccess(userId, dependentId)?.role ?? null,
      this.documents.rows,
    );
    this.vaccinations = new InMemoryVaccinations(
      (userId, dependentId) => this.activeAccess(userId, dependentId)?.role ?? null,
      this.documents.rows,
    );
  }

  private activeAccess(userId: string, dependentId: string) {
    const user = Array.from(this.users.rows.values()).find((row) => row.id === userId);
    const dependent = this.dependentRows.get(dependentId);
    if (!user || user.status !== 'ACTIVE' || user.deletedAt || !dependent || dependent.deletedAt)
      return null;
    return (
      Array.from(this.accessRows.values()).find(
        (row) => row.userId === userId && row.dependentId === dependentId && !row.revokedAt,
      ) ?? null
    );
  }

  readonly dependents: DependentRepository = {
    listForUser: (userId, { limit, offset }) =>
      Promise.resolve(
        Array.from(this.dependentRows.values())
          .filter((row) => this.activeAccess(userId, row.id))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id))
          .slice(offset, offset + limit)
          .map((row) => ({ ...row })),
      ),
    findForUser: (id, userId) => {
      const row = this.dependentRows.get(id);
      return Promise.resolve(row && this.activeAccess(userId, id) ? { ...row } : null);
    },
    create: (data) => {
      const row: Dependent = {
        ...data,
        id: randomUUID(),
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };
      this.dependentRows.set(row.id, row);
      return Promise.resolve({ ...row });
    },
    updateForUser: (id, userId, roles, data) => {
      const row = this.dependentRows.get(id);
      const access = this.activeAccess(userId, id);
      if (!row || !access || !roles.includes(access.role)) return Promise.resolve(null);
      const updated = { ...row, ...data, updatedAt: new Date() };
      this.dependentRows.set(id, updated);
      return Promise.resolve({ ...updated });
    },
    softDeleteForUser: (id, userId) => {
      const row = this.dependentRows.get(id);
      if (!row || this.activeAccess(userId, id)?.role !== 'OWNER') return Promise.resolve(false);
      this.dependentRows.set(id, { ...row, deletedAt: new Date(), updatedAt: new Date() });
      return Promise.resolve(true);
    },
  };

  readonly dependentAccess: DependentAccessRepository = {
    revokeAllForUser: (userId, now) => {
      for (const row of this.accessRows.values())
        if (row.userId === userId && !row.revokedAt)
          this.accessRows.set(row.id, { ...row, revokedAt: now });
      return Promise.resolve();
    },
    findActive: (userId, id) => Promise.resolve(this.activeAccess(userId, id)),
    create: (data) => {
      if (
        Array.from(this.accessRows.values()).some(
          (row) => row.userId === data.userId && row.dependentId === data.dependentId,
        )
      ) {
        return Promise.reject(new RepositoryConflictError());
      }
      const row = { ...data, id: randomUUID(), createdAt: new Date(), revokedAt: null };
      this.accessRows.set(row.id, row);
      return Promise.resolve({ ...row });
    },
  };

  readonly consents: ConsentRepository = {
    findOwned: async (id, userId) => {
      const user = await this.users.findById(userId);
      const row = this.consentRows.get(id);
      return user?.status === 'ACTIVE' && row?.userId === userId ? { ...row } : null;
    },
    revokeScope: async (userId, type, dependentId, now) => {
      if ((await this.users.findById(userId))?.status !== 'ACTIVE') return 0;
      let count = 0;
      for (const row of this.consentRows.values()) {
        if (
          row.userId === userId &&
          row.type === type &&
          row.dependentId === dependentId &&
          row.consentBased &&
          !row.revokedAt
        ) {
          this.consentRows.set(row.id, { ...row, revokedAt: now });
          count++;
        }
      }
      return count;
    },
    hasActive: async (userId, type, policyVersion, dependentId) => {
      if (
        (await this.users.findById(userId))?.status !== 'ACTIVE' ||
        (dependentId && this.activeAccess(userId, dependentId)?.role !== 'OWNER')
      )
        return false;
      return [...this.consentRows.values()].some(
        (row) =>
          row.userId === userId &&
          row.type === type &&
          row.policyVersion === policyVersion &&
          row.dependentId === dependentId &&
          row.consentBased &&
          !row.revokedAt,
      );
    },
    create: (data) => {
      const row = {
        ...data,
        consentBased: data.consentBased ?? false,
        id: randomUUID(),
        acceptedAt: new Date(),
        revokedAt: null,
      };
      this.consentRows.set(row.id, row);
      return Promise.resolve({ ...row });
    },
    listForUser: (userId, { limit, offset }) =>
      Promise.resolve(
        Array.from(this.consentRows.values())
          .filter(
            (row) =>
              row.userId === userId &&
              (row.dependentId === null || this.activeAccess(userId, row.dependentId)),
          )
          .sort(
            (a, b) => b.acceptedAt.getTime() - a.acceptedAt.getTime() || a.id.localeCompare(b.id),
          )
          .slice(offset, offset + limit)
          .map((row) => ({ ...row })),
      ),
  };

  readonly auditLogs: AuditLogRepository = {
    append: (data) => {
      this.auditRows.push(structuredClone(data));
      return Promise.resolve();
    },
  };

  readonly privacy: PrivacyRepository = {
    readExport: async (userId, ids, max) => {
      const actor = await this.users.findById(userId);
      const account = actor?.status === 'ACTIVE' ? actor : null;
      const authorized = (id: string) =>
        ids.includes(id) && this.activeAccess(userId, id)?.role === 'OWNER';
      const cap = <T>(rows: T[]) => rows.slice(0, max + 1);
      return {
        account,
        dependents: cap([...this.dependentRows.values()].filter((d) => authorized(d.id))),
        access: cap(
          [...this.accessRows.values()].filter(
            (a) => a.userId === userId && !a.revokedAt && authorized(a.dependentId),
          ),
        ),
        careTasks: cap([...this.tasks.rows.values()].filter((t) => t.ownerId === userId)),
        consents: cap(
          [...this.consentRows.values()].filter(
            (c) => c.userId === userId && (!c.dependentId || authorized(c.dependentId)),
          ),
        ),
        sessions: cap([...this.auth.sessionRows.values()].filter((s) => s.userId === userId)),
        auditEvents: cap(
          this.auditRows
            .filter((a) => a.actorId === userId && (!a.dependentId || authorized(a.dependentId)))
            .map((a, i) => ({
              ...a,
              id: '00000000-0000-4000-8000-' + String(i + 1).padStart(12, '0'),
              timestamp: new Date(0),
            })),
        ),
        exportHistory: cap([...this.exportRows.values()].filter((e) => e.userId === userId)),
        medications: cap(
          [...this.medications.products.values()].filter(
            (p) => !p.deletedAt && authorized(p.dependentId),
          ),
        ),
        medicationTreatments: cap(
          [...this.medications.treatments.values()]
            .filter(
              (t) =>
                !t.deletedAt &&
                authorized(t.dependentId) &&
                !this.medications.products.get(t.medicationId)?.deletedAt,
            )
            .map((t) => ({
              ...t,
              medication: { ...this.medications.products.get(t.medicationId)! },
            })),
        ),
        appointments: cap(
          [...this.appointments.rows.values()].filter(
            (row) => !row.deletedAt && authorized(row.dependentId),
          ),
        ),
        medicalRecommendations: cap(
          [...this.appointments.recommendations.values()].filter(
            (row) =>
              !row.deletedAt &&
              authorized(row.dependentId) &&
              !this.appointments.rows.get(row.appointmentId)?.deletedAt,
          ),
        ),
        documents: cap(
          [...this.documents.rows.values()].filter(
            (row) => !row.deletedAt && authorized(row.dependentId),
          ),
        ),
        schoolEnrollments: cap(
          [...this.education.enrollments.values()].filter(
            (r) => !r.deletedAt && authorized(r.dependentId),
          ),
        ),
        schoolReports: cap(
          [...this.education.reports.values()]
            .filter((r) => !r.deletedAt && authorized(r.dependentId))
            .map((r) => this.education.details(r)),
        ),
        vaccinations: cap(
          [...this.vaccinations.rows.values()]
            .filter((row) => !row.deletedAt && authorized(row.dependentId))
            .map((row) => this.vaccinations.details(row)),
        ),
      };
    },
    recordExport: (id, userId) => {
      const row: PrivacyExportRecord = { id, userId, format: 'JSON', createdAt: new Date() };
      this.exportRows.set(id, row);
      return Promise.resolve({ ...row });
    },
    createDeletionRequest: (data) => {
      if ([...this.deletionRows.values()].some((r) => r.userId === data.userId))
        return Promise.reject(new RepositoryConflictError());
      const row: AccountDeletionRequest = {
        ...data,
        id: randomUUID(),
        status: 'PENDING_REVIEW',
        requestedAt: new Date(),
      };
      this.deletionRows.set(row.id, row);
      return Promise.resolve({ ...row });
    },
  };

  async run<T>(operation: (repositories: TransactionRepositories) => Promise<T>): Promise<T> {
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    // Os repositories substituem linhas, nunca mutam Date; preservar o realm do Jest.
    const snapshots = {
      users: new Map(this.users.rows),
      dependents: new Map(this.dependentRows),
      access: new Map(this.accessRows),
      consents: new Map(this.consentRows),
      audit: structuredClone(this.auditRows),
      sessions: new Map(this.auth.sessionRows),
      refresh: new Map(this.auth.refreshRows),
      accountTokens: new Map(this.auth.tokenRows),
      rates: new Map(this.auth.rateRows),
      exports: new Map(this.exportRows),
      deletions: new Map(this.deletionRows),
      products: new Map(this.medications.products),
      treatments: new Map(this.medications.treatments),
      appointments: new Map(this.appointments.rows),
      recommendations: new Map(this.appointments.recommendations),
      documents: new Map(this.documents.rows),
      vaccinations: new Map(this.vaccinations.rows),
      enrollments: new Map(this.education.enrollments),
      reports: new Map(this.education.reports),
    };
    try {
      return await operation({
        users: this.users,
        dependents: this.dependents,
        dependentAccess: this.dependentAccess,
        consents: this.consents,
        auditLogs: this.auditLogs,
        sessions: this.auth.sessions,
        accountTokens: this.auth.accountTokens,
        authRateLimits: this.auth.rates,
        privacy: this.privacy,
        medications: this.medications,
        appointments: this.appointments,
        documents: this.documents,
        vaccinations: this.vaccinations,
        education: this.education,
      });
    } catch (error) {
      this.restore(this.users.rows, snapshots.users);
      this.restore(this.dependentRows, snapshots.dependents);
      this.restore(this.accessRows, snapshots.access);
      this.restore(this.consentRows, snapshots.consents);
      this.auditRows.splice(0, this.auditRows.length, ...snapshots.audit);
      this.restore(this.auth.sessionRows, snapshots.sessions);
      this.restore(this.auth.refreshRows, snapshots.refresh);
      this.restore(this.auth.tokenRows, snapshots.accountTokens);
      this.restore(this.auth.rateRows, snapshots.rates);
      this.restore(this.exportRows, snapshots.exports);
      this.restore(this.deletionRows, snapshots.deletions);
      this.restore(this.medications.products, snapshots.products);
      this.restore(this.medications.treatments, snapshots.treatments);
      this.restore(this.appointments.rows, snapshots.appointments);
      this.restore(this.appointments.recommendations, snapshots.recommendations);
      this.restore(this.documents.rows, snapshots.documents);
      this.restore(this.vaccinations.rows, snapshots.vaccinations);
      this.restore(this.education.enrollments, snapshots.enrollments);
      this.restore(this.education.reports, snapshots.reports);
      throw error;
    } finally {
      release();
    }
  }

  private restore<K, V>(target: Map<K, V>, snapshot: Map<K, V>) {
    target.clear();
    for (const [key, value] of snapshot) target.set(key, value);
  }
}
