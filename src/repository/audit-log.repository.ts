import type { CreateAuditLog } from '../domain/models/audit-log.model';
export const AUDIT_LOG_REPOSITORY = Symbol('AUDIT_LOG_REPOSITORY');
// Sem leitura pública, atualização ou exclusão: eventos são anexados pelo servidor.
export interface AuditLogRepository {
  append(data: CreateAuditLog): Promise<void>;
}
