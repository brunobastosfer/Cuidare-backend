import type {
  VaccineCatalog,
  VaccineReference,
  VaccineSchedule,
  VaccineScheduleDose,
  VaccinationDetails,
  VaccinationStatusItem,
} from '../../domain/models/vaccination.model';
export function vaccineProvenanceView(reference: VaccineReference) {
  return {
    source: reference.source,
    sourceVersion: reference.sourceVersion,
    validFrom: reference.validFrom.toISOString().slice(0, 10),
    validUntil: reference.validUntil?.toISOString().slice(0, 10) ?? null,
  };
}
export function vaccineCatalogView(vaccine: VaccineCatalog) {
  return {
    id: vaccine.id,
    code: vaccine.code,
    name: vaccine.name,
    ...vaccineProvenanceView(vaccine),
  };
}
export function vaccineScheduleView(schedule: VaccineSchedule) {
  return {
    id: schedule.id,
    name: schedule.name,
    type: schedule.type,
    ruleModel: schedule.ruleModel,
    ...vaccineProvenanceView(schedule),
  };
}
export function vaccineScheduleDoseView(rule: VaccineScheduleDose) {
  return {
    id: rule.id,
    dose: rule.dose,
    dueAgeMonths: rule.dueAgeMonths,
    dueAgeDays: rule.dueAgeDays,
    vaccine: vaccineCatalogView(rule.vaccine),
  };
}
export function vaccinationView(row: VaccinationDetails) {
  return {
    id: row.id,
    dependentId: row.dependentId,
    vaccine: vaccineCatalogView(row.vaccine),
    dose: row.dose,
    administeredAt: row.administeredAt.toISOString().slice(0, 10),
    institutionName: row.institutionName,
    batchNumber: row.batchNumber,
    notes: row.notes,
    documentId: row.document && !row.document.deletedAt ? row.document.id : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
export function vaccinationStatusView(
  schedule: VaccineSchedule,
  asOf: Date,
  rows: VaccinationStatusItem[],
) {
  return {
    schedule: vaccineScheduleView(schedule),
    asOf: asOf.toISOString().slice(0, 10),
    notice:
      'Comparação de registros com a referência selecionada; não confirma imunização nem substitui avaliação profissional.',
    items: rows.map((row) => ({
      ruleId: row.rule.id,
      vaccine: vaccineCatalogView(row.rule.vaccine),
      dose: row.rule.dose,
      expectedDate: row.expectedDate.toISOString().slice(0, 10),
      status: row.status,
      recordIds: row.recordIds,
    })),
  };
}
