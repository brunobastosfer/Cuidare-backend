import type { Consent, CreateConsent } from '../domain/models/consent.model';
import type { Pagination } from './dependent.repository';
export const CONSENT_REPOSITORY = Symbol('CONSENT_REPOSITORY');
export interface ConsentRepository {
  create(data: CreateConsent): Promise<Consent>;
  listForUser(userId: string, pagination: Pagination): Promise<Consent[]>;
  findOwned(id: string, userId: string): Promise<Consent | null>;
  revokeScope(userId: string, type: string, dependentId: string | null, now: Date): Promise<number>;
  hasActive(
    userId: string,
    type: string,
    policyVersion: string,
    dependentId: string | null,
  ): Promise<boolean>;
}
