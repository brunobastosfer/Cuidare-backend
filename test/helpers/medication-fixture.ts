import { timelineFixture } from './timeline-fixture';
import { AuditService } from '../../src/modules/audit/audit.service';
import { MedicationsService } from '../../src/modules/medications/medications.service';
import { MedicationTimelineSource } from '../../src/modules/medications/medication-timeline.source';
import type { CreateMedicationTreatmentDto } from '../../src/modules/medications/dto/medication.dto';
export function treatmentDto(
  medicationId: string,
  overrides: Partial<CreateMedicationTreatmentDto> = {},
): CreateMedicationTreatmentDto {
  return {
    medicationId,
    dosage: '1 gota por kg',
    unit: 'Texto informado',
    frequency: 'Frequência informada',
    startDate: '2026-01-01',
    instructions: 'Transcrição fictícia; não é orientação clínica.',
    ...overrides,
  };
}
export async function medicationFixture() {
  const f = await timelineFixture();
  const service = new MedicationsService(f.foundation, f.authorization, new AuditService());
  const product = await service.createProduct(f.user.id, f.dependent.id, {
    name: 'Produto fictício',
  });
  const source = new MedicationTimelineSource();
  return { ...f, medications: service, product, source };
}
