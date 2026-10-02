import { Injectable } from '@nestjs/common';
import type { PrivacyExportSnapshot } from '../../domain/models/privacy.model';
import { privacyExportView } from '../../presentation/views/privacy.view';
import type { PrivacyExportFormatter } from './privacy-export-formatter';
@Injectable()
export class JsonPrivacyExportFormatter implements PrivacyExportFormatter {
  readonly format = 'JSON' as const;
  formatSnapshot(id: string, generatedAt: Date, scope: string[], snapshot: PrivacyExportSnapshot) {
    return privacyExportView(id, generatedAt, scope, snapshot);
  }
  sizeBytes(output: ReturnType<typeof privacyExportView>) {
    return Buffer.byteLength(JSON.stringify(output), 'utf8');
  }
}
