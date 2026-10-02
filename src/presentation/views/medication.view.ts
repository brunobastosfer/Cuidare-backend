import type { Medication, MedicationTreatmentDetails } from '../../domain/models/medication.model';
export function medicationView(product: Medication) {
  return {
    id: product.id,
    dependentId: product.dependentId,
    name: product.name,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}
export function medicationTreatmentView(row: MedicationTreatmentDetails) {
  return {
    id: row.id,
    dependentId: row.dependentId,
    medicationId: row.medicationId,
    medication: medicationView(row.medication),
    dosage: row.dosage,
    unit: row.unit,
    frequency: row.frequency,
    route: row.route,
    startDate: row.startDate.toISOString().slice(0, 10),
    endDate: row.endDate?.toISOString().slice(0, 10) ?? null,
    continuousUse: row.continuousUse,
    instructions: row.instructions,
    prescribedBy: row.prescribedBy,
    reason: row.reason,
    notes: row.notes,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
