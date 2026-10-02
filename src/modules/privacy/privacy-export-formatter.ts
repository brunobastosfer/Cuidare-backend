import type { PrivacyExportSnapshot } from '../../domain/models/privacy.model';
import type { privacyExportView } from '../../presentation/views/privacy.view';
export const PRIVACY_EXPORT_FORMATTER = Symbol('PRIVACY_EXPORT_FORMATTER');
export interface PrivacyExportFormatter<TOutput = ReturnType<typeof privacyExportView>> {
  readonly format: string;
  formatSnapshot(
    id: string,
    generatedAt: Date,
    scope: string[],
    snapshot: PrivacyExportSnapshot,
  ): TOutput;
  sizeBytes(output: TOutput): number;
}
// Outros formatos podem usar o mesmo snapshot autorizado, sem consultar o ORM ou reutilizar URLs públicas.
