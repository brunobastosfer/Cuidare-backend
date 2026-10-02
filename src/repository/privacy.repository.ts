import type {
  AccountDeletionRequest,
  CreateAccountDeletionRequest,
  PrivacyExportRecord,
  PrivacyExportSnapshot,
} from '../domain/models/privacy.model';
export const PRIVACY_REPOSITORY = Symbol('PRIVACY_REPOSITORY');
export interface PrivacyRepository {
  // Snapshot somente em UnitOfWork Serializable; projeções explícitas e coleções limitadas.
  readExport(
    userId: string,
    dependentIds: string[],
    maxItems: number,
  ): Promise<PrivacyExportSnapshot>;
  recordExport(id: string, userId: string): Promise<PrivacyExportRecord>;
  createDeletionRequest(data: CreateAccountDeletionRequest): Promise<AccountDeletionRequest>;
}
